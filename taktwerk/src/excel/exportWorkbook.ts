/**
 * Excel-Export: Datenbestand → Arbeitsmappe mit den 5 Blättern 1_Projekte … 5_Zeiteintraege.
 *
 * - Nur nicht gelöschte Zeilen, sinnvoll sortiert (Projekte → Meilensteine/Arbeitspakete →
 *   Tasks in Projektreihenfolge, Zeiteinträge chronologisch).
 * - Erste Zeile fixiert, Auto-Filter, Kopf editierbarer Spalten dunkelblau, berechnete und
 *   System-Spalten grau, Dropdowns für Modus/Status/Prioritaet/Typ/Loeschen.
 * - Datumswerte als Text 'YYYY-MM-DD' (Textformat), damit Excel sie nicht umdeutet; Stunden als Zahl.
 * - Kennzahlen (Ist-Stunden, Fortschritt, Plan_Status) liefert ein InfoProvider – standardmässig
 *   die Kennzahlen-Engine (src/domain/metrics.ts). Die Begründung des Plan_Status steht als
 *   Zellnotiz an der Zelle.
 */
import ExcelJS from 'exceljs';
import type { Milestone, Project, Task, TimeLog, WorkPackage } from '../data/types';
import { localDateKey, type HealthOptions, type HealthThresholds } from '../domain/health';
import {
  actualHoursByTask, projectMetrics, workPackageMetrics,
  type PlannerSnapshot, type ProjectMetrics, type WorkPackageMetrics,
} from '../domain/metrics';
import {
  NUM_FMT, PLAN_STATUS_FILL, SHEETS, SHEET_TABLES, STYLE, validationValues,
  type ColumnDef, type ColumnKey, type SheetDef, type SheetTable,
} from './schema';
import { formatTime, localDateOf, localSecondsOf, roundTo } from './values';

/** Quelle der berechneten Info-Spalten (injizierbar für Tests) */
export interface InfoProvider {
  projectMetrics(s: PlannerSnapshot, opts?: HealthOptions): ReadonlyMap<string, Pick<ProjectMetrics, 'actualHours'>>;
  workPackageMetrics(
    s: PlannerSnapshot,
    opts?: HealthOptions,
  ): ReadonlyMap<string, Pick<WorkPackageMetrics, 'actualHours' | 'progressRatio' | 'status' | 'reason'>>;
  actualHoursByTask(s: PlannerSnapshot): ReadonlyMap<string, number>;
}

/** Standard: Kennzahlen-Engine */
export const metricsInfoProvider: InfoProvider = { projectMetrics, workPackageMetrics, actualHoursByTask };

export interface ExportOptions {
  /** Heutiges Datum 'YYYY-MM-DD' (lokal) für die Health-Engine. Standard: heute. */
  today?: string;
  /** Schwellenwerte der Health-Engine (Standard bzw. aus den Einstellungen) */
  thresholds?: Partial<HealthThresholds>;
  info?: InfoProvider;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Vorgeschlagener Dateiname, z. B. "Taktwerk_2026-10-15.xlsx" */
export function exportFileName(today: string = localDateKey()): string {
  return `Taktwerk_${today}.xlsx`;
}

type ExportValue = string | number | boolean | null;

interface ExportRow {
  values: Partial<Record<ColumnKey, ExportValue>>;
  /** Begründung des Plan_Status (Zellnotiz) */
  reason?: string;
}

/* ---------- Sortierung ---------- */

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

type SortKey = string | number | null;

/** Vergleicht Schlüssel-Tupel; null steht hinten, Texte natürlich sortiert ("AP-2" vor "AP-10") */
function compareKeys(a: readonly SortKey[], b: readonly SortKey[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    if (x === y) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    if (c !== 0) return c;
  }
  return 0;
}

function sortBy<T>(rows: T[], key: (row: T) => SortKey[]): T[] {
  const keyed = rows.map((row) => ({ row, key: key(row) }));
  keyed.sort((a, b) => compareKeys(a.key, b.key));
  return keyed.map((k) => k.row);
}

const alive = <T extends { is_deleted: boolean }>(rows: readonly T[]): T[] => rows.filter((r) => !r.is_deleted);

/** Berechnete Stunden: 2 Nachkommastellen genügen (Anzeige 0.0#) */
const infoHours = (h: number | undefined): number | null => (h === undefined ? null : roundTo(h, 2));

/* ---------- Zeilen aufbauen ---------- */

function collectRows(
  s: PlannerSnapshot,
  info: InfoProvider,
  healthOpts: HealthOptions,
): Record<SheetTable, ExportRow[]> {
  // Nachschlagetabellen inkl. gelöschter Zeilen: Zeiteinträge bleiben als Historie erhalten
  // und zeigen auch Codes gelöschter Projekte/Arbeitspakete.
  const projectById = new Map(s.projects.map((p) => [p.id, p]));
  const milestoneById = new Map(s.milestones.map((m) => [m.id, m]));
  const wpById = new Map(s.work_packages.map((w) => [w.id, w]));
  const taskById = new Map(s.tasks.map((t) => [t.id, t]));

  const projects = sortBy(alive(s.projects), (p) => [p.sort_order, p.project_code, p.created_at]);
  const projectOrder = new Map(projects.map((p, i) => [p.id, i]));
  const inActiveProject = (row: { project_id: string }) => projectOrder.has(row.project_id);

  const milestones = sortBy(alive(s.milestones).filter(inActiveProject), (m) => [
    projectOrder.get(m.project_id)!, m.sort_order, m.target_date, m.ms_code,
  ]);
  const workPackages = sortBy(alive(s.work_packages).filter(inActiveProject), (w) => [
    projectOrder.get(w.project_id)!, w.sort_order, w.ap_code, w.created_at,
  ]);
  const wpOrder = new Map(workPackages.map((w, i) => [w.id, i]));
  const tasks = sortBy(
    alive(s.tasks).filter((t) => inActiveProject(t) && (t.work_package_id === null || wpOrder.has(t.work_package_id))),
    (t) => [
      projectOrder.get(t.project_id)!,
      // Tasks eines Arbeitspakets in AP-Reihenfolge, Tasks direkt am Projekt danach
      t.work_package_id === null ? null : wpOrder.get(t.work_package_id)!,
      t.sort_order, t.created_at,
    ],
  );
  const timeLogs = sortBy(alive(s.time_logs), (l) => [l.start_time, l.created_at]);

  const projectInfo = info.projectMetrics(s, healthOpts);
  const wpInfo = info.workPackageMetrics(s, healthOpts);
  const taskHours = info.actualHoursByTask(s);

  const codeOf = (p: Project | undefined) => p?.project_code ?? null;

  return {
    projects: projects.map((p) => ({
      values: {
        id: p.id,
        project_code: p.project_code,
        name: p.name,
        mode: p.mode,
        status: p.status,
        color: p.color,
        planned_hours: p.planned_hours,
        actual_hours: infoHours(projectInfo.get(p.id)?.actualHours),
        delete: false,
      },
    })),
    milestones: milestones.map((m: Milestone) => ({
      values: {
        id: m.id,
        project_code: codeOf(projectById.get(m.project_id)),
        ms_code: m.ms_code,
        title: m.title,
        target_date: m.target_date,
        status: m.status,
        delete: false,
      },
    })),
    work_packages: workPackages.map((w: WorkPackage) => {
      const metrics = wpInfo.get(w.id);
      return {
        values: {
          id: w.id,
          project_code: codeOf(projectById.get(w.project_id)),
          ms_code: w.milestone_id ? milestoneById.get(w.milestone_id)?.ms_code ?? null : null,
          ap_code: w.ap_code,
          title: w.title,
          start_date: w.start_date,
          end_date: w.end_date,
          planned_hours: w.planned_hours,
          actual_hours: infoHours(metrics?.actualHours),
          progress: metrics?.progressRatio ?? null,
          plan_status: metrics?.status ?? null,
          delete: false,
        },
        ...(metrics ? { reason: metrics.reason } : {}),
      };
    }),
    tasks: tasks.map((t: Task) => ({
      values: {
        id: t.id,
        project_code: codeOf(projectById.get(t.project_id)),
        ap_code: t.work_package_id ? wpById.get(t.work_package_id)?.ap_code ?? null : null,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        estimated_hours: t.estimated_hours,
        estimated_pomodoros: t.estimated_pomodoros,
        actual_hours: infoHours(taskHours.get(t.id) ?? 0),
        notes: t.notes || null,
        delete: false,
      },
    })),
    time_logs: timeLogs.map((l: TimeLog) => ({
      values: {
        id: l.id,
        project_code: l.project_id ? codeOf(projectById.get(l.project_id)) : null,
        ap_code: l.work_package_id ? wpById.get(l.work_package_id)?.ap_code ?? null : null,
        task_id: l.task_id,
        task_title: l.task_id ? taskById.get(l.task_id)?.title ?? null : null,
        log_mode: l.mode,
        date: localDateOf(l.start_time),
        start_time: formatTime(localSecondsOf(l.start_time)),
        end_time: formatTime(localSecondsOf(l.end_time)),
        duration_minutes: roundTo(l.duration_seconds / 60, 1),
        comment: l.comment || null,
        delete: false,
      },
    })),
  };
}

/* ---------- Blatt schreiben ---------- */

/** ExcelJS kennt Bereichs-Validierungen (worksheet.dataValidations), typisiert sie aber nicht. */
interface DataValidationRegistry {
  add(address: string, validation: ExcelJS.DataValidation): void;
}

function dataValidations(ws: ExcelJS.Worksheet): DataValidationRegistry {
  return (ws as unknown as { dataValidations: DataValidationRegistry }).dataValidations;
}

const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function validationFor(def: ColumnDef, values: readonly string[]): ExcelJS.DataValidation {
  const allowed = values.join(', ');
  return {
    type: 'list',
    allowBlank: true,
    formulae: [`"${values.join(',')}"`],
    showErrorMessage: true,
    // Warnung statt Sperre: deutsche Begriffe wie «erledigt» erkennt der Import ebenfalls
    errorStyle: 'warning',
    errorTitle: `Unbekannter Wert für ${def.header}`,
    error: def.type === 'bool'
      ? 'Erlaubt: FALSE oder TRUE (TRUE markiert die Zeile als gelöscht).'
      : `Erlaubt: ${allowed}. Deutsche Begriffe werden beim Import ebenfalls erkannt.`,
  };
}

function writeSheet(wb: ExcelJS.Workbook, def: SheetDef, rows: readonly ExportRow[]): void {
  const ws = wb.addWorksheet(def.name, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }],
  });
  ws.columns = def.columns.map((c) => {
    const numFmt = NUM_FMT[c.type];
    return { header: c.header, key: c.key, width: c.width, ...(numFmt ? { style: { numFmt } } : {}) };
  });

  // Kopfzeile
  const header = ws.getRow(1);
  header.height = 20;
  def.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    const editable = c.kind === 'editable';
    cell.value = c.header;
    cell.numFmt = 'General';
    cell.font = { bold: true, color: { argb: editable ? STYLE.editableHeaderFont : STYLE.infoHeaderFont } };
    cell.fill = solid(editable ? STYLE.editableHeaderFill : STYLE.infoHeaderFill);
    cell.alignment = { vertical: 'middle' };
    cell.note = c.hint;
  });

  // Daten
  const planStatusCol = def.columns.findIndex((c) => c.key === 'plan_status') + 1;
  for (const r of rows) {
    const row = ws.addRow(def.columns.map((c) => r.values[c.key] ?? null));
    def.columns.forEach((c, i) => {
      if (c.kind === 'editable') return;
      const cell = row.getCell(i + 1);
      cell.fill = solid(STYLE.infoCellFill);
      cell.font = { color: { argb: STYLE.infoCellFont } };
    });
    if (planStatusCol > 0 && r.reason) {
      const cell = row.getCell(planStatusCol);
      cell.note = r.reason;
      const fill = PLAN_STATUS_FILL[String(r.values.plan_status)];
      if (fill) cell.fill = solid(fill);
    }
  }

  // Auto-Filter über Kopf und Daten; Dropdowns bis weit unter die letzte Datenzeile
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 1), column: def.columns.length } };
  const lastRow = Math.max(rows.length + 500, 1000);
  def.columns.forEach((c, i) => {
    const values = validationValues(c);
    if (!values) return;
    const letter = ws.getColumn(i + 1).letter;
    dataValidations(ws).add(`${letter}2:${letter}${lastRow}`, validationFor(c, values));
  });
}

/* ---------- Öffentliche Schnittstelle ---------- */

/** Baut die Arbeitsmappe (ohne zu schreiben) – z. B. für Tests oder eigene Weiterverarbeitung. */
export function buildWorkbook(snapshot: PlannerSnapshot, opts: ExportOptions = {}): ExcelJS.Workbook {
  const info = opts.info ?? metricsInfoProvider;
  const healthOpts: HealthOptions = { today: opts.today ?? localDateKey() };
  if (opts.thresholds) healthOpts.thresholds = opts.thresholds;
  const rows = collectRows(snapshot, info, healthOpts);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Taktwerk';
  wb.lastModifiedBy = 'Taktwerk';
  for (const table of SHEET_TABLES) writeSheet(wb, SHEETS[table], rows[table]);
  return wb;
}

/** Exportiert den Datenbestand als .xlsx-Datei (Inhalt als ArrayBuffer, z. B. für einen Download-Blob). */
export async function exportXlsx(snapshot: PlannerSnapshot, opts: ExportOptions = {}): Promise<ArrayBuffer> {
  // ExcelJS typisiert das Ergebnis als ArrayBuffer, liefert in Node aber einen Buffer – möglicherweise als
  // Ausschnitt eines grösseren Speicherbereichs. Buffer.slice() kopiert nicht (Ansicht auf denselben Speicher),
  // daher über den Uint8Array-Konstruktor in einen eigenen, exakt passenden ArrayBuffer kopieren.
  const data = (await buildWorkbook(snapshot, opts).xlsx.writeBuffer()) as unknown as ArrayBuffer | Uint8Array;
  if (data instanceof Uint8Array) return new Uint8Array(data).buffer;
  return data;
}
