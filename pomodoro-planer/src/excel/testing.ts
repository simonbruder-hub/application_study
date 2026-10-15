/**
 * Hilfen für Tests der Excel-Schnittstelle: Beispieldatenbestand mit festen UUIDs, ein
 * Fake-InfoProvider (unabhängig von der Kennzahlen-Engine) und Zellhelfer, um eine exportierte
 * Arbeitsmappe wie in Excel zu bearbeiten.
 *
 * Alle Zeitpunkte werden mit lokalen Date-Konstruktoren gebildet → Tests sind zeitzonenunabhängig.
 */
import ExcelJS from 'exceljs';
import type { Milestone, Project, Task, TimeLog, WorkPackage } from '../data/types';
import type { PlannerSnapshot } from '../domain/metrics';
import type { InfoProvider } from './exportWorkbook';
import { cellText } from './values';

/** Feste, gültige UUIDs (v4-Format) */
export const uuid = (prefix: string, n: number): string =>
  `${prefix.padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ID = {
  p1: uuid('1', 1), p2: uuid('1', 2), p3: uuid('1', 3),
  m1: uuid('2', 1),
  w1: uuid('3', 1), w2: uuid('3', 2), w3: uuid('3', 3),
  t1: uuid('4', 1), t2: uuid('4', 2), t3: uuid('4', 3), t4: uuid('4', 4), t5: uuid('4', 5),
  l1: uuid('5', 1), l2: uuid('5', 2), l3: uuid('5', 3), l4: uuid('5', 4),
} as const;

/** Lokaler Zeitpunkt (Monat 1-basiert) */
export const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number =>
  new Date(y, mo - 1, d, h, mi, s).getTime();

/** Deterministische ID-Erzeugung für planImport */
export function idSequence(prefix = '9'): () => string {
  let n = 0;
  return () => uuid(prefix, ++n);
}

const sync = (id: string, over: { is_deleted?: boolean } = {}) => ({
  id, created_at: at(2026, 9, 1), updated_at: at(2026, 9, 1), updated_by: 'device-a', is_deleted: false, ...over,
});

/**
 * Zwei aktive Projekte mit Meilenstein, Arbeitspaketen, Tasks und Zeiteinträgen, dazu ein
 * gelöschtes Projekt (mit erhaltenem Zeiteintrag) und ein gelöschter Task.
 */
export function sampleSnapshot(): PlannerSnapshot {
  const projects: Project[] = [
    {
      ...sync(ID.p1), project_code: 'MATHE1', name: 'Mathematik', mode: 'study', status: 'active', color: '#2A78D6',
      planned_hours: 40, start_date: null, end_date: '2026-12-20', notes: '', sort_order: 0,
    },
    {
      ...sync(ID.p2), project_code: 'PRO-WEB', name: 'Webprojekt', mode: 'work', status: 'active', color: '#e67e22',
      planned_hours: 120, start_date: null, end_date: null, notes: '', sort_order: 1,
    },
    {
      ...sync(ID.p3, { is_deleted: true }), project_code: 'ALT', name: 'Altprojekt', mode: 'work', status: 'archived',
      color: '#888888', planned_hours: null, start_date: null, end_date: null, notes: '', sort_order: 2,
    },
  ];
  const milestones: Milestone[] = [
    {
      ...sync(ID.m1), project_id: ID.p1, ms_code: 'MS-1', title: 'Prüfung', target_date: '2026-12-15', status: 'open',
      notes: '', sort_order: 0,
    },
  ];
  const work_packages: WorkPackage[] = [
    {
      ...sync(ID.w1), project_id: ID.p1, milestone_id: ID.m1, ap_code: 'AP-1.1', title: 'Analysis', planned_hours: 20,
      start_date: '2026-10-01', end_date: '2026-11-30', notes: '', sort_order: 0,
    },
    {
      ...sync(ID.w2), project_id: ID.p1, milestone_id: null, ap_code: 'AP-1.2', title: 'Lineare Algebra', planned_hours: 10,
      start_date: null, end_date: null, notes: '', sort_order: 1,
    },
    {
      ...sync(ID.w3), project_id: ID.p2, milestone_id: null, ap_code: 'AP-1', title: 'Frontend', planned_hours: 60,
      start_date: null, end_date: '2026-12-31', notes: '', sort_order: 0,
    },
  ];
  const task = (id: string, over: Partial<Task>): Task => ({
    ...sync(id), project_id: ID.p1, work_package_id: null, title: 'Aufgabe', status: 'todo', priority: 'medium',
    due_date: null, estimated_hours: null, estimated_pomodoros: null, notes: '', completed_at: null, sort_order: 0, ...over,
  });
  const tasks: Task[] = [
    task(ID.t1, {
      work_package_id: ID.w1, title: 'Übungsblatt 1', status: 'done', priority: 'high', due_date: '2026-10-10',
      estimated_hours: 2, estimated_pomodoros: 4, notes: 'Kapitel 1–3', completed_at: at(2026, 10, 9, 18), sort_order: 0,
    }),
    task(ID.t2, { work_package_id: ID.w1, title: 'Übungsblatt 2', estimated_hours: 3, estimated_pomodoros: 6, sort_order: 1 }),
    task(ID.t3, { title: 'Formelsammlung', status: 'in_progress', priority: 'low' }),
    task(ID.t4, { project_id: ID.p2, work_package_id: ID.w3, title: 'Layout' }),
    { ...task(ID.t5, { work_package_id: ID.w2, title: 'Gelöschte Aufgabe' }), is_deleted: true },
  ];
  const log = (id: string, over: Partial<TimeLog>): TimeLog => ({
    ...sync(id), project_id: ID.p1, work_package_id: null, task_id: null, workspace: 'study', mode: 'manual',
    start_time: 0, end_time: 0, duration_seconds: 0, counts_as_pomodoro: false, comment: '', ...over,
  });
  const time_logs: TimeLog[] = [
    log(ID.l1, {
      work_package_id: ID.w1, task_id: ID.t1, mode: 'pomodoro', counts_as_pomodoro: true,
      start_time: at(2026, 10, 5, 9, 0), end_time: at(2026, 10, 5, 9, 25), duration_seconds: 1500,
    }),
    // über Mitternacht, mit Pause (Dauer kürzer als die Zeitspanne)
    log(ID.l2, {
      project_id: ID.p2, work_package_id: ID.w3, task_id: ID.t4, workspace: 'work', mode: 'stopwatch',
      start_time: at(2026, 10, 6, 22, 30), end_time: at(2026, 10, 7, 0, 15), duration_seconds: 6000,
    }),
    // Sekunden, die Excel nicht zeigt (HH:MM, Dauer mit 1 Nachkommastelle)
    log(ID.l3, {
      start_time: at(2026, 10, 7, 14, 0, 30), end_time: at(2026, 10, 7, 15, 0, 0), duration_seconds: 3570,
      comment: 'Nachtrag',
    }),
    // Historie eines gelöschten Projekts
    log(ID.l4, {
      project_id: ID.p3, workspace: 'work', start_time: at(2026, 9, 1, 8), end_time: at(2026, 9, 1, 9), duration_seconds: 3600,
    }),
  ];
  return { projects, milestones, work_packages, tasks, time_logs };
}

/** Fester InfoProvider: unabhängig von der Kennzahlen-Engine */
export const fakeInfo: InfoProvider = {
  projectMetrics: (s) => new Map(s.projects.filter((p) => !p.is_deleted).map((p) => [p.id, { actualHours: 1.5 }])),
  workPackageMetrics: (s) => new Map(s.work_packages.filter((w) => !w.is_deleted).map((w) => [w.id, {
    actualHours: 2.25, progressRatio: 0.5, status: 'AT_RISK' as const, reason: `Testbegründung ${w.ap_code}`,
  }])),
  actualHoursByTask: () => new Map([[ID.t1, 0.42]]),
};

/* ---------- Arbeitsmappe bearbeiten ---------- */

/** Wie eine gespeicherte Datei: schreiben und neu einlesen */
export async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
}

export function sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Blatt ${name} fehlt`);
  return ws;
}

/** Spaltennummer über den Header-Text */
export function col(ws: ExcelJS.Worksheet, header: string): number {
  let found = 0;
  ws.getRow(1).eachCell((cell, n) => {
    if (cellText(cell.value) === header) found = n;
  });
  if (!found) throw new Error(`Spalte ${header} fehlt in ${ws.name}`);
  return found;
}

/** Zeilennummer, deren Spalte `header` den Text `value` enthält */
export function rowWhere(ws: ExcelJS.Worksheet, header: string, value: string): number {
  const c = col(ws, header);
  for (let r = 2; r <= ws.rowCount; r++) if (cellText(ws.getCell(r, c).value) === value) return r;
  throw new Error(`Keine Zeile mit ${header} = ${value} in ${ws.name}`);
}

export function setCell(ws: ExcelJS.Worksheet, row: number, header: string, value: ExcelJS.CellValue): ExcelJS.Cell {
  const cell = ws.getCell(row, col(ws, header));
  cell.value = value;
  return cell;
}

export function getCell(ws: ExcelJS.Worksheet, row: number, header: string): ExcelJS.Cell {
  return ws.getCell(row, col(ws, header));
}

/** Neue Zeile am Ende; Werte über Header-Texte. Liefert die Zeilennummer. */
export function appendRow(ws: ExcelJS.Worksheet, values: Record<string, ExcelJS.CellValue>): number {
  const row = ws.rowCount + 1;
  for (const [header, value] of Object.entries(values)) setCell(ws, row, header, value);
  return row;
}
