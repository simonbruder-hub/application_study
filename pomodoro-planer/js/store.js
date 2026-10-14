/* Datenhaltung: Zustand, Abfragen, Änderungen und Speicherung
 * (lokal im Browser oder – in claude.ai – synchronisiert im Konto). */
'use strict';

const CATS = {
  lernen: { label: 'Lernen' },
  arbeit: { label: 'Arbeit' },
  sonstiges: { label: 'Sonstiges' },
};
const CAT_KEYS = Object.keys(CATS);

/* Projektfarben: Index 1–8, Werte als CSS-Variablen --pc-1 … --pc-8 (hell/dunkel) */
const PROJECT_COLORS = ['Blau', 'Orange', 'Türkis', 'Gelb', 'Rosa', 'Grün', 'Violett', 'Rot'];

const DEFAULT_PRESETS = [
  { id: 'klassisch', name: 'Klassisch', focus: 25, short: 5, long: 15, longEvery: 4 },
  { id: 'kurz', name: 'Kurz', focus: 15, short: 3, long: 10, longEvery: 4 },
  { id: 'lang', name: 'Lang', focus: 50, short: 10, long: 20, longEvery: 3 },
  { id: 'deep', name: 'Deep Work', focus: 90, short: 15, long: 30, longEvery: 2 },
];

const DEFAULT_SETTINGS = {
  focus: 25, short: 5, long: 15, longEvery: 4,
  autoBreak: true, autoFocus: false,
  sound: true, volume: 0.7, notify: false, wakeLock: false, background: false,
  dailyGoalMin: 240, capacity: 8,
  presets: DEFAULT_PRESETS,
};

const freshTimer = () => ({
  phase: 'focus', status: 'idle', remaining: null, duration: null, endsAt: null,
  segmentStart: null, focusAccum: 0, sessionStart: null, cycle: 0, target: '',
});

const LS_KEY = 'pomodoro-planer.v1';

/* ---------- Speicher-Backends ---------- */

/** Lokal: ganzer Zustand als JSON in localStorage */
const LocalBackend = {
  name: 'local',
  load() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  _save: null,
  touch() {
    Store._setStatus('saving');
    if (!this._save) {
      this._save = U.debounce(() => this.flush(), 250);
    }
    this._save();
  },
  flush() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Store.state));
      Store._setStatus('saved');
    } catch {
      Store._setStatus('error', 'Der Browser blockiert den lokalen Speicher. Exportiere deine Daten als Backup.');
    }
  },
};

/** claude.ai: private Dokumente unter data/users/<id>/ */
const ClaudeBackend = {
  name: 'claude',
  db: null,
  base: '',
  pending: new Map(),
  inflight: new Set(),
  knownMonths: new Set(),

  async connect() {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      this.db = db;
      this.base = `data/users/${id}`;
      return true;
    } catch { return false; }
  },
  planner() { return this.db.doc(`${this.base}/planner`); },

  async getAll(col) {
    const out = [];
    let last = null;
    for (let i = 0; i < 200; i++) {
      const q = last === null ? col.orderBy('id').limit(500) : col.where('id', '>', last).orderBy('id').limit(500);
      const snap = await q.get();
      snap.docs.forEach((d) => { const v = d.data(); if (v) out.push(U.clone(v)); });
      if (snap.size < 500) break;
      last = snap.docs[snap.size - 1].data().id;
    }
    return out;
  },

  async load() {
    const root = this.planner();
    const [settings, timer, projects, tasks, months] = await Promise.all([
      this.db.doc(`${this.base}/settings`).get(),
      this.db.doc(`${this.base}/timer`).get(),
      this.getAll(root.collection('projects')),
      this.getAll(root.collection('tasks')),
      this.getAll(root.collection('months')),
    ]);
    months.forEach((m) => this.knownMonths.add(m.id));
    const sessions = months.flatMap((m) => (Array.isArray(m.sessions) ? m.sessions : []));
    const empty = !settings.exists && !timer.exists && !projects.length && !tasks.length && !sessions.length;
    if (empty) return null;
    return {
      settings: settings.exists ? U.clone(settings.data()) : {},
      timer: timer.exists ? U.clone(timer.data()) : null,
      projects, tasks, sessions,
    };
  },

  /** kind: settings | timer | project | task | month */
  touch(kind, key) {
    let path;
    let body;
    const st = Store.state;
    if (kind === 'settings') { path = `${this.base}/settings`; body = () => st.settings; }
    else if (kind === 'timer') { path = `${this.base}/timer`; body = () => st.timer; }
    else if (kind === 'project') { path = `${this.base}/planner/projects/${key}`; body = () => Store.project(key) || null; }
    else if (kind === 'task') { path = `${this.base}/planner/tasks/${key}`; body = () => Store.task(key) || null; }
    else if (kind === 'month') {
      this.knownMonths.add(key);
      path = `${this.base}/planner/months/${key}`;
      body = () => ({ id: key, sessions: st.sessions.filter((s) => U.monthKey(s.start) === key) });
    } else return;
    this.pending.set(path, body);
    this.pump(path);
  },

  async pump(path) {
    if (this.inflight.has(path) || !this.pending.has(path)) { this._updateStatus(); return; }
    const resolve = this.pending.get(path);
    this.pending.delete(path);
    this.inflight.add(path);
    this._updateStatus();
    const data = resolve();
    try {
      await this._write(path, data);
    } catch (e) {
      if (e && e.code === 'unavailable') {
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
        try { await this._write(path, resolve()); } catch (e2) { this._fail(e2); }
      } else this._fail(e);
    } finally {
      this.inflight.delete(path);
      if (this.pending.has(path)) this.pump(path); else this._updateStatus();
    }
  },
  async _write(path, data) {
    const ref = this.db.doc(path);
    if (data === null || (data.sessions && data.sessions.length === 0)) await ref.delete();
    else await ref.set(U.clone(data));
  },
  _fail(e) {
    const code = e && e.code;
    const msg = code === 'quota_exceeded'
      ? 'Der Speicher ist voll. Exportiere ein Backup und lösche alte Einträge.'
      : 'Speichern fehlgeschlagen. Exportiere zur Sicherheit ein Backup.';
    Store._setStatus('error', msg);
  },
  _updateStatus() {
    if (Store.saveStatus === 'error') return;
    Store._setStatus(this.pending.size || this.inflight.size ? 'saving' : 'saved');
  },
  flush() {},
};

/* ---------- Store ---------- */

const Store = {
  state: null,
  backend: LocalBackend,
  saveStatus: 'saved',
  saveError: '',
  _subs: new Set(),

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  emit(reason) { this._subs.forEach((fn) => fn(reason)); },
  _setStatus(s, msg = '') {
    if (this.saveStatus === s && this.saveError === msg) return;
    this.saveStatus = s; this.saveError = msg;
    this.emit('status');
  },

  normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const settings = { ...U.clone(DEFAULT_SETTINGS), ...(r.settings || {}) };
    if (!Array.isArray(settings.presets) || !settings.presets.length) settings.presets = U.clone(DEFAULT_PRESETS);
    const timer = { ...freshTimer(), ...(r.timer || {}) };
    const arr = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object' && x.id) : []);
    return {
      settings,
      timer,
      projects: arr(r.projects),
      tasks: arr(r.tasks),
      sessions: arr(r.sessions).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.sec)),
    };
  },

  initLocal() {
    this.state = this.normalize(LocalBackend.load());
    this.backend = LocalBackend;
    window.addEventListener('storage', (e) => {
      if (e.key !== LS_KEY || this.backend !== LocalBackend || !e.newValue) return;
      try { this.state = this.normalize(JSON.parse(e.newValue)); this.emit('reload'); } catch { /* ignorieren */ }
    });
    const flush = () => this.backend.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  },

  /** Versucht das claude.ai-Konto als Speicher zu verwenden. */
  async tryClaude() {
    const ok = await ClaudeBackend.connect();
    if (!ok) return false;
    let remote;
    try { remote = await ClaudeBackend.load(); } catch { return false; }
    const local = this.state;
    this.backend = ClaudeBackend;
    if (remote) {
      this.state = this.normalize(remote);
    } else if (local.projects.length || local.tasks.length || local.sessions.length) {
      // Erste Verbindung: lokale Daten ins Konto übernehmen
      this.state = local;
      this.touchAll();
    } else {
      this.state = this.normalize(null);
    }
    this.emit('reload');
    return true;
  },

  touch(kind, key) { this.backend.touch(kind, key); },
  touchAll(prev) {
    this.touch('settings');
    this.touch('timer');
    const ids = (k, list) => new Set([...(prev ? prev[k] : []), ...this.state[k]].map((x) => x.id));
    ids('projects').forEach((id) => this.touch('project', id));
    ids('tasks').forEach((id) => this.touch('task', id));
    const months = new Set([...(prev ? prev.sessions : []), ...this.state.sessions].map((s) => U.monthKey(s.start)));
    if (this.backend === ClaudeBackend) ClaudeBackend.knownMonths.forEach((m) => months.add(m));
    months.forEach((m) => this.touch('month', m));
  },

  /* ---------- Abfragen ---------- */
  get settings() { return this.state.settings; },
  project(id) { return id ? this.state.projects.find((p) => p.id === id) : undefined; },
  task(id) { return id ? this.state.tasks.find((t) => t.id === id) : undefined; },
  session(id) { return this.state.sessions.find((s) => s.id === id); },
  projects(archived = false) {
    return this.state.projects.filter((p) => !!p.archived === archived)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  },
  sessionProject(s) { return this.project(s.projectId) || (s.taskId ? this.project(this.task(s.taskId)?.projectId) : undefined); },
  sessionCat(s) { const p = this.sessionProject(s); return p ? p.category : (CATS[s.category] ? s.category : 'sonstiges'); },
  sessionLabel(s) {
    const t = this.task(s.taskId);
    if (t) return t.title;
    if (s.title) return s.title;
    const p = this.sessionProject(s);
    return p ? p.name : CATS[this.sessionCat(s)].label;
  },
  sessionsBetween(a, b) {
    const A = +a; const B = +b;
    return this.state.sessions.filter((s) => s.start >= A && s.start < B);
  },
  tasksOn(key) {
    return this.state.tasks.filter((t) => t.date === key).sort(taskSort);
  },
  taskStats(id) {
    let sec = 0; let pomos = 0;
    for (const s of this.state.sessions) if (s.taskId === id) { sec += s.sec; if (s.full) pomos++; }
    return { sec, pomos };
  },
  projectStats(id, a = 0, b = Infinity) {
    let sec = 0; let pomos = 0;
    for (const s of this.state.sessions) {
      if (s.start < a || s.start >= b) continue;
      if (this.sessionProject(s)?.id !== id) continue;
      sec += s.sec; if (s.full) pomos++;
    }
    const tasks = this.state.tasks.filter((t) => t.projectId === id);
    return { sec, pomos, open: tasks.filter((t) => !t.done).length, done: tasks.filter((t) => t.done).length, total: tasks.length };
  },
  /** Geplante Pomodoros an einem Tag (offene Aufgaben: Schätzung minus Erledigtes) */
  plannedLoad(key) {
    return U.sum(this.tasksOn(key), (t) => t.estimate || 1);
  },
  streak() {
    const days = new Set(this.state.sessions.map((s) => U.dateKey(s.start)));
    let n = 0;
    let d = new Date();
    if (!days.has(U.dateKey(d))) d = U.addDays(d, -1);
    while (days.has(U.dateKey(d))) { n++; d = U.addDays(d, -1); }
    return n;
  },
  hasDemo() {
    const s = this.state;
    return s.projects.some((x) => x.demo) || s.tasks.some((x) => x.demo) || s.sessions.some((x) => x.demo);
  },
  isEmpty() {
    const s = this.state;
    return !s.projects.length && !s.tasks.length && !s.sessions.length;
  },

  /* ---------- Änderungen ---------- */
  saveProject(p) {
    const list = this.state.projects;
    const i = list.findIndex((x) => x.id === p.id);
    p.updatedAt = Date.now();
    if (i >= 0) list[i] = p; else { p.createdAt = p.createdAt || Date.now(); list.push(p); }
    this.touch('project', p.id);
    this.emit('data');
  },
  deleteProject(id, deleteTasks) {
    const p = this.project(id);
    if (!p) return;
    // Erfasste Zeit bleibt erhalten – unter der Kategorie des Projekts
    const months = new Set();
    this.state.sessions.forEach((s) => {
      if (this.sessionProject(s)?.id !== id && s.projectId !== id) return;
      if (deleteTasks && s.taskId) { s.title = this.task(s.taskId)?.title || s.title || ''; s.taskId = null; }
      s.projectId = null;
      s.category = p.category;
      months.add(U.monthKey(s.start));
    });
    const own = this.state.tasks.filter((t) => t.projectId === id);
    if (deleteTasks) this.state.tasks = this.state.tasks.filter((t) => t.projectId !== id);
    else own.forEach((t) => { t.projectId = null; });
    own.forEach((t) => this.touch('task', t.id));
    this.state.projects = this.state.projects.filter((x) => x.id !== id);
    this.touch('project', id);
    const tg = this.state.timer.target;
    if (tg === `p:${id}` || (deleteTasks && own.some((t) => tg === `t:${t.id}`))) { this.state.timer.target = ''; this.touch('timer'); }
    months.forEach((m) => this.touch('month', m));
    this.emit('data');
  },
  saveTask(t) {
    const list = this.state.tasks;
    const i = list.findIndex((x) => x.id === t.id);
    t.updatedAt = Date.now();
    if (t.done && !t.doneAt) t.doneAt = Date.now();
    if (!t.done) t.doneAt = null;
    if (i >= 0) list[i] = t; else { t.createdAt = t.createdAt || Date.now(); list.push(t); }
    this.touch('task', t.id);
    this.emit('data');
  },
  deleteTask(id) {
    const t = this.task(id);
    if (!t) return null;
    this.state.tasks = this.state.tasks.filter((x) => x.id !== id);
    const months = new Set();
    this.state.sessions.forEach((s) => {
      if (s.taskId === id) {
        s.title = t.title; s.projectId = s.projectId || t.projectId || null; s.taskId = null;
        months.add(U.monthKey(s.start));
      }
    });
    if (this.state.timer.target === `t:${id}`) { this.state.timer.target = t.projectId ? `p:${t.projectId}` : ''; this.touch('timer'); }
    this.touch('task', id);
    months.forEach((m) => this.touch('month', m));
    this.emit('data');
    return t;
  },
  addSession(s) {
    this.state.sessions.push(s);
    this.touch('month', U.monthKey(s.start));
    this.emit('data');
  },
  saveSession(s, prevStart) {
    const list = this.state.sessions;
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    this.touch('month', U.monthKey(s.start));
    if (prevStart != null && U.monthKey(prevStart) !== U.monthKey(s.start)) this.touch('month', U.monthKey(prevStart));
    this.emit('data');
  },
  deleteSession(id) {
    const s = this.session(id);
    if (!s) return null;
    this.state.sessions = this.state.sessions.filter((x) => x.id !== id);
    this.touch('month', U.monthKey(s.start));
    this.emit('data');
    return s;
  },
  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.touch('settings');
    this.emit('settings');
  },
  commitTimer() {
    this.touch('timer');
    this.emit('timer');
  },

  /** Daten ersetzen (Import) */
  replaceAll(data) {
    const prev = this.state;
    const next = this.normalize(data);
    next.timer = freshTimer();
    this.state = next;
    this.touchAll(prev);
    this.emit('reload');
  },
  /** Daten zusammenführen (Import, gleiche IDs werden überschrieben) */
  mergeAll(data) {
    const inc = this.normalize(data);
    const merge = (k) => {
      const map = new Map(this.state[k].map((x) => [x.id, x]));
      inc[k].forEach((x) => map.set(x.id, x));
      this.state[k] = [...map.values()];
    };
    merge('projects'); merge('tasks'); merge('sessions');
    this.touchAll();
    this.emit('reload');
  },
  clearAll() {
    const prev = this.state;
    this.state = this.normalize(null);
    this.touchAll(prev);
    this.emit('reload');
  },
  removeDemo() {
    const prev = this.state;
    const s = this.state;
    this.state = {
      ...s,
      projects: s.projects.filter((x) => !x.demo),
      tasks: s.tasks.filter((x) => !x.demo),
      sessions: s.sessions.filter((x) => !x.demo),
    };
    const t = this.state.timer.target;
    if (t && !this.resolveTarget(t).valid) this.state.timer.target = '';
    this.touchAll(prev);
    this.emit('reload');
  },
  exportData() {
    const s = this.state;
    return { app: 'pomodoro-planer', version: 1, exportedAt: new Date().toISOString(), settings: s.settings, projects: s.projects, tasks: s.tasks, sessions: s.sessions };
  },

  /** Zuordnung "t:<task>", "p:<projekt>", "c:<kategorie>" oder "" auflösen */
  resolveTarget(target) {
    const [kind, id] = String(target || '').split(':');
    if (kind === 't') {
      const t = this.task(id);
      if (t) {
        const p = this.project(t.projectId);
        return { valid: true, taskId: t.id, projectId: p ? p.id : null, category: p ? p.category : 'sonstiges', title: t.title, task: t, project: p };
      }
    }
    if (kind === 'p') {
      const p = this.project(id);
      if (p) return { valid: true, taskId: null, projectId: p.id, category: p.category, title: p.name, project: p };
    }
    if (kind === 'c' && CATS[id]) return { valid: true, taskId: null, projectId: null, category: id, title: CATS[id].label };
    return { valid: !target, taskId: null, projectId: null, category: 'sonstiges', title: 'Ohne Zuordnung' };
  },
};

function taskSort(a, b) {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  const ta = a.time || '99:99';
  const tb = b.time || '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/* ---------- Beispieldaten ---------- */
function makeDemoData() {
  const r = U.rng(42);
  const today = U.startOfDay(new Date());
  const key = (n) => U.dateKey(U.addDays(today, n));
  const P = [
    { id: U.uid('p'), name: 'Beispiel: Regelungstechnik', category: 'lernen', color: 1, goalHours: 40, deadline: key(38), notes: 'Prüfung Ende Semester' },
    { id: U.uid('p'), name: 'Beispiel: Masterarbeit', category: 'lernen', color: 7, goalHours: 120, deadline: key(110), notes: '' },
    { id: U.uid('p'), name: 'Beispiel: Werkstudium', category: 'arbeit', color: 2, goalHours: null, deadline: null, notes: '20 % Pensum' },
  ];
  P.forEach((p) => { p.demo = true; p.archived = false; p.createdAt = Date.now() - 20 * 86400000; });
  const T = [
    [0, 'Übungsserie 4 lösen', 3, -1, true], [0, 'Bode-Diagramme repetieren', 2, 0, false], [0, 'Zusammenfassung Kapitel 5', 2, 1, false],
    [0, 'Altprüfung 2024 durchrechnen', 4, 4, false], [1, 'Literaturrecherche Batteriemodelle', 3, -2, true],
    [1, 'Messaufbau skizzieren', 2, 0, false], [1, 'Gliederung Kapitel 2', 2, 2, false], [1, 'Treffen mit Betreuer vorbereiten', 1, 3, false],
    [2, 'Wochenbericht schreiben', 1, 0, false], [2, 'Datenauswertung Q3', 3, 1, false], [2, 'Code-Review', 1, -3, true],
    [0, 'Formelsammlung ergänzen', 1, null, false], [1, 'Abbildungen überarbeiten', 2, null, false],
  ].map(([pi, title, est, d, done]) => ({
    id: U.uid('t'), title, projectId: P[pi].id, estimate: est, date: d === null ? null : key(d),
    time: null, done, doneAt: done ? Date.now() - 86400000 : null, notes: '', demo: true, createdAt: Date.now() - 10 * 86400000,
  }));
  const S = [];
  for (let back = 20; back >= 0; back--) {
    const day = U.addDays(today, -back);
    const wd = U.wdIndex(day);
    const n = back === 0 ? 2 : wd >= 5 ? Math.floor(r() * 3) : 2 + Math.floor(r() * 5);
    let t = new Date(day); t.setHours(8 + Math.floor(r() * 2), Math.floor(r() * 4) * 15, 0, 0);
    for (let i = 0; i < n; i++) {
      const pick = r();
      const pi = wd >= 5 ? (pick < 0.7 ? 0 : 1) : pick < 0.45 ? 0 : pick < 0.75 ? 1 : 2;
      const tasks = T.filter((x) => x.projectId === P[pi].id);
      const task = tasks[Math.floor(r() * tasks.length)];
      const full = r() > 0.15;
      const sec = full ? 25 * 60 : (10 + Math.floor(r() * 14)) * 60;
      const start = t.getTime();
      if (start + sec * 1000 > Date.now()) break;
      S.push({ id: U.uid('s'), start, end: start + sec * 1000, sec, full, taskId: task.id, projectId: P[pi].id, category: P[pi].category, title: task.title, note: '', manual: false, demo: true });
      t = new Date(start + sec * 1000 + ((i + 1) % 4 === 0 ? 15 : 5) * 60000 + (r() < 0.25 ? 60 * 60000 : 0));
    }
  }
  return { projects: P, tasks: T, sessions: S };
}
