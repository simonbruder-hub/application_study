import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB } from '../data/db';
import { Repository, type BatchOp } from '../data/repository';
import { ENTITY_TABLES } from '../data/types';
import { workPackageMetrics } from '../domain/metrics';
import { ImportBlockedError, applyImport, loadSnapshot } from './applyImport';
import { buildWorkbook, exportXlsx } from './exportWorkbook';
import { parseWorkbook, planImport } from './importWorkbook';
import {
  ID, appendRow, at, fakeInfo, getCell, reload, rowWhere, sampleSnapshot, setCell, sheet,
} from './testing';

const TODAY = '2026-10-15';
let db: PlannerDB;
let repo: Repository;
let t: number;

/** Beispieldatenbestand über das Repository anlegen (inkl. gelöschtem Projekt und Task) */
async function seed(): Promise<void> {
  const s = sampleSnapshot();
  const ops: BatchOp[] = [];
  for (const table of ['projects', 'milestones', 'work_packages', 'tasks', 'time_logs'] as const) {
    for (const row of s[table]) ops.push({ op: 'create', table, row: { ...row } as Record<string, unknown> & { id: string } });
  }
  ops.push({ op: 'delete', table: 'tasks', id: ID.t5 }, { op: 'delete', table: 'projects', id: ID.p3 });
  await repo.applyBatch(ops);
  for (const table of ENTITY_TABLES) await repo.markClean(table, await repo.dirtyRows(table));
}

async function planFrom(wb: ExcelJS.Workbook) {
  const parsed = await parseWorkbook(await wb.xlsx.writeBuffer());
  return planImport(parsed, await loadSnapshot(repo), { today: TODAY, now: t });
}

beforeEach(async () => {
  db = new PlannerDB(`excel-test-${Math.random()}`);
  t = at(2026, 10, 15, 8);
  repo = await Repository.open(db, () => t);
  await seed();
});

describe('applyImport', () => {
  it('schreibt den bestätigten Plan in einer Transaktion mit frischem updated_at und _dirty', async () => {
    const before = await loadSnapshot(repo);
    expect(before.projects).toHaveLength(3); // inkl. gelöschtem Projekt

    const wb = await reload(buildWorkbook(before, { today: TODAY, info: fakeInfo }));
    const tasks = sheet(wb, '4_Tasks');
    setCell(tasks, rowWhere(tasks, 'ID', ID.t2), 'Task_Titel', 'Übungsblatt 2 – korrigiert');
    setCell(tasks, rowWhere(tasks, 'ID', ID.t4), 'Loeschen', true);
    appendRow(sheet(wb, '3_Arbeitspakete'), { Projekt_Code: 'MATHE1', AP_Code: 'AP-1.3', Titel: 'Statistik', Soll_Stunden: '7,5' });
    appendRow(tasks, { Projekt_Code: 'MATHE1', AP_Code: 'AP-1.3', Task_Titel: 'Übung Statistik', Status: 'in Arbeit' });
    appendRow(sheet(wb, '5_Zeiteintraege'), {
      Projekt_Code: 'MATHE1', AP_Code: 'AP-1.3', Task_Titel_Referenz: 'Übung Statistik', Typ: 'pomodoro',
      Datum: '14.10.2026', Startzeit: '16:00', Endzeit: '16:25',
    });

    t = at(2026, 10, 15, 9);
    const plan = await planFrom(wb);
    expect(plan.hasErrors).toBe(false);
    let notified: string[] = [];
    repo.onLocalChange((tables) => { notified = tables; });

    t = at(2026, 10, 15, 10);
    const result = await applyImport(plan, repo);
    expect(result).toMatchObject({ created: 3, updated: 1, deleted: 1 });
    expect(notified.sort()).toEqual(['tasks', 'time_logs', 'work_packages']);

    const renamed = (await repo.get('tasks', ID.t2))!;
    expect(renamed.title).toBe('Übungsblatt 2 – korrigiert');
    expect(renamed.updated_at).toBeGreaterThanOrEqual(t);
    expect(renamed.updated_by).toBe(repo.deviceId);
    expect(renamed._dirty).toBe(1);

    const deleted = (await repo.get('tasks', ID.t4))!;
    expect(deleted.is_deleted).toBe(true);
    expect(deleted._dirty).toBe(1);

    const wp = (await repo.list('work_packages')).find((w) => w.ap_code === 'AP-1.3')!;
    expect(wp).toMatchObject({ project_id: ID.p1, title: 'Statistik', planned_hours: 7.5, milestone_id: null, _dirty: 1 });
    const task = (await repo.list('tasks')).find((x) => x.title === 'Übung Statistik')!;
    expect(task).toMatchObject({ project_id: ID.p1, work_package_id: wp.id, status: 'in_progress' });
    const log = (await repo.list('time_logs')).find((l) => l.task_id === task.id)!;
    expect(log).toMatchObject({
      project_id: ID.p1, work_package_id: wp.id, workspace: 'study', mode: 'pomodoro', counts_as_pomodoro: true,
      start_time: at(2026, 10, 14, 16), end_time: at(2026, 10, 14, 16, 25), duration_seconds: 1500,
    });

    // Unveränderte Zeilen wurden nicht angefasst (kein neues updated_at → keine Sync-Konflikte)
    const untouched = (await repo.get('projects', ID.p1))!;
    expect(untouched._dirty).toBe(0);
    expect(untouched.updated_at).toBeLessThan(at(2026, 10, 15, 9));

    // Zweiter Durchlauf mit dem neuen Stand: nichts mehr zu tun
    const again = await planFrom(await reload(buildWorkbook(await loadSnapshot(repo), { today: TODAY, info: fakeInfo })));
    expect(again.ops).toEqual([]);
    expect(again.issues).toEqual([]);
  });

  it('verweigert Pläne mit Fehlern, ausser mit { allowErrors: true }', async () => {
    const wb = await reload(buildWorkbook(await loadSnapshot(repo), { today: TODAY, info: fakeInfo }));
    const tasks = sheet(wb, '4_Tasks');
    appendRow(tasks, { Projekt_Code: 'XYZ', Task_Titel: 'Fehlerhaft' });
    appendRow(tasks, { Projekt_Code: 'PRO-WEB', Task_Titel: 'Korrekt' });
    const plan = await planFrom(wb);
    expect(plan.hasErrors).toBe(true);

    await expect(applyImport(plan, repo)).rejects.toThrow(ImportBlockedError);
    await expect(applyImport(plan, repo)).rejects.toThrow('Der Import enthält 1 Fehler und wurde nicht geschrieben.');
    expect((await repo.list('tasks')).map((x) => x.title)).not.toContain('Korrekt');

    const result = await applyImport(plan, repo, { allowErrors: true });
    expect(result.created).toBe(1);
    const titles = (await repo.list('tasks')).map((x) => x.title);
    expect(titles).toContain('Korrekt');
    expect(titles).not.toContain('Fehlerhaft');
  });

  it('stellt gelöschte Datensätze über ihre ID wieder her und löscht kaskadierend', async () => {
    const wb = await reload(buildWorkbook(await loadSnapshot(repo), { today: TODAY, info: fakeInfo }));
    appendRow(sheet(wb, '4_Tasks'), { ID: ID.t5, Projekt_Code: 'MATHE1', AP_Code: 'AP-1.2', Task_Titel: 'Wieder da' });
    const wps = sheet(wb, '3_Arbeitspakete');
    setCell(wps, rowWhere(wps, 'ID', ID.w1), 'Loeschen', 'ja');
    const plan = await planFrom(wb);
    expect(plan.summaryLines()).toContain('Zu löschen: 1 Arbeitspaket (inkl. 2 abhängiger Tasks)');

    await applyImport(plan, repo);
    const restored = (await repo.get('tasks', ID.t5))!;
    expect(restored).toMatchObject({ is_deleted: false, title: 'Wieder da', work_package_id: ID.w2, _dirty: 1 });
    expect((await repo.get('work_packages', ID.w1))!.is_deleted).toBe(true);
    expect((await repo.get('tasks', ID.t1))!.is_deleted).toBe(true);
    expect((await repo.get('tasks', ID.t2))!.is_deleted).toBe(true);
    // Zeiteinträge bleiben als Historie erhalten
    expect((await repo.get('time_logs', ID.l1))!.is_deleted).toBe(false);
  });

  it('ändert Arbeitspakete eines im selben Import gelöschten Meilensteins und entfernt nur die Zuordnung', async () => {
    const wb = await reload(buildWorkbook(await loadSnapshot(repo), { today: TODAY, info: fakeInfo }));
    const m = sheet(wb, '2_Meilensteine');
    setCell(m, rowWhere(m, 'ID', ID.m1), 'Loeschen', true);
    const wps = sheet(wb, '3_Arbeitspakete');
    setCell(wps, rowWhere(wps, 'ID', ID.w1), 'Soll_Stunden', 25);
    appendRow(wps, { Projekt_Code: 'MATHE1', MS_Code: 'MS-1', AP_Code: 'AP-1.3', Titel: 'Statistik' });
    const plan = await planFrom(wb);
    expect(plan.issues).toEqual([]);

    await applyImport(plan, repo);
    expect((await repo.get('milestones', ID.m1))!.is_deleted).toBe(true);
    expect(await repo.get('work_packages', ID.w1)).toMatchObject({ planned_hours: 25, milestone_id: null, is_deleted: false });
    const added = (await repo.list('work_packages')).find((w) => w.ap_code === 'AP-1.3')!;
    expect(added).toMatchObject({ title: 'Statistik', milestone_id: null, is_deleted: false });
  });

  it('schreibt nichts, wenn der Plan leer ist', async () => {
    const result = await applyImport({ ops: [], hasErrors: false, issues: [] }, repo);
    expect(result).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 0, ids: [] });
  });
});

describe('Integration mit der Kennzahlen-Engine (echter InfoProvider)', () => {
  it('übernimmt Fortschritt, Plan_Status und Begründung exakt aus workPackageMetrics – Roundtrip ohne Änderungen', async () => {
    const snapshot = await loadSnapshot(repo);
    const buffer = await exportXlsx(snapshot, { today: TODAY });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const metrics = workPackageMetrics(snapshot, { today: TODAY });
    const ws = sheet(wb, '3_Arbeitspakete');
    for (const id of [ID.w1, ID.w2, ID.w3]) {
      const m = metrics.get(id)!;
      const r = rowWhere(ws, 'ID', id);
      expect(getCell(ws, r, 'Task_Fortschritt_%').value).toBe(m.progressRatio);
      expect(getCell(ws, r, 'Plan_Status').value).toBe(m.status);
      expect(getCell(ws, r, 'Plan_Status').note).toBe(m.reason);
    }

    const plan = planImport(await parseWorkbook(buffer), snapshot, { today: TODAY });
    expect(plan.ops).toEqual([]);
    expect(plan.issues).toEqual([]);
  });
});
