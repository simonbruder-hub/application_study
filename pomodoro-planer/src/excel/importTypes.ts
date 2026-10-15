/**
 * Excel-Re-Import – gemeinsame Typen für Einlesen (importWorkbook), Planen (importPlanner)
 * und Schreiben (applyImport). Dieses Modul lädt ExcelJS nicht.
 */
import type { BatchOp } from '../data/repository';
import type { EntityTable } from '../data/types';
import type { ColumnKey, SheetTable } from './schema';
import type { CellPrimitive } from './values';

export type IssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  /** Blattname ('' = ganze Arbeitsmappe) */
  sheet: string;
  /** Excel-Zeilennummer (Kopfzeile = 1; 0 = ganzes Blatt bzw. ganze Arbeitsmappe) */
  row: number;
  /** Spaltenkopf, falls die Meldung eine bestimmte Zelle betrifft */
  column?: string;
  severity: IssueSeverity;
  /** Deutsche Meldung, z. B. "Unbekannter Projekt_Code «XYZ»" */
  message: string;
}

export interface ParsedRow {
  /** Excel-Zeilennummer */
  row: number;
  /** Zellwerte je Spalte (nur Spalten, die im Blatt vorhanden sind) */
  values: Partial<Record<ColumnKey, CellPrimitive>>;
}

export interface ParsedSheet {
  table: SheetTable;
  /** Name des gefundenen Blatts (bzw. Sollname, wenn es fehlt) */
  name: string;
  found: boolean;
  /** false, wenn Pflichtspalten fehlen – die Zeilen werden dann nicht verarbeitet */
  usable: boolean;
  /** Im Blatt vorhandene Spalten */
  columns: ColumnKey[];
  /** Nicht leere Datenzeilen */
  rows: ParsedRow[];
}

export interface ParsedWorkbook {
  sheets: Record<SheetTable, ParsedSheet>;
  issues: ImportIssue[];
}

export type ChangeKind = 'create' | 'update' | 'delete';

export interface FieldChange {
  /** Feld der Entität, z. B. 'planned_hours' */
  field: string;
  /** Zugehöriger Spaltenkopf, z. B. 'Soll_Stunden' */
  column?: string;
  /** Bisheriger Wert (Rohwert des Domänenmodells, Verweise als ID, Zeitpunkte als Epoch-ms) */
  from: unknown;
  /** Neuer Wert (wie `from`) */
  to: unknown;
}

export interface ImportChange {
  table: SheetTable;
  kind: ChangeKind;
  id: string;
  /** Lesbare Bezeichnung, z. B. "MATHE1/AP-1.1 · Grundlagen" */
  label: string;
  sheet: string;
  row: number;
  /** Nur bei Updates: geänderte Felder */
  fields?: FieldChange[];
  /** Gelöschter Datensatz wird wiederhergestellt (kind = 'create') */
  restored?: boolean;
}

export interface ImportCounts {
  create: number;
  update: number;
  delete: number;
}

/** Mitbetroffene Zeilen der Soft-Delete-Kaskade (zusätzlich zu den direkten Löschungen) */
export interface CascadeCounts {
  milestones: number;
  work_packages: number;
  tasks: number;
  /** Arbeitspakete, die ihre Meilenstein-Zuordnung verlieren */
  unlinkedWorkPackages: number;
}

export interface ImportPlan {
  /** Für Repository.applyBatch: Eltern zuerst, Löschungen zuletzt (Kinder vor Eltern) */
  ops: BatchOp[];
  /** Direkte Änderungen je Tabelle */
  counts: Record<EntityTable, ImportCounts>;
  changes: ImportChange[];
  issues: ImportIssue[];
  /** Zeilen, die wegen Fehlern oder Warnungen nicht übernommen werden */
  skippedRows: number;
  /** Zeilen ohne Änderung gegenüber dem Datenbestand */
  unchangedRows: number;
  cascade: CascadeCounts;
  hasErrors: boolean;
  /** Deutsche Vorschau-Zeilen für den Bestätigungsdialog */
  summaryLines(): string[];
}

/** Ergebnis des Planers (ohne die abgeleiteten Felder des ImportPlan) */
export type PlanResult = Omit<ImportPlan, 'hasErrors' | 'summaryLines'>;

export interface PlanOptions {
  /** Heutiges Datum 'YYYY-MM-DD' (lokal), z. B. für Hinweise auf Zeiteinträge in der Zukunft */
  today?: string;
  /** Aktuelle Zeit (Epoch-ms), z. B. für completed_at neu erledigter Tasks */
  now?: number;
  /** UUID-Erzeugung (für Tests injizierbar) */
  newId?: () => string;
}
