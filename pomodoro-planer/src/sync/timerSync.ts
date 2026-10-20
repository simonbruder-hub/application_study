/**
 * Live-Spiegelung des laufenden Timers zwischen Geräten.
 *
 * - Lokaler Zustand in meta META.activeTimer (Offline-First: jede Aktion sofort lokal).
 * - Jede Änderung wird per HLC gestempelt (updated_at) und mit der Geräte-ID (updated_by)
 *   versehen, dann an den Server gesendet; der Server-Trigger verwirft veraltete Versionen.
 * - Eingehende Zustände (Realtime oder Abgleich beim Start) werden nach Last-Writer-Wins
 *   übernommen; veraltete werden ignoriert.
 * - Fehlgeschlagene Übertragungen werden beim nächsten online-Ereignis, nach einem
 *   Realtime-Wiederaufbau bzw. beim nächsten Start nachgeholt.
 * - now() liefert die um den Serveruhr-Versatz korrigierte Zeit; damit zeigen zwei Geräte mit
 *   falsch gehenden Uhren dieselbe Restzeit (alle Zeitstempel im Zustand in "Serverzeit").
 * - Mehrere Tabs/Fenster desselben Geräts gleichen sich über einen BroadcastChannel ab – auch
 *   ohne Server-Verbindung.
 */
import { META } from '../data/db';
import type { Repository } from '../data/repository';
import type { ActiveTimerState } from '../data/types';
import { LOCAL_TIMER_ID, idleTimerState } from '../domain/timerMath';
import { isNewer } from './hlc';
import { isoToMs, type RemoteStore } from './remote';
import { defaultEnv, defaultIsOnline, listen, type SyncEnv } from './runtime';

export type TimerPatch = Partial<Omit<ActiveTimerState, 'id' | 'updated_at' | 'updated_by'>>;

/** Kanal zu anderen Tabs desselben Geräts (BroadcastChannel-Ausschnitt) */
export interface LocalChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}

const CHANNEL_NAME = 'pomodoro-planer.timer';

/** Im Browser ein BroadcastChannel; ausserhalb (Tests, Node) keiner, damit Instanzen sich nicht stören */
function defaultChannel(): LocalChannel | null {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
}

export interface TimerSyncOptions {
  repo: Repository;
  /** null = nur lokal */
  remote: RemoteStore | null;
  /** window-ähnliches Objekt für das online-Ereignis; Standard window */
  env?: SyncEnv | null;
  /** Standard navigator.onLine */
  isOnline?: () => boolean;
  /** Geräteuhr (Epoch-ms); Standard Date.now */
  now?: () => number;
  /** Andere Tabs desselben Geräts; Standard BroadcastChannel im Browser, null = keiner */
  channel?: LocalChannel | null;
}

/** Abweichungen unter dieser Schwelle gelten als Messrauschen (Netzwerklaufzeit) */
const OFFSET_THRESHOLD_MS = 1_000;

export class TimerSync {
  private readonly repo: Repository;
  private readonly remote: RemoteStore | null;
  private readonly env: SyncEnv | null;
  private readonly isOnline: () => boolean;
  private readonly wall: () => number;
  private readonly channel: LocalChannel | null;

  private current: ActiveTimerState = idleTimerState();
  private loaded = false;
  private loading: Promise<void> | null = null;
  private started = false;
  private cleanups: (() => void)[] = [];
  private readonly listeners = new Set<(state: ActiveTimerState) => void>();
  private pushPending = false;
  private pushChain: Promise<void> = Promise.resolve();
  private offsetMs = 0;
  private connected: boolean | null = null;

  constructor(opts: TimerSyncOptions) {
    this.repo = opts.repo;
    this.remote = opts.remote;
    this.env = opts.env === undefined ? defaultEnv() : opts.env;
    this.isOnline = opts.isOnline ?? defaultIsOnline;
    this.wall = opts.now ?? Date.now;
    this.channel = opts.channel !== undefined ? opts.channel : defaultChannel();
  }

  /** Aktueller Zustand (nach load()/start() inkl. gespeichertem Stand) */
  get state(): ActiveTimerState {
    return this.current;
  }

  /** Gemessener Versatz Serveruhr − Geräteuhr (0, solange nicht gemessen oder vernachlässigbar) */
  get clockOffsetMs(): number {
    return this.offsetMs;
  }

  /** Zeit für Timer-Berechnungen und -Übergänge (Geräteuhr + Serverversatz) */
  now(): number {
    return this.wall() + this.offsetMs;
  }

  /** Gespeicherten Zustand laden (idempotent). */
  load(): Promise<void> {
    this.loading ??= (async () => {
      const saved = await this.repo.db.getMeta<ActiveTimerState>(META.activeTimer);
      if (saved && isNewer(saved, this.current)) {
        this.repo.clock.observe(saved.updated_at);
        this.current = { ...saved, id: LOCAL_TIMER_ID };
      }
      this.loaded = true;
      this.notify();
    })();
    return this.loading;
  }

  /** Laden, mit dem Server abgleichen und Realtime abonnieren. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.load();
    if (this.env) this.cleanups.push(listen(this.env, 'online', () => { void this.reconcile(); }));
    const channel = this.channel;
    if (channel) {
      const onMessage = (e: MessageEvent) => {
        const state = (e.data as { timer?: ActiveTimerState } | null)?.timer;
        if (state && typeof state.updated_at === 'number') void this.receive(state);
      };
      channel.addEventListener('message', onMessage);
      this.cleanups.push(() => channel.removeEventListener('message', onMessage));
    }
    const remote = this.remote;
    if (!remote) return;
    this.cleanups.push(remote.subscribe({
      onTimer: (state) => { void this.receive(state); },
      onChange: (table) => { if (table === 'active_timer_state') void this.reconcile(); },
      onStatus: (connected) => {
        // Beim ersten Aufbau und nach Unterbrechungen abgleichen: Zustände, die vor dem Join des
        // Channels geschrieben wurden, kommen nie als onTimer an
        if (connected && this.connected !== true) void this.reconcile();
        this.connected = connected;
      },
    }));
    await this.reconcile();
  }

  stop(): void {
    this.started = false;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.connected = null;
  }

  /** Zustandsänderungen abonnieren; fn wird sofort mit dem aktuellen Zustand aufgerufen. */
  subscribe(fn: (state: ActiveTimerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Zustand ändern: stempelt updated_at (HLC) und updated_by (Geräte-ID), speichert lokal und
   * überträgt im Hintergrund. Erfüllt sich nach dem lokalen Speichern.
   */
  async set(patch: TimerPatch): Promise<ActiveTimerState> {
    if (!this.loaded) await this.load();
    const next: ActiveTimerState = {
      ...this.current,
      ...patch,
      id: LOCAL_TIMER_ID,
      updated_at: this.repo.clock.now(),
      updated_by: this.repo.deviceId,
    };
    this.current = next;
    this.notify();
    await this.saveLocal(next);
    try { this.channel?.postMessage({ timer: next }); } catch { /* Kanal geschlossen */ }
    this.schedulePush();
    return next;
  }

  /**
   * Übergang mit einer reinen Funktion aus timerMath, z. B.
   * `timer.transition((s, now) => pauseTimer(s, now))`. Liefert die Funktion denselben
   * Zustand zurück (z. B. Pause im Ruhezustand), wird nichts gespeichert.
   */
  async transition(fn: (state: ActiveTimerState, now: number) => ActiveTimerState): Promise<ActiveTimerState> {
    if (!this.loaded) await this.load();
    const prev = this.current;
    const next = fn(prev, this.now());
    if (next === prev) return prev;
    const { id: _id, updated_at: _at, updated_by: _by, ...patch } = next;
    return this.set(patch);
  }

  /** Wartet, bis laufende Übertragungen abgeschlossen sind (Tests, Abmelden). */
  whenIdle(): Promise<void> {
    return this.pushChain;
  }

  /** Noch nicht bestätigte lokale Änderung vorhanden? */
  get hasPendingPush(): boolean {
    return this.pushPending;
  }

  private notify(): void {
    const s = this.current;
    this.listeners.forEach((fn) => fn(s));
  }

  /** Lokal speichern – nie einen neueren gespeicherten Stand (anderer Tab) überschreiben. */
  private async saveLocal(state: ActiveTimerState): Promise<void> {
    const { db } = this.repo;
    await db.transaction('rw', db.meta, async () => {
      const stored = await db.getMeta<ActiveTimerState>(META.activeTimer);
      if (!stored || isNewer(state, stored)) await db.setMeta(META.activeTimer, state);
      const clock = (await db.getMeta<number>(META.clock)) ?? 0;
      if (this.repo.clock.value > clock) await db.setMeta(META.clock, this.repo.clock.value);
    });
  }

  private schedulePush(): void {
    this.pushPending = true;
    this.pushChain = this.pushChain.then(() => this.pushNow());
  }

  /** Überträgt jeweils den neuesten Zustand; Fehler → bleibt pending für den nächsten Abgleich. */
  private async pushNow(): Promise<void> {
    const remote = this.remote;
    if (!remote || !this.pushPending || !this.isOnline()) return;
    const state = this.current;
    try {
      await remote.putTimer(state);
      if (this.current === state) this.pushPending = false;
    } catch {
      // offline, abgemeldet oder Serverfehler: nächster Versuch bei online/Realtime/Start
    }
  }

  private async receive(state: ActiveTimerState): Promise<void> {
    if (!this.loaded) await this.load();
    if (isNewer(state, this.current)) await this.adopt(state);
  }

  private async adopt(state: ActiveTimerState): Promise<void> {
    this.repo.clock.observe(state.updated_at);
    const local: ActiveTimerState = { ...state, id: LOCAL_TIMER_ID };
    this.current = local;
    // Ein neuerer Stand ersetzt eine noch ausstehende eigene Übertragung (der Absender überträgt selbst)
    this.pushPending = false;
    this.notify();
    await this.saveLocal(local);
  }

  /** Mit dem Server abgleichen: neueren Server-Stand übernehmen bzw. eigenen neueren senden. */
  private async reconcile(): Promise<void> {
    const remote = this.remote;
    if (!remote || !this.isOnline()) return;
    try {
      await this.measureOffset(remote);
      const server = await remote.getTimer();
      if (server && isNewer(server, this.current)) {
        await this.adopt(server);
      } else if (this.current.updated_at > 0 && (!server || isNewer(this.current, server))) {
        this.schedulePush();
        await this.pushChain;
      } else {
        this.pushPending = false;
      }
    } catch {
      // Abgleich beim nächsten online-Ereignis bzw. Start
    }
  }

  private async measureOffset(remote: RemoteStore): Promise<void> {
    const t0 = this.wall();
    let server: number;
    try {
      server = isoToMs(await remote.serverNow());
    } catch {
      return; // ohne Serverzeit mit Geräteuhr weiterarbeiten
    }
    const t1 = this.wall();
    const offset = server - (t0 + t1) / 2;
    this.offsetMs = Math.abs(offset) < OFFSET_THRESHOLD_MS ? 0 : Math.round(offset);
  }
}
