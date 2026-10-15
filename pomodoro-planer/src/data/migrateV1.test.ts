import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { META, PlannerDB } from './db';
import {
  migrateV1, migrateV1Once, projectCodeBase, sha1Fallback, uuidFromHash, v1Uuid, V1_STORAGE_KEY,
} from './migrateV1';
import { Repository } from './repository';
import type { EntityTable } from './types';

const MIN = 60_000;
/** Zeitpunkt der v1-Einträge (1.9.2026) */
const T0 = Date.UTC(2026, 8, 1, 8, 0);
/** "Jetzt" für das Repository (15.10.2026) – nach allen v1-Änderungen */
const NOW = Date.UTC(2026, 9, 15, 12, 0);

let db: PlannerDB;
let repo: Repository;
let wall = NOW;

beforeEach(async () => {
  db = new PlannerDB(`migrate-${Math.random()}`);
  wall = NOW;
  repo = await Repository.open(db, () => wall);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type V1Record = Record<string, unknown>;
interface V1State {
  settings: V1Record;
  timer: V1Record;
  projects: V1Record[];
  tasks: V1Record[];
  sessions: V1Record[];
}

/** v1-Zustand wie in localStorage 'pomodoro-planer.v1' (vgl. js/store.js) */
const v1State = (): V1State => ({
  settings: {
    focus: 30, short: 5, long: 20, longEvery: 3, autoBreak: false, autoFocus: true,
    sound: true, volume: 0.7, notify: false, wakeLock: false, background: false, dailyGoalMin: 180, capacity: 8,
    presets: [{ id: 'klassisch', name: 'Klassisch', focus: 25, short: 5, long: 15, longEvery: 4 }],
  },
  timer: { phase: 'focus', status: 'idle', remaining: null, target: 't:t_ueb' },
  projects: [
    { id: 'p_mathe', name: 'Mathe 1', category: 'lernen', color: 3, goalHours: 40, deadline: '2026-12-20', notes: 'Prüfung im Januar', archived: false, createdAt: T0, updatedAt: T0 + 1000 },
    { id: 'p_mathe_b', name: 'Mathe-1', category: 'lernen', color: 99, goalHours: 0, deadline: '', notes: '', archived: false, createdAt: T0, updatedAt: T0 },
    { id: 'p_job', name: 'Werkstudium', category: 'arbeit', color: 2, goalHours: null, deadline: null, notes: '', archived: false, createdAt: T0, updatedAt: T0 },
    { id: 'p_umzug', name: 'Umzug', category: 'sonstiges', color: 8, goalHours: 12.5, deadline: null, notes: 'erledigt', archived: true, createdAt: T0, updatedAt: T0 },
    { id: 'p_demo_rt', name: 'Beispiel: Regelungstechnik', category: 'lernen', color: 1, goalHours: 40, deadline: '2026-11-22', notes: 'Prüfung Ende Semester', demo: true, archived: false, createdAt: T0 },
    { id: 'p_demo_ws', name: 'Beispiel: Werkstudium', category: 'arbeit', color: 2, goalHours: null, deadline: null, notes: '20 % Pensum', demo: true, archived: false, createdAt: T0 },
  ],
  tasks: [
    { id: 't_ueb', title: 'Übungsserie 4', projectId: 'p_mathe', estimate: 3, date: '2026-10-16', time: '14:00', done: true, doneAt: T0 + 5 * MIN, notes: 'Aufgabe 3 offen', createdAt: T0, updatedAt: T0 },
    { id: 't_zus', title: 'Zusammenfassung', projectId: 'p_mathe', estimate: 2, date: null, time: null, done: false, doneAt: null, notes: '', createdAt: T0, updatedAt: T0 },
    { id: 't_frei', title: 'Steuererklärung', projectId: null, estimate: 1, date: '2026-10-20', time: null, done: false, doneAt: null, notes: '', createdAt: T0, updatedAt: T0 },
    { id: 't_bericht', title: 'Bericht', projectId: 'p_job', estimate: null, date: null, time: null, done: false, doneAt: null, notes: '', createdAt: T0, updatedAt: T0 },
    { id: 't_demo', title: 'Bode-Diagramme repetieren', projectId: 'p_demo_rt', estimate: 2, date: '2026-10-15', time: null, done: false, doneAt: null, notes: '', demo: true, createdAt: T0 },
  ],
  sessions: [
    { id: 's_pomo', start: T0, end: T0 + 25 * MIN, sec: 1500, full: true, taskId: 't_ueb', projectId: 'p_mathe', category: 'lernen', title: 'Übungsserie 4', note: '', manual: false },
    { id: 's_manuell', start: T0 + 60 * MIN, end: T0 + 120 * MIN, sec: 3600, full: false, taskId: null, projectId: 'p_job', category: 'arbeit', title: 'Werkstudium', note: 'Teammeeting', manual: true },
    { id: 's_ohne', start: T0 + 180 * MIN, end: T0 + 200 * MIN, sec: 1200, full: false, taskId: null, projectId: null, category: 'arbeit', title: '', note: 'Mails', manual: false },
    { id: 's_frei', start: T0 + 240 * MIN, end: T0 + 265 * MIN, sec: 1500, full: true, taskId: 't_frei', projectId: null, category: 'sonstiges', title: 'Steuererklärung', note: '', manual: false },
    { id: 's_alt', start: T0 + 300 * MIN, end: T0 + 330 * MIN, sec: 1500, full: true, taskId: null, projectId: 'p_mathe', category: 'lernen', title: 'Altprüfung 2024', note: 'Teil 1', manual: false },
    { id: 's_demo', start: T0 + 400 * MIN, end: T0 + 425 * MIN, sec: 1500, full: true, taskId: 't_demo', projectId: 'p_demo_rt', category: 'lernen', title: 'Bode-Diagramme repetieren', note: '', manual: false, demo: true },
    { id: 's_kaputt', start: 'gestern', sec: 1500 },
  ],
});

async function row<K extends EntityTable>(table: K, oldId: string) {
  return repo.get(table, await v1Uuid(oldId));
}

const ALLGEMEIN = '#allgemein';

describe('migrateV1 – Abbildung', () => {
  it('übernimmt Projekte mit Modus, Code, Farbe, Status, Soll und Termin', async () => {
    const report = await migrateV1(v1State(), repo);
    expect(report.counts.projects).toEqual({ created: 5, updated: 0, unchanged: 0 });

    expect(await row('projects', 'p_mathe')).toMatchObject({
      project_code: 'MATHE1', name: 'Mathe 1', mode: 'study', status: 'active', color: '#1baf7a',
      planned_hours: 40, start_date: null, end_date: '2026-12-20', notes: 'Prüfung im Januar', is_deleted: false, _dirty: 1,
    });
    expect(await row('projects', 'p_mathe_b')).toMatchObject({
      project_code: 'MATHE1-2', color: '#2a78d6', planned_hours: null, end_date: null,
    });
    expect(await row('projects', 'p_job')).toMatchObject({ project_code: 'WERKSTUDIU', mode: 'work', color: '#eb6834' });
    expect(await row('projects', 'p_umzug')).toMatchObject({
      project_code: 'UMZUG', mode: 'work', status: 'archived', color: '#e34948', planned_hours: 12.5, notes: 'erledigt',
    });
  });

  it('sortiert Projekte alphabetisch wie v1 und hängt «Allgemein» an', async () => {
    await migrateV1(v1State(), repo);
    const order = async (id: string) => (await row('projects', id))!.sort_order;
    expect(new Set([await order('p_mathe'), await order('p_mathe_b')])).toEqual(new Set([0, 1]));
    expect(await order('p_umzug')).toBe(2);
    expect(await order('p_job')).toBe(3);
    expect(await order(ALLGEMEIN)).toBe(4);
  });

  it('legt das Ersatzprojekt «Allgemein» für Aufgaben ohne Projekt an', async () => {
    const report = await migrateV1(v1State(), repo);
    const general = await row('projects', ALLGEMEIN);
    expect(general).toMatchObject({ project_code: 'ALLGEMEIN', name: 'Allgemein', mode: 'study', status: 'active' });
    expect((await row('tasks', 't_frei'))!.project_id).toBe(general!.id);
    expect(report.warnings).toContain('1 Aufgabe ohne Projekt dem Projekt «Allgemein» zugeordnet.');
  });

  it('legt «Allgemein» nur bei Bedarf an (Zeiteinträge ohne Projekt brauchen es nicht)', async () => {
    const state = v1State();
    state.tasks = state.tasks.filter((t) => t.id !== 't_frei');
    state.sessions = state.sessions.filter((s) => s.id !== 's_frei');
    const report = await migrateV1(state, repo);
    expect(report.counts.projects.created).toBe(4);
    expect(await row('projects', ALLGEMEIN)).toBeUndefined();
    expect((await row('time_logs', 's_ohne'))!.project_id).toBeNull();
  });

  it('übernimmt Aufgaben mit Status, Schätzung, Fälligkeit und Notizen', async () => {
    const report = await migrateV1(v1State(), repo);
    expect(report.counts.tasks).toEqual({ created: 4, updated: 0, unchanged: 0 });
    const mathe = await row('projects', 'p_mathe');
    expect(await row('tasks', 't_ueb')).toMatchObject({
      project_id: mathe!.id, work_package_id: null, title: 'Übungsserie 4', status: 'done', priority: 'medium',
      due_date: '2026-10-16', estimated_pomodoros: 3, estimated_hours: 1.5, notes: 'Aufgabe 3 offen',
      completed_at: T0 + 5 * MIN,
    });
    expect(await row('tasks', 't_zus')).toMatchObject({ status: 'todo', estimated_pomodoros: 2, estimated_hours: 1, completed_at: null });
    expect(await row('tasks', 't_frei')).toMatchObject({ estimated_pomodoros: 1, estimated_hours: 0.5, due_date: '2026-10-20' });
    expect(await row('tasks', 't_bericht')).toMatchObject({ estimated_pomodoros: null, estimated_hours: null });
  });

  it('rechnet die Schätzung mit 25 Minuten, wenn v1 keine Fokusdauer kennt', async () => {
    const state = { ...v1State(), settings: {} };
    await migrateV1(state, repo);
    expect((await row('tasks', 't_zus'))!.estimated_hours).toBe(0.83); // 2 × 25 / 60, auf 2 Stellen
  });

  it('übernimmt Sessions als Zeiteinträge', async () => {
    const report = await migrateV1(v1State(), repo);
    expect(report.counts.time_logs).toEqual({ created: 5, updated: 0, unchanged: 0 });
    const id = async (table: EntityTable, old: string) => (await repo.get(table, await v1Uuid(old)))!.id;

    expect(await row('time_logs', 's_pomo')).toMatchObject({
      project_id: await id('projects', 'p_mathe'), work_package_id: null, task_id: await id('tasks', 't_ueb'),
      workspace: 'study', mode: 'pomodoro', start_time: T0, end_time: T0 + 25 * MIN, duration_seconds: 1500,
      counts_as_pomodoro: true, comment: '',
    });
    expect(await row('time_logs', 's_manuell')).toMatchObject({
      project_id: await id('projects', 'p_job'), task_id: null, workspace: 'work', mode: 'manual',
      counts_as_pomodoro: false, duration_seconds: 3600, comment: 'Teammeeting',
    });
    expect(await row('time_logs', 's_ohne')).toMatchObject({ project_id: null, task_id: null, workspace: 'work', comment: 'Mails' });
    // Aufgabe ohne Projekt → Ersatzprojekt; Modus aus der Kategorie der Session («Sonstiges» → Arbeit)
    expect(await row('time_logs', 's_frei')).toMatchObject({
      project_id: await id('projects', ALLGEMEIN), task_id: await id('tasks', 't_frei'), workspace: 'work',
    });
    // Titel einer in v1 gelöschten Aufgabe bleibt im Kommentar erhalten
    expect(await row('time_logs', 's_alt')).toMatchObject({ task_id: null, workspace: 'study', comment: 'Altprüfung 2024 – Teil 1' });
  });

  it('ergänzt ein fehlendes Ende aus der Dauer', async () => {
    const state = v1State();
    state.sessions = [{ ...state.sessions[0]!, end: undefined }];
    await migrateV1(state, repo);
    expect((await row('time_logs', 's_pomo'))!.end_time).toBe(T0 + 1500 * 1000);
  });

  it('bildet die Einstellungen ab', async () => {
    const report = await migrateV1(v1State(), repo);
    expect(report.settings).toEqual({
      focus_minutes: 30, short_break_minutes: 5, long_break_minutes: 20, long_break_every: 3,
      auto_start_breaks: false, auto_start_focus: true, daily_goal_minutes: 180,
    });
  });

  it('meldet übersprungene Einträge und Hinweise', async () => {
    const report = await migrateV1(v1State(), repo);
    expect(report.skipped).toEqual(expect.arrayContaining([
      { table: 'projects', oldId: 'p_demo_rt', reason: 'Beispieldaten' },
      { table: 'projects', oldId: 'p_demo_ws', reason: 'Beispieldaten' },
      { table: 'tasks', oldId: 't_demo', reason: 'Beispieldaten' },
      { table: 'time_logs', oldId: 's_demo', reason: 'Beispieldaten' },
      { table: 'time_logs', oldId: 's_kaputt', reason: 'Ungültige Zeitangaben' },
    ]));
    expect(report.skipped).toHaveLength(5);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Uhrzeit bei 1 Aufgabe nicht übernommen (v2 plant Zeiten über Kalenderblöcke).',
      'Kategorie «Sonstiges» dem Arbeitsmodus zugeordnet (2 Einträge).',
    ]));
  });

  it('schreibt alles mit einem einzigen applyBatch (eine Transaktion)', async () => {
    const spy = vi.spyOn(repo, 'applyBatch');
    await migrateV1(v1State(), repo);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toHaveLength(14);
  });

  it('nimmt auch den JSON-Text bzw. eine v1-Backup-Datei an', async () => {
    const s = v1State();
    const backup = { app: 'pomodoro-planer', version: 1, exportedAt: '2026-10-01T10:00:00.000Z', settings: s.settings, projects: s.projects, tasks: s.tasks, sessions: s.sessions };
    const report = await migrateV1(JSON.stringify(backup), repo);
    expect(report.counts.projects.created).toBe(5);
    expect(report.counts.time_logs.created).toBe(5);
  });
});

describe('migrateV1 – Beispieldaten', () => {
  it('übernimmt Beispieldaten mit includeDemo; eigene Projekte behalten den Code ohne Suffix', async () => {
    const report = await migrateV1(v1State(), repo, { includeDemo: true });
    expect(report.counts.projects.created).toBe(7);
    expect(report.counts.tasks.created).toBe(5);
    expect(report.counts.time_logs.created).toBe(6);
    expect(await row('projects', 'p_demo_rt')).toMatchObject({ project_code: 'REGELUNGST', name: 'Beispiel: Regelungstechnik', end_date: '2026-11-22' });
    expect((await row('projects', 'p_job'))!.project_code).toBe('WERKSTUDIU');
    expect((await row('projects', 'p_demo_ws'))!.project_code).toBe('WERKSTUD-2');
    expect(report.skipped.filter((s) => s.reason === 'Beispieldaten')).toHaveLength(0);
  });

  it('übernimmt Beispieleinträge, auf die eigene Zeiteinträge verweisen', async () => {
    const state = v1State();
    state.sessions.push({ id: 's_eigen', start: T0 + 500 * MIN, end: T0 + 525 * MIN, sec: 1500, full: true, taskId: 't_demo', projectId: 'p_demo_rt', category: 'lernen', title: 'Bode-Diagramme repetieren', note: '', manual: false });
    const report = await migrateV1(state, repo);
    expect(await row('projects', 'p_demo_rt')).toBeDefined();
    expect(await row('tasks', 't_demo')).toBeDefined();
    expect(await row('projects', 'p_demo_ws')).toBeUndefined();
    expect((await row('time_logs', 's_eigen'))!.task_id).toBe((await row('tasks', 't_demo'))!.id);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Beispielprojekt «Beispiel: Regelungstechnik» übernommen, weil eigene Einträge darauf verweisen.',
      '1 Beispielaufgabe übernommen, weil eigene Zeiteinträge darauf verweisen.',
    ]));
  });
});

describe('migrateV1 – Idempotenz', () => {
  async function tableSizes() {
    return {
      projects: (await repo.list('projects', { includeDeleted: true })).length,
      tasks: (await repo.list('tasks', { includeDeleted: true })).length,
      time_logs: (await repo.list('time_logs', { includeDeleted: true })).length,
    };
  }

  it('zweiter Lauf legt nichts neu an und ändert nichts', async () => {
    await migrateV1(v1State(), repo);
    const before = await tableSizes();
    const stamps = (await repo.list('projects')).map((p) => p.updated_at);
    wall = NOW + 60_000;

    const again = await migrateV1(v1State(), repo);
    expect(again.counts).toEqual({
      projects: { created: 0, updated: 0, unchanged: 5 },
      tasks: { created: 0, updated: 0, unchanged: 4 },
      time_logs: { created: 0, updated: 0, unchanged: 5 },
    });
    expect(await tableSizes()).toEqual(before);
    expect((await repo.list('projects')).map((p) => p.updated_at)).toEqual(stamps);
  });

  it('auch wenn die v1-Zeitstempel jünger sind als die Migration (Upsert ohne Änderung)', async () => {
    wall = 1_000; // Repository-Uhr weit vor den v1-Zeitstempeln
    repo = await Repository.open(db, () => wall);
    await migrateV1(v1State(), repo);
    const again = await migrateV1(v1State(), repo);
    expect(again.counts.projects).toEqual({ created: 0, updated: 0, unchanged: 5 });
    expect(again.counts.tasks).toEqual({ created: 0, updated: 0, unchanged: 4 });
    expect(again.counts.time_logs).toEqual({ created: 0, updated: 0, unchanged: 5 });
  });

  it('leitet deterministische UUIDs aus den alten IDs ab', async () => {
    const a = await v1Uuid('p_mathe');
    expect(a).toBe(await v1Uuid('p_mathe'));
    expect(a).not.toBe(await v1Uuid('p_job'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await migrateV1(v1State(), repo);
    expect((await repo.get('projects', a))!.name).toBe('Mathe 1');
  });

  it('in v2 bearbeitete Daten gewinnen gegen ältere v1-Daten', async () => {
    await migrateV1(v1State(), repo);
    const id = await v1Uuid('p_mathe');
    wall = NOW + 1000;
    await repo.update('projects', id, { name: 'Analysis 1' });
    const again = await migrateV1(v1State(), repo);
    expect((await repo.get('projects', id))!.name).toBe('Analysis 1');
    expect(again.counts.projects.updated).toBe(0);
  });

  it('später in v1 geänderte Einträge werden aktualisiert – v2-Felder bleiben erhalten', async () => {
    await migrateV1(v1State(), repo);
    const taskId = await v1Uuid('t_zus');
    await repo.update('tasks', taskId, { priority: 'high' });

    const later = NOW + 3_600_000;
    const state = v1State();
    state.projects[0] = { ...state.projects[0]!, name: 'Mathematik 1', updatedAt: later };
    state.tasks[1] = { ...state.tasks[1]!, done: true, doneAt: later, updatedAt: later };
    wall = later + 1000;
    const again = await migrateV1(state, repo);

    expect(again.counts.projects).toEqual({ created: 0, updated: 1, unchanged: 4 });
    expect(again.counts.tasks).toEqual({ created: 0, updated: 1, unchanged: 3 });
    expect(await row('projects', 'p_mathe')).toMatchObject({ name: 'Mathematik 1', project_code: 'MATHE1', _dirty: 1 });
    expect(await repo.get('tasks', taskId)).toMatchObject({ status: 'done', completed_at: later, priority: 'high' });
  });

  it('belebt in v2 gelöschte Einträge nicht wieder', async () => {
    await migrateV1(v1State(), repo);
    const mathe = await v1Uuid('p_mathe');
    await repo.softDelete('projects', mathe); // löscht auch t_ueb und t_zus
    const state = v1State();
    state.tasks.push({ id: 't_neu', title: 'Neue Aufgabe', projectId: 'p_mathe', estimate: 1, date: null, time: null, done: false, doneAt: null, notes: '', createdAt: T0, updatedAt: T0 });

    const again = await migrateV1(state, repo);
    expect((await repo.get('projects', mathe))!.is_deleted).toBe(true);
    expect((await row('tasks', 't_ueb'))!.is_deleted).toBe(true);
    expect(await row('tasks', 't_neu')).toBeUndefined();
    expect(again.skipped).toEqual(expect.arrayContaining([
      { table: 'projects', oldId: 'p_mathe', reason: 'In v2 gelöscht' },
      { table: 'tasks', oldId: 't_ueb', reason: 'In v2 gelöscht' },
      { table: 'tasks', oldId: 't_neu', reason: 'Projekt in v2 gelöscht' },
    ]));
    expect(again.counts.projects.created).toBe(0);
    // Zeiteinträge bleiben als Historie mit Verweis erhalten
    expect((await row('time_logs', 's_pomo'))!.project_id).toBe(mathe);
  });

  it('weicht vorhandenen v2-Codes aus', async () => {
    await repo.create('projects', {
      project_code: 'mathe1', name: 'Mathe (v2)', mode: 'study', status: 'active', color: '#2a78d6',
      planned_hours: null, start_date: null, end_date: null, notes: '', sort_order: 0,
    });
    await migrateV1(v1State(), repo);
    expect((await row('projects', 'p_mathe'))!.project_code).toBe('MATHE1-2');
    expect((await row('projects', 'p_mathe_b'))!.project_code).toBe('MATHE1-3');
  });
});

describe('migrateV1 – robuste Eingaben', () => {
  it('ohne Daten: leerer Bericht ohne Schreibzugriff', async () => {
    const spy = vi.spyOn(repo, 'applyBatch');
    const report = await migrateV1(null, repo);
    expect(report.warnings).toEqual([]);
    expect(report.counts.projects).toEqual({ created: 0, updated: 0, unchanged: 0 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('ungültiges JSON und falsche Form werden gemeldet', async () => {
    expect((await migrateV1('{kaputt', repo)).warnings).toEqual(['Die v1-Daten sind kein gültiges JSON – nichts übernommen.']);
    expect((await migrateV1([1, 2], repo)).warnings).toEqual(['Keine gültigen v1-Daten gefunden – nichts übernommen.']);
    expect(await repo.list('projects')).toHaveLength(0);
  });

  it('doppelte und fehlende IDs', async () => {
    const report = await migrateV1({
      projects: [
        { id: 'p_x', name: 'Erst', category: 'lernen' },
        { id: 'p_x', name: 'Zweit', category: 'lernen' },
        { name: 'Ohne ID' },
        'kein Objekt',
      ],
    }, repo);
    expect(report.counts.projects.created).toBe(1);
    expect((await row('projects', 'p_x'))!.name).toBe('Zweit');
    expect(report.skipped).toEqual([
      { table: 'projects', oldId: 'p_x', reason: 'Doppelte ID (späterer Eintrag übernommen)' },
      { table: 'projects', oldId: '', reason: 'Eintrag ohne ID' },
      { table: 'projects', oldId: '', reason: 'Kein gültiger Eintrag' },
    ]);
  });

  it('ungültige Werte werden ersetzt', async () => {
    const report = await migrateV1({
      projects: [{ id: 'p_y', name: '  ', category: 'unbekannt', color: '3', goalHours: '12,5', deadline: '31.12.2026' }],
      tasks: [{ id: 't_y', title: '', projectId: 'p_y', estimate: 2.6, date: '2026-02-30', done: false }],
    }, repo);
    expect(await row('projects', 'p_y')).toMatchObject({
      name: 'Ohne Namen', project_code: 'PROJEKT', mode: 'work', color: '#1baf7a', planned_hours: 12.5, end_date: null,
    });
    expect(await row('tasks', 't_y')).toMatchObject({ title: 'Ohne Titel', estimated_pomodoros: 3, due_date: null });
    expect(report.warnings).toContain('Ungültiger Termin bei Projekt «Ohne Namen» ignoriert.');
  });
});

describe('Projekt-Codes', () => {
  it('bildet den Code aus dem Namen', () => {
    expect(projectCodeBase('Beispiel: Regelungstechnik')).toBe('REGELUNGST');
    expect(projectCodeBase('beispiel:Masterarbeit')).toBe('MASTERARBE');
    expect(projectCodeBase('Mathe 1')).toBe('MATHE1');
    expect(projectCodeBase('Übung & Grösse')).toBe('UEBUNGGROE');
    expect(projectCodeBase('Straße')).toBe('STRASSE');
    expect(projectCodeBase('Café 2')).toBe('CAFE2');
    expect(projectCodeBase('!!!')).toBe('PROJEKT');
  });
});

describe('SHA-1 und UUID', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

  it('Ersatz-SHA-1 liefert die bekannten Testvektoren', () => {
    expect(hex(sha1Fallback(enc('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hex(sha1Fallback(enc('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('Ersatz-SHA-1 stimmt an den Blockgrenzen mit crypto.subtle überein', async () => {
    for (const len of [1, 55, 56, 63, 64, 65, 119, 200]) {
      const msg = enc('x'.repeat(len));
      const ref = new Uint8Array(await crypto.subtle.digest('SHA-1', msg));
      expect(hex(sha1Fallback(msg))).toBe(hex(ref));
    }
  });

  it('v1Uuid funktioniert auch ohne crypto.subtle (unsicherer Kontext)', async () => {
    const expected = uuidFromHash(sha1Fallback(enc('pp-v1:p_mathe')));
    expect(await v1Uuid('p_mathe')).toBe(expected);
    vi.stubGlobal('crypto', {});
    expect(await v1Uuid('p_mathe')).toBe(expected);
  });
});

describe('migrateV1Once', () => {
  const storage = (value: string | null) => ({ getItem: vi.fn((key: string) => (key === V1_STORAGE_KEY ? value : null)) });

  it('migriert einmal und merkt sich das', async () => {
    const s = storage(JSON.stringify(v1State()));
    const report = await migrateV1Once(repo, s);
    expect(report!.counts.projects.created).toBe(5);
    expect(await db.getMeta(META.migratedV1)).toMatchObject({ found: true });
    expect(await migrateV1Once(repo, s)).toBeNull();
    expect(s.getItem).toHaveBeenCalledTimes(1);
  });

  it('ohne v1-Daten: nichts zu tun, aber markiert', async () => {
    expect(await migrateV1Once(repo, storage(null))).toBeNull();
    expect(await db.getMeta(META.migratedV1)).toMatchObject({ found: false, counts: null });
  });

  it('blockierter Speicher gilt als «keine Daten»', async () => {
    const blocked = { getItem: () => { throw new Error('SecurityError'); } };
    expect(await migrateV1Once(repo, blocked)).toBeNull();
  });
});
