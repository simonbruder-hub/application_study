import { beforeEach, describe, expect, it, vi } from 'vitest';
import { META } from '../data/db';
import { newId } from '../data/repository';
import type { EntityTable, Project } from '../data/types';
import { MemoryRemote, MemoryServer } from './memoryRemote';
import { RemoteError, type PullCursor } from './remote';
import { SyncEngine, loadLocalSettings } from './syncEngine';
import {
  createTestDevice, milestoneInput, plannedBlockInput, projectInput, remoteProject, taskInput, timeLogInput,
  withoutLocal, workPackageInput, type TestDeviceOptions,
} from './testing';
import type { Timers } from './runtime';

const START = Date.UTC(2026, 9, 15, 8, 0, 0);
let world: { t: number };
let server: MemoryServer;

beforeEach(() => {
  world = { t: START };
  server = new MemoryServer({ now: () => world.t });
});

function device(name: string, opts: Partial<TestDeviceOptions> & { skewMs?: number } = {}) {
  const { skewMs = 0, ...rest } = opts;
  return createTestDevice(server, { name, clock: () => world.t + skewMs, ...rest });
}

/** Zeichnet Push-Aufrufe eines Geräts auf (Tabelle + IDs) */
function recordPushes(dev: Awaited<ReturnType<typeof device>>) {
  const calls: { table: EntityTable; ids: string[] }[] = [];
  const push = dev.remote.push.bind(dev.remote);
  dev.remote.push = async (table, rows) => {
    calls.push({ table, ids: rows.map((r) => r.id) });
    return push(table, rows);
  };
  return calls;
}

describe('SyncEngine – Grundablauf', () => {
  it('überträgt eine auf A angelegte Zeile zu B', async () => {
    const a = await device('A');
    const b = await device('B');
    const p = await a.repo.create('projects', projectInput());
    expect(await a.engine.pendingCount()).toBe(1);

    await a.engine.syncNow();
    expect((await a.repo.get('projects', p.id))!._dirty).toBe(0);
    expect(server.row('projects', p.id)).toMatchObject({ project_code: 'MATHE', updated_by: a.repo.deviceId });

    await b.engine.syncNow();
    const onB = await b.repo.get('projects', p.id);
    expect(withoutLocal(onB)).toEqual(withoutLocal(p));
    expect(onB!._dirty).toBe(0);
    expect(b.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0, lastSyncedAt: START });
    expect(await b.db.getMeta(META.lastSyncedAt)).toBe(START);
  });

  it('meldet signed_out ohne Remote bzw. ohne Anmeldung', async () => {
    const a = await device('A');
    const local = new SyncEngine({ repo: a.repo, remote: null, env: null });
    await a.repo.create('projects', projectInput());
    await local.syncNow();
    expect(local.getStatus()).toMatchObject({ state: 'signed_out', pending: 1 });

    a.remote.signedIn = false;
    await a.engine.syncNow();
    expect(a.engine.getStatus().state).toBe('signed_out');
    expect(server.rows('projects')).toHaveLength(0);
  });

  it('wechselt bei abgelaufener Anmeldung während des Laufs zu signed_out und behält die Outbox', async () => {
    const a = await device('A');
    await a.repo.create('projects', projectInput());
    a.remote.push = async () => { throw new RemoteError('auth', 'JWT expired'); };
    await a.engine.syncNow();
    expect(a.engine.getStatus()).toMatchObject({ state: 'signed_out', pending: 1 });
  });

  it('bindet die lokale Datenbank an das erste Konto und überträgt nie in ein anderes', async () => {
    const a = await device('A');
    await a.repo.create('projects', projectInput()); // vor der Anmeldung lokal erfasst
    await a.engine.syncNow();
    expect(server.rows('projects')).toHaveLength(1);

    const otherAccount = new MemoryServer({ userId: 'user-2', now: () => world.t });
    await a.repo.create('projects', projectInput({ project_code: 'PRIVAT' }));
    const switched = new SyncEngine({ repo: a.repo, remote: new MemoryRemote(otherAccount), env: null, isOnline: () => true });
    await switched.syncNow();
    expect(switched.getStatus().state).toBe('error');
    expect(switched.getStatus().error).toContain('anderen Konto');
    expect(otherAccount.rows('projects')).toHaveLength(0);
    expect(await switched.pendingCount()).toBe(1);
  });

  it('legt gleichzeitige syncNow-Aufrufe zu einem Folgelauf zusammen', async () => {
    const a = await device('A');
    let runs = 0;
    const serverNow = a.remote.serverNow.bind(a.remote);
    a.remote.serverNow = async () => { runs++; return serverNow(); };
    const p1 = a.engine.syncNow();
    const p2 = a.engine.syncNow();
    const p3 = a.engine.syncNow();
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);
    await p1;
    expect(runs).toBe(2);
  });
});

describe('SyncEngine – Konflikte und Löschungen', () => {
  it('lässt gleichzeitige Offline-Änderungen nach Last-Writer-Wins konvergieren', async () => {
    const a = await device('A');
    const b = await device('B');
    const p = await a.repo.create('projects', projectInput());
    await a.engine.syncNow();
    await b.engine.syncNow();

    a.setOnline(false);
    b.setOnline(false);
    world.t += 1_000;
    await a.repo.update('projects', p.id, { name: 'Name von A', notes: 'nur A' });
    world.t += 1_000;
    await b.repo.update('projects', p.id, { name: 'Name von B' });
    a.setOnline(true);
    b.setOnline(true);

    // Die neuere Änderung (B) kommt zuerst an, die ältere (A) danach – der Server verwirft sie still
    await b.engine.syncNow();
    await a.engine.syncNow();
    await b.engine.syncNow();

    const onA = await a.repo.get('projects', p.id);
    const onB = await b.repo.get('projects', p.id);
    expect(onA!.name).toBe('Name von B');
    expect(withoutLocal(onA)).toEqual(withoutLocal(onB));
    expect(withoutLocal(server.row('projects', p.id))).toEqual(withoutLocal(onB));
    expect(await a.engine.pendingCount()).toBe(0);
    expect(await b.engine.pendingCount()).toBe(0);
  });

  it('überträgt Soft-Deletes inklusive Kaskade', async () => {
    const a = await device('A');
    const b = await device('B');
    const p = await a.repo.create('projects', projectInput());
    const ms = await a.repo.create('milestones', milestoneInput(p.id));
    const wp = await a.repo.create('work_packages', workPackageInput(p.id, { milestone_id: ms.id }));
    const task = await a.repo.create('tasks', taskInput(p.id, { work_package_id: wp.id }));
    const block = await a.repo.create('planned_blocks', plannedBlockInput({ project_id: p.id, task_id: task.id }));
    const log = await a.repo.create('time_logs', timeLogInput({ project_id: p.id, task_id: task.id }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.repo.list('tasks')).toHaveLength(1);

    world.t += 1_000;
    await a.repo.softDelete('projects', p.id);
    await a.engine.syncNow();
    await b.engine.syncNow();

    for (const table of ['projects', 'milestones', 'work_packages', 'tasks', 'planned_blocks'] as const) {
      expect(await b.repo.list(table)).toHaveLength(0);
    }
    expect((await b.repo.get('projects', p.id))!.is_deleted).toBe(true);
    expect((await b.repo.get('planned_blocks', block.id))!.is_deleted).toBe(true);
    // Zeiteinträge bleiben als Historie erhalten
    expect((await b.repo.get('time_logs', log.id))!.is_deleted).toBe(false);
    expect(server.row('tasks', task.id)!.is_deleted).toBe(true);
  });

  it('benennt bei Code-Konflikt das zweite Gerät um (MATHE → MATHE-2) und beide konvergieren', async () => {
    const a = await device('A');
    const b = await device('B');
    a.setOnline(false);
    b.setOnline(false);
    const pa = await a.repo.create('projects', projectInput({ project_code: 'MATHE', name: 'Mathe A' }));
    world.t += 10;
    const pb = await b.repo.create('projects', projectInput({ project_code: 'MATHE', name: 'Mathe B' }));
    const msB = await b.repo.create('milestones', milestoneInput(pb.id));
    a.setOnline(true);
    b.setOnline(true);

    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect((await b.repo.get('projects', pb.id))!.project_code).toBe('MATHE-2');
    expect((await a.repo.get('projects', pa.id))!.project_code).toBe('MATHE');
    const codes = (repo: typeof a.repo) => repo.list('projects').then((ps) => ps.map((p) => p.project_code).sort());
    expect(await codes(a.repo)).toEqual(['MATHE', 'MATHE-2']);
    expect(await codes(b.repo)).toEqual(['MATHE', 'MATHE-2']);
    expect(server.rows('projects').map((p) => p.project_code).sort()).toEqual(['MATHE', 'MATHE-2']);
    // Kind des umbenannten Projekts ging im selben Lauf mit
    expect(server.row('milestones', msB.id)).toBeDefined();
    expect(await b.engine.pendingCount()).toBe(0);
    expect(b.engine.getStatus().notices.join('\n')).toContain('«MATHE-2»');
  });

  it('wählt einen Code, der auch auf dem Server noch frei ist (case-insensitive)', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.repo.create('projects', projectInput({ project_code: 'MATHE' }));
    await a.repo.create('projects', projectInput({ project_code: 'mathe-2' }));
    await a.engine.syncNow();

    b.setOnline(false);
    const pb = await b.repo.create('projects', projectInput({ project_code: 'Mathe' }));
    b.setOnline(true);
    const pushes = recordPushes(b);
    await b.engine.syncNow();

    expect((await b.repo.get('projects', pb.id))!.project_code).toBe('Mathe-3');
    expect(pushes.filter((c) => c.table === 'projects')).toHaveLength(2);
    expect(await b.engine.pendingCount()).toBe(0);
  });

  it('hält beim Umbenennen die maximale Codelänge (32 Zeichen) ein', async () => {
    const a = await device('A');
    const b = await device('B');
    const long = 'A'.repeat(32);
    await a.repo.create('projects', projectInput({ project_code: long }));
    await a.engine.syncNow();
    const pb = await b.repo.create('projects', projectInput({ project_code: long }));
    await b.engine.syncNow();
    const renamed = (await b.repo.get('projects', pb.id))!.project_code;
    expect(renamed).toBe(`${'A'.repeat(30)}-2`);
    expect(renamed).toHaveLength(32);
  });

  // IDs erzwingen die ungünstige Reihenfolge: die neue Zeile wird vor der freigebenden übertragen
  const LOW_ID = '00000000-0000-4000-8000-000000000000';
  const HIGH_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

  it('benennt nicht um, wenn derselbe Push den Code freigibt (Löschen und neu Anlegen)', async () => {
    const a = await device('A');
    const old = await a.repo.create('projects', { id: HIGH_ID, ...projectInput({ project_code: 'MATHE' }) });
    await a.engine.syncNow();

    a.setOnline(false);
    world.t += 1_000;
    await a.repo.softDelete('projects', old.id);
    const fresh = await a.repo.create('projects', { id: LOW_ID, ...projectInput({ project_code: 'MATHE', name: 'Mathe neu' }) });
    a.setOnline(true);
    const pushes = recordPushes(a);
    await a.engine.syncNow();

    // Löschung zuerst gesendet → kein Konflikt, kein zweiter Versuch
    expect(pushes.filter((c) => c.table === 'projects')).toEqual([{ table: 'projects', ids: [HIGH_ID, LOW_ID] }]);
    expect((await a.repo.get('projects', fresh.id))!.project_code).toBe('MATHE');
    expect(server.row('projects', fresh.id)).toMatchObject({ project_code: 'MATHE', is_deleted: false });
    expect(server.row('projects', old.id)!.is_deleted).toBe(true);
    expect(a.engine.getStatus().notices).toEqual([]);
    expect(await a.engine.pendingCount()).toBe(0);
  });

  it('benennt nicht um, wenn eine andere Zeile ihren Code im selben Push abgibt', async () => {
    const a = await device('A');
    const old = await a.repo.create('projects', { id: HIGH_ID, ...projectInput({ project_code: 'MATHE' }) });
    await a.engine.syncNow();

    world.t += 1_000;
    await a.repo.update('projects', old.id, { project_code: 'MATHE-ALT' });
    const fresh = await a.repo.create('projects', { id: LOW_ID, ...projectInput({ project_code: 'MATHE', name: 'Mathe neu' }) });
    await a.engine.syncNow();

    expect((await a.repo.get('projects', fresh.id))!.project_code).toBe('MATHE');
    expect(server.row('projects', fresh.id)!.project_code).toBe('MATHE');
    expect(server.row('projects', old.id)!.project_code).toBe('MATHE-ALT');
    expect(a.engine.getStatus().notices).toEqual([]);
    expect(await a.engine.pendingCount()).toBe(0);
  });

  it('löst ms_code-Konflikte je Projekt auf', async () => {
    const a = await device('A');
    const b = await device('B');
    const p = await a.repo.create('projects', projectInput());
    const other = await a.repo.create('projects', projectInput({ project_code: 'PHYSIK' }));
    await a.repo.create('milestones', milestoneInput(other.id, { ms_code: 'MS-1' })); // anderes Projekt: kein Konflikt
    await a.engine.syncNow();
    await b.engine.syncNow();

    a.setOnline(false);
    b.setOnline(false);
    await a.repo.create('milestones', milestoneInput(p.id, { ms_code: 'MS-1' }));
    const msB = await b.repo.create('milestones', milestoneInput(p.id, { ms_code: 'MS-1' }));
    a.setOnline(true);
    b.setOnline(true);
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect((await b.repo.get('milestones', msB.id))!.ms_code).toBe('MS-1-2');
    expect(await b.engine.pendingCount()).toBe(0);
  });
});

describe('SyncEngine – Outbox und Reihenfolge', () => {
  it('bleibt offline lokal (Status offline, Zeilen dirty) und überträgt später', async () => {
    const a = await device('A');
    a.setOnline(false);
    const p = await a.repo.create('projects', projectInput());
    await a.engine.syncNow();
    expect(a.engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 });
    expect((await a.repo.get('projects', p.id))!._dirty).toBe(1);

    // Gerät meint online zu sein, Server aber nicht erreichbar → ebenfalls offline
    a.online = true;
    await a.engine.syncNow();
    expect(a.engine.getStatus().state).toBe('offline');
    expect(a.engine.getStatus().error).toContain('nicht erreichbar');
    expect((await a.repo.get('projects', p.id))!._dirty).toBe(1);

    a.setOnline(true);
    await a.engine.syncNow();
    expect(a.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 });
    expect(a.engine.getStatus().error).toBeUndefined();
    expect(server.row('projects', p.id)).toBeDefined();
  });

  it('lässt eine Änderung während des Push dirty und überträgt sie im nächsten Lauf', async () => {
    const a = await device('A');
    const p = await a.repo.create('projects', projectInput());
    const push = a.remote.push.bind(a.remote);
    let changed = false;
    a.remote.push = async (table, rows) => {
      if (!changed && table === 'projects') {
        changed = true;
        world.t += 10;
        await a.repo.update('projects', p.id, { name: 'während Push geändert' });
      }
      return push(table, rows);
    };

    await a.engine.syncNow();
    expect(server.row('projects', p.id)!.name).toBe('Mathe');
    expect((await a.repo.get('projects', p.id))!._dirty).toBe(1);
    expect(a.engine.getStatus().pending).toBe(1);

    await a.engine.syncNow();
    expect(server.row('projects', p.id)!.name).toBe('während Push geändert');
    expect((await a.repo.get('projects', p.id))!._dirty).toBe(0);
  });

  it('startet nach einer lokalen Änderung während eines Laufs automatisch einen Folgelauf', async () => {
    const a = await device('A', { debounceMs: 60_000 });
    const p = await a.repo.create('projects', projectInput());
    const push = a.remote.push.bind(a.remote);
    let changed = false;
    a.remote.push = async (table, rows) => {
      if (!changed && table === 'projects') {
        changed = true;
        await a.repo.update('projects', p.id, { name: 'nachgeschoben' });
      }
      return push(table, rows);
    };
    await a.engine.start(); // Promise umfasst auch den Folgelauf
    expect(server.row('projects', p.id)!.name).toBe('nachgeschoben');
    expect(await a.engine.pendingCount()).toBe(0);
    a.engine.stop();
  });

  it('überträgt Eltern vor Kindern, auch wenn alles im selben Batch entstand', async () => {
    const a = await device('A');
    a.setOnline(false);
    const [pid, msid, wpid, tid] = [newId(), newId(), newId(), newId()];
    // Absichtlich Kinder zuerst angelegt
    await a.repo.applyBatch([
      { op: 'create', table: 'planned_blocks', row: { ...plannedBlockInput({ project_id: pid, task_id: tid }) } },
      { op: 'create', table: 'time_logs', row: { ...timeLogInput({ project_id: pid, work_package_id: wpid, task_id: tid }) } },
      { op: 'create', table: 'tasks', row: { id: tid, ...taskInput(pid, { work_package_id: wpid }) } },
      { op: 'create', table: 'work_packages', row: { id: wpid, ...workPackageInput(pid, { milestone_id: msid }) } },
      { op: 'create', table: 'milestones', row: { id: msid, ...milestoneInput(pid) } },
      { op: 'create', table: 'projects', row: { id: pid, ...projectInput() } },
    ]);
    a.setOnline(true);
    const pushes = recordPushes(a);
    await a.engine.syncNow();

    expect(pushes.map((c) => c.table)).toEqual(['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks']);
    expect(await a.engine.pendingCount()).toBe(0);
    expect(a.engine.getStatus().notices).toEqual([]);
    expect(server.row('tasks', tid)).toBeDefined();
  });

  it('wiederholt abgelehnte Zeilen (Fremdschlüssel) höchstens dreimal je Version', async () => {
    const a = await device('A');
    const t = await a.repo.create('tasks', taskInput('gibt-es-nicht'));
    const pushes = recordPushes(a);
    for (let i = 0; i < 5; i++) await a.engine.syncNow();

    expect(pushes.filter((c) => c.table === 'tasks')).toHaveLength(3);
    expect((await a.repo.get('tasks', t.id))!._dirty).toBe(1);
    const notices = a.engine.getStatus().notices.join('\n');
    expect(notices).toContain('Aufgabe «Übung»');
    expect(notices).toContain('Verweis auf einen fehlenden Eintrag');
    expect(a.engine.getStatus()).toMatchObject({ state: 'idle', pending: 1 });

    // Neue Version (Verweis repariert) wird wieder übertragen
    const p = await a.repo.create('projects', projectInput());
    await a.repo.update('tasks', t.id, { project_id: p.id });
    await a.engine.syncNow();
    expect((await a.repo.get('tasks', t.id))!._dirty).toBe(0);
    expect(server.row('tasks', t.id)!.project_id).toBe(p.id);
  });

  it('meldet CHECK-Verletzungen mit Spalte', async () => {
    const a = await device('A');
    await a.repo.create('projects', projectInput({ status: 'unbekannt' as Project['status'] }));
    await a.engine.syncNow();
    expect(a.engine.getStatus().notices.join('\n')).toContain('ungültiger Wert in «status»');
    expect(await a.engine.pendingCount()).toBe(1);
  });
});

describe('SyncEngine – Pull-Cursor', () => {
  it('findet einen verspäteten Commit innerhalb des Überlappungsfensters', async () => {
    const a = await device('A');
    const noOverlap = await device('C', { overlapMs: 0 });
    await a.repo.create('projects', projectInput());
    await a.engine.syncNow();
    await noOverlap.engine.syncNow();
    const cursor = await a.db.getMeta<PullCursor>(META.cursor('projects'));
    expect(cursor!.ts).toMatch(/\.\d{6}\+00:00$/);

    // Transaktion eines anderen Geräts begann 5 s vor dem Pull, wurde aber erst danach sichtbar
    world.t += 1_000;
    const late = remoteProject(world.t, { project_code: 'SPAET' });
    const ts = server.injectLate('projects', late, 5_000);
    expect(ts < cursor!.ts).toBe(true);

    await a.engine.syncNow();
    await noOverlap.engine.syncNow();
    expect(await a.repo.get('projects', late.id)).toBeDefined();
    expect(await noOverlap.repo.get('projects', late.id)).toBeUndefined(); // ohne Fenster übersehen
    // Cursor wird nie zurückgesetzt
    expect((await a.db.getMeta<PullCursor>(META.cursor('projects')))!.ts).toBe(cursor!.ts);
  });

  it('zieht mehr als pageSize Zeilen seitenweise (auch bei gleichen Server-Zeitstempeln)', async () => {
    server = new MemoryServer({ now: () => world.t, transactionTimestamps: true });
    const a = await device('A', { pageSize: 100 });
    const b = await device('B', { pageSize: 40 });
    await a.repo.applyBatch(
      Array.from({ length: 250 }, (_, i) => ({
        op: 'create' as const, table: 'projects' as const,
        row: { ...projectInput({ project_code: `P${String(i).padStart(3, '0')}`, sort_order: i }) },
      })),
    );
    const pushes = recordPushes(a);
    await a.engine.syncNow();
    expect(pushes.map((c) => c.ids.length)).toEqual([100, 100, 50]);

    let pulls = 0;
    const pull = b.remote.pull.bind(b.remote);
    b.remote.pull = async (table, after, limit) => {
      if (table === 'projects') pulls++;
      return pull(table, after, limit);
    };
    await b.engine.syncNow();
    expect(await b.repo.list('projects')).toHaveLength(250);
    expect(pulls).toBe(7); // 6 volle Seiten à 40 + Rest 10
  });

  it('meldet übernommene Tabellen über onRemoteChange', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.repo.create('projects', projectInput());
    await a.engine.syncNow();
    const changes: string[][] = [];
    b.engine.onRemoteChange((t) => changes.push(t));
    await b.engine.syncNow();
    await b.engine.syncNow();
    expect(changes).toEqual([['projects']]);
  });
});

describe('SyncEngine – Uhren und Einstellungen', () => {
  it('lässt die Änderung eines nachgehenden Geräts nach Beobachtung trotzdem gewinnen', async () => {
    const a = await device('A');
    const b = await device('B', { skewMs: -3_600_000 }); // Uhr geht 1 h nach
    const p = await a.repo.create('projects', projectInput());
    await a.engine.syncNow();
    await b.engine.syncNow();

    world.t += 60_000;
    const changed = await b.repo.update('projects', p.id, { name: 'von B' });
    expect(changed!.updated_at).toBeGreaterThan(p.updated_at);
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.repo.get('projects', p.id))!.name).toBe('von B');
    expect(server.row('projects', p.id)!.name).toBe('von B');
  });

  it('hebt die Uhr eines nachgehenden Geräts per Serverzeit an', async () => {
    const c = await device('C', { skewMs: -3_600_000 });
    await c.engine.syncNow(); // Server leer – nur server_now() beobachtet
    const p = await c.repo.create('projects', projectInput());
    expect(p.updated_at).toBeGreaterThanOrEqual(world.t);
  });

  it('gleicht Einstellungen nach Last-Writer-Wins ab', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.engine.saveSettings({ focus_minutes: 50 });
    world.t += 1_000;
    await b.engine.saveSettings({ focus_minutes: 30, short_break_minutes: 10 });

    await a.engine.syncNow();
    expect(server.readSettings()!.focus_minutes).toBe(50);
    await b.engine.syncNow();
    expect(server.readSettings()!.focus_minutes).toBe(30);
    const changes: string[][] = [];
    a.engine.onRemoteChange((t) => changes.push(t));
    await a.engine.syncNow();
    expect(await loadLocalSettings(a.db)).toMatchObject({ focus_minutes: 30, short_break_minutes: 10 });
    expect(changes).toContainEqual(['user_settings']);

    // Veraltete lokale Einstellungen überschreiben den Server nicht
    world.t += 1_000;
    await a.engine.saveSettings({ daily_goal_minutes: 300 });
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await loadLocalSettings(b.db)).toMatchObject({ focus_minutes: 30, daily_goal_minutes: 300 });
  });
});

describe('SyncEngine – Ereignisse und Wiederholung', () => {
  it('reagiert auf lokale Änderungen, Realtime, online/offline und Sichtbarkeit', async () => {
    const envA = new EventTarget();
    const a = await device('A', { debounceMs: 5, env: envA });
    const b = await device('B', { debounceMs: 5, env: null });
    await a.engine.start();
    await b.engine.start();

    // Lokale Änderung → entprellter Push; Realtime → entprellter Pull auf B
    const p = await a.repo.create('projects', projectInput());
    await vi.waitFor(() => expect(server.row('projects', p.id)).toBeDefined());
    await vi.waitFor(async () => expect(await b.repo.get('projects', p.id)).toBeDefined());

    // offline-Ereignis → Status offline; online-Ereignis → Abgleich
    a.online = false;
    envA.dispatchEvent(new Event('offline'));
    await vi.waitFor(() => expect(a.engine.getStatus().state).toBe('offline'));
    a.online = true;
    envA.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(a.engine.getStatus().state).toBe('idle'));

    // Sichtbar werden → Abgleich
    const before = server.stats.pull;
    envA.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(server.stats.pull).toBeGreaterThan(before));

    // Nach stop() keine automatischen Läufe mehr
    a.engine.stop();
    b.engine.stop();
    await a.repo.create('projects', projectInput({ project_code: 'NACH-STOP' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(await a.engine.pendingCount()).toBe(1);
  });

  it('holt beim ersten Aufbau der Realtime-Verbindung nach, was seit dem ersten Pull geschah', async () => {
    const a = await device('A');
    const b = await device('B', { debounceMs: 1 });
    // Realtime-Channel steht erst nach dem ersten Pull (wie bei Supabase: Join dauert)
    let join: (() => void) | undefined;
    const subscribe = b.remote.subscribe.bind(b.remote);
    b.remote.subscribe = (handlers) => {
      let off = () => {};
      join = () => { off = subscribe(handlers); };
      return () => off();
    };
    await b.engine.start(); // erster Pull: Server noch leer

    const p = await a.repo.create('projects', projectInput());
    await a.engine.syncNow(); // B ist noch nicht verbunden → erhält kein Ereignis
    join!();
    await vi.waitFor(async () => expect(await b.repo.get('projects', p.id)).toBeDefined());
    b.engine.stop();
  });

  it('wiederholt nach Fehlern mit verdoppeltem Abstand bis 5 min', async () => {
    const scheduled: { fn: () => void; ms: number }[] = [];
    const timers: Timers = {
      setTimeout: (fn, ms) => { const h = { fn, ms }; scheduled.push(h); return h; },
      clearTimeout: (h) => { const i = scheduled.indexOf(h as never); if (i >= 0) scheduled.splice(i, 1); },
    };
    const a = await device('A', { timers, debounceMs: 1 });
    a.remote.setOnline(false); // Gerät meint online zu sein, Server unerreichbar
    await a.engine.start();
    const nextRetry = () => scheduled.find((h) => h.ms !== 1);
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const retry = nextRetry()!;
      delays.push(retry.ms);
      scheduled.splice(scheduled.indexOf(retry), 1);
      retry.fn(); // Timer feuert → Lauf scheitert erneut → nächster Versuch geplant
      await vi.waitFor(() => expect(nextRetry()).toBeDefined());
    }
    expect(delays).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(a.engine.getStatus().state).toBe('offline');

    // Erfolg setzt den Abstand zurück
    a.remote.setOnline(true);
    await a.engine.syncNow();
    expect(a.engine.getStatus().state).toBe('idle');
    expect(scheduled.filter((h) => h.ms !== 1)).toHaveLength(0);
    a.remote.setOnline(false);
    await a.engine.syncNow();
    expect(scheduled.find((h) => h.ms !== 1)!.ms).toBe(5_000);
    a.engine.stop();
  });
});
