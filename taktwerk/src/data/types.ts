/**
 * Domänenmodell v2 – gemeinsamer Vertrag für lokale DB (Dexie), Supabase-Schema,
 * Sync-Engine, Health-Engine und Excel-Schnittstelle.
 *
 * Konventionen
 * - Feldnamen in snake_case, 1:1 wie die Spalten in Postgres (kein Mapping-Layer nötig).
 * - IDs: UUID v4, auf dem Client erzeugt (crypto.randomUUID) → offline anlegbar.
 * - Zeitpunkte (timestamptz) lokal als Epoch-Millisekunden (number). Die Remote-Schicht
 *   wandelt an der Grenze in ISO-8601 um (siehe TIMESTAMP_COLUMNS).
 * - Reine Kalenderdaten (date) als 'YYYY-MM-DD'-String in lokaler Zeit des Nutzers.
 * - Lokale Hilfsfelder beginnen mit '_' und werden nie zum Server übertragen.
 */

export type Workspace = 'study' | 'work';
export type ProjectStatus = 'active' | 'paused' | 'archived';
export type MilestoneStatus = 'open' | 'achieved' | 'delayed';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TimeLogMode = 'pomodoro' | 'stopwatch' | 'manual';

export const WORKSPACES: readonly Workspace[] = ['study', 'work'];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'archived'];
export const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['open', 'achieved', 'delayed'];
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
export const TIME_LOG_MODES: readonly TimeLogMode[] = ['pomodoro', 'stopwatch', 'manual'];

/** Felder, die jede synchronisierte Zeile besitzt. */
export interface SyncFields {
  /** UUID v4 */
  id: string;
  /** Besitzer; vom Server gesetzt (auth.uid()), lokal optional. */
  user_id?: string | null;
  /** Epoch-ms der Erstellung */
  created_at: number;
  /**
   * Epoch-ms der letzten fachlichen Änderung. Wird von der Hybrid Logical Clock
   * vergeben (monoton, nie kleiner als jede bereits gesehene Änderung).
   * Konfliktregel überall: Last-Writer-Wins nach (updated_at, updated_by).
   */
  updated_at: number;
  /** Geräte-ID des letzten Schreibers – Tie-Breaker bei gleichem updated_at. */
  updated_by: string;
  /** Soft-Delete: gelöschte Zeilen bleiben erhalten, damit andere Geräte die Löschung sehen. */
  is_deleted: boolean;
}

/** Nur lokal (IndexedDB): 1 = noch nicht zum Server übertragen. */
export interface LocalFields {
  _dirty?: 0 | 1;
}

export interface Project extends SyncFields, LocalFields {
  /** Eindeutig je Nutzer (unter nicht gelöschten), z. B. "MATHE1". Für Excel-Verknüpfungen. */
  project_code: string;
  name: string;
  mode: Workspace;
  status: ProjectStatus;
  /** '#RRGGBB' */
  color: string;
  /** Gesamtbudget (Soll) in Stunden */
  planned_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  sort_order: number;
  /** Tags (Namen), z. B. ["Coding", "Lernen"]; Farben stehen in UserSettings.tag_colors */
  tags?: string[];
}

export interface Milestone extends SyncFields, LocalFields {
  project_id: string;
  /** Eindeutig je Projekt, z. B. "MS-1" */
  ms_code: string;
  title: string;
  target_date: string | null;
  status: MilestoneStatus;
  notes: string;
  sort_order: number;
}

export interface WorkPackage extends SyncFields, LocalFields {
  project_id: string;
  milestone_id: string | null;
  /** Eindeutig je Projekt, z. B. "AP-1.1" */
  ap_code: string;
  title: string;
  /** Soll-Stunden */
  planned_hours: number | null;
  start_date: string | null;
  /** Deadline */
  end_date: string | null;
  notes: string;
  sort_order: number;
}

export interface Task extends SyncFields, LocalFields {
  project_id: string;
  work_package_id: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  estimated_hours: number | null;
  estimated_pomodoros: number | null;
  notes: string;
  /** Epoch-ms, gesetzt wenn status → 'done' */
  completed_at: number | null;
  sort_order: number;
}

export interface TimeLog extends SyncFields, LocalFields {
  project_id: string | null;
  work_package_id: string | null;
  task_id: string | null;
  /** Lern- oder Arbeitszeit; nötig für Einträge ohne Projekt */
  workspace: Workspace;
  mode: TimeLogMode;
  /** Epoch-ms */
  start_time: number;
  /** Epoch-ms */
  end_time: number;
  /** Effektive Arbeitszeit ohne Unterbrechungen */
  duration_seconds: number;
  /** Zählt als vollständiger Pomodoro (für Statistik und Task-Fortschritt in Pomodoros) */
  counts_as_pomodoro: boolean;
  comment: string;
}

/** Geplanter Lern-/Arbeitsblock im Kalender (Soll-Seite des Tagesablaufs) */
export interface PlannedBlock extends SyncFields, LocalFields {
  project_id: string | null;
  work_package_id: string | null;
  task_id: string | null;
  workspace: Workspace;
  title: string;
  /** Epoch-ms */
  start_time: number;
  /** Epoch-ms */
  end_time: number;
  notes: string;
}

export type TimerKind = 'pomodoro' | 'stopwatch';
export type TimerPhase = 'focus' | 'short_break' | 'long_break';
export type TimerStatus = 'idle' | 'running' | 'paused';

/**
 * Zustand des laufenden Timers – genau eine Zeile je Nutzer, live über Supabase Realtime
 * zwischen Geräten gespiegelt. Laufzeit wird nie hochgezählt, sondern immer aus
 * Zeitstempeln berechnet: elapsed = accumulated_ms + (now - segment_started_at).
 */
export interface ActiveTimerState {
  /** = user_id auf dem Server; lokal 'local' */
  id: string;
  /** ID der aktuellen Sitzung; wird zur ID des TimeLogs → doppeltes Speichern auf zwei Geräten unmöglich */
  session_id: string | null;
  kind: TimerKind;
  phase: TimerPhase;
  status: TimerStatus;
  workspace: Workspace;
  project_id: string | null;
  work_package_id: string | null;
  task_id: string | null;
  /** Geplante Dauer der Phase in Sekunden (nur Pomodoro) */
  planned_seconds: number | null;
  /** Bereits abgeschlossene Laufzeit vor dem aktuellen Segment */
  accumulated_ms: number;
  /** Start des aktuellen Laufsegments (Epoch-ms) oder null wenn pausiert/idle */
  segment_started_at: number | null;
  /** Start der Sitzung (erste Aktivierung) */
  session_started_at: number | null;
  /** Abgeschlossene Fokus-Runden im aktuellen Zyklus */
  cycle: number;
  updated_at: number;
  updated_by: string;
}

export interface UserSettings {
  id: string;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
  auto_start_breaks: boolean;
  auto_start_focus: boolean;
  daily_goal_minutes: number;
  /** Schwellwerte der Health-Engine (Std./Tag) */
  health_red_daily_hours: number;
  health_yellow_daily_hours: number;
  milestone_red_daily_hours: number;
  milestone_yellow_daily_hours: number;
  /** Farbe je Tag-Name ('#RRGGBB') */
  tag_colors?: Record<string, string>;
  updated_at: number;
  updated_by: string;
}

/** Alle synchronisierten Entitätstabellen in Abhängigkeitsreihenfolge (Eltern vor Kindern). */
export const ENTITY_TABLES = ['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks'] as const;
export type EntityTable = (typeof ENTITY_TABLES)[number];

export interface EntityMap {
  projects: Project;
  milestones: Milestone;
  work_packages: WorkPackage;
  tasks: Task;
  time_logs: TimeLog;
  planned_blocks: PlannedBlock;
}
export type AnyEntity = EntityMap[EntityTable];

/** Spalten mit timestamptz-Typ je Tabelle → lokal Epoch-ms, remote ISO-8601. */
export const TIMESTAMP_COLUMNS: Record<EntityTable, readonly string[]> = {
  projects: ['created_at', 'updated_at'],
  milestones: ['created_at', 'updated_at'],
  work_packages: ['created_at', 'updated_at'],
  tasks: ['created_at', 'updated_at', 'completed_at'],
  time_logs: ['created_at', 'updated_at', 'start_time', 'end_time'],
  planned_blocks: ['created_at', 'updated_at', 'start_time', 'end_time'],
};

/** Fachliche Felder einer Entität (ohne Sync- und lokale Felder) – für Anlegen/Ändern. */
export type EntityInput<T extends AnyEntity> = Omit<T, keyof SyncFields | keyof LocalFields>;

export const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'updated_at' | 'updated_by'> = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  long_break_every: 4,
  auto_start_breaks: true,
  auto_start_focus: false,
  daily_goal_minutes: 240,
  health_red_daily_hours: 6,
  health_yellow_daily_hours: 3,
  milestone_red_daily_hours: 6,
  milestone_yellow_daily_hours: 3.5,
};
