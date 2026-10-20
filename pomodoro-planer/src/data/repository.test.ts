import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB } from './db';
import { Repository } from './repository';
import type { EntityInput, Project, Task } from './types';

let db: PlannerDB;
let repo: Repository;
let t = 1_000;

const project = (over: Partial<EntityInput<Project>> = {}): EntityInput<Project> => ({
  project_code: 'MATHE1', name: 'Mathe', mode: 'study', status: 'active', color: '#2a78d6',
  planned_hours: 40, start_date: null, end_date: null, notes: '', sort_order: 0, ...over,
});
const task = (project_id: string, over: Partial<EntityInput<Task>> = {}): EntityInput<Task> => ({
  project_id, work_package_id: null, title: 'Übung', status: 'todo', priority: 'medium', due_date: null,
  estimated_hours: 1, estimated_pomodoros: 2, notes: '', completed_at: null, sort_order: 0, ...over,
});

beforeEach(async () => {
  db = new PlannerDB(`test-${Math.random()}`);
  t = 1_000;
  repo = await Repository.open(db, () => t);
});

describe('Repository', () => {
  it('stempelt neue Zeilen und markiert sie als dirty', async () => {
    const p = await repo.create('projects', project());
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.updated_at).toBe(1000);
    expect(p.updated_by).toBe(repo.deviceId);
    expect(p.is_deleted).toBe(false);
    expect(p._dirty).toBe(1);
  });

  it('vergibt monotone Zeitstempel auch bei stehender Uhr', async () => {
    const a = await repo.create('projects', project());
    const b = await repo.create('projects', project({ project_code: 'B' }));
    expect(b.updated_at).toBeGreaterThan(a.updated_at);
  });

  it('überspringt Updates ohne echte Änderung', async () => {
    const p = await repo.create('projects', project());
    await repo.markClean('projects', [p]);
    t = 5_000;
    const same = await repo.update('projects', p.id, { name: 'Mathe' });
    expect(same!.updated_at).toBe(p.updated_at);
    expect(same!._dirty).toBe(0);
    const changed = await repo.update('projects', p.id, { name: 'Mathematik' });
    expect(changed!.updated_at).toBe(5_000);
    expect(changed!._dirty).toBe(1);
  });

  it('passt Zahlen an die Spaltentypen des Servers an (integer, numeric(10,2))', async () => {
    const p = await repo.create('projects', project({ planned_hours: 12.3456, sort_order: 2.6 }));
    expect(p.planned_hours).toBe(12.35);
    expect(p.sort_order).toBe(3);
    const k = await repo.create('tasks', task(p.id, { estimated_pomodoros: 2.4, estimated_hours: 0.333 }));
    expect(k.estimated_pomodoros).toBe(2);
    expect(k.estimated_hours).toBe(0.33);
    const u = await repo.update('tasks', k.id, { estimated_pomodoros: 3.5, estimated_hours: null });
    expect(u!.estimated_pomodoros).toBe(4);
    expect(u!.estimated_hours).toBeNull();
  });

  it('setzt completed_at beim Erledigen und entfernt es beim Zurücksetzen', async () => {
    const p = await repo.create('projects', project());
    const k = await repo.create('tasks', task(p.id));
    const done = await repo.update('tasks', k.id, { status: 'done' });
    expect(done!.completed_at).toBeTypeOf('number');
    const back = await repo.update('tasks', k.id, { status: 'todo' });
    expect(back!.completed_at).toBeNull();
  });

  it('löscht kaskadierend (Soft-Delete) und behält Zeiteinträge', async () => {
    const p = await repo.create('projects', project());
    const wp = await repo.create('work_packages', {
      project_id: p.id, milestone_id: null, ap_code: 'AP-1', title: 'AP', planned_hours: 5,
      start_date: null, end_date: null, notes: '', sort_order: 0,
    });
    await repo.create('tasks', task(p.id, { work_package_id: wp.id }));
    const log = await repo.create('time_logs', {
      project_id: p.id, work_package_id: wp.id, task_id: null, workspace: 'study', mode: 'pomodoro',
      start_time: 0, end_time: 1500_000, duration_seconds: 1500, counts_as_pomodoro: true, comment: '',
    });
    const n = await repo.softDelete('projects', p.id);
    expect(n).toBe(3); // Projekt, Arbeitspaket, Task
    expect((await repo.list('tasks')).length).toBe(0);
    expect((await repo.get('time_logs', log.id))!.is_deleted).toBe(false);
  });

  it('übernimmt Remote-Zeilen nach Last-Writer-Wins', async () => {
    const p = await repo.create('projects', project());
    const older = { ...p, name: 'Alt', updated_at: p.updated_at - 1, updated_by: 'other', _dirty: undefined };
    expect((await repo.applyRemote('projects', [older])).applied).toBe(0);
    const newer = { ...p, name: 'Neu', updated_at: p.updated_at + 10, updated_by: 'other' };
    expect((await repo.applyRemote('projects', [newer])).applied).toBe(1);
    const cur = (await repo.get('projects', p.id))!;
    expect(cur.name).toBe('Neu');
    expect(cur._dirty).toBe(0);
    // Uhr hat die entfernte Zeit gesehen → nächste lokale Änderung ist neuer
    const local = await repo.update('projects', p.id, { name: 'Lokal' });
    expect(local!.updated_at).toBeGreaterThan(newer.updated_at);
  });

  it('markClean lässt zwischenzeitlich geänderte Zeilen dirty', async () => {
    const p = await repo.create('projects', project());
    const pushed = { id: p.id, updated_at: p.updated_at, updated_by: p.updated_by };
    await repo.update('projects', p.id, { name: 'während Push geändert' });
    await repo.markClean('projects', [pushed]);
    expect((await repo.get('projects', p.id))!._dirty).toBe(1);
  });
});
