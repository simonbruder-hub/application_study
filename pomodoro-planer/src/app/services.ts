/**
 * App-Start: lokale Datenbank öffnen, v1-Daten einmalig übernehmen, optional Supabase verbinden,
 * Sync-Engine und Live-Timer starten. Ohne Supabase-Verbindung läuft alles rein lokal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PlannerDB } from '../data/db';
import { Repository } from '../data/repository';
import { migrateV1Once, type MigrationReport } from '../data/migrateV1';
import { SyncEngine, saveLocalSettings } from '../sync/syncEngine';
import { TimerSync } from '../sync/timerSync';
import { SupabaseRemote, createSupabaseClient } from '../sync/supabaseRemote';
import type { RemoteStore } from '../sync/remote';
import { loadBackendConfig, prefs, type BackendConfig } from './prefs';
import { settings, startClock, syncStatus, timerState, watchDatabase } from './store';
import { TimerController, type PhaseCompleteInfo } from './timer/controller';

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

  current = { db, repo, sync, timerSync, timer, backend, supabase, remote, migration };
  return current;
}

/** Lokale Daten vollständig löschen (z. B. bei Kontowechsel) und neu laden */
export async function resetLocalData(): Promise<void> {
  const s = current;
  s?.sync.stop();
  s?.timerSync.stop();
  s?.timer.stop();
  s?.db.close();
  await new PlannerDB().delete();
  location.reload();
}
