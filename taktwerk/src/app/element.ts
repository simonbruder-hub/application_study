/**
 * Stil Elemente: welches Element gerade gilt. Fest gewählt in den Einstellungen der Kugeln oder nach Phase:
 * Fokus Feuer, kurze Pause Wasser, lange Pause Luft, Ruhe und Stechuhr Erde.
 */
import { prefs } from './prefs';
import type { TimerView } from './timer/view';

export const ELEMENT_IDS = ['feuer', 'wasser', 'luft', 'erde'] as const;

export function elementOf(v: Pick<TimerView, 'active' | 'kind' | 'phase'>): number {
  const fixed = prefs.value.element;
  if (fixed !== 'auto') return ELEMENT_IDS.indexOf(fixed);
  return !v.active || v.kind === 'stopwatch' ? 3 : v.phase === 'focus' ? 0 : v.phase === 'short_break' ? 1 : 2;
}
