import { beforeEach, describe, expect, it, vi } from 'vitest';
import { META } from '../data/db';
import type { ActiveTimerState } from '../data/types';
import { elapsedMs, pauseTimer, remainingMs, startTimer } from '../domain/timerMath';
import { MemoryServer } from './memoryRemote';
import type { RemoteHandlers } from './remote';
import { createTestDevice, type TestDevice } from './testing';
import { TimerSync } from './timerSync';

const START = Date.UTC(2026, 9, 15, 8, 0, 0);
let world: { t: number };
let server: MemoryServer;

beforeEach(() => {
  world = { t: START };
  server = new MemoryServer({ now: () => world.t });
});

const device = (name: string, skewMs = 0) => createTestDevice(server, { name, clock: () => world.t + skewMs });

const startPomodoro = (d: TestDevice) =>
  d.timer.transition((s, now) => startTimer(s, now, { kind: 'pomodoro', planned_seconds: 1500, project_id: 'p1' }));

describe('TimerSync', () => {
  it('Start auf A erscheint auf B, Pause auf B erscheint auf A', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.timer.start();
    await b.timer.start();
    const seenOnB: string[] = [];
    b.timer.subscribe((s) => seenOnB.push(s.status));

    const started = await startPomodoro(a);
    expect(started.updated_by).toBe(a.repo.deviceId);
    await vi.waitFor(() => expect(b.timer.state.status).toBe('running'));
    expect(b.timer.state.session_id).toBe(started.session_id);
    expect(seenOnB).toEqual(['idle', 'running']);
    expect((await b.db.getMeta<ActiveTimerState>(META.activeTimer))!.session_id).toBe(started.session_id);

    world.t += 60_000;
    const paused = await b.timer.transition(pauseTimer);
    expect(paused.updated_at).toBeGreaterThan(started.updated_at);
    await vi.waitFor(() => expect(a.timer.state.status).toBe('paused'));
    // Beide Geräte berechnen dieselbe Zeit aus den Zeitstempeln
    world.t += 3_600_000;
    expect(elapsedMs(a.timer.state, a.timer.now())).toBe(60_000);
    expect(elapsedMs(b.timer.state, b.timer.now())).toBe(60_000);
    expect(server.readTimer()).toMatchObject({ status: 'paused', id: server.userId, updated_by: b.repo.deviceId });
  });

  it('ignoriert veraltete Remote-Zustände', async () => {
    const a = await device('A');
    const b = await device('B');
    let handlers: RemoteHandlers | undefined;
    const subscribe = b.remote.subscribe.bind(b.remote);
    b.remote.subscribe = (h) => { handlers = h; return subscribe(h); };
    await a.timer.start();
    await b.timer.start();
    const started = await startPomodoro(a);
    await vi.waitFor(() => expect(b.timer.state.status).toBe('running'));

    // Verspätet zugestellter älterer Zustand
    handlers!.onTimer!({ ...started, status: 'idle', session_id: null, updated_at: started.updated_at - 1 });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(b.timer.state.status).toBe('running');
    expect(b.timer.state.session_id).toBe(started.session_id);
  });

  it('behält offline gesetzte neuere Zustände und überträgt sie beim nächsten Start', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.timer.start();
    await b.timer.start();
    await startPomodoro(a);
    await vi.waitFor(() => expect(b.timer.state.status).toBe('running'));

    b.setOnline(false);
    world.t += 120_000;
    await b.timer.transition(pauseTimer);
    await b.timer.whenIdle();
    expect(b.timer.hasPendingPush).toBe(true);
    expect(server.readTimer()!.status).toBe('running');

    // Neustart der App auf B: gespeicherter Zustand ist neuer als der Server → wird gesendet
    b.timer.stop();
    b.setOnline(true);
    const restarted = new TimerSync({ repo: b.repo, remote: b.remote, env: null, now: () => world.t, isOnline: () => b.online });
    await restarted.start();
    expect(restarted.state.status).toBe('paused');
    expect(server.readTimer()!.status).toBe('paused');
    await vi.waitFor(() => expect(a.timer.state.status).toBe('paused'));
  });

  it('holt beim online-Ereignis eine fehlgeschlagene Übertragung nach', async () => {
    const a = await device('A');
    const env = new EventTarget();
    a.timer = new TimerSync({ repo: a.repo, remote: a.remote, env, now: () => world.t, isOnline: () => a.online });
    await a.timer.start();
    a.setOnline(false);
    await startPomodoro(a);
    await a.timer.whenIdle();
    expect(server.readTimer()).toBeNull();

    a.setOnline(true);
    env.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(server.readTimer()?.status).toBe('running'));
    expect(a.timer.hasPendingPush).toBe(false);
  });

  it('übernimmt beim Start einen neueren Server-Zustand', async () => {
    const a = await device('A');
    await a.timer.start();
    await startPomodoro(a);
    await a.timer.whenIdle();

    const b = await device('B');
    await b.timer.start(); // kein Realtime-Ereignis verpasst – der Abgleich beim Start genügt
    expect(b.timer.state.status).toBe('running');
    expect(b.timer.state.id).toBe('local');
    // HLC von B hat den fremden Stempel gesehen
    expect(b.repo.clock.value).toBeGreaterThanOrEqual(a.timer.state.updated_at);
  });

  it('korrigiert falsch gehende Geräteuhren über den Serverversatz', async () => {
    const fast = await device('schnell', 2 * 60_000); // Uhr geht 2 min vor
    const ok = await device('korrekt');
    await fast.timer.start();
    await ok.timer.start();
    expect(fast.timer.clockOffsetMs).toBe(-2 * 60_000);
    expect(ok.timer.clockOffsetMs).toBe(0);

    await startPomodoro(fast);
    await vi.waitFor(() => expect(ok.timer.state.status).toBe('running'));
    world.t += 5 * 60_000;
    expect(remainingMs(ok.timer.state, ok.timer.now())).toBe(20 * 60_000);
    expect(remainingMs(fast.timer.state, fast.timer.now())).toBe(20 * 60_000);
  });

  it('gleicht beim ersten Aufbau der Realtime-Verbindung ab (Änderung zwischen Start und Join)', async () => {
    const a = await device('A');
    const b = await device('B');
    let join: (() => void) | undefined;
    const subscribe = b.remote.subscribe.bind(b.remote);
    b.remote.subscribe = (handlers) => {
      let off = () => {};
      join = () => { off = subscribe(handlers); };
      return () => off();
    };
    await a.timer.start();
    await b.timer.start(); // Abgleich beim Start: Server noch leer

    const started = await startPomodoro(a);
    await a.timer.whenIdle(); // B noch nicht verbunden → kein onTimer
    join!();
    await vi.waitFor(() => expect(b.timer.state.session_id).toBe(started.session_id));
    expect(b.timer.state.status).toBe('running');
  });

  it('speichert nichts bei wirkungslosen Übergängen', async () => {
    const a = await device('A');
    await a.timer.start();
    const before = a.timer.state;
    const after = await a.timer.transition(pauseTimer);
    expect(after).toBe(before);
    expect(await a.db.getMeta(META.activeTimer)).toBeUndefined();
  });
});
