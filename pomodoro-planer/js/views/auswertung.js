/* Ansicht «Auswertung»: Lern- und Arbeitszeit nach Zeitraum, Projekten,
 * Zusammenfassung als Text, Protokoll mit Nachtragen und CSV-Export */
'use strict';

const CAT_SERIES = CAT_KEYS.map((c) => ({ key: c, label: CATS[c].label, color: `var(--cat-${c})` }));

function statsRange(range, anchorKey) {
  const a = U.parseKey(anchorKey);
  if (range === 'day') {
    const s = U.startOfDay(a);
    return { start: s, end: U.addDays(s, 1), label: U.fmtDayLong(s), prevLabel: 'Vortag', unit: 'hour' };
  }
  if (range === 'month') {
    const s = U.startOfMonth(a);
    return { start: s, end: U.addMonths(s, 1), label: `${U.MONTHS[s.getMonth()]} ${s.getFullYear()}`, prevLabel: 'Vormonat', unit: 'day' };
  }
  if (range === 'year') {
    const s = U.startOfYear(a);
    return { start: s, end: new Date(s.getFullYear() + 1, 0, 1), label: String(s.getFullYear()), prevLabel: 'Vorjahr', unit: 'month' };
  }
  const s = U.startOfWeek(a);
  const e = U.addDays(s, 7);
  return { start: s, end: e, label: `KW ${U.isoWeek(s)} · ${U.fmtDate(s).slice(0, 6)}–${U.fmtDate(U.addDays(s, 6))}`, prevLabel: 'Vorwoche', unit: 'day' };
}

function shiftAnchor(range, key, d) {
  const a = U.parseKey(key);
  if (range === 'day') return U.dateKey(U.addDays(a, d));
  if (range === 'week') return U.dateKey(U.addDays(a, 7 * d));
  if (range === 'month') return U.dateKey(U.addMonths(a, d));
  return U.dateKey(new Date(a.getFullYear() + d, 0, 1));
}

function summarize(range, anchorKey) {
  const R = statsRange(range, anchorKey);
  const sessions = Store.sessionsBetween(R.start, R.end);
  const prevStart = U.parseKey(shiftAnchor(range, anchorKey, -1));
  const PR = statsRange(range, U.dateKey(prevStart));
  const prevSec = U.sum(Store.sessionsBetween(PR.start, PR.end), (s) => s.sec);
  const total = U.sum(sessions, (s) => s.sec);
  const byCat = Object.fromEntries(CAT_KEYS.map((c) => [c, 0]));
  const byProject = new Map();
  sessions.forEach((s) => {
    const c = Store.sessionCat(s);
    byCat[c] += s.sec;
    const p = Store.sessionProject(s);
    const k = p ? p.id : `~${c}`;
    if (!byProject.has(k)) byProject.set(k, { project: p, cat: c, sec: 0, pomos: 0 });
    const e = byProject.get(k); e.sec += s.sec; if (s.full) e.pomos++;
  });
  const days = new Set(sessions.map((s) => U.dateKey(s.start)));
  const doneTasks = Store.state.tasks.filter((t) => t.done && t.doneAt >= +R.start && t.doneAt < +R.end);
  // Säulen
  const buckets = [];
  if (R.unit === 'hour') {
    for (let h = 0; h < 24; h++) buckets.push({ label: h % 3 === 0 ? String(h) : '', sub: `${U.pad2(h)}:00–${U.pad2(h + 1)}:00`, values: {} });
    sessions.forEach((s) => {
      // auf Stunden verteilen
      let t = s.start;
      const end = s.start + s.sec * 1000;
      while (t < end) {
        const d = new Date(t);
        const next = new Date(d); next.setMinutes(60, 0, 0);
        const part = (Math.min(end, +next) - t) / 1000;
        if (d >= R.start && d < R.end) {
          const b = buckets[d.getHours()];
          const c = Store.sessionCat(s);
          b.values[c] = (b.values[c] || 0) + part;
        }
        t = +next;
      }
    });
  } else if (R.unit === 'day') {
    const n = U.daysBetween(R.start, R.end);
    for (let i = 0; i < n; i++) {
      const d = U.addDays(R.start, i);
      const dn = d.getDate();
      buckets.push({ label: range === 'week' ? U.WD[i] : (dn === 1 || dn % 5 === 0 ? String(dn) : ''), sub: U.fmtDayLong(d), values: {}, key: U.dateKey(d) });
    }
    sessions.forEach((s) => {
      const i = U.daysBetween(R.start, new Date(s.start));
      const c = Store.sessionCat(s);
      if (buckets[i]) buckets[i].values[c] = (buckets[i].values[c] || 0) + s.sec;
    });
  } else {
    const MS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    for (let m = 0; m < 12; m++) buckets.push({ label: MS[m], sub: `${U.MONTHS[m]} ${R.start.getFullYear()}`, values: {} });
    sessions.forEach((s) => {
      const m = new Date(s.start).getMonth();
      const c = Store.sessionCat(s);
      buckets[m].values[c] = (buckets[m].values[c] || 0) + s.sec;
    });
  }
  return { R, PR, sessions, total, prevSec, byCat, byProject: [...byProject.values()].sort((a, b) => b.sec - a.sec), days, doneTasks, buckets, pomos: sessions.filter((s) => s.full).length };
}

function summaryText(sum) {
  const lines = [];
  lines.push(`Auswertung ${sum.R.label}`);
  lines.push(`Fokuszeit total: ${U.fmtDur(sum.total)} · ${sum.pomos} Pomodoros · ${sum.days.size} aktive${sum.days.size === 1 ? 'r' : ''} Tag${sum.days.size === 1 ? '' : 'e'}`);
  CAT_KEYS.forEach((c) => {
    const v = sum.byCat[c];
    if (!v) return;
    lines.push('');
    lines.push(`${CATS[c].label}: ${U.fmtDur(v)} (${U.pct(v, sum.total)} %)`);
    sum.byProject.filter((e) => e.cat === c).forEach((e) => {
      lines.push(`  – ${e.project ? e.project.name : 'Ohne Projekt'}: ${U.fmtDur(e.sec)}`);
    });
  });
  if (sum.doneTasks.length) {
    lines.push('');
    lines.push(`Erledigte Aufgaben (${sum.doneTasks.length}):`);
    sum.doneTasks.forEach((t) => { const p = Store.project(t.projectId); lines.push(`  ✓ ${t.title}${p ? ` (${p.name})` : ''}`); });
  }
  return lines.join('\n');
}

Views.auswertung = {
  title: 'Auswertung',
  render() {
    const st = App.ui.stats;
    const sum = summarize(st.range, st.anchor);
    const seg = (v, t) => `<button type="button" class="seg-btn${st.range === v ? ' is-on' : ''}" aria-pressed="${st.range === v}" data-act="statsRange" data-v="${v}">${t}</button>`;
    const delta = sum.total - sum.prevSec;
    const deltaTxt = sum.prevSec || sum.total
      ? `${delta >= 0 ? '+' : '−'}${U.fmtDur(Math.abs(delta))} ggü. ${sum.R.prevLabel}`
      : '';
    const activeDays = sum.days.size;
    const chart = Charts.columns({
      id: 'stats',
      buckets: sum.buckets,
      series: CAT_SERIES,
    });
    const maxP = Math.max(1, ...sum.byProject.map((e) => e.sec));
    const projRows = sum.byProject.map((e) => {
      const name = e.project ? e.project.name : `Ohne Projekt (${CATS[e.cat].label})`;
      const color = e.project ? `var(--pc-${e.project.color || 1})` : `var(--cat-${e.cat})`;
      return `<li class="pb-row">
        ${e.project ? `<button type="button" class="pb-name link" data-act="openProject" data-id="${e.project.id}">${U.esc(name)}</button>` : `<span class="pb-name">${U.esc(name)}</span>`}
        <span class="pb-bar"><i style="width:${((e.sec / maxP) * 100).toFixed(1)}%;background:${color}"></i></span>
        <span class="pb-val mono">${U.fmtHM(e.sec)}</span>
        <span class="pb-pct muted mono">${U.pct(e.sec, sum.total)} %</span>
      </li>`;
    }).join('');
    const log = sum.sessions.slice().sort((a, b) => b.start - a.start);
    const logRows = log.slice(0, App.ui.logLimit || 50).map((s) => {
      const p = Store.sessionProject(s);
      return `<tr>
        <td class="mono nowrap">${U.fmtDay(s.start)}</td>
        <td class="mono nowrap">${U.fmtTime(s.start)}–${U.fmtTime(s.end)}</td>
        <td class="mono nowrap num">${U.fmtHM(s.sec)}</td>
        <td><span class="log-title">${U.esc(Store.sessionLabel(s))}</span>${p ? ` ${UI.projChip(p)}` : ` ${UI.catChip(Store.sessionCat(s))}`}${s.note ? `<div class="muted small">${U.esc(s.note)}</div>` : ''}</td>
        <td class="nowrap">${s.manual ? '<span class="badge">nachgetragen</span>' : s.full ? '<span class="badge badge-pomo">Pomodoro</span>' : '<span class="badge">Teil</span>'}</td>
        <td class="nowrap"><button type="button" class="icon-btn sm" data-act="editSession" data-id="${s.id}" aria-label="Eintrag bearbeiten">${UI.icon('edit')}</button></td>
      </tr>`;
    }).join('');
    const tableRows = sum.buckets.map((b) => {
      const tot = U.sum(CAT_KEYS, (c) => b.values[c] || 0);
      if (!tot && sum.R.unit === 'hour') return '';
      return `<tr><td>${U.esc(b.sub || b.label)}</td>${CAT_KEYS.map((c) => `<td class="mono num">${U.fmtHM(b.values[c] || 0)}</td>`).join('')}<td class="mono num"><b>${U.fmtHM(tot)}</b></td></tr>`;
    }).join('');

    return `
    <div class="view-head">
      <div><p class="eyebrow">Auswertung</p><h1>${U.esc(sum.R.label)}</h1></div>
      <div class="head-actions">
        <div class="seg" role="group" aria-label="Zeitraum">${seg('day', 'Tag')}${seg('week', 'Woche')}${seg('month', 'Monat')}${seg('year', 'Jahr')}</div>
        <div class="pager">
          <button type="button" class="icon-btn" data-act="statsNav" data-d="-1" aria-label="Zurück">${UI.icon('chevron-left')}</button>
          <button type="button" class="btn btn-ghost" data-act="statsToday">Aktuell</button>
          <button type="button" class="icon-btn" data-act="statsNav" data-d="1" aria-label="Weiter">${UI.icon('chevron-right')}</button>
        </div>
      </div>
    </div>
    <div class="tiles">
      <div class="tile tile-hero"><span class="tile-label">Fokuszeit</span><span class="tile-value">${U.fmtDur(sum.total)}</span>
        <span class="tile-sub${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}">${deltaTxt}</span></div>
      ${CAT_KEYS.filter((c) => c !== 'sonstiges' || sum.byCat[c]).map((c) => `<div class="tile"><span class="tile-label">${UI.catChip(c)}</span><span class="tile-value">${U.fmtDur(sum.byCat[c])}</span><span class="tile-sub">${U.pct(sum.byCat[c], sum.total)} % der Fokuszeit</span></div>`).join('')}
      <div class="tile"><span class="tile-label">Pomodoros</span><span class="tile-value">${sum.pomos}</span><span class="tile-sub">${activeDays} aktive${activeDays === 1 ? 'r' : ''} Tag${activeDays === 1 ? '' : 'e'}${activeDays ? ` · Ø ${U.fmtDur(sum.total / activeDays)}` : ''}</span></div>
      <div class="tile"><span class="tile-label">Erledigt</span><span class="tile-value">${sum.doneTasks.length}</span><span class="tile-sub">Aufgabe${sum.doneTasks.length === 1 ? '' : 'n'}</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Verlauf</h2><span class="muted">${{ day: 'pro Stunde', week: 'pro Tag', month: 'pro Tag', year: 'pro Monat' }[st.range]}</span></div>
      ${sum.total ? chart : '<p class="empty-line">In diesem Zeitraum wurde noch keine Zeit erfasst. Starte den Timer oder trage Zeit nach.</p>'}
      ${sum.total ? `<details class="table-details"><summary>Werte als Tabelle</summary><div class="table-wrap"><table class="table">
        <thead><tr><th>Zeitraum</th>${CAT_KEYS.map((c) => `<th class="num">${CATS[c].label}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${tableRows}</tbody></table></div></details>` : ''}
    </section>
    <div class="two-col">
      <section class="card">
        <div class="card-head"><h2>Nach Projekt</h2><span class="muted">${sum.byProject.length}</span></div>
        ${sum.byProject.length ? `<ul class="pb-list">${projRows}</ul>` : '<p class="empty-line">Noch keine Daten.</p>'}
      </section>
      <section class="card summary-card">
        <div class="card-head"><h2>Zusammenfassung</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-act="copySummary">${UI.icon('copy')}Kopieren</button></div>
        <pre class="summary" id="summaryText">${U.esc(summaryText(sum))}</pre>
      </section>
    </div>
    <section class="card">
      <div class="card-head"><h2>Protokoll</h2>
        <div class="row-gap">
          <button type="button" class="btn btn-ghost btn-sm" data-act="exportCsv">${UI.icon('download')}CSV</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="addSession">${UI.icon('plus')}Zeit nachtragen</button>
        </div></div>
      ${log.length ? `<div class="table-wrap"><table class="table log-table">
        <thead><tr><th>Tag</th><th>Zeit</th><th class="num">Dauer</th><th>Aufgabe / Projekt</th><th>Art</th><th><span class="sr-only">Aktionen</span></th></tr></thead>
        <tbody>${logRows}</tbody></table></div>
        ${log.length > (App.ui.logLimit || 50) ? `<button type="button" class="btn btn-ghost" data-act="moreLog">Weitere ${log.length - (App.ui.logLimit || 50)} anzeigen</button>` : ''}`
        : '<p class="empty-line">Keine Einträge in diesem Zeitraum.</p>'}
    </section>`;
  },
};

/** Dialog: Zeit nachtragen / Eintrag bearbeiten */
function openSessionDialog(session) {
  const s = session ? U.clone(session) : null;
  const now = new Date();
  const start = s ? new Date(s.start) : new Date(now.getTime() - 25 * 60000);
  const target = s ? (s.taskId && Store.task(s.taskId) ? `t:${s.taskId}` : s.projectId && Store.project(s.projectId) ? `p:${s.projectId}` : `c:${Store.sessionCat(s)}`) : Store.state.timer.target;
  UI.form({
    title: s ? 'Eintrag bearbeiten' : 'Zeit nachtragen',
    submitLabel: s ? 'Speichern' : 'Eintragen',
    body: `
      <div class="field-row">
        <div class="field"><label for="sdDate">Datum</label><input id="sdDate" name="date" type="date" required value="${U.dateKey(start)}"></div>
        <div class="field field-s"><label for="sdStart">Beginn</label><input id="sdStart" name="start" type="time" required value="${U.fmtTime(start)}"></div>
        <div class="field field-s"><label for="sdDur">Minuten</label><input id="sdDur" name="minutes" type="number" min="1" max="1440" required inputmode="numeric" value="${s ? Math.round(s.sec / 60) : 25}"></div>
      </div>
      <div class="field"><label for="sdTarget">Zuordnung</label><select id="sdTarget" name="target">${UI.targetOptions(target)}</select></div>
      <div class="field"><label for="sdNote">Notiz</label><input id="sdNote" name="note" maxlength="300" value="${U.esc(s ? s.note || '' : '')}" placeholder="z. B. Vorlesung, Gruppenarbeit"></div>
      <label class="switch"><input type="checkbox" name="full"${!s || s.full ? '' : ''}${s && s.full ? ' checked' : ''}><span>Als Pomodoro zählen</span></label>`,
    extraFooter: s ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="deleteSession" data-id="${s.id}">${UI.icon('trash')}Löschen</button>` : '',
    onSubmit(fd) {
      const startMs = U.atTime(fd.get('date'), fd.get('start'));
      const sec = U.clamp(parseInt(fd.get('minutes'), 10) || 0, 1, 1440) * 60;
      const tg = Store.resolveTarget(fd.get('target'));
      const rec = s || { id: U.uid('s'), manual: true };
      const prevStart = s ? s.start : null;
      Object.assign(rec, {
        start: startMs, end: startMs + sec * 1000, sec, full: fd.get('full') === 'on',
        taskId: tg.taskId, projectId: tg.projectId, category: tg.category,
        title: tg.taskId || tg.projectId ? tg.title : '', note: String(fd.get('note') || '').trim(),
      });
      Store.saveSession(rec, prevStart);
      UI.toast(s ? 'Eintrag gespeichert' : `${U.fmtDur(sec)} nachgetragen`);
      return true;
    },
  });
}

function sessionsCsv(sessions) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Datum', 'Beginn', 'Ende', 'Minuten', 'Kategorie', 'Projekt', 'Aufgabe', 'Pomodoro', 'Nachgetragen', 'Notiz'];
  const rows = sessions.slice().sort((a, b) => a.start - b.start).map((s) => {
    const p = Store.sessionProject(s);
    const t = Store.task(s.taskId);
    return [U.fmtDate(s.start), U.fmtTime(s.start), U.fmtTime(s.end), (s.sec / 60).toFixed(1), CATS[Store.sessionCat(s)].label,
      p ? p.name : '', t ? t.title : (s.title && !p ? s.title : (s.title && p && s.title !== p.name ? s.title : '')), s.full ? 'ja' : 'nein', s.manual ? 'ja' : 'nein', s.note || ''].map(q).join(';');
  });
  return `﻿${[head.map(q).join(';'), ...rows].join('\r\n')}`;
}
