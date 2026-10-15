/**
 * RemoteStore auf Basis von Supabase (@supabase/supabase-js v2).
 *
 * Erwartetes Server-Schema (siehe Supabase-Migrationen):
 * - Je Entitätstabelle (Namen wie ENTITY_TABLES) dieselben Spalten wie lokal, dazu
 *   user_id (Default auth.uid(), RLS) und server_updated_at (vom Trigger gesetzt).
 * - LWW-Trigger: Upserts mit (updated_at, updated_by) < gespeicherter Version werden still
 *   verworfen und erscheinen daher nicht im RETURNING (Gleichstand = Wiederholung, übernommen).
 * - user_settings und active_timer_state mit Primärschlüssel user_id.
 * - RPC server_now() liefert die Serverzeit.
 */
import {
  createClient, isAuthError, isAuthRetryableFetchError,
  type RealtimeChannel, type SupabaseClient,
} from '@supabase/supabase-js';
import {
  ENTITY_TABLES, TIMESTAMP_COLUMNS,
  type ActiveTimerState, type AnyEntity, type EntityMap, type EntityTable, type UserSettings,
} from '../data/types';
import {
  RemoteError, isoToMs, msToIso,
  type PullCursor, type PullPage, type PushResult, type RejectReason, type RemoteHandlers, type RemoteStore,
} from './remote';

/* ---------- Client und Anmeldung (E-Mail-Code) ---------- */

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** Sendet einen Anmeldecode per E-Mail; legt das Konto bei Bedarf an. */
export async function sendLoginCode(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw mapAuthError(error);
}

/** Prüft den Code aus der E-Mail; danach besteht eine gespeicherte Sitzung. */
export async function verifyLoginCode(client: SupabaseClient, email: string, code: string): Promise<void> {
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw mapAuthError(error);
  if (!data.session) throw new RemoteError('auth', 'Anmeldung fehlgeschlagen – bitte neuen Code anfordern.');
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw mapAuthError(error);
}

/** Fehler von Supabase Auth in einen RemoteError mit deutscher Meldung übersetzen. */
export function mapAuthError(error: unknown): RemoteError {
  if (isAuthRetryableFetchError(error)) {
    return new RemoteError('network', 'Keine Verbindung zum Server – bitte später erneut versuchen.', { cause: error });
  }
  if (isAuthError(error)) {
    if (error.status === 429) return new RemoteError('auth', 'Zu viele Versuche – bitte einen Moment warten.', { cause: error });
    if (error.code === 'otp_expired' || /otp|token/i.test(error.message)) {
      return new RemoteError('auth', 'Der Code ist ungültig oder abgelaufen.', { cause: error });
    }
    return new RemoteError('auth', `Anmeldung fehlgeschlagen: ${error.message}`, { cause: error });
  }
  return new RemoteError('server', `Unerwarteter Fehler bei der Anmeldung: ${String(error)}`, { cause: error });
}

/* ---------- Umwandlung lokale Zeile ↔ Server-Zeile ---------- */

/** Spalten mit numeric/integer-Typ – PostgREST/Realtime können sie als String liefern. */
export const NUMERIC_COLUMNS: Record<EntityTable, readonly string[]> = {
  projects: ['planned_hours', 'sort_order'],
  milestones: ['sort_order'],
  work_packages: ['planned_hours', 'sort_order'],
  tasks: ['estimated_hours', 'estimated_pomodoros', 'sort_order'],
  time_logs: ['duration_seconds'],
  planned_blocks: [],
};

const SETTINGS_TIMESTAMPS = ['updated_at'] as const;
const SETTINGS_NUMERIC = [
  'focus_minutes', 'short_break_minutes', 'long_break_minutes', 'long_break_every', 'daily_goal_minutes',
  'health_red_daily_hours', 'health_yellow_daily_hours', 'milestone_red_daily_hours', 'milestone_yellow_daily_hours',
] as const;
const TIMER_TIMESTAMPS = ['updated_at', 'segment_started_at', 'session_started_at'] as const;
const TIMER_NUMERIC = ['planned_seconds', 'accumulated_ms', 'cycle'] as const;

/** Felder, die nie zum Server gehen: lokale Hilfsfelder, Besitzer (Server setzt auth.uid()) und Server-Cursor */
function isLocalOnly(key: string): boolean {
  return key.startsWith('_') || key === 'user_id' || key === 'server_updated_at';
}

function encode(row: object, timestamps: ReadonlySet<string>, drop: ReadonlySet<string> = new Set()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (isLocalOnly(k) || drop.has(k)) continue;
    out[k] = timestamps.has(k) && typeof v === 'number' ? msToIso(v) : v;
  }
  return out;
}

function decode(raw: Record<string, unknown>, timestamps: ReadonlySet<string>, numeric: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isLocalOnly(k)) continue;
    if (timestamps.has(k)) out[k] = toEpochMs(v);
    else if (numeric.has(k)) out[k] = toNumber(v);
    else out[k] = v;
  }
  return out;
}

function toEpochMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : isoToMs(s);
}

function toNumber(v: unknown): unknown {
  if (v === '') return null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}

const TS_SETS = Object.fromEntries(ENTITY_TABLES.map((t) => [t, new Set(TIMESTAMP_COLUMNS[t])])) as Record<EntityTable, Set<string>>;
const NUM_SETS = Object.fromEntries(ENTITY_TABLES.map((t) => [t, new Set(NUMERIC_COLUMNS[t])])) as Record<EntityTable, Set<string>>;

/** Lokale Zeile → Server-Zeile: ohne _-Felder und user_id, Zeitpunkte als ISO-8601. */
export function toRemoteRow(table: EntityTable, row: AnyEntity | Record<string, unknown>): Record<string, unknown> {
  return encode(row, TS_SETS[table]);
}

/** Server-Zeile → lokale Zeile: Zeitpunkte als Epoch-ms, Zahlen als number, ohne Server-Felder. */
export function fromRemoteRow<K extends EntityTable>(table: K, raw: Record<string, unknown>): EntityMap[K] {
  return decode(raw, TS_SETS[table], NUM_SETS[table]) as unknown as EntityMap[K];
}

/** UserSettings → user_settings-Zeile (ohne id; user_id ergänzt der Aufrufer). */
export function settingsToRemote(s: UserSettings): Record<string, unknown> {
  return encode(s, new Set(SETTINGS_TIMESTAMPS), new Set(['id']));
}

export function settingsFromRemote(raw: Record<string, unknown>): UserSettings {
  const s = decode(raw, new Set(SETTINGS_TIMESTAMPS), new Set(SETTINGS_NUMERIC));
  return { ...s, id: String(raw.user_id ?? raw.id ?? '') } as unknown as UserSettings;
}

/** ActiveTimerState → active_timer_state-Zeile (ohne id; user_id ergänzt der Aufrufer). */
export function timerToRemote(s: ActiveTimerState): Record<string, unknown> {
  return encode(s, new Set(TIMER_TIMESTAMPS), new Set(['id']));
}

export function timerFromRemote(raw: Record<string, unknown>): ActiveTimerState {
  const s = decode(raw, new Set(TIMER_TIMESTAMPS), new Set(TIMER_NUMERIC));
  return { ...s, id: String(raw.user_id ?? raw.id ?? '') } as unknown as ActiveTimerState;
}

/* ---------- Fehler-Mapping ---------- */

export interface PostgrestErrorLike {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

export interface RejectInfo {
  reason: RejectReason;
  column?: string;
  detail?: string;
}

const CODE_COLUMNS = ['project_code', 'ms_code', 'ap_code'] as const;
const CODE_COLUMN_OF: Partial<Record<string, string>> = { projects: 'project_code', milestones: 'ms_code', work_packages: 'ap_code' };
const NON_COLUMN_WORDS = new Set(['lower', 'upper', 'text', 'citext', 'varchar', 'character', 'varying', 'coalesce']);
const NETWORK_PATTERN = /fetch failed|failed to fetch|networkerror|network request failed|load failed|econnrefused|econnreset|enotfound|etimedout|aborterror|socket hang up/i;
const AUTH_CODES = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303']);
/**
 * 42501 mit gültiger Sitzung betrifft eine einzelne Zeile (RLS-Policy, fremde id, Trigger
 * "darf nicht geändert werden") – z. B. eine aus einem anderen Konto importierte id.
 * Ohne Anmeldung lautet die Meldung dagegen "permission denied for table …".
 */
const ROW_LEVEL_DENIAL = /row-level security|darf nicht geändert werden/i;

/**
 * PostgREST-Fehler einordnen:
 * - zeilenbezogene Constraint-Verletzung → RejectInfo (Zeile bleibt lokal dirty)
 * - sonst RemoteError: network (Fetch/Verbindung), auth (fehlende Rechte/JWT/401), server (alles andere)
 * Die Spalte wird bevorzugt aus dem Constraint-Namen gelesen (<tabelle>_<spalte>_fkey|_check|_uidx),
 * weil das Fehlerdetail unter RLS keine Schlüsselwerte enthält.
 */
export function mapPostgrestError(
  error: PostgrestErrorLike,
  opts: { status?: number; table?: string } = {},
): RejectInfo | RemoteError {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const details = error.details ?? '';
  const text = `${message}\n${details}`;
  const status = opts.status;

  if (status === 0 || (!code && NETWORK_PATTERN.test(text))) {
    return new RemoteError('network', 'Server nicht erreichbar.', { cause: error });
  }
  if (code === '42501' && ROW_LEVEL_DENIAL.test(message)) {
    return { reason: 'unknown', detail: message };
  }
  if (AUTH_CODES.has(code) || status === 401 || /\bjwt\b|jws/i.test(text)) {
    return new RemoteError('auth', 'Anmeldung abgelaufen oder keine Berechtigung.', { cause: error });
  }
  const detail = details || message || undefined;
  switch (code) {
    case '23505':
      return withColumn({ reason: 'unique_violation', detail }, uniqueColumn(text, opts.table));
    case '23503':
      return withColumn({ reason: 'foreign_key', detail }, constraintColumn(message, opts.table, 'fkey') ?? keyColumn(details));
    case '23514':
      return withColumn({ reason: 'check', detail }, constraintColumn(message, opts.table, 'check'));
    case '23502':
      return withColumn({ reason: 'check', detail }, quotedColumn(message));
  }
  // Übrige Daten- und Integritätsfehler (Klassen 22/23) betreffen eine einzelne Zeile
  if (/^2[23]/.test(code)) return withColumn({ reason: 'unknown', detail }, quotedColumn(message));
  if (status === 403) return new RemoteError('auth', 'Keine Berechtigung.', { cause: error });
  return new RemoteError('server', message ? `Serverfehler: ${message}` : 'Serverfehler.', { cause: error });
}

function withColumn(info: RejectInfo, column: string | undefined): RejectInfo {
  return column ? { ...info, column } : info;
}

/** Spalte einer Unique-Verletzung: bekannte Code-Spalte, sonst aus "Key (…)=" */
function uniqueColumn(text: string, table?: string): string | undefined {
  const lower = text.toLowerCase();
  const known = CODE_COLUMNS.find((c) => lower.includes(c));
  if (known) return known;
  if (table && CODE_COLUMN_OF[table] && /code/.test(lower)) return CODE_COLUMN_OF[table];
  const cols = keyColumns(text).filter((c) => c !== 'user_id' && c !== 'project_id');
  return cols[0];
}

/** Fachliche Spalte aus "Key (user_id, project_id)=(…) is not present …" */
function keyColumn(details: string): string | undefined {
  return keyColumns(details).find((c) => c !== 'user_id');
}

function keyColumns(text: string): string[] {
  const m = /Key \((.+?)\)=/.exec(text);
  if (!m) return [];
  return m[1]!.split(',').flatMap((part) => {
    const ids = (part.match(/[a-z_][a-z0-9_]*/gi) ?? []).filter((w) => !NON_COLUMN_WORDS.has(w.toLowerCase()));
    return ids.length ? [ids[0]!] : [];
  });
}

const KNOWN_TABLES = [...ENTITY_TABLES, 'user_settings', 'active_timer_state'];

/** Spalte aus einem Constraint-Namen wie "tasks_project_id_fkey" bzw. "projects_color_check" */
function constraintColumn(message: string, table: string | undefined, suffix: string): string | undefined {
  const m = /constraint "([^"]+)"/.exec(message);
  if (!m) return undefined;
  let name = m[1]!;
  const prefix = table ?? KNOWN_TABLES.find((t) => name.startsWith(`${t}_`));
  if (prefix && name.startsWith(`${prefix}_`)) name = name.slice(prefix.length + 1);
  if (name.endsWith(`_${suffix}`)) name = name.slice(0, -(suffix.length + 1));
  return name || undefined;
}

function quotedColumn(message: string): string | undefined {
  return /column "([^"]+)"/.exec(message)?.[1];
}

function toRemoteError(error: PostgrestErrorLike, status: number | undefined, table?: string): RemoteError {
  const mapped = mapPostgrestError(error, { status, table });
  if (mapped instanceof RemoteError) return mapped;
  return new RemoteError('server', `Serverfehler (${mapped.reason}): ${mapped.detail ?? error.message ?? ''}`, { cause: error });
}

/* ---------- Keyset-Pagination ---------- */

/**
 * PostgREST-Filter für "(server_updated_at, id) > cursor". Werte in Anführungszeichen,
 * weil ISO-Zeitstempel ':' und '.' enthalten. Ohne id (Überlappungs-Cursor) genügt
 * server_updated_at >= ts – ein Vergleich id > '' wäre für uuid ungültig.
 */
export function keysetFilter(after: PullCursor): string {
  const ts = `"${after.ts}"`;
  if (!after.id) return `server_updated_at.gte.${ts}`;
  return `server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},id.gt.${after.id})`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------- RemoteStore ---------- */

let subscriptionSeq = 0;

export interface SupabaseRemoteOptions {
  /** Zeilen je Upsert-Aufruf (Standard 500) */
  chunkSize?: number;
}

export class SupabaseRemote implements RemoteStore {
  readonly kind = 'supabase' as const;
  private readonly chunkSize: number;

  constructor(
    private readonly client: SupabaseClient,
    opts: SupabaseRemoteOptions = {},
  ) {
    this.chunkSize = Math.max(1, opts.chunkSize ?? 500);
  }

  /**
   * Gespeicherte Sitzung vorhanden? Ist das Zugriffstoken abgelaufen und scheitert die Erneuerung
   * am Netz, liefert supabase-js session null mit AuthRetryableFetchError – die Sitzung bleibt
   * aber gespeichert und wird erneuert, sobald der Server erreichbar ist. Das gilt als angemeldet.
   */
  async isSignedIn(): Promise<boolean> {
    const { data, error } = await this.client.auth.getSession();
    return data.session !== null || isAuthRetryableFetchError(error);
  }

  /** ID des angemeldeten Nutzers; RemoteError network, wenn die Sitzung nur offline nicht erneuerbar ist. */
  async userId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getSession();
    if (data.session) return data.session.user.id;
    if (isAuthRetryableFetchError(error)) {
      throw new RemoteError('network', 'Server nicht erreichbar – Anmeldung kann nicht erneuert werden.', { cause: error });
    }
    return null;
  }

  private async requireUserId(): Promise<string> {
    const id = await this.userId();
    if (!id) throw new RemoteError('auth', 'Nicht angemeldet.');
    return id;
  }

  async serverNow(): Promise<string> {
    const { data, error, status } = await this.client.rpc('server_now');
    if (error) throw toRemoteError(error, status);
    return String(data);
  }

  async push<K extends EntityTable>(table: K, rows: EntityMap[K][]): Promise<PushResult> {
    const result: PushResult = { ok: [], rejected: [] };
    for (const part of chunk(rows, this.chunkSize)) {
      const { error, status } = await this.upsert(table, part);
      if (!error) {
        // Nicht zurückgegebene Zeilen hat der LWW-Trigger als veraltet verworfen → ebenfalls ok
        for (const r of part) result.ok.push(okEntry(r));
        continue;
      }
      const mapped = mapPostgrestError(error, { status, table });
      if (mapped instanceof RemoteError) throw mapped;
      if (part.length === 1) {
        result.rejected.push({ id: part[0]!.id, ...mapped });
        continue;
      }
      // Ein Statement ist atomar: Einzelzeilen-Fallback isoliert die schuldige(n) Zeile(n)
      for (const r of part) {
        const single = await this.upsert(table, [r]);
        if (!single.error) { result.ok.push(okEntry(r)); continue; }
        const m = mapPostgrestError(single.error, { status: single.status, table });
        if (m instanceof RemoteError) throw m;
        result.rejected.push({ id: r.id, ...m });
      }
    }
    return result;
  }

  private async upsert(table: EntityTable, rows: AnyEntity[]) {
    return this.client
      .from(table)
      .upsert(rows.map((r) => toRemoteRow(table, r)), { onConflict: 'id' })
      .select('id, updated_at, updated_by');
  }

  async pull<K extends EntityTable>(table: K, after: PullCursor | null, limit: number): Promise<PullPage<K>> {
    let query = this.client.from(table).select('*');
    if (after) query = after.id ? query.or(keysetFilter(after)) : query.gte('server_updated_at', after.ts);
    const { data, error, status } = await query
      .order('server_updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);
    if (error) throw toRemoteError(error, status, table);
    const raw = (data ?? []) as Record<string, unknown>[];
    const last = raw[raw.length - 1];
    return {
      rows: raw.map((r) => fromRemoteRow(table, r)),
      last: last ? { ts: String(last.server_updated_at), id: String(last.id) } : null,
    };
  }

  async getSettings(): Promise<UserSettings | null> {
    const uid = await this.requireUserId();
    const { data, error, status } = await this.client.from('user_settings').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw toRemoteError(error, status, 'user_settings');
    return data ? settingsFromRemote(data as Record<string, unknown>) : null;
  }

  async putSettings(settings: UserSettings): Promise<void> {
    const uid = await this.requireUserId();
    const { error, status } = await this.client
      .from('user_settings')
      .upsert({ ...settingsToRemote(settings), user_id: uid }, { onConflict: 'user_id' });
    if (error) throw toRemoteError(error, status, 'user_settings');
  }

  async getTimer(): Promise<ActiveTimerState | null> {
    const uid = await this.requireUserId();
    const { data, error, status } = await this.client.from('active_timer_state').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw toRemoteError(error, status, 'active_timer_state');
    return data ? timerFromRemote(data as Record<string, unknown>) : null;
  }

  async putTimer(state: ActiveTimerState): Promise<void> {
    const uid = await this.requireUserId();
    const { error, status } = await this.client
      .from('active_timer_state')
      .upsert({ ...timerToRemote(state), user_id: uid }, { onConflict: 'user_id' });
    if (error) throw toRemoteError(error, status, 'active_timer_state');
  }

  /**
   * Ein Realtime-Channel mit postgres_changes je Tabelle, gefiltert auf den angemeldeten Nutzer.
   * Der Channel folgt der Anmeldung: Fehlt beim Abonnieren eine (erneuerbare) Sitzung – z. B. beim
   * Start ohne Netz mit abgelaufenem Token oder vor der Anmeldung –, entsteht er, sobald supabase-js
   * eine Sitzung meldet (TOKEN_REFRESHED, SIGNED_IN); beim Abmelden wird er entfernt.
   */
  subscribe(handlers: RemoteHandlers): () => void {
    let channel: RealtimeChannel | null = null;
    let channelUid: string | null = null;
    let closed = false;

    const disconnect = () => {
      if (!channel) return;
      void this.client.removeChannel(channel);
      channel = null;
      channelUid = null;
      handlers.onStatus?.(false);
    };

    const connect = (uid: string) => {
      if (closed || channelUid === uid) return;
      disconnect();
      const filter = `user_id=eq.${uid}`;
      // Eigener Topic je Abo: client.channel() liefert sonst den bereits abonnierten Channel zurück
      const ch = this.client.channel(`planner-sync:${uid}:${++subscriptionSeq}`);
      for (const table of ENTITY_TABLES) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
          handlers.onChange?.(table, writerOf(payload.new));
        });
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter }, (payload) => {
        handlers.onChange?.('user_settings', writerOf(payload.new));
      });
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'active_timer_state', filter }, (payload) => {
        const row = payload.new as Record<string, unknown> | undefined;
        if (payload.eventType === 'DELETE' || !row || !Object.keys(row).length) return;
        let state: ActiveTimerState;
        try {
          state = timerFromRemote(row);
        } catch {
          handlers.onChange?.('active_timer_state'); // unlesbare Nutzlast → Zustand per getTimer() holen
          return;
        }
        handlers.onTimer?.(state);
      });
      channel = ch;
      channelUid = uid;
      ch.subscribe((status) => {
        if (!closed && channel === ch) handlers.onStatus?.(status === 'SUBSCRIBED');
      });
    };

    const { data: auth } = this.client.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) connect(session.user.id);
      else if (event === 'SIGNED_OUT') disconnect();
    });
    void this.userId().then(
      (uid) => {
        if (uid) connect(uid);
        else if (!channel) handlers.onStatus?.(false);
      },
      () => { if (!channel) handlers.onStatus?.(false); },
    );
    return () => {
      closed = true;
      auth.subscription.unsubscribe();
      if (channel) void this.client.removeChannel(channel);
      channel = null;
      channelUid = null;
    };
  }
}

/** updated_by aus einer Realtime-Nutzlast (fehlt bei DELETE) */
function writerOf(row: unknown): string | undefined {
  const by = (row as { updated_by?: unknown } | null | undefined)?.updated_by;
  return typeof by === 'string' ? by : undefined;
}

function okEntry(row: AnyEntity) {
  return { id: row.id, updated_at: row.updated_at, updated_by: row.updated_by };
}
