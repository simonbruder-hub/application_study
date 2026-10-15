/**
 * Repository: einzige Stelle, an der fachliche Daten lokal geschrieben werden.
 * - vergibt id / created_at / updated_at (Hybrid Logical Clock) / updated_by
 * - markiert geänderte Zeilen als _dirty = 1 (Outbox für die Sync-Engine)
 * - Soft-Delete mit Kaskaden-Regeln
 * - Batch-Schreiben in einer Transaktion (z. B. Excel-Import)
 * - applyRemote(): vom Server gezogene Zeilen nach Last-Writer-Wins übernehmen
 */
import { META, type PlannerDB } from './db';
import {
  ENTITY_TABLES, type AnyEntity, type EntityInput, type EntityMap, type EntityTable,
} from './types';
import { HybridClock, isNewer } from '../sync/hlc';

export type Row<K extends EntityTable> = EntityMap[K];
export type Patch<K extends EntityTable> = Partial<EntityInput<EntityMap[K]>>;

export type BatchOp =
  | { op: 'create'; table: EntityTable; row: Record<string, unknown> & { id?: string } }
  | { op: 'update'; table: EntityTable; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; table: EntityTable; id: string };

export interface BatchResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** IDs neu angelegter Zeilen in der Reihenfolge der ops (undefined bei anderen ops) */
  ids: (string | undefined)[];
}

/** Kaskaden beim Soft-Delete: löschen (delete) oder Verweis entfernen (unlink). */
const CASCADE: Partial<Record<EntityTable, { table: EntityTable; fk: string; action: 'delete' | 'unlink' }[]>> = {
  projects: [
    { table: 'milestones', fk: 'project_id', action: 'delete' },
    { table: 'work_packages', fk: 'project_id', action: 'delete' },
    { table: 'tasks', fk: 'project_id', action: 'delete' },
    { table: 'planned_blocks', fk: 'project_id', action: 'delete' },
    // time_logs bleiben als Historie erhalten
  ],
  milestones: [{ table: 'work_packages', fk: 'milestone_id', action: 'unlink' }],
  work_packages: [
    { table: 'tasks', fk: 'work_package_id', action: 'delete' },
    { table: 'planned_blocks', fk: 'work_package_id', action: 'unlink' },
  ],
  tasks: [{ table: 'planned_blocks', fk: 'task_id', action: 'unlink' }],
};

const SYNC_KEYS = new Set(['id', 'user_id', 'created_at', 'updated_at', 'updated_by', 'is_deleted']);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback (RFC 4122 v4) für ältere Browser / unsichere Kontexte
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Repository {
  private listeners = new Set<(tables: EntityTable[]) => void>();

  constructor(
    readonly db: PlannerDB,
    readonly clock: HybridClock,
    readonly deviceId: string,
  ) {}

  /** Öffnet das Repository: lädt bzw. erzeugt Geräte-ID und Uhrstand. */
  static async open(db: PlannerDB, wall: () => number = Date.now): Promise<Repository> {
    let deviceId = await db.getMeta<string>(META.deviceId);
    if (!deviceId) {
      deviceId = newId();
      await db.setMeta(META.deviceId, deviceId);
    }
    const last = (await db.getMeta<number>(META.clock)) ?? 0;
    return new Repository(db, new HybridClock(last, wall), deviceId);
  }

  /** Benachrichtigung nach lokalen Änderungen (Sync-Engine plant daraufhin einen Push). */
  onLocalChange(fn: (tables: EntityTable[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(tables: Set<EntityTable>): void {
    if (!tables.size) return;
    const list = [...tables];
    this.listeners.forEach((fn) => fn(list));
  }

  private stamp(): { updated_at: number; updated_by: string } {
    return { updated_at: this.clock.now(), updated_by: this.deviceId };
  }

  /** Fachliche Regeln, die bei jedem Schreiben gelten */
  private applyRules(table: EntityTable, row: Record<string, unknown>, prev?: Record<string, unknown>): void {
    if (table === 'tasks') {
      if (row.status === 'done' && !row.completed_at) row.completed_at = (prev?.completed_at as number) || Date.now();
      if (row.status !== 'done') row.completed_at = null;
    }
  }

  async get<K extends EntityTable>(table: K, id: string): Promise<Row<K> | undefined> {
    return (await this.db.table(table).get(id)) as Row<K> | undefined;
  }

  async list<K extends EntityTable>(table: K, opts: { includeDeleted?: boolean } = {}): Promise<Row<K>[]> {
    const all = (await this.db.table(table).toArray()) as Row<K>[];
    return opts.includeDeleted ? all : all.filter((r) => !r.is_deleted);
  }

  async create<K extends EntityTable>(table: K, input: EntityInput<Row<K>> & { id?: string }): Promise<Row<K>> {
    const res = await this.applyBatch([{ op: 'create', table, row: input as Record<string, unknown> & { id?: string } }]);
    return (await this.get(table, res.ids[0]!))!;
  }

  async update<K extends EntityTable>(table: K, id: string, patch: Patch<K>): Promise<Row<K> | undefined> {
    await this.applyBatch([{ op: 'update', table, id, patch: patch as Record<string, unknown> }]);
    return this.get(table, id);
  }

  async softDelete(table: EntityTable, id: string): Promise<number> {
    const res = await this.applyBatch([{ op: 'delete', table, id }]);
    return res.deleted;
  }

  /**
   * Mehrere Änderungen atomar schreiben. Unveränderte Updates werden übersprungen
   * (kein neues updated_at → keine unnötigen Sync-Konflikte).
   */
  async applyBatch(ops: BatchOp[]): Promise<BatchResult> {
    const result: BatchResult = { created: 0, updated: 0, deleted: 0, unchanged: 0, ids: [] };
    const touched = new Set<EntityTable>();
    const tables = ENTITY_TABLES.map((t) => this.db.table(t));
    await this.db.transaction('rw', [...tables, this.db.meta], async () => {
      for (const op of ops) {
        const tbl = this.db.table(op.table);
        if (op.op === 'create') {
          const id = op.row.id || newId();
          const existing = (await tbl.get(id)) as AnyEntity | undefined;
          if (existing && !existing.is_deleted) {
            // Upsert-Semantik: vorhandene ID → als Update behandeln
            const changed = await this.updateRow(op.table, existing, op.row);
            if (changed) { result.updated++; touched.add(op.table); } else result.unchanged++;
            result.ids.push(id);
            continue;
          }
          const s = this.stamp();
          const row: Record<string, unknown> = {
            ...stripSync(op.row), id, created_at: existing?.created_at ?? s.updated_at, ...s, is_deleted: false, _dirty: 1,
          };
          this.applyRules(op.table, row);
          await tbl.put(row);
          result.created++;
          result.ids.push(id);
          touched.add(op.table);
        } else if (op.op === 'update') {
          result.ids.push(undefined);
          const cur = (await tbl.get(op.id)) as AnyEntity | undefined;
          if (!cur || cur.is_deleted) { result.unchanged++; continue; }
          const changed = await this.updateRow(op.table, cur, op.patch);
          if (changed) { result.updated++; touched.add(op.table); } else result.unchanged++;
        } else {
          result.ids.push(undefined);
          const n = await this.deleteCascade(op.table, op.id, touched);
          result.deleted += n;
          if (!n) result.unchanged++;
        }
      }
      await this.db.meta.put({ key: META.clock, value: this.clock.value });
    });
    this.emit(touched);
    return result;
  }

  private async updateRow(table: EntityTable, cur: AnyEntity, patch: Record<string, unknown>): Promise<boolean> {
    const next: Record<string, unknown> = { ...cur };
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (SYNC_KEYS.has(k) || k.startsWith('_') || v === undefined) continue;
      if (!sameValue((cur as unknown as Record<string, unknown>)[k], v)) { next[k] = v; changed = true; }
    }
    if (!changed) return false;
    this.applyRules(table, next, cur as unknown as Record<string, unknown>);
    Object.assign(next, this.stamp(), { _dirty: 1 });
    await this.db.table(table).put(next);
    return true;
  }

  private async deleteCascade(table: EntityTable, id: string, touched: Set<EntityTable>): Promise<number> {
    const tbl = this.db.table(table);
    const cur = (await tbl.get(id)) as AnyEntity | undefined;
    if (!cur || cur.is_deleted) return 0;
    await tbl.put({ ...cur, ...this.stamp(), is_deleted: true, _dirty: 1 });
    touched.add(table);
    let n = 1;
    for (const rule of CASCADE[table] ?? []) {
      const children = (await this.db.table(rule.table).where(rule.fk).equals(id).toArray()) as AnyEntity[];
      for (const child of children) {
        if (child.is_deleted) continue;
        if (rule.action === 'delete') n += await this.deleteCascade(rule.table, child.id, touched);
        else {
          await this.db.table(rule.table).put({ ...child, [rule.fk]: null, ...this.stamp(), _dirty: 1 });
          touched.add(rule.table);
        }
      }
    }
    return n;
  }

  /* ---------- Schnittstelle für die Sync-Engine ---------- */

  async dirtyRows<K extends EntityTable>(table: K): Promise<Row<K>[]> {
    return (await this.db.table(table).where('_dirty').equals(1).toArray()) as Row<K>[];
  }

  /** Nach erfolgreichem Push: nur als sauber markieren, wenn die Zeile seitdem nicht erneut geändert wurde. */
  async markClean(table: EntityTable, pushed: { id: string; updated_at: number; updated_by: string }[]): Promise<void> {
    const tbl = this.db.table(table);
    await this.db.transaction('rw', tbl, async () => {
      for (const p of pushed) {
        const cur = (await tbl.get(p.id)) as AnyEntity | undefined;
        if (cur && cur._dirty && cur.updated_at === p.updated_at && cur.updated_by === p.updated_by) {
          await tbl.put({ ...cur, _dirty: 0 });
        }
      }
    });
  }

  /**
   * Vom Server gezogene Zeilen übernehmen (Last-Writer-Wins nach updated_at, updated_by).
   * Lokale, neuere ungesyncte Änderungen bleiben erhalten und werden später gepusht.
   */
  async applyRemote<K extends EntityTable>(table: K, rows: Row<K>[]): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;
    const tbl = this.db.table(table);
    await this.db.transaction('rw', [tbl, this.db.meta], async () => {
      for (const r of rows) {
        this.clock.observe(r.updated_at);
        const cur = (await tbl.get(r.id)) as AnyEntity | undefined;
        if (!cur || isNewer(r, cur)) {
          await tbl.put({ ...stripLocal(r), _dirty: 0 });
          applied++;
        } else if (cur._dirty && cur.updated_at === r.updated_at && cur.updated_by === r.updated_by) {
          await tbl.put({ ...cur, _dirty: 0 }); // eigene Änderung kam als Echo zurück
          skipped++;
        } else skipped++;
      }
      await this.db.meta.put({ key: META.clock, value: this.clock.value });
    });
    return { applied, skipped };
  }
}

function stripSync(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SYNC_KEYS.has(k) && !k.startsWith('_')) out[k] = v;
  return out;
}

export function stripLocal<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v;
  return out as T;
}
