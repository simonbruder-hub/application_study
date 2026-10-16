/**
 * Excel-Re-Import, Stufe 2 (Dry-Run): vergleicht die eingelesene Arbeitsmappe mit dem
 * Datenbestand und plant die Änderungen als BatchOps für Repository.applyBatch.
 * Reine Funktion – schreibt nichts.
 *
 * Dual-Key-Prinzip
 * - ID vorhanden und bekannt → Update nur der geänderten Felder; unveränderte Zeilen erzeugen kein op.
 * - ID vorhanden, aber unbekannt → Insert mit genau dieser ID (Warnung).
 * - ID eines gelöschten Datensatzes ohne Loeschen = TRUE → Wiederherstellen (Warnung).
 * - ID leer → Insert mit neuer UUID. Ungültige UUID → Fehler, Zeile übersprungen.
 * - Verknüpfungen über Projekt_Code / MS_Code / AP_Code, ohne Beachtung der Gross-/Kleinschreibung
 *   (MS_Code und AP_Code innerhalb des Projekts). In einem Blatt umbenannte Codes gelten in den
 *   Folgeblättern unter neuem und altem Code, sofern eindeutig. Bestehende Zeilen behalten ihren
 *   Verweis, solange der Code zum bisher verknüpften Datensatz passt (auch bei getauschten Codes
 *   oder gelöschten Eltern von Zeiteinträgen).
 * - Loeschen = TRUE → Soft-Delete; die Kaskade übernimmt das Repository.
 * - Info-Spalten (Ist_Stunden, Task_Fortschritt_%, Plan_Status) werden ignoriert.
 *
 * Reihenfolge der ops: Anlegen/Ändern in Tabellenreihenfolge (Eltern zuerst; neue Zeilen tragen
 * bereits ihre UUID, damit Verweise auflösbar sind), danach Löschungen in umgekehrter Reihenfolge
 * (Kinder vor Eltern).
 */
import { newId as randomId, type BatchOp } from '../data/repository';
import {
  ENTITY_TABLES,
  type EntityTable, type Milestone, type Project, type Task, type TimeLog, type WorkPackage,
} from '../data/types';
import { localDateKey } from '../domain/health';
import type { PlannerSnapshot } from '../domain/metrics';
import type {
  CascadeCounts, FieldChange, ImportChange, ImportCounts, ImportIssue, IssueSeverity, ParsedRow, ParsedSheet,
  ParsedWorkbook, PlanOptions, PlanResult,
} from './importTypes';
import { SHEETS, SHEET_TABLES, headerOf, type ColumnKey, type SheetTable } from './schema';
import {
  cellText, codeFromName, codeKey, formatTime, isUuid, isValidCode, localDateOf, localSecondsOf, localTimestamp,
  parseBool, parseColor, parseDate, parseEnum, parseNumber, parseTime, roundTo, sameCode, titleKey,
  type CellPrimitive, type Parsed,
} from './values';

/* ---------- Typen ---------- */

interface SheetRows {
  projects: Project;
  milestones: Milestone;
  work_packages: WorkPackage;
  tasks: Task;
  time_logs: TimeLog;
}
type AnyRow = SheetRows[SheetTable];
type Values = Record<string, unknown>;

/** Tabellen mit lesbarem Code */
type CodedTable = 'projects' | 'milestones' | 'work_packages';

const CODE_FIELD: Record<CodedTable, 'project_code' | 'ms_code' | 'ap_code'> = {
  projects: 'project_code',
  milestones: 'ms_code',
  work_packages: 'ap_code',
};

/** Kennung des Schreibers in der Vorschau-Kopie (das Repository stempelt beim Schreiben neu) */
const PREVIEW_WRITER = 'excel-import';

/** Farben für neue Projekte ohne Farbe_Hex */
const PROJECT_COLORS = ['#2a78d6', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#d35400', '#2c3e50'];

interface Parent {
  table: SheetTable;
  id: string;
}

/** Geplante Zeile vor der Übernahme in den Plan */
interface Draft {
  ctx: RowCtx;
  table: SheetTable;
  /** Ziel-ID (bestehend oder neu erzeugt) */
  id: string;
  /** Bestehender Datensatz (lebend oder gelöscht) */
  existing?: AnyRow;
  /** Die Zeile nennt eine gültige ID, die es in dieser Tabelle nicht gibt */
  unknownId: boolean;
  /** Gewünschte Feldwerte aus der Zeile (nur vorhandene, gültige Spalten) */
  values: Values;
  /** Eltern, deren Löschung in diesem Import die Zeile gegenstandslos macht */
  parents: Parent[];
  /** Eindeutigkeitsbereich ('' = global, sonst Projekt-ID) und Code */
  scope?: string;
  code?: string | null;
}

type DraftBody = Pick<Draft, 'values' | 'parents' | 'scope' | 'code'>;

/* ---------- Hilfsklassen ---------- */

/** Zustand einer Tabelle nach den bisher geplanten Änderungen (inkl. gelöschter Zeilen) */
class TableState {
  private readonly byKey = new Map<string, AnyRow>();

  constructor(rows: readonly AnyRow[] = []) {
    for (const r of rows) this.byKey.set(r.id.toLowerCase(), r);
  }

  get(id: string | null | undefined): AnyRow | undefined {
    return id ? this.byKey.get(id.toLowerCase()) : undefined;
  }

  set(row: AnyRow): void {
    this.byKey.set(row.id.toLowerCase(), row);
  }

  alive(): AnyRow[] {
    return [...this.byKey.values()].filter((r) => !r.is_deleted);
  }
}

/** Auflösung lesbarer Codes (ohne Beachtung der Gross-/Kleinschreibung) innerhalb eines Bereichs */
class CodeIndex {
  /** Schlüssel → ID; null = mehrdeutig */
  private readonly primary = new Map<string, string | null>();
  private readonly aliases = new Map<string, string | null>();

  private static key(scope: string, code: string): string {
    return `${scope}\u0000${codeKey(code)}`;
  }

  /** Aktueller Code; `fallback` nur, wenn der Code sonst frei ist (Datensätze, die gelöscht werden) */
  add(scope: string, code: string | null | undefined, id: string, fallback = false): void {
    if (!code) return;
    const k = CodeIndex.key(scope, code);
    const cur = this.primary.get(k);
    if (cur === undefined) this.primary.set(k, id);
    else if (!fallback && cur !== id) this.primary.set(k, null);
  }

  /** Bisheriger Code eines umbenannten Datensatzes – gilt nur, solange niemand diesen Code trägt */
  addAlias(scope: string, code: string, id: string): void {
    const k = CodeIndex.key(scope, code);
    if (this.primary.has(k)) return;
    const cur = this.aliases.get(k);
    if (cur === undefined) this.aliases.set(k, id);
    else if (cur !== id) this.aliases.set(k, null);
  }

  /** ID, null (mehrdeutig) oder undefined (unbekannt) */
  resolve(scope: string, code: string): string | null | undefined {
    const k = CodeIndex.key(scope, code);
    const hit = this.primary.get(k);
    return hit !== undefined ? hit : this.aliases.get(k);
  }
}

/** Kontext einer Excel-Zeile: Zellzugriff und Meldungen */
class RowCtx {
  failed = false;

  constructor(
    private readonly issues: ImportIssue[],
    readonly sheet: ParsedSheet,
    readonly row: ParsedRow,
  ) {}

  get table(): SheetTable {
    return this.sheet.table;
  }

  get line(): number {
    return this.row.row;
  }

  has(key: ColumnKey): boolean {
    return this.sheet.columns.includes(key);
  }

  /** Zellwert; undefined = Spalte fehlt im Blatt, null = leer */
  cell(key: ColumnKey): CellPrimitive | undefined {
    return this.has(key) ? this.row.values[key] ?? null : undefined;
  }

  header(key: ColumnKey): string {
    return headerOf(this.table, key);
  }

  report(severity: IssueSeverity, key: ColumnKey | null, message: string): void {
    this.issues.push({
      sheet: this.sheet.name, row: this.row.row, severity, message, ...(key ? { column: this.header(key) } : {}),
    });
    if (severity === 'error') this.failed = true;
  }

  error(key: ColumnKey | null, message: string): void {
    this.report('error', key, message);
  }

  warn(key: ColumnKey | null, message: string): void {
    this.report('warning', key, message);
  }
}

/* ---------- Zellen lesen ---------- */

const decimalText = (n: number): string => String(n).replace('.', ',');

/** Getrimmter Text; undefined = Spalte fehlt, null = leer (bei Pflichtfeldern zusätzlich ein Fehler) */
function readText(ctx: RowCtx, key: ColumnKey, required = false): string | null | undefined {
  const v = ctx.cell(key);
  if (v === undefined) return undefined;
  const text = cellText(v);
  if (text === null && required) ctx.error(key, `${ctx.header(key)} fehlt (Pflichtfeld)`);
  return text;
}

/** Wert über einen Parser; ungültige Werte werden als Fehler gemeldet (Rückgabe dann undefined) */
function readWith<T>(ctx: RowCtx, key: ColumnKey, parse: (v: unknown) => Parsed<T | null>): T | null | undefined {
  const v = ctx.cell(key);
  if (v === undefined) return undefined;
  const r = parse(v);
  if (!r.ok) {
    ctx.error(key, r.error);
    return undefined;
  }
  return r.value;
}

/** Nicht negative Zahl (optional ganzzahlig) */
function readNumber(ctx: RowCtx, key: ColumnKey, integer = false): number | null | undefined {
  const n = readWith(ctx, key, parseNumber);
  if (n === null || n === undefined) return n;
  if (n < 0) {
    ctx.error(key, `Negative Werte sind nicht erlaubt («${decimalText(n)}»)`);
    return undefined;
  }
  if (integer && !Number.isInteger(n)) {
    ctx.error(key, `Ganze Zahl erwartet («${decimalText(n)}»)`);
    return undefined;
  }
  return n;
}

/** Eigener Code eines Datensatzes (Format wird geprüft) */
function readCode(ctx: RowCtx, key: ColumnKey, required: boolean): string | null | undefined {
  const text = readText(ctx, key, required);
  if (text === null || text === undefined) return text;
  if (!isValidCode(text)) {
    ctx.error(key, `Ungültiger ${ctx.header(key)} «${text}» (1–32 Zeichen: A–Z, 0–9, Punkt, Unterstrich, Bindestrich)`);
    return undefined;
  }
  return text;
}

/** Feldwert übernehmen: undefined = Spalte fehlt/ungültig; null nur bei Feldern, die leer sein dürfen */
function assign(values: Values, field: string, value: unknown, nullable: boolean): void {
  if (value === undefined || (value === null && !nullable)) return;
  values[field] = value;
}

/* ---------- Vergleich ---------- */

const blank = (x: unknown): unknown => (x === undefined || x === '' ? null : x);

/** Gleichheit aus Sicht der Excel-Darstellung (Text getrimmt, Farben ohne Gross-/Kleinschreibung) */
function sameField(field: string, a: unknown, b: unknown): boolean {
  const x = blank(a);
  const y = blank(b);
  if (x === null || y === null) return x === y;
  if (typeof x === 'string' && typeof y === 'string') {
    return field === 'color' ? x.trim().toLowerCase() === y.trim().toLowerCase() : x.trim() === y.trim();
  }
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1e-9;
  return x === y;
}

/** Zwei Zeitpunkte zeigen in Excel dasselbe lokale Datum und dieselbe Minute */
function sameMinute(a: number, b: number): boolean {
  return localDateOf(a) === localDateOf(b) && Math.floor(localSecondsOf(a) / 60) === Math.floor(localSecondsOf(b) / 60);
}

/** Spaltenkopf je Feld (für FieldChange.column) */
const REFERENCE_COLUMNS: Record<string, ColumnKey> = {
  project_id: 'project_code',
  milestone_id: 'ms_code',
  work_package_id: 'ap_code',
  task_id: 'task_id',
  start_time: 'start_time',
  end_time: 'end_time',
  duration_seconds: 'duration_minutes',
};

const FIELD_COLUMNS = Object.fromEntries(SHEET_TABLES.map((table) => {
  const out: Record<string, string> = {};
  const columns = SHEETS[table].columns;
  for (const c of columns) if (c.field) out[c.field] = c.header;
  for (const [field, key] of Object.entries(REFERENCE_COLUMNS)) {
    const c = columns.find((col) => col.key === key);
    if (c && !out[field]) out[field] = c.header;
  }
  return [table, out];
})) as Record<SheetTable, Record<string, string>>;

function byTable<T>(make: () => T): Record<SheetTable, T> {
  return Object.fromEntries(SHEET_TABLES.map((t) => [t, make()])) as Record<SheetTable, T>;
}

function emptyCounts(): Record<EntityTable, ImportCounts> {
  return Object.fromEntries(ENTITY_TABLES.map((t) => [t, { create: 0, update: 0, delete: 0 }])) as Record<
    EntityTable, ImportCounts
  >;
}

/**
 * Bisheriger Verweis einer Zeile. Gelöschte Eltern bleiben nur bei bestehenden, lebenden Zeilen
 * verknüpft (unveränderter Altbestand); neue und wiederhergestellte Zeilen brauchen lebende Eltern.
 */
function currentLink(existing: AnyRow | undefined, id: string | null | undefined): { id: string | null | undefined; keepDeleted: boolean } {
  return { id, keepDeleted: !!existing && !existing.is_deleted };
}

function withoutSyncFields(row: AnyRow): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(row)) {
    if (['id', 'user_id', 'created_at', 'updated_at', 'updated_by', 'is_deleted'].includes(k) || k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
}

/* ---------- Planer ---------- */

class ImportPlanner {
  private readonly issues: ImportIssue[] = [];
  private readonly changes: ImportChange[] = [];
  private readonly counts = emptyCounts();
  private skippedRows = 0;
  private unchangedRows = 0;
  private readonly writes = byTable<BatchOp[]>(() => []);
  private readonly deletes = byTable<BatchOp[]>(() => []);
  /** IDs, die dieser Import direkt löscht */
  private readonly deleting = byTable<Set<string>>(() => new Set());
  /** Endzustand nach den geplanten Änderungen */
  private readonly state: Record<SheetTable, TableState>;
  /** Datenbestand vor dem Import (für bisherige Codes) */
  private readonly original: Record<SheetTable, TableState>;
  private readonly renamed: Record<CodedTable, { scope: string; code: string; id: string }[]> = {
    projects: [], milestones: [], work_packages: [],
  };
  private projectCodes = new CodeIndex();
  private milestoneCodes = new CodeIndex();
  private workPackageCodes = new CodeIndex();
  private readonly now: number;
  private readonly today: string;
  private readonly makeId: () => string;

  constructor(private readonly parsed: ParsedWorkbook, snapshot: PlannerSnapshot, opts: PlanOptions) {
    const rows = (t: SheetTable): AnyRow[] => [...((snapshot[t] ?? []) as AnyRow[])];
    this.state = byTable(() => new TableState());
    this.original = byTable(() => new TableState());
    for (const t of SHEET_TABLES) {
      this.state[t] = new TableState(rows(t));
      this.original[t] = new TableState(rows(t));
    }
    this.now = opts.now ?? Date.now();
    this.today = opts.today ?? localDateKey(new Date(this.now));
    this.makeId = opts.newId ?? randomId;
  }

  run(): PlanResult {
    this.planProjects();
    this.planMilestones();
    this.planWorkPackages();
    this.planTasks();
    this.planTimeLogs();

    const ops: BatchOp[] = [];
    for (const t of SHEET_TABLES) ops.push(...this.writes[t]);
    for (const t of [...SHEET_TABLES].reverse()) ops.push(...this.deletes[t]);

    return {
      ops,
      counts: this.counts,
      changes: this.changes,
      issues: this.sortedIssues(),
      skippedRows: this.skippedRows,
      unchangedRows: this.unchangedRows,
      cascade: this.cascade(),
    };
  }

  /* ---------- Blätter ---------- */

  private planProjects(): void {
    const drafts = this.collect('projects', (ctx, e) => this.buildProject(ctx, e as Project | undefined));
    this.ensureUniqueCodes('projects', drafts, 'project_code');
    this.generateProjectCodes(drafts);
    for (const d of drafts) this.commit(d);
    this.projectCodes = this.buildIndex('projects');
  }

  private planMilestones(): void {
    const drafts = this.collect('milestones', (ctx, e) => this.buildMilestone(ctx, e as Milestone | undefined));
    this.ensureUniqueCodes('milestones', drafts, 'ms_code');
    for (const d of drafts) this.commit(d);
    this.milestoneCodes = this.buildIndex('milestones');
  }

  private planWorkPackages(): void {
    const drafts = this.collect('work_packages', (ctx, e) => this.buildWorkPackage(ctx, e as WorkPackage | undefined));
    this.ensureUniqueCodes('work_packages', drafts, 'ap_code');
    for (const d of drafts) this.commit(d);
    this.workPackageCodes = this.buildIndex('work_packages');
  }

  private planTasks(): void {
    const drafts = this.collect('tasks', (ctx, e) => this.buildTask(ctx, e as Task | undefined));
    for (const d of drafts) this.commit(d);
  }

  private planTimeLogs(): void {
    // Sofort übernehmen: neu angelegte Tasks müssen für die nächsten Zeilen auffindbar sein
    this.collect('time_logs', (ctx, e) => this.buildTimeLog(ctx, e as TimeLog | undefined), true);
  }

  /**
   * Liest alle Zeilen eines Blatts: ID und Loeschen prüfen, Löschungen planen, übrige Zeilen
   * über `build` in Entwürfe verwandeln. Mit `immediate` wird jeder Entwurf sofort übernommen.
   */
  private collect(
    table: SheetTable,
    build: (ctx: RowCtx, existing: AnyRow | undefined) => DraftBody | null,
    immediate = false,
  ): Draft[] {
    const sheet = this.parsed.sheets[table];
    const drafts: Draft[] = [];
    if (!sheet?.usable) return drafts;
    const seenIds = new Map<string, number>();
    for (const row of sheet.rows) {
      const ctx = new RowCtx(this.issues, sheet, row);
      const target = this.target(ctx, table, seenIds);
      if (!target) {
        this.skippedRows++;
        continue;
      }
      if (target.del) {
        this.planDelete(ctx, table, target.id, target.existing);
        continue;
      }
      const body = build(ctx, target.existing);
      if (!body || ctx.failed) {
        this.skippedRows++;
        continue;
      }
      const draft: Draft = {
        ...body,
        ctx,
        table,
        id: target.existing?.id ?? target.id ?? this.makeId(),
        unknownId: target.id !== null && !target.existing,
        ...(target.existing ? { existing: target.existing } : {}),
      };
      if (immediate) this.commit(draft);
      else drafts.push(draft);
    }
    return drafts;
  }

  /** ID (Format, Duplikate) und Löschmarkierung einer Zeile; null bei Fehlern */
  private target(
    ctx: RowCtx,
    table: SheetTable,
    seenIds: Map<string, number>,
  ): { id: string | null; existing: AnyRow | undefined; del: boolean } | null {
    const del = readWith(ctx, 'delete', parseBool) ?? false;
    const idText = readText(ctx, 'id');
    let id: string | null = null;
    let existing: AnyRow | undefined;
    if (idText) {
      if (!isUuid(idText)) {
        ctx.error('id', `Ungültige ID «${idText}» (erwartet eine UUID; für neue Zeilen leer lassen)`);
      } else {
        id = idText.toLowerCase();
        const first = seenIds.get(id);
        if (first !== undefined) ctx.error('id', `Doppelte ID (bereits in Zeile ${first})`);
        else seenIds.set(id, ctx.line);
        existing = this.state[table].get(id);
      }
    }
    return ctx.failed ? null : { id, existing, del };
  }

  private planDelete(ctx: RowCtx, table: SheetTable, id: string | null, existing: AnyRow | undefined): void {
    if (!id) {
      ctx.warn('delete', 'Loeschen = TRUE ohne ID – Zeile wird ignoriert');
      this.skippedRows++;
      return;
    }
    if (!existing) {
      ctx.warn('id', 'Zu löschender Datensatz nicht gefunden – Zeile wird ignoriert');
      this.skippedRows++;
      return;
    }
    if (existing.is_deleted) {
      this.unchangedRows++;
      return;
    }
    this.deleting[table].add(existing.id);
    this.deletes[table].push({ op: 'delete', table, id: existing.id });
    this.counts[table].delete++;
    this.changes.push({
      table, kind: 'delete', id: existing.id, label: this.label(table, existing), sheet: ctx.sheet.name, row: ctx.line,
    });
  }

  /* ---------- Zeilen je Blatt ---------- */

  private buildProject(ctx: RowCtx, existing: Project | undefined): DraftBody | null {
    const code = readCode(ctx, 'project_code', false);
    const name = readText(ctx, 'name', true);
    const mode = readWith(ctx, 'mode', (v) => parseEnum(v, 'workspace'));
    if (mode === null) ctx.error('mode', 'Modus fehlt (Pflichtfeld: work oder study)');
    const status = readWith(ctx, 'status', (v) => parseEnum(v, 'projectStatus'));
    const color = readWith(ctx, 'color', parseColor);
    const planned = readNumber(ctx, 'planned_hours');
    if (ctx.failed) return null;

    const values: Values = {};
    assign(values, 'name', name, false);
    assign(values, 'mode', mode, false);
    assign(values, 'status', status, false);
    assign(values, 'color', color, false);
    assign(values, 'planned_hours', planned, true);

    let finalCode: string | null = null;
    if (code) {
      finalCode = code;
      values.project_code = code;
    } else if (existing) {
      finalCode = existing.project_code;
      if (code === null) ctx.warn('project_code', `Projekt_Code leer – der bisherige Code «${existing.project_code}» bleibt`);
    }
    return { values, parents: [], scope: '', code: finalCode };
  }

  private buildMilestone(ctx: RowCtx, existing: Milestone | undefined): DraftBody | null {
    const projectId = this.refProject(ctx, existing);
    const msCode = readCode(ctx, 'ms_code', true);
    const title = readText(ctx, 'title', true);
    const targetDate = readWith(ctx, 'target_date', parseDate);
    const status = readWith(ctx, 'status', (v) => parseEnum(v, 'milestoneStatus'));
    if (ctx.failed || !projectId || !msCode) return null;
    if (!this.checkSameProject(ctx, existing, projectId, 'Meilensteine')) return null;

    const values: Values = { project_id: projectId, ms_code: msCode };
    assign(values, 'title', title, false);
    assign(values, 'target_date', targetDate, true);
    assign(values, 'status', status, false);
    return { values, parents: [{ table: 'projects', id: projectId }], scope: projectId, code: msCode };
  }

  private buildWorkPackage(ctx: RowCtx, existing: WorkPackage | undefined): DraftBody | null {
    const projectId = this.refProject(ctx, existing);
    const msText = readText(ctx, 'ms_code');
    const apCode = readCode(ctx, 'ap_code', true);
    const title = readText(ctx, 'title', true);
    const startDate = readWith(ctx, 'start_date', parseDate);
    const endDate = readWith(ctx, 'end_date', parseDate);
    const planned = readNumber(ctx, 'planned_hours');
    let milestoneId: string | null | undefined = msText === undefined ? undefined : null;
    if (projectId && msText) {
      milestoneId = this.link(ctx, 'ms_code', msText, 'milestones', projectId, currentLink(existing, existing?.milestone_id));
    }
    if (ctx.failed || !projectId || !apCode) return null;
    if (!this.checkSameProject(ctx, existing, projectId, 'Arbeitspakete')) return null;

    // Deadline vor dem Startdatum lehnt der Server ab (CHECK work_packages_end_date_check) → Fehler.
    // Fehlt eine der Spalten, gilt der bisherige Wert; unveränderte Altdaten werden nicht bemängelt.
    const start = startDate !== undefined ? startDate : existing?.start_date ?? null;
    const end = endDate !== undefined ? endDate : existing?.end_date ?? null;
    const datesChanged = !existing || existing.is_deleted
      || start !== (existing.start_date ?? null) || end !== (existing.end_date ?? null);
    if (start && end && start > end && datesChanged) {
      ctx.error(ctx.has('start_date') ? 'start_date' : 'end_date', `Startdatum ${start} liegt nach der Deadline ${end}`);
      return null;
    }
    const values: Values = { project_id: projectId, ap_code: apCode };
    assign(values, 'milestone_id', milestoneId, true);
    assign(values, 'title', title, false);
    assign(values, 'start_date', startDate, true);
    assign(values, 'end_date', endDate, true);
    assign(values, 'planned_hours', planned, true);
    // Nur das Projekt ist ein Elternteil im Sinn der Lösch-Kaskade: Wird der Meilenstein gelöscht,
    // entfernt das Repository lediglich die Zuordnung (unlink) – die Zeile bleibt gültig.
    return { values, parents: [{ table: 'projects', id: projectId }], scope: projectId, code: apCode };
  }

  private buildTask(ctx: RowCtx, existing: Task | undefined): DraftBody | null {
    const projectId = this.refProject(ctx, existing);
    const apText = readText(ctx, 'ap_code');
    const title = readText(ctx, 'title', true);
    const status = readWith(ctx, 'status', (v) => parseEnum(v, 'taskStatus'));
    const priority = readWith(ctx, 'priority', (v) => parseEnum(v, 'priority'));
    const dueDate = readWith(ctx, 'due_date', parseDate);
    const hours = readNumber(ctx, 'estimated_hours');
    const pomodoros = readNumber(ctx, 'estimated_pomodoros', true);
    const notes = readText(ctx, 'notes');
    let wpId: string | null | undefined = apText === undefined ? undefined : null;
    if (projectId && apText) {
      wpId = this.link(ctx, 'ap_code', apText, 'work_packages', projectId, currentLink(existing, existing?.work_package_id));
    }
    if (ctx.failed || !projectId) return null;
    // In ein anderes Projekt verschoben, ohne AP_Code-Spalte: alte AP-Zuordnung passt nicht mehr
    if (wpId === undefined && existing && existing.project_id !== projectId) wpId = null;

    const values: Values = { project_id: projectId };
    assign(values, 'work_package_id', wpId, true);
    assign(values, 'title', title, false);
    assign(values, 'status', status, false);
    assign(values, 'priority', priority, false);
    assign(values, 'due_date', dueDate, true);
    assign(values, 'estimated_hours', hours, true);
    assign(values, 'estimated_pomodoros', pomodoros, true);
    assign(values, 'notes', notes === null ? '' : notes, false);
    const parents: Parent[] = [{ table: 'projects', id: projectId }];
    if (wpId) parents.push({ table: 'work_packages', id: wpId });
    return { values, parents };
  }

  private buildTimeLog(ctx: RowCtx, existing: TimeLog | undefined): DraftBody | null {
    // Projekt (Pflicht für neue Zeilen; leer bei bestehenden = ohne Projekt)
    const codeText = readText(ctx, 'project_code');
    let projectId: string | null = null;
    // Zeiteinträge sind Historie: Verweise auf gelöschte Projekte/Arbeitspakete bleiben gültig
    const history = (id: string | null | undefined) => ({ id, keepDeleted: true });
    if (codeText) projectId = this.link(ctx, 'project_code', codeText, 'projects', '', history(existing?.project_id)) ?? null;
    else if (!existing) ctx.error('project_code', 'Projekt_Code fehlt (Pflicht für neue Zeiteinträge)');
    // Verweis auf ein Projekt, das im Datenbestand fehlt (Export zeigt dann keinen Code): beibehalten
    else if (this.dangling('projects', existing.project_id)) projectId = existing.project_id;

    // Arbeitspaket
    const apText = readText(ctx, 'ap_code');
    let wpId: string | null | undefined = apText === undefined ? undefined : null;
    if (apText) {
      if (projectId) {
        wpId = this.link(ctx, 'ap_code', apText, 'work_packages', projectId, history(existing?.work_package_id)) ?? null;
      } else if (!ctx.failed) ctx.error('ap_code', `AP_Code «${apText}» ohne Projekt_Code`);
    }
    const projectChanged = !existing || projectId !== existing.project_id;
    if (wpId === undefined && projectChanged) wpId = null;
    if (apText === null && !projectChanged && this.dangling('work_packages', existing?.work_package_id)) {
      wpId = existing!.work_package_id;
    }

    // Task: Task_ID hat Vorrang vor der Titel-Referenz
    const taskIdText = readText(ctx, 'task_id');
    const taskTitle = readText(ctx, 'task_title');
    let taskId: string | null | undefined = taskIdText === undefined && taskTitle === undefined ? undefined : null;
    let pendingTitle: string | null = null;
    if (taskIdText) {
      taskId = this.taskById(ctx, taskIdText, projectId, codeText ?? null, existing);
    } else if (taskTitle) {
      if (!projectId) {
        if (!ctx.failed) ctx.error('task_title', 'Task_Titel_Referenz ohne Projekt_Code');
      } else {
        const found = this.currentTask(existing, projectId, projectChanged, taskTitle)
          ?? this.taskByTitle(ctx, projectId, wpId ?? null, taskTitle);
        if (found) taskId = found;
        else pendingTitle = taskTitle;
      }
    } else if (taskIdText === undefined && taskTitle === null && !projectChanged && this.dangling('tasks', existing?.task_id)) {
      // Ohne Spalte Task_ID: Verweis auf einen Task, der im Datenbestand fehlt (Export zeigt keinen Titel), beibehalten
      taskId = existing!.task_id;
    }

    const mode = readWith(ctx, 'log_mode', (v) => parseEnum(v, 'timeLogMode'));
    const date = readWith(ctx, 'date', parseDate);
    const startSec = readWith(ctx, 'start_time', parseTime);
    const endSec = readWith(ctx, 'end_time', parseTime);
    const minutes = readNumber(ctx, 'duration_minutes');
    const comment = readText(ctx, 'comment');
    if (date === null) ctx.error('date', 'Datum fehlt (Pflichtfeld)');
    if (startSec === null) ctx.error('start_time', 'Startzeit fehlt (Pflichtfeld)');
    const endMissing = endSec === null || (endSec === undefined && !ctx.has('end_time'));
    const minutesMissing = minutes === null || (minutes === undefined && !ctx.has('duration_minutes'));
    if (endMissing && minutesMissing) ctx.error('end_time', 'Endzeit oder Dauer_Minuten fehlt');
    if (ctx.failed || !date || startSec === null || startSec === undefined) return null;

    // Zeitpunkte: unverändert dargestellte Werte behalten ihre genauen Sekunden
    const startCandidate = localTimestamp(date, startSec);
    const start = existing && sameMinute(existing.start_time, startCandidate) ? existing.start_time : startCandidate;
    let end: number;
    let duration: number;
    if (endSec !== null && endSec !== undefined) {
      // Endzeit vor der Startzeit = über Mitternacht
      const endCandidate = localTimestamp(date, endSec, endSec < startSec ? 1 : 0);
      end = existing && sameMinute(existing.end_time, endCandidate) ? existing.end_time : endCandidate;
      if (minutes !== null && minutes !== undefined) duration = this.durationSeconds(minutes, existing);
      // Spalte Dauer_Minuten fehlt: bisherige Dauer (z. B. mit Pause) bleibt, solange die Zeitspanne gleich ist
      else if (existing && !ctx.has('duration_minutes') && start === existing.start_time && end === existing.end_time) {
        duration = existing.duration_seconds;
      } else duration = Math.round((end - start) / 1000);
    } else {
      duration = this.durationSeconds(minutes!, existing);
      const endCandidate = start + duration * 1000;
      // Spalte Endzeit fehlt: bisherige Endzeit bleibt, solange Startzeit und Dauer gleich sind
      if (existing && !ctx.has('end_time') && start === existing.start_time && duration === existing.duration_seconds) {
        end = existing.end_time;
      } else end = existing && sameMinute(existing.end_time, endCandidate) ? existing.end_time : endCandidate;
    }

    const timesChanged = !existing || start !== existing.start_time || end !== existing.end_time
      || duration !== existing.duration_seconds;
    if (timesChanged && duration > (end - start) / 1000 + 60) {
      ctx.warn('duration_minutes', 'Dauer_Minuten ist länger als die Zeitspanne von Start- bis Endzeit');
    }
    if (timesChanged && date > this.today) ctx.warn('date', `Datum ${date} liegt in der Zukunft`);

    // Neuer Task aus der Titel-Referenz – erst jetzt, da die Zeile gültig ist
    if (pendingTitle && projectId) {
      const doomed = this.doomedParent([
        { table: 'projects', id: projectId }, ...(wpId ? [{ table: 'work_packages' as const, id: wpId }] : []),
      ]);
      if (doomed) {
        this.warnDoomed(ctx, doomed);
        return null;
      }
      taskId = this.createTaskFromLog(ctx, projectId, wpId ?? null, pendingTitle);
    }

    const values: Values = { start_time: start, end_time: end, duration_seconds: duration };
    if (ctx.has('project_code')) values.project_id = projectId;
    assign(values, 'work_package_id', wpId, true);
    assign(values, 'task_id', taskId, true);
    if (mode) values.mode = mode;
    else if (!existing) values.mode = 'manual';
    assign(values, 'comment', comment === null ? '' : comment, false);
    // Lern- oder Arbeitszeit folgt dem Projekt-Modus (bei neuen Zeilen und Projektwechsel)
    if (projectId && projectChanged) {
      const project = this.state.projects.get(projectId) as Project | undefined;
      if (project) values.workspace = project.mode;
    }
    if (!existing) values.counts_as_pomodoro = values.mode === 'pomodoro';
    return { values, parents: [] };
  }

  /** Dauer in Sekunden; entspricht die Excel-Darstellung (1 Nachkommastelle) der bisherigen, bleibt diese */
  private durationSeconds(minutes: number, existing: TimeLog | undefined): number {
    if (existing && roundTo(existing.duration_seconds / 60, 1) === roundTo(minutes, 1)) return existing.duration_seconds;
    return Math.round(minutes * 60);
  }

  /* ---------- Verweise ---------- */

  /** Projekt einer Zeile in Blatt 2–4 (Pflicht) */
  private refProject(ctx: RowCtx, existing: Milestone | WorkPackage | Task | undefined): string | undefined {
    const code = readText(ctx, 'project_code', true);
    if (!code) return undefined;
    return this.link(ctx, 'project_code', code, 'projects', '', currentLink(existing, existing?.project_id));
  }

  /**
   * Code → ID. Der bisherige Verweis einer bestehenden Zeile bleibt, solange der Code zu ihm passt
   * (aktueller oder bisheriger Code) – so überstehen Verweise auch getauschte Codes. Sonst gilt
   * der Code-Index inkl. Aliasse umbenannter Codes. Fehler werden gemeldet (Rückgabe undefined).
   */
  private link(
    ctx: RowCtx,
    key: ColumnKey,
    code: string,
    table: CodedTable,
    scope: string,
    current: { id: string | null | undefined; keepDeleted: boolean },
  ): string | undefined {
    if (current.id) {
      const now = this.state[table].get(current.id);
      const before = this.original[table].get(current.id);
      const inScope = table === 'projects' || (now as Milestone | WorkPackage | undefined)?.project_id === scope;
      const matches = (r: AnyRow | undefined) => !!r && sameCode(this.codeOf(table, r), code);
      if (now && inScope && (!now.is_deleted || current.keepDeleted) && (matches(now) || matches(before))) return now.id;
    }
    const index = table === 'projects' ? this.projectCodes : table === 'milestones' ? this.milestoneCodes : this.workPackageCodes;
    const where = table === 'projects' ? '' : this.inProject(scope);
    const id = index.resolve(scope, code);
    if (id === undefined) {
      ctx.error(key, `Unbekannter ${ctx.header(key)} «${code}»${where}`);
      return undefined;
    }
    if (id === null) {
      ctx.error(key, `${ctx.header(key)} «${code}» ist nicht eindeutig${where}`);
      return undefined;
    }
    return id;
  }

  /** Verweis auf eine ID, die im Datenbestand gar nicht vorkommt (z. B. unvollständige Altdaten) */
  private dangling(table: SheetTable, id: string | null | undefined): boolean {
    return !!id && !this.state[table].get(id);
  }

  private inProject(projectId: string): string {
    const p = this.state.projects.get(projectId) as Project | undefined;
    return p ? ` im Projekt «${p.project_code}»` : '';
  }

  /** Meilensteine und Arbeitspakete bleiben in ihrem Projekt (ihre Kinder hängen daran) */
  private checkSameProject(ctx: RowCtx, existing: Milestone | WorkPackage | undefined, projectId: string, what: string): boolean {
    if (!existing || existing.is_deleted || existing.project_id === projectId) return true;
    ctx.error('project_code', `${what} können nicht in ein anderes Projekt verschoben werden`);
    return false;
  }

  private taskById(
    ctx: RowCtx,
    text: string,
    projectId: string | null,
    projectCode: string | null,
    existing: TimeLog | undefined,
  ): string | null {
    if (!isUuid(text)) {
      ctx.error('task_id', `Ungültige Task_ID «${text}» (erwartet eine UUID)`);
      return null;
    }
    const task = this.state.tasks.get(text) as Task | undefined;
    if (!task) {
      // Bisheriger Verweis auf einen Task, der im Datenbestand fehlt: beibehalten
      if (existing?.task_id && existing.task_id.toLowerCase() === text.toLowerCase()) return existing.task_id;
      ctx.error('task_id', `Unbekannte Task_ID «${text}»`);
      return null;
    }
    const unchangedLink = task.id === existing?.task_id;
    if (task.is_deleted && !unchangedLink) {
      ctx.error('task_id', `Task «${task.title}» ist gelöscht`);
      return null;
    }
    if (projectId && task.project_id !== projectId && !(unchangedLink && projectId === existing?.project_id)) {
      const taskProject = this.state.projects.get(task.project_id) as Project | undefined;
      ctx.warn('task_id', `Task «${task.title}» gehört zum Projekt «${taskProject?.project_code ?? '?'}», `
        + `nicht zu «${projectCode ?? ''}»`);
    }
    return task.id;
  }

  /**
   * Bisher verknüpfter Task, solange die Titel-Referenz zu ihm passt – wie bei Codes behält eine bestehende
   * Zeile ihren Verweis (auch auf gelöschte Tasks, Zeiteinträge sind Historie). Bei einem Projektwechsel
   * nur, wenn der Task zum neuen Projekt gehört.
   */
  private currentTask(existing: TimeLog | undefined, projectId: string, projectChanged: boolean, title: string): string | null {
    const task = this.state.tasks.get(existing?.task_id) as Task | undefined;
    if (!task || titleKey(task.title) !== titleKey(title)) return null;
    return !projectChanged || task.project_id === projectId ? task.id : null;
  }

  /** Task über den Titel im Projekt (bzw. im Arbeitspaket); null = nicht gefunden */
  private taskByTitle(ctx: RowCtx, projectId: string, wpId: string | null, title: string): string | null {
    const key = titleKey(title);
    const matches = (this.state.tasks.alive() as Task[])
      .filter((t) => t.project_id === projectId
        && (wpId === null || t.work_package_id === wpId)
        && titleKey(t.title) === key
        && !this.doomedParent([
          { table: 'tasks', id: t.id },
          { table: 'projects', id: t.project_id },
          ...(t.work_package_id ? [{ table: 'work_packages' as const, id: t.work_package_id }] : []),
        ]))
      // nicht erledigte zuerst, dann die neuesten
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.created_at - a.created_at);
    const best = matches[0];
    if (!best) return null;
    if (matches.length > 1) {
      ctx.warn('task_title', `${matches.length} Tasks mit dem Titel «${title}» gefunden – verknüpft wird `
        + `${best.status === 'done' ? 'der zuletzt angelegte' : 'der zuletzt angelegte nicht erledigte'} (${this.label('tasks', best)})`);
    }
    return best.id;
  }

  private createTaskFromLog(ctx: RowCtx, projectId: string, wpId: string | null, title: string): string {
    const values: Values = { project_id: projectId, work_package_id: wpId, title, status: 'in_progress' };
    const id = this.makeId();
    this.insert(ctx, 'tasks', id, { ...this.defaults('tasks', values), ...values });
    ctx.warn('task_title', `Task «${title}» nicht gefunden – Task neu angelegt (Status in_progress)`);
    return id;
  }

  /* ---------- Übernahme in den Plan ---------- */

  private commit(d: Draft): void {
    const { ctx, table, existing } = d;
    if (ctx.failed) {
      this.skippedRows++;
      return;
    }
    const doomed = this.doomedParent(d.parents);

    if (existing && !existing.is_deleted) {
      const fields = this.diff(table, existing, d.values);
      if (!fields.length) {
        this.unchangedRows++;
        return;
      }
      if (doomed) {
        this.warnDoomed(ctx, doomed);
        this.skippedRows++;
        return;
      }
      const patch: Values = {};
      for (const f of fields) patch[f.field] = f.to;
      Object.assign(patch, this.derived(table, { ...existing, ...patch }, existing));
      this.writes[table].push({ op: 'update', table, id: existing.id, patch });
      const row = { ...existing, ...patch } as AnyRow;
      this.state[table].set(row);
      this.trackRename(table, existing, row);
      this.counts[table].update++;
      this.changes.push({
        table, kind: 'update', id: existing.id, label: this.label(table, row), sheet: ctx.sheet.name, row: ctx.line, fields,
      });
      return;
    }

    if (doomed) {
      this.warnDoomed(ctx, doomed);
      this.skippedRows++;
      return;
    }
    const base = existing ? withoutSyncFields(existing) : this.defaults(table, d.values);
    if (existing) ctx.warn('id', 'Gelöschter Datensatz wird wiederhergestellt');
    else if (d.unknownId) ctx.warn('id', 'Unbekannte ID – Datensatz wird mit dieser ID neu angelegt');
    this.insert(ctx, table, d.id, { ...base, ...d.values }, existing);
  }

  /** Neue (oder wiederhergestellte) Zeile planen */
  private insert(ctx: RowCtx, table: SheetTable, id: string, input: Values, restored?: AnyRow): void {
    Object.assign(input, this.derived(table, input, restored));
    this.writes[table].push({ op: 'create', table, row: { ...input, id } });
    const row = {
      ...input, id, created_at: restored?.created_at ?? this.now, updated_at: this.now, updated_by: PREVIEW_WRITER, is_deleted: false,
    } as unknown as AnyRow;
    this.state[table].set(row);
    this.counts[table].create++;
    this.changes.push({
      table, kind: 'create', id, label: this.label(table, row), sheet: ctx.sheet.name, row: ctx.line,
      ...(restored ? { restored: true } : {}),
    });
  }

  /** Abgeleitete Felder: completed_at folgt dem Task-Status */
  private derived(table: SheetTable, next: Values, prev: AnyRow | undefined): Values {
    if (table !== 'tasks') return {};
    if (next.status === 'done') {
      return next.completed_at ? {} : { completed_at: (prev as Task | undefined)?.completed_at || this.now };
    }
    return next.completed_at != null ? { completed_at: null } : {};
  }

  private diff(table: SheetTable, existing: AnyRow, values: Values): FieldChange[] {
    const cur = existing as unknown as Values;
    const out: FieldChange[] = [];
    for (const [field, to] of Object.entries(values)) {
      const from = cur[field] ?? null;
      if (sameField(field, from, to)) continue;
      const column = FIELD_COLUMNS[table][field];
      out.push({ field, ...(column ? { column } : {}), from, to });
    }
    return out;
  }

  private defaults(table: SheetTable, v: Values): Values {
    const nextSort = (match: (r: AnyRow) => boolean): number => {
      const orders = this.state[table].alive().filter(match).map((r) => (r as { sort_order?: number }).sort_order ?? 0);
      return orders.length ? Math.max(...orders) + 1 : 0;
    };
    const sameProject = (r: AnyRow) => (r as Milestone).project_id === v.project_id;
    switch (table) {
      case 'projects': {
        const count = this.state.projects.alive().length;
        return {
          project_code: '', name: '', mode: 'study', status: 'active', color: PROJECT_COLORS[count % PROJECT_COLORS.length],
          planned_hours: null, start_date: null, end_date: null, notes: '', sort_order: nextSort(() => true),
        };
      }
      case 'milestones':
        return {
          project_id: v.project_id, ms_code: '', title: '', target_date: null, status: 'open', notes: '',
          sort_order: nextSort(sameProject),
        };
      case 'work_packages':
        return {
          project_id: v.project_id, milestone_id: null, ap_code: '', title: '', planned_hours: null, start_date: null,
          end_date: null, notes: '', sort_order: nextSort(sameProject),
        };
      case 'tasks':
        return {
          project_id: v.project_id, work_package_id: null, title: '', status: 'todo', priority: 'medium', due_date: null,
          estimated_hours: null, estimated_pomodoros: null, notes: '', completed_at: null,
          sort_order: nextSort((r) => sameProject(r) && ((r as Task).work_package_id ?? null) === (v.work_package_id ?? null)),
        };
      case 'time_logs':
        return {
          project_id: null, work_package_id: null, task_id: null, workspace: 'study', mode: 'manual',
          start_time: 0, end_time: 0, duration_seconds: 0, counts_as_pomodoro: false, comment: '',
        };
    }
  }

  /* ---------- Codes ---------- */

  private scopeOf(table: CodedTable, row: AnyRow): string {
    return table === 'projects' ? '' : (row as Milestone | WorkPackage).project_id;
  }

  private codeOf(table: CodedTable, row: AnyRow): string {
    return String((row as unknown as Values)[CODE_FIELD[table]] ?? '');
  }

  /**
   * Eindeutigkeit der Codes im Endzustand: doppelte Codes im Blatt → Fehler in der späteren Zeile;
   * Codes, die ein anderer (vom Blatt nicht geänderter) Datensatz trägt → Fehler. Wiederholt, bis
   * stabil, weil eine abgelehnte Umbenennung ihren alten Code weiter belegt.
   */
  private ensureUniqueCodes(table: CodedTable, drafts: Draft[], column: ColumnKey): void {
    const header = headerOf(table, column);
    const key = (scope: string, code: string) => `${scope}\u0000${codeKey(code)}`;

    const firstRow = new Map<string, number>();
    for (const d of drafts) {
      if (d.ctx.failed || !d.code) continue;
      const k = key(d.scope ?? '', d.code);
      const first = firstRow.get(k);
      if (first !== undefined) d.ctx.error(column, `Doppelter ${header} «${d.code}» (bereits in Zeile ${first})`);
      else firstRow.set(k, d.ctx.line);
    }

    for (let changed = true; changed;) {
      changed = false;
      const claimed = new Set(drafts.filter((d) => !d.ctx.failed).map((d) => d.id));
      const others = new Map<string, AnyRow>();
      for (const r of this.state[table].alive()) {
        if (claimed.has(r.id) || this.deleting[table].has(r.id)) continue;
        const k = key(this.scopeOf(table, r), this.codeOf(table, r));
        if (!others.has(k)) others.set(k, r);
      }
      for (const d of drafts) {
        if (d.ctx.failed || !d.code) continue;
        const other = others.get(key(d.scope ?? '', d.code));
        if (other && other.id !== d.id) {
          d.ctx.error(column, `${header} «${d.code}» ist bereits vergeben (${SHEETS[table].singular} «${this.label(table, other)}»)`);
          changed = true;
        }
      }
    }
  }

  /** Neue Projekte ohne Code: Code aus dem Namen erzeugen (Warnung) */
  private generateProjectCodes(drafts: Draft[]): void {
    const taken = new Set<string>();
    const claimed = new Set<string>();
    for (const d of drafts) {
      if (d.ctx.failed) continue;
      claimed.add(d.id);
      if (d.code) taken.add(codeKey(d.code));
    }
    for (const p of this.state.projects.alive() as Project[]) {
      if (!claimed.has(p.id) && !this.deleting.projects.has(p.id)) taken.add(codeKey(p.project_code));
    }
    for (const d of drafts) {
      if (d.ctx.failed || d.code) continue;
      const code = codeFromName(String(d.values.name ?? ''), taken);
      taken.add(codeKey(code));
      d.code = code;
      d.values.project_code = code;
      d.ctx.warn('project_code', `Projekt_Code fehlt – «${code}» wird aus dem Namen erzeugt`);
    }
  }

  private trackRename(table: SheetTable, before: AnyRow, after: AnyRow): void {
    if (table !== 'projects' && table !== 'milestones' && table !== 'work_packages') return;
    const from = this.codeOf(table, before);
    const to = this.codeOf(table, after);
    if (from && codeKey(from) !== codeKey(to)) this.renamed[table].push({ scope: this.scopeOf(table, before), code: from, id: before.id });
  }

  /** Code-Index nach Abschluss eines Blatts: aktuelle Codes, dann Codes zu löschender Zeilen, dann Aliasse */
  private buildIndex(table: CodedTable): CodeIndex {
    const index = new CodeIndex();
    const rows = this.state[table].alive();
    const del = this.deleting[table];
    for (const r of rows) if (!del.has(r.id)) index.add(this.scopeOf(table, r), this.codeOf(table, r), r.id);
    for (const r of rows) if (del.has(r.id)) index.add(this.scopeOf(table, r), this.codeOf(table, r), r.id, true);
    for (const a of this.renamed[table]) index.addAlias(a.scope, a.code, a.id);
    return index;
  }

  /* ---------- Löschungen ---------- */

  private doomedParent(parents: readonly Parent[]): Parent | undefined {
    return parents.find((p) => this.deleting[p.table].has(p.id));
  }

  private warnDoomed(ctx: RowCtx, parent: Parent): void {
    const row = this.state[parent.table].get(parent.id);
    const name = row ? this.label(parent.table, row) : parent.id;
    ctx.warn(null, `${SHEETS[parent.table].singular} «${name}» wird gelöscht – Zeile wird nicht übernommen`);
  }

  /** Mitbetroffene Zeilen der Kaskade (wie Repository.deleteCascade; Zeiteinträge bleiben erhalten) */
  private cascade(): CascadeCounts {
    const projects = this.deleting.projects;
    const milestones = new Set(this.deleting.milestones);
    const workPackages = new Set(this.deleting.work_packages);
    const tasks = new Set(this.deleting.tasks);
    for (const m of this.state.milestones.alive() as Milestone[]) if (projects.has(m.project_id)) milestones.add(m.id);
    for (const w of this.state.work_packages.alive() as WorkPackage[]) if (projects.has(w.project_id)) workPackages.add(w.id);
    for (const t of this.state.tasks.alive() as Task[]) {
      if (projects.has(t.project_id) || (t.work_package_id && workPackages.has(t.work_package_id))) tasks.add(t.id);
    }
    const unlinked = (this.state.work_packages.alive() as WorkPackage[])
      .filter((w) => !workPackages.has(w.id) && w.milestone_id && milestones.has(w.milestone_id)).length;
    return {
      milestones: milestones.size - this.deleting.milestones.size,
      work_packages: workPackages.size - this.deleting.work_packages.size,
      tasks: tasks.size - this.deleting.tasks.size,
      unlinkedWorkPackages: unlinked,
    };
  }

  /* ---------- Ausgabe ---------- */

  private label(table: SheetTable, row: AnyRow): string {
    const projectCode = (id: string | null) => (id ? (this.state.projects.get(id) as Project | undefined)?.project_code ?? '?' : '');
    switch (table) {
      case 'projects': {
        const p = row as Project;
        return `${p.project_code} · ${p.name}`;
      }
      case 'milestones': {
        const m = row as Milestone;
        return `${projectCode(m.project_id)}/${m.ms_code} · ${m.title}`;
      }
      case 'work_packages': {
        const w = row as WorkPackage;
        return `${projectCode(w.project_id)}/${w.ap_code} · ${w.title}`;
      }
      case 'tasks': {
        const t = row as Task;
        const wp = this.state.work_packages.get(t.work_package_id) as WorkPackage | undefined;
        return `${projectCode(t.project_id)}${wp ? `/${wp.ap_code}` : ''} · ${t.title}`;
      }
      case 'time_logs': {
        const l = row as TimeLog;
        const when = `${localDateOf(l.start_time)} ${formatTime(localSecondsOf(l.start_time))}–${formatTime(localSecondsOf(l.end_time))}`;
        return `${l.project_id ? projectCode(l.project_id) : 'Ohne Projekt'} · ${when}`;
      }
    }
  }

  /** Meldungen nach Blattreihenfolge und Zeile (stabil innerhalb einer Zeile) */
  private sortedIssues(): ImportIssue[] {
    const all = [...this.parsed.issues, ...this.issues];
    const sheetIndex = new Map<string, number>(SHEET_TABLES.map((t, i) => [this.parsed.sheets[t]?.name ?? SHEETS[t].name, i]));
    const rank = (i: ImportIssue) => (i.sheet === '' ? -1 : sheetIndex.get(i.sheet) ?? SHEET_TABLES.length);
    return all
      .map((issue, order) => ({ issue, order }))
      .sort((a, b) => rank(a.issue) - rank(b.issue) || a.issue.row - b.issue.row || a.order - b.order)
      .map((x) => x.issue);
  }
}

/**
 * Plant den Import einer eingelesenen Arbeitsmappe gegen den Datenbestand
 * (`snapshot` inkl. gelöschter Zeilen). Reine Funktion – schreibt nichts.
 */
export function planWorkbookImport(parsed: ParsedWorkbook, snapshot: PlannerSnapshot, opts: PlanOptions = {}): PlanResult {
  return new ImportPlanner(parsed, snapshot, opts).run();
}
