/* Ansicht «Projekte»: Übersicht und Detail mit Zeit, Fortschritt, Aufgaben */
'use strict';

Views.projekte = {
  title: 'Projekte',
  render() {
    const pid = App.ui.projectId;
    if (pid && Store.project(pid)) return this.detail(Store.project(pid));
    const arch = App.ui.showArchived;
    const list = Store.projects(arch);
    const w0 = U.startOfWeek(new Date());
    const w1 = U.addDays(w0, 7);
    const cards = list.map((p) => {
      const all = Store.projectStats(p.id);
      const wk = Store.projectStats(p.id, w0, w1);
      const prog = progressOf(p, all);
      return `<button type="button" class="card project-card" data-act="openProject" data-id="${p.id}" style="--pc: var(--pc-${p.color || 1})">
        <span class="pc-top"><span class="pc-swatch"></span>${UI.catChip(p.category)}${deadlineBadge(p)}</span>
        <span class="pc-name">${U.esc(p.name)}</span>
        <span class="pc-stats">
          <span><b class="mono">${U.fmtHM(all.sec)}</b><small>gesamt</small></span>
          <span><b class="mono">${U.fmtHM(wk.sec)}</b><small>diese Woche</small></span>
          <span><b class="mono">${all.open}</b><small>offen</small></span>
        </span>
        <span class="pc-progress"><span class="meter meter-pc"><i style="width:${(prog.frac * 100).toFixed(1)}%"></i></span><small class="muted">${U.esc(prog.label)}</small></span>
      </button>`;
    }).join('');
    const nArch = Store.projects(true).length;
    return `
    <div class="view-head">
      <div><p class="eyebrow">${list.length} ${arch ? 'archiviert' : 'aktiv'}</p><h1>Projekte</h1></div>
      <div class="head-actions">
        ${nArch || arch ? `<button type="button" class="btn btn-ghost" data-act="toggleArchived">${arch ? 'Aktive zeigen' : `Archiv (${nArch})`}</button>` : ''}
        <button type="button" class="btn btn-primary" data-act="newProject">${UI.icon('plus')}Neues Projekt</button>
      </div>
    </div>
    ${list.length ? `<div class="project-grid">${cards}</div>` : `
      <div class="empty card">
        <h2>${arch ? 'Keine archivierten Projekte' : 'Noch keine Projekte'}</h2>
        <p>Projekte bündeln Aufgaben und erfasste Zeit, z. B. ein Modul im Studium oder ein Auftrag bei der Arbeit. Jedes Projekt gehört zu <b>Lernen</b>, <b>Arbeit</b> oder <b>Sonstiges</b>.</p>
        <div class="row-gap">
          <button type="button" class="btn btn-primary" data-act="newProject">${UI.icon('plus')}Projekt anlegen</button>
          ${Store.isEmpty() ? '<button type="button" class="btn btn-ghost" data-act="loadDemo">Beispieldaten ansehen</button>' : ''}
        </div>
      </div>`}`;
  },

  detail(p) {
    const all = Store.projectStats(p.id);
    const w0 = U.startOfWeek(new Date());
    const wk = Store.projectStats(p.id, w0, U.addDays(w0, 7));
    const prog = progressOf(p, all);
    const tasks = Store.state.tasks.filter((t) => t.projectId === p.id).sort((a, b) => taskSort(a, b) || (a.date || '9999').localeCompare(b.date || '9999'));
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const sessions = Store.state.sessions.filter((s) => Store.sessionProject(s)?.id === p.id).sort((a, b) => b.start - a.start);
    // 14-Tage-Verlauf
    const d0 = U.addDays(U.startOfDay(new Date()), -13);
    const days = Array.from({ length: 14 }, (_, i) => {
      const a = U.addDays(d0, i);
      const b = U.addDays(a, 1);
      return { key: U.dateKey(a), label: `${U.WD[U.wdIndex(a)]}`, sec: U.sum(sessions.filter((s) => s.start >= +a && s.start < +b), (s) => s.sec) };
    });
    const chart = Charts.columns({
      id: 'pc14',
      buckets: days.map((d) => ({ label: d.label, sub: U.fmtDay(d.key), values: { p: d.sec } })),
      series: [{ key: 'p', label: p.name, color: `var(--pc-${p.color || 1})` }],
      legend: false,
    });
    return `
    <div class="view-head">
      <div>
        <button type="button" class="link back" data-act="closeProject">${UI.icon('chevron-left')}Alle Projekte</button>
        <h1 class="with-swatch" style="--pc: var(--pc-${p.color || 1})"><span class="pc-swatch"></span>${U.esc(p.name)}</h1>
        <p class="sub-line">${UI.catChip(p.category)}${deadlineBadge(p)}${p.archived ? '<span class="badge">Archiviert</span>' : ''}</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-ghost" data-act="editProject" data-id="${p.id}">${UI.icon('edit')}Bearbeiten</button>
        <button type="button" class="btn btn-primary" data-act="focusProject" data-id="${p.id}">${UI.icon('play')}Fokussieren</button>
      </div>
    </div>
    ${p.notes ? `<p class="notes">${U.esc(p.notes)}</p>` : ''}
    <div class="tiles">
      <div class="tile"><span class="tile-label">Gesamt</span><span class="tile-value">${U.fmtDur(all.sec)}</span><span class="tile-sub">${all.pomos} Pomodoros</span></div>
      <div class="tile"><span class="tile-label">Diese Woche</span><span class="tile-value">${U.fmtDur(wk.sec)}</span><span class="tile-sub">${wk.pomos} Pomodoros</span></div>
      <div class="tile"><span class="tile-label">Aufgaben</span><span class="tile-value">${all.done} / ${all.total}</span><span class="tile-sub">erledigt</span></div>
      <div class="tile tile-progress"><span class="tile-label">Fortschritt</span><span class="tile-value">${Math.round(prog.frac * 100)} %</span><span class="meter meter-pc" style="--pc: var(--pc-${p.color || 1})"><i style="width:${(prog.frac * 100).toFixed(1)}%"></i></span><span class="tile-sub">${U.esc(prog.label)}</span></div>
    </div>
    <div class="two-col">
      <section class="card">
        <div class="card-head"><h2>Offene Aufgaben</h2><span class="muted">${open.length}</span></div>
        ${open.length ? `<ul class="task-list">${open.map((t) => UI.taskRow(t, { showProject: false })).join('')}</ul>` : '<p class="empty-line">Keine offenen Aufgaben.</p>'}
        <form class="quick-add" data-form="projectTask" autocomplete="off">
          <input type="hidden" name="projectId" value="${p.id}">
          <label class="sr-only" for="ptTitle">Neue Aufgabe in diesem Projekt</label>
          <input id="ptTitle" name="title" data-keep placeholder="Neue Aufgabe …" required maxlength="140">
          <label class="sr-only" for="ptDate">Datum</label>
          <input id="ptDate" name="date" type="date" data-keep title="Geplant am">
          <label class="sr-only" for="ptEst">Pomodoros</label>
          <input id="ptEst" name="estimate" data-keep type="number" min="1" max="20" value="1" inputmode="numeric" title="Geschätzte Pomodoros">
          <button type="submit" class="icon-btn icon-btn-solid" aria-label="Hinzufügen">${UI.icon('plus')}</button>
        </form>
        ${done.length ? `<details class="done-list"><summary>Erledigt (${done.length})</summary><ul class="task-list">${done.map((t) => UI.taskRow(t, { showProject: false })).join('')}</ul></details>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h2>Letzte 14 Tage</h2><span class="muted">${U.fmtDur(U.sum(days, (d) => d.sec))}</span></div>
        ${chart}
        <h3 class="mini-title">Letzte Einträge</h3>
        ${sessions.length ? `<ul class="log-list">${sessions.slice(0, 8).map((s) => `<li><button type="button" class="log-item" data-act="editSession" data-id="${s.id}">
          <span class="mono">${U.fmtDay(s.start)} ${U.fmtTime(s.start)}</span><span class="log-title">${U.esc(Store.sessionLabel(s))}</span><span class="mono">${U.fmtDur(s.sec)}</span></button></li>`).join('')}</ul>`
          : '<p class="empty-line">Noch keine Zeit erfasst.</p>'}
      </section>
    </div>`;
  },
};

function progressOf(p, stats) {
  if (p.goalHours) {
    const goal = p.goalHours * 3600;
    return { frac: U.clamp(stats.sec / goal, 0, 1), label: `${U.fmtHM(stats.sec)} von ${p.goalHours} h Zielzeit` };
  }
  if (stats.total) return { frac: stats.done / stats.total, label: `${stats.done} von ${stats.total} Aufgaben erledigt` };
  return { frac: 0, label: 'Noch keine Aufgaben' };
}

function deadlineBadge(p) {
  if (!p.deadline) return '';
  const d = U.daysBetween(new Date(), U.parseKey(p.deadline));
  const txt = d > 1 ? `noch ${d} Tage` : d === 1 ? 'morgen fällig' : d === 0 ? 'heute fällig' : `seit ${-d} Tag${d === -1 ? '' : 'en'} vorbei`;
  const cls = d < 0 ? ' is-late' : d <= 7 ? ' is-soon' : '';
  return `<span class="badge${cls}" title="Termin ${U.fmtDate(p.deadline)}">${UI.icon('flag')}${txt}</span>`;
}

function openProjectDialog(project) {
  const p = project ? U.clone(project) : { id: U.uid('p'), name: '', category: 'lernen', color: (Store.state.projects.length % 8) + 1, goalHours: null, deadline: null, notes: '', archived: false };
  UI.form({
    title: project ? 'Projekt bearbeiten' : 'Neues Projekt',
    submitLabel: project ? 'Speichern' : 'Anlegen',
    body: `
      <div class="field"><label for="pdName">Name</label><input id="pdName" name="name" required maxlength="80" value="${U.esc(p.name)}" placeholder="z. B. Signalverarbeitung" autofocus></div>
      <fieldset class="field"><legend>Kategorie</legend><div class="seg seg-radio">
        ${CAT_KEYS.map((c) => `<label class="seg-btn"><input type="radio" name="category" value="${c}"${p.category === c ? ' checked' : ''}><span>${CATS[c].label}</span></label>`).join('')}
      </div></fieldset>
      <fieldset class="field"><legend>Farbe</legend><div class="swatches">
        ${PROJECT_COLORS.map((name, i) => `<label class="swatch" style="--pc: var(--pc-${i + 1})" title="${name}"><input type="radio" name="color" value="${i + 1}"${+p.color === i + 1 ? ' checked' : ''}><span class="sr-only">${name}</span></label>`).join('')}
      </div></fieldset>
      <div class="field-row">
        <div class="field"><label for="pdGoal">Zielzeit (Stunden, optional)</label><input id="pdGoal" name="goalHours" type="number" min="0" max="5000" step="0.5" inputmode="decimal" value="${p.goalHours ?? ''}" placeholder="z. B. 60"></div>
        <div class="field"><label for="pdDeadline">Termin (optional)</label><input id="pdDeadline" name="deadline" type="date" value="${p.deadline || ''}"></div>
      </div>
      <div class="field"><label for="pdNotes">Notizen</label><textarea id="pdNotes" name="notes" rows="2" maxlength="2000">${U.esc(p.notes || '')}</textarea></div>
      ${project ? `<label class="switch"><input type="checkbox" name="archived"${p.archived ? ' checked' : ''}><span>Archiviert (aus Listen ausblenden)</span></label>` : ''}`,
    extraFooter: project ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="deleteProject" data-id="${p.id}">${UI.icon('trash')}Löschen</button>` : '',
    onSubmit(fd) {
      p.name = String(fd.get('name') || '').trim();
      if (!p.name) return false;
      p.category = CATS[fd.get('category')] ? fd.get('category') : 'sonstiges';
      p.color = U.clamp(parseInt(fd.get('color'), 10) || 1, 1, 8);
      const g = parseFloat(fd.get('goalHours'));
      p.goalHours = g > 0 ? g : null;
      p.deadline = fd.get('deadline') || null;
      p.notes = String(fd.get('notes') || '');
      if (project) p.archived = fd.get('archived') === 'on';
      Store.saveProject(p);
      if (!project) { App.ui.projectId = p.id; App.saveUi(); UI.toast('Projekt angelegt'); }
      return true;
    },
  });
}
