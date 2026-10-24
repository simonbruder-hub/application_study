import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { BatchOp } from '../data/repository';
import type { PlannerSnapshot } from '../domain/metrics';
import { buildWorkbook } from './exportWorkbook';
import { formatIssue, parseWorkbook, planImport, type ImportPlan } from './importWorkbook';
import {
  ID, appendRow, at, col, fakeInfo, getCell, idSequence, reload, rowWhere, sampleSnapshot, setCell, sheet, uuid,
} from './testing';

const TODAY = '2026-10-15';
const NOW = at(2026, 10, 15, 12);
/** Erste ID, die planImport für neue Zeilen vergibt (siehe idSequence) */
const NEW1 = uuid('9', 1);
const NEW2 = uuid('9', 2);

async function exportedWorkbook(s: PlannerSnapshot = sampleSnapshot()): Promise<ExcelJS.Workbook> {
  return reload(buildWorkbook(s, { today: TODAY, info: fakeInfo }));
}

/** Arbeitsmappe wie eine gespeicherte Datei einlesen und planen */
async function plan(wb: ExcelJS.Workbook, s: PlannerSnapshot = sampleSnapshot()): Promise<ImportPlan> {
  const parsed = await parseWorkbook(await wb.xlsx.writeBuffer());
  return planImport(parsed, s, { today: TODAY, now: NOW, newId: idSequence() });
}

const errors = (p: ImportPlan) => p.issues.filter((i) => i.severity === 'error');
const warnings = (p: ImportPlan) => p.issues.filter((i) => i.severity === 'warning');
const creates = (p: ImportPlan, table: string) =>
  p.ops.filter((o): o is Extract<BatchOp, { op: 'create' }> => o.op === 'create' && o.table === table);
const updates = (p: ImportPlan, table: string) =>
  p.ops.filter((o): o is Extract<BatchOp, { op: 'update' }> => o.op === 'update' && o.table === table);

describe('parseWorkbook', () => {
  it('liest alle 5 Blätter einer exportierten Datei', async () => {
    const parsed = await parseWorkbook(await (await exportedWorkbook()).xlsx.writeBuffer());
    expect(parsed.issues).toEqual([]);
    const rows = Object.fromEntries(Object.entries(parsed.sheets).map(([t, s]) => [t, s.rows.length]));
    expect(rows).toEqual({ projects: 2, milestones: 1, work_packages: 3, tasks: 4, time_logs: 4 });
    expect(parsed.sheets.tasks.rows[0]!.row).toBe(2);
    expect(parsed.sheets.projects.rows[0]!.values.project_code).toBe('MATHE1');
  });

  it('nimmt auch eine geladene ExcelJS-Arbeitsmappe oder ein Uint8Array', async () => {
    const wb = await exportedWorkbook();
    expect((await parseWorkbook(wb)).sheets.projects.rows).toHaveLength(2);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    expect((await parseWorkbook(bytes)).sheets.time_logs.rows).toHaveLength(4);
  });

  it('ordnet Spalten tolerant über den Namen zu (Schreibweise, Leerzeichen, Reihenfolge, Erläuterungen)', async () => {
    const wb = new ExcelJS.Workbook();
    const p = wb.addWorksheet('projekte');
    p.addRow(['loeschen', ' NAME ', 'Modus (work/study)', 'projekt code', 'id', 'Farbe Hex']);
    p.addRow([false, 'Physik', 'Lernen', 'PHYS', null, '#ABC']);
    p.addRow([]); // leere Zeile
    p.addRow([false, null, null, null, null, null]); // nur Loeschen = FALSE → leer
    for (const name of ['2_Meilensteine', '3_Arbeitspakete', '4_Tasks', '5_Zeiteintraege']) {
      const ws = wb.addWorksheet(name);
      ws.addRow(['ID', 'Projekt_Code', 'MS_Code', 'AP_Code', 'Titel', 'Task_Titel', 'Datum', 'Startzeit', 'Endzeit']);
    }
    const parsed = await parseWorkbook(wb);
    const sheet1 = parsed.sheets.projects;
    expect(sheet1.found).toBe(true);
    expect(sheet1.usable).toBe(true);
    expect(sheet1.rows).toEqual([{
      row: 2, values: { delete: false, name: 'Physik', mode: 'Lernen', project_code: 'PHYS', id: null, color: '#ABC' },
    }]);
    // Fehlende optionale Spalten → Warnung, keine Fehler
    expect(parsed.issues.filter((i) => i.sheet === 'projekte').map((i) => i.severity)).toEqual(['warning', 'warning']);

    const result = planImport(parsed, { projects: [], milestones: [], work_packages: [], tasks: [], time_logs: [] }, {
      today: TODAY, now: NOW, newId: idSequence(),
    });
    expect(creates(result, 'projects')[0]!.row).toMatchObject({
      id: NEW1, project_code: 'PHYS', name: 'Physik', mode: 'study', status: 'active', color: '#aabbcc',
    });
  });

  it('meldet fehlende Blätter und Pflichtspalten als Fehler', async () => {
    const wb = await exportedWorkbook();
    wb.removeWorksheet(sheet(wb, '2_Meilensteine').id);
    const tasks = sheet(wb, '4_Tasks');
    tasks.getCell(1, col(tasks, 'Task_Titel')).value = 'Titel der Aufgabe';
    const parsed = await parseWorkbook(await wb.xlsx.writeBuffer());
    expect(parsed.issues).toContainEqual({
      sheet: '2_Meilensteine', row: 0, severity: 'error', message: 'Blatt «2_Meilensteine» fehlt',
    });
    expect(parsed.issues).toContainEqual({
      sheet: '4_Tasks', row: 1, column: 'Task_Titel', severity: 'error',
      message: 'Pflichtspalte «Task_Titel» fehlt – Blatt wird nicht importiert',
    });
    expect(parsed.sheets.tasks.usable).toBe(false);
    const result = await plan(wb);
    expect(result.hasErrors).toBe(true);
    expect(result.ops).toEqual([]);
  });

  it('meldet unlesbare Dateien', async () => {
    const parsed = await parseWorkbook(new TextEncoder().encode('keine Excel-Datei'));
    expect(parsed.issues).toEqual([{
      sheet: '', row: 0, severity: 'error', message: 'Die Datei konnte nicht als Excel-Arbeitsmappe (.xlsx) gelesen werden',
    }]);
  });
});

describe('planImport – Roundtrip', () => {
  it('Export → Einlesen → Planen ergibt keine Änderungen, Fehler oder Warnungen', async () => {
    const result = await plan(await exportedWorkbook());
    expect(result.ops).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.hasErrors).toBe(false);
    expect(result.skippedRows).toBe(0);
    expect(result.unchangedRows).toBe(14);
    expect(result.summaryLines()).toEqual([
      'Neu zu erstellen: nichts',
      'Zu aktualisieren: nichts',
      'Zu löschen: nichts',
      'Unverändert: 14 Zeilen',
    ]);
  });

  it('lässt Zeiteinträge mit Verweisen auf fehlende Datensätze unverändert', async () => {
    const s = sampleSnapshot();
    const l1 = s.time_logs.find((l) => l.id === ID.l1)!;
    s.time_logs.push({
      ...l1, id: uuid('5', 9), project_id: uuid('1', 99), work_package_id: uuid('3', 99), task_id: uuid('4', 99),
    });
    const result = await plan(await exportedWorkbook(s), s);
    expect(result.ops).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('ignoriert Änderungen in den Info-Spalten', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    const r = rowWhere(wp, 'ID', ID.w1);
    setCell(wp, r, 'Ist_Stunden', 99);
    setCell(wp, r, 'Task_Fortschritt_%', 1);
    setCell(wp, r, 'Plan_Status', 'COMPLETED');
    setCell(sheet(wb, '1_Projekte'), 2, 'Ist_Stunden_Summe', 1234);
    setCell(sheet(wb, '4_Tasks'), 2, 'Ist_Stunden', 7);
    expect((await plan(wb)).ops).toEqual([]);
  });

  it('übersteht Farben in anderer Schreibweise, Leerzeichen und gleichwertige Zellformate', async () => {
    const wb = await exportedWorkbook();
    const p = sheet(wb, '1_Projekte');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Farbe_Hex', '#2a78d6');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Name', '  Mathematik ');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Soll_Stunden_Gesamt', '40,0');
    const t = sheet(wb, '4_Tasks');
    setCell(t, rowWhere(t, 'ID', ID.t1), 'Faellig_Am', '10.10.2026');
    setCell(t, rowWhere(t, 'ID', ID.t1), 'Loeschen', 'nein');
    const l = sheet(wb, '5_Zeiteintraege');
    setCell(l, rowWhere(l, 'ID', ID.l1), 'Startzeit', '9.00');
    setCell(l, rowWhere(l, 'ID', ID.l1), 'Dauer_Minuten', '25,0');
    const result = await plan(wb);
    expect(result.ops).toEqual([]);
    expect(result.issues).toEqual([]);
  });
});

describe('planImport – Bearbeitungen', () => {
  it('benennt einen Task um und ändert Soll_Stunden ("12,5") – nur geänderte Felder', async () => {
    const wb = await exportedWorkbook();
    const t = sheet(wb, '4_Tasks');
    setCell(t, rowWhere(t, 'ID', ID.t2), 'Task_Titel', 'Übungsblatt 2 (Wiederholung)');
    const wp = sheet(wb, '3_Arbeitspakete');
    setCell(wp, rowWhere(wp, 'ID', ID.w1), 'Soll_Stunden', '12,5');
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops).toEqual([
      { op: 'update', table: 'work_packages', id: ID.w1, patch: { planned_hours: 12.5 } },
      { op: 'update', table: 'tasks', id: ID.t2, patch: { title: 'Übungsblatt 2 (Wiederholung)' } },
    ]);
    expect(result.counts.tasks).toEqual({ create: 0, update: 1, delete: 0 });
    expect(result.changes).toContainEqual({
      table: 'tasks', kind: 'update', id: ID.t2, label: 'MATHE1/AP-1.1 · Übungsblatt 2 (Wiederholung)', sheet: '4_Tasks',
      row: rowWhere(t, 'ID', ID.t2),
      fields: [{ field: 'title', column: 'Task_Titel', from: 'Übungsblatt 2', to: 'Übungsblatt 2 (Wiederholung)' }],
    });
    expect(result.summaryLines().slice(0, 2)).toEqual([
      'Neu zu erstellen: nichts',
      'Zu aktualisieren: 1 Arbeitspaket, 1 Task',
    ]);
  });

  it('legt ein neues Arbeitspaket ohne ID an und verknüpft einen neuen Task über dessen AP_Code', async () => {
    const wb = await exportedWorkbook();
    const apRow = appendRow(sheet(wb, '3_Arbeitspakete'), {
      Projekt_Code: 'mathe1', MS_Code: 'ms-1', AP_Code: 'AP-1.3', Titel: 'Statistik', Startdatum: '1.11.26',
      Deadline: '2026-12-10', Soll_Stunden: 8, Loeschen: false,
    });
    appendRow(sheet(wb, '4_Tasks'), {
      Projekt_Code: 'MATHE1', AP_Code: 'ap-1.3', Task_Titel: 'Übung Statistik', Status: 'offen', Prioritaet: 'hoch',
      Geschaetzte_Stunden: '1,5', Geschaetzte_Pomodoros: 3,
    });
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops).toHaveLength(2);
    expect(result.ops[0]).toEqual({
      op: 'create', table: 'work_packages', row: {
        id: NEW1, project_id: ID.p1, milestone_id: ID.m1, ap_code: 'AP-1.3', title: 'Statistik', planned_hours: 8,
        start_date: '2026-11-01', end_date: '2026-12-10', notes: '', sort_order: 2,
      },
    });
    expect(result.ops[1]).toEqual({
      op: 'create', table: 'tasks', row: {
        id: NEW2, project_id: ID.p1, work_package_id: NEW1, title: 'Übung Statistik', status: 'todo', priority: 'high',
        due_date: null, estimated_hours: 1.5, estimated_pomodoros: 3, notes: '', completed_at: null, sort_order: 0,
      },
    });
    expect(result.changes[0]).toMatchObject({
      table: 'work_packages', kind: 'create', id: NEW1, label: 'MATHE1/AP-1.3 · Statistik', sheet: '3_Arbeitspakete', row: apRow,
    });
    expect(result.summaryLines()[0]).toBe('Neu zu erstellen: 1 Arbeitspaket, 1 Task');
  });

  it('markiert Tasks mit Loeschen = TRUE als gelöscht (Löschungen zuletzt, Kinder vor Eltern)', async () => {
    const wb = await exportedWorkbook();
    const t = sheet(wb, '4_Tasks');
    setCell(t, rowWhere(t, 'ID', ID.t3), 'Loeschen', true);
    setCell(t, rowWhere(t, 'ID', ID.t4), 'Loeschen', 'ja');
    const m = sheet(wb, '2_Meilensteine');
    setCell(m, rowWhere(m, 'ID', ID.m1), 'Loeschen', 1);
    setCell(t, rowWhere(t, 'ID', ID.t2), 'Notizen', 'vor dem Löschen geändert');
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops).toEqual([
      { op: 'update', table: 'tasks', id: ID.t2, patch: { notes: 'vor dem Löschen geändert' } },
      { op: 'delete', table: 'tasks', id: ID.t3 },
      { op: 'delete', table: 'tasks', id: ID.t4 },
      { op: 'delete', table: 'milestones', id: ID.m1 },
    ]);
    expect(result.counts.tasks.delete).toBe(2);
    expect(result.counts.milestones.delete).toBe(1);
    expect(result.summaryLines()).toContain('Zu löschen: 1 Meilenstein, 2 Tasks');
    expect(result.summaryLines()).toContain('1 Arbeitspaket verliert die Zuordnung zum gelöschten Meilenstein');
  });

  it('nennt die Kaskade beim Löschen eines Arbeitspakets', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    setCell(wp, rowWhere(wp, 'ID', ID.w1), 'Loeschen', 'TRUE');
    const result = await plan(wb);
    expect(result.counts.work_packages.delete).toBe(1);
    expect(result.cascade).toEqual({ milestones: 0, work_packages: 0, tasks: 2, unlinkedWorkPackages: 0 });
    expect(result.summaryLines()).toContain('Zu löschen: 1 Arbeitspaket (inkl. 2 abhängiger Tasks)');
  });

  it('nennt die Kaskade beim Löschen eines Projekts und übernimmt Änderungen an dessen Kindern nicht', async () => {
    const wb = await exportedWorkbook();
    const p = sheet(wb, '1_Projekte');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Loeschen', 'x');
    const t = sheet(wb, '4_Tasks');
    const r = rowWhere(t, 'ID', ID.t2);
    setCell(t, r, 'Task_Titel', 'Wird ohnehin gelöscht');
    const result = await plan(wb);
    expect(result.ops).toEqual([{ op: 'delete', table: 'projects', id: ID.p1 }]);
    expect(result.cascade).toEqual({ milestones: 1, work_packages: 2, tasks: 3, unlinkedWorkPackages: 0 });
    expect(result.summaryLines()).toContain(
      'Zu löschen: 1 Projekt (inkl. 1 abhängigen Meilensteins, 2 abhängiger Arbeitspakete und 3 abhängiger Tasks)',
    );
    expect(warnings(result)).toEqual([{
      sheet: '4_Tasks', row: r, severity: 'warning',
      message: 'Projekt «MATHE1 · Mathematik» wird gelöscht – Zeile wird nicht übernommen',
    }]);
    expect(result.skippedRows).toBe(1);
  });

  it('meldet einen unbekannten Projekt_Code mit Zeilennummer und überspringt die Zeile', async () => {
    const wb = await exportedWorkbook();
    const row = appendRow(sheet(wb, '4_Tasks'), { Projekt_Code: 'XYZ', Task_Titel: 'Irgendwas' });
    appendRow(sheet(wb, '4_Tasks'), { Projekt_Code: 'PRO-WEB', Task_Titel: 'Gültig' });
    const result = await plan(wb);
    expect(result.hasErrors).toBe(true);
    expect(errors(result)).toEqual([{
      sheet: '4_Tasks', row, column: 'Projekt_Code', severity: 'error', message: 'Unbekannter Projekt_Code «XYZ»',
    }]);
    expect(creates(result, 'tasks').map((o) => o.row.title)).toEqual(['Gültig']);
    expect(result.skippedRows).toBe(1);
    expect(result.summaryLines()).toContain('Fehler (1) – betroffene Zeilen werden nicht übernommen:');
    expect(result.summaryLines()).toContain(`– 4_Tasks, Zeile ${row}, Projekt_Code: Unbekannter Projekt_Code «XYZ»`);
  });

  it('legt für eine neue Task_Titel_Referenz genau einen Task an und verknüpft bestehende Titel', async () => {
    const wb = await exportedWorkbook();
    const ws = sheet(wb, '5_Zeiteintraege');
    const first = appendRow(ws, {
      Projekt_Code: 'MATHE1', Task_Titel_Referenz: 'Neue Recherche', Typ: 'pomodoro', Datum: '2026-10-14',
      Startzeit: '10:00', Endzeit: '10:25',
    });
    appendRow(ws, {
      Projekt_Code: 'MATHE1', Task_Titel_Referenz: '  neue   recherche ', Datum: '2026-10-14', Startzeit: '11:00',
      Dauer_Minuten: 30,
    });
    appendRow(ws, {
      Projekt_Code: 'MATHE1', Task_Titel_Referenz: 'FORMELSAMMLUNG', Datum: '2026-10-14', Startzeit: '13:00',
      Endzeit: '13:45',
    });
    const result = await plan(wb);
    expect(errors(result)).toEqual([]);
    const tasks = creates(result, 'tasks');
    expect(tasks).toHaveLength(1);
    // Der Task entsteht, sobald die erste Zeile gültig ist – vor der ID des Zeiteintrags
    expect(tasks[0]!.row).toMatchObject({
      id: NEW1, project_id: ID.p1, work_package_id: null, title: 'Neue Recherche', status: 'in_progress',
    });
    expect(warnings(result)).toEqual([{
      sheet: '5_Zeiteintraege', row: first, column: 'Task_Titel_Referenz', severity: 'warning',
      message: 'Task «Neue Recherche» nicht gefunden – Task neu angelegt (Status in_progress)',
    }]);
    const logs = creates(result, 'time_logs').map((o) => o.row);
    expect(logs.map((l) => l.task_id)).toEqual([NEW1, NEW1, ID.t3]);
    expect(logs[0]).toEqual({
      id: NEW2, project_id: ID.p1, work_package_id: null, task_id: NEW1, workspace: 'study', mode: 'pomodoro',
      start_time: at(2026, 10, 14, 10), end_time: at(2026, 10, 14, 10, 25), duration_seconds: 1500,
      counts_as_pomodoro: true, comment: '',
    });
    expect(logs[1]).toMatchObject({
      mode: 'manual', counts_as_pomodoro: false, start_time: at(2026, 10, 14, 11), end_time: at(2026, 10, 14, 11, 30),
    });
    // Task vor den Zeiteinträgen, die ihn verwenden
    const taskIndex = result.ops.findIndex((o) => o.table === 'tasks');
    const logIndex = result.ops.findIndex((o) => o.table === 'time_logs');
    expect(taskIndex).toBeLessThan(logIndex);
    expect(result.summaryLines()[0]).toBe('Neu zu erstellen: 1 Task, 3 Zeiteinträge');
  });

  it('wählt bei mehreren Titel-Treffern den neuesten nicht erledigten Task (Warnung)', async () => {
    const s = sampleSnapshot();
    const t2 = s.tasks.find((t) => t.id === ID.t2)!;
    s.tasks.push({ ...t2, id: uuid('4', 9), title: 'Übungsblatt 2', status: 'done', created_at: at(2026, 10, 1) });
    s.tasks.push({ ...t2, id: uuid('4', 8), title: 'Übungsblatt 2', status: 'todo', created_at: at(2026, 9, 20) });
    const wb = await exportedWorkbook(s);
    const row = appendRow(sheet(wb, '5_Zeiteintraege'), {
      Projekt_Code: 'MATHE1', AP_Code: 'AP-1.1', Task_Titel_Referenz: 'Übungsblatt 2', Datum: '2026-10-14',
      Startzeit: '08:00', Endzeit: '08:30',
    });
    const result = await plan(wb, s);
    expect(creates(result, 'time_logs')[0]!.row.task_id).toBe(uuid('4', 8));
    expect(warnings(result)).toHaveLength(1);
    expect(warnings(result)[0]).toMatchObject({ row, column: 'Task_Titel_Referenz' });
    expect(warnings(result)[0]!.message).toMatch(/^3 Tasks mit dem Titel «Übungsblatt 2» gefunden/);
  });

  it('liest Datum und Uhrzeit aus echten Excel-Datumszellen (Date-Objekte) und Seriennummern', async () => {
    const wb = await exportedWorkbook();
    const ws = sheet(wb, '5_Zeiteintraege');
    const a = appendRow(ws, { Projekt_Code: 'PRO-WEB', AP_Code: 'AP-1', Typ: 'Stoppuhr' });
    // Wie Excel: Datumszelle (ExcelJS liefert ein Date mit der Wanduhrzeit in UTC-Bestandteilen)
    setCell(ws, a, 'Datum', new Date(Date.UTC(2026, 9, 14))).numFmt = 'dd.mm.yyyy';
    setCell(ws, a, 'Startzeit', new Date(Date.UTC(1899, 11, 30, 8, 15))).numFmt = 'hh:mm';
    setCell(ws, a, 'Endzeit', 0.375); // Tagesbruchteil = 09:00
    const b = appendRow(ws, {
      Projekt_Code: 'PRO-WEB', Datum: 46309, Startzeit: '9.30', Dauer_Minuten: '25,5', Typ: 'manuell',
    });
    // Über Mitternacht
    appendRow(ws, { Projekt_Code: 'MATHE1', Datum: '13.10.2026', Startzeit: '23:30', Endzeit: '00:30', Typ: 'pomodoro' });

    const parsed = await parseWorkbook(await wb.xlsx.writeBuffer());
    const rowA = parsed.sheets.time_logs.rows.find((r) => r.row === a)!;
    expect(rowA.values.date).toBeInstanceOf(Date);
    expect(rowA.values.start_time).toBeInstanceOf(Date);
    expect(parsed.sheets.time_logs.rows.find((r) => r.row === b)!.values.date).toBe(46309);

    const result = planImport(parsed, sampleSnapshot(), { today: TODAY, now: NOW, newId: idSequence() });
    expect(result.issues).toEqual([]);
    const logs = creates(result, 'time_logs').map((o) => o.row);
    expect(logs[0]).toMatchObject({
      project_id: ID.p2, work_package_id: ID.w3, workspace: 'work', mode: 'stopwatch',
      start_time: at(2026, 10, 14, 8, 15), end_time: at(2026, 10, 14, 9), duration_seconds: 45 * 60,
    });
    expect(logs[1]).toMatchObject({
      mode: 'manual', start_time: at(2026, 10, 14, 9, 30), end_time: at(2026, 10, 14, 9, 55, 30), duration_seconds: 1530,
    });
    expect(logs[2]).toMatchObject({
      workspace: 'study', start_time: at(2026, 10, 13, 23, 30), end_time: at(2026, 10, 14, 0, 30), duration_seconds: 3600,
      counts_as_pomodoro: true,
    });
  });

  it('versteht deutsche Begriffe und Zahlen mit Dezimalkomma', async () => {
    const wb = await exportedWorkbook();
    const p = sheet(wb, '1_Projekte');
    const pr = rowWhere(p, 'ID', ID.p2);
    setCell(p, pr, 'Modus', 'Lernen');
    setCell(p, pr, 'Status', 'pausiert');
    setCell(p, pr, 'Soll_Stunden_Gesamt', '12,5');
    const m = sheet(wb, '2_Meilensteine');
    setCell(m, rowWhere(m, 'ID', ID.m1), 'Status', 'erreicht');
    const t = sheet(wb, '4_Tasks');
    const tr = rowWhere(t, 'ID', ID.t2);
    setCell(t, tr, 'Status', 'erledigt');
    setCell(t, tr, 'Prioritaet', 'niedrig');
    setCell(t, rowWhere(t, 'ID', ID.t4), 'Status', 'in Arbeit');
    const l = sheet(wb, '5_Zeiteintraege');
    setCell(l, rowWhere(l, 'ID', ID.l3), 'Typ', 'Stechuhr');
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops).toEqual([
      { op: 'update', table: 'projects', id: ID.p2, patch: { mode: 'study', status: 'paused', planned_hours: 12.5 } },
      { op: 'update', table: 'milestones', id: ID.m1, patch: { status: 'achieved' } },
      // Erledigt: completed_at = jetzt
      { op: 'update', table: 'tasks', id: ID.t2, patch: { status: 'done', priority: 'low', completed_at: NOW } },
      { op: 'update', table: 'tasks', id: ID.t4, patch: { status: 'in_progress' } },
      { op: 'update', table: 'time_logs', id: ID.l3, patch: { mode: 'stopwatch' } },
    ]);
  });

  it('ändert Zeiteinträge und leitet den Workspace bei Projektwechsel aus dem Projekt-Modus ab', async () => {
    const wb = await exportedWorkbook();
    const l = sheet(wb, '5_Zeiteintraege');
    const r = rowWhere(l, 'ID', ID.l3);
    setCell(l, r, 'Projekt_Code', 'PRO-WEB');
    setCell(l, r, 'Endzeit', '15:30');
    setCell(l, r, 'Dauer_Minuten', null);
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(updates(result, 'time_logs')).toEqual([{
      op: 'update', table: 'time_logs', id: ID.l3,
      // Startzeit unverändert (Sekunden bleiben), Dauer = Ende − Start
      patch: { end_time: at(2026, 10, 7, 15, 30), duration_seconds: 5370, project_id: ID.p2, workspace: 'work' },
    }]);
  });

  it('löst umbenannte Projekt-Codes in den Folgeblättern unter altem und neuem Code auf', async () => {
    const wb = await exportedWorkbook();
    const p = sheet(wb, '1_Projekte');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Projekt_Code', 'MATHE-1');
    const t = sheet(wb, '4_Tasks');
    appendRow(t, { Projekt_Code: 'mathe1', Task_Titel: 'Über alten Code' });
    appendRow(t, { Projekt_Code: 'MATHE-1', Task_Titel: 'Über neuen Code' });
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops[0]).toEqual({ op: 'update', table: 'projects', id: ID.p1, patch: { project_code: 'MATHE-1' } });
    expect(creates(result, 'tasks').map((o) => o.row.project_id)).toEqual([ID.p1, ID.p1]);
  });

  it('erlaubt das Tauschen von Codes, ohne bestehende Verweise zu verbiegen', async () => {
    const wb = await exportedWorkbook();
    const p = sheet(wb, '1_Projekte');
    setCell(p, rowWhere(p, 'ID', ID.p1), 'Projekt_Code', 'PRO-WEB');
    setCell(p, rowWhere(p, 'ID', ID.p2), 'Projekt_Code', 'MATHE1');
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.ops).toEqual([
      { op: 'update', table: 'projects', id: ID.p1, patch: { project_code: 'PRO-WEB' } },
      { op: 'update', table: 'projects', id: ID.p2, patch: { project_code: 'MATHE1' } },
    ]);
  });

  it('meldet doppelte Codes im Blatt in der späteren Zeile', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    const existingRow = rowWhere(wp, 'ID', ID.w2);
    appendRow(wp, { Projekt_Code: 'MATHE1', AP_Code: 'AP-2', Titel: 'Erstes' });
    const dup = appendRow(wp, { Projekt_Code: 'MATHE1', AP_Code: 'ap-2', Titel: 'Zweites' });
    const taken = appendRow(wp, { Projekt_Code: 'MATHE1', AP_Code: 'AP-1.2', Titel: 'Schon vergeben' });
    // Gleicher Code in einem anderen Projekt ist erlaubt
    appendRow(wp, { Projekt_Code: 'PRO-WEB', AP_Code: 'AP-1.2', Titel: 'Anderes Projekt' });
    const p = sheet(wb, '1_Projekte');
    const renamed = rowWhere(p, 'ID', ID.p2);
    setCell(p, renamed, 'Projekt_Code', 'mathe1');
    const result = await plan(wb);
    expect(errors(result)).toEqual([
      {
        sheet: '1_Projekte', row: renamed, column: 'Projekt_Code', severity: 'error',
        message: `Doppelter Projekt_Code «mathe1» (bereits in Zeile ${rowWhere(p, 'ID', ID.p1)})`,
      },
      {
        sheet: '3_Arbeitspakete', row: dup, column: 'AP_Code', severity: 'error',
        message: `Doppelter AP_Code «ap-2» (bereits in Zeile ${dup - 1})`,
      },
      {
        sheet: '3_Arbeitspakete', row: taken, column: 'AP_Code', severity: 'error',
        message: `Doppelter AP_Code «AP-1.2» (bereits in Zeile ${existingRow})`,
      },
    ]);
    expect(creates(result, 'work_packages').map((o) => o.row.title)).toEqual(['Erstes', 'Anderes Projekt']);
  });

  it('meldet Codes, die ein nicht im Blatt aufgeführter Datensatz trägt, als bereits vergeben', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    // Zeile aus dem Blatt entfernt: das Arbeitspaket bleibt bestehen (Löschen nur über Loeschen = TRUE)
    wp.spliceRows(rowWhere(wp, 'ID', ID.w2), 1);
    const taken = appendRow(wp, { Projekt_Code: 'MATHE1', AP_Code: 'ap-1.2', Titel: 'Schon vergeben' });
    const result = await plan(wb);
    expect(errors(result)).toEqual([{
      sheet: '3_Arbeitspakete', row: taken, column: 'AP_Code', severity: 'error',
      message: 'AP_Code «ap-1.2» ist bereits vergeben (Arbeitspaket «MATHE1/AP-1.2 · Lineare Algebra»)',
    }]);
    expect(result.ops).toEqual([]);
  });

  it('erzeugt für neue Projekte ohne Code einen Code aus dem Namen (Warnung)', async () => {
    const wb = await exportedWorkbook();
    const row = appendRow(sheet(wb, '1_Projekte'), { Name: 'Mathematik Übungen', Modus: 'study' });
    appendRow(sheet(wb, '1_Projekte'), { Name: 'Mathematik Übungen', Modus: 'work' });
    const result = await plan(wb);
    expect(creates(result, 'projects').map((o) => o.row.project_code)).toEqual(['MATHEMATIK-U', 'MATHEMATIK-U-2']);
    expect(warnings(result)[0]).toEqual({
      sheet: '1_Projekte', row, column: 'Projekt_Code', severity: 'warning',
      message: 'Projekt_Code fehlt – «MATHEMATIK-U» wird aus dem Namen erzeugt',
    });
  });

  it('behandelt IDs: unbekannt → Insert mit dieser ID, ungültig → Fehler, gelöscht → Wiederherstellen', async () => {
    const wb = await exportedWorkbook();
    const t = sheet(wb, '4_Tasks');
    const unknown = uuid('abc', 77);
    const r1 = appendRow(t, { ID: unknown.toUpperCase(), Projekt_Code: 'MATHE1', Task_Titel: 'Mit eigener ID' });
    const r2 = appendRow(t, { ID: 'keine-uuid', Projekt_Code: 'MATHE1', Task_Titel: 'Kaputt' });
    const r3 = appendRow(t, { ID: ID.t5, Projekt_Code: 'MATHE1', AP_Code: 'AP-1.2', Task_Titel: 'Gelöschte Aufgabe' });
    const r4 = appendRow(t, { Projekt_Code: 'MATHE1', Task_Titel: 'Ohne ID löschen', Loeschen: true });
    const result = await plan(wb);
    expect(result.issues).toEqual([
      { sheet: '4_Tasks', row: r1, column: 'ID', severity: 'warning', message: 'Unbekannte ID – Datensatz wird mit dieser ID neu angelegt' },
      {
        sheet: '4_Tasks', row: r2, column: 'ID', severity: 'error',
        message: 'Ungültige ID «keine-uuid» (erwartet eine UUID; für neue Zeilen leer lassen)',
      },
      { sheet: '4_Tasks', row: r3, column: 'ID', severity: 'warning', message: 'Gelöschter Datensatz wird wiederhergestellt' },
      { sheet: '4_Tasks', row: r4, column: 'Loeschen', severity: 'warning', message: 'Loeschen = TRUE ohne ID – Zeile wird ignoriert' },
    ]);
    const rows = creates(result, 'tasks').map((o) => o.row);
    expect(rows.map((r) => r.id)).toEqual([unknown, ID.t5]);
    expect(rows[1]).toMatchObject({ title: 'Gelöschte Aufgabe', work_package_id: ID.w2, status: 'todo' });
    expect(result.changes.find((c) => c.id === ID.t5)).toMatchObject({ kind: 'create', restored: true });
    expect(result.skippedRows).toBe(2);
    expect(result.summaryLines()[0]).toBe('Neu zu erstellen: 2 Tasks (davon 1 wiederhergestellt)');
  });

  it('weist ungültige Werte zurück (Enum, negative Zahl, Datum, Pflichtfelder, Task_ID)', async () => {
    const wb = await exportedWorkbook();
    const t = sheet(wb, '4_Tasks');
    const tr = rowWhere(t, 'ID', ID.t2);
    setCell(t, tr, 'Status', 'vielleicht');
    setCell(t, tr, 'Geschaetzte_Stunden', -2);
    const m = sheet(wb, '2_Meilensteine');
    const mr = rowWhere(m, 'ID', ID.m1);
    setCell(m, mr, 'Zieldatum', '31.02.2026');
    const p = sheet(wb, '1_Projekte');
    const pr = appendRow(p, { Projekt_Code: 'NEU', Modus: 'study' });
    const l = sheet(wb, '5_Zeiteintraege');
    const lr = appendRow(l, { Projekt_Code: 'MATHE1', Task_ID: uuid('4', 99), Datum: '2026-10-14', Startzeit: '25:00' });
    const result = await plan(wb);
    expect(errors(result).map(formatIssue)).toEqual([
      `1_Projekte, Zeile ${pr}, Name: Name fehlt (Pflichtfeld)`,
      `2_Meilensteine, Zeile ${mr}, Zieldatum: Ungültiges Datum «31.02.2026» (erwartet JJJJ-MM-TT oder TT.MM.JJJJ)`,
      `4_Tasks, Zeile ${tr}, Status: Ungültiger Wert «vielleicht» für Status (erlaubt: todo, in_progress, done)`,
      `4_Tasks, Zeile ${tr}, Geschaetzte_Stunden: Negative Werte sind nicht erlaubt («-2»)`,
      `5_Zeiteintraege, Zeile ${lr}, Task_ID: Unbekannte Task_ID «${uuid('4', 99)}»`,
      `5_Zeiteintraege, Zeile ${lr}, Startzeit: Ungültige Uhrzeit «25:00» (erwartet HH:MM)`,
      `5_Zeiteintraege, Zeile ${lr}, Endzeit: Endzeit oder Dauer_Minuten fehlt`,
    ]);
    expect(result.ops).toEqual([]);
    expect(result.skippedRows).toBe(4);
  });

  it('verknüpft MS_Code und AP_Code nur innerhalb des Projekts', async () => {
    const wb = await exportedWorkbook();
    const row = appendRow(sheet(wb, '4_Tasks'), { Projekt_Code: 'PRO-WEB', AP_Code: 'AP-1.1', Task_Titel: 'Falsches Projekt' });
    const result = await plan(wb);
    expect(errors(result)).toEqual([{
      sheet: '4_Tasks', row, column: 'AP_Code', severity: 'error', message: 'Unbekannter AP_Code «AP-1.1» im Projekt «PRO-WEB»',
    }]);
  });

  it('verhindert das Verschieben von Arbeitspaketen in ein anderes Projekt', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    const r = rowWhere(wp, 'ID', ID.w2);
    setCell(wp, r, 'Projekt_Code', 'PRO-WEB');
    const result = await plan(wb);
    expect(errors(result)).toEqual([{
      sheet: '3_Arbeitspakete', row: r, column: 'Projekt_Code', severity: 'error',
      message: 'Arbeitspakete können nicht in ein anderes Projekt verschoben werden',
    }]);
  });
});

describe('summaryLines', () => {
  it('fasst Anlegen, Ändern, Löschen, Fehler und Warnungen auf Deutsch zusammen', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    appendRow(wp, { Projekt_Code: 'MATHE1', AP_Code: 'AP-3', Titel: 'Neu' });
    setCell(wp, rowWhere(wp, 'ID', ID.w1), 'Loeschen', true);
    const t = sheet(wb, '4_Tasks');
    appendRow(t, { Projekt_Code: 'MATHE1', AP_Code: 'AP-3', Task_Titel: 'A' });
    appendRow(t, { Projekt_Code: 'MATHE1', AP_Code: 'AP-3', Task_Titel: 'B' });
    setCell(t, rowWhere(t, 'ID', ID.t3), 'Task_Titel', 'Formelsammlung v2');
    const bad = appendRow(t, { Projekt_Code: 'NOPE', Task_Titel: 'C' });
    const warnRow = appendRow(t, { Projekt_Code: 'MATHE1', Task_Titel: 'D', Loeschen: 'TRUE' });
    const result = await plan(wb);
    expect(result.summaryLines()).toEqual([
      'Neu zu erstellen: 1 Arbeitspaket, 2 Tasks',
      'Zu aktualisieren: 1 Task',
      'Zu löschen: 1 Arbeitspaket (inkl. 2 abhängiger Tasks)',
      'Unverändert: 12 Zeilen',
      'Nicht übernommen: 2 Zeilen',
      'Fehler (1) – betroffene Zeilen werden nicht übernommen:',
      `– 4_Tasks, Zeile ${bad}, Projekt_Code: Unbekannter Projekt_Code «NOPE»`,
      'Warnungen (1):',
      `– 4_Tasks, Zeile ${warnRow}, Loeschen: Loeschen = TRUE ohne ID – Zeile wird ignoriert`,
    ]);
  });
});

describe('getCell-Hilfe', () => {
  it('findet Zellen über den Header', async () => {
    const wb = await exportedWorkbook();
    expect(getCell(sheet(wb, '1_Projekte'), 2, 'Projekt_Code').value).toBe('MATHE1');
  });
});

describe('Regressionen (Review)', () => {
  it('übernimmt Arbeitspakete, deren Meilenstein im selben Import gelöscht wird (Kaskade entfernt nur die Zuordnung)', async () => {
    const wb = await exportedWorkbook();
    const m = sheet(wb, '2_Meilensteine');
    setCell(m, rowWhere(m, 'ID', ID.m1), 'Loeschen', true);
    const wp = sheet(wb, '3_Arbeitspakete');
    setCell(wp, rowWhere(wp, 'ID', ID.w1), 'Titel', 'Analysis (überarbeitet)');
    appendRow(wp, { Projekt_Code: 'MATHE1', MS_Code: 'MS-1', AP_Code: 'AP-1.3', Titel: 'Statistik' });
    const result = await plan(wb);
    expect(result.issues).toEqual([]);
    expect(result.skippedRows).toBe(0);
    expect(result.ops).toEqual([
      { op: 'update', table: 'work_packages', id: ID.w1, patch: { title: 'Analysis (überarbeitet)' } },
      { op: 'create', table: 'work_packages', row: expect.objectContaining({ id: NEW1, ap_code: 'AP-1.3', milestone_id: ID.m1 }) },
      { op: 'delete', table: 'milestones', id: ID.m1 },
    ]);
    expect(result.summaryLines()).toContain('2 Arbeitspakete verlieren die Zuordnung zum gelöschten Meilenstein');
  });

  it('weist ein Startdatum nach der Deadline als Fehler zurück (Server-CHECK end_date >= start_date)', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    const changed = rowWhere(wp, 'ID', ID.w1); // Deadline 2026-11-30
    setCell(wp, changed, 'Startdatum', '2026-12-31');
    const added = appendRow(wp, {
      Projekt_Code: 'MATHE1', AP_Code: 'AP-1.3', Titel: 'Statistik', Startdatum: '2026-12-02', Deadline: '1.12.2026',
    });
    const result = await plan(wb);
    expect(errors(result)).toEqual([
      {
        sheet: '3_Arbeitspakete', row: changed, column: 'Startdatum', severity: 'error',
        message: 'Startdatum 2026-12-31 liegt nach der Deadline 2026-11-30',
      },
      {
        sheet: '3_Arbeitspakete', row: added, column: 'Startdatum', severity: 'error',
        message: 'Startdatum 2026-12-02 liegt nach der Deadline 2026-12-01',
      },
    ]);
    expect(result.ops).toEqual([]);
    expect(result.skippedRows).toBe(2);
  });

  it('prüft Startdatum und Deadline auch gegen den bisherigen Wert, wenn eine der Spalten fehlt', async () => {
    const wb = await exportedWorkbook();
    const wp = sheet(wb, '3_Arbeitspakete');
    wp.spliceColumns(col(wp, 'Deadline'), 1);
    const r = rowWhere(wp, 'ID', ID.w1); // bisherige Deadline 2026-11-30
    setCell(wp, r, 'Startdatum', '2026-12-01');
    const result = await plan(wb);
    expect(errors(result)).toEqual([{
      sheet: '3_Arbeitspakete', row: r, column: 'Startdatum', severity: 'error',
      message: 'Startdatum 2026-12-01 liegt nach der Deadline 2026-11-30',
    }]);
    expect(result.ops).toEqual([]);
  });

  it('meldet unveränderte Altdaten mit Startdatum nach der Deadline nicht bei jedem Roundtrip', async () => {
    const s = sampleSnapshot();
    const w2 = s.work_packages.find((w) => w.id === ID.w2)!;
    w2.start_date = '2026-12-01';
    w2.end_date = '2026-11-01';
    const result = await plan(await exportedWorkbook(s), s);
    expect(result.ops).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('lässt die Dauer bestehender Zeiteinträge unverändert, wenn die Spalte Dauer_Minuten fehlt', async () => {
    const wb = await exportedWorkbook();
    const l = sheet(wb, '5_Zeiteintraege');
    l.spliceColumns(col(l, 'Dauer_Minuten'), 1);
    const unchanged = await plan(wb);
    // l2 hat eine Pause: Dauer 100 Min. bei 105 Min. Zeitspanne
    expect(unchanged.ops).toEqual([]);
    expect(errors(unchanged)).toEqual([]);

    // Geänderte Endzeit: Dauer folgt der neuen Zeitspanne
    setCell(l, rowWhere(l, 'ID', ID.l1), 'Endzeit', '09:40');
    const result = await plan(wb);
    expect(result.ops).toEqual([{
      op: 'update', table: 'time_logs', id: ID.l1, patch: { end_time: at(2026, 10, 5, 9, 40), duration_seconds: 2400 },
    }]);
  });

  it('lässt die Endzeit bestehender Zeiteinträge unverändert, wenn die Spalte Endzeit fehlt', async () => {
    const wb = await exportedWorkbook();
    const l = sheet(wb, '5_Zeiteintraege');
    l.spliceColumns(col(l, 'Endzeit'), 1);
    const unchanged = await plan(wb);
    expect(unchanged.ops).toEqual([]);
    expect(errors(unchanged)).toEqual([]);

    // Geänderte Dauer: Endzeit = Startzeit + Dauer
    setCell(l, rowWhere(l, 'ID', ID.l2), 'Dauer_Minuten', 110);
    const result = await plan(wb);
    expect(result.ops).toEqual([{
      op: 'update', table: 'time_logs', id: ID.l2, patch: { end_time: at(2026, 10, 7, 0, 20), duration_seconds: 6600 },
    }]);
  });

  it('behält ohne Spalte Task_ID die bisherige Task-Verknüpfung, solange der Titel passt', async () => {
    const s = sampleSnapshot();
    const l1 = s.time_logs.find((l) => l.id === ID.l1)!;
    // Historie: Zeiteintrag eines gelöschten Tasks
    s.time_logs.push({
      ...l1, id: uuid('5', 7), work_package_id: ID.w2, task_id: ID.t5, mode: 'manual', counts_as_pomodoro: false,
      start_time: at(2026, 10, 8, 9), end_time: at(2026, 10, 8, 9, 25),
    });
    // Verweis auf einen Task, der im Datenbestand fehlt (Export ohne Titel)
    s.time_logs.push({ ...l1, id: uuid('5', 8), task_id: uuid('4', 99), start_time: at(2026, 10, 9, 9), end_time: at(2026, 10, 9, 9, 25) });
    // Neuerer, nicht erledigter Task mit gleichem Titel wie t1 – darf l1 nicht an sich ziehen
    const t1 = s.tasks.find((t) => t.id === ID.t1)!;
    s.tasks.push({ ...t1, id: uuid('4', 6), status: 'todo', completed_at: null, created_at: at(2026, 10, 2) });

    const wb = await exportedWorkbook(s);
    const l = sheet(wb, '5_Zeiteintraege');
    l.spliceColumns(col(l, 'Task_ID'), 1);
    const unchanged = await plan(wb, s);
    expect(unchanged.ops).toEqual([]);
    expect(unchanged.issues).toEqual([{
      sheet: '5_Zeiteintraege', row: 1, column: 'Task_ID', severity: 'warning',
      message: 'Spalte «Task_ID» fehlt – bestehende Werte bleiben unverändert',
    }]);

    // Geänderte Titel-Referenz: neu verknüpfen
    setCell(l, rowWhere(l, 'ID', ID.l1), 'Task_Titel_Referenz', 'Übungsblatt 2');
    const relinked = await plan(wb, s);
    expect(relinked.ops).toEqual([{ op: 'update', table: 'time_logs', id: ID.l1, patch: { task_id: ID.t2 } }]);
  });

  it('bevorzugt das Blatt mit exakt passendem Namen vor Kopien wie «1_Projekte (2)»', async () => {
    const wb = await exportedWorkbook();
    const copy = wb.addWorksheet('1_Projekte (2)');
    copy.addRow(['ID', 'Projekt_Code', 'Name', 'Modus']);
    copy.addRow([null, 'KOPIE', 'Kopie', 'study']);
    // Wie «Blatt kopieren» in Excel: die Kopie steht vor dem Original
    (copy as unknown as { orderNo: number }).orderNo = -1;
    const reloaded = await reload(wb);
    expect(reloaded.worksheets[0]!.name).toBe('1_Projekte (2)');

    const parsed = await parseWorkbook(reloaded);
    expect(parsed.sheets.projects.name).toBe('1_Projekte');
    expect(parsed.sheets.projects.rows).toHaveLength(2);
    const result = planImport(parsed, sampleSnapshot(), { today: TODAY, now: NOW, newId: idSequence() });
    expect(result.ops).toEqual([]);
  });
});
