/**
 * Schreibaktionen der Oberfläche. Alles läuft über das Repository (HLC-Zeitstempel, _dirty,
 * Lösch-Kaskade); die Sync-Engine überträgt im Hintergrund.
 */
import type {
  EntityInput, Project, Task, TaskPriority, TaskStatus, TimeLog, Workspace,
} from '../data/types';
import { codeFromName, codeKey } from '../excel/values';
import { V1_COLOR_HEX } from '../data/migrateV1';
import { toast } from '../ui/toast';
import { go } from './router';
import { app } from './services';
import { entities, timerState } from './store';
import { prefs, setPrefs } from './prefs';

export const PROJECT_COLORS: readonly string[] = [...V1_COLOR_HEX, '#0f9fb5', '#8b5e3c', '#c2185b', '#5f7076'];

const nextOrder = (rows: readonly { sort_order: number }[]): number =>
  rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;

/* ---------- Projekte ---------- */

export interface ProjectDraft {
  name: string;
  project_code?: string;
  mode: Workspace;
  status?: Project['status'];
  color?: string;
  planned_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
  tags?: string[];
}

/** Freier Projektcode (eindeutig unter nicht gelöschten Projekten, ohne Gross-/Kleinschreibung) */
export function suggestProjectCode(name: string, exceptId?: string): string {
  const taken = new Set(entities.value.projects.filter((p) => p.id !== exceptId).map((p) => codeKey(p.project_code)));
  return codeFromName(name, taken);
}

export function projectCodeTaken(code: string, exceptId?: string): boolean {
  const k = codeKey(code);
  return entities.value.projects.some((p) => p.id !== exceptId && codeKey(p.project_code) === k);
}

export async function createProject(d: ProjectDraft): Promise<Project> {
  const all = entities.value.projects;
  const input: EntityInput<Project> = {
    project_code: d.project_code?.trim() || suggestProjectCode(d.name),
    name: d.name.trim(),
    mode: d.mode,
    status: d.status ?? 'active',
    color: d.color ?? PROJECT_COLORS[all.length % V1_COLOR_HEX.length]!,
    planned_hours: d.planned_hours ?? null,
    start_date: d.start_date ?? null,
    end_date: d.end_date ?? null,
    notes: d.notes ?? '',
    sort_order: nextOrder(all),
    tags: d.tags ?? [],
  };
  const p = await app().repo.create('projects', input);
  setPrefs({ lastProject: { ...prefs.value.lastProject, [p.mode]: p.id } });
  return p;
}

export async function updateProject(id: string, patch: Partial<EntityInput<Project>>): Promise<void> {
  await app().repo.update('projects', id, patch);
}

/** Löscht das Projekt samt Meilensteinen, Arbeitspaketen und Aufgaben (Zeiteinträge bleiben ohne Projekt) */
export async function deleteProject(id: string): Promise<void> {
  const t = timerState.value;
  if (t.project_id === id) await app().timer.setTarget({ project_id: null, work_package_id: null, task_id: null });
  await app().repo.softDelete('projects', id);
}

/* ---------- Aufgaben ---------- */

export interface TaskDraft {
  title: string;
  project_id: string;
  work_package_id?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  estimated_pomodoros?: number | null;
  estimated_hours?: number | null;
  notes?: string;
}

export async function createTask(d: TaskDraft): Promise<Task> {
  const siblings = entities.value.tasks.filter((t) => t.project_id === d.project_id);
  const input: EntityInput<Task> = {
    project_id: d.project_id,
    work_package_id: d.work_package_id ?? null,
    title: d.title.trim(),
    status: d.status ?? 'todo',
    priority: d.priority ?? 'medium',
    due_date: d.due_date ?? null,
    estimated_hours: d.estimated_hours ?? null,
    estimated_pomodoros: d.estimated_pomodoros ?? null,
    notes: d.notes ?? '',
    completed_at: null,
    sort_order: nextOrder(siblings),
  };
  const task = await app().repo.create('tasks', input);
  const ws = entities.value.projects.find((p) => p.id === d.project_id)?.mode;
  if (ws) setPrefs({ lastProject: { ...prefs.value.lastProject, [ws]: d.project_id } });
  return task;
}

export async function updateTask(id: string, patch: Partial<EntityInput<Task>>): Promise<void> {
  await app().repo.update('tasks', id, patch);
}

export async function setTaskDone(task: Task, done: boolean): Promise<void> {
  const prev = task.status;
  await updateTask(task.id, { status: done ? 'done' : prev === 'done' ? 'todo' : prev });
  if (done) {
    toast(`«${task.title}» erledigt ✓`, {
      action: { label: 'Rückgängig', fn: () => { void updateTask(task.id, { status: prev === 'done' ? 'todo' : prev }); } },
    });
  }
}

export async function deleteTask(id: string): Promise<void> {
  if (timerState.value.task_id === id) await app().timer.setTarget({ ...timerState.value, task_id: null });
  await app().repo.softDelete('tasks', id);
}

/** Mit dieser Aufgabe fokussieren: Ziel setzen und (im Ruhezustand) starten */
export async function focusTask(task: Task): Promise<void> {
  const { timer } = app();
  const project = entities.value.projects.find((p) => p.id === task.project_id);
  if (project && project.mode !== prefs.value.workspace) setPrefs({ workspace: project.mode });
  await timer.setTarget({
    ...(project ? { workspace: project.mode } : {}),
    project_id: task.project_id,
    work_package_id: task.work_package_id,
    task_id: task.id,
  });
  go('fokus');
  const s = timerState.value;
  if (s.status === 'idle' && s.phase === 'focus') await timer.begin();
}

/* ---------- Zeiteinträge ---------- */

export type LogDraft = Omit<EntityInput<TimeLog>, 'comment' | 'counts_as_pomodoro' | 'mode'> & {
  comment?: string;
  counts_as_pomodoro?: boolean;
  mode?: TimeLog['mode'];
};

export async function createLog(d: LogDraft): Promise<TimeLog> {
  return app().repo.create('time_logs', {
    ...d,
    mode: d.mode ?? 'manual',
    counts_as_pomodoro: d.counts_as_pomodoro ?? false,
    comment: d.comment ?? '',
  });
}

export async function updateLog(id: string, patch: Partial<EntityInput<TimeLog>>): Promise<void> {
  await app().repo.update('time_logs', id, patch);
}

export async function deleteLog(id: string): Promise<void> {
  await app().repo.softDelete('time_logs', id);
}
