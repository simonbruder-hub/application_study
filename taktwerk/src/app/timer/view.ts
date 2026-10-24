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
/** Zähler je gespeicherter Session: startet die Feier (Overlay über die ganze App) */
export const celebration = signal(0);

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
  /** Pomodoro: Massstab des Kreises in Sekunden (frac = Restzeit / spanSec), bleibt beim Ziehen des Zeigers fest */
  spanSec: number | null;
  phaseLabel: string;
  statusLabel: string;
  mood: Mood;
}

/**
 * Massstab des Zifferblatts: zu Beginn einer Phase die geplante Dauer. Wird die Restzeit geändert (Zeiger ziehen,
 * −5/+5), bleibt der Massstab gleich, damit der Zeiger dort weiterläuft, wo er losgelassen wurde. Er wächst nur,
 * wenn die Restzeit grösser wird als der Kreis, und beginnt neu bei einem Phasenwechsel oder nach dem Zurücksetzen.
 * Gemerkt pro Sitzung im Browser, damit der Zeiger auch nach dem Neuladen an der gleichen Stelle steht.
 */
const SPAN_KEY = 'taktwerk.dial-span';
let span: { phase: TimerPhase; session: string | null; active: boolean; sec: number } | null = (() => {
  try { return JSON.parse(localStorage.getItem(SPAN_KEY) ?? 'null'); } catch { return null; }
})();
function spanFor(phase: TimerPhase, session: string | null, active: boolean, custom: boolean, planned: number, restSec: number): number {
  const prev = span;
  // im Ruhezustand ohne eigene Dauer (frisch gewählte Phase, Vorlage) gilt einfach die geplante Dauer
  const keep = custom && prev && prev.phase === phase && (prev.session === session || (!prev.active && active)) && !(prev.active && !active);
  let sec = keep ? prev.sec : planned;
  if (restSec > sec + 0.5) sec = restSec;
  if (!prev || prev.sec !== sec || prev.phase !== phase || prev.session !== session || prev.active !== active) {
    span = { phase, session, active, sec };
    try { localStorage.setItem(SPAN_KEY, JSON.stringify(span)); } catch { /* nur im Speicher */ }
  }
  return sec;
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
  let spanSec: number | null = null;
  if (kind === 'stopwatch') {
    clock = fmtClock(elapsed / 1000, 'down');
    frac = (elapsed % 3_600_000) / 3_600_000;
  } else {
    plannedSec = s.planned_seconds ?? timer.phaseSeconds(phase);
    const rem = idle ? plannedSec * 1000 : (remainingMs(s, t) ?? 0);
    clock = fmtClock(rem / 1000);
    spanSec = spanFor(phase, idle ? null : s.session_id, !idle, !idle || s.planned_seconds != null, plannedSec, rem / 1000);
    frac = spanSec > 0 ? Math.min(1, rem / (spanSec * 1000)) : 0;
  }
  const phaseLabel = kind === 'stopwatch' ? 'Stechuhr' : PHASE_LABEL[phase];
  const statusLabel = running ? phaseLabel : paused ? 'Pausiert' : 'Bereit';
  const mood: Mood = running ? (phase === 'focus' ? 'focus' : 'break') : paused ? 'paused' : (flashMood.value ?? 'idle');
  return {
    kind, phase, running, paused, active: !idle, clock, frac, elapsedSec: elapsed / 1000, plannedSec, spanSec,
    phaseLabel, statusLabel, mood,
  };
}
