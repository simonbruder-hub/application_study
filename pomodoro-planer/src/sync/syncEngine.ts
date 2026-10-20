/**
 * Offline-First Sync-Engine: lokale Dexie-Datenbank ↔ RemoteStore (Supabase).
 *
 * Ablauf eines Laufs (syncNow)
 * 1. Serverzeit beobachten (HLC einer nachgehenden Geräteuhr nachziehen).
 * 2. PUSH: Outbox (_dirty = 1) je Tabelle in ENTITY_TABLES-Reihenfolge (Eltern vor Kindern),
 *    seitenweise. Erfolgreiche Zeilen → markClean (nur wenn seitdem unverändert).
 *    Code-Konflikte (project_code/ms_code/ap_code) werden lokal umbenannt und im selben Lauf
 *    erneut übertragen; andere Ablehnungen bleiben dirty und werden begrenzt wiederholt.
 * 3. PULL: je Tabelle ab gespeichertem Server-Cursor (server_updated_at, id) minus
 *    Überlappungsfenster, seitenweise; Übernahme per Last-Writer-Wins (Repository.applyRemote).
 * 4. user_settings per Last-Writer-Wins abgleichen; last_synced_at speichern.
 *
 * Warum nicht "updated_at > last_synced_at"? updated_at stammt von den Geräteuhren: Eine
 * nachgehende Uhr oder eine Änderung, die während eines Syncs entsteht, fiele durch das
 * Raster. Der vom Server vergebene Cursor ist davon unabhängig; die Outbox überträgt jede
 * lokale Änderung genau so lange, bis der Server sie bestätigt hat.
 */
import { META, type PlannerDB } from '../data/db';
import type { Repository } from '../data/repository';
import { DEFAULT_SETTINGS, ENTITY_TABLES, type AnyEntity, type EntityTable, type UserSettings } from '../data/types';
import { isNewer } from './hlc';
import {
  RemoteError, compareCursors, isoToMs, maxCursor, rewindCursor,
  type PullCursor, type PushRejected, type RemoteStore,
} from './remote';
import {
  defaultEnv, defaultIsOnline, defaultTimers, listen, listenVisible, persistClock,
  type SyncEnv, type Timers,
} from './runtime';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed_out';

/**
 * Zustand für den Sync-Indikator: grün = idle, gelb = offline (lokal gespeichert),
 * Animation = syncing, rot = error, grau = signed_out (nur lokal).
 */
export interface SyncStatus {
  state: SyncState;
  /** Zeitpunkt des letzten vollständigen Abgleichs (Epoch-ms) */
  lastSyncedAt: number | null;
  /** Noch nicht übertragene lokale Änderungen */
  pending: number;
  /** Deutsche Fehlermeldung bei offline/error/signed_out */
  error?: string;
  /** Hinweise für den Nutzer, z. B. automatische Umbenennungen (neueste zuletzt) */
  notices: string[];
}

/** Tabellen, die ein Lauf vom Server übernommen hat */
export type RemoteChange = EntityTable | 'user_settings';

export interface SyncEngineOptions {
  repo: Repository;
  /** null = nur lokal (nicht angemeldet / kein Backend konfiguriert) */
  remote: RemoteStore | null;
  /** Zeilen je Push- und Pull-Seite (Standard 500) */
  pageSize?: number;
  /** Überlappungsfenster des Pull-Cursors (Standard 30 s) */
  overlapMs?: number;
  /** Entprellung lokaler Änderungen und Realtime-Ereignisse (Standard 1.5 s) */
  debounceMs?: number;
  /** Uhr für last_synced_at (Standard Date.now) */
  now?: () => number;
  /** Standard navigator.onLine */
  isOnline?: () => boolean;
  /** window-ähnliches Objekt für online/offline/visibilitychange; Standard window */
  env?: SyncEnv | null;
  /** Erster Wiederholungsabstand nach Fehlern (Standard 5 s, verdoppelnd) */
  retryBaseMs?: number;
  /** Maximaler Wiederholungsabstand (Standard 5 min) */
  retryMaxMs?: number;
  /** Fehlversuche je Zeilenversion, danach Pause bis zur nächsten Änderung (Standard 3) */
  maxAttempts?: number;
  timers?: Timers;
}

const MAX_NOTICES = 20;
const MAX_RENAME_ROUNDS = 5;
/** Höchstlänge der Codes (CHECK-Constraint ^[A-Za-z0-9._-]{1,32}$ im Server-Schema) */
const MAX_CODE_LENGTH = 32;
/** meta-Schlüssel: Konto, an das die lokale Datenbank gebunden ist */
export const SYNC_USER_KEY = 'sync_user_id';

const MSG = {
  offline: 'Offline – Änderungen sind lokal gespeichert.',
  unreachable: 'Server nicht erreichbar – Änderungen sind lokal gespeichert.',
  signedOut: 'Bitte erneut anmelden – Änderungen sind lokal gespeichert.',
  otherAccount: 'Die lokalen Daten gehören zu einem anderen Konto – bitte mit jenem Konto anmelden oder die lokalen Daten zurücksetzen.',
} as const;

const ROW_LABEL: Record<EntityTable, string> = {
  projects: 'Projekt',
  milestones: 'Meilenstein',
  work_packages: 'Arbeitspaket',
  tasks: 'Aufgabe',
  time_logs: 'Zeiteintrag',
  planned_blocks: 'Kalenderblock',
};

interface CodeField {
  column: 'project_code' | 'ms_code' | 'ap_code';
  label: string;
  /** Eindeutigkeit je Projekt statt je Nutzer */
  scope?: 'project_id';
}

const CODE_FIELDS: Partial<Record<EntityTable, CodeField>> = {
  projects: { column: 'project_code', label: 'Projektcode' },
  milestones: { column: 'ms_code', label: 'Meilenstein-Code', scope: 'project_id' },
  work_packages: { column: 'ap_code', label: 'AP-Code', scope: 'project_id' },
};

interface FailureRecord {
  version: string;
  attempts: number;
  reason: PushRejected['reason'];
}

type Fields = Record<string, unknown>;

export class SyncEngine {
  private readonly repo: Repository;
  private readonly remote: RemoteStore | null;
  private readonly pageSize: number;
  private readonly overlapMs: number;
  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly isOnline: () => boolean;
  private readonly env: SyncEnv | null;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly maxAttempts: number;
  private readonly timers: Timers;

  private status: SyncStatus;
  private readonly statusListeners = new Set<(s: SyncStatus) => void>();
  private readonly remoteListeners = new Set<(tables: RemoteChange[]) => void>();

  private loop: Promise<void> | null = null;
  private again = false;
  private started = false;
  private cleanups: (() => void)[] = [];
  private debounceTimer: unknown = null;
  private retryTimer: unknown = null;
  private retryDelay = 0;
  private realtimeConnected: boolean | null = null;
  private initPromise: Promise<void> | null = null;

  /** Fehlversuche je Zeile (table:id) und Version */
  private readonly failures = new Map<string, FailureRecord>();
  /**
   * Umbenennungen im laufenden Push je Zeile: Ausgangscode, bereits abgelehnte Codes und ob der
   * Code nach dem Pull schon einmal unverändert erneut gesendet wurde
   */
  private renames = new Map<string, { base: string; tried: Set<string>; retried: boolean }>();

  constructor(opts: SyncEngineOptions) {
    this.repo = opts.repo;
    this.remote = opts.remote;
    this.pageSize = Math.max(1, opts.pageSize ?? 500);
    this.overlapMs = Math.max(0, opts.overlapMs ?? 30_000);
    this.debounceMs = Math.max(0, opts.debounceMs ?? 1_500);
    this.now = opts.now ?? Date.now;
    this.isOnline = opts.isOnline ?? defaultIsOnline;
    this.env = opts.env === undefined ? defaultEnv() : opts.env;
    this.retryBaseMs = opts.retryBaseMs ?? 5_000;
    this.retryMaxMs = opts.retryMaxMs ?? 300_000;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.timers = opts.timers ?? defaultTimers;
    this.status = { state: this.remote ? 'idle' : 'signed_out', lastSyncedAt: null, pending: 0, notices: [] };
  }

  /* ---------- Status ---------- */

  getStatus(): SyncStatus {
    return { ...this.status, notices: [...this.status.notices] };
  }

  /** Statusänderungen abonnieren; fn wird sofort mit dem aktuellen Status aufgerufen. */
  subscribe(fn: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.getStatus());
    return () => { this.statusListeners.delete(fn); };
  }

  /** Benachrichtigung, wenn ein Lauf Änderungen vom Server übernommen hat (Ansichten neu laden). */
  onRemoteChange(fn: (tables: RemoteChange[]) => void): () => void {
    this.remoteListeners.add(fn);
    return () => { this.remoteListeners.delete(fn); };
  }

  clearNotices(): void {
    this.setStatus({ ...this.status, notices: [] });
  }

  private setStatus(next: SyncStatus): void {
    this.status = next;
    const snapshot = this.getStatus();
    this.statusListeners.forEach((fn) => fn(snapshot));
  }

  private async finish(state: SyncState, extra: { error?: string; lastSyncedAt?: number } = {}): Promise<void> {
    const pending = await this.pendingCount();
    const next: SyncStatus = {
      state,
      lastSyncedAt: extra.lastSyncedAt ?? this.status.lastSyncedAt,
      pending,
      notices: this.status.notices,
    };
    if (extra.error) next.error = extra.error;
    this.setStatus(next);
  }

  private addNotice(text: string): void {
    const notices = [...this.status.notices.filter((n) => n !== text), text].slice(-MAX_NOTICES);
    this.setStatus({ ...this.status, notices });
  }

  private emitRemote(tables: RemoteChange[]): void {
    if (tables.length) this.remoteListeners.forEach((fn) => fn(tables));
  }

  /** Anzahl noch nicht übertragener Zeilen über alle Tabellen */
  async pendingCount(): Promise<number> {
    const counts = await Promise.all(
      ENTITY_TABLES.map((t) => this.repo.db.table(t).where('_dirty').equals(1).count()),
    );
    return counts.reduce((a, b) => a + b, 0);
  }

  private async refreshPending(): Promise<void> {
    const pending = await this.pendingCount();
    if (pending !== this.status.pending) this.setStatus({ ...this.status, pending });
  }

  private init(): Promise<void> {
    this.initPromise ??= (async () => {
      const last = await this.repo.db.getMeta<number>(META.lastSyncedAt);
      this.setStatus({ ...this.status, lastSyncedAt: last ?? null, pending: await this.pendingCount() });
    })();
    return this.initPromise;
  }

  /* ---------- Lebenszyklus ---------- */

  /** Ereignisse abonnieren und ersten Abgleich starten (Promise = erster Lauf). */
  start(): Promise<void> {
    if (this.started) return this.loop ?? Promise.resolve();
    this.started = true;
    const env = this.env;
    if (env) {
      this.cleanups.push(listen(env, 'online', () => { void this.syncNow(); }));
      this.cleanups.push(listen(env, 'offline', () => { if (!this.loop) void this.finish('offline', { error: MSG.offline }); }));
      this.cleanups.push(listenVisible(env, () => { void this.syncNow(); }));
    }
    this.cleanups.push(this.repo.onLocalChange(() => this.handleLocalChange()));
    if (this.remote) {
      this.cleanups.push(this.remote.subscribe({
        onChange: (table, by) => {
          // Timer läuft über TimerSync; eigenes Echo ignorieren
          if (table !== 'active_timer_state' && by !== this.repo.deviceId) this.requestSync();
        },
        onStatus: (connected) => {
          // Verpasste Realtime-Ereignisse per Pull nachholen: nach einem Verbindungsabbruch und beim
          // ersten Aufbau (der Channel steht oft erst nach dem ersten Pull – Änderungen dazwischen
          // kämen sonst erst beim nächsten Anlass an)
          if (connected && this.realtimeConnected !== true) this.requestSync();
          this.realtimeConnected = connected;
        },
      }));
    }
    return this.syncNow();
  }

  stop(): void {
    this.started = false;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (this.debounceTimer !== null) this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.clearRetry();
    this.realtimeConnected = null;
  }

  private handleLocalChange(): void {
    void this.refreshPending();
    if (this.loop) this.again = true; // Lauf aktiv → direkt danach ein weiterer
    else this.requestSync();
  }

  /** Entprellten Abgleich planen (nur nach start()). */
  private requestSync(delay = this.debounceMs): void {
    if (!this.started) return;
    if (this.debounceTimer !== null) this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow();
    }, delay);
  }

  private scheduleRetry(): void {
    if (!this.started) return;
    this.retryDelay = this.retryDelay ? Math.min(this.retryDelay * 2, this.retryMaxMs) : this.retryBaseMs;
    this.clearRetry();
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, this.retryDelay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * Abgleich jetzt ausführen. Läufe sind serialisiert: Aufrufe während eines Laufs werden
   * zu genau einem Folgelauf zusammengelegt; das Promise erfüllt sich nach dem letzten Lauf.
   */
  syncNow(): Promise<void> {
    this.again = true;
    if (!this.loop) {
      this.loop = (async () => {
        try {
          while (this.again) {
            this.again = false;
            await this.runOnce();
          }
        } finally {
          this.loop = null;
        }
      })();
    }
    return this.loop;
  }

  /** Zeilen, die nach wiederholter Ablehnung pausieren, erneut versuchen (z. B. Knopf "Erneut senden"). */
  retryBlocked(): Promise<void> {
    this.failures.clear();
    return this.syncNow();
  }

  /** Einstellungen lokal speichern (HLC-gestempelt) und Abgleich planen. */
  async saveSettings(patch: Partial<Omit<UserSettings, 'id' | 'updated_at' | 'updated_by'>>): Promise<UserSettings> {
    const saved = await saveLocalSettings(this.repo, patch);
    if (this.loop) this.again = true;
    else this.requestSync();
    return saved;
  }

  /* ---------- Ein Lauf ---------- */

  private async runOnce(): Promise<void> {
    await this.init();
    const remote = this.remote;
    if (!remote) return this.finish('signed_out');
    if (!this.isOnline()) return this.finish('offline', { error: MSG.offline });
    this.setStatus({ ...this.status, state: 'syncing' });
    try {
      if (!(await remote.isSignedIn())) return await this.finish('signed_out');
      if (!(await this.bindAccount(remote))) {
        this.clearRetry();
        return await this.finish('error', { error: MSG.otherAccount });
      }
      await this.observeServerTime(remote);
      await this.pushAll(remote);
      await this.pullAll(remote);
      await this.syncSettings(remote);
      await persistClock(this.repo);
      const t = this.now();
      await this.repo.db.setMeta(META.lastSyncedAt, t);
      this.retryDelay = 0;
      this.clearRetry();
      await this.finish('idle', { lastSyncedAt: t });
    } catch (err) {
      await this.handleError(err);
    }
  }

  private async handleError(err: unknown): Promise<void> {
    if (err instanceof RemoteError && err.kind === 'auth') {
      this.clearRetry();
      await this.finish('signed_out', { error: MSG.signedOut });
      return;
    }
    if (err instanceof RemoteError && err.kind === 'network') {
      await this.finish('offline', { error: MSG.unreachable });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      await this.finish('error', { error: `Synchronisierung fehlgeschlagen: ${message}` });
    }
    this.scheduleRetry();
  }

  /**
   * Lokale DB beim ersten Abgleich an das angemeldete Konto binden (lokal erfasste Daten
   * werden dabei hochgeladen). Ein anderes Konto darf diese Daten nie übernehmen.
   */
  private async bindAccount(remote: RemoteStore): Promise<boolean> {
    const uid = await remote.userId();
    if (!uid) throw new RemoteError('auth', 'Nicht angemeldet.');
    const { db } = this.repo;
    return db.transaction('rw', db.meta, async () => {
      const bound = await db.getMeta<string>(SYNC_USER_KEY);
      if (!bound) await db.setMeta(SYNC_USER_KEY, uid);
      return !bound || bound === uid;
    });
  }

  /** Nachgehende Geräteuhr: HLC auf Serverzeit heben, damit neue Änderungen nicht "veraltet" sind. */
  private async observeServerTime(remote: RemoteStore): Promise<void> {
    try {
      this.repo.clock.observe(isoToMs(await remote.serverNow()));
    } catch (err) {
      // Nur Verbindungs- und Anmeldefehler sind fatal; ohne Serverzeit funktioniert der Abgleich trotzdem
      if (err instanceof RemoteError && err.kind !== 'server') throw err;
    }
  }

  /* ---------- Push ---------- */

  private async pushAll(remote: RemoteStore): Promise<void> {
    this.renames = new Map();
    let parentsPushed = false;
    for (const table of ENTITY_TABLES) {
      const ok = await this.pushTable(remote, table, parentsPushed);
      if (ok > 0) parentsPushed = true;
    }
  }

  private async pushTable(remote: RemoteStore, table: EntityTable, parentsPushed: boolean): Promise<number> {
    let okCount = 0;
    let pulled = false;
    let only: Set<string> | null = null; // ab Runde 2 nur umbenannte Zeilen
    for (let round = 0; round < MAX_RENAME_ROUNDS; round++) {
      const dirty = (await this.repo.dirtyRows(table)) as AnyEntity[];
      const rows = dirty
        .filter((r) => (only ? only.has(r.id) : this.mayPush(table, r, parentsPushed)))
        // Löschungen zuerst: Sie geben eindeutige Codes frei, bevor neue Zeilen sie beanspruchen
        // (der Unique-Index prüft im Upsert Zeile für Zeile)
        // Danach in Schreibreihenfolge: Bei Code-Konflikten behält die ältere Zeile ihren Code
        .sort((a, b) => Number(b.is_deleted) - Number(a.is_deleted) || a.updated_at - b.updated_at);
      if (!rows.length) break;
      const renamed = new Set<string>();
      for (let i = 0; i < rows.length; i += this.pageSize) {
        const part = rows.slice(i, i + this.pageSize);
        const res = await remote.push(table, part);
        if (res.ok.length) {
          await this.repo.markClean(table, res.ok);
          okCount += res.ok.length;
          for (const ok of res.ok) this.failures.delete(failureKey(table, ok.id));
        }
        const byId = new Map(part.map((r) => [r.id, r]));
        for (const rej of res.rejected) {
          const row = byId.get(rej.id);
          if (!row) continue;
          if (this.isCodeConflict(table, rej)) {
            if (!pulled) {
              // Konkurrierende Zeile holen, damit der neue Code auch gegenüber dem Server frei ist
              if (await this.pullTable(remote, table)) this.emitRemote([table]);
              pulled = true;
            }
            if (await this.renameCode(table, row)) { renamed.add(row.id); continue; }
          }
          this.recordFailure(table, row, rej);
        }
      }
      if (!renamed.size) break;
      only = renamed;
    }
    return okCount;
  }

  /** Abgelehnte Zeilen höchstens maxAttempts-mal je Version senden (FK-Fehler erneut, wenn Eltern übertragen wurden). */
  private mayPush(table: EntityTable, row: AnyEntity, parentsPushed: boolean): boolean {
    const key = failureKey(table, row.id);
    const failure = this.failures.get(key);
    if (!failure) return true;
    if (failure.version !== versionOf(row)) {
      this.failures.delete(key);
      return true;
    }
    if (failure.attempts < this.maxAttempts) return true;
    return failure.reason === 'foreign_key' && parentsPushed;
  }

  private isCodeConflict(table: EntityTable, rej: PushRejected): boolean {
    const field = CODE_FIELDS[table];
    return rej.reason === 'unique_violation' && !!field && (!rej.column || rej.column === field.column);
  }

  /**
   * Code automatisch umbenennen (Suffix -2, -3 … bis lokal eindeutig, case-insensitive).
   * Liefert true, wenn die Zeile erneut übertragen werden soll.
   */
  private async renameCode(table: EntityTable, pushed: AnyEntity): Promise<boolean> {
    const field = CODE_FIELDS[table]!;
    const cur = (await this.repo.get(table, pushed.id)) as (AnyEntity & Fields) | undefined;
    if (!cur || cur.is_deleted) return false;
    const pushedCode = String((pushed as unknown as Fields)[field.column] ?? '');
    const currentCode = String(cur[field.column] ?? '');
    // Inzwischen lokal geändert → neue Version einfach erneut übertragen
    if (currentCode.toLowerCase() !== pushedCode.toLowerCase()) return cur._dirty === 1;

    const key = failureKey(table, cur.id);
    const state = this.renames.get(key) ?? { base: currentCode, tried: new Set<string>(), retried: false };
    state.tried.add(currentCode.toLowerCase());
    this.renames.set(key, state);

    const siblings = (await this.repo.list(table)) as unknown as (AnyEntity & Fields)[];
    const taken = new Set(
      siblings
        .filter((r) => r.id !== cur.id && (!field.scope || r[field.scope] === cur[field.scope]))
        .map((r) => String(r[field.column] ?? '').toLowerCase()),
    );
    // Nach dem Pull frei (z. B. im selben Push gelöscht oder umbenannt) → einmal unverändert senden
    if (!state.retried && !taken.has(currentCode.toLowerCase())) {
      state.retried = true;
      return true;
    }
    const withSuffix = (n: number) => `${state.base.slice(0, MAX_CODE_LENGTH - String(n).length - 1)}-${n}`;
    let n = 2;
    let candidate = withSuffix(n);
    while (taken.has(candidate.toLowerCase()) || state.tried.has(candidate.toLowerCase())) {
      candidate = withSuffix(++n);
    }
    await this.repo.applyBatch([{ op: 'update', table, id: cur.id, patch: { [field.column]: candidate } }]);
    this.addNotice(`${field.label} «${currentCode}» war bereits vergeben und wurde in «${candidate}» umbenannt.`);
    return true;
  }

  private recordFailure(table: EntityTable, row: AnyEntity, rej: PushRejected): void {
    const key = failureKey(table, row.id);
    const version = versionOf(row);
    const prev = this.failures.get(key);
    const attempts = prev && prev.version === version ? prev.attempts + 1 : 1;
    this.failures.set(key, { version, attempts, reason: rej.reason });
    const what = `${ROW_LABEL[table]} «${describeRow(table, row)}»`;
    if (attempts === 1) {
      this.addNotice(`${what} wurde vom Server abgelehnt (${reasonText(rej)}) und bleibt lokal gespeichert.`);
    }
    if (attempts === this.maxAttempts) {
      this.addNotice(`${what} wird nach ${attempts} Fehlversuchen erst nach einer Änderung erneut übertragen.`);
    }
  }

  /* ---------- Pull ---------- */

  private async pullAll(remote: RemoteStore): Promise<void> {
    const changed: EntityTable[] = [];
    for (const table of ENTITY_TABLES) {
      if (await this.pullTable(remote, table)) changed.push(table);
    }
    this.emitRemote(changed);
  }

  /** Seitenweise ab Cursor minus Überlappung; liefert die Anzahl übernommener Zeilen. */
  private async pullTable(remote: RemoteStore, table: EntityTable): Promise<number> {
    const { db } = this.repo;
    const key = META.cursor(table);
    let cursor = (await db.getMeta<PullCursor>(key)) ?? null;
    let after = cursor ? rewindCursor(cursor, this.overlapMs) : null;
    let applied = 0;
    for (;;) {
      const page = await remote.pull(table, after, this.pageSize);
      if (page.rows.length) applied += (await this.repo.applyRemote(table, page.rows)).applied;
      if (!page.last) break;
      const next = maxCursor(cursor, page.last);
      if (next !== cursor) {
        cursor = next;
        await db.setMeta(key, cursor);
      }
      if (page.rows.length < this.pageSize) break; // kürzere Seite = Ende des Stroms
      if (after && compareCursors(page.last, after) <= 0) break; // Schutz gegen nicht fortschreitenden Server
      after = page.last;
    }
    return applied;
  }

  /* ---------- Einstellungen ---------- */

  private async syncSettings(remote: RemoteStore): Promise<void> {
    const { db } = this.repo;
    const local = await db.getMeta<UserSettings>(META.settings);
    const server = await remote.getSettings();
    if (server) this.repo.clock.observe(server.updated_at);
    if (local && local.updated_at > 0 && (!server || isNewer(local, server))) {
      await remote.putSettings(local);
    } else if (server && (!local || isNewer(server, local))) {
      if (await adoptSettings(db, server)) this.emitRemote(['user_settings']);
    }
  }
}

/* ---------- Einstellungen lokal ---------- */

export function defaultSettings(): UserSettings {
  return { id: 'local', ...DEFAULT_SETTINGS, updated_at: 0, updated_by: '' };
}

/** Lokale Einstellungen (Standardwerte, solange nie gespeichert) */
export async function loadLocalSettings(db: PlannerDB): Promise<UserSettings> {
  return (await db.getMeta<UserSettings>(META.settings)) ?? defaultSettings();
}

/** Einstellungen ändern: HLC-Stempel, Geräte-ID, atomar mit Uhrstand gespeichert. Ohne Änderung kein neuer Stempel. */
export async function saveLocalSettings(
  repo: Repository,
  patch: Partial<Omit<UserSettings, 'id' | 'updated_at' | 'updated_by'>>,
): Promise<UserSettings> {
  const { db } = repo;
  return db.transaction('rw', db.meta, async () => {
    const cur = await loadLocalSettings(db);
    const changed = Object.entries(patch).some(([k, v]) => v !== undefined && (cur as unknown as Fields)[k] !== v);
    if (!changed) return cur;
    const next: UserSettings = { ...cur, ...patch, id: cur.id, updated_at: repo.clock.now(), updated_by: repo.deviceId };
    await db.setMeta(META.settings, next);
    const stored = (await db.getMeta<number>(META.clock)) ?? 0;
    if (repo.clock.value > stored) await db.setMeta(META.clock, repo.clock.value);
    return next;
  });
}

/** Server-Einstellungen übernehmen, falls sie (noch) neuer sind als die lokalen – atomar geprüft. */
async function adoptSettings(db: PlannerDB, server: UserSettings): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const local = await db.getMeta<UserSettings>(META.settings);
    if (local && !isNewer(server, local)) return false;
    await db.setMeta(META.settings, server);
    return true;
  });
}

/* ---------- Hilfsfunktionen ---------- */

function failureKey(table: EntityTable, id: string): string {
  return `${table}:${id}`;
}

function versionOf(row: { updated_at: number; updated_by: string }): string {
  return `${row.updated_at}:${row.updated_by}`;
}

function describeRow(table: EntityTable, row: AnyEntity): string {
  const r = row as unknown as Fields;
  const code = CODE_FIELDS[table]?.column;
  const label = (code && r[code]) || r.title || r.name || r.comment;
  return typeof label === 'string' && label ? label : row.id.slice(0, 8);
}

function reasonText(rej: PushRejected): string {
  const col = rej.column ? ` in «${rej.column}»` : '';
  switch (rej.reason) {
    case 'foreign_key': return `Verweis auf einen fehlenden Eintrag${col}`;
    case 'check': return `ungültiger Wert${col}`;
    case 'unique_violation': return `Wert bereits vergeben${col}`;
    default: return rej.detail ? `Fehler: ${rej.detail}` : 'unbekannter Fehler';
  }
}
