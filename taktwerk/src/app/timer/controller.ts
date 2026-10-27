/**
 * Timer-Steuerung (Pomodoro und Stechuhr). Der Zustand liegt in TimerSync (lokal zuerst, live
 * zwischen Geräten gespiegelt); hier wird nur entschieden, was bei Aktionen und beim Ablauf
 * einer Phase passiert. Laufzeiten werden ausschliesslich aus Zeitstempeln berechnet.
 */
import type { Repository } from '../../data/repository';
import type { ActiveTimerState, TimerKind, TimerPhase, UserSettings, Workspace } from '../../data/types';
import type { TimerSync } from '../../sync/timerSync';
import {
  adjustPlannedSeconds, elapsedMs, finishesAt, isFinished, pauseTimer, remainingMs, resumeTimer,
  sessionToTimeLog, startTimer, stopTimer,
} from '../../domain/timerMath';
import { onAlarm, setAlarm } from './alarm';
import { audioReady, cancelChime, chimeNow, chimeWasScheduledFor, ensureAudio, holdWakeLock, notify, onAudioReady, scheduleChime, type ChimeKind } from './signals';
import type { DevicePrefs } from '../prefs';

/** Kürzeste Restzeit beim Anpassen (Zeiger ziehen, −5): einige Sekunden, damit die Phase nicht sofort endet */
const MIN_REST_S = 5;

const chimeFor = (phase: TimerPhase): ChimeKind => (phase === 'focus' ? 'focusEnd' : phase === 'short_break' ? 'shortEnd' : 'longEnd');

export const PHASE_LABEL: Record<TimerPhase, string> = {
  focus: 'Fokus',
  short_break: 'Kurze Pause',
  long_break: 'Lange Pause',
};

/** Mindestdauer, ab der eine (vorzeitig beendete) Sitzung als Zeiteintrag gespeichert wird */
const MIN_LOG_SECONDS = 60;

export interface PhaseCompleteInfo {
  phase: TimerPhase;
  next: TimerPhase;
  loggedSeconds: number | null;
  message: string;
}

export interface TimerTarget {
  workspace?: Workspace;
  project_id?: string | null;
  work_package_id?: string | null;
  task_id?: string | null;
}

export interface TimerControllerOptions {
  repo: Repository;
  timerSync: TimerSync;
  getSettings: () => UserSettings;
  getPrefs: () => DevicePrefs;
  onPhaseComplete?: (info: PhaseCompleteInfo) => void;
  onLogged?: (seconds: number) => void;
  /** Start durch eine Nutzeraktion (z. B. um einmalig nach Benachrichtigungen zu fragen) */
  onUserStart?: () => void;
}

export class TimerController {
  private ticker: ReturnType<typeof setInterval> | null = null;
  private completing = false;
  private unsub: (() => void) | null = null;
  private unsubAudio: (() => void) | null = null;

  constructor(private readonly o: TimerControllerOptions) {}

  get state(): ActiveTimerState {
    return this.o.timerSync.state;
  }

  /** Zeitbasis wie TimerSync (Gerätezeit + gemessener Server-Versatz) */
  now(): number {
    return this.o.timerSync.now();
  }

  start(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => void this.check(), 250);
    this.unsub = this.o.timerSync.subscribe(() => this.applySideEffects());
    // Ton erst nach dem ersten Klick frei (z. B. nach dem Neuladen): dann für die laufende Phase nachplanen
    this.unsubAudio = onAudioReady(() => this.applySideEffects());
    onAlarm(() => void this.check());
    this.applySideEffects();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.unsub?.();
    this.unsubAudio?.();
    onAlarm(null);
    setAlarm(null);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = (): void => {
    if (!document.hidden) { void this.check(); this.applySideEffects(); }
  };

  /** Dauer einer Phase in Sekunden laut Einstellungen */
  phaseSeconds(phase: TimerPhase): number {
    const s = this.o.getSettings();
    const min = phase === 'focus' ? s.focus_minutes : phase === 'short_break' ? s.short_break_minutes : s.long_break_minutes;
    return Math.max(1, Math.round(min)) * 60;
  }

  /** Timer-Art für den aktuellen Modus */
  kindFor(ws: Workspace): TimerKind {
    return this.o.getPrefs().timerKind[ws] ?? 'pomodoro';
  }

  elapsedMs(): number {
    return elapsedMs(this.state, this.now());
  }

  remainingMs(): number | null {
    const s = this.state;
    if (s.status === 'idle') return s.kind === 'pomodoro' ? (s.planned_seconds ?? this.phaseSeconds(s.phase)) * 1000 : 0;
    return remainingMs(s, this.now());
  }

  /* ---------- Aktionen ---------- */

  async toggle(): Promise<void> {
    ensureAudio();
    const s = this.state;
    if (s.status === 'running') await this.pause();
    else if (s.status === 'paused') await this.resume();
    else await this.begin();
  }

  /** Neue Sitzung im aktuellen Modus starten */
  async begin(at?: number): Promise<void> {
    ensureAudio();
    this.o.onUserStart?.();
    const ws = this.o.getPrefs().workspace;
    await this.o.timerSync.transition((s, now) => {
      const kind = this.kindFor(ws);
      const phase: TimerPhase = kind === 'stopwatch' ? 'focus' : s.phase;
      const planned = kind === 'pomodoro' ? (s.planned_seconds ?? this.phaseSeconds(phase)) : null;
      return startTimer(s, at ?? now, { kind, phase, planned_seconds: planned, workspace: ws });
    });
    await this.markTaskInProgress();
  }

  async pause(): Promise<void> {
    await this.o.timerSync.transition((s, now) => pauseTimer(s, now));
  }

  async resume(): Promise<void> {
    ensureAudio();
    await this.o.timerSync.transition((s, now) => resumeTimer(s, now));
  }

  /**
   * Fokus beenden und speichern: Stechuhr → Eintrag + Ruhe; Pomodoro → Eintrag (zählt nur als
   * Pomodoro, wenn die Phase voll war) und weiter zur Pause.
   */
  async finish(): Promise<number | null> {
    const s = this.state;
    if (s.status === 'idle') return null;
    if (s.kind === 'pomodoro' && s.phase !== 'focus') { await this.skip(); return null; }
    const now = this.now();
    const seconds = await this.writeLog(s, now);
    if (s.kind === 'stopwatch') {
      await this.o.timerSync.transition((cur) => stopTimer(cur));
    } else {
      await this.advance(s, now, false);
    }
    return seconds;
  }

  /** Pause überspringen → Fokus bereit */
  async skip(): Promise<void> {
    await this.o.timerSync.transition((s) => this.idleAt(s, 'focus'));
  }

  /** Laufende Sitzung verwerfen (nichts speichern) */
  async reset(): Promise<void> {
    cancelChime();
    await this.o.timerSync.transition((s) => this.idleAt(s, s.phase));
  }

  async setPhase(phase: TimerPhase): Promise<void> {
    await this.o.timerSync.transition((s) => this.idleAt(s, phase));
  }

  /**
   * Pomodoro: geplante Dauer anpassen (±Minuten, auch Bruchteile), auch im Ruhezustand.
   * Stechuhr: erfasste Zeit korrigieren (z. B. zu spät gestartet → +5).
   */
  async adjust(minutes: number): Promise<void> {
    if (this.state.kind === 'stopwatch') { await this.correctElapsed(minutes * 60_000); return; }
    await this.o.timerSync.transition((s) => {
      if (s.kind !== 'pomodoro') return s;
      if (s.status === 'idle') {
        const base = s.planned_seconds ?? this.phaseSeconds(s.phase);
        return { ...s, planned_seconds: Math.max(MIN_REST_S, Math.round(base + minutes * 60)) };
      }
      // laufende Phase: Restzeit darf nicht unter MIN_REST_S fallen
      const rest = remainingMs(s, this.now()) ?? 0;
      return adjustPlannedSeconds(s, Math.max(minutes * 60, (MIN_REST_S * 1000 - rest) / 1000));
    });
  }

  /** Pomodoro: Restzeit auf genau so viele Sekunden setzen (Zeiger ziehen); im Ruhezustand die ganze Dauer */
  async setRest(seconds: number): Promise<void> {
    const target = Math.max(MIN_REST_S, Math.round(seconds));
    await this.o.timerSync.transition((s) => {
      if (s.kind !== 'pomodoro') return s;
      if (s.status === 'idle') return { ...s, planned_seconds: target };
      const rest = remainingMs(s, this.now()) ?? 0;
      return adjustPlannedSeconds(s, target - rest / 1000);
    });
  }

  /** Stechuhr: erfasste Zeit um deltaMs ändern (nie unter 0); der Sitzungsbeginn rückt bei Bedarf vor */
  async correctElapsed(deltaMs: number): Promise<void> {
    await this.o.timerSync.transition((s, now) => {
      if (s.status === 'idle' || s.kind !== 'stopwatch') return s;
      const target = Math.max(0, elapsedMs(s, now) + deltaMs);
      return this.withElapsed(s, now, target);
    });
  }

  /** Stechuhr: Beginn nachträglich setzen (Laufzeit = jetzt − Beginn, ohne Pausen) */
  async setStartTime(startMs: number): Promise<void> {
    await this.o.timerSync.transition((s, now) => {
      if (s.status === 'idle' || s.kind !== 'stopwatch') return s;
      const start = Math.min(startMs, now);
      return { ...this.withElapsed(s, now, now - start), session_started_at: start };
    });
  }

  private withElapsed(s: ActiveTimerState, now: number, target: number): ActiveTimerState {
    const started = Math.min(s.session_started_at ?? now, now - target);
    return s.status === 'running'
      ? { ...s, accumulated_ms: target, segment_started_at: now, session_started_at: started }
      : { ...s, accumulated_ms: target, session_started_at: started };
  }

  /** Art im Ruhezustand wechseln (Arbeitsmodus: Pomodoro oder Stechuhr) */
  async setKind(kind: TimerKind): Promise<void> {
    await this.o.timerSync.transition((s) => (s.status === 'idle'
      ? { ...s, kind, phase: kind === 'stopwatch' ? 'focus' : s.phase, planned_seconds: null }
      : s));
  }

  async setTarget(t: TimerTarget): Promise<void> {
    await this.o.timerSync.set({
      ...(t.workspace ? { workspace: t.workspace } : {}),
      project_id: t.project_id ?? null,
      work_package_id: t.work_package_id ?? null,
      task_id: t.task_id ?? null,
    });
    if (this.state.status !== 'idle') await this.markTaskInProgress();
  }

  /** Nach Änderung der Phasenlängen in den Einstellungen: Ruhezustand übernimmt neue Dauer */
  async resetPlanned(): Promise<void> {
    await this.o.timerSync.transition((s) => (s.status === 'idle' ? { ...s, planned_seconds: null } : s));
  }

  /* ---------- Ablauf ---------- */

  private async check(): Promise<void> {
    const s = this.state;
    if (this.completing || s.status !== 'running' || s.kind !== 'pomodoro') return;
    const now = this.now();
    if (!isFinished(s, now)) return;
    this.completing = true;
    try {
      const end = finishesAt(s) ?? now;
      const rang = chimeWasScheduledFor(end);
      const p = this.o.getPrefs();
      // gesperrter Ton würde sonst erst beim nächsten Klick verspätet nachklingen
      if (!rang && p.sound && audioReady.value) chimeNow(chimeFor(s.phase), p.volume);
      const seconds = s.phase === 'focus' ? await this.writeLog(s, end) : null;
      const next = await this.advance(s, end, true);
      const message = s.phase === 'focus'
        ? `${seconds ? 'Pomodoro geschafft' : 'Fokus beendet'} – ${PHASE_LABEL[next]} (${Math.round(this.phaseSeconds(next) / 60)} min)`
        : 'Pause vorbei – weiter geht’s mit Fokus';
      // auch wenn das Fenster offen, aber hinter einem anderen Programm liegt
      if (p.notify && (document.hidden || !document.hasFocus())) notify(s.phase === 'focus' ? 'Fokus beendet' : 'Pause vorbei', message);
      this.o.onPhaseComplete?.({ phase: s.phase, next, loggedSeconds: seconds, message });
    } finally {
      this.completing = false;
    }
  }

  /** Nach einer Fokus- oder Pausenphase in die nächste Phase wechseln (ggf. automatisch starten) */
  private async advance(s: ActiveTimerState, end: number, natural: boolean): Promise<TimerPhase> {
    const set = this.o.getSettings();
    let next: TimerPhase;
    let cycle = s.cycle;
    if (s.phase === 'focus') {
      cycle += 1;
      next = cycle % Math.max(1, set.long_break_every) === 0 ? 'long_break' : 'short_break';
    } else next = 'focus';
    const auto = next === 'focus' ? set.auto_start_focus : set.auto_start_breaks;
    const startAt = natural ? end : this.now();
    const stillInWindow = this.now() - startAt < this.phaseSeconds(next) * 1000;
    await this.o.timerSync.transition((cur) => {
      // anderes Gerät war schneller und hat schon gewechselt
      if (cur.session_id !== s.session_id) return cur;
      const idle = { ...this.idleAt(cur, next), cycle };
      if (!(auto && stillInWindow)) return idle;
      return startTimer(idle, startAt, {
        kind: 'pomodoro', phase: next, planned_seconds: this.phaseSeconds(next), cycle,
      });
    });
    return next;
  }

  private idleAt(s: ActiveTimerState, phase: TimerPhase): ActiveTimerState {
    return { ...stopTimer(s), phase, planned_seconds: null };
  }

  /** Zeiteintrag schreiben (ID = Sitzungs-ID → kein Duplikat, auch wenn zwei Geräte speichern) */
  private async writeLog(s: ActiveTimerState, at: number): Promise<number | null> {
    const log = sessionToTimeLog(s, at);
    if (!log || log.duration_seconds < MIN_LOG_SECONDS) return null;
    await this.o.repo.applyBatch([{ op: 'create', table: 'time_logs', row: log as unknown as Record<string, unknown> & { id: string } }]);
    this.o.onLogged?.(log.duration_seconds);
    return log.duration_seconds;
  }

  private async markTaskInProgress(): Promise<void> {
    const id = this.state.task_id;
    if (!id) return;
    const task = await this.o.repo.get('tasks', id);
    if (task && task.status === 'todo') await this.o.repo.update('tasks', id, { status: 'in_progress' });
  }

  /** Ton planen, Wecker stellen, Wake Lock halten – bei jeder Zustandsänderung */
  private applySideEffects(): void {
    const s = this.state;
    const p = this.o.getPrefs();
    const running = s.status === 'running';
    const end = running && s.kind === 'pomodoro' ? finishesAt(s) : null;
    setAlarm(end === null ? null : end - this.now() + 50);
    if (end !== null && p.sound) {
      scheduleChime(end, chimeFor(s.phase), p.volume);
    } else cancelChime();
    void holdWakeLock(running && p.wakeLock);
  }
}
