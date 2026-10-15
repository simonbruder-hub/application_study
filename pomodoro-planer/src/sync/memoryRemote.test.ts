import { describe, expect, it, vi } from 'vitest';
import type { Milestone, Project } from '../data/types';
import { MemoryRemote, MemoryServer } from './memoryRemote';
import {
  RemoteError, compareCursors, isoToMicros, isoToMs, maxCursor, microsToIso, msToIso, rewindCursor,
} from './remote';
import { milestoneInput, remoteProject } from './testing';

const T = Date.UTC(2026, 9, 15, 8, 0, 0);

function setup(opts: { transactionTimestamps?: boolean } = {}) {
  const clock = { t: T };
  const server = new MemoryServer({ now: () => clock.t, ...opts });
  return { clock, server, a: new MemoryRemote(server), b: new MemoryRemote(server) };
}

const milestone = (project_id: string, over: Partial<Milestone> = {}): Milestone => ({
  ...milestoneInput(project_id), id: crypto.randomUUID(), created_at: T, updated_at: T, updated_by: 'dev', is_deleted: false, ...over,
});

describe('Zeitstempel-Helfer', () => {
  it('liest ISO- und Postgres-Formate mit Mikrosekunden', () => {
    const ms = Date.UTC(2026, 9, 15, 8, 0, 0, 123);
    expect(isoToMicros('2026-10-15T08:00:00.123456+00:00')).toBe(ms * 1000 + 456);
    expect(isoToMicros('2026-10-15 08:00:00.123456+00')).toBe(ms * 1000 + 456);
    expect(isoToMicros('2026-10-15 10:00:00.12+02')).toBe((ms - 3) * 1000);
    expect(isoToMs('2026-10-15T08:00:00.123Z')).toBe(ms);
    expect(isoToMs('2026-10-15T08:00:00+00:00')).toBe(ms - 123);
    expect(() => isoToMicros('gestern')).toThrow(RangeError);
    expect(microsToIso(ms * 1000 + 7)).toBe('2026-10-15T08:00:00.123007+00:00');
    expect(isoToMs(msToIso(ms))).toBe(ms);
  });

  it('vergleicht Cursor formatunabhängig und versetzt sie zurück', () => {
    const a = { ts: '2026-10-15T08:00:00.12+00:00', id: 'b' };
    const b = { ts: '2026-10-15 08:00:00.120000+00', id: 'c' };
    const c = { ts: '2026-10-15T08:00:00.1205Z', id: 'a' };
    expect(compareCursors(a, b)).toBe(-1);
    expect(compareCursors(b, c)).toBe(-1);
    expect(compareCursors(a, { ...a })).toBe(0);
    expect(maxCursor(null, a)).toBe(a);
    expect(maxCursor(c, a)).toBe(c);
    expect(rewindCursor(a, 30_000)).toEqual({ ts: '2026-10-15T07:59:30.120000+00:00', id: '' });
    expect(rewindCursor(a, 0)).toBe(a);
  });
});

describe('MemoryServer', () => {
  it('vergibt streng steigende server_updated_at mit Mikrosekunden', async () => {
    const { a, server } = setup();
    const p1 = remoteProject(T, { project_code: 'A' });
    const p2 = remoteProject(T, { project_code: 'B' });
    await a.push('projects', [p1, p2]);
    const ts1 = server.serverUpdatedAt('projects', p1.id)!;
    const ts2 = server.serverUpdatedAt('projects', p2.id)!;
    expect(ts1).toMatch(/^2026-10-15T08:00:00\.000000\+00:00$/);
    expect(ts2).toBe('2026-10-15T08:00:00.000001+00:00');
  });

  it('verwirft veraltete Versionen still und meldet sie als ok (LWW-Trigger)', async () => {
    const { a, server } = setup();
    const p = remoteProject(T + 10, { name: 'neu' });
    await a.push('projects', [p]);
    const before = server.serverUpdatedAt('projects', p.id)!;
    const res = await a.push('projects', [{ ...p, name: 'alt', updated_at: T }, { ...p, name: 'alt', updated_by: 'aaa' }]);
    expect(res.ok).toHaveLength(2);
    expect(res.rejected).toHaveLength(0);
    expect(server.row('projects', p.id)!.name).toBe('neu');
    expect(server.serverUpdatedAt('projects', p.id)).toBe(before);
    // Gleichstand gilt als Wiederholung und wird übernommen (neuer Cursor)
    await a.push('projects', [{ ...p }]);
    expect(server.serverUpdatedAt('projects', p.id)! > before).toBe(true);
    // Tie-Breaker updated_by
    await a.push('projects', [{ ...p, name: 'zz gewinnt', updated_by: 'zz' }]);
    expect(server.row('projects', p.id)!.name).toBe('zz gewinnt');
  });

  it('prüft eindeutige Codes case-insensitive unter nicht gelöschten Zeilen', async () => {
    const { a } = setup();
    const p = remoteProject(T, { project_code: 'MATHE' });
    await a.push('projects', [p]);
    const dup = remoteProject(T, { project_code: 'mathe' });
    expect((await a.push('projects', [dup])).rejected).toEqual([
      expect.objectContaining({ id: dup.id, reason: 'unique_violation', column: 'project_code' }),
    ]);
    // Gelöschte Zeilen blockieren den Code nicht mehr
    await a.push('projects', [{ ...p, is_deleted: true, updated_at: T + 1 }]);
    expect((await a.push('projects', [dup])).rejected).toEqual([]);

    // ms_code nur je Projekt eindeutig
    const other = remoteProject(T, { project_code: 'PHYSIK' });
    await a.push('projects', [other]);
    await a.push('milestones', [milestone(dup.id)]);
    expect((await a.push('milestones', [milestone(other.id)])).rejected).toEqual([]);
    expect((await a.push('milestones', [milestone(dup.id, { ms_code: 'ms-1' })])).rejected[0]).toMatchObject({
      reason: 'unique_violation', column: 'ms_code',
    });
  });

  it('prüft Fremdschlüssel (auch gelöschte Eltern zählen) und CHECK-Constraints', async () => {
    const { a } = setup();
    expect((await a.push('milestones', [milestone('fehlt')])).rejected[0]).toMatchObject({
      reason: 'foreign_key', column: 'project_id',
    });
    const p = remoteProject(T, { is_deleted: true });
    await a.push('projects', [p]);
    expect((await a.push('milestones', [milestone(p.id)])).rejected).toEqual([]);
    const bad = remoteProject(T, { project_code: 'X', mode: 'freizeit' as Project['mode'] });
    expect((await a.push('projects', [bad])).rejected[0]).toMatchObject({ reason: 'check', column: 'mode' });
  });

  it('liefert Seiten nach (server_updated_at, id) – exklusiv, auch bei gleichen Zeitstempeln', async () => {
    const { a, server } = setup({ transactionTimestamps: true });
    const rows = Array.from({ length: 5 }, (_, i) => remoteProject(T, { project_code: `P${i}` }));
    await a.push('projects', rows);
    const ids = rows.map((r) => r.id).sort();
    const first = await a.pull('projects', null, 2);
    expect(first.rows.map((r) => r.id)).toEqual(ids.slice(0, 2));
    const second = await a.pull('projects', first.last, 2);
    expect(second.rows.map((r) => r.id)).toEqual(ids.slice(2, 4));
    const third = await a.pull('projects', second.last, 2);
    expect(third.rows.map((r) => r.id)).toEqual(ids.slice(4));
    expect((await a.pull('projects', third.last, 2)).rows).toEqual([]);
    expect(new Set(rows.map((r) => server.serverUpdatedAt('projects', r.id))).size).toBe(1);
    // Rückversetzter Cursor (id '') schliesst den Zeitpunkt selbst ein
    expect((await a.pull('projects', rewindCursor(third.last!, 1), 10)).rows).toHaveLength(5);
  });

  it('liefert gezogene Zeilen ohne Server- und lokale Felder', async () => {
    const { a } = setup();
    const p = { ...remoteProject(T), _dirty: 1 as const, user_id: 'fremd' };
    await a.push('projects', [p]);
    const [row] = (await a.pull('projects', null, 10)).rows;
    expect(row).not.toHaveProperty('_dirty');
    expect(row).not.toHaveProperty('user_id');
    expect(row).not.toHaveProperty('server_updated_at');
  });

  it('wirft offline RemoteError network und abgemeldet RemoteError auth', async () => {
    const { a } = setup();
    a.setOnline(false);
    await expect(a.pull('projects', null, 10)).rejects.toMatchObject({ kind: 'network' });
    await expect(a.push('projects', [])).rejects.toBeInstanceOf(RemoteError);
    a.setOnline(true);
    a.signedIn = false;
    await expect(a.getTimer()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('meldet Realtime-Ereignisse nur an andere, erreichbare Geräte', async () => {
    const { a, b } = setup();
    const onA = vi.fn();
    const onB = vi.fn();
    const status = vi.fn();
    a.subscribe({ onChange: onA });
    const off = b.subscribe({ onChange: onB, onStatus: status });
    const p = remoteProject(T);
    await a.push('projects', [p]);
    await vi.waitFor(() => expect(onB).toHaveBeenCalledWith('projects', 'device-x'));
    expect(onA).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(true);

    b.setOnline(false);
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith(false));
    await a.push('projects', [{ ...p, name: 'neu', updated_at: T + 1 }]);
    off();
    await new Promise((r) => setTimeout(r, 5));
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it('hält Einstellungen und Timer je Nutzer mit Last-Writer-Wins', async () => {
    const { a, b, server } = setup();
    const onTimer = vi.fn();
    b.subscribe({ onTimer });
    const base = {
      id: 'local', session_id: null, kind: 'pomodoro', phase: 'focus', status: 'running', workspace: 'study',
      project_id: null, work_package_id: null, task_id: null, planned_seconds: 1500, accumulated_ms: 0,
      segment_started_at: T, session_started_at: T, cycle: 0, updated_at: T, updated_by: 'a',
    } as const;
    await a.putTimer({ ...base });
    await a.putTimer({ ...base, status: 'paused', updated_at: T - 1 });
    expect(server.readTimer()).toMatchObject({ id: server.userId, status: 'running' });
    await vi.waitFor(() => expect(onTimer).toHaveBeenCalledTimes(1));
    expect(onTimer.mock.calls[0]![0]).toMatchObject({ status: 'running', id: server.userId });
  });
});
