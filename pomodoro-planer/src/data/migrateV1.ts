/**
 * Übernahme der v1-Daten (localStorage 'pomodoro-planer.v1' oder JSON-Backup aus v1) in das
 * Datenmodell v2. Die v1-Daten selbst bleiben unangetastet.
 *
 * Abbildung
 * - Projekte: category lernen → 'study', arbeit → 'work', sonstiges (und Unbekanntes) → 'work';
 *   project_code aus dem Namen (A–Z/0–9, ohne «Beispiel:», max. 10 Zeichen, eindeutig mit -2, -3 …);
 *   Farbindex 1–8 → Hex; archived → 'archived'; goalHours → planned_hours; deadline → end_date.
 * - Aufgaben: done → 'done' sonst 'todo'; estimate → estimated_pomodoros und
 *   estimated_hours = estimate × Fokusdauer / 60; date → due_date. Aufgaben ohne Projekt landen im
 *   Ersatzprojekt «Allgemein» (Code ALLGEMEIN, Lernmodus), das nur bei Bedarf angelegt wird.
 * - Sessions → time_logs: manual → 'manual' sonst 'pomodoro', full → counts_as_pomodoro, Modus aus dem
 *   zugeordneten Projekt (auch «Allgemein») bzw. ohne Projekt aus der Kategorie der Session,
 *   sec → duration_seconds, note → comment.
 * - Einstellungen → Partial<UserSettings> im Bericht (der Aufrufer übernimmt sie).
 *
 * Idempotenz
 * - Neue IDs werden deterministisch aus den alten abgeleitet (SHA-1 über "pp-v1:" + alte ID,
 *   UUID-Layout Version 5). Ein erneuter Lauf erzeugt daher keine Duplikate. Das Ersatzprojekt
 *   «Allgemein» hat keine alte ID; seine ID hängt von den zugeordneten Aufgaben ab (fallbackProjectKey).
 * - Bereits vorhandene Zeilen werden nur überschrieben, wenn der v1-Eintrag nachweislich später
 *   geändert wurde (v1 updatedAt > v2 updated_at) – in v2 bearbeitete Daten gewinnen sonst.
 *   Dabei werden nur Felder geschrieben, die v1 kennt (keine Arbeitspakete, Prioritäten o. Ä.).
 *   Zeiteinträge haben in v1 keinen Änderungszeitpunkt und werden nur neu angelegt.
 * - In v2 gelöschte Zeilen werden nicht wiederbelebt.
 * - Beispieldaten (demo) werden standardmässig übersprungen – ausser eigene Einträge verweisen darauf.
 *
 * Alles wird mit einem einzigen repo.applyBatch geschrieben, also in einer Transaktion.
 */
import { META } from './db';
import type { BatchOp, Repository } from './repository';
import type { AnyEntity, EntityTable, Project, Task, UserSettings, Workspace } from './types';

export const V1_STORAGE_KEY = 'pomodoro-planer.v1';

/** v1-Farbindex 1–8 → Hex */
export const V1_COLOR_HEX = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

/** v1-Kategorie → v2-Modus; «Sonstiges» wird dem Arbeitsmodus zugeordnet (Entscheidung, siehe ARCHITEKTUR.md) */
export const V1_CATEGORY_MODE: Readonly<Record<string, Workspace>> = { lernen: 'study', arbeit: 'work', sonstiges: 'work' };

/** Ersatzprojekt für Aufgaben ohne Projekt */
export const FALLBACK_PROJECT = { name: 'Allgemein', code: 'ALLGEMEIN', mode: 'study' as Workspace, v1Key: '#allgemein' };

const ID_PREFIX = 'pp-v1:';
const CODE_MAX = 10;
const DEFAULT_FOCUS_MINUTES = 25;

export type MigratedTable = 'projects' | 'tasks' | 'time_logs';

export interface MigrationCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export interface MigrationSkip {
  table: MigratedTable;
  /** Alte v1-ID ('' wenn der Eintrag keine hatte) */
  oldId: string;
  reason: string;
}

export interface MigrationReport {
  /** Zähler je Tabelle */
  counts: Record<MigratedTable, MigrationCounts>;
  /** Nicht übernommene Einträge mit Begründung */
  skipped: MigrationSkip[];
  /** Hinweise für den Nutzer (deutsch) */
  warnings: string[];
  /** Aus v1 abgeleitete Einstellungen; nur Werte, die in v1 gültig gesetzt waren */
  settings: Partial<UserSettings>;
}

export interface MigrateV1Options {
  /** Beispieldaten übernehmen (Standard: false) */
  includeDemo?: boolean;
}

/* ---------- Deterministische IDs ---------- */

/** SHA-1 in reinem JavaScript – Ersatz, wo crypto.subtle fehlt (unsicherer Kontext, z. B. http:// im LAN) */
export function sha1Fallback(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = len * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]!) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  h.forEach((x, i) => outView.setUint32(i * 4, x));
  return out;
}

async function sha1(msg: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try { return new Uint8Array(await subtle.digest('SHA-1', msg)); } catch { /* Ersatz unten */ }
  }
  return sha1Fallback(msg);
}

/** SHA-1-Hash (erste 16 Byte) im UUID-Layout Version 5 */
export function uuidFromHash(hash: Uint8Array): string {
  const b = hash.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** v2-ID zu einer v1-ID (immer gleich für dieselbe alte ID) */
export async function v1Uuid(oldId: string): Promise<string> {
  return uuidFromHash(await sha1(new TextEncoder().encode(ID_PREFIX + oldId)));
}

/**
 * Schlüssel, aus dem die ID des Ersatzprojekts abgeleitet wird. Ein fester Schlüssel ergäbe für
 * alle Nutzer dieselbe UUID – auf dem Server ist projects.id aber ein globaler Primärschlüssel,
 * der Push jedes weiteren Kontos würde scheitern. Deshalb fliesst die kleinste alte ID der
 * zugeordneten Aufgaben ein (v1-IDs enthalten Zeitstempel und Zufall, sind also je Nutzer
 * verschieden): Derselbe v1-Bestand ergibt auf jedem Gerät dieselbe ID, ein anderer eine andere.
 */
export function fallbackProjectKey(orphanTaskIds: readonly string[]): string {
  let seed = '';
  for (const id of orphanTaskIds) if (!seed || id < seed) seed = id;
  return `${FALLBACK_PROJECT.v1Key}:${seed}`;
}

/* ---------- Robuste Feldwerte ---------- */

type V1Row = Record<string, unknown> & { id: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const positive = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const ref = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null);
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** 'YYYY-MM-DD' mit gültigem Kalendertag, sonst null */
function dateKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? m[0] : null;
}

const modeOf = (category: unknown): Workspace => V1_CATEGORY_MODE[text(category)] ?? 'work';

function colorOf(v: unknown): string {
  const i = num(v);
  if (i !== null && Number.isInteger(i) && i >= 1 && i <= V1_COLOR_HEX.length) return V1_COLOR_HEX[i - 1]!;
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  return V1_COLOR_HEX[0];
}

/** Zeitpunkt der letzten v1-Änderung (für den Vergleich mit v2 updated_at) */
const v1Stamp = (r: V1Row): number | null => num(r.updatedAt) ?? num(r.createdAt);

/* ---------- Projekt-Codes ---------- */

/** Code-Basis aus dem Projektnamen: ohne «Beispiel:», Umlaute ausgeschrieben, nur A–Z/0–9, max. 10 Zeichen */
export function projectCodeBase(name: string): string {
  const base = name
    .replace(/^\s*beispiel\s*:\s*/i, '')
    .replace(/ß/g, 'ss').replace(/[äÄ]/g, 'AE').replace(/[öÖ]/g, 'OE').replace(/[üÜ]/g, 'UE')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_MAX);
  return base || 'PROJEKT';
}

/** Eindeutigen Code vergeben (Vergleich ohne Gross-/Kleinschreibung wie der Unique-Index) und reservieren */
function allocateCode(base: string, taken: Set<string>): string {
  let code = base;
  for (let n = 2; taken.has(code.toLowerCase()); n++) {
    const suffix = `-${n}`;
    code = base.slice(0, CODE_MAX - suffix.length) + suffix;
  }
  taken.add(code.toLowerCase());
  return code;
}

/* ---------- Einlesen ---------- */

function parseInput(oldJson: unknown, warnings: string[]): Record<string, unknown> | null {
  if (oldJson == null) return null;
  let raw = oldJson;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      warnings.push('Die v1-Daten sind kein gültiges JSON – nichts übernommen.');
      return null;
    }
  }
  if (!isObject(raw)) {
    warnings.push('Keine gültigen v1-Daten gefunden – nichts übernommen.');
    return null;
  }
  return raw;
}

/** Einträge mit ID einsammeln; doppelte IDs: der letzte gewinnt (wie beim v1-Import) */
function collect(list: unknown, table: MigratedTable, skipped: MigrationSkip[]): V1Row[] {
  const byId = new Map<string, V1Row>();
  for (const item of Array.isArray(list) ? list : []) {
    if (!isObject(item)) { skipped.push({ table, oldId: '', reason: 'Kein gültiger Eintrag' }); continue; }
    const id = ref(item.id);
    if (!id) { skipped.push({ table, oldId: '', reason: 'Eintrag ohne ID' }); continue; }
    if (byId.has(id)) skipped.push({ table, oldId: id, reason: 'Doppelte ID (späterer Eintrag übernommen)' });
    byId.set(id, { ...item, id });
  }
  return [...byId.values()];
}

function mapSettings(raw: unknown): Partial<UserSettings> {
  const s = isObject(raw) ? raw : {};
  const out: Partial<UserSettings> = {};
  // Die Minuten-Spalten sind integer: runden; was dabei unter 1 fällt, gilt als nicht gesetzt
  const minutes = (key: string, target: 'focus_minutes' | 'short_break_minutes' | 'long_break_minutes') => {
    const v = num(s[key]);
    if (v !== null && Math.round(v) >= 1) out[target] = Math.round(v);
  };
  minutes('focus', 'focus_minutes');
  minutes('short', 'short_break_minutes');
  minutes('long', 'long_break_minutes');
  const every = positive(s.longEvery);
  if (every !== null && every >= 1) out.long_break_every = Math.round(every);
  if (typeof s.autoBreak === 'boolean') out.auto_start_breaks = s.autoBreak;
  if (typeof s.autoFocus === 'boolean') out.auto_start_focus = s.autoFocus;
  const goal = num(s.dailyGoalMin);
  if (goal !== null && goal >= 0) out.daily_goal_minutes = Math.round(goal);
  return out;
}

/* ---------- Hauptfunktion ---------- */

type Decision = 'create' | 'upsert' | 'keep' | 'tombstone';

/** Was mit einer abgeleiteten ID geschehen soll, abhängig vom Bestand in v2 */
function decide(existing: AnyEntity | undefined, stamp: number | null): Decision {
  if (!existing) return 'create';
  if (existing.is_deleted) return 'tombstone';
  return stamp !== null && stamp > existing.updated_at ? 'upsert' : 'keep';
}

const emptyCounts = (): MigrationCounts => ({ created: 0, updated: 0, unchanged: 0 });

async function existingRows(repo: Repository, table: EntityTable, ids: string[]): Promise<Map<string, AnyEntity>> {
  const rows = (await repo.db.table(table).bulkGet(ids)) as (AnyEntity | undefined)[];
  return new Map(rows.filter((r): r is AnyEntity => !!r).map((r) => [r.id, r]));
}

export async function migrateV1(oldJson: unknown, repo: Repository, opts: MigrateV1Options = {}): Promise<MigrationReport> {
  const report: MigrationReport = {
    counts: { projects: emptyCounts(), tasks: emptyCounts(), time_logs: emptyCounts() },
    skipped: [],
    warnings: [],
    settings: {},
  };
  const raw = parseInput(oldJson, report.warnings);
  if (!raw) return report;
  const { skipped, warnings } = report;
  const includeDemo = opts.includeDemo === true;

  report.settings = mapSettings(raw.settings);
  const focusMinutes = report.settings.focus_minutes ?? DEFAULT_FOCUS_MINUTES;

  /* 1. Einlesen und prüfen */
  const allProjects = collect(raw.projects, 'projects', skipped);
  const allTasks = collect(raw.tasks, 'tasks', skipped);
  const allSessions = collect(raw.sessions, 'time_logs', skipped).filter((s) => {
    const ok = num(s.start) !== null && num(s.sec) !== null;
    if (!ok) skipped.push({ table: 'time_logs', oldId: s.id, reason: 'Ungültige Zeitangaben' });
    return ok;
  });

  /* 2. Beispieldaten: weglassen, ausser eigene Einträge verweisen darauf */
  const isDemo = (r: V1Row) => !!r.demo;
  const sessions = allSessions.filter((s) => includeDemo || !isDemo(s));
  const neededTasks = new Set(sessions.map((s) => ref(s.taskId)));
  const tasks = allTasks.filter((t) => includeDemo || !isDemo(t) || neededTasks.has(t.id));
  const neededProjects = new Set([...tasks.map((t) => ref(t.projectId)), ...sessions.map((s) => ref(s.projectId))]);
  const projects = allProjects.filter((p) => includeDemo || !isDemo(p) || neededProjects.has(p.id));
  if (!includeDemo) {
    const kept = new Set([...projects, ...tasks, ...sessions]);
    const pairs: [V1Row[], MigratedTable][] = [[allProjects, 'projects'], [allTasks, 'tasks'], [allSessions, 'time_logs']];
    for (const [list, table] of pairs) {
      for (const r of list) if (isDemo(r) && !kept.has(r)) skipped.push({ table, oldId: r.id, reason: 'Beispieldaten' });
    }
    for (const p of projects) {
      if (isDemo(p)) warnings.push(`Beispielprojekt «${text(p.name) || p.id}» übernommen, weil eigene Einträge darauf verweisen.`);
    }
    const demoTasks = tasks.filter(isDemo).length;
    if (demoTasks) {
      warnings.push(`${demoTasks} ${demoTasks === 1 ? 'Beispielaufgabe' : 'Beispielaufgaben'} übernommen, weil eigene Zeiteinträge darauf verweisen.`);
    }
  }

  /* 3. IDs ableiten und Bestand in v2 lesen */
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectNeedsFallback = (t: V1Row) => {
    const pid = ref(t.projectId);
    return !pid || !projectById.has(pid);
  };
  const orphanTasks = tasks.filter(projectNeedsFallback);
  const fallbackKey = fallbackProjectKey(orphanTasks.map((t) => t.id));

  const newIds = new Map<string, string>();
  const derive = async (key: string) => { newIds.set(key, await v1Uuid(key)); };
  await Promise.all([...projects, ...tasks, ...sessions].map((r) => derive(r.id)).concat(derive(fallbackKey)));
  const idOf = (oldId: string): string => newIds.get(oldId)!;

  const fallbackId = idOf(fallbackKey);
  const [exProjects, exTasks, exLogs, liveProjects] = await Promise.all([
    existingRows(repo, 'projects', [...projects.map((p) => idOf(p.id)), fallbackId]),
    existingRows(repo, 'tasks', tasks.map((t) => idOf(t.id))),
    existingRows(repo, 'time_logs', sessions.map((s) => idOf(s.id))),
    repo.list('projects'),
  ]);
  const takenCodes = new Set(liveProjects.map((p) => p.project_code.toLowerCase()));

  const ops: BatchOp[] = [];
  const upserts: { table: MigratedTable; id: string; before: number }[] = [];
  /** Neue IDs, auf die nach der Migration eine Zeile in v2 zeigt (auch gelöschte, als Historie) */
  const present = new Set<string>();

  /**
   * Entscheidung umsetzen. Neu: alle Felder (create). Überschreiben: nur die Felder, die v1 kennt
   * (update) – als create-Operation mit vorhandener ID, die das Repository als Update behandelt.
   */
  const plan = (
    table: MigratedTable,
    oldId: string,
    decision: Decision,
    create: () => Record<string, unknown>,
    update: () => Record<string, unknown> = create,
  ) => {
    const id = idOf(oldId);
    present.add(id);
    if (decision === 'tombstone') {
      skipped.push({ table, oldId, reason: 'In v2 gelöscht' });
    } else if (decision === 'keep') {
      report.counts[table].unchanged++;
    } else if (decision === 'create') {
      ops.push({ op: 'create', table, row: { ...create(), id } });
      report.counts[table].created++;
    } else {
      const ex = (table === 'projects' ? exProjects : table === 'tasks' ? exTasks : exLogs).get(id)!;
      ops.push({ op: 'create', table, row: { ...update(), id } });
      upserts.push({ table, id, before: ex.updated_at });
    }
  };

  /* 4. Projekte (alphabetisch wie in v1 angezeigt) */
  const sortedProjects = projects.slice().sort((a, b) => text(a.name).localeCompare(text(b.name), 'de'));
  /** Modus jedes Projekts nach der Migration (neue ID → Modus); Zeiteinträge übernehmen ihn */
  const projectModes = new Map<string, Workspace>();
  const modeAfter = (decision: Decision, ex: AnyEntity | undefined, v1Mode: Workspace): Workspace =>
    (decision === 'create' || decision === 'upsert' ? v1Mode : (ex as Project).mode);
  const unknownProjectRefs = orphanTasks.filter((t) => ref(t.projectId)).length;
  if (unknownProjectRefs) {
    warnings.push(`${unknownProjectRefs} ${unknownProjectRefs === 1 ? 'Aufgabe verweist' : 'Aufgaben verweisen'} auf ein unbekanntes Projekt.`);
  }

  if (orphanTasks.length) {
    // Ersatzprojekt zuerst, damit es den Code ALLGEMEIN erhält
    const decision = decide(exProjects.get(fallbackId), null);
    projectModes.set(fallbackId, modeAfter(decision, exProjects.get(fallbackId), FALLBACK_PROJECT.mode));
    plan('projects', fallbackKey, decision, () => ({
      project_code: allocateCode(FALLBACK_PROJECT.code, takenCodes),
      name: FALLBACK_PROJECT.name,
      mode: FALLBACK_PROJECT.mode,
      status: 'active',
      color: V1_COLOR_HEX[0],
      planned_hours: null,
      start_date: null,
      end_date: null,
      notes: 'Bei der Übernahme aus v1 für Aufgaben ohne Projekt angelegt.',
      sort_order: sortedProjects.length,
    }));
    if (decision !== 'tombstone') {
      warnings.push(`${orphanTasks.length} ${orphanTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} ohne Projekt dem Projekt «${FALLBACK_PROJECT.name}» zugeordnet.`);
    }
  }

  // Codes für neue Projekte: eigene vor Beispielprojekten, jeweils in v1-Reihenfolge
  const newCodes = new Map<string, string>();
  for (const p of [...projects.filter((x) => !isDemo(x)), ...projects.filter(isDemo)]) {
    if (!exProjects.has(idOf(p.id))) newCodes.set(p.id, allocateCode(projectCodeBase(text(p.name)), takenCodes));
  }

  let otherCategory = 0;
  sortedProjects.forEach((p, index) => {
    const id = idOf(p.id);
    const ex = exProjects.get(id) as Project | undefined;
    if (text(p.category) !== 'lernen' && text(p.category) !== 'arbeit') otherCategory++;
    const name = text(p.name) || 'Ohne Namen';
    const deadline = dateKey(p.deadline);
    if (p.deadline != null && p.deadline !== '' && !deadline) warnings.push(`Ungültiger Termin bei Projekt «${name}» ignoriert.`);
    const goal = positive(p.goalHours);
    const fields = {
      name,
      mode: modeOf(p.category),
      color: colorOf(p.color),
      planned_hours: goal === null ? null : round2(goal),
      end_date: deadline,
      notes: text(p.notes),
    };
    const decision = decide(ex, v1Stamp(p));
    projectModes.set(id, modeAfter(decision, ex, fields.mode));
    plan('projects', p.id, decision,
      () => ({
        ...fields,
        project_code: newCodes.get(p.id)!,
        status: p.archived ? 'archived' : 'active',
        start_date: null,
        sort_order: index,
      }),
      // v1 kennt nur «archiviert ja/nein»: eine Pause aus v2 bleibt erhalten
      () => ({ ...fields, status: p.archived ? 'archived' : ex!.status === 'archived' ? 'active' : ex!.status }));
  });

  /* 5. Aufgaben */
  /** Neue Projekt-ID einer v1-Aufgabe (eigenes Projekt oder Ersatzprojekt) */
  const taskProjectId = (t: V1Row): string => (projectNeedsFallback(t) ? fallbackId : idOf(ref(t.projectId)!));
  let tasksWithTime = 0;
  tasks.forEach((t, index) => {
    const id = idOf(t.id);
    const ex = exTasks.get(id) as Task | undefined;
    const projectId = taskProjectId(t);
    const projectRow = exProjects.get(projectId);
    const decision = decide(ex, v1Stamp(t));
    if ((decision === 'create' || decision === 'upsert') && projectRow?.is_deleted) {
      // Nicht unter ein gelöschtes Projekt schreiben; eine vorhandene Zeile bleibt, wie sie ist
      skipped.push({ table: 'tasks', oldId: t.id, reason: 'Projekt in v2 gelöscht' });
      if (ex) present.add(id);
      return;
    }
    if (text(t.time)) tasksWithTime++;
    const pomodoros = positive(t.estimate);
    const estimatedPomodoros = pomodoros === null ? null : Math.max(1, Math.round(pomodoros));
    const done = !!t.done;
    const fields = {
      project_id: projectId,
      title: text(t.title) || 'Ohne Titel',
      status: done ? 'done' : 'todo',
      due_date: dateKey(t.date),
      estimated_pomodoros: estimatedPomodoros,
      estimated_hours: estimatedPomodoros === null ? null : round2((estimatedPomodoros * focusMinutes) / 60),
      notes: text(t.notes),
      completed_at: done ? num(t.doneAt) : null,
    };
    plan('tasks', t.id, decision,
      () => ({ ...fields, work_package_id: null, priority: 'medium', sort_order: index }),
      // Wechselt das Projekt, passt ein Arbeitspaket aus v2 nicht mehr
      () => ({ ...fields, ...(ex!.project_id !== projectId ? { work_package_id: null } : {}) }));
  });
  if (tasksWithTime) {
    warnings.push(`Uhrzeit bei ${tasksWithTime} ${tasksWithTime === 1 ? 'Aufgabe' : 'Aufgaben'} nicht übernommen (v2 plant Zeiten über Kalenderblöcke).`);
  }

  /* 6. Sessions → Zeiteinträge */
  let unknownRefs = 0;
  for (const s of sessions) {
    const id = idOf(s.id);
    const ownProject = projectById.get(ref(s.projectId) ?? '');
    const task = taskById.get(ref(s.taskId) ?? '');
    const taskId = task && present.has(idOf(task.id)) ? idOf(task.id) : null;
    if ((ref(s.projectId) && !ownProject) || (ref(s.taskId) && !task)) unknownRefs++;
    const v1Project = ownProject ?? (task && !projectNeedsFallback(task) ? projectById.get(ref(task.projectId)!) : undefined);
    const projectId = ownProject ? idOf(ownProject.id) : taskId && task ? taskProjectId(task) : null;
    // Der Modus folgt dem zugeordneten Projekt (auch dem Ersatzprojekt), wie beim Excel-Import;
    // nur Zeit ohne Projekt nimmt die Kategorie der Session
    const projectMode = projectId ? projectModes.get(projectId) : undefined;
    if (!projectMode && text(s.category) !== 'lernen' && text(s.category) !== 'arbeit') otherCategory++;
    const start = Math.round(num(s.start)!);
    const sec = Math.max(0, Math.round(num(s.sec)!));
    const end = num(s.end);
    // Bezeichnung einer gelöschten Aufgabe bzw. eines gelöschten Projekts nicht verlieren
    const title = text(s.title);
    const label = !taskId && title && title !== text(v1Project?.name) ? title : '';
    const note = text(s.note);
    plan('time_logs', s.id, decide(exLogs.get(id), null), () => ({
      project_id: projectId,
      work_package_id: null,
      task_id: taskId,
      workspace: projectMode ?? modeOf(s.category),
      mode: s.manual ? 'manual' : 'pomodoro',
      start_time: start,
      end_time: end !== null && end >= start ? Math.round(end) : start + sec * 1000,
      duration_seconds: sec,
      counts_as_pomodoro: !!s.full,
      comment: label && note ? `${label} – ${note}` : label || note,
    }));
  }
  if (unknownRefs) {
    warnings.push(`${unknownRefs} ${unknownRefs === 1 ? 'Zeiteintrag verweist' : 'Zeiteinträge verweisen'} auf ein unbekanntes Projekt oder eine unbekannte Aufgabe.`);
  }
  if (otherCategory) {
    warnings.push(`Kategorie «Sonstiges» dem Arbeitsmodus zugeordnet (${otherCategory} ${otherCategory === 1 ? 'Eintrag' : 'Einträge'}).`);
  }

  /* 7. Schreiben – eine Transaktion */
  if (ops.length) await repo.applyBatch(ops);

  // Überschriebene Zeilen: nur als geändert zählen, wenn sich tatsächlich etwas geändert hat
  for (const table of ['projects', 'tasks', 'time_logs'] as const) {
    const mine = upserts.filter((u) => u.table === table);
    if (!mine.length) continue;
    const after = await existingRows(repo, table, mine.map((u) => u.id));
    for (const u of mine) {
      if ((after.get(u.id)?.updated_at ?? u.before) !== u.before) report.counts[table].updated++;
      else report.counts[table].unchanged++;
    }
  }
  return report;
}

/**
 * Einmalige automatische Übernahme beim Start: liest localStorage, migriert und merkt sich das
 * Ergebnis in meta (META.migratedV1). Liefert null, wenn bereits migriert wurde oder keine
 * v1-Daten vorhanden sind. Schlägt das Schreiben fehl, bleibt die Markierung aus → neuer Versuch.
 */
export async function migrateV1Once(
  repo: Repository,
  storage?: Pick<Storage, 'getItem'> | null,
  opts?: MigrateV1Options,
): Promise<MigrationReport | null> {
  if (await repo.db.getMeta(META.migratedV1)) return null;
  let raw: string | null = null;
  try {
    raw = (storage ?? globalThis.localStorage)?.getItem(V1_STORAGE_KEY) ?? null;
  } catch {
    raw = null; // Speicher blockiert (z. B. privater Modus)
  }
  const report = raw === null ? null : await migrateV1(raw, repo, opts);
  await repo.db.setMeta(META.migratedV1, { at: Date.now(), found: raw !== null, counts: report?.counts ?? null });
  return report;
}
