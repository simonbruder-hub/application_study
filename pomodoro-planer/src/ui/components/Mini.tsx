/**
 * Mini-Player: im Bild-im-Bild-Fenster (Desktop), als Mini-Ansicht in der App und als angedockte
 * Leiste über der Navigation (Handy). Alle zeigen denselben Zustand und dieselben Aktionen.
 */
import { setTaskDone } from '../../app/actions';
import { prefs } from '../../app/prefs';
import { go, view } from '../../app/router';
import { targetTitle, tasksById } from '../../app/selectors';
import { app } from '../../app/services';
import { timerState } from '../../app/store';
import { PHASE_ATTR, readTimer } from '../../app/timer/view';
import { Icon } from '../Icon';
import { fmtDur } from '../format';
import { toast } from '../toast';
import { Mascot } from './Dial';

/** Fokus beenden und speichern (Pomodoro → weiter zur Pause, Stechuhr → Ruhe) */
export async function finishSession(): Promise<void> {
  const before = timerState.value;
  const wasFocus = before.status !== 'idle' && (before.kind === 'stopwatch' || before.phase === 'focus');
  const sec = await app().timer.finish();
  if (sec) toast(`Gespeichert: ${fmtDur(sec)}`);
  else if (wasFocus) toast('Unter einer Minute – nichts gespeichert');
}

export async function completeTarget(): Promise<void> {
  const id = timerState.value.task_id;
  const task = id ? tasksById.value.get(id) : undefined;
  if (task && task.status !== 'done') await setTaskDone(task, true);
}

function SecondaryActions({ compact = false }: { compact?: boolean }) {
  const v = readTimer();
  const s = timerState.value;
  const task = s.task_id ? tasksById.value.get(s.task_id) : undefined;
  const cls = compact ? 'icon-btn sm' : 'icon-btn';
  return (
    <>
      {v.phase === 'focus' && v.active && (
        <button type="button" class={cls} title="Fertig & speichern (F)" aria-label="Fertig und speichern" onClick={() => void finishSession()}>
          <Icon name="stop" />
        </button>
      )}
      {v.kind === 'pomodoro' && v.phase !== 'focus' && (
        <button type="button" class={cls} title="Pause überspringen (S)" aria-label="Pause überspringen" onClick={() => void app().timer.skip()}>
          <Icon name="skip" />
        </button>
      )}
      {task && task.status !== 'done' && (
        <button type="button" class={cls} title={`«${task.title}» abhaken`} aria-label="Aufgabe abhaken" onClick={() => void completeTarget()}>
          <Icon name="check" />
        </button>
      )}
    </>
  );
}

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const v = readTimer();
  const anime = prefs.value.skin === 'anime';
  const progress = v.kind === 'pomodoro' ? 1 - v.frac : v.frac;
  return (
    <div class="mini" data-phase={PHASE_ATTR[v.phase]}>
      <div class="mini-head">
        <span class="mini-phase"><i />{v.phaseLabel}{v.paused ? ' · pausiert' : ''}</span>
        <button type="button" class="icon-btn sm" title="Grosse Ansicht (Esc)" aria-label="Grosse Ansicht" onClick={onExpand}>
          <Icon name="expand" />
        </button>
      </div>
      <div class="mini-body">
        {anime && <div class="mini-mascot"><Mascot mood={v.mood} /></div>}
        <div class="mini-clock mono" role="timer">{v.clock}</div>
      </div>
      <div class="mini-bar"><i style={{ width: `${(progress * 100).toFixed(1)}%` }} /></div>
      <div class="mini-task">{targetTitle(timerState.value)}</div>
      <div class="mini-ctrl">
        <button type="button" class="btn-start btn-start-sm" onClick={() => void app().timer.toggle()}>
          <Icon name={v.running ? 'pause' : 'play'} /><span>{v.running ? 'Pause' : v.active ? 'Weiter' : 'Start'}</span>
        </button>
        <SecondaryActions />
      </div>
      <p class="mini-hint"><kbd>Leertaste</kbd> Start/Pause</p>
    </div>
  );
}

/** Angedockte Leiste (Handy), sichtbar solange ein Timer läuft und die Fokus-Ansicht nicht offen ist */
export function Dock() {
  const v = readTimer();
  if (!v.active || view.value === 'fokus') return null;
  const progress = v.kind === 'pomodoro' ? 1 - v.frac : v.frac;
  return (
    <div
      class={`dock${v.running ? ' is-running' : ''}`} data-phase={PHASE_ATTR[v.phase]}
      style={{ '--progress': `${(progress * 100).toFixed(1)}%` }}
    >
      <button type="button" class="dock-main" onClick={() => go('fokus')} aria-label="Zum Timer">
        <span class="dock-clock"><i />{v.clock}<span class="small muted">{v.paused ? 'pausiert' : v.phaseLabel}</span></span>
        <span class="dock-task">{targetTitle(timerState.value)}</span>
      </button>
      <SecondaryActions compact />
      <button type="button" class="btn-start" aria-label={v.running ? 'Pause' : 'Weiter'} onClick={() => void app().timer.toggle()}>
        <Icon name={v.running ? 'pause' : 'play'} /><span>{v.running ? 'Pause' : 'Weiter'}</span>
      </button>
    </div>
  );
}

export const dockVisible = (): boolean => timerState.value.status !== 'idle' && view.value !== 'fokus';
