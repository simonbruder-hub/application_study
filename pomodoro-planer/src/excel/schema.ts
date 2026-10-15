/**
 * Excel-Schnittstelle – Blatt- und Spaltendefinitionen (gemeinsam für Export und Import).
 *
 * Die Blätter und Spaltenköpfe entsprechen exakt der Vorgabe. Jede Spalte hat eine Art:
 * - editable: wird beim Re-Import übernommen (Kopf dunkelblau, weisse Schrift)
 * - system:   technische Spalte, z. B. die ID (Kopf grau; die ID wird gelesen, aber nicht verändert)
 * - info:     berechnete Kennzahl, wird nur exportiert und beim Import ignoriert (Kopf grau)
 *
 * Dieses Modul lädt ExcelJS nicht und kann daher auch von der Oberfläche statisch importiert werden.
 */
import {
  MILESTONE_STATUSES, PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TIME_LOG_MODES,
  type EntityTable, type Workspace,
} from '../data/types';

/** Tabellen, die in der Arbeitsmappe ein eigenes Blatt haben (geplante Blöcke nicht). */
export type SheetTable = Exclude<EntityTable, 'planned_blocks'>;

/** Reihenfolge der Blätter = Verarbeitungsreihenfolge beim Import (Eltern vor Kindern). */
export const SHEET_TABLES: readonly SheetTable[] = ['projects', 'milestones', 'work_packages', 'tasks', 'time_logs'];

export type ColumnKind = 'editable' | 'system' | 'info';

/** Datentyp einer Spalte – steuert Zellformat beim Export und Parser beim Import. */
export type ColumnType =
  | 'id' | 'code' | 'text' | 'enum' | 'color' | 'date' | 'time'
  | 'hours' | 'minutes' | 'integer' | 'percent' | 'bool';

export type EnumKind = 'workspace' | 'projectStatus' | 'milestoneStatus' | 'taskStatus' | 'priority' | 'timeLogMode';

/** Stabile, interne Spaltenschlüssel (unabhängig vom Header-Text). */
export type ColumnKey =
  | 'id' | 'project_code' | 'ms_code' | 'ap_code' | 'name' | 'title' | 'mode' | 'status' | 'priority'
  | 'color' | 'planned_hours' | 'actual_hours' | 'progress' | 'plan_status' | 'target_date'
  | 'start_date' | 'end_date' | 'due_date' | 'estimated_hours' | 'estimated_pomodoros' | 'notes'
  | 'task_id' | 'task_title' | 'log_mode' | 'date' | 'start_time' | 'end_time' | 'duration_minutes'
  | 'comment' | 'delete';

export interface ColumnDef {
  key: ColumnKey;
  /** Spaltenkopf exakt wie in der Vorgabe */
  header: string;
  kind: ColumnKind;
  type: ColumnType;
  /** Spaltenbreite in Zeichen */
  width: number;
  /** Feld der Entität bei direkter Abbildung (Verweis-, Zeit- und Info-Spalten haben keins) */
  field?: string;
  /** Werteliste (Dropdown) für Enum-Spalten */
  enumKind?: EnumKind;
  /** Spalte muss beim Import vorhanden sein, sonst wird das Blatt übersprungen */
  required?: boolean;
  /** Kurze Erklärung, erscheint als Notiz am Spaltenkopf */
  hint: string;
}

export interface SheetDef {
  table: SheetTable;
  /** Blattname exakt wie in der Vorgabe */
  name: string;
  singular: string;
  plural: string;
  /** Genitiv Singular für Sätze wie «inkl. 1 abhängigen Tasks» */
  genitive: string;
  columns: readonly ColumnDef[];
}

/** Erlaubte Werte je Enum (kanonische Schreibweise, wie im Dropdown) */
export const ENUM_VALUES: Record<EnumKind, readonly string[]> = {
  // Reihenfolge wie in der Vorgabe "Modus (work/study)"
  workspace: ['work', 'study'] satisfies Workspace[],
  projectStatus: PROJECT_STATUSES,
  milestoneStatus: MILESTONE_STATUSES,
  taskStatus: TASK_STATUSES,
  priority: TASK_PRIORITIES,
  timeLogMode: TIME_LOG_MODES,
};

/** Dropdown-Werte der Spalte Loeschen */
export const DELETE_VALUES: readonly string[] = ['FALSE', 'TRUE'];

/* ---------- Farben und Zahlformate ---------- */

export const STYLE = {
  /** Kopf editierbarer Spalten: dunkelblau */
  editableHeaderFill: 'FF1F3864',
  editableHeaderFont: 'FFFFFFFF',
  /** Kopf berechneter/System-Spalten: grau */
  infoHeaderFill: 'FFBFBFBF',
  infoHeaderFont: 'FF262626',
  /** Datenzellen berechneter/System-Spalten: hellgrau */
  infoCellFill: 'FFF2F2F2',
  infoCellFont: 'FF595959',
} as const;

/** Hintergrund der Plan_Status-Zellen (Ampel) */
export const PLAN_STATUS_FILL: Record<string, string> = {
  ON_TRACK: 'FFC6EFCE',
  AT_RISK: 'FFFFEB9C',
  OVER_BUDGET: 'FFFFC7CE',
  COMPLETED: 'FFDDEBF7',
};

export const NUM_FMT: Partial<Record<ColumnType, string>> = {
  id: '@',
  code: '@',
  text: '@',
  enum: '@',
  color: '@',
  date: '@',
  time: '@',
  hours: '0.0#',
  minutes: '0.0',
  integer: '0',
  percent: '0%',
};

/* ---------- Spalten ---------- */

const col = (def: ColumnDef): ColumnDef => def;

const ID = col({
  key: 'id', header: 'ID', kind: 'system', type: 'id', width: 38, required: true,
  hint: 'Systemschlüssel (UUID) – nicht ändern. Leer lassen für neue Zeilen.',
});
const PROJECT_REF = col({
  key: 'project_code', header: 'Projekt_Code', kind: 'editable', type: 'code', width: 14, required: true,
  hint: 'Code des Projekts aus Blatt 1_Projekte (Pflicht).',
});
const DELETE = col({
  key: 'delete', header: 'Loeschen', kind: 'editable', type: 'bool', width: 10,
  hint: 'TRUE (oder 1 / ja) markiert die Zeile als gelöscht.',
});

export const PROJECT_SHEET: SheetDef = {
  table: 'projects', name: '1_Projekte', singular: 'Projekt', plural: 'Projekte', genitive: 'Projekts',
  columns: [
    ID,
    col({
      key: 'project_code', header: 'Projekt_Code', kind: 'editable', type: 'code', width: 14, field: 'project_code',
      hint: 'Eindeutiger, lesbarer Code (1–32 Zeichen: A–Z, 0–9, . _ -), z. B. MATHE1. Leer: wird aus dem Namen erzeugt.',
    }),
    col({ key: 'name', header: 'Name', kind: 'editable', type: 'text', width: 30, field: 'name', required: true, hint: 'Projektname (Pflicht).' }),
    col({
      key: 'mode', header: 'Modus', kind: 'editable', type: 'enum', width: 10, field: 'mode', enumKind: 'workspace', required: true,
      hint: 'work (Arbeit) oder study (Lernen) – Pflicht.',
    }),
    col({
      key: 'status', header: 'Status', kind: 'editable', type: 'enum', width: 11, field: 'status', enumKind: 'projectStatus',
      hint: 'active, paused oder archived.',
    }),
    col({ key: 'color', header: 'Farbe_Hex', kind: 'editable', type: 'color', width: 11, field: 'color', hint: 'Farbe als #RRGGBB.' }),
    col({
      key: 'planned_hours', header: 'Soll_Stunden_Gesamt', kind: 'editable', type: 'hours', width: 20, field: 'planned_hours',
      hint: 'Gesamtbudget in Stunden.',
    }),
    col({
      key: 'actual_hours', header: 'Ist_Stunden_Summe', kind: 'info', type: 'hours', width: 18,
      hint: 'Berechnet aus den Zeiteinträgen – wird beim Import ignoriert.',
    }),
    DELETE,
  ],
};

export const MILESTONE_SHEET: SheetDef = {
  table: 'milestones', name: '2_Meilensteine', singular: 'Meilenstein', plural: 'Meilensteine', genitive: 'Meilensteins',
  columns: [
    ID,
    PROJECT_REF,
    col({
      key: 'ms_code', header: 'MS_Code', kind: 'editable', type: 'code', width: 12, field: 'ms_code', required: true,
      hint: 'Code des Meilensteins, eindeutig im Projekt, z. B. MS-1 (Pflicht).',
    }),
    col({ key: 'title', header: 'Titel', kind: 'editable', type: 'text', width: 30, field: 'title', required: true, hint: 'Titel (Pflicht).' }),
    col({ key: 'target_date', header: 'Zieldatum', kind: 'editable', type: 'date', width: 12, field: 'target_date', hint: 'Datum als JJJJ-MM-TT.' }),
    col({
      key: 'status', header: 'Status', kind: 'editable', type: 'enum', width: 11, field: 'status', enumKind: 'milestoneStatus',
      hint: 'open, achieved oder delayed.',
    }),
    DELETE,
  ],
};

export const WORK_PACKAGE_SHEET: SheetDef = {
  table: 'work_packages', name: '3_Arbeitspakete', singular: 'Arbeitspaket', plural: 'Arbeitspakete', genitive: 'Arbeitspakets',
  columns: [
    ID,
    PROJECT_REF,
    col({
      key: 'ms_code', header: 'MS_Code', kind: 'editable', type: 'code', width: 12,
      hint: 'Optional: Code des Meilensteins aus Blatt 2_Meilensteine.',
    }),
    col({
      key: 'ap_code', header: 'AP_Code', kind: 'editable', type: 'code', width: 12, field: 'ap_code', required: true,
      hint: 'Code des Arbeitspakets, eindeutig im Projekt, z. B. AP-1.1 (Pflicht).',
    }),
    col({ key: 'title', header: 'Titel', kind: 'editable', type: 'text', width: 30, field: 'title', required: true, hint: 'Titel (Pflicht).' }),
    col({ key: 'start_date', header: 'Startdatum', kind: 'editable', type: 'date', width: 12, field: 'start_date', hint: 'Datum als JJJJ-MM-TT.' }),
    col({ key: 'end_date', header: 'Deadline', kind: 'editable', type: 'date', width: 12, field: 'end_date', hint: 'Datum als JJJJ-MM-TT.' }),
    col({ key: 'planned_hours', header: 'Soll_Stunden', kind: 'editable', type: 'hours', width: 13, field: 'planned_hours', hint: 'Budget in Stunden.' }),
    col({
      key: 'actual_hours', header: 'Ist_Stunden', kind: 'info', type: 'hours', width: 12,
      hint: 'Berechnet aus den Zeiteinträgen – wird beim Import ignoriert.',
    }),
    col({
      key: 'progress', header: 'Task_Fortschritt_%', kind: 'info', type: 'percent', width: 18,
      hint: 'Anteil erledigter Tasks (gewichtet nach Schätzung) – wird beim Import ignoriert.',
    }),
    col({
      key: 'plan_status', header: 'Plan_Status', kind: 'info', type: 'text', width: 14,
      hint: 'ON_TRACK, AT_RISK, OVER_BUDGET oder COMPLETED; Begründung als Notiz an der Zelle – wird beim Import ignoriert.',
    }),
    DELETE,
  ],
};

export const TASK_SHEET: SheetDef = {
  table: 'tasks', name: '4_Tasks', singular: 'Task', plural: 'Tasks', genitive: 'Tasks',
  columns: [
    ID,
    PROJECT_REF,
    col({
      key: 'ap_code', header: 'AP_Code', kind: 'editable', type: 'code', width: 12,
      hint: 'Optional: Code des Arbeitspakets. Leer = Task direkt am Projekt.',
    }),
    col({ key: 'title', header: 'Task_Titel', kind: 'editable', type: 'text', width: 34, field: 'title', required: true, hint: 'Titel (Pflicht).' }),
    col({
      key: 'status', header: 'Status', kind: 'editable', type: 'enum', width: 12, field: 'status', enumKind: 'taskStatus',
      hint: 'todo, in_progress oder done.',
    }),
    col({
      key: 'priority', header: 'Prioritaet', kind: 'editable', type: 'enum', width: 11, field: 'priority', enumKind: 'priority',
      hint: 'low, medium oder high.',
    }),
    col({ key: 'due_date', header: 'Faellig_Am', kind: 'editable', type: 'date', width: 12, field: 'due_date', hint: 'Datum als JJJJ-MM-TT.' }),
    col({
      key: 'estimated_hours', header: 'Geschaetzte_Stunden', kind: 'editable', type: 'hours', width: 20, field: 'estimated_hours',
      hint: 'Geschätzter Aufwand in Stunden.',
    }),
    col({
      key: 'estimated_pomodoros', header: 'Geschaetzte_Pomodoros', kind: 'editable', type: 'integer', width: 22,
      field: 'estimated_pomodoros', hint: 'Geschätzter Aufwand in Pomodoros (ganze Zahl).',
    }),
    col({
      key: 'actual_hours', header: 'Ist_Stunden', kind: 'info', type: 'hours', width: 12,
      hint: 'Berechnet aus den Zeiteinträgen – wird beim Import ignoriert.',
    }),
    col({ key: 'notes', header: 'Notizen', kind: 'editable', type: 'text', width: 40, field: 'notes', hint: 'Freitext.' }),
    DELETE,
  ],
};

export const TIME_LOG_SHEET: SheetDef = {
  table: 'time_logs', name: '5_Zeiteintraege', singular: 'Zeiteintrag', plural: 'Zeiteinträge', genitive: 'Zeiteintrags',
  columns: [
    ID,
    col({
      key: 'project_code', header: 'Projekt_Code', kind: 'editable', type: 'code', width: 14, required: true,
      hint: 'Code des Projekts (Pflicht für neue Zeilen).',
    }),
    col({ key: 'ap_code', header: 'AP_Code', kind: 'editable', type: 'code', width: 12, hint: 'Optional: Code des Arbeitspakets.' }),
    col({
      key: 'task_id', header: 'Task_ID', kind: 'editable', type: 'id', width: 38,
      hint: 'Optional: ID des Tasks. Leer lassen und Task_Titel_Referenz ausfüllen, um den Task über den Titel zu finden.',
    }),
    col({
      key: 'task_title', header: 'Task_Titel_Referenz', kind: 'editable', type: 'text', width: 30,
      hint: 'Titel des Tasks. Ohne Task_ID wird der Task im Projekt gesucht und bei Bedarf neu angelegt.',
    }),
    col({
      key: 'log_mode', header: 'Typ', kind: 'editable', type: 'enum', width: 11, field: 'mode', enumKind: 'timeLogMode',
      hint: 'pomodoro, stopwatch oder manual (Standard: manual).',
    }),
    col({ key: 'date', header: 'Datum', kind: 'editable', type: 'date', width: 12, required: true, hint: 'Datum als JJJJ-MM-TT (Pflicht).' }),
    col({ key: 'start_time', header: 'Startzeit', kind: 'editable', type: 'time', width: 10, required: true, hint: 'Uhrzeit als HH:MM (Pflicht).' }),
    col({
      key: 'end_time', header: 'Endzeit', kind: 'editable', type: 'time', width: 10,
      hint: 'Uhrzeit als HH:MM. Früher als die Startzeit = über Mitternacht. Leer: Startzeit + Dauer.',
    }),
    col({
      key: 'duration_minutes', header: 'Dauer_Minuten', kind: 'editable', type: 'minutes', width: 14,
      hint: 'Effektive Arbeitszeit in Minuten. Leer: Endzeit − Startzeit.',
    }),
    col({ key: 'comment', header: 'Kommentar', kind: 'editable', type: 'text', width: 34, field: 'comment', hint: 'Freitext.' }),
    DELETE,
  ],
};

export const SHEETS: Record<SheetTable, SheetDef> = {
  projects: PROJECT_SHEET,
  milestones: MILESTONE_SHEET,
  work_packages: WORK_PACKAGE_SHEET,
  tasks: TASK_SHEET,
  time_logs: TIME_LOG_SHEET,
};

/** Spaltendefinition eines Blatts über den internen Schlüssel */
export function columnOf(table: SheetTable, key: ColumnKey): ColumnDef {
  const def = SHEETS[table].columns.find((c) => c.key === key);
  if (!def) throw new Error(`Spalte ${key} existiert in Blatt ${SHEETS[table].name} nicht`);
  return def;
}

/** Header-Text einer Spalte (für Meldungen) */
export function headerOf(table: SheetTable, key: ColumnKey): string {
  return columnOf(table, key).header;
}

/** Dropdown-Werte einer Spalte oder null, wenn die Spalte keine Liste hat */
export function validationValues(def: ColumnDef): readonly string[] | null {
  if (def.enumKind) return ENUM_VALUES[def.enumKind];
  if (def.type === 'bool') return DELETE_VALUES;
  return null;
}

/**
 * Normalisiert Header- und Blattnamen für den toleranten Vergleich: Gross-/Kleinschreibung,
 * Leerzeichen, Unterstriche, Bindestriche und Umlaute spielen keine Rolle; Erläuterungen in
 * Klammern ("Modus (work/study)") werden ignoriert.
 */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-.]+/g, '');
}

/** Blattname ohne Nummernpräfix ("1_Projekte" → "projekte") */
export function normalizeSheetName(text: string): { full: string; bare: string } {
  const full = normalizeHeader(text);
  return { full, bare: full.replace(/^\d+/, '') };
}
