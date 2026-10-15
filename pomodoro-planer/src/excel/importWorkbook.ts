/**
 * Excel-Re-Import, Stufe 1 und 2: Einlesen (parseWorkbook) und Planen (planImport, Dry-Run).
 *
 * parseWorkbook ordnet Blätter und Spalten über ihre Namen zu – tolerant gegenüber Gross-/
 * Kleinschreibung, Leerzeichen, Umlauten und Spaltenreihenfolge – und liefert die Zellwerte
 * je Zeile. planImport ist eine reine Funktion: Sie prüft Werte und Verweise in der Reihenfolge
 * 1_Projekte → 2_Meilensteine → 3_Arbeitspakete → 4_Tasks → 5_Zeiteintraege, sammelt den Diff
 * gegenüber dem Datenbestand und erzeugt die BatchOps für Repository.applyBatch – geschrieben
 * wird erst in applyImport (Stufe 3, nach Bestätigung der Vorschau).
 */
import ExcelJS from 'exceljs';
import type { EntityTable } from '../data/types';
import type { PlannerSnapshot } from '../domain/metrics';
import { planWorkbookImport } from './importPlanner';
import type {
  ImportCounts, ImportIssue, ImportPlan, IssueSeverity, ParsedRow, ParsedSheet, ParsedWorkbook, PlanOptions,
} from './importTypes';
import {
  SHEETS, SHEET_TABLES, normalizeHeader, normalizeSheetName,
  type ColumnKey, type SheetDef, type SheetTable,
} from './schema';
import { cellPrimitive, cellText, parseBool } from './values';

export type {
  CascadeCounts, ChangeKind, FieldChange, ImportChange, ImportCounts, ImportIssue, ImportPlan, IssueSeverity,
  ParsedRow, ParsedSheet, ParsedWorkbook, PlanOptions, PlanResult,
} from './importTypes';

/* ---------- Stufe 1: Einlesen ---------- */

type XlsxInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function isWorkbook(input: unknown): input is ExcelJS.Workbook {
  return typeof input === 'object' && input !== null
    && Array.isArray((input as ExcelJS.Workbook).worksheets)
    && typeof (input as ExcelJS.Workbook).getWorksheet === 'function';
}

function emptySheet(def: SheetDef): ParsedSheet {
  return { table: def.table, name: def.name, found: false, usable: false, columns: [], rows: [] };
}

/** Leere Zeile: keine Werte ausser Info-Spalten und einem Loeschen = FALSE */
function isEmptyRow(def: SheetDef, values: ParsedRow['values']): boolean {
  for (const c of def.columns) {
    if (c.kind === 'info') continue;
    const v = values[c.key] ?? null;
    if (v === null) continue;
    if (c.key === 'delete') {
      const b = parseBool(v);
      if (b.ok && !b.value) continue;
    }
    return false;
  }
  return true;
}

function readSheet(ws: ExcelJS.Worksheet, def: SheetDef, issues: ImportIssue[]): ParsedSheet {
  const sheet: ParsedSheet = { table: def.table, name: ws.name, found: true, usable: true, columns: [], rows: [] };
  const issue = (severity: IssueSeverity, message: string, column?: string) => {
    issues.push({ sheet: ws.name, row: 1, severity, message, ...(column ? { column } : {}) });
  };

  // Kopfzeile: Spalten über den (normalisierten) Namen zuordnen
  const byHeader = new Map(def.columns.map((c) => [normalizeHeader(c.header), c]));
  const colIndex = new Map<ColumnKey, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell.value);
    const c = text ? byHeader.get(normalizeHeader(text)) : undefined;
    if (!c) return;
    if (colIndex.has(c.key)) {
      issue('warning', `Spalte «${c.header}» kommt mehrfach vor – verwendet wird die erste`, c.header);
      return;
    }
    colIndex.set(c.key, colNumber);
  });

  for (const c of def.columns) {
    if (colIndex.has(c.key)) continue;
    if (c.required) {
      issue('error', `Pflichtspalte «${c.header}» fehlt – Blatt wird nicht importiert`, c.header);
      sheet.usable = false;
    } else if (c.kind === 'editable') {
      issue('warning', `Spalte «${c.header}» fehlt – bestehende Werte bleiben unverändert`, c.header);
    }
  }
  if (def.table === 'time_logs' && !colIndex.has('end_time') && !colIndex.has('duration_minutes')) {
    issue('error', 'Spalte «Endzeit» oder «Dauer_Minuten» fehlt – Blatt wird nicht importiert');
    sheet.usable = false;
  }
  sheet.columns = [...colIndex.keys()];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: ParsedRow['values'] = {};
    for (const [key, index] of colIndex) values[key] = cellPrimitive(row.getCell(index).value);
    if (!isEmptyRow(def, values)) sheet.rows.push({ row: rowNumber, values });
  });
  return sheet;
}

function readWorkbook(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: ImportIssue[] = [];
  const available = wb.worksheets.map((ws) => ({ ws, ...normalizeSheetName(ws.name) }));
  const sheets = {} as Record<SheetTable, ParsedSheet>;
  for (const table of SHEET_TABLES) {
    const def = SHEETS[table];
    const target = normalizeSheetName(def.name);
    const match = available.find((a) => a.full === target.full) ?? available.find((a) => a.bare === target.bare);
    if (!match) {
      issues.push({ sheet: def.name, row: 0, severity: 'error', message: `Blatt «${def.name}» fehlt` });
      sheets[table] = emptySheet(def);
      continue;
    }
    sheets[table] = readSheet(match.ws, def, issues);
  }
  return { sheets, issues };
}

/**
 * Liest eine .xlsx-Datei (oder eine bereits geladene ExcelJS-Arbeitsmappe) ein.
 * Unlesbare Dateien und fehlende Blätter werden als Fehler in `issues` gemeldet.
 */
export async function parseWorkbook(input: ArrayBuffer | Uint8Array | ExcelJS.Workbook): Promise<ParsedWorkbook> {
  if (isWorkbook(input)) return readWorkbook(input);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(input as unknown as XlsxInput);
  } catch {
    const sheets = {} as Record<SheetTable, ParsedSheet>;
    for (const table of SHEET_TABLES) sheets[table] = emptySheet(SHEETS[table]);
    return {
      sheets,
      issues: [{
        sheet: '', row: 0, severity: 'error',
        message: 'Die Datei konnte nicht als Excel-Arbeitsmappe (.xlsx) gelesen werden',
      }],
    };
  }
  return readWorkbook(wb);
}

/* ---------- Stufe 2: Planen (Dry-Run) ---------- */

/**
 * Vergleicht die eingelesene Arbeitsmappe mit dem Datenbestand und plant die Änderungen.
 * `snapshot` muss auch gelöschte Zeilen enthalten (ID-Suche, Wiederherstellen).
 * Reine Funktion – schreibt nichts.
 */
export function planImport(parsed: ParsedWorkbook, snapshot: PlannerSnapshot, opts: PlanOptions = {}): ImportPlan {
  const result = planWorkbookImport(parsed, snapshot, opts);
  const plan: ImportPlan = {
    ...result,
    hasErrors: result.issues.some((i) => i.severity === 'error'),
    summaryLines: () => summaryLines(plan),
  };
  return plan;
}

/* ---------- Vorschau-Texte ---------- */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function joinGerman(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}

function countList(counts: Record<EntityTable, ImportCounts>, kind: keyof ImportCounts): string {
  const parts = SHEET_TABLES
    .filter((t) => counts[t][kind] > 0)
    .map((t) => plural(counts[t][kind], SHEETS[t].singular, SHEETS[t].plural));
  return parts.length ? parts.join(', ') : 'nichts';
}

/** "3_Arbeitspakete, Zeile 14, Projekt_Code: Unbekannter Projekt_Code «XYZ»" */
export function formatIssue(issue: ImportIssue): string {
  const where = [issue.sheet, issue.row > 0 ? `Zeile ${issue.row}` : '', issue.column ?? ''].filter(Boolean).join(', ');
  return where ? `${where}: ${issue.message}` : issue.message;
}

function summaryLines(plan: ImportPlan): string[] {
  const restored = plan.changes.filter((c) => c.restored).length;
  const lines = [
    `Neu zu erstellen: ${countList(plan.counts, 'create')}${restored ? ` (davon ${restored} wiederhergestellt)` : ''}`,
    `Zu aktualisieren: ${countList(plan.counts, 'update')}`,
  ];

  let deletion = `Zu löschen: ${countList(plan.counts, 'delete')}`;
  const cascade = (['milestones', 'work_packages', 'tasks'] as const)
    .filter((t) => plan.cascade[t] > 0)
    .map((t) => {
      const n = plan.cascade[t];
      return n === 1 ? `1 abhängigen ${SHEETS[t].genitive}` : `${n} abhängiger ${SHEETS[t].plural}`;
    });
  if (cascade.length) deletion += ` (inkl. ${joinGerman(cascade)})`;
  lines.push(deletion);

  const unlinked = plan.cascade.unlinkedWorkPackages;
  if (unlinked > 0) {
    lines.push(unlinked === 1
      ? '1 Arbeitspaket verliert die Zuordnung zum gelöschten Meilenstein'
      : `${unlinked} Arbeitspakete verlieren die Zuordnung zum gelöschten Meilenstein`);
  }
  if (plan.unchangedRows > 0) lines.push(`Unverändert: ${plural(plan.unchangedRows, 'Zeile', 'Zeilen')}`);
  if (plan.skippedRows > 0) lines.push(`Nicht übernommen: ${plural(plan.skippedRows, 'Zeile', 'Zeilen')}`);

  const errors = plan.issues.filter((i) => i.severity === 'error');
  const warnings = plan.issues.filter((i) => i.severity === 'warning');
  if (errors.length) {
    lines.push(`Fehler (${errors.length}) – betroffene Zeilen werden nicht übernommen:`);
    for (const e of errors) lines.push(`– ${formatIssue(e)}`);
  }
  if (warnings.length) {
    lines.push(`Warnungen (${warnings.length}):`);
    for (const w of warnings) lines.push(`– ${formatIssue(w)}`);
  }
  return lines;
}
