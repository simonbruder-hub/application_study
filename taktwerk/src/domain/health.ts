/**
 * Health-Engine (Frühwarnsystem) für Arbeitspakete und Meilensteine.
 * Reine Funktionen ohne Seiteneffekte; "heute" wird für Tests injiziert.
 *
 * Arbeitspaket (calculateWorkPackageHealth)
 *   Schritt A – Grundmetriken: burnRatio, progressRatio (gewichtet nach Schätzung, sonst nach
 *   Anzahl), burnDelta, remainingHours, daysLeft, requiredDailyHours, forecastHours.
 *   Schritt B – Entscheidungsbaum in fester Reihenfolge, der schlimmste Fall gewinnt:
 *   COMPLETED → OVER_BUDGET → AT_RISK → ON_TRACK. Innerhalb einer Stufe liefert die erste
 *   zutreffende Regel die Begründung.
 *
 * Meilenstein (calculateMilestoneHealth)
 *   Aggregiert die Arbeitspakete bis zum Zieldatum: completed → delayed → at_risk → on_track.
 *
 * Alle Vergleiche sind robust gegen Gleitkomma-Rundungsfehler (Epsilon 1e-9), damit z. B.
 * 0.65 − 0.35 = 0.30000000000000004 nicht fälschlich über der Schwelle 0.30 liegt.
 */
import type { TaskStatus, UserSettings } from '../data/types';

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

/**
 * Feste Regeln des Entscheidungsbaums (Vorgabe). Anders als die Tageslast-Schwellen
 * sind sie nicht einstellbar; exportiert, damit UI und Excel sie dokumentieren können.
 */
export const HEALTH_RULES = {
  /** OVER_BUDGET ab burnDelta > 0.30 … */
  strongDeviation: 0.3,
  /** … und mehr als 1 Std. Ist-Zeit */
  strongDeviationMinActualHours: 1,
  /** AT_RISK ab burnDelta > 0.15 … */
  deviation: 0.15,
  /** … und mehr als 0.5 Std. Ist-Zeit */
  deviationMinActualHours: 0.5,
  /** AT_RISK ab burnRatio ≥ 0.85, solange progressRatio < 0.85 */
  burnWarning: 0.85,
  /** AT_RISK in den letzten 3 Tagen vor der Deadline … */
  finalDays: 3,
  /** … wenn weniger als 75 % erledigt sind */
  finalDaysMinProgress: 0.75,
} as const;

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

/* ---------- Gleitkomma-robuste Vergleiche ---------- */

const EPS = 1e-9;
const gt = (a: number, b: number): boolean => a - b > EPS;
const gte = (a: number, b: number): boolean => a - b >= -EPS;
const lt = (a: number, b: number): boolean => b - a > EPS;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

/** Nicht-negative endliche Zahl; alles andere (NaN, negativ, null) → 0 */
function nonNegative(x: number | null | undefined): number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0;
}

/* ---------- Kalenderdaten ---------- */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 86_400_000;

/** Lokales Kalenderdatum als 'YYYY-MM-DD' */
export function localDateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' → fortlaufende Tagesnummer (UTC-Arithmetik, daher sommerzeitsicher); null wenn ungültig */
function dayNumber(key: string | null | undefined): number | null {
  if (typeof key !== 'string') return null;
  const m = DATE_KEY.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  // 2026-02-31 o. Ä. würde Date.UTC stillschweigend in den März schieben
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(ms / DAY_MS);
}

/** Kalendertage von `from` bis `to` (beide 'YYYY-MM-DD'); null wenn ein Datum ungültig ist */
export function calendarDaysBetween(from: string, to: string): number | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  return a === null || b === null ? null : b - a;
}

function todayNumber(opts?: HealthOptions): number {
  const key = opts?.today ?? localDateKey();
  const n = dayNumber(key);
  if (n === null) throw new RangeError(`Ungültiges Datum für «today»: ${String(opts?.today)}`);
  return n;
}

/**
 * Verbleibende Tage bis zum Stichtag: am Fälligkeitstag selbst 1 (der Tag ist noch nutzbar),
 * negativ wenn überfällig; null ohne (gültigen) Stichtag.
 */
function daysLeftUntil(target: string | null | undefined, opts?: HealthOptions): number | null {
  const t = dayNumber(target);
  if (t === null) return null;
  const diff = t - todayNumber(opts);
  return diff === 0 ? 1 : diff;
}

function requiredPerDay(remainingHours: number, daysLeft: number | null): number | null {
  if (daysLeft === null) return null;
  return daysLeft > 0 ? remainingHours / daysLeft : Infinity;
}

/* ---------- Schwellenwerte ---------- */

/** Standardwerte mit (gültigen) Überschreibungen zusammenführen */
export function resolveThresholds(over?: Partial<HealthThresholds>): HealthThresholds {
  const out: HealthThresholds = { ...DEFAULT_THRESHOLDS };
  if (!over) return out;
  for (const key of Object.keys(out) as (keyof HealthThresholds)[]) {
    const v = over[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

/** Schwellenwerte aus den Nutzereinstellungen */
export function thresholdsFromSettings(
  s: Pick<UserSettings, 'health_red_daily_hours' | 'health_yellow_daily_hours' | 'milestone_red_daily_hours' | 'milestone_yellow_daily_hours'>,
): HealthThresholds {
  return resolveThresholds({
    redDailyHours: s.health_red_daily_hours,
    yellowDailyHours: s.health_yellow_daily_hours,
    milestoneRedDailyHours: s.milestone_red_daily_hours,
    milestoneYellowDailyHours: s.milestone_yellow_daily_hours,
  });
}

/* ---------- Zahlenformat der Begründungen ---------- */

/** Kaufmännisch runden, ohne an Darstellungsfehlern wie 28.499999… zu scheitern */
function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-7)) / f;
}

/** 2.5 → "2,5" (eine Nachkommastelle, Dezimalkomma) */
function decimal1(x: number): string {
  const r = roundTo(x, 1);
  return (r === 0 ? 0 : r).toFixed(1).replace('.', ',');
}

/** 2.5 → "2,5 Std." */
function hoursText(x: number): string {
  return `${decimal1(x)} Std.`;
}

/** 0.453 → "45%" */
function percentText(ratio: number): string {
  const r = roundTo(ratio * 100, 0);
  return `${r === 0 ? 0 : r}%`;
}

function remainingDaysText(days: number): string {
  return days === 1 ? '1 verbleibenden Tag' : `${days} verbleibende Tage`;
}

function workPackagesText(n: number): string {
  return n === 1 ? '1 Arbeitspaket' : `${n} Arbeitspakete`;
}

/* ---------- Arbeitspaket ---------- */

/** Fortschritt 0..1: gewichtet nach Schätzung, wenn alle Tasks eine Schätzung > 0 haben, sonst nach Anzahl */
function progressOf(tasks: HealthTaskInput[], burnRatio: number): number {
  if (!tasks.length) return Math.min(1, burnRatio);
  let p: number;
  if (tasks.every((t) => nonNegative(t.estimatedHours) > 0)) {
    let total = 0;
    let done = 0;
    for (const t of tasks) {
      const h = nonNegative(t.estimatedHours);
      total += h;
      if (t.status === 'done') done += h;
    }
    p = done / total;
  } else {
    p = tasks.filter((t) => t.status === 'done').length / tasks.length;
  }
  // Rundungsreste (z. B. 0.9999999999999999) auf glatte Werte ziehen
  if (near(p, 1)) return 1;
  if (near(p, 0)) return 0;
  return Math.min(1, Math.max(0, p));
}

export function calculateWorkPackageHealth(input: WorkPackageHealthInput, opts?: HealthOptions): WorkPackageHealth {
  const th = resolveThresholds(opts?.thresholds);
  const R = HEALTH_RULES;
  const plannedHours = nonNegative(input.plannedHours);
  const actualHours = nonNegative(input.actualHours);
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];

  // Schritt A: Grundmetriken
  const burnRatio = plannedHours > 0 ? actualHours / plannedHours : 0;
  const progressRatio = progressOf(tasks, burnRatio);
  const burnDelta = burnRatio - progressRatio;
  const remainingHours = Math.max(0, plannedHours * (1 - progressRatio));
  const daysLeft = daysLeftUntil(input.deadline, opts);
  const requiredDailyHours = requiredPerDay(remainingHours, daysLeft);
  const forecastHours = progressRatio > EPS ? actualHours / progressRatio : null;

  const result = (status: PlanStatus, reason: string): WorkPackageHealth => ({
    status, reason, burnRatio, progressRatio, burnDelta, remainingHours, daysLeft, requiredDailyHours, forecastHours,
  });

  // Schritt B: Entscheidungsbaum (Worst-Case gewinnt)
  // 1. COMPLETED
  if (tasks.length > 0 && near(progressRatio, 1)) {
    // Ohne Soll-Stunden gibt es kein Budget, das überschritten werden könnte
    const over = plannedHours > 0 && gt(actualHours, plannedHours);
    return result('COMPLETED', over
      ? `Abgeschlossen (+${hoursText(actualHours - plannedHours)} über Budget)`
      : 'Abgeschlossen im Zeitplan');
  }

  // 2. OVER_BUDGET
  if (plannedHours > 0 && gt(actualHours, plannedHours)) {
    return result('OVER_BUDGET', 'Zeitbudget überschritten (Ist > Soll)');
  }
  if (daysLeft !== null && daysLeft < 0) {
    return result('OVER_BUDGET', 'Deadline überschritten');
  }
  if (gt(burnDelta, R.strongDeviation) && gt(actualHours, R.strongDeviationMinActualHours)) {
    return result('OVER_BUDGET',
      `Starke Abweichung: ${percentText(burnRatio)} Zeit verbraucht, aber erst ${percentText(progressRatio)} erledigt`);
  }
  if (daysLeft !== null && requiredDailyHours !== null && gt(requiredDailyHours, th.redDailyHours)) {
    return result('OVER_BUDGET',
      `Kaum schaffbar: Noch ${hoursText(remainingHours)} Arbeit für ${remainingDaysText(daysLeft)}`);
  }

  // 3. AT_RISK
  if (gt(burnDelta, R.deviation) && gt(actualHours, R.deviationMinActualHours)) {
    return result('AT_RISK', `Fortschritt hinkt dem Zeitverbrauch um ${percentText(burnDelta)} hinterher`);
  }
  if (gte(burnRatio, R.burnWarning) && lt(progressRatio, R.burnWarning)) {
    return result('AT_RISK', 'Über 85% des Zeitbudgets verbraucht');
  }
  if (daysLeft !== null && requiredDailyHours !== null && (
    gt(requiredDailyHours, th.yellowDailyHours)
    || (daysLeft <= R.finalDays && lt(progressRatio, R.finalDaysMinProgress))
  )) {
    return result('AT_RISK', `Hohes Tagestempo bis zur Deadline nötig (${decimal1(requiredDailyHours)} Std./Tag)`);
  }

  // 4. ON_TRACK
  return result('ON_TRACK', 'Im Plan');
}

/* ---------- Meilenstein ---------- */

export function calculateMilestoneHealth(input: MilestoneHealthInput, opts?: HealthOptions): MilestoneHealth {
  const th = resolveThresholds(opts?.thresholds);
  const wps = Array.isArray(input.workPackages) ? input.workPackages : [];
  const open = wps.filter((w) => w.status !== 'COMPLETED');
  const remainingHours = open.reduce((sum, w) => sum + nonNegative(w.remainingHours), 0);
  const daysLeft = daysLeftUntil(input.targetDate, opts);
  const requiredDailyHours = requiredPerDay(remainingHours, daysLeft);

  const result = (status: MilestoneHealthStatus, reason: string): MilestoneHealth => ({
    status, reason, remainingHours, daysLeft, requiredDailyHours,
  });

  // Abgeschlossen (vor ROT geprüft): mindestens ein Arbeitspaket und alle COMPLETED
  if (wps.length > 0 && open.length === 0) return result('completed', 'Alle Arbeitspakete abgeschlossen');

  // ROT
  if (daysLeft !== null && daysLeft < 0) return result('delayed', 'Zieldatum überschritten');
  const critical = wps.filter((w) => w.status === 'OVER_BUDGET').length;
  if (critical > 0) return result('delayed', `${workPackagesText(critical)} kritisch`);
  if (requiredDailyHours !== null && gt(requiredDailyHours, th.milestoneRedDailyHours)) {
    return result('delayed', `Kaum schaffbar: ${decimal1(requiredDailyHours)} Std./Tag bis zum Zieldatum nötig`);
  }

  // GELB
  const warned = wps.filter((w) => w.status === 'AT_RISK').length;
  if (warned > 0) return result('at_risk', `${workPackagesText(warned)} mit Frühwarnung`);
  if (requiredDailyHours !== null && gt(requiredDailyHours, th.milestoneYellowDailyHours)) {
    return result('at_risk', `Hohe Tageslast bis zum Zieldatum (${decimal1(requiredDailyHours)} Std./Tag)`);
  }

  // GRÜN
  return result('on_track', wps.length ? 'Im Plan' : 'Keine Arbeitspakete zugeordnet');
}

/** Rangfolge für Worst-of-Vergleiche (höher = schlimmer) */
export const PLAN_STATUS_RANK: Record<PlanStatus, number> = {
  COMPLETED: 0,
  ON_TRACK: 1,
  AT_RISK: 2,
  OVER_BUDGET: 3,
};
