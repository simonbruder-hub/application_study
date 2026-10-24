/**
 * Lokale Datenbank (IndexedDB über Dexie) – Offline-First: jede Aktion wird sofort
 * hier gespeichert; die Sync-Engine gleicht später mit Supabase ab.
 */
import Dexie, { type Table } from 'dexie';
import type {
  ActiveTimerState, Milestone, PlannedBlock, Project, Task, TimeLog, UserSettings, WorkPackage,
} from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Schlüssel in der meta-Tabelle */
export const META = {
  deviceId: 'device_id',
  clock: 'hlc',
  lastSyncedAt: 'last_synced_at',
  cursor: (table: string) => `cursor:${table}`,
  settings: 'settings',
  activeTimer: 'active_timer',
  migratedV1: 'migrated_v1',
} as const;

export class PlannerDB extends Dexie {
  projects!: Table<Project, string>;
  milestones!: Table<Milestone, string>;
  work_packages!: Table<WorkPackage, string>;
  tasks!: Table<Task, string>;
  time_logs!: Table<TimeLog, string>;
  planned_blocks!: Table<PlannedBlock, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'pomodoro-planer') {
    super(name);
    // Hinweis: Booleans sind in IndexedDB nicht indexierbar → _dirty ist 0/1.
    this.version(1).stores({
      projects: 'id, project_code, mode, status, _dirty',
      milestones: 'id, project_id, _dirty',
      work_packages: 'id, project_id, milestone_id, _dirty',
      tasks: 'id, project_id, work_package_id, status, due_date, _dirty',
      time_logs: 'id, project_id, work_package_id, task_id, start_time, _dirty',
      planned_blocks: 'id, project_id, work_package_id, task_id, start_time, _dirty',
      meta: 'key',
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await this.meta.get(key);
    return row?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

export type { ActiveTimerState, UserSettings };
