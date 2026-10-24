/**
 * Reaktiver App-Zustand (Preact Signals). Die Daten kommen per Dexie-liveQuery direkt aus
 * IndexedDB: Was das Repository, die Sync-Engine oder ein anderer Tab schreibt, erscheint
 * automatisch in der Oberfläche.
 */
import { computed, signal } from '@preact/signals';
import { liveQuery } from 'dexie';
import type { PlannerDB } from '../data/db';
import {
  ENTITY_TABLES, type ActiveTimerState, type EntityMap, type EntityTable, type UserSettings, type Workspace,
} from '../data/types';
import { defaultSettings, loadLocalSettings, type SyncStatus } from '../sync/syncEngine';
import { idleTimerState } from '../domain/timerMath';
import type { PlannerSnapshot } from '../domain/metrics';
import { prefs } from './prefs';

export type Entities = { [K in EntityTable]: EntityMap[K][] };

const emptyEntities = (): Entities => ({
  projects: [], milestones: [], work_packages: [], tasks: [], time_logs: [], planned_blocks: [],
});

/** Alle nicht gelöschten Zeilen aller Tabellen */
export const entities = signal<Entities>(emptyEntities());
/** true, sobald die Daten das erste Mal aus IndexedDB geladen wurden */
export const loaded = signal(false);
export const settings = signal<UserSettings>(defaultSettings());
export const syncStatus = signal<SyncStatus>({ state: 'signed_out', lastSyncedAt: null, pending: 0, notices: [] });
export const timerState = signal<ActiveTimerState>(idleTimerState());
/** Aktuelle Zeit für Anzeigen, alle 250 ms aktualisiert (die Zeitmessung selbst nutzt Zeitstempel) */
export const now = signal(Date.now());

/** Gefiltert auf den aktuellen Modus (Lernen/Arbeit) */
export const workspace = computed<Workspace>(() => prefs.value.workspace);

export const workspaceData = computed(() => {
  const e = entities.value;
  const ws = workspace.value;
  const projects = e.projects.filter((p) => p.mode === ws);
  const ids = new Set(projects.map((p) => p.id));
  return {
    projects,
    milestones: e.milestones.filter((m) => ids.has(m.project_id)),
    work_packages: e.work_packages.filter((w) => ids.has(w.project_id)),
    tasks: e.tasks.filter((t) => ids.has(t.project_id)),
    time_logs: e.time_logs.filter((l) => (l.project_id ? ids.has(l.project_id) : l.workspace === ws)),
    planned_blocks: e.planned_blocks.filter((b) => (b.project_id ? ids.has(b.project_id) : b.workspace === ws)),
  };
});

/** Snapshot für Kennzahlen/Health (alle Modi) */
export const snapshot = computed<PlannerSnapshot>(() => {
  const e = entities.value;
  return { projects: e.projects, milestones: e.milestones, work_packages: e.work_packages, tasks: e.tasks, time_logs: e.time_logs };
});

/** Abfragen über alle Tabellen live halten */
export function watchDatabase(db: PlannerDB): () => void {
  const subs = [
    liveQuery(async () => {
      const rows = await Promise.all(ENTITY_TABLES.map((t) => db.table(t).toArray()));
      const out = emptyEntities() as Record<EntityTable, unknown[]>;
      ENTITY_TABLES.forEach((t, i) => {
        out[t] = (rows[i] as { is_deleted: boolean }[]).filter((r) => !r.is_deleted);
      });
      return out as Entities;
    }).subscribe({
      next: (value) => { entities.value = value; loaded.value = true; },
      error: (err) => console.error('Datenbank-Abfrage fehlgeschlagen', err),
    }),
    liveQuery(() => loadLocalSettings(db)).subscribe({
      next: (value) => { settings.value = value; },
      error: (err) => console.error('Einstellungen nicht lesbar', err),
    }),
  ];
  return () => subs.forEach((s) => s.unsubscribe());
}

/**
 * Takt für Anzeigen. Viertelsekunden statt Sekundengrenzen der Uhr: Phasen beginnen zu beliebigen
 * Millisekunden, die Restzeit springt daher nicht synchron zur Systemuhr um.
 */
export function startClock(): () => void {
  const id = setInterval(() => { now.value = Date.now(); }, 250);
  return () => clearInterval(id);
}
