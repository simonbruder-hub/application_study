/** Kopfzeile: Modus-Umschalter, Sync-Anzeige; Seitenleisten-Timer */
import type { Workspace } from '../../data/types';
import { app } from '../../app/services';
import { prefs, setPrefs } from '../../app/prefs';
import { go } from '../../app/router';
import { projectsById, targetTitle } from '../../app/selectors';
import { now, syncStatus, timerState } from '../../app/store';
import { PHASE_ATTR, readTimer } from '../../app/timer/view';
import { Icon } from '../Icon';
import { fmtAgo } from '../format';
import { WORKSPACE_ICON, WORKSPACE_LABEL } from './bits';

/** Modus wechseln; im Ruhezustand passt die Timer-Zuordnung zum neuen Modus */
export async function switchWorkspace(ws: Workspace): Promise<void> {
  if (prefs.value.workspace === ws) return;
  setPrefs({ workspace: ws });
  const s = timerState.value;
  if (s.status !== 'idle') return;
  const p = s.project_id ? projectsById.value.get(s.project_id) : undefined;
  const keep = p && p.mode === ws;
  await app().timer.setTarget({
    workspace: ws,
    project_id: keep ? s.project_id : null,
    work_package_id: keep ? s.work_package_id : null,
    task_id: keep ? s.task_id : null,
  });
}

export function ModeSwitch() {
  const ws = prefs.value.workspace;
  const s = timerState.value;
  return (
    <div class="ws-switch" role="group" aria-label="Modus">
      {(['study', 'work'] as const).map((w) => (
        <button
          key={w} type="button" data-ws={w} class={`ws-btn${w === ws ? ' is-on' : ''}`} aria-pressed={w === ws}
          title={`${WORKSPACE_LABEL[w]} (Taste W wechselt)`} onClick={() => void switchWorkspace(w)}
        >
          <Icon name={WORKSPACE_ICON[w]} /><span class="ws-label">{WORKSPACE_LABEL[w]}</span>
          {s.status !== 'idle' && s.workspace === w && w !== ws && <i class="ws-run" aria-label="Timer läuft" />}
        </button>
      ))}
    </div>
  );
}

const SYNC_LABEL = {
  idle: 'Synchron',
  syncing: 'Synchronisiere …',
  offline: 'Offline',
  error: 'Sync-Fehler',
  signed_out: 'Nur lokal',
} as const;

export function SyncIndicator() {
  const st = syncStatus.value;
  void now.value;
  const backend = app().backend;
  const label = st.state === 'signed_out' && backend ? 'Abgemeldet' : SYNC_LABEL[st.state];
  const parts = [label];
  if (st.lastSyncedAt) parts.push(`Zuletzt synchronisiert ${fmtAgo(st.lastSyncedAt)}`);
  if (st.pending) parts.push(`${st.pending} Änderung${st.pending === 1 ? '' : 'en'} noch nicht übertragen`);
  if (st.error) parts.push(st.error);
  if (!backend) parts.push('Daten liegen nur auf diesem Gerät – Sync in den Einstellungen einrichten');
  const icon = st.state === 'offline' || st.state === 'signed_out' ? 'cloud-off' : st.state === 'syncing' ? 'sync' : st.state === 'error' ? 'warn' : 'cloud';
  return (
    <button type="button" class="sync" data-state={st.state} title={parts.join('\n')} aria-label={parts.join('. ')} onClick={() => go('einstellungen', 'sync')}>
      <Icon name={icon} /><span class="sync-label">{label}</span>
      {st.pending > 0 && st.state !== 'syncing' && <b>{st.pending}</b>}
    </button>
  );
}

/** Kleiner Timer in der Seitenleiste (Desktop) */
export function SideTimer() {
  const v = readTimer();
  const s = timerState.value;
  return (
    <div class={`mt${v.running ? ' is-running' : ''}`} data-phase={PHASE_ATTR[v.phase]}>
      <span class="mt-dot" />
      <button type="button" class="mt-clock" onClick={() => go('fokus')} title="Zum Timer">
        <span class="mt-phase">{v.statusLabel}</span>
        <span class="mono">{v.clock}</span>
        {v.active && <span class="mt-phase" style={{ textTransform: 'none', letterSpacing: 0 }}>{targetTitle(s)}</span>}
      </button>
      <button type="button" class="icon-btn sm" aria-label={v.running ? 'Pause' : 'Start'} onClick={() => void app().timer.toggle()}>
        <Icon name={v.running ? 'pause' : 'play'} />
      </button>
    </div>
  );
}
