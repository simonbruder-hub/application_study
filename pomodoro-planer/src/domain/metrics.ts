/**
 * Kennzahlen aus dem Datenbestand (Ist-Stunden, Fortschritt, Health je Ebene) – VERTRAG.
 * Implementierung folgt (Track C). Alle Funktionen ignorieren gelöschte Zeilen (is_deleted).
 */
import type { Milestone, Project, Task, TimeLog, WorkPackage } from '../data/types';
import type { HealthOptions, MilestoneHealth, PlanStatus, WorkPackageHealth } from './health';

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

/** Ist-Stunden je Task-ID */
export function actualHoursByTask(_s: PlannerSnapshot): Map<string, number> {
  throw new Error('not implemented');
}
/** Ist-Stunden je Arbeitspaket-ID (über time_log.work_package_id, sonst über den Task) */
export function actualHoursByWorkPackage(_s: PlannerSnapshot): Map<string, number> {
  throw new Error('not implemented');
}
/** Ist-Stunden je Projekt-ID (über time_log.project_id, sonst über Task/Arbeitspaket) */
export function actualHoursByProject(_s: PlannerSnapshot): Map<string, number> {
  throw new Error('not implemented');
}
export function workPackageMetrics(_s: PlannerSnapshot, _opts?: HealthOptions): Map<string, WorkPackageMetrics> {
  throw new Error('not implemented');
}
export function milestoneMetrics(_s: PlannerSnapshot, _opts?: HealthOptions): Map<string, MilestoneMetrics> {
  throw new Error('not implemented');
}
export function projectMetrics(_s: PlannerSnapshot, _opts?: HealthOptions): Map<string, ProjectMetrics> {
  throw new Error('not implemented');
}
