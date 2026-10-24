/**
 * Anzeigewerte des Timers für Zifferblatt, Mini-Player, Mini-Leiste und Medien-Steuerung.
 * Liest `now` (Sekundentakt) und `timerState`, damit Komponenten automatisch neu zeichnen.
 */
import { signal } from '@preact/signals';
import type { TimerKind, TimerPhase } from '../../data/types';
import { elapsedMs, remainingMs } from '../../domain/timerMath';
import { fmtClock } from '../../ui/format';
import type { Mood } from '../../ui/components/Dial';
import { prefs } from '../prefs';
import { app } from '../services';
import { now, timerState } from '../store';
import { PHASE_LABEL } from './controller';

/** CSS-Attribut data-phase (Farben in app.css) */
export const PHASE_ATTR: Record<TimerPhase, 'focus' | 'short' | 'long'> = {
  focus: 'focus', short_break: 'short', long_break: 'long',
};
export const PHASE_KANJI: Record<TimerPhase, string> = { focus: '集中', short_break: '休憩', long_break: '休息' };
/** Technik-Stil: Phasen wie Messkanäle am Oszilloskop */
export const PHASE_CHANNEL: Record<TimerPhase, string> = { focus: 'CH1 · 1 min/Div', short_break: 'CH2 · 1 min/Div', long_break: 'CH3 · 1 min/Div' };
/** Barock-Stil: lateinische Überschrift je Phase */
export const PHASE_LATIN: Record<TimerPhase, string> = { focus: 'Labor', short_break: 'Otium', long_break: 'Quies' };

/** Kurz nach einem geschafften Pomodoro jubelt das Maskottchen */
export const flashMood = signal<Mood | null>(null);

export interface TimerView {
  kind: TimerKind;
  phase: TimerPhase;
  running: boolean;
  active: boolean;
  paused: boolean;
  /** Anzeige "24:59" (Pomodoro: Restzeit, Stechuhr: Laufzeit) */
  clock: string;
  /** 0..1 für Bogen/Balken (Pomodoro: verbleibend; Stechuhr: Anteil der laufenden Stunde) */
  frac: number;
  elapsedSec: number;
  plannedSec: number | null;
  phaseLabel: string;
  statusLabel: string;
  mood: Mood;
}

export function readTimer(): TimerView {
  void now.value;
  const s = timerState.value;
  const { timer } = app();
  const t = timer.now();
  const idle = s.status === 'idle';
  const kind: TimerKind = idle ? timer.kindFor(prefs.value.workspace) : s.kind;
  const running = s.status === 'running';
  const paused = s.status === 'paused';
  const elapsed = idle ? 0 : elapsedMs(s, t);
  const phase: TimerPhase = kind === 'stopwatch' ? 'focus' : s.phase;
  let clock: string;
  let frac: number;
  let plannedSec: number | null = null;
  if (kind === 'stopwatch') {
    clock = fmtClock(elapsed / 1000, 'down');
    frac = (elapsed % 3_600_000) / 3_600_000;
  } else {
    plannedSec = s.planned_seconds ?? timer.phaseSeconds(phase);
    const rem = idle ? plannedSec * 1000 : (remainingMs(s, t) ?? 0);
    clock = fmtClock(rem / 1000);
    frac = plannedSec > 0 ? rem / (plannedSec * 1000) : 0;
  }
  const phaseLabel = kind === 'stopwatch' ? 'Stechuhr' : PHASE_LABEL[phase];
  const statusLabel = running ? phaseLabel : paused ? 'Pausiert' : 'Bereit';
  const mood: Mood = running ? (phase === 'focus' ? 'focus' : 'break') : paused ? 'paused' : (flashMood.value ?? 'idle');
  return {
    kind, phase, running, paused, active: !idle, clock, frac, elapsedSec: elapsed / 1000, plannedSec,
    phaseLabel, statusLabel, mood,
  };
}
