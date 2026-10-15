import { describe, expect, it } from 'vitest';
import {
  adjustPlannedSeconds, elapsedMs, finishesAt, idleTimerState, isFinished, pauseTimer, remainingMs, resumeTimer,
  sessionToTimeLog, startTimer, stopTimer,
} from './timerMath';

const T0 = Date.UTC(2026, 9, 15, 8, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

const pomodoro = (now = T0) => startTimer(idleTimerState(), now, { kind: 'pomodoro', planned_seconds: 25 * 60, project_id: 'p1' });

describe('timerMath', () => {
  it('startet eine Sitzung mit neuer UUID und Zeitstempeln statt Zählern', () => {
    const s = pomodoro();
    expect(s.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s).toMatchObject({
      status: 'running', accumulated_ms: 0, segment_started_at: T0, session_started_at: T0, planned_seconds: 1500, project_id: 'p1',
    });
    expect(pomodoro().session_id).not.toBe(s.session_id);
    expect(elapsedMs(s, T0 + 90_000)).toBe(90_000);
    expect(remainingMs(s, T0 + 90_000)).toBe(1500_000 - 90_000);
  });

  it('driftet nicht bei langen Pausen', () => {
    let s = pomodoro();
    s = pauseTimer(s, T0 + 10 * MIN);
    // 8 Stunden Pause: die Zeit steht still, egal wann abgefragt wird
    expect(elapsedMs(s, T0 + 10 * MIN)).toBe(10 * MIN);
    expect(elapsedMs(s, T0 + 8 * HOUR)).toBe(10 * MIN);
    s = resumeTimer(s, T0 + 8 * HOUR);
    expect(elapsedMs(s, T0 + 8 * HOUR + 5 * MIN)).toBe(15 * MIN);
    expect(remainingMs(s, T0 + 8 * HOUR + 5 * MIN)).toBe(10 * MIN);
  });

  it('rechnet nach Hintergrund/Schlaf ohne Ticks exakt und begrenzt die Restzeit auf 0', () => {
    const s = pomodoro();
    // App war 2 h im Hintergrund – kein einziger Tick, trotzdem korrekt
    expect(elapsedMs(s, T0 + 2 * HOUR)).toBe(2 * HOUR);
    expect(remainingMs(s, T0 + 2 * HOUR)).toBe(0);
    expect(isFinished(s, T0 + 25 * MIN - 1)).toBe(false);
    expect(isFinished(s, T0 + 25 * MIN)).toBe(true);
    expect(finishesAt(s)).toBe(T0 + 25 * MIN);
    // Viele Pausen/Fortsetzungen summieren sich exakt
    let t = pomodoro();
    let now = T0;
    for (let i = 0; i < 100; i++) {
      now += 7_001;
      t = pauseTimer(t, now);
      now += 13_337;
      t = resumeTimer(t, now);
    }
    expect(elapsedMs(t, now)).toBe(100 * 7_001);
    expect(finishesAt(t)).toBe(now + 1500_000 - 100 * 7_001);
  });

  it('zählt ein Segment nie negativ, wenn die Uhr zurückspringt', () => {
    const s = pauseTimer(resumeTimer(pauseTimer(pomodoro(), T0 + MIN), T0 + 2 * MIN), T0 + 3 * MIN);
    expect(elapsedMs(s, T0)).toBe(2 * MIN);
    expect(elapsedMs(resumeTimer(s, T0 + 10 * MIN), T0 + 9 * MIN)).toBe(2 * MIN);
  });

  it('ignoriert unpassende Übergänge und liefert denselben Zustand', () => {
    const idle = idleTimerState();
    expect(pauseTimer(idle, T0)).toBe(idle);
    expect(resumeTimer(idle, T0)).toBe(idle);
    const running = pomodoro();
    expect(resumeTimer(running, T0 + 1)).toBe(running);
    const paused = pauseTimer(running, T0 + 1);
    expect(pauseTimer(paused, T0 + 2)).toBe(paused);
    expect(stopTimer(idle)).toBe(idle);
  });

  it('beendet die Sitzung und behält die Vorbelegung', () => {
    const s = stopTimer(pauseTimer(pomodoro(), T0 + MIN));
    expect(s).toMatchObject({
      status: 'idle', session_id: null, accumulated_ms: 0, segment_started_at: null, session_started_at: null,
      kind: 'pomodoro', project_id: 'p1', planned_seconds: 1500,
    });
    expect(elapsedMs(s, T0 + HOUR)).toBe(0);
    expect(isFinished(s, T0 + HOUR)).toBe(false);
  });

  it('Stoppuhr hat keine Restzeit und endet nie von selbst', () => {
    const s = startTimer(idleTimerState(), T0, { kind: 'stopwatch', planned_seconds: 600 });
    expect(s.planned_seconds).toBeNull();
    expect(remainingMs(s, T0 + HOUR)).toBeNull();
    expect(isFinished(s, T0 + 10 * HOUR)).toBe(false);
    expect(finishesAt(s)).toBeNull();
  });

  it('passt die geplante Dauer an (min. 1 Minute)', () => {
    const s = adjustPlannedSeconds(pomodoro(), 5 * 60);
    expect(s.planned_seconds).toBe(30 * 60);
    expect(adjustPlannedSeconds(s, -60 * 60).planned_seconds).toBe(60);
  });

  it('erzeugt den Zeiteintrag mit der Sitzungs-ID (idempotent über Geräte)', () => {
    const s = pomodoro();
    const log = sessionToTimeLog(s, T0 + 3 * HOUR)!; // im Hintergrund längst abgelaufen
    expect(log).toMatchObject({
      id: s.session_id, project_id: 'p1', mode: 'pomodoro', start_time: T0, end_time: T0 + 25 * MIN,
      duration_seconds: 1500, counts_as_pomodoro: true,
    });
    // Gleicher Zustand auf einem zweiten Gerät → gleiche ID
    expect(sessionToTimeLog({ ...s }, T0 + 3 * HOUR)!.id).toBe(log.id);

    const early = sessionToTimeLog(pauseTimer(s, T0 + 10 * MIN), T0 + 12 * MIN)!;
    expect(early).toMatchObject({ duration_seconds: 600, counts_as_pomodoro: false, end_time: T0 + 12 * MIN });

    expect(sessionToTimeLog({ ...s, phase: 'short_break' }, T0 + MIN)).toBeNull();
    expect(sessionToTimeLog(idleTimerState(), T0)).toBeNull();
    expect(sessionToTimeLog(s, T0)).toBeNull();
  });
});
