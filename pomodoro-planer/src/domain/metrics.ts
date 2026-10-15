/**
 * Kennzahlen aus dem Datenbestand (Ist-Stunden, Fortschritt, Health je Ebene).
 * Reine Funktionen auf einem Snapshot der lokalen Tabellen.
 *
 * Sichtbarkeit: Alle Funktionen ignorieren gelöschte Zeilen (is_deleted) – und ebenso
 * Kinder gelöschter Eltern (Meilensteine/Arbeitspakete/Tasks eines gelöschten Projekts,
 * Tasks eines gelöschten Arbeitspakets). Solche Zeilen sind normalerweise per Kaskade
 * mitgelöscht, können aber durch konkurrierende Änderungen auf einem anderen Gerät
 * (Last-Writer-Wins je Zeile) wieder auftauchen. Zeiteinträge bleiben als Historie
 * immer erhalten; sie werden nur keiner gelöschten Einheit mehr gutgeschrieben.
 * Verweise auf IDs, die im Snapshot gar nicht vorkommen, werden normal gezählt.
 *
 * Zuordnung eines Zeiteintrags:
 *   Task         = log.task_id
 *   Arbeitspaket = log.work_package_id ?? Task.work_package_id
 *   Projekt      = log.project_id ?? Task.project_id ?? Arbeitspaket.project_id
 */
import type { Milestone, Project, Task, TimeLog, WorkPackage } from '../data/types';
import {
  calculateMilestoneHealth, calculateWorkPackageHealth, PLAN_STATUS_RANK,
  type HealthOptions, type HealthTaskInput, type MilestoneHealth, type PlanStatus, type WorkPackageHealth,
} from './health';

export interface PlannerSnapshot {
  projects: Project[];
  milestones: Milestone[];
  work_packages: WorkPackage[];
  tasks: Task[];
  time_logs: TimeLog[];
}

export interface WorkPackageMetrics extends WorkPackageHealth {
  workPackageId: string;
  plannedHours: number;
  actualHours: number;
  taskCount: number;
  doneCount: number;
}

export interface MilestoneMetrics extends MilestoneHealth {
  milestoneId: string;
  workPackageIds: string[];
}

export interface ProjectMetrics {
  projectId: string;
  plannedHours: number;
  actualHours: number;
  /** Anteil erledigter Tasks (gewichtet wie bei Arbeitspaketen) */
  progressRatio: number;
  status: PlanStatus;
  reason: string;
}

/* ---------- Sichtbare Zeilen und Nachschlage-Tabellen ---------- */

interface Visible {
  projects: Project[];
  milestones: Milestone[];
  workPackages: WorkPackage[];
  tasks: Task[];
  timeLogs: TimeLog[];
  taskById: Map<string, Task>;
  workPackageById: Map<string, WorkPackage>;
  /** IDs gelöschter (bzw. unsichtbarer) Einheiten – erhalten keine Ist-Stunden */
  hidden: { projects: Set<string>; workPackages: Set<string>; tasks: Set<string> };
}

/** Sortierung wie in der Oberfläche: sort_order, dann Code/Titel */
const bySortOrder = <T extends { sort_order: number }>(key: (r: T) => string) => (a: T, b: T): number =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || key(a).localeCompare(key(b), 'de');

function visibleRows(s: PlannerSnapshot): Visible {
  const hiddenProjects = new Set<string>();
  const hiddenWps = new Set<string>();
  const hiddenTasks = new Set<string>();

  const projects = (s.projects ?? []).filter((p) => {
    if (p.is_deleted) hiddenProjects.add(p.id);
    return !p.is_deleted;
  });
  const milestones = (s.milestones ?? []).filter((m) => !m.is_deleted && !hiddenProjects.has(m.project_id));
  const workPackages = (s.work_packages ?? []).filter((w) => {
    const visible = !w.is_deleted && !hiddenProjects.has(w.project_id);
    if (!visible) hiddenWps.add(w.id);
    return visible;
  });
  const tasks = (s.tasks ?? []).filter((t) => {
    const visible = !t.is_deleted && !hiddenProjects.has(t.project_id)
      && !(t.work_package_id != null && hiddenWps.has(t.work_package_id));
    if (!visible) hiddenTasks.add(t.id);
    return visible;
  });
  const timeLogs = (s.time_logs ?? []).filter((l) => !l.is_deleted);

  return {
    projects,
    milestones,
    workPackages,
    tasks,
    timeLogs,
    taskById: new Map(tasks.map((t) => [t.id, t])),
    workPackageById: new Map(workPackages.map((w) => [w.id, w])),
    hidden: { projects: hiddenProjects, workPackages: hiddenWps, tasks: hiddenTasks },
  };
}

/** Effektive Stunden eines Zeiteintrags (ungültige/negative Dauer → 0) */
function logHours(l: TimeLog): number {
  const sec = l.duration_seconds;
  return typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec / 3600 : 0;
}

interface Attribution {
  taskId: string | null;
  workPackageId: string | null;
  projectId: string | null;
}

function attribute(l: TimeLog, v: Visible): Attribution {
  const task = l.task_id ? v.taskById.get(l.task_id) : undefined;
  const workPackageId = l.work_package_id ?? task?.work_package_id ?? null;
  const wp = workPackageId ? v.workPackageById.get(workPackageId) : undefined;
  const projectId = l.project_id ?? task?.project_id ?? wp?.project_id ?? null;
  return { taskId: l.task_id ?? null, workPackageId, projectId };
}

function sumHours(v: Visible, key: keyof Attribution, hidden: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of v.timeLogs) {
    const id = attribute(l, v)[key];
    if (!id || hidden.has(id)) continue;
    out.set(id, (out.get(id) ?? 0) + logHours(l));
  }
  return out;
}

function groupBy<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const list = out.get(k);
    if (list) list.push(r); else out.set(k, [r]);
  }
  return out;
}

const healthTasks = (tasks: Task[]): HealthTaskInput[] =>
  tasks.map((t) => ({ status: t.status, estimatedHours: t.estimated_hours }));

/* ---------- Ist-Stunden ---------- */

/** Ist-Stunden je Task-ID */
export function actualHoursByTask(s: PlannerSnapshot): Map<string, number> {
  const v = visibleRows(s);
  return sumHours(v, 'taskId', v.hidden.tasks);
}

/** Ist-Stunden je Arbeitspaket-ID (über time_log.work_package_id, sonst über den Task) */
export function actualHoursByWorkPackage(s: PlannerSnapshot): Map<string, number> {
  const v = visibleRows(s);
  return sumHours(v, 'workPackageId', v.hidden.workPackages);
}

/** Ist-Stunden je Projekt-ID (über time_log.project_id, sonst über Task/Arbeitspaket) */
export function actualHoursByProject(s: PlannerSnapshot): Map<string, number> {
  const v = visibleRows(s);
  return sumHours(v, 'projectId', v.hidden.projects);
}

/* ---------- Health je Ebene ---------- */

function computeWorkPackageMetrics(v: Visible, opts?: HealthOptions): Map<string, WorkPackageMetrics> {
  const actual = sumHours(v, 'workPackageId', v.hidden.workPackages);
  const tasksByWp = groupBy(v.tasks, (t) => t.work_package_id);
  const out = new Map<string, WorkPackageMetrics>();
  for (const wp of v.workPackages) {
    const tasks = tasksByWp.get(wp.id) ?? [];
    const plannedHours = wp.planned_hours ?? 0;
    const actualHours = actual.get(wp.id) ?? 0;
    const health = calculateWorkPackageHealth(
      { plannedHours, actualHours, tasks: healthTasks(tasks), deadline: wp.end_date },
      opts,
    );
    out.set(wp.id, {
      ...health,
      workPackageId: wp.id,
      plannedHours,
      actualHours,
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => t.status === 'done').length,
    });
  }
  return out;
}

export function workPackageMetrics(s: PlannerSnapshot, opts?: HealthOptions): Map<string, WorkPackageMetrics> {
  return computeWorkPackageMetrics(visibleRows(s), opts);
}

export function milestoneMetrics(s: PlannerSnapshot, opts?: HealthOptions): Map<string, MilestoneMetrics> {
  const v = visibleRows(s);
  const wpMetrics = computeWorkPackageMetrics(v, opts);
  const wpsByMilestone = groupBy(v.workPackages, (w) => w.milestone_id);
  const out = new Map<string, MilestoneMetrics>();
  for (const ms of v.milestones) {
    const wps = (wpsByMilestone.get(ms.id) ?? []).slice().sort(bySortOrder((w) => w.ap_code));
    const health = calculateMilestoneHealth(
      { targetDate: ms.target_date, workPackages: wps.map((w) => wpMetrics.get(w.id)!) },
      opts,
    );
    out.set(ms.id, { ...health, milestoneId: ms.id, workPackageIds: wps.map((w) => w.id) });
  }
  return out;
}

/**
 * Projekt-Health: zuerst die Projektebene (alle Tasks des Projekts, Soll = Projektbudget,
 * Deadline = Projektende), danach Worst-of mit den Arbeitspaketen
 * (OVER_BUDGET > AT_RISK > ON_TRACK > COMPLETED). COMPLETED ergibt sich daher nur, wenn die
 * Projektebene COMPLETED ist und kein Arbeitspaket schlechter steht. Die Begründung stammt
 * vom schlechtesten Element (bei Gleichstand die Projektebene, dann das erste Arbeitspaket
 * in Sortierreihenfolge); bei Arbeitspaketen mit Präfix "AP-1.2: ".
 */
export function projectMetrics(s: PlannerSnapshot, opts?: HealthOptions): Map<string, ProjectMetrics> {
  const v = visibleRows(s);
  const actual = sumHours(v, 'projectId', v.hidden.projects);
  const wpMetrics = computeWorkPackageMetrics(v, opts);
  const wpsByProject = groupBy(v.workPackages, (w) => w.project_id);
  const tasksByProject = groupBy(v.tasks, (t) => t.project_id);
  const out = new Map<string, ProjectMetrics>();

  for (const p of v.projects) {
    const wps = (wpsByProject.get(p.id) ?? []).slice().sort(bySortOrder((w) => w.ap_code));
    const plannedHours = p.planned_hours ?? wps.reduce((sum, w) => sum + (w.planned_hours ?? 0), 0);
    const actualHours = actual.get(p.id) ?? 0;
    const level = calculateWorkPackageHealth(
      { plannedHours, actualHours, tasks: healthTasks(tasksByProject.get(p.id) ?? []), deadline: p.end_date },
      opts,
    );

    let status = level.status;
    let reason = level.reason;
    for (const wp of wps) {
      const m = wpMetrics.get(wp.id)!;
      if (PLAN_STATUS_RANK[m.status] > PLAN_STATUS_RANK[status]) {
        status = m.status;
        reason = `${wp.ap_code}: ${m.reason}`;
      }
    }

    out.set(p.id, { projectId: p.id, plannedHours, actualHours, progressRatio: level.progressRatio, status, reason });
  }
  return out;
}
