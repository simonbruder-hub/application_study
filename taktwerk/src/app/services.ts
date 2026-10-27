/**
 * App-Start: lokale Datenbank öffnen, v1-Daten einmalig übernehmen, optional Supabase verbinden,
 * Sync-Engine und Live-Timer starten. Ohne Supabase-Verbindung läuft alles rein lokal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { META, PlannerDB } from '../data/db';
import { Repository } from '../data/repository';
import { migrateV1Once, type MigrationReport } from '../data/migrateV1';
import { SyncEngine, saveLocalSettings } from '../sync/syncEngine';
import { TimerSync } from '../sync/timerSync';
import { SupabaseRemote, createSupabaseClient } from '../sync/supabaseRemote';
import type { RemoteStore } from '../sync/remote';
import { loadBackendConfig, prefs, setPrefs, type BackendConfig } from './prefs';
import { settings, startClock, syncStatus, timerState, watchDatabase } from './store';
import { TimerController, type PhaseCompleteInfo } from './timer/controller';
import { armAudio, requestNotifyPermission } from './timer/signals';

/**
 * Beim ersten Timer-Start einmalig nach Benachrichtigungen fragen: Ohne sie meldet sich die App
 * bei gesperrtem Handy oder verdecktem Fenster nicht. Muss synchron in der Nutzeraktion laufen.
 */
function askNotifyOnce(): void {
  if (prefs.value.notifyAsked) return;
  setPrefs({ notifyAsked: true });
  if (prefs.value.notify) return;
  void requestNotifyPermission().then((res) => { if (res === 'granted') setPrefs({ notify: true }); });
}

export interface AppServices {
  db: PlannerDB;
  repo: Repository;
  sync: SyncEngine;
  timerSync: TimerSync;
  timer: TimerController;
  backend: BackendConfig | null;
  supabase: SupabaseClient | null;
  remote: RemoteStore | null;
  migration: MigrationReport | null;
}

let current: AppServices | null = null;

/** Zugriff auf die Dienste nach dem Start */
export function app(): AppServices {
  if (!current) throw new Error('App noch nicht gestartet');
  return current;
}

/** Ereignis für Hinweise nach einer abgeschlossenen Phase (Toast, Maskottchen) */
export const phaseEvents = new EventTarget();

export async function bootstrap(): Promise<AppServices> {
  const db = new PlannerDB();
  await db.open();
  const repo = await Repository.open(db);

  let migration: MigrationReport | null = null;
  try {
    if (consumeSkipV1Flag()) await db.setMeta(META.migratedV1, { at: Date.now(), found: false, counts: null, skipped: true });
    migration = await migrateV1Once(repo);
    if (migration && Object.keys(migration.settings).length) await saveLocalSettings(repo, migration.settings);
  } catch (err) {
    console.error('Übernahme der v1-Daten fehlgeschlagen', err);
  }

  const backend = loadBackendConfig();
  let supabase: SupabaseClient | null = null;
  let remote: RemoteStore | null = null;
  if (backend) {
    try {
      supabase = createSupabaseClient(backend.url, backend.anonKey);
      remote = new SupabaseRemote(supabase);
    } catch (err) {
      console.error('Supabase-Verbindung ungültig', err);
    }
  }

  const sync = new SyncEngine({ repo, remote });
  const timerSync = new TimerSync({ repo, remote });
  await timerSync.load();

  const timer = new TimerController({
    repo,
    timerSync,
    getSettings: () => settings.value,
    getPrefs: () => prefs.value,
    onPhaseComplete: (info: PhaseCompleteInfo) => phaseEvents.dispatchEvent(new CustomEvent('complete', { detail: info })),
    onUserStart: askNotifyOnce,
    onLogged: (seconds: number) => phaseEvents.dispatchEvent(new CustomEvent('logged', { detail: seconds })),
  });

  watchDatabase(db);
  startClock();
  syncStatus.value = sync.getStatus();
  sync.subscribe((s) => { syncStatus.value = s; });
  timerState.value = timerSync.state;
  timerSync.subscribe((s) => { timerState.value = s; });

  void sync.start();
  void timerSync.start();
  timer.start();
  armAudio();

  current = { db, repo, sync, timerSync, timer, backend, supabase, remote, migration };
  return current;
}

/**
 * Nach «Lokale Daten zurücksetzen» sollen die alten v1-Daten (localStorage) nicht erneut übernommen
 * werden – sonst kämen gelöschte Daten beim Neustart zurück.
 */
const SKIP_V1_KEY = 'pomodoro-planer.v2.skipV1Migration';

function consumeSkipV1Flag(): boolean {
  try {
    if (localStorage.getItem(SKIP_V1_KEY) !== '1') return false;
    localStorage.removeItem(SKIP_V1_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Lokale Daten vollständig löschen (z. B. bei Kontowechsel) und neu laden */
export async function resetLocalData(): Promise<void> {
  try { localStorage.setItem(SKIP_V1_KEY, '1'); } catch { /* Speicher blockiert */ }
  const s = current;
  s?.sync.stop();
  s?.timerSync.stop();
  s?.timer.stop();
  s?.db.close();
  await new PlannerDB().delete();
  location.reload();
}
