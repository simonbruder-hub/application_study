/* App: Navigation, Rendering, Aktionen, Tastatur, Drag & Drop,
 * Minimieren (Mini-Fenster), Darstellung, Installation und Start */
'use strict';

const VIEW_ORDER = ['fokus', 'aufgaben', 'projekte', 'kalender', 'auswertung', 'einstellungen'];
const UI_KEY = 'pomodoro-planer.ui';

const App = {
  view: 'fokus',
  ui: null,
  connecting: false,
  installPrompt: null,
  flashMood: null,
  pip: null,
  _lastView: null,
  _title: '',

  defaults() {
    const k = U.todayKey();
    return {
      view: 'fokus', mode: 'auto', skin: 'klassisch', mini: false,
      taskFilter: { status: 'open', project: 'all', when: 'all', q: '' },
      cal: { mode: 'week', anchor: k, selected: k },
      stats: { range: 'week', anchor: k },
      projectId: null, showArchived: false, lastProject: '', logLimit: 50,
    };
  },
  loadUi() {
    const d = this.defaults();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { saved = {}; }
    this.ui = {
      ...d, ...saved,
      taskFilter: { ...d.taskFilter, ...(saved.taskFilter || {}) },
      cal: { ...d.cal, mode: saved.cal?.mode === 'month' ? 'month' : 'week' },
      stats: { ...d.stats, range: ['day', 'week', 'month', 'year'].includes(saved.stats?.range) ? saved.stats.range : 'week' },
      logLimit: 50,
    };
  },
  saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(this.ui)); } catch { /* privat/blockiert */ } },
  pipOpen() { return !!this.pip; },

  /* ---------- Darstellung ---------- */
  isDark() {
    const r = document.documentElement;
    if (this.ui.mode === 'nacht') return true;
    if (this.ui.mode === 'tag') return false;
    if (r.dataset.theme === 'dark') return true;
    if (r.dataset.theme === 'light') return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  },
  applyTheme() {
    const r = document.documentElement;
    if (this.ui.mode === 'auto') delete r.dataset.mode; else r.dataset.mode = this.ui.mode;
    if (this.ui.skin === 'anime') { r.dataset.skin = 'anime'; loadAnimeFonts(); } else delete r.dataset.skin;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(r).getPropertyValue('--bg').trim() || (this.isDark() ? '#0e1315' : '#eef2f1');
    if (this.pip) syncPipTheme();
  },

  /* ---------- Navigation & Rendering ---------- */
  go(v, { keepProject = false } = {}) {
    if (!Views[v]) v = 'fokus';
    if (v === 'projekte' && !keepProject && this.view !== 'projekte') this.ui.projectId = null;
    this.view = v; this.ui.view = v;
    this.saveUi();
    try { history.replaceState(null, '', `#${v}`); } catch { /* egal */ }
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    const main = document.getElementById('main');
    const same = this._lastView === this.view;
    const keep = {};
    if (same) main.querySelectorAll('[data-keep]').forEach((el) => { if (el.id) keep[el.id] = el.value; });
    const ae = document.activeElement;
    const focusId = same && ae && main.contains(ae) ? ae.id : null;
    let sel = null;
    try { if (focusId && typeof ae.selectionStart === 'number') sel = [ae.selectionStart, ae.selectionEnd]; } catch { sel = null; }
    UI.hideTip();
    main.innerHTML = Views[this.view].render();
    main.dataset.view = this.view;
    Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && el.matches('[data-keep]')) el.value = v; });
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* Typ ohne Auswahl */ } } }
    }
    this._lastView = this.view;
    this.renderChrome();
    this.renderMini();
    this.onTick();
  },

  renderChrome() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const on = el.dataset.nav === this.view;
      el.classList.toggle('is-on', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    const x = Store.state.timer;
    const running = x.status === 'running';
    const active = x.status !== 'idle';
    const mt = `<span class="mt-dot" aria-hidden="true"></span>
      <button type="button" class="mt-clock" data-act="go" data-view="fokus" title="Zum Timer"><span class="mt-phase">${PHASES[x.phase].short}</span><span class="mono" data-clock>${U.fmtClock(Timer.remaining())}</span></button>
      <button type="button" class="icon-btn sm" data-act="toggle" aria-label="${running ? 'Pause' : 'Start'} (Leertaste)" title="${running ? 'Pause' : 'Start'} (Leertaste)">${UI.icon(running ? 'pause' : 'play')}</button>
      <button type="button" class="icon-btn sm" data-act="minimize" aria-label="Minimieren (M)" title="Minimieren (M)">${UI.icon('minimize')}</button>`;
    document.querySelectorAll('[data-mini-timer]').forEach((el) => {
      el.innerHTML = mt;
      el.dataset.phase = x.phase;
      el.classList.toggle('is-active', active);
      el.classList.toggle('is-running', running);
    });
    const dark = this.isDark();
    document.querySelectorAll('[data-theme-btn]').forEach((el) => {
      el.innerHTML = UI.icon(dark ? 'sun' : 'moon');
      el.setAttribute('aria-label', dark ? 'Tagmodus' : 'Nachtmodus');
      el.title = `${dark ? 'Tagmodus' : 'Nachtmodus'} (T)`;
    });
    document.querySelectorAll('[data-install]').forEach((el) => { el.hidden = !this.installPrompt; });
    const app = document.getElementById('app');
    app.classList.toggle('is-connecting', this.connecting);
    app.dataset.view = this.view;
    document.body.classList.toggle('is-mini', !!this.ui.mini);
    this.renderSaveState();
  },

  renderSaveState() {
    const claude = Store.backend.name === 'claude';
    const txt = Store.saveStatus === 'saving' ? 'Speichert …'
      : Store.saveStatus === 'error' ? 'Nicht gespeichert'
        : claude ? 'Im Konto gespeichert' : 'Lokal gespeichert';
    document.querySelectorAll('[data-save-state]').forEach((el) => {
      el.textContent = txt;
      el.dataset.state = Store.saveStatus;
      el.title = Store.saveError || (claude ? 'Synchronisiert über dein Claude-Konto' : 'Gespeichert in diesem Browser');
    });
  },

  renderMini() {
    const root = document.getElementById('miniRoot');
    if (this.ui.mini) { root.innerHTML = miniHTML(); root.hidden = false; } else { root.hidden = true; root.innerHTML = ''; }
    if (this.pip) this.pip.document.getElementById('pipRoot').innerHTML = miniHTML(true);
  },

  onTick() {
    const x = Store.state.timer;
    const rem = Timer.remaining();
    const dur = Timer.duration();
    const txt = U.fmtClock(rem);
    const docs = this.pip ? [document, this.pip.document] : [document];
    docs.forEach((d) => {
      d.querySelectorAll('[data-clock]').forEach((el) => { if (el.textContent !== txt) el.textContent = txt; });
      d.querySelectorAll('[data-bar]').forEach((el) => { el.style.width = `${(U.clamp(1 - rem / dur, 0, 1) * 100).toFixed(2)}%`; });
    });
    if (this.view === 'fokus') UI.updateDial(document, dur ? rem / dur : 1);
    const title = x.status === 'idle' ? 'Pomodoro-Planer' : `${txt} · ${x.status === 'paused' ? 'Pausiert' : PHASES[x.phase].short} – Pomodoro-Planer`;
    if (title !== this._title) { document.title = title; this._title = title; }
  },

  onPhaseComplete(phase, next, session, msg) {
    UI.toast(msg, { timeout: 7000 });
    if (phase === 'focus' && session) {
      this.flashMood = 'yay';
      setTimeout(() => { this.flashMood = null; if (this.view === 'fokus') this.render(); }, 8000);
    }
  },
};

/* ---------- Mini-Ansicht (in der App und im schwebenden Fenster) ---------- */
function miniHTML() {
  const x = Store.state.timer;
  const tg = Store.resolveTarget(x.target);
  const running = x.status === 'running';
  const active = x.status !== 'idle';
  const anime = document.documentElement.dataset.skin === 'anime';
  const mood = running ? (x.phase === 'focus' ? 'focus' : 'break') : active ? 'paused' : (App.flashMood || 'idle');
  const second = x.phase === 'focus'
    ? (active ? `<button type="button" class="icon-btn" data-act="finish" title="Fertig &amp; speichern (F)" aria-label="Fertig und speichern">${UI.icon('check')}</button>` : '')
    : `<button type="button" class="icon-btn" data-act="skip" title="Pause überspringen (S)" aria-label="Pause überspringen">${UI.icon('skip')}</button>`;
  return `<div class="mini" data-phase="${x.phase}">
    <div class="mini-head"><span class="mini-phase"><i></i>${PHASES[x.phase].label}${x.status === 'paused' ? ' · pausiert' : ''}</span>
      <button type="button" class="icon-btn sm" data-act="miniClose" title="Grosse Ansicht" aria-label="Grosse Ansicht">${UI.icon('expand')}</button></div>
    <div class="mini-body">${anime ? `<div class="mini-mascot">${UI.mascot(mood)}</div>` : ''}
      <div class="mini-clock mono" data-clock>${U.fmtClock(Timer.remaining())}</div></div>
    <div class="mini-bar"><i data-bar></i></div>
    <div class="mini-task">${U.esc(tg.title)}</div>
    <div class="mini-ctrl">
      <button type="button" class="btn-start btn-start-sm" data-act="toggle">${UI.icon(running ? 'pause' : 'play')}<span>${running ? 'Pause' : active ? 'Weiter' : 'Start'}</span></button>
      ${second}
    </div>
    <p class="mini-hint"><kbd>Leertaste</kbd> Start/Pause</p>
  </div>`;
}

async function openPip() {
  if (!('documentPictureInPicture' in window)) return false;
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: document.documentElement.dataset.skin === 'anime' ? 300 : 250 });
    [...document.styleSheets].forEach((ss) => {
      try {
        const css = [...ss.cssRules].map((r) => r.cssText).join('\n');
        const st = pip.document.createElement('style');
        st.textContent = css;
        pip.document.head.append(st);
      } catch {
        if (ss.href) { const l = pip.document.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; pip.document.head.append(l); }
      }
    });
    pip.document.title = 'Pomodoro';
    const sprite = document.getElementById('sprite');
    pip.document.body.className = 'pip';
    pip.document.body.innerHTML = `${sprite ? sprite.outerHTML : ''}<div id="pipRoot"></div>`;
    App.pip = pip;
    syncPipTheme();
    pip.document.addEventListener('click', onClick);
    pip.document.addEventListener('keydown', onKey);
    pip.addEventListener('pagehide', () => { App.pip = null; App.renderChrome(); });
    App.renderMini();
    App.onTick();
    return true;
  } catch { return false; }
}
function syncPipTheme() {
  const src = document.documentElement;
  const dst = App.pip && App.pip.document.documentElement;
  if (!dst) return;
  ['mode', 'skin', 'theme'].forEach((k) => { if (src.dataset[k]) dst.dataset[k] = src.dataset[k]; else delete dst.dataset[k]; });
}

let animeFontsLoaded = false;
function loadAnimeFonts() {
  if (animeFontsLoaded) return;
  animeFontsLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&family=Mochiy+Pop+One&display=swap';
  document.head.append(l);
}

/* ---------- Aktionen ---------- */
const NUM_RANGES = { focus: [1, 240], short: [1, 60], long: [1, 120], longEvery: [1, 12], dailyGoalMin: [0, 960], capacity: [1, 30] };

function resetIdleTimer() {
  const x = Store.state.timer;
  if (x.status === 'idle') { x.remaining = null; x.duration = null; Store.commitTimer(); }
}

function createTask(form, fd) {
  const title = String(fd.get('title') || '').trim();
  if (!title) return;
  const t = {
    id: U.uid('t'), title, projectId: fd.get('projectId') || null,
    estimate: U.clamp(parseInt(fd.get('estimate'), 10) || 1, 1, 40),
    date: fd.get('date') || null, time: null, done: false, notes: '',
  };
  App.ui.lastProject = t.projectId || '';
  App.saveUi();
  const inp = form.querySelector('[name="title"]');
  if (inp) inp.value = '';
  Store.saveTask(t);
  const again = document.getElementById(inp && inp.id);
  if (again && !U.isTouch) again.focus();
}

function deleteTaskWithUndo(id) {
  const affected = Store.state.sessions.filter((s) => s.taskId === id).map((s) => U.clone(s));
  const timerTarget = Store.state.timer.target;
  const t = Store.deleteTask(id);
  if (!t) return;
  UI.toast(`«${t.title}» gelöscht`, {
    action: {
      label: 'Rückgängig',
      fn: () => {
        Store.saveTask(t);
        affected.forEach((s) => Store.saveSession(s));
        if (timerTarget === `t:${id}`) { Store.state.timer.target = timerTarget; Store.commitTimer(); }
      },
    },
  });
}

const Actions = {
  go: (el) => App.go(el.dataset.view),
  toggle: () => Timer.toggle(),
  adjust: (el) => Timer.adjust(+el.dataset.min || 0),
  async phase(el) {
    const p = el.dataset.phase;
    const x = Store.state.timer;
    if (p === x.phase && x.status === 'idle') return;
    if (x.phase === 'focus' && x.status !== 'idle' && Timer.elapsedFocus() >= 60) {
      const v = await UI.choice({
        title: 'Fokus läuft noch',
        text: `Du hast ${U.fmtDur(Timer.elapsedFocus())} fokussiert. Was soll mit dieser Zeit passieren?`,
        buttons: [{ label: 'Abbrechen', value: null }, { label: 'Verwerfen', value: 'drop' }, { label: 'Speichern', value: 'save', kind: 'btn-primary' }],
      });
      if (!v) return;
      if (v === 'save') { Timer.finishEarly(); Timer.setPhase(p); return; }
    }
    Timer.setPhase(p);
  },
  finish() {
    const x = Store.state.timer;
    if (x.phase !== 'focus' || x.status === 'idle') return;
    const s = Timer.finishEarly();
    UI.toast(s ? `${U.fmtDur(s.sec)} gespeichert – Zeit für eine Pause` : 'Weniger als 1 Minute – nicht gespeichert');
  },
  skip: () => { if (Store.state.timer.phase !== 'focus') Timer.skip(); },
  async reset() {
    const x = Store.state.timer;
    if (x.phase === 'focus' && Timer.elapsedFocus() >= 60) {
      const ok = await UI.confirm(`Die bisherige Fokuszeit (${U.fmtDur(Timer.elapsedFocus())}) wird nicht gespeichert.`, { title: 'Timer zurücksetzen?', ok: 'Zurücksetzen', danger: true });
      if (!ok) return;
    }
    Timer.reset();
  },
  applyPreset(el) {
    const p = (Store.settings.presets || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    Store.updateSettings({ focus: p.focus, short: p.short, long: p.long, longEvery: p.longEvery });
    resetIdleTimer();
    UI.toast(`Vorlage «${p.name}»: ${p.focus} min Fokus, ${p.short} min Pause`);
  },
  deletePreset(el) {
    const list = (Store.settings.presets || []).filter((x) => x.id !== el.dataset.id);
    Store.updateSettings({ presets: list });
  },
  focusTask(el) {
    const x = Store.state.timer;
    x.target = `t:${el.dataset.id}`;
    if (App.view !== 'fokus') App.go('fokus');
    if (x.status === 'idle' && x.phase === 'focus') Timer.start(); else Store.commitTimer();
  },
  focusProject(el) {
    Store.state.timer.target = `p:${el.dataset.id}`;
    Store.commitTimer();
    App.go('fokus');
  },
  doneTarget() {
    const tg = Store.resolveTarget(Store.state.timer.target);
    if (!tg.task) return;
    const t = tg.task;
    t.done = true;
    Store.saveTask(t);
    UI.toast(`«${t.title}» erledigt ✓`, { action: { label: 'Rückgängig', fn: () => { t.done = false; Store.saveTask(t); } } });
  },
  editTask(el) { const t = Store.task(el.dataset.id); if (t) openTaskDialog(t); },
  deleteTask(el) { UI.closeDialog(); deleteTaskWithUndo(el.dataset.id); },
  addTaskOn(el) { openTaskDialog(null, { date: el.dataset.date || null }); },
  shiftTask(el) {
    const t = Store.task(el.dataset.id);
    if (!t || !t.date) return;
    t.date = U.dateKey(U.addDays(U.parseKey(t.date), +el.dataset.d));
    Store.saveTask(t);
  },
  planToday(el) {
    const t = Store.task(el.dataset.id);
    if (!t) return;
    t.date = U.todayKey();
    Store.saveTask(t);
    UI.toast(`«${t.title}» für heute geplant`);
  },
  taskFilter(el) { App.ui.taskFilter[el.dataset.k] = el.dataset.v; App.saveUi(); App.render(); },

  newProject: () => openProjectDialog(null),
  editProject(el) { const p = Store.project(el.dataset.id); if (p) openProjectDialog(p); },
  openProject(el) { App.ui.projectId = el.dataset.id; App.go('projekte', { keepProject: true }); },
  closeProject() { App.ui.projectId = null; App.saveUi(); App.render(); },
  toggleArchived() { App.ui.showArchived = !App.ui.showArchived; App.saveUi(); App.render(); },
  async deleteProject(el) {
    const p = Store.project(el.dataset.id);
    if (!p) return;
    UI.closeDialog();
    const st = Store.projectStats(p.id);
    const v = await UI.choice({
      title: `«${p.name}» löschen?`,
      text: `${st.sec ? `Die erfasste Zeit (${U.fmtDur(st.sec)}) bleibt in der Auswertung unter «${CATS[p.category].label}» erhalten. ` : ''}Tipp: Archivieren blendet das Projekt aus, ohne etwas zu löschen.`,
      buttons: [
        { label: 'Abbrechen', value: null },
        ...(st.total ? [{ label: `Mit ${st.total} Aufgabe${st.total === 1 ? '' : 'n'} löschen`, value: 'all', kind: 'btn-danger' }] : []),
        { label: st.total ? 'Nur Projekt löschen' : 'Löschen', value: 'project', kind: st.total ? 'btn-ghost' : 'btn-danger' },
      ],
    });
    if (!v) return;
    Store.deleteProject(p.id, v === 'all');
    App.ui.projectId = null; App.saveUi(); App.render();
    UI.toast(`Projekt «${p.name}» gelöscht`);
  },

  calMode(el) { App.ui.cal.mode = el.dataset.v; App.saveUi(); App.render(); },
  calNav(el) {
    const c = App.ui.cal;
    const a = U.parseKey(c.anchor);
    c.anchor = U.dateKey(c.mode === 'week' ? U.addDays(a, 7 * +el.dataset.d) : U.addMonths(a, +el.dataset.d));
    if (c.mode === 'month') c.selected = U.dateKey(U.startOfMonth(U.parseKey(c.anchor)));
    App.render();
  },
  calToday() { const k = U.todayKey(); App.ui.cal.anchor = k; App.ui.cal.selected = k; App.render(); },
  calSelect(el) {
    const k = el.dataset.date;
    App.ui.cal.selected = k;
    App.render();
    if (window.innerWidth < 900) document.querySelector('.day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  statsRange(el) { App.ui.stats.range = el.dataset.v; App.ui.logLimit = 50; App.saveUi(); App.render(); },
  statsNav(el) { const s = App.ui.stats; s.anchor = shiftAnchor(s.range, s.anchor, +el.dataset.d); App.render(); },
  statsToday() { App.ui.stats.anchor = U.todayKey(); App.render(); },
  moreLog() { App.ui.logLimit = (App.ui.logLimit || 50) + 100; App.render(); },
  copySummary() {
    const s = App.ui.stats;
    UI.copy(summaryText(summarize(s.range, s.anchor)), document.getElementById('summaryText'));
  },
  exportCsv() {
    const s = App.ui.stats;
    const R = statsRange(s.range, s.anchor);
    UI.saveFile(`pomodoro-zeiten-${U.dateKey(R.start)}.csv`, sessionsCsv(Store.sessionsBetween(R.start, R.end)), 'text/csv');
  },
  exportCsvAll() { UI.saveFile(`pomodoro-zeiten-alle-${U.todayKey()}.csv`, sessionsCsv(Store.state.sessions), 'text/csv'); },
  addSession: () => openSessionDialog(null),
  editSession(el) { const s = Store.session(el.dataset.id); if (s) openSessionDialog(s); },
  deleteSession(el) {
    UI.closeDialog();
    const s = Store.deleteSession(el.dataset.id);
    if (s) UI.toast(`Eintrag (${U.fmtDur(s.sec)}) gelöscht`, { action: { label: 'Rückgängig', fn: () => Store.saveSession(s) } });
  },

  setMode(el) { App.ui.mode = el.dataset.v; App.saveUi(); App.applyTheme(); App.render(); },
  setSkin(el) { App.ui.skin = el.dataset.v; App.saveUi(); App.applyTheme(); App.render(); },
  toggleTheme() { App.ui.mode = App.isDark() ? 'tag' : 'nacht'; App.saveUi(); App.applyTheme(); App.render(); },
  stepSetting(el) {
    const k = el.dataset.key;
    const [a, b] = NUM_RANGES[k] || [0, 999];
    const v = U.clamp((Store.settings[k] || 0) + +el.dataset.d, a, b);
    Store.updateSettings({ [k]: v });
    if (['focus', 'short', 'long'].includes(k)) resetIdleTimer();
  },
  testSound: () => Timer.testSound(),
  async install() {
    const p = App.installPrompt;
    if (!p) return;
    p.prompt();
    try { await p.userChoice; } catch { /* abgebrochen */ }
    App.installPrompt = null;
    App.render();
  },
  async downloadApp() {
    const url = window.PP_BUILD === 'artifact' ? 'pomodoro-planer.html' : 'download/pomodoro-planer.html';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const html = await res.text();
      const ok = await UI.saveFile('pomodoro-planer.html', html, 'text/html');
      if (ok) UI.toast('Offline-Datei gespeichert – per Doppelklick öffnen');
    } catch {
      UI.toast('Die Offline-Datei ist hier nicht verfügbar. Lade sie auf GitHub herunter (siehe README).', { timeout: 7000 });
    }
  },
  exportJson() {
    UI.saveFile(`pomodoro-planer-backup-${U.todayKey()}.json`, JSON.stringify(Store.exportData(), null, 1), 'application/json')
      .then((ok) => { if (ok) UI.toast('Backup exportiert'); });
  },
  async importJson() {
    const file = await UI.pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { UI.toast('Die Datei ist kein gültiges Backup (JSON).'); return; }
    if (!data || (!Array.isArray(data.projects) && !Array.isArray(data.tasks) && !Array.isArray(data.sessions))) {
      UI.toast('In der Datei wurden keine Planer-Daten gefunden.'); return;
    }
    const n = (k) => (Array.isArray(data[k]) ? data[k].length : 0);
    const v = await UI.choice({
      title: 'Backup importieren',
      text: `Gefunden: ${n('projects')} Projekte, ${n('tasks')} Aufgaben, ${n('sessions')} Zeiteinträge. «Zusammenführen» ergänzt deine Daten, «Ersetzen» löscht zuerst alles Bestehende.`,
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Ersetzen', value: 'replace', kind: 'btn-danger' }, { label: 'Zusammenführen', value: 'merge', kind: 'btn-primary' }],
    });
    if (!v) return;
    if (v === 'replace') { Store.replaceAll(data); if (data.settings) Store.updateSettings(Store.normalize({ settings: data.settings }).settings); }
    else Store.mergeAll(data);
    UI.toast('Backup importiert');
  },
  loadDemo() {
    Store.mergeAll(makeDemoData());
    UI.toast('Beispieldaten geladen – in den Einstellungen kannst du sie wieder entfernen.', { timeout: 6000 });
  },
  removeDemo() { Store.removeDemo(); UI.toast('Beispieldaten entfernt'); },
  async clearAll() {
    const ok = await UI.confirm('Alle Projekte, Aufgaben und erfassten Zeiten werden gelöscht. Exportiere vorher ein Backup, wenn du sie behalten willst.', { title: 'Alle Daten löschen?', ok: 'Alles löschen', danger: true });
    if (ok) { Store.clearAll(); UI.toast('Alle Daten gelöscht'); }
  },
  async minimize() {
    if (App.pip) { App.pip.close(); App.pip = null; return; }
    if (!App.ui.mini && window.top === window && await openPip()) return;
    App.ui.mini = !App.ui.mini;
    App.saveUi();
    App.render();
  },
  miniClose() {
    if (App.pip) { App.pip.close(); App.pip = null; window.focus(); }
    App.ui.mini = false;
    App.saveUi();
    App.render();
  },
};

const Changes = {
  target(el) { Store.state.timer.target = el.value; Store.commitTimer(); },
  taskDone(el) {
    const t = Store.task(el.dataset.id);
    if (!t) return;
    t.done = el.checked;
    Store.saveTask(t);
    if (t.done) UI.toast(`«${t.title}» erledigt ✓`, { action: { label: 'Rückgängig', fn: () => { t.done = false; Store.saveTask(t); } } });
  },
  taskFilterProject(el) { App.ui.taskFilter.project = el.value; App.saveUi(); App.render(); },
  setting(el) {
    const k = el.dataset.key;
    const [a, b] = NUM_RANGES[k] || [0, 999];
    const v = U.clamp(parseInt(el.value, 10) || a, a, b);
    Store.updateSettings({ [k]: v });
    if (['focus', 'short', 'long'].includes(k)) resetIdleTimer();
  },
  settingNum(el) { Store.updateSettings({ [el.dataset.key]: parseFloat(el.value) }); },
  async settingBool(el) {
    const k = el.dataset.key;
    const on = el.checked;
    if (k === 'notify' && on) {
      const r = await Timer.requestNotify();
      if (r !== 'granted') {
        el.checked = false;
        UI.toast(r === 'unsupported' ? 'Benachrichtigungen werden hier nicht unterstützt.' : 'Benachrichtigungen sind blockiert. Erlaube sie in den Browser-Einstellungen.', { timeout: 6000 });
        return;
      }
    }
    Store.updateSettings({ [k]: on });
    if (k === 'sound' || k === 'volume') Timer.scheduleChime();
    if (k === 'background') { Timer.ensureAudio(); Timer.syncMedia(true); }
  },
};

const Forms = {
  quickTask: createTask,
  dayTask: createTask,
  projectTask: createTask,
  newTask(form, fd) {
    createTask(form, fd);
    const d = form.querySelector('[name="date"]');
    if (d) d.value = '';
  },
  savePreset(form, fd) {
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const s = Store.settings;
    form.querySelector('[name="name"]').value = '';
    Store.updateSettings({ presets: [...(s.presets || []), { id: U.uid('v'), name, focus: s.focus, short: s.short, long: s.long, longEvery: s.longEvery }] });
    UI.toast(`Vorlage «${name}» gespeichert`);
  },
};

const Inputs = {
  taskSearch: U.debounce((el) => { App.ui.taskFilter.q = el.value; App.saveUi(); App.render(); }, 200),
};

/* ---------- Ereignisse ---------- */
function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (App.connecting) return;
  const fn = Actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
}

function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target;
  const tag = el && el.tagName;
  const typing = el && (el.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT'
    || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes(el.type)));
  if (typing || App.connecting) return;
  if (document.getElementById('dlg').open) return;
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) Timer.toggle();
    return;
  }
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  const x = Store.state.timer;
  if (k === 'f' && x.phase === 'focus' && x.status !== 'idle') Actions.finish();
  else if (k === 's' && x.phase !== 'focus') Actions.skip();
  else if (k === 'm') Actions.minimize();
  else if (k === 't') Actions.toggleTheme();
  else if (k === 'n') { e.preventDefault(); openTaskDialog(null, { date: U.todayKey() }); }
  else if (k === 'escape' && App.ui.mini) Actions.miniClose();
  else if (/^[1-6]$/.test(k) && !App.ui.mini) App.go(VIEW_ORDER[+k - 1]);
}

let dragId = null;
function bindDnD() {
  const clear = () => document.querySelectorAll('.is-drop').forEach((z) => z.classList.remove('is-drop'));
  document.addEventListener('dragstart', (e) => {
    const el = e.target.closest && e.target.closest('[data-task][draggable="true"]');
    if (!el) return;
    dragId = el.dataset.task;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => el.classList.add('is-dragging'));
  });
  document.addEventListener('dragend', () => {
    dragId = null; clear();
    document.querySelectorAll('.is-dragging').forEach((z) => z.classList.remove('is-dragging'));
  });
  document.addEventListener('dragover', (e) => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!z.classList.contains('is-drop')) { clear(); z.classList.add('is-drop'); }
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    const t = Store.task(dragId);
    const d = z.dataset.drop === 'none' ? null : z.dataset.drop;
    clear();
    if (t && t.date !== d) { t.date = d; Store.saveTask(t); UI.toast(d ? `«${t.title}» geplant: ${U.relDay(d)}` : `«${t.title}» ist jetzt ungeplant`); }
  });
}

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && Changes[el.dataset.change]) Changes[el.dataset.change](el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (el && Inputs[el.dataset.input]) Inputs[el.dataset.input](el, e);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fn = Forms[form.dataset.form];
    if (fn) fn(form, new FormData(form));
  });
  bindDnD();
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (Views[h] && h !== App.view) App.go(h);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { App.applyTheme(); App.renderChrome(); });
  new MutationObserver(() => { App.applyTheme(); App.renderChrome(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    App.installPrompt = e;
    App.renderChrome();
    if (App.view === 'einstellungen') App.render();
  });
  window.addEventListener('appinstalled', () => { App.installPrompt = null; App.renderChrome(); });
}

/* ---------- Start ---------- */
async function boot() {
  App.loadUi();
  App.applyTheme();
  Store.initLocal();
  const h = location.hash.slice(1);
  if (Views[h]) App.ui.view = h;
  if (h === 'mini') App.ui.mini = true;
  App.view = Views[App.ui.view] ? App.ui.view : 'fokus';
  bindEvents();
  Store.subscribe((reason) => {
    if (reason === 'status') { App.renderSaveState(); return; }
    if (reason === 'timer') {
      if (App.view === 'fokus') App.render(); else { App.renderChrome(); App.renderMini(); }
      return;
    }
    App.render();
  });
  const claude = window.claude && typeof window.claude.use === 'function';
  App.connecting = !!claude;
  App.render();
  setInterval(() => { if (!App.connecting) { Timer.tick(); App.onTick(); } }, 250);
  if (claude) {
    await Store.tryClaude();
    App.connecting = false;
    App.render();
  }
  Timer.resume();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !claude && (window.PP_BUILD || 'web') === 'web') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
