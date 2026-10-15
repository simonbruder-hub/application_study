import { beforeEach, describe, expect, it } from 'vitest';
import type { Milestone, Project, Task, TimeLog, WorkPackage } from '../data/types';
import { calculateWorkPackageHealth } from './health';
import {
  actualHoursByProject, actualHoursByTask, actualHoursByWorkPackage, milestoneMetrics, projectMetrics,
  workPackageMetrics, type PlannerSnapshot,
} from './metrics';

const opts = { today: '2026-10-15' };
let seq = 0;

beforeEach(() => {
  seq = 0;
});

const sync = (prefix: string) => ({
  id: `${prefix}-${++seq}`, created_at: 0, updated_at: 0, updated_by: 'dev', is_deleted: false,
});

const project = (over: Partial<Project> = {}): Project => ({
  ...sync('p'), project_code: 'P', name: 'Projekt', mode: 'study', status: 'active', color: '#2a78d6',
  planned_hours: null, start_date: null, end_date: null, notes: '', sort_order: 0, ...over,
});
const milestone = (project_id: string, over: Partial<Milestone> = {}): Milestone => ({
  ...sync('m'), project_id, ms_code: 'MS-1', title: 'Meilenstein', target_date: null, status: 'open', notes: '',
  sort_order: 0, ...over,
});
const workPackage = (project_id: string, over: Partial<WorkPackage> = {}): WorkPackage => ({
  ...sync('w'), project_id, milestone_id: null, ap_code: 'AP-1', title: 'Arbeitspaket', planned_hours: null,
  start_date: null, end_date: null, notes: '', sort_order: 0, ...over,
});
const task = (project_id: string, over: Partial<Task> = {}): Task => ({
  ...sync('t'), project_id, work_package_id: null, title: 'Aufgabe', status: 'todo', priority: 'medium',
  due_date: null, estimated_hours: null, estimated_pomodoros: null, notes: '', completed_at: null, sort_order: 0, ...over,
});
const log = (hours: number, over: Partial<TimeLog> = {}): TimeLog => ({
  ...sync('l'), project_id: null, work_package_id: null, task_id: null, workspace: 'study', mode: 'pomodoro',
  start_time: 0, end_time: hours * 3_600_000, duration_seconds: hours * 3600, counts_as_pomodoro: true, comment: '', ...over,
});

const snapshot = (s: Partial<PlannerSnapshot>): PlannerSnapshot => ({
  projects: [], milestones: [], work_packages: [], tasks: [], time_logs: [], ...s,
});

describe('Ist-Stunden', () => {
  it('ordnet Zeiteinträge Task, Arbeitspaket und Projekt zu', () => {
    const p = project();
    const wp = workPackage(p.id);
    const t = task(p.id, { work_package_id: wp.id });
    const free = task(p.id);
    const s = snapshot({
      projects: [p], work_packages: [wp], tasks: [t, free],
      time_logs: [
        log(1, { task_id: t.id }), // nur Task → WP und Projekt über den Task
        log(2, { work_package_id: wp.id }), // nur WP → Projekt über das WP
        log(0.5, { project_id: p.id }), // nur Projekt
        log(0.25, { task_id: free.id, project_id: p.id }),
      ],
    });
    expect(actualHoursByTask(s)).toEqual(new Map([[t.id, 1], [free.id, 0.25]]));
    expect(actualHoursByWorkPackage(s)).toEqual(new Map([[wp.id, 3]]));
    expect(actualHoursByProject(s)).toEqual(new Map([[p.id, 3.75]]));
  });

  it('explizite Verweise im Zeiteintrag haben Vorrang vor dem Task', () => {
    const p = project();
    const q = project();
    const wpA = workPackage(p.id);
    const wpB = workPackage(p.id);
    const t = task(p.id, { work_package_id: wpA.id });
    const s = snapshot({
      projects: [p, q], work_packages: [wpA, wpB], tasks: [t],
      time_logs: [log(2, { task_id: t.id, work_package_id: wpB.id, project_id: q.id })],
    });
    expect(actualHoursByWorkPackage(s).get(wpB.id)).toBe(2);
    expect(actualHoursByWorkPackage(s).has(wpA.id)).toBe(false);
    expect(actualHoursByProject(s).get(q.id)).toBe(2);
    expect(actualHoursByProject(s).has(p.id)).toBe(false);
  });

  it('ignoriert gelöschte Zeiteinträge und ungültige Dauern', () => {
    const p = project();
    const s = snapshot({
      projects: [p],
      time_logs: [
        log(1, { project_id: p.id }),
        log(5, { project_id: p.id, is_deleted: true }),
        log(1, { project_id: p.id, duration_seconds: -600 }),
        log(1, { project_id: p.id, duration_seconds: Number.NaN }),
      ],
    });
    expect(actualHoursByProject(s).get(p.id)).toBe(1);
  });

  it('schreibt gelöschten Einheiten keine Stunden gut und nutzt sie nicht zur Zuordnung', () => {
    const p = project();
    const wp = workPackage(p.id, { is_deleted: true });
    const t = task(p.id, { work_package_id: wp.id, is_deleted: true });
    const s = snapshot({
      projects: [p], work_packages: [wp], tasks: [t],
      time_logs: [log(1, { task_id: t.id }), log(2, { work_package_id: wp.id, project_id: p.id })],
    });
    expect(actualHoursByTask(s).size).toBe(0);
    expect(actualHoursByWorkPackage(s).size).toBe(0);
    // Projekt nur über den expliziten Verweis; der gelöschte Task liefert kein Projekt
    expect(actualHoursByProject(s).get(p.id)).toBe(2);
  });

  it('blendet Kinder gelöschter Eltern aus (wiederaufgetauchte Zeilen)', () => {
    const p = project({ is_deleted: true });
    const wp = workPackage(p.id);
    const t = task(p.id);
    const s = snapshot({
      projects: [p], work_packages: [wp], tasks: [t],
      time_logs: [log(1, { task_id: t.id }), log(1, { work_package_id: wp.id })],
    });
    expect(actualHoursByTask(s).size).toBe(0);
    expect(actualHoursByWorkPackage(s).size).toBe(0);
    expect(actualHoursByProject(s).size).toBe(0);
    expect(workPackageMetrics(s, opts).size).toBe(0);
    expect(projectMetrics(s, opts).size).toBe(0);
  });

  it('Tasks eines gelöschten Arbeitspakets sind unsichtbar', () => {
    const p = project();
    const wp = workPackage(p.id, { is_deleted: true });
    const t = task(p.id, { work_package_id: wp.id, status: 'done' });
    const open = task(p.id);
    const s = snapshot({ projects: [p], work_packages: [wp], tasks: [t, open] });
    // Projektebene sieht nur den offenen Task → 0 % statt 50 %
    expect(projectMetrics(s, opts).get(p.id)!.progressRatio).toBe(0);
  });

  it('zählt Verweise auf IDs, die nicht im Snapshot sind', () => {
    const s = snapshot({ time_logs: [log(1.5, { project_id: 'extern' })] });
    expect(actualHoursByProject(s).get('extern')).toBe(1.5);
  });
});

describe('workPackageMetrics', () => {
  it('berechnet die Health je Arbeitspaket aus Soll, Ist, Tasks und Deadline', () => {
    const p = project();
    const wp = workPackage(p.id, { planned_hours: 10, end_date: '2026-10-20' });
    const t1 = task(p.id, { work_package_id: wp.id, status: 'done', estimated_hours: 2 });
    const t2 = task(p.id, { work_package_id: wp.id, estimated_hours: 6 });
    const other = task(p.id); // ohne Arbeitspaket
    const s = snapshot({
      projects: [p], work_packages: [wp], tasks: [t1, t2, other],
      time_logs: [log(3, { task_id: t1.id }), log(1, { project_id: p.id })],
    });
    const m = workPackageMetrics(s, opts).get(wp.id)!;
    const expected = calculateWorkPackageHealth({
      plannedHours: 10, actualHours: 3, deadline: '2026-10-20',
      tasks: [{ status: 'done', estimatedHours: 2 }, { status: 'todo', estimatedHours: 6 }],
    }, opts);
    expect(m).toEqual({ ...expected, workPackageId: wp.id, plannedHours: 10, actualHours: 3, taskCount: 2, doneCount: 1 });
    expect(m.progressRatio).toBe(0.25);
    expect(m.daysLeft).toBe(5);
  });

  it('planned_hours null → 0 und ohne Tasks', () => {
    const p = project();
    const wp = workPackage(p.id);
    const m = workPackageMetrics(snapshot({ projects: [p], work_packages: [wp] }), opts).get(wp.id)!;
    expect(m).toMatchObject({ plannedHours: 0, actualHours: 0, taskCount: 0, doneCount: 0, status: 'ON_TRACK', reason: 'Im Plan' });
  });

  it('übergibt die Schwellenwerte', () => {
    const p = project();
    const wp = workPackage(p.id, { planned_hours: 14, end_date: '2026-10-19' });
    const s = snapshot({ projects: [p], work_packages: [wp], tasks: [task(p.id, { work_package_id: wp.id })] });
    expect(workPackageMetrics(s, opts).get(wp.id)!.status).toBe('AT_RISK');
    expect(workPackageMetrics(s, { ...opts, thresholds: { yellowDailyHours: 4 } }).get(wp.id)!.status).toBe('ON_TRACK');
  });
});

describe('milestoneMetrics', () => {
  it('aggregiert die zugeordneten Arbeitspakete in Sortierreihenfolge', () => {
    const p = project();
    const m = milestone(p.id, { target_date: '2026-10-18' });
    const a = workPackage(p.id, { milestone_id: m.id, ap_code: 'AP-2', sort_order: 2, planned_hours: 6 });
    const b = workPackage(p.id, { milestone_id: m.id, ap_code: 'AP-1', sort_order: 1, planned_hours: 6 });
    const other = workPackage(p.id, { ap_code: 'AP-9', planned_hours: 100 });
    const s = snapshot({
      projects: [p], milestones: [m], work_packages: [a, b, other],
      tasks: [task(p.id, { work_package_id: a.id }), task(p.id, { work_package_id: b.id })],
    });
    const r = milestoneMetrics(s, opts).get(m.id)!;
    expect(r.workPackageIds).toEqual([b.id, a.id]);
    expect(r.remainingHours).toBe(12);
    expect(r.daysLeft).toBe(3);
    expect(r.requiredDailyHours).toBe(4);
    expect(r).toMatchObject({ milestoneId: m.id, status: 'at_risk', reason: 'Hohe Tageslast bis zum Zieldatum (4,0 Std./Tag)' });
  });

  it('completed, wenn alle Arbeitspakete abgeschlossen sind', () => {
    const p = project();
    const m = milestone(p.id, { target_date: '2026-10-01' });
    const wp = workPackage(p.id, { milestone_id: m.id, planned_hours: 5 });
    const s = snapshot({
      projects: [p], milestones: [m], work_packages: [wp], tasks: [task(p.id, { work_package_id: wp.id, status: 'done' })],
    });
    expect(milestoneMetrics(s, opts).get(m.id)).toMatchObject({ status: 'completed', reason: 'Alle Arbeitspakete abgeschlossen' });
  });

  it('delayed bei kritischem Arbeitspaket', () => {
    const p = project();
    const m = milestone(p.id);
    const wp = workPackage(p.id, { milestone_id: m.id, planned_hours: 2 });
    const s = snapshot({
      projects: [p], milestones: [m], work_packages: [wp], tasks: [task(p.id, { work_package_id: wp.id })],
      time_logs: [log(3, { work_package_id: wp.id })],
    });
    expect(milestoneMetrics(s, opts).get(m.id)).toMatchObject({ status: 'delayed', reason: '1 Arbeitspaket kritisch' });
  });

  it('ohne Arbeitspakete; gelöschte Meilensteine und Arbeitspakete fehlen', () => {
    const p = project();
    const m = milestone(p.id);
    const gone = milestone(p.id, { is_deleted: true });
    const wp = workPackage(p.id, { milestone_id: m.id, is_deleted: true });
    const r = milestoneMetrics(snapshot({ projects: [p], milestones: [m, gone], work_packages: [wp] }), opts);
    expect([...r.keys()]).toEqual([m.id]);
    expect(r.get(m.id)).toMatchObject({ status: 'on_track', reason: 'Keine Arbeitspakete zugeordnet', workPackageIds: [] });
  });
});

describe('projectMetrics', () => {
  it('Soll = Projektbudget, sonst Summe der Arbeitspakete', () => {
    const withBudget = project({ planned_hours: 50 });
    const without = project();
    const s = snapshot({
      projects: [withBudget, without],
      work_packages: [
        workPackage(withBudget.id, { planned_hours: 10 }),
        workPackage(without.id, { planned_hours: 10 }),
        workPackage(without.id, { planned_hours: 5.5 }),
        workPackage(without.id),
      ],
    });
    const r = projectMetrics(s, opts);
    expect(r.get(withBudget.id)!.plannedHours).toBe(50);
    expect(r.get(without.id)!.plannedHours).toBe(15.5);
  });

  it('Projektebene über alle Tasks des Projekts (mit und ohne Arbeitspaket)', () => {
    const p = project({ planned_hours: 20 });
    const wp = workPackage(p.id, { planned_hours: 20 });
    const s = snapshot({
      projects: [p], work_packages: [wp],
      tasks: [task(p.id, { work_package_id: wp.id, status: 'done' }), task(p.id), task(p.id), task(p.id, { status: 'done' })],
      time_logs: [log(4, { project_id: p.id })],
    });
    const r = projectMetrics(s, opts).get(p.id)!;
    expect(r).toEqual({ projectId: p.id, plannedHours: 20, actualHours: 4, progressRatio: 0.5, status: 'ON_TRACK', reason: 'Im Plan' });
  });

  it('schlechtestes Arbeitspaket bestimmt Status und Begründung (mit AP-Präfix)', () => {
    const p = project({ planned_hours: 100 });
    const ok = workPackage(p.id, { ap_code: 'AP-1.1', planned_hours: 10, sort_order: 1 });
    const bad = workPackage(p.id, { ap_code: 'AP-1.2', planned_hours: 2, sort_order: 2 });
    const s = snapshot({
      projects: [p], work_packages: [ok, bad],
      tasks: [task(p.id, { work_package_id: ok.id }), task(p.id, { work_package_id: bad.id })],
      time_logs: [log(3, { work_package_id: bad.id })],
    });
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({
      status: 'OVER_BUDGET', reason: 'AP-1.2: Zeitbudget überschritten (Ist > Soll)',
    });
  });

  it('bei Gleichstand gewinnt die Projektebene, dann das erste Arbeitspaket in Sortierreihenfolge', () => {
    const p = project({ planned_hours: 1, end_date: '2026-10-10' });
    const late = workPackage(p.id, { ap_code: 'AP-2', sort_order: 2, end_date: '2026-10-01' });
    const early = workPackage(p.id, { ap_code: 'AP-1', sort_order: 1, end_date: '2026-10-01' });
    const tasks = [task(p.id, { work_package_id: late.id }), task(p.id, { work_package_id: early.id })];
    const s = snapshot({ projects: [p], work_packages: [late, early], tasks });
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({ status: 'OVER_BUDGET', reason: 'Deadline überschritten' });

    const noDeadline = { ...p, end_date: null };
    const s2 = snapshot({ projects: [noDeadline], work_packages: [late, early], tasks });
    expect(projectMetrics(s2, opts).get(p.id)).toMatchObject({ status: 'OVER_BUDGET', reason: 'AP-1: Deadline überschritten' });
  });

  it('Projektebene schlechter als die Arbeitspakete', () => {
    const p = project({ planned_hours: 10, end_date: '2026-10-01' });
    const wp = workPackage(p.id, { planned_hours: 10 });
    const s = snapshot({ projects: [p], work_packages: [wp], tasks: [task(p.id, { work_package_id: wp.id })] });
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({ status: 'OVER_BUDGET', reason: 'Deadline überschritten' });
  });

  it('AT_RISK eines Arbeitspakets schlägt ON_TRACK der Projektebene', () => {
    const p = project({ planned_hours: 100 });
    const wp = workPackage(p.id, { ap_code: 'AP-3', planned_hours: 10 });
    const s = snapshot({
      projects: [p], work_packages: [wp],
      tasks: [...Array.from({ length: 15 }, () => task(p.id, { work_package_id: wp.id, status: 'done' as const })),
        ...Array.from({ length: 5 }, () => task(p.id, { work_package_id: wp.id }))],
      time_logs: [log(8.5, { work_package_id: wp.id })],
    });
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({ status: 'AT_RISK', reason: 'AP-3: Über 85% des Zeitbudgets verbraucht' });
  });

  it('COMPLETED nur, wenn die Projektebene abgeschlossen ist', () => {
    const p = project({ planned_hours: 10 });
    const wpDone = workPackage(p.id, { ap_code: 'AP-1', planned_hours: 5 });
    const s = snapshot({
      projects: [p], work_packages: [wpDone],
      tasks: [task(p.id, { work_package_id: wpDone.id, status: 'done' }), task(p.id)],
    });
    // Arbeitspaket COMPLETED, Projekt hat noch einen offenen Task
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({ status: 'ON_TRACK', reason: 'Im Plan' });

    const allDone = snapshot({ ...s, tasks: [task(p.id, { work_package_id: wpDone.id, status: 'done' })] });
    expect(projectMetrics(allDone, opts).get(p.id)).toMatchObject({ status: 'COMPLETED', reason: 'Abgeschlossen im Zeitplan' });
  });

  it('ein noch leeres Arbeitspaket verhindert COMPLETED', () => {
    const p = project({ planned_hours: 10 });
    const done = workPackage(p.id, { ap_code: 'AP-1', planned_hours: 5, sort_order: 1 });
    const empty = workPackage(p.id, { ap_code: 'AP-2', planned_hours: 5, sort_order: 2 });
    const s = snapshot({
      projects: [p], work_packages: [done, empty], tasks: [task(p.id, { work_package_id: done.id, status: 'done' })],
    });
    expect(projectMetrics(s, opts).get(p.id)).toMatchObject({ status: 'ON_TRACK', reason: 'AP-2: Im Plan' });
  });

  it('Ist-Stunden des Projekts und gelöschte Projekte', () => {
    const p = project();
    const gone = project({ is_deleted: true });
    const s = snapshot({ projects: [p, gone], time_logs: [log(2, { project_id: p.id }), log(5, { project_id: gone.id })] });
    const r = projectMetrics(s, opts);
    expect([...r.keys()]).toEqual([p.id]);
    expect(r.get(p.id)!.actualHours).toBe(2);
  });
});
