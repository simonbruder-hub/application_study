/**
 * Health-Engine (Frühwarnsystem) – VERTRAG. Implementierung folgt (Track C).
 * Reine Funktionen ohne Seiteneffekte; "heute" wird für Tests injiziert.
 */
import type { TaskStatus } from '../data/types';

export type PlanStatus = 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET' | 'COMPLETED';
export type MilestoneHealthStatus = 'on_track' | 'at_risk' | 'delayed' | 'completed';

export interface HealthThresholds {
  /** Arbeitspaket rot ab Tageslast > X Std. (Standard 6) */
  redDailyHours: number;
  /** Arbeitspaket gelb ab Tageslast > X Std. (Standard 3) */
  yellowDailyHours: number;
  /** Meilenstein rot ab kumulierter Tageslast > X Std. (Standard 6) */
  milestoneRedDailyHours: number;
  /** Meilenstein gelb ab kumulierter Tageslast > X Std. (Standard 3.5) */
  milestoneYellowDailyHours: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  redDailyHours: 6,
  yellowDailyHours: 3,
  milestoneRedDailyHours: 6,
  milestoneYellowDailyHours: 3.5,
};

export interface HealthOptions {
  /** Heutiges Datum 'YYYY-MM-DD' (lokal). Standard: aktuelles lokales Datum. */
  today?: string;
  thresholds?: Partial<HealthThresholds>;
}

export interface HealthTaskInput {
  status: TaskStatus;
  estimatedHours?: number | null;
}

export interface WorkPackageHealthInput {
  plannedHours: number;
  actualHours: number;
  tasks: HealthTaskInput[];
  /** 'YYYY-MM-DD' oder null */
  deadline?: string | null;
}

export interface WorkPackageHealth {
  status: PlanStatus;
  /** Deutsche Begründung für Badge-Tooltip und Excel */
  reason: string;
  burnRatio: number;
  progressRatio: number;
  burnDelta: number;
  remainingHours: number;
  /** null ohne Deadline */
  daysLeft: number | null;
  /** null ohne Deadline; Infinity wenn überfällig */
  requiredDailyHours: number | null;
  /** Hochrechnung Gesamtaufwand = actual / progress (null wenn progress = 0) */
  forecastHours: number | null;
}

export interface MilestoneHealthInput {
  targetDate?: string | null;
  workPackages: WorkPackageHealth[];
}

export interface MilestoneHealth {
  status: MilestoneHealthStatus;
  reason: string;
  remainingHours: number;
  daysLeft: number | null;
  requiredDailyHours: number | null;
}

export function calculateWorkPackageHealth(_input: WorkPackageHealthInput, _opts?: HealthOptions): WorkPackageHealth {
  throw new Error('not implemented');
}

export function calculateMilestoneHealth(_input: MilestoneHealthInput, _opts?: HealthOptions): MilestoneHealth {
  throw new Error('not implemented');
}
