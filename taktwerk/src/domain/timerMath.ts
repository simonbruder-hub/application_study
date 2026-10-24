/**
 * Reine Funktionen auf dem Timer-Zustand (ActiveTimerState).
 *
 * Die Laufzeit wird nie hochgezählt, sondern immer aus Zeitstempeln berechnet:
 *   elapsed = accumulated_ms + (läuft ? now - segment_started_at : 0)
 * Damit gibt es keinen Drift – weder bei langen Pausen noch wenn der Browser einen
 * Hintergrund-Tab drosselt oder das Gerät schläft – und zwei Geräte zeigen dieselbe Zeit.
 * Übergänge liefern immer einen neuen Zustand; updated_at/updated_by stempelt TimerSync.
 */
import type {
  ActiveTimerState, EntityInput, TimeLog, TimerKind, TimerPhase, Workspace,
} from '../data/types';
import { newId } from '../data/repository';

/** Lokale ID des Timer-Zustands (auf dem Server = user_id) */
export const LOCAL_TIMER_ID = 'local';

/** Ruhezustand ohne Sitzung (updated_at 0 → verliert gegen jeden gespeicherten Zustand) */
export function idleTimerState(): ActiveTimerState {
  return {
    id: LOCAL_TIMER_ID,
    session_id: null,
    kind: 'pomodoro',
    phase: 'focus',
    status: 'idle',
    workspace: 'study',
    project_id: null,
    work_package_id: null,
    task_id: null,
    planned_seconds: null,
    accumulated_ms: 0,
    segment_started_at: null,
    session_started_at: null,
    cycle: 0,
    updated_at: 0,
    updated_by: '',
  };
}

/** Effektive Laufzeit in ms (ohne Pausen) */
export function elapsedMs(s: ActiveTimerState, now: number): number {
  const running = s.status === 'running' && s.segment_started_at != null
    ? Math.max(0, now - s.segment_started_at) // Uhr zurückgestellt → Segment zählt nicht negativ
    : 0;
  return Math.max(0, s.accumulated_ms) + running;
}

function plannedMs(s: ActiveTimerState): number | null {
  if (s.kind !== 'pomodoro' || s.planned_seconds == null) return null;
  return Math.max(0, s.planned_seconds) * 1000;
}

/** Restzeit einer Pomodoro-Phase in ms (min. 0); null für Stoppuhr bzw. ohne geplante Dauer */
export function remainingMs(s: ActiveTimerState, now: number): number | null {
  const planned = plannedMs(s);
  if (planned === null) return null;
  return Math.max(0, planned - elapsedMs(s, now));
}

/** Pomodoro-Phase abgelaufen? (Stoppuhr endet nie von selbst) */
export function isFinished(s: ActiveTimerState, now: number): boolean {
  if (s.status === 'idle') return false;
  const rest = remainingMs(s, now);
  return rest !== null && rest <= 0;
}

/** Zeitpunkt (Epoch-ms), zu dem die laufende Pomodoro-Phase endet – für Signal und Benachrichtigung */
export function finishesAt(s: ActiveTimerState): number | null {
  const planned = plannedMs(s);
  if (planned === null || s.status !== 'running' || s.segment_started_at == null) return null;
  return s.segment_started_at + Math.max(0, planned - s.accumulated_ms);
}

export interface StartTimerOptions {
  kind: TimerKind;
  phase?: TimerPhase;
  /** Geplante Dauer in Sekunden (Pomodoro); bei Stoppuhr ignoriert */
  planned_seconds?: number | null;
  workspace?: Workspace;
  project_id?: string | null;
  work_package_id?: string | null;
  task_id?: string | null;
  cycle?: number;
  /** Vorgegebene Sitzungs-ID (Tests); sonst neue UUID */
  session_id?: string;
}

/**
 * Neue Sitzung starten. Die session_id (UUID) wird später zur ID des TimeLogs – speichern
 * zwei Geräte dieselbe Sitzung, entsteht dank Upsert auf die ID nur ein Eintrag.
 * Nicht angegebene Zuordnungen (Projekt, Aufgabe …) bleiben vom bisherigen Zustand erhalten.
 */
export function startTimer(s: ActiveTimerState, now: number, opts: StartTimerOptions): ActiveTimerState {
  return {
    ...s,
    session_id: opts.session_id ?? newId(),
    kind: opts.kind,
    phase: opts.phase ?? (opts.kind === 'stopwatch' ? 'focus' : s.phase),
    status: 'running',
    workspace: opts.workspace ?? s.workspace,
    project_id: opts.project_id !== undefined ? opts.project_id : s.project_id,
    work_package_id: opts.work_package_id !== undefined ? opts.work_package_id : s.work_package_id,
    task_id: opts.task_id !== undefined ? opts.task_id : s.task_id,
    planned_seconds: opts.kind === 'pomodoro' ? (opts.planned_seconds ?? s.planned_seconds) : null,
    accumulated_ms: 0,
    segment_started_at: now,
    session_started_at: now,
    cycle: opts.cycle ?? s.cycle,
  };
}

/** Laufendes Segment abschliessen; nur bei status 'running' wirksam */
export function pauseTimer(s: ActiveTimerState, now: number): ActiveTimerState {
  if (s.status !== 'running') return s;
  return {
    ...s,
    status: 'paused',
    accumulated_ms: elapsedMs(s, now),
    segment_started_at: null,
  };
}

/** Neues Segment beginnen; nur bei status 'paused' wirksam */
export function resumeTimer(s: ActiveTimerState, now: number): ActiveTimerState {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', segment_started_at: now };
}

/**
 * Sitzung beenden → Ruhezustand. Art, Phase, Arbeitsbereich, Zuordnung und Zyklus bleiben
 * als Vorbelegung für die nächste Sitzung erhalten.
 */
export function stopTimer(s: ActiveTimerState): ActiveTimerState {
  if (s.status === 'idle' && s.session_id === null) return s;
  return {
    ...s,
    session_id: null,
    status: 'idle',
    accumulated_ms: 0,
    segment_started_at: null,
    session_started_at: null,
  };
}

/** Geplante Dauer der laufenden Phase ändern (z. B. −5/+5 Minuten), ganze Sekunden, min. 5 s */
export function adjustPlannedSeconds(s: ActiveTimerState, deltaSeconds: number): ActiveTimerState {
  if (s.kind !== 'pomodoro' || s.planned_seconds == null) return s;
  return { ...s, planned_seconds: Math.max(5, Math.round(s.planned_seconds + deltaSeconds)) };
}

/**
 * Zeiteintrag aus der aktuellen Fokus-Sitzung (id = session_id → idempotent über Geräte).
 * Eine abgelaufene Pomodoro-Phase zählt bis zu ihrem Ende, nicht bis zum Speichern.
 * null für Pausen-Phasen, ohne Sitzung oder ohne Laufzeit.
 */
export function sessionToTimeLog(
  s: ActiveTimerState,
  now: number,
  comment = '',
): (EntityInput<TimeLog> & { id: string }) | null {
  if (!s.session_id || s.session_started_at == null || s.status === 'idle') return null;
  if (s.kind === 'pomodoro' && s.phase !== 'focus') return null;
  const planned = plannedMs(s);
  const elapsed = planned === null ? elapsedMs(s, now) : Math.min(elapsedMs(s, now), planned);
  if (elapsed <= 0) return null;
  const end = finishesAt(s);
  const endTime = end !== null && end < now ? end : now;
  return {
    id: s.session_id,
    project_id: s.project_id,
    work_package_id: s.work_package_id,
    task_id: s.task_id,
    workspace: s.workspace,
    mode: s.kind,
    start_time: s.session_started_at,
    end_time: Math.max(endTime, s.session_started_at),
    duration_seconds: Math.round(elapsed / 1000),
    counts_as_pomodoro: s.kind === 'pomodoro' && isFinished(s, now),
    comment,
  };
}
