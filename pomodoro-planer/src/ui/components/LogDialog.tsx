import { useState } from 'preact/hooks';
import type { TimeLog, Workspace } from '../../data/types';
import { createLog, deleteLog, updateLog } from '../../app/actions';
import { projectsById, sortedProjects } from '../../app/selectors';
import { entities } from '../../app/store';
import { prefs } from '../../app/prefs';
import { confirmDialog, DialogFrame, openDialog } from '../dialog';
import { toast } from '../toast';
import { atTime, dateKey, fmtDur, fmtTime, todayKey } from '../format';
import { Icon } from '../Icon';
import { Seg, Switch, WORKSPACE_ICON, WORKSPACE_LABEL } from './bits';

export function openLogDialog(log: TimeLog | null): void {
  openDialog(({ close }) => <LogForm log={log} close={close} />);
}

function LogForm({ log, close }: { log: TimeLog | null; close: () => void }) {
  const nowMs = Date.now();
  const defStart = nowMs - 25 * 60_000;
  const [day, setDay] = useState(log ? dateKey(log.start_time) : todayKey());
  const [from, setFrom] = useState(fmtTime(log?.start_time ?? defStart));
  const [to, setTo] = useState(fmtTime(log?.end_time ?? nowMs));
  const [pause, setPause] = useState(() => {
    if (!log) return '0';
    const gross = Math.round((log.end_time - log.start_time) / 60_000);
    return String(Math.max(0, gross - Math.round(log.duration_seconds / 60)));
  });
  const [projectId, setProjectId] = useState(log?.project_id ?? prefs.value.lastProject[prefs.value.workspace] ?? '');
  const [taskId, setTaskId] = useState(log?.task_id ?? '');
  const [ws, setWs] = useState<Workspace>(log?.workspace ?? prefs.value.workspace);
  const [pomo, setPomo] = useState(log?.counts_as_pomodoro ?? false);
  const [comment, setComment] = useState(log?.comment ?? '');
  const [busy, setBusy] = useState(false);

  const projects = sortedProjects.value;
  const project = projectId ? projectsById.value.get(projectId) : undefined;
  const tasks = project ? entities.value.tasks.filter((t) => t.project_id === project.id && (t.status !== 'done' || t.id === taskId)) : [];

  const start = atTime(day, from);
  let end = atTime(day, to);
  if (end <= start) end += 86_400_000; // über Mitternacht
  const pauseMin = Math.max(0, Number(pause) || 0);
  const seconds = Math.max(0, Math.round((end - start) / 1000) - pauseMin * 60);
  const invalid = seconds <= 0;

  const save = async () => {
    if (invalid || busy) return;
    setBusy(true);
    try {
      const task = tasks.find((t) => t.id === taskId);
      const fields = {
        project_id: project?.id ?? null,
        task_id: task?.id ?? null,
        work_package_id: task?.work_package_id ?? null,
        workspace: project?.mode ?? ws,
        start_time: start,
        end_time: end,
        duration_seconds: seconds,
        counts_as_pomodoro: pomo,
        comment: comment.trim(),
      };
      if (log) await updateLog(log.id, fields);
      else await createLog({ ...fields, mode: 'manual' });
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!log) return;
    if (!(await confirmDialog('Diesen Zeiteintrag löschen?', { title: 'Zeiteintrag löschen', ok: 'Löschen', danger: true }))) {
      openLogDialog(log);
      return;
    }
    await deleteLog(log.id);
    toast('Zeiteintrag gelöscht');
  };

  return (
    <DialogFrame
      title={log ? 'Zeiteintrag bearbeiten' : 'Zeit nachtragen'}
      onClose={close}
      onSubmit={save}
      footer={<>
        {log && <button type="button" class="btn btn-danger-text" onClick={() => void remove()}><Icon name="trash" />Löschen</button>}
        <span class="grow" />
        <button type="button" class="btn btn-ghost" onClick={close}>Abbrechen</button>
        <button type="submit" class="btn btn-primary" disabled={busy || invalid}>Speichern</button>
      </>}
    >
      <div class="field-row">
        <div class="field">
          <label for="lDay">Datum</label>
          <input id="lDay" type="date" required value={day} onInput={(e) => setDay(e.currentTarget.value || todayKey())} />
        </div>
        <div class="field field-s">
          <label for="lFrom">Von</label>
          <input id="lFrom" type="time" required value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        </div>
        <div class="field field-s">
          <label for="lTo">Bis</label>
          <input id="lTo" type="time" required value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </div>
        <div class="field field-s">
          <label for="lPause">Pause (min)</label>
          <input id="lPause" type="number" min={0} inputMode="numeric" value={pause} onInput={(e) => setPause(e.currentTarget.value)} />
        </div>
      </div>
      <p class={`small ${invalid ? 'is-error' : 'muted'}`} style={{ margin: '-6px 0 0' }}>
        {invalid ? 'Die Dauer muss grösser als 0 sein.' : `Erfasst: ${fmtDur(seconds)}${dateKey(end) !== day ? ' (bis zum Folgetag)' : ''}`}
      </p>
      <div class="field-row">
        <div class="field">
          <label for="lProject">Projekt</label>
          <select id="lProject" value={projectId} onChange={(e) => { setProjectId(e.currentTarget.value); setTaskId(''); }}>
            <option value="">Ohne Projekt</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {project && !projects.includes(project) && <option value={project.id}>{project.name}</option>}
          </select>
        </div>
        {project && (
          <div class="field">
            <label for="lTask">Aufgabe</label>
            <select id="lTask" value={taskId} onChange={(e) => setTaskId(e.currentTarget.value)}>
              <option value="">Ohne Aufgabe</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}
      </div>
      {!project && (
        <div class="field">
          <span class="field-label">Modus</span>
          <Seg
            label="Modus" value={ws} wide onChange={setWs}
            options={(['study', 'work'] as const).map((w) => ({ value: w, label: WORKSPACE_LABEL[w], icon: WORKSPACE_ICON[w] }))}
          />
        </div>
      )}
      <Switch checked={pomo} onChange={setPomo} label="Zählt als Pomodoro" hint="Für Statistik und den Fortschritt in Pomodoros" />
      <div class="field">
        <label for="lComment">Kommentar</label>
        <input id="lComment" maxLength={500} value={comment} onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
    </DialogFrame>
  );
}
