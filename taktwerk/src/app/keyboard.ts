/**
 * Tastenkürzel (wie v1): Leertaste Start/Pause, F Fertig & speichern, S Pause überspringen,
 * M Minimieren, T Tag/Nacht, W Lernen/Arbeit, N neue Aufgabe, Esc Mini-Ansicht schliessen, 1–5 Ansichten.
 */
import { dialogOpen } from '../ui/dialog';
import { finishSession } from '../ui/components/Mini';
import { openTaskDialog } from '../ui/components/TaskDialog';
import { switchWorkspace } from '../ui/components/Chrome';
import { toggleDayNight } from '../ui/theme';
import { todayKey } from '../ui/format';
import { isWidget } from './desktop';
import { expand, minimize, setPipKeyHandler } from './pip';
import { prefs } from './prefs';
import { go, VIEWS } from './router';
import { app } from './services';
import { timerState } from './store';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  const tag = el.tagName;
  if ((el as HTMLElement).isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes((el as HTMLInputElement).type);
}

export function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTyping(e.target) || dialogOpen()) return;
  const { timer } = app();
  if (e.key === ' ' || e.code === 'Space') {
    // Leertaste auf einem fokussierten Knopf löst sonst zusätzlich dessen Klick aus
    e.preventDefault();
    if (!e.repeat) void timer.toggle();
    return;
  }
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  const s = timerState.value;
  const mini = prefs.value.mini || isWidget();
  if (k === 'f' && s.status !== 'idle' && (s.kind === 'stopwatch' || s.phase === 'focus')) void finishSession();
  else if (k === 's' && s.kind === 'pomodoro' && s.phase !== 'focus') void timer.skip();
  else if (k === 'm') void minimize();
  else if (k === 't') toggleDayNight();
  else if (k === 'w') void switchWorkspace(prefs.value.workspace === 'study' ? 'work' : 'study');
  else if (k === 'escape' && mini) expand();
  else if (mini) return;
  else if (k === 'n') { e.preventDefault(); openTaskDialog(null, { due_date: todayKey() }); }
  else if (/^[1-9]$/.test(k)) {
    const v = VIEWS[Number(k) - 1];
    if (v) go(v.id);
  }
}

export function initKeyboard(): () => void {
  document.addEventListener('keydown', onKey);
  setPipKeyHandler(onKey);
  return () => document.removeEventListener('keydown', onKey);
}
