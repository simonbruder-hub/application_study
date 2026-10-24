/** Abgeleitete Daten für die Ansichten (alles reaktiv über Signals) */
import { computed } from '@preact/signals';
import type { Project, Task, TaskPriority, TimeLog } from '../data/types';
import { addDays, dateKey, startOfDay } from '../ui/format';
import { entities, now, workspace, workspaceData } from './store';

export const projectsById = computed(() => new Map(entities.value.projects.map((p) => [p.id, p])));
export const tasksById = computed(() => new Map(entities.value.tasks.map((t) => [t.id, t])));
export const workPackagesById = computed(() => new Map(entities.value.work_packages.map((w) => [w.id, w])));

/** Erfasste Zeit und volle Pomodoros je Aufgabe (alle Modi) */
export const taskStats = computed(() => {
  const m = new Map<string, { sec: number; pomos: number }>();
  for (const l of entities.value.time_logs) {
    if (!l.task_id) continue;
    const s = m.get(l.task_id) ?? { sec: 0, pomos: 0 };
    s.sec += l.duration_seconds;
    if (l.counts_as_pomodoro) s.pomos += 1;
    m.set(l.task_id, s);
  }
  return m;
});

/** Erfasste Sekunden je Projekt (alle Zeit) */
export const projectSeconds = computed(() => {
  const m = new Map<string, number>();
  for (const l of entities.value.time_logs) {
    if (l.project_id) m.set(l.project_id, (m.get(l.project_id) ?? 0) + l.duration_seconds);
  }
  return m;
});

const STATUS_RANK: Record<Project['status'], number> = { active: 0, paused: 1, archived: 2 };

export const sortedProjects = computed(() => workspaceData.value.projects.slice().sort((a, b) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de')));

/** Projekte, denen man neue Aufgaben/Zeit zuordnen kann */
export const openProjects = computed(() => sortedProjects.value.filter((p) => p.status !== 'archived'));

const PRIO_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Offene vor erledigten, dann Fälligkeit, Priorität, Reihenfolge */
export function taskSort(a: Task, b: Task): number {
  const da = a.status === 'done' ? 1 : 0;
  const db = b.status === 'done' ? 1 : 0;
  return da - db
    || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
    || a.sort_order - b.sort_order
    || a.created_at - b.created_at;
}

/** Heutiges Datum, wechselt um Mitternacht */
export const today = computed(() => dateKey(now.value));

export function logsBetween(logs: readonly TimeLog[], from: number, to: number): TimeLog[] {
  return logs.filter((l) => l.start_time >= from && l.start_time < to);
}

/** Heute im aktuellen Modus */
export const todayStats = computed(() => {
  const d0 = startOfDay(today.value).getTime();
  const d1 = addDays(d0, 1).getTime();
  const logs = logsBetween(workspaceData.value.time_logs, d0, d1);
  const byProject = new Map<string | null, number>();
  for (const l of logs) byProject.set(l.project_id, (byProject.get(l.project_id) ?? 0) + l.duration_seconds);
  return {
    seconds: logs.reduce((a, l) => a + l.duration_seconds, 0),
    pomodoros: logs.filter((l) => l.counts_as_pomodoro).length,
    byProject,
  };
});

/** Tage in Folge mit erfasster Zeit (heute oder bis gestern) im aktuellen Modus */
export const streak = computed(() => {
  void workspace.value;
  const days = new Set(workspaceData.value.time_logs.map((l) => dateKey(l.start_time)));
  let d = startOfDay(today.value);
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dateKey(d))) { n++; d = addDays(d, -1); }
  return n;
});

/** Titel für Timer, Mini-Player und Benachrichtigung */
export function targetTitle(t: { task_id: string | null; project_id: string | null }): string {
  const task = t.task_id ? tasksById.value.get(t.task_id) : undefined;
  if (task) return task.title;
  const p = t.project_id ? projectsById.value.get(t.project_id) : undefined;
  return p ? p.name : 'Ohne Zuordnung';
}
