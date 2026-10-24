import { useState } from 'preact/hooks';
import type { Task, TaskPriority, TaskStatus } from '../../data/types';
import { createProject, createTask, deleteTask, updateTask } from '../../app/actions';
import { openProjects, projectsById, taskStats } from '../../app/selectors';
import { entities } from '../../app/store';
import { prefs } from '../../app/prefs';
import { confirmDialog, DialogFrame, openDialog } from '../dialog';
import { toast } from '../toast';
import { fmtDur } from '../format';
import { Icon } from '../Icon';
import { parseNum, Seg } from './bits';

const NEW_PROJECT = '__new';

export const STATUS_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'done', label: 'Erledigt' },
];
export const PRIORITY_OPTIONS: readonly { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];

export interface TaskPreset {
  due_date?: string | null;
  project_id?: string;
}

export function openTaskDialog(task: Task | null, preset: TaskPreset = {}): void {
  openDialog(({ close }) => <TaskForm task={task} preset={preset} close={close} />);
}

function TaskForm({ task, preset, close }: { task: Task | null; preset: TaskPreset; close: () => void }) {
  const ws = prefs.value.workspace;
  const projects = openProjects.value;
  const current = task ? projectsById.value.get(task.project_id) : undefined;
  const choices = current && !projects.includes(current) ? [current, ...projects] : projects;
  const defaultProject = task?.project_id ?? preset.project_id
    ?? (prefs.value.lastProject[ws] && projects.some((p) => p.id === prefs.value.lastProject[ws]) ? prefs.value.lastProject[ws]! : projects[0]?.id)
    ?? NEW_PROJECT;

  const [title, setTitle] = useState(task?.title ?? '');
  const [projectId, setProjectId] = useState<string>(defaultProject);
  const [newProject, setNewProject] = useState('');
  const [wpId, setWpId] = useState<string>(task?.work_package_id ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [due, setDue] = useState(task?.due_date ?? preset.due_date ?? '');
  const [pomos, setPomos] = useState(task?.estimated_pomodoros != null ? String(task.estimated_pomodoros) : '');
  const [hours, setHours] = useState(task?.estimated_hours != null ? String(task.estimated_hours) : '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const wps = entities.value.work_packages.filter((w) => w.project_id === projectId);
  const stats = task ? taskStats.value.get(task.id) : undefined;

  const save = async () => {
    if (!title.trim() || busy) return;
    const p = parseNum(pomos);
    const h = parseNum(hours);
    if ((p !== null && p < 0) || (h !== null && h < 0)) { toast('Schätzungen dürfen nicht negativ sein.'); return; }
    setBusy(true);
    try {
      let pid = projectId;
      if (pid === NEW_PROJECT) {
        if (!newProject.trim()) { toast('Bitte einen Projektnamen eingeben.'); return; }
        pid = (await createProject({ name: newProject, mode: ws })).id;
      }
      const fields = {
        title: title.trim(),
        project_id: pid,
        work_package_id: wps.some((w) => w.id === wpId) && pid === projectId ? wpId : null,
        status,
        priority,
        due_date: due || null,
        estimated_pomodoros: p === null ? null : Math.round(p),
        estimated_hours: h === null ? null : Math.round(h * 100) / 100,
        notes,
      };
      if (task) await updateTask(task.id, fields);
      else await createTask(fields);
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!(await confirmDialog(`«${task.title}» wirklich löschen? Erfasste Zeit bleibt erhalten.`, { title: 'Aufgabe löschen', ok: 'Löschen', danger: true }))) {
      openTaskDialog(task);
      return;
    }
    await deleteTask(task.id);
    toast('Aufgabe gelöscht');
  };

  return (
    <DialogFrame
      title={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      onClose={close}
      onSubmit={save}
      footer={<>
        {task && <button type="button" class="btn btn-danger-text" onClick={() => void remove()}><Icon name="trash" />Löschen</button>}
        <span class="grow" />
        <button type="button" class="btn btn-ghost" onClick={close}>Abbrechen</button>
        <button type="submit" class="btn btn-primary" disabled={busy || !title.trim()}>Speichern</button>
      </>}
    >
      <div class="field">
        <label for="tTitle">Titel</label>
        <input id="tTitle" data-autofocus required maxLength={200} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="tProject">Projekt</label>
          <select id="tProject" value={projectId} onChange={(e) => { setProjectId(e.currentTarget.value); setWpId(''); }}>
            {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={NEW_PROJECT}>+ Neues Projekt …</option>
          </select>
        </div>
        {projectId === NEW_PROJECT && (
          <div class="field">
            <label for="tNewProject">Name des neuen Projekts</label>
            <input id="tNewProject" maxLength={120} value={newProject} onInput={(e) => setNewProject(e.currentTarget.value)} placeholder="z. B. Mathematik" />
          </div>
        )}
        {wps.length > 0 && (
          <div class="field">
            <label for="tWp">Arbeitspaket</label>
            <select id="tWp" value={wpId} onChange={(e) => setWpId(e.currentTarget.value)}>
              <option value="">Ohne Arbeitspaket</option>
              {wps.map((w) => <option key={w.id} value={w.id}>{w.ap_code} · {w.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div class="field">
        <span class="field-label">Status</span>
        <Seg label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} wide />
      </div>
      <div class="field">
        <span class="field-label">Priorität</span>
        <Seg label="Priorität" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} wide />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="tDue">Fällig am</label>
          <input id="tDue" type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
        </div>
        <div class="field field-s">
          <label for="tPomos">Pomodoros</label>
          <input id="tPomos" type="number" min={0} max={99} inputMode="numeric" value={pomos} onInput={(e) => setPomos(e.currentTarget.value)} placeholder="–" />
        </div>
        <div class="field field-s">
          <label for="tHours">Aufwand (Std.)</label>
          <input id="tHours" inputMode="decimal" value={hours} onInput={(e) => setHours(e.currentTarget.value)} placeholder="–" />
        </div>
      </div>
      <div class="field">
        <label for="tNotes">Notizen</label>
        <textarea id="tNotes" rows={3} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
      </div>
      {stats && stats.sec > 0 && (
        <p class="muted small">Bisher erfasst: {fmtDur(stats.sec)} · {stats.pomos} Pomodoro{stats.pomos === 1 ? '' : 's'}</p>
      )}
    </DialogFrame>
  );
}
