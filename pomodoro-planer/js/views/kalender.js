/* Ansicht «Kalender»: Wochen- und Monatsplanung mit Drag & Drop */
'use strict';

Views.kalender = {
  title: 'Kalender',
  render() {
    const cal = App.ui.cal;
    const a = U.parseKey(cal.anchor);
    const seg = (v, t) => `<button type="button" class="seg-btn${cal.mode === v ? ' is-on' : ''}" aria-pressed="${cal.mode === v}" data-act="calMode" data-v="${v}">${t}</button>`;
    let title; let eyebrow;
    if (cal.mode === 'week') {
      const w0 = U.startOfWeek(a); const w6 = U.addDays(w0, 6);
      eyebrow = `KW ${U.isoWeek(w0)}`;
      title = w0.getMonth() === w6.getMonth()
        ? `${w0.getDate()}.–${w6.getDate()}. ${U.MONTHS[w6.getMonth()]} ${w6.getFullYear()}`
        : `${w0.getDate()}. ${U.MONTHS_SHORT[w0.getMonth()]} – ${w6.getDate()}. ${U.MONTHS_SHORT[w6.getMonth()]} ${w6.getFullYear()}`;
    } else {
      eyebrow = 'Monat';
      title = `${U.MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    }
    return `
    <div class="view-head">
      <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>
      <div class="head-actions">
        <div class="seg" role="group" aria-label="Ansicht">${seg('week', 'Woche')}${seg('month', 'Monat')}</div>
        <div class="pager">
          <button type="button" class="icon-btn" data-act="calNav" data-d="-1" aria-label="Zurück">${UI.icon('chevron-left')}</button>
          <button type="button" class="btn btn-ghost" data-act="calToday">Heute</button>
          <button type="button" class="icon-btn" data-act="calNav" data-d="1" aria-label="Weiter">${UI.icon('chevron-right')}</button>
        </div>
      </div>
    </div>
    <p class="hint muted">${U.isTouch ? 'Tippe auf eine Aufgabe zum Bearbeiten, verschiebe sie mit ‹ ›.' : 'Ziehe Aufgaben auf einen Tag, um sie zu planen. Klicke auf einen Tag für Details.'}</p>
    ${cal.mode === 'week' ? this.week(a) : this.month(a)}`;
  },

  dayInfo(from, days) {
    const info = new Map();
    for (let i = 0; i < days; i++) {
      const k = U.dateKey(U.addDays(from, i));
      info.set(k, { tasks: [], sec: 0, deadlines: [] });
    }
    Store.state.tasks.forEach((t) => { if (t.date && info.has(t.date)) info.get(t.date).tasks.push(t); });
    const end = U.addDays(from, days);
    Store.sessionsBetween(from, end).forEach((s) => { const k = U.dateKey(s.start); if (info.has(k)) info.get(k).sec += s.sec; });
    Store.projects().forEach((p) => { if (p.deadline && info.has(p.deadline)) info.get(p.deadline).deadlines.push(p); });
    info.forEach((v) => v.tasks.sort(taskSort));
    return info;
  },

  week(a) {
    const w0 = U.startOfWeek(a);
    const info = this.dayInfo(w0, 7);
    const today = U.todayKey();
    const cap = Store.settings.capacity || 8;
    const cols = [...info.entries()].map(([k, d], i) => {
      const load = U.sum(d.tasks.filter((t) => !t.done), (t) => t.estimate || 1);
      const over = load > cap;
      const dt = U.parseKey(k);
      return `<div class="wk-col${k === today ? ' is-today' : ''}${k < today ? ' is-past' : ''}" data-drop="${k}">
        <div class="wk-head">
          <span class="wk-day"><span class="wk-wd">${U.WD[i]}</span><span class="wk-date">${dt.getDate()}.${dt.getMonth() + 1}.</span></span>
          <span class="wk-load${over ? ' is-over' : ''}" title="${load} von ${cap} Pomodoros geplant">${load}/${cap}</span>
        </div>
        <div class="meter meter-load${over ? ' is-over' : ''}"><i style="width:${U.clamp((load / cap) * 100, 0, 100).toFixed(1)}%"></i></div>
        ${d.deadlines.map((p) => `<div class="cal-deadline" style="--pc: var(--pc-${p.color || 1})">${UI.icon('flag')}${U.esc(p.name)}</div>`).join('')}
        <ul class="wk-list">${d.tasks.map((t) => this.card(t)).join('')}</ul>
        <button type="button" class="wk-add" data-act="addTaskOn" data-date="${k}">${UI.icon('plus')}Aufgabe</button>
        <div class="wk-foot">${d.sec ? `${UI.icon('timer')}<span class="mono">${U.fmtHM(d.sec)}</span> erfasst` : ''}</div>
      </div>`;
    }).join('');
    const backlog = Store.state.tasks.filter((t) => !t.done && (!t.date || t.date < today))
      .sort((x, y) => (x.date ? 0 : 1) - (y.date ? 0 : 1) || taskSort(x, y));
    return `<div class="week-layout">
      <aside class="card backlog" data-drop="none">
        <div class="card-head"><h2>Ungeplant</h2><span class="muted">${backlog.length}</span></div>
        <p class="muted small">Offene Aufgaben ohne Datum oder überfällig. Hierher ziehen entfernt das Datum.</p>
        ${backlog.length ? `<ul class="wk-list">${backlog.map((t) => this.card(t, true)).join('')}</ul>` : '<p class="empty-line">Alles eingeplant.</p>'}
        <button type="button" class="wk-add" data-act="addTaskOn" data-date="">${UI.icon('plus')}Aufgabe</button>
      </aside>
      <div class="week-grid">${cols}</div>
    </div>`;
  },

  card(t, inBacklog = false) {
    const p = Store.project(t.projectId);
    const st = Store.taskStats(t.id);
    const overdue = !t.done && t.date && t.date < U.todayKey();
    return `<li class="wk-card${t.done ? ' is-done' : ''}" draggable="true" data-task="${t.id}" style="--pc: var(--pc-${p ? p.color || 1 : 0})">
      <button type="button" class="wk-card-main" data-act="editTask" data-id="${t.id}">
        ${t.time ? `<span class="wk-time mono">${t.time}</span>` : ''}
        <span class="wk-title">${U.esc(t.title)}</span>
        <span class="wk-meta">${p ? U.esc(p.name) : 'Ohne Projekt'}${inBacklog && overdue ? ` · <span class="is-overdue">${U.fmtDay(t.date)}</span>` : ''}</span>
        ${UI.pomoDots(st.pomos, t.estimate || 1)}
      </button>
      ${inBacklog ? `<button type="button" class="icon-btn sm" data-act="planToday" data-id="${t.id}" title="Für heute planen" aria-label="Für heute planen">${UI.icon('calendar')}</button>` : `
      <span class="wk-move">
        <button type="button" class="icon-btn sm" data-act="shiftTask" data-id="${t.id}" data-d="-1" title="Einen Tag früher" aria-label="Einen Tag früher">${UI.icon('chevron-left')}</button>
        <button type="button" class="icon-btn sm" data-act="shiftTask" data-id="${t.id}" data-d="1" title="Einen Tag später" aria-label="Einen Tag später">${UI.icon('chevron-right')}</button>
      </span>`}
    </li>`;
  },

  month(a) {
    const m0 = U.startOfMonth(a);
    const m1 = U.addMonths(m0, 1);
    const g0 = U.startOfWeek(m0);
    const weeks = Math.ceil(U.daysBetween(g0, m1) / 7);
    const info = this.dayInfo(g0, weeks * 7);
    const today = U.todayKey();
    const sel = App.ui.cal.selected;
    const cap = Store.settings.capacity || 8;
    let rows = '';
    for (let w = 0; w < weeks; w++) {
      const ws = U.addDays(g0, w * 7);
      let cells = `<div class="kw" aria-hidden="true">${U.isoWeek(ws)}</div>`;
      for (let i = 0; i < 7; i++) {
        const dt = U.addDays(ws, i);
        const k = U.dateKey(dt);
        const d = info.get(k);
        const load = U.sum(d.tasks.filter((t) => !t.done), (t) => t.estimate || 1);
        const out = dt.getMonth() !== m0.getMonth();
        const chips = d.tasks.slice(0, 3).map((t) => {
          const p = Store.project(t.projectId);
          return `<button type="button" class="cal-chip${t.done ? ' is-done' : ''}" draggable="true" data-task="${t.id}" data-act="editTask" data-id="${t.id}" style="--pc: var(--pc-${p ? p.color || 1 : 0})">${U.esc(t.title)}</button>`;
        }).join('');
        const dots = d.tasks.slice(0, 5).map((t) => { const p = Store.project(t.projectId); return `<i class="${t.done ? 'is-done' : ''}" style="--pc: var(--pc-${p ? p.color || 1 : 0})"></i>`; }).join('');
        cells += `<div class="cal-cell${out ? ' is-out' : ''}${k === today ? ' is-today' : ''}${k === sel ? ' is-sel' : ''}" data-drop="${k}" data-act="calSelect" data-date="${k}">
          <div class="cal-top">
            <button type="button" class="cal-num" data-act="calSelect" data-date="${k}" aria-label="${U.fmtDayLong(k)}${d.tasks.length ? `, ${d.tasks.length} Aufgaben` : ''}">${dt.getDate()}</button>
            ${d.sec ? `<span class="cal-logged mono" title="erfasst">${U.fmtHM(d.sec)}</span>` : ''}
          </div>
          ${d.deadlines.map((p) => `<div class="cal-deadline" style="--pc: var(--pc-${p.color || 1})" title="Termin: ${U.esc(p.name)}">${UI.icon('flag')}<span>${U.esc(p.name)}</span></div>`).join('')}
          <div class="cal-items">${chips}${d.tasks.length > 3 ? `<span class="cal-more">+${d.tasks.length - 3}</span>` : ''}</div>
          <div class="cal-dots" aria-hidden="true">${dots}</div>
          ${load ? `<div class="meter meter-load meter-thin${load > cap ? ' is-over' : ''}" title="${load} von ${cap} Pomodoros geplant"><i style="width:${U.clamp((load / cap) * 100, 0, 100).toFixed(1)}%"></i></div>` : ''}
        </div>`;
      }
      rows += cells;
    }
    return `<div class="month-layout">
      <div class="card month-card">
        <div class="month-grid month-head"><div class="kw">KW</div>${U.WD.map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="month-grid">${rows}</div>
      </div>
      ${this.dayPanel(sel)}
    </div>`;
  },

  dayPanel(k) {
    const tasks = Store.tasksOn(k);
    const d0 = U.parseKey(k);
    const sessions = Store.sessionsBetween(d0, U.addDays(d0, 1)).sort((a, b) => a.start - b.start);
    const cap = Store.settings.capacity || 8;
    const load = U.sum(tasks.filter((t) => !t.done), (t) => t.estimate || 1);
    const deadlines = Store.projects().filter((p) => p.deadline === k);
    return `<aside class="card day-panel">
      <div class="card-head"><h2>${U.fmtDayLong(k)}</h2></div>
      <p class="muted small">${load} von ${cap} Pomodoros geplant${sessions.length ? ` · ${U.fmtDur(U.sum(sessions, (s) => s.sec))} erfasst` : ''}</p>
      ${deadlines.map((p) => `<div class="cal-deadline" style="--pc: var(--pc-${p.color || 1})">${UI.icon('flag')}Termin: ${U.esc(p.name)}</div>`).join('')}
      ${tasks.length ? `<ul class="task-list">${tasks.map((t) => UI.taskRow(t, { showDate: false, draggable: !U.isTouch })).join('')}</ul>` : '<p class="empty-line">Keine Aufgaben geplant.</p>'}
      <form class="quick-add" data-form="dayTask" autocomplete="off">
        <input type="hidden" name="date" value="${k}">
        <label class="sr-only" for="dtTitle">Neue Aufgabe an diesem Tag</label>
        <input id="dtTitle" name="title" data-keep placeholder="Aufgabe für diesen Tag …" required maxlength="140">
        <label class="sr-only" for="dtProject">Projekt</label>
        <select id="dtProject" name="projectId" data-keep>${UI.projectOptions(App.ui.lastProject || '')}</select>
        <label class="sr-only" for="dtEst">Pomodoros</label>
        <input id="dtEst" name="estimate" data-keep type="number" min="1" max="20" value="1" inputmode="numeric" title="Geschätzte Pomodoros">
        <button type="submit" class="icon-btn icon-btn-solid" aria-label="Hinzufügen">${UI.icon('plus')}</button>
      </form>
      ${sessions.length ? `<h3 class="mini-title">Erfasste Zeit</h3><ul class="log-list">${sessions.map((s) => `<li><button type="button" class="log-item" data-act="editSession" data-id="${s.id}">
        <span class="mono">${U.fmtTime(s.start)}–${U.fmtTime(s.end)}</span><span class="log-title">${U.esc(Store.sessionLabel(s))}</span><span class="mono">${U.fmtDur(s.sec)}</span></button></li>`).join('')}</ul>` : ''}
    </aside>`;
  },
};
