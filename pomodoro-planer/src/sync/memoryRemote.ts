/**
 * In-Memory-Nachbildung des Supabase-Backends für Tests und Offline-Entwicklung.
 *
 * MemoryServer = die Datenbank eines Nutzers (von mehreren Geräten geteilt).
 * MemoryRemote = Verbindung eines Geräts (RemoteStore) mit Online-Schalter.
 *
 * Nachgebildete SQL-Semantik
 * - server_updated_at wird bei jedem angenommenen Schreibvorgang vergeben, streng steigend
 *   (ISO-Strings mit Mikrosekunden-Zähler). Optional wie Postgres now() ein Zeitstempel je
 *   Transaktion (alle Zeilen eines Push teilen ihn) – prüft die id als Tie-Breaker im Keyset.
 * - LWW-Trigger: Schreibvorgänge mit (updated_at, updated_by) < gespeicherter Version werden
 *   still verworfen und trotzdem als ok gemeldet (wie ein BEFORE-Trigger mit RETURN NULL).
 *   Gleichstand gilt wie in supabase/schema.sql als Wiederholung und wird übernommen.
 *   created_at bleibt bei Updates erhalten (vom Trigger festgehalten).
 * - Eindeutige Codes, case-insensitive unter nicht gelöschten Zeilen: project_code je Nutzer,
 *   ms_code und ap_code je Projekt → unique_violation mit column.
 * - Fremdschlüssel: referenzierte Elternzeile muss existieren (auch soft-gelöscht) → foreign_key.
 * - CHECK-Constraints für Aufzählungen und Zeitspannen → check.
 * - Realtime: angenommene Änderungen werden an die Abos der ANDEREN Geräte gemeldet.
 */
import {
  MILESTONE_STATUSES, PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TIME_LOG_MODES, WORKSPACES,
  type ActiveTimerState, type AnyEntity, type EntityMap, type EntityTable, type UserSettings,
} from '../data/types';
import { isNewer } from './hlc';
import {
  RemoteError, isoToMicros, microsToIso,
  type PullCursor, type PullPage, type PushResult, type RejectReason, type RemoteHandlers, type RemoteStore,
  type RemoteTable,
} from './remote';

interface StoredRow {
  row: AnyEntity;
  micros: number;
  serverUpdatedAt: string;
}

type Rejection = { reason: RejectReason; column?: string; detail?: string };
type WriteOutcome = { status: 'applied' | 'ignored' } | ({ status: 'rejected' } & Rejection);

/** Fremdschlüssel je Tabelle: Spalte → referenzierte Tabelle */
const FOREIGN_KEYS: Record<EntityTable, Record<string, EntityTable>> = {
  projects: {},
  milestones: { project_id: 'projects' },
  work_packages: { project_id: 'projects', milestone_id: 'milestones' },
  tasks: { project_id: 'projects', work_package_id: 'work_packages' },
  time_logs: { project_id: 'projects', work_package_id: 'work_packages', task_id: 'tasks' },
  planned_blocks: { project_id: 'projects', work_package_id: 'work_packages', task_id: 'tasks' },
};

/** Eindeutige Codes: Spalte und optionale Gruppierungsspalte (sonst je Nutzer) */
const UNIQUE_CODES: Partial<Record<EntityTable, { column: string; scope?: string }>> = {
  projects: { column: 'project_code' },
  milestones: { column: 'ms_code', scope: 'project_id' },
  work_packages: { column: 'ap_code', scope: 'project_id' },
};

/** CHECK-Constraints auf Aufzählungen */
const ENUM_CHECKS: Partial<Record<EntityTable, Record<string, readonly string[]>>> = {
  projects: { mode: WORKSPACES, status: PROJECT_STATUSES },
  milestones: { status: MILESTONE_STATUSES },
  tasks: { status: TASK_STATUSES, priority: TASK_PRIORITIES },
  time_logs: { workspace: WORKSPACES, mode: TIME_LOG_MODES },
  planned_blocks: { workspace: WORKSPACES },
};

export interface MemoryServerOptions {
  userId?: string;
  /** Serveruhr (Epoch-ms); Standard Date.now */
  now?: () => number;
  /** true: ein server_updated_at je Push-Aufruf (wie now() je Transaktion in Postgres) */
  transactionTimestamps?: boolean;
}

export class MemoryServer {
  readonly userId: string;
  /** Zähler für Tests */
  readonly stats = { push: 0, pull: 0, pushedRows: 0 };
  private readonly now: () => number;
  private readonly transactionTimestamps: boolean;
  private lastMicros = 0;
  private readonly tables = new Map<EntityTable, Map<string, StoredRow>>();
  private settings: UserSettings | null = null;
  private timer: ActiveTimerState | null = null;
  private readonly subscribers = new Set<{ client: MemoryRemote; handlers: RemoteHandlers }>();

  constructor(opts: MemoryServerOptions = {}) {
    this.userId = opts.userId ?? 'user-1';
    this.now = opts.now ?? Date.now;
    this.transactionTimestamps = opts.transactionTimestamps ?? false;
  }

  /** Aktuelle Serverzeit ohne Zeitstempel zu verbrauchen */
  serverNow(): string {
    return microsToIso(Math.max(this.now() * 1000, this.lastMicros));
  }

  private issueMicros(): number {
    this.lastMicros = Math.max(this.now() * 1000, this.lastMicros + 1);
    return this.lastMicros;
  }

  private table(name: EntityTable): Map<string, StoredRow> {
    let t = this.tables.get(name);
    if (!t) { t = new Map(); this.tables.set(name, t); }
    return t;
  }

  /** Mehrere Zeilen wie ein Upsert-Statement schreiben (zeilenweise Ergebnis wie beim Einzelzeilen-Fallback). */
  writeRows<K extends EntityTable>(table: K, rows: EntityMap[K][], origin: MemoryRemote | null): PushResult {
    this.stats.push++;
    this.stats.pushedRows += rows.length;
    const result: PushResult = { ok: [], rejected: [] };
    const txMicros = this.transactionTimestamps ? this.issueMicros() : null;
    const writers = new Set<string>();
    for (const input of rows) {
      const outcome = this.writeRow(table, input, txMicros ?? undefined);
      if (outcome.status === 'rejected') {
        const { status: _status, ...rejection } = outcome;
        result.rejected.push({ id: input.id, ...rejection });
      } else {
        result.ok.push({ id: input.id, updated_at: input.updated_at, updated_by: input.updated_by });
        if (outcome.status === 'applied') writers.add(input.updated_by);
      }
    }
    for (const by of writers) this.notifyChange(table, origin, by);
    return result;
  }

  /**
   * Zeile "verspätet" einfügen: server_updated_at liegt `ageMs` vor dem zuletzt vergebenen
   * Zeitstempel – wie eine lange Transaktion, deren now() vor dem Pull eines Geräts lag,
   * die aber erst danach sichtbar wurde.
   */
  injectLate<K extends EntityTable>(table: K, row: EntityMap[K], ageMs: number): string {
    const micros = this.lastMicros - Math.round(ageMs * 1000);
    const outcome = this.writeRow(table, row, micros);
    if (outcome.status === 'rejected') throw new Error(`injectLate abgelehnt: ${outcome.reason}`);
    this.notifyChange(table, null, row.updated_by);
    return microsToIso(micros);
  }

  private writeRow<K extends EntityTable>(table: K, input: EntityMap[K], micros?: number): WriteOutcome {
    const row = sanitize(input);
    const tbl = this.table(table);
    const existing = tbl.get(row.id);
    // BEFORE-UPDATE-Trigger: veraltete Versionen still verwerfen (Gleichstand = Wiederholung)
    if (existing && isNewer(existing.row, row)) return { status: 'ignored' };

    const rejection = this.checkRow(table, row);
    if (rejection) return { status: 'rejected', ...rejection };

    // Wie der Trigger: created_at bleibt bei Updates erhalten
    if (existing) row.created_at = existing.row.created_at;
    const m = micros ?? this.issueMicros();
    tbl.set(row.id, { row, micros: m, serverUpdatedAt: microsToIso(m) });
    return { status: 'applied' };
  }

  private checkRow(table: EntityTable, row: AnyEntity): Rejection | null {
    const r = row as unknown as Record<string, unknown>;

    for (const [column, allowed] of Object.entries(ENUM_CHECKS[table] ?? {})) {
      if (!allowed.includes(String(r[column]))) {
        return { reason: 'check', column, detail: `${table}_${column}_check` };
      }
    }
    if ((table === 'time_logs' || table === 'planned_blocks') && Number(r.end_time) < Number(r.start_time)) {
      return { reason: 'check', column: 'end_time', detail: `${table}_time_range_check` };
    }

    for (const [column, parent] of Object.entries(FOREIGN_KEYS[table])) {
      const ref = r[column];
      if (ref == null) continue;
      if (!this.table(parent).has(String(ref))) {
        return { reason: 'foreign_key', column, detail: `Key (${column})=(${String(ref)}) is not present in table "${parent}".` };
      }
    }

    const unique = UNIQUE_CODES[table];
    if (unique && !row.is_deleted) {
      const code = String(r[unique.column] ?? '').toLowerCase();
      for (const other of this.table(table).values()) {
        const o = other.row as unknown as Record<string, unknown>;
        if (other.row.id === row.id || other.row.is_deleted) continue;
        if (unique.scope && o[unique.scope] !== r[unique.scope]) continue;
        if (String(o[unique.column] ?? '').toLowerCase() === code) {
          return { reason: 'unique_violation', column: unique.column, detail: `Key (lower(${unique.column}))=(${code}) already exists.` };
        }
      }
    }
    return null;
  }

  /** Seite des Änderungsstroms, aufsteigend nach (server_updated_at, id), after exklusiv */
  readPage<K extends EntityTable>(table: K, after: PullCursor | null, limit: number): PullPage<K> {
    this.stats.pull++;
    const afterMicros = after ? isoToMicros(after.ts) : null;
    const sorted = [...this.table(table).values()].sort(
      (a, b) => a.micros - b.micros || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
    );
    const page = sorted
      .filter((s) => afterMicros === null || s.micros > afterMicros || (s.micros === afterMicros && s.row.id > after!.id))
      .slice(0, Math.max(0, limit));
    const last = page[page.length - 1];
    return {
      rows: page.map((s) => structuredClone(s.row) as EntityMap[K]),
      last: last ? { ts: last.serverUpdatedAt, id: last.row.id } : null,
    };
  }

  /** Gespeicherte Zeilen (für Assertions in Tests) */
  rows<K extends EntityTable>(table: K): EntityMap[K][] {
    return [...this.table(table).values()].map((s) => structuredClone(s.row) as EntityMap[K]);
  }

  row<K extends EntityTable>(table: K, id: string): EntityMap[K] | undefined {
    const s = this.table(table).get(id);
    return s ? (structuredClone(s.row) as EntityMap[K]) : undefined;
  }

  serverUpdatedAt(table: EntityTable, id: string): string | undefined {
    return this.table(table).get(id)?.serverUpdatedAt;
  }

  /* ---------- user_settings / active_timer_state (PK user_id) ---------- */

  readSettings(): UserSettings | null {
    return this.settings ? structuredClone(this.settings) : null;
  }

  writeSettings(input: UserSettings, origin: MemoryRemote | null): boolean {
    const next = { ...structuredClone(input), id: this.userId };
    if (this.settings && isNewer(this.settings, next)) return false;
    this.settings = next;
    this.notifyChange('user_settings', origin, next.updated_by);
    return true;
  }

  readTimer(): ActiveTimerState | null {
    return this.timer ? structuredClone(this.timer) : null;
  }

  writeTimer(input: ActiveTimerState, origin: MemoryRemote | null): boolean {
    const next = { ...structuredClone(input), id: this.userId };
    if (this.timer && isNewer(this.timer, next)) return false;
    this.timer = next;
    // Wie bei Supabase: Timer-Änderungen kommen als onTimer mit Nutzlast, nicht als onChange
    for (const sub of this.subscribers) {
      if (sub.client === origin || !sub.client.online) continue;
      const copy = structuredClone(next);
      queueMicrotask(() => { if (this.subscribers.has(sub)) sub.handlers.onTimer?.(copy); });
    }
    return true;
  }

  /* ---------- Realtime ---------- */

  addSubscriber(client: MemoryRemote, handlers: RemoteHandlers): () => void {
    const sub = { client, handlers };
    this.subscribers.add(sub);
    return () => { this.subscribers.delete(sub); };
  }

  private notifyChange(table: RemoteTable, origin: MemoryRemote | null, by: string): void {
    for (const sub of this.subscribers) {
      if (sub.client === origin || !sub.client.online) continue;
      queueMicrotask(() => { if (this.subscribers.has(sub)) sub.handlers.onChange?.(table, by); });
    }
  }
}

/** Entfernt lokale Felder und Server-Felder wie toRemoteRow und kopiert die Zeile. */
function sanitize<T extends AnyEntity>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k.startsWith('_') || k === 'user_id' || k === 'server_updated_at') continue;
    out[k] = v;
  }
  return structuredClone(out) as T;
}

/**
 * Verbindung eines Geräts zum MemoryServer. `online = false` simuliert Funkloch bzw.
 * Server-Ausfall (RemoteError 'network'), `signedIn = false` eine abgelaufene Anmeldung.
 */
export class MemoryRemote implements RemoteStore {
  readonly kind = 'memory' as const;
  private _online = true;
  signedIn = true;
  private readonly statusHandlers = new Set<RemoteHandlers>();

  constructor(readonly server: MemoryServer) {}

  get online(): boolean {
    return this._online;
  }

  /** Verbindung umschalten; Realtime-Abos erhalten onStatus wie bei Supabase. */
  setOnline(value: boolean): void {
    if (this._online === value) return;
    this._online = value;
    for (const h of this.statusHandlers) {
      queueMicrotask(() => { if (this.statusHandlers.has(h)) h.onStatus?.(value); });
    }
  }

  private async ensureReachable(): Promise<void> {
    await Promise.resolve(); // wie ein echter Netzwerkaufruf immer asynchron
    if (!this._online) throw new RemoteError('network', 'Server nicht erreichbar (simuliert).');
    if (!this.signedIn) throw new RemoteError('auth', 'Nicht angemeldet.');
  }

  async isSignedIn(): Promise<boolean> {
    return this.signedIn;
  }

  async userId(): Promise<string | null> {
    return this.signedIn ? this.server.userId : null;
  }

  async serverNow(): Promise<string> {
    await this.ensureReachable();
    return this.server.serverNow();
  }

  async push<K extends EntityTable>(table: K, rows: EntityMap[K][]): Promise<PushResult> {
    await this.ensureReachable();
    return this.server.writeRows(table, rows, this);
  }

  async pull<K extends EntityTable>(table: K, after: PullCursor | null, limit: number): Promise<PullPage<K>> {
    await this.ensureReachable();
    return this.server.readPage(table, after, limit);
  }

  async getSettings(): Promise<UserSettings | null> {
    await this.ensureReachable();
    return this.server.readSettings();
  }

  async putSettings(settings: UserSettings): Promise<void> {
    await this.ensureReachable();
    this.server.writeSettings(settings, this);
  }

  async getTimer(): Promise<ActiveTimerState | null> {
    await this.ensureReachable();
    return this.server.readTimer();
  }

  async putTimer(state: ActiveTimerState): Promise<void> {
    await this.ensureReachable();
    this.server.writeTimer(state, this);
  }

  subscribe(handlers: RemoteHandlers): () => void {
    const remove = this.server.addSubscriber(this, handlers);
    this.statusHandlers.add(handlers);
    if (this._online) queueMicrotask(() => { if (this.statusHandlers.has(handlers)) handlers.onStatus?.(true); });
    return () => {
      remove();
      this.statusHandlers.delete(handlers);
    };
  }
}
