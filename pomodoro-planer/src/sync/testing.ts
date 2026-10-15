/**
 * Hilfen für Mehrgeräte-Tests der Sync-Schicht: jedes Gerät hat eine eigene IndexedDB
 * (eindeutiger Name), ein Repository mit steuerbarer Uhr, eine MemoryRemote-Verbindung
 * zum gemeinsamen MemoryServer sowie SyncEngine und TimerSync.
 */
import { PlannerDB } from '../data/db';
import { Repository, newId } from '../data/repository';
import type {
  EntityInput, Milestone, PlannedBlock, Project, Task, TimeLog, WorkPackage,
} from '../data/types';
import { MemoryRemote, type MemoryServer } from './memoryRemote';
import { SyncEngine, type SyncEngineOptions } from './syncEngine';
import { TimerSync } from './timerSync';

export interface TestDevice {
  name: string;
  db: PlannerDB;
  repo: Repository;
  remote: MemoryRemote;
  engine: SyncEngine;
  timer: TimerSync;
  /** Netz des Geräts (navigator.onLine und Erreichbarkeit des Servers) */
  online: boolean;
  setOnline(value: boolean): void;
}

export interface TestDeviceOptions extends Partial<Omit<SyncEngineOptions, 'repo' | 'remote'>> {
  name?: string;
  /** Geräteuhr (Epoch-ms) */
  clock: () => number;
}

export async function createTestDevice(server: MemoryServer, opts: TestDeviceOptions): Promise<TestDevice> {
  const { name = 'device', clock, ...engineOpts } = opts;
  const db = new PlannerDB(`sync-test-${name}-${newId()}`);
  const repo = await Repository.open(db, clock);
  const remote = new MemoryRemote(server);
  const device: TestDevice = {
    name,
    db,
    repo,
    remote,
    online: true,
    setOnline(value) {
      device.online = value;
      remote.setOnline(value);
    },
    engine: undefined as unknown as SyncEngine,
    timer: undefined as unknown as TimerSync,
  };
  device.engine = new SyncEngine({
    repo, remote, env: null, now: clock, isOnline: () => device.online, ...engineOpts,
  });
  device.timer = new TimerSync({ repo, remote, env: null, now: clock, isOnline: () => device.online });
  return device;
}

/* ---------- Testdaten ---------- */

export const projectInput = (over: Partial<EntityInput<Project>> = {}): EntityInput<Project> => ({
  project_code: 'MATHE', name: 'Mathe', mode: 'study', status: 'active', color: '#2a78d6',
  planned_hours: 40, start_date: null, end_date: null, notes: '', sort_order: 0, ...over,
});

export const milestoneInput = (project_id: string, over: Partial<EntityInput<Milestone>> = {}): EntityInput<Milestone> => ({
  project_id, ms_code: 'MS-1', title: 'Zwischenprüfung', target_date: '2026-11-30', status: 'open', notes: '', sort_order: 0, ...over,
});

export const workPackageInput = (project_id: string, over: Partial<EntityInput<WorkPackage>> = {}): EntityInput<WorkPackage> => ({
  project_id, milestone_id: null, ap_code: 'AP-1', title: 'Analysis', planned_hours: 10,
  start_date: null, end_date: '2026-11-15', notes: '', sort_order: 0, ...over,
});

export const taskInput = (project_id: string, over: Partial<EntityInput<Task>> = {}): EntityInput<Task> => ({
  project_id, work_package_id: null, title: 'Übung', status: 'todo', priority: 'medium', due_date: null,
  estimated_hours: 1, estimated_pomodoros: 2, notes: '', completed_at: null, sort_order: 0, ...over,
});

export const timeLogInput = (over: Partial<EntityInput<TimeLog>> = {}): EntityInput<TimeLog> => ({
  project_id: null, work_package_id: null, task_id: null, workspace: 'study', mode: 'pomodoro',
  start_time: 0, end_time: 1_500_000, duration_seconds: 1500, counts_as_pomodoro: true, comment: '', ...over,
});

export const plannedBlockInput = (over: Partial<EntityInput<PlannedBlock>> = {}): EntityInput<PlannedBlock> => ({
  project_id: null, work_package_id: null, task_id: null, workspace: 'study', title: 'Lernblock',
  start_time: 0, end_time: 3_600_000, notes: '', ...over,
});

/** Vollständige Server-Zeile eines fremden Geräts (für MemoryServer.injectLate u. Ä.) */
export function remoteProject(at: number, over: Partial<Project> = {}): Project {
  return {
    ...projectInput(), id: newId(), created_at: at, updated_at: at, updated_by: 'device-x', is_deleted: false, ...over,
  };
}

/** Zeile ohne lokale Hilfsfelder (für Vergleiche zwischen Geräten) */
export function withoutLocal<T extends object>(row: T | undefined): Partial<T> | undefined {
  if (!row) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v;
  return out as Partial<T>;
}
