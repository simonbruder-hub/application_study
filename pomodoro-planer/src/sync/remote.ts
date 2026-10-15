/**
 * Schnittstelle zur entfernten Datenhaltung (Supabase in Produktion, MemoryServer in Tests).
 *
 * Grundsätze
 * - Push: Zeilen aus der lokalen Outbox (_dirty = 1) werden per Upsert übertragen. Der Server
 *   verwirft veraltete Versionen still (Last-Writer-Wins-Trigger) – das gilt als Erfolg, weil
 *   die neuere Server-Version beim nächsten Pull ohnehin ankommt.
 * - Pull: über einen vom SERVER vergebenen Cursor (server_updated_at, id) in aufsteigender
 *   Reihenfolge. Geräteuhren spielen für die Vollständigkeit des Abgleichs keine Rolle.
 * - Entitäten kommen und gehen in lokaler Form (Zeitpunkte als Epoch-ms); die Umwandlung in
 *   die Server-Darstellung ist Sache der jeweiligen Implementierung.
 */
import type { ActiveTimerState, EntityMap, EntityTable, UserSettings } from '../data/types';

/** Position im Änderungsstrom einer Tabelle (Keyset, exklusiv). */
export interface PullCursor {
  /** server_updated_at als ISO-String in voller Präzision vom Server (Mikrosekunden) */
  ts: string;
  /** id der Zeile; '' = alle Zeilen mit server_updated_at >= ts */
  id: string;
}

export interface PushOk {
  id: string;
  updated_at: number;
  updated_by: string;
}

export type RejectReason = 'unique_violation' | 'foreign_key' | 'check' | 'unknown';

export interface PushRejected {
  id: string;
  reason: RejectReason;
  /** Betroffene Spalte, soweit erkennbar (z. B. 'project_code') */
  column?: string;
  detail?: string;
}

export interface PushResult {
  /** Übernommen oder als veraltet still verworfen – beides darf lokal als sauber gelten. */
  ok: PushOk[];
  /** Vom Server abgelehnt (Constraint verletzt) – bleibt lokal dirty. */
  rejected: PushRejected[];
}

export interface PullPage<K extends EntityTable> {
  rows: EntityMap[K][];
  /** Cursor der letzten gelieferten Zeile; null wenn die Seite leer ist */
  last: PullCursor | null;
}

/** Tabellen, zu denen Realtime-Ereignisse gemeldet werden */
export type RemoteTable = EntityTable | 'user_settings' | 'active_timer_state';

export interface RemoteHandlers {
  /**
   * In der Tabelle hat sich etwas geändert → Pull lohnt sich. `by` = updated_by der Zeile,
   * soweit bekannt – damit lässt sich das Echo eigener Änderungen erkennen.
   */
  onChange?(table: RemoteTable, by?: string): void;
  /** Neuer Timer-Zustand eines anderen Geräts (id bereits = user_id). */
  onTimer?(state: ActiveTimerState): void;
  /** Realtime-Verbindung steht (true) bzw. ist unterbrochen (false). */
  onStatus?(connected: boolean): void;
}

export type RemoteErrorKind = 'network' | 'auth' | 'server';

/**
 * Fehler der Remote-Schicht.
 * - network: Server nicht erreichbar → später erneut versuchen
 * - auth: nicht (mehr) angemeldet → Anmeldung nötig
 * - server: Server hat die Anfrage als Ganzes abgelehnt → später erneut versuchen
 */
export class RemoteError extends Error {
  constructor(
    readonly kind: RemoteErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RemoteError';
  }
}

export interface RemoteStore {
  readonly kind: 'supabase' | 'memory';
  /** Lokale Prüfung (gespeicherte Sitzung), funktioniert auch offline. */
  isSignedIn(): Promise<boolean>;
  /** ID des angemeldeten Nutzers (null wenn abgemeldet) – bindet die lokale DB an ein Konto. */
  userId(): Promise<string | null>;
  /** Aktuelle Serverzeit (ISO) – dient dem Abgleich nachgehender Geräteuhren. */
  serverNow(): Promise<string>;
  push<K extends EntityTable>(table: K, rows: EntityMap[K][]): Promise<PushResult>;
  /** Aufsteigend nach (server_updated_at, id), `after` exklusiv; höchstens `limit` Zeilen. */
  pull<K extends EntityTable>(table: K, after: PullCursor | null, limit: number): Promise<PullPage<K>>;
  getSettings(): Promise<UserSettings | null>;
  /** Upsert mit Last-Writer-Wins auf dem Server (ältere Versionen werden still verworfen). */
  putSettings(settings: UserSettings): Promise<void>;
  getTimer(): Promise<ActiveTimerState | null>;
  /** Upsert mit Last-Writer-Wins auf dem Server. */
  putTimer(state: ActiveTimerState): Promise<void>;
  /** Realtime-Abo; liefert die Abmeldefunktion. */
  subscribe(handlers: RemoteHandlers): () => void;
}

/* ---------- Zeitstempel und Cursor ---------- */

const TS_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Wandelt einen Postgres-/ISO-Zeitstempel in Epoch-Mikrosekunden um.
 * Akzeptiert '2026-10-15T08:00:00.123456+00:00', '2026-10-15 08:00:00.12+00' und '…Z'.
 * Zeitstempel ohne Zonenangabe gelten als UTC (so liefert sie Postgres für timestamptz nie).
 */
export function isoToMicros(value: string): number {
  const m = TS_PATTERN.exec(value.trim());
  if (!m) throw new RangeError(`Ungültiger Zeitstempel: ${value}`);
  const [, date, time, fraction = '', zone] = m;
  const fullTime = time!.length === 5 ? `${time}:00` : time!;
  const ms = Date.parse(`${date}T${fullTime}${normalizeZone(zone)}`);
  if (Number.isNaN(ms)) throw new RangeError(`Ungültiger Zeitstempel: ${value}`);
  const micros = Number(fraction.slice(0, 6).padEnd(6, '0'));
  return ms * 1000 + micros;
}

function normalizeZone(zone: string | undefined): string {
  if (!zone || zone.toUpperCase() === 'Z') return 'Z';
  const sign = zone[0];
  const digits = zone.slice(1).replace(':', '');
  return `${sign}${digits.slice(0, 2)}:${(digits.slice(2) || '00').padEnd(2, '0')}`;
}

/** ISO-/Postgres-Zeitstempel → Epoch-ms (Mikrosekunden werden abgeschnitten). */
export function isoToMs(value: string): number {
  return Math.floor(isoToMicros(value) / 1000);
}

/** Epoch-ms → ISO-8601 in UTC (Millisekunden-Präzision, verlustfrei für lokale Werte). */
export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Epoch-Mikrosekunden → ISO-String im Format, das PostgREST für timestamptz liefert. */
export function microsToIso(micros: number): string {
  const ms = Math.floor(micros / 1000);
  const rest = micros - ms * 1000;
  const iso = new Date(ms).toISOString(); // 2026-10-15T08:00:00.123Z
  return `${iso.slice(0, 23)}${String(rest).padStart(3, '0')}+00:00`;
}

/** Ordnung zweier Cursor nach (server_updated_at, id) – unabhängig vom Zeitstempel-Format. */
export function compareCursors(a: PullCursor, b: PullCursor): number {
  const d = isoToMicros(a.ts) - isoToMicros(b.ts);
  if (d !== 0) return d < 0 ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function maxCursor(a: PullCursor | null | undefined, b: PullCursor | null | undefined): PullCursor | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareCursors(a, b) >= 0 ? a : b;
}

/**
 * Cursor um `ms` zurückversetzen (Überlappungsfenster). Die id '' schliesst alle Zeilen
 * des Zeitpunkts ein. Hintergrund: Postgres vergibt now() beim Transaktionsbeginn – eine
 * lange Transaktion kann daher Zeilen mit älterem server_updated_at erst nach einem Pull
 * sichtbar machen. Das Überlappungsfenster holt solche Nachzügler ab.
 */
export function rewindCursor(cursor: PullCursor, ms: number): PullCursor {
  if (ms <= 0) return cursor;
  const micros = isoToMicros(cursor.ts) - Math.round(ms * 1000);
  return { ts: microsToIso(micros), id: '' };
}
