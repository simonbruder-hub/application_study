/* Ansicht «Aufgaben»: alle Aufgaben mit Filtern, gruppiert nach Datum */
'use strict';

Views.aufgaben = {
  title: 'Aufgaben',
  render() {
    const f = App.ui.taskFilter;
    const today = U.todayKey();
    const weekEnd = U.dateKey(U.addDays(U.startOfWeek(new Date()), 6));
    let list = Store.state.tasks.slice();
    if (f.status === 'open') list = list.filter((t) => !t.done);
    if (f.status === 'done') list = list.filter((t) => t.done);
    if (f.project === 'none') list = list.filter((t) => !t.projectId);
    else if (f.project !== 'all') list = list.filter((t) => t.projectId === f.project);
    if (f.when === 'today') list = list.filter((t) => t.date === today || (!t.done && t.date && t.date < today));
    if (f.when === 'week') list = list.filter((t) => t.date && t.date >= today && t.date <= weekEnd);
    if (f.when === 'overdue') list = list.filter((t) => !t.done && t.date && t.date < today);
    if (f.when === 'unplanned') list = list.filter((t) => !t.date);
    const q = (f.q || '').trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));

    const groups = new Map();
    const add = (k, t) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); };
    list.forEach((t) => {
      if (!t.date) add('~none', t);
      else if (!t.done && t.date < today) add('!overdue', t);
      else add(t.date, t);
    });
    const keys = [...groups.keys()].sort((a, b) => {
      const rank = (k) => (k === '!overdue' ? 0 : k === '~none' ? 2 : 1);
      return rank(a) - rank(b) || (f.status === 'done' ? b.localeCompare(a) : a.localeCompare(b));
    });
    const label = (k) => {
      if (k === '!overdue') return 'Überfällig';
      if (k === '~none') return 'Ohne Datum';
      const rel = U.relDay(k);
      return rel.includes(',') ? U.fmtDayLong(k) : `${rel} · ${U.fmtDay(k)}`;
    };
    const seg = (name, val, text) => `<button type="button" class="seg-btn${f[name] === val ? ' is-on' : ''}" aria-pressed="${f[name] === val}" data-act="taskFilter" data-k="${name}" data-v="${val}">${text}</button>`;
    const projOpts = `<option value="all"${f.project === 'all' ? ' selected' : ''}>Alle Projekte</option><option value="none"${f.project === 'none' ? ' selected' : ''}>Ohne Projekt</option>${Store.projects().map((p) => `<option value="${p.id}"${f.project === p.id ? ' selected' : ''}>${U.esc(p.name)}</option>`).join('')}`;
    const totalOpen = Store.state.tasks.filter((t) => !t.done).length;

    return `
    <div class="view-head">
      <div><p class="eyebrow">${totalOpen} offen</p><h1>Aufgaben</h1></div>
    </div>
    <form class="card add-task" data-form="newTask" autocomplete="off">
      <label class="sr-only" for="ntTitle">Neue Aufgabe</label>
      <input id="ntTitle" name="title" data-keep placeholder="Neue Aufgabe …" required maxlength="140" class="grow-input">
      <label class="field-inline"><span>Projekt</span><select id="ntProject" name="projectId" data-keep>${UI.projectOptions(f.project !== 'all' && f.project !== 'none' ? f.project : (App.ui.lastProject || ''))}</select></label>
      <label class="field-inline"><span>Pomodoros</span><input id="ntEst" name="estimate" data-keep type="number" min="1" max="20" value="1" inputmode="numeric"></label>
      <label class="field-inline"><span>Datum</span><input id="ntDate" name="date" data-keep type="date"></label>
      <button type="submit" class="btn btn-primary">${UI.icon('plus')}Hinzufügen</button>
    </form>
    <div class="filters">
      <div class="seg" role="group" aria-label="Status">${seg('status', 'open', 'Offen')}${seg('status', 'done', 'Erledigt')}${seg('status', 'all', 'Alle')}</div>
      <div class="seg" role="group" aria-label="Zeitraum">${seg('when', 'all', 'Alle')}${seg('when', 'today', 'Heute')}${seg('when', 'week', 'Diese Woche')}${seg('when', 'overdue', 'Überfällig')}${seg('when', 'unplanned', 'Ungeplant')}</div>
      <label class="sr-only" for="tfProject">Projekt</label>
      <select id="tfProject" data-change="taskFilterProject">${projOpts}</select>
      <label class="sr-only" for="tfSearch">Suchen</label>
      <input id="tfSearch" type="search" placeholder="Suchen …" value="${U.esc(f.q || '')}" data-input="taskSearch" data-keep>
    </div>
    ${keys.length ? keys.map((k) => `
      <section class="task-group${k === '!overdue' ? ' is-overdue' : ''}">
        <h2 class="group-title">${label(k)} <span class="muted">${groups.get(k).length}</span></h2>
        <ul class="task-list card">${groups.get(k).sort(taskSort).map((t) => UI.taskRow(t, { showDate: k === '!overdue' })).join('')}</ul>
      </section>`).join('')
      : `<div class="empty card">
          <h2>${Store.state.tasks.length ? 'Keine Aufgaben für diesen Filter' : 'Noch keine Aufgaben'}</h2>
          <p>${Store.state.tasks.length ? 'Passe die Filter an, um weitere Aufgaben zu sehen.' : 'Lege oben deine erste Aufgabe an. Schätze dazu, wie viele Pomodoros sie braucht.'}</p>
          ${Store.isEmpty() ? '<button type="button" class="btn btn-ghost" data-act="loadDemo">Beispieldaten ansehen</button>' : ''}
        </div>`}`;
  },
};

/** Dialog zum Bearbeiten/Anlegen einer Aufgabe */
function openTaskDialog(task, defaults = {}) {
  const t = task ? U.clone(task) : { id: U.uid('t'), title: '', projectId: App.ui.lastProject || null, estimate: 1, date: null, time: null, done: false, notes: '', ...defaults };
  const st = task ? Store.taskStats(task.id) : null;
  UI.form({
    title: task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
    submitLabel: task ? 'Speichern' : 'Anlegen',
    body: `
      <div class="field"><label for="tdTitle">Titel</label><input id="tdTitle" name="title" required maxlength="140" value="${U.esc(t.title)}" autofocus></div>
      <div class="field-row">
        <div class="field"><label for="tdProject">Projekt</label><select id="tdProject" name="projectId">${UI.projectOptions(t.projectId)}</select></div>
        <div class="field field-s"><label for="tdEst">Pomodoros</label><input id="tdEst" name="estimate" type="number" min="1" max="40" inputmode="numeric" value="${t.estimate || 1}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="tdDate">Geplant am</label><input id="tdDate" name="date" type="date" value="${t.date || ''}"></div>
        <div class="field field-s"><label for="tdTime">Uhrzeit</label><input id="tdTime" name="time" type="time" value="${t.time || ''}"></div>
      </div>
      <div class="field"><label for="tdNotes">Notizen</label><textarea id="tdNotes" name="notes" rows="3" maxlength="2000">${U.esc(t.notes || '')}</textarea></div>
      <label class="switch"><input type="checkbox" name="done"${t.done ? ' checked' : ''}><span>Erledigt</span></label>
      ${st ? `<p class="muted small">Erfasst: ${U.fmtDur(st.sec)} · ${st.pomos} Pomodoro${st.pomos === 1 ? '' : 's'}</p>` : ''}`,
    extraFooter: task ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="deleteTask" data-id="${t.id}">${UI.icon('trash')}Löschen</button>` : '',
    onSubmit(fd) {
      t.title = String(fd.get('title') || '').trim();
      if (!t.title) return false;
      t.projectId = fd.get('projectId') || null;
      t.estimate = U.clamp(parseInt(fd.get('estimate'), 10) || 1, 1, 40);
      t.date = fd.get('date') || null;
      t.time = fd.get('time') || null;
      t.notes = String(fd.get('notes') || '');
      t.done = fd.get('done') === 'on';
      Store.saveTask(t);
      if (!task) UI.toast('Aufgabe angelegt');
      return true;
    },
  });
}
