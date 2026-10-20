/**
 * Ansicht «Aufgaben»: Filterwahl (je Gerät gespeichert, Projektfilter je Modus) und die
 * Gruppierung nach Fälligkeit bzw. Erledigungsdatum.
 */
import { signal } from '@preact/signals';
import { TASK_PRIORITIES, type Task, type TaskPriority, type Workspace } from '../data/types';
import { addDays, dateKey, fmtDay, startOfWeek } from '../ui/format';
import { taskSort } from './selectors';

export type StatusFilter = 'open' | 'all' | 'done';
export type PrioFilter = 'all' | TaskPriority;

export interface TaskFilterState {
  status: StatusFilter;
  prio: PrioFilter;
  /** Gewähltes Projekt je Modus (fehlt = alle Projekte) */
  project: Partial<Record<Workspace, string>>;
}

const KEY = 'pomodoro-planer.v2.aufgaben';
const SEARCH_KEY = 'pomodoro-planer.v2.aufgaben.suche';
const STATUSES: readonly StatusFilter[] = ['open', 'all', 'done'];

const defaults = (): TaskFilterState => ({ status: 'open', prio: 'all', project: {} });

function load(): TaskFilterState {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const saved = JSON.parse(raw) as Partial<TaskFilterState> | null;
    if (!saved || typeof saved !== 'object') return d;
    const project: Partial<Record<Workspace, string>> = {};
    for (const ws of ['study', 'work'] as const) {
      const id = saved.project?.[ws];
      if (typeof id === 'string' && id) project[ws] = id;
    }
    return {
      status: STATUSES.includes(saved.status as StatusFilter) ? saved.status! : d.status,
      prio: saved.prio === 'all' || TASK_PRIORITIES.includes(saved.prio as TaskPriority) ? saved.prio! : d.prio,
      project,
    };
  } catch {
    return d;
  }
}

function loadSearch(): string {
  try { return sessionStorage.getItem(SEARCH_KEY) ?? ''; } catch { return ''; }
}

/** Status, Priorität und Projekt (dauerhaft auf diesem Gerät) */
export const taskFilter = signal<TaskFilterState>(load());
/** Suchtext (nur für diesen Tab) */
export const taskSearch = signal<string>(loadSearch());

export function setTaskFilter(patch: Partial<TaskFilterState>): void {
  taskFilter.value = { ...taskFilter.value, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(taskFilter.value)); } catch { /* Speicher blockiert */ }
}

export function setProjectFilter(ws: Workspace, projectId: string | null): void {
  const project = { ...taskFilter.value.project };
  if (projectId) project[ws] = projectId;
  else delete project[ws];
  setTaskFilter({ project });
}

export function setTaskSearch(q: string): void {
  taskSearch.value = q;
  try {
    if (q) sessionStorage.setItem(SEARCH_KEY, q);
    else sessionStorage.removeItem(SEARCH_KEY);
  } catch { /* Speicher blockiert */ }
}

/** Alles zurück auf «Offen, alle Projekte, alle Prioritäten» (Projektfilter nur im Modus ws) */
export function resetTaskFilter(ws: Workspace): void {
  const project = { ...taskFilter.value.project };
  delete project[ws];
  setTaskFilter({ status: 'open', prio: 'all', project });
  setTaskSearch('');
}

/* ---------- Abgleich ---------- */

/** Suchbegriffe: alle Wörter müssen in Titel oder Notizen vorkommen */
export function searchTerms(q: string): string[] {
  return q.trim().toLocaleLowerCase('de-CH').split(/\s+/).filter(Boolean);
}

export interface ActiveFilter {
  status: StatusFilter;
  projectId: string | null;
  prio: PrioFilter;
  terms: readonly string[];
}

/** Passt die Aufgabe zu Projekt, Priorität und Suche (ohne Status) */
export function matchesFilter(t: Task, f: Omit<ActiveFilter, 'status'>): boolean {
  if (f.projectId && t.project_id !== f.projectId) return false;
  if (f.prio !== 'all' && t.priority !== f.prio) return false;
  if (!f.terms.length) return true;
  const hay = `${t.title}\n${t.notes ?? ''}`.toLocaleLowerCase('de-CH');
  return f.terms.every((w) => hay.includes(w));
}

export function matchesStatus(t: Task, status: StatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'done' ? t.status === 'done' : t.status !== 'done';
}

/* ---------- Gruppen ---------- */

export interface TaskGroup<K extends string> {
  key: K;
  label: string;
  /** Zusatz neben dem Titel, z. B. das Datum */
  hint: string;
  tasks: Task[];
}

export type DueGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

const DUE_ORDER: readonly DueGroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];
export const DUE_GROUP_LABEL: Record<DueGroupKey, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  tomorrow: 'Morgen',
  week: 'Diese Woche',
  later: 'Später',
  none: 'Ohne Datum',
};

export interface DueBounds {
  today: string;
  tomorrow: string;
  /** Sonntag der laufenden Woche */
  weekEnd: string;
}

export function dueBounds(today: string): DueBounds {
  return {
    today,
    tomorrow: dateKey(addDays(today, 1)),
    weekEnd: dateKey(addDays(startOfWeek(today), 6)),
  };
}

export function dueGroup(due: string | null, b: DueBounds): DueGroupKey {
  if (!due) return 'none';
  if (due < b.today) return 'overdue';
  if (due === b.today) return 'today';
  if (due === b.tomorrow) return 'tomorrow';
  if (due <= b.weekEnd) return 'week';
  return 'later';
}

/** Offene Aufgaben nach Fälligkeit relativ zu heute, leere Gruppen entfallen */
export function groupByDue(tasks: readonly Task[], today: string): TaskGroup<DueGroupKey>[] {
  const b = dueBounds(today);
  const hint: Record<DueGroupKey, string> = {
    overdue: '', today: fmtDay(b.today), tomorrow: fmtDay(b.tomorrow), week: `bis ${fmtDay(b.weekEnd)}`, later: '', none: '',
  };
  const m = new Map<DueGroupKey, Task[]>();
  for (const t of tasks) {
    const k = dueGroup(t.due_date, b);
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  }
  return DUE_ORDER.flatMap((key) => {
    const list = m.get(key);
    return list ? [{ key, label: DUE_GROUP_LABEL[key], hint: hint[key], tasks: list.sort(taskSort) }] : [];
  });
}

/** Zeitpunkt der Erledigung (ältere Daten ohne completed_at: letzte Änderung) */
export const doneAt = (t: Task): number => t.completed_at ?? t.updated_at;

/** Zuletzt erledigte zuerst */
export function sortDone(tasks: readonly Task[]): Task[] {
  return tasks.slice().sort((a, b) => doneAt(b) - doneAt(a) || a.title.localeCompare(b.title, 'de'));
}

export type DoneGroupKey = 'today' | 'yesterday' | 'week' | 'lastWeek' | 'earlier';

const DONE_LABEL: Record<DoneGroupKey, string> = {
  today: 'Heute erledigt',
  yesterday: 'Gestern',
  week: 'Diese Woche',
  lastWeek: 'Letzte Woche',
  earlier: 'Früher',
};
const DONE_ORDER: readonly DoneGroupKey[] = ['today', 'yesterday', 'week', 'lastWeek', 'earlier'];

/** Erledigte (bereits sortiert, siehe sortDone) nach Erledigungsdatum */
export function groupDone(tasks: readonly Task[], today: string): TaskGroup<DoneGroupKey>[] {
  const yesterday = dateKey(addDays(today, -1));
  const weekStart = dateKey(startOfWeek(today));
  const lastWeekStart = dateKey(addDays(weekStart, -7));
  const m = new Map<DoneGroupKey, Task[]>();
  for (const t of tasks) {
    const d = dateKey(doneAt(t));
    const k: DoneGroupKey = d >= today ? 'today' : d === yesterday ? 'yesterday'
      : d >= weekStart ? 'week' : d >= lastWeekStart ? 'lastWeek' : 'earlier';
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  }
  return DONE_ORDER.flatMap((key) => {
    const list = m.get(key);
    return list ? [{ key, label: DONE_LABEL[key], hint: '', tasks: list }] : [];
  });
}
