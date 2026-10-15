/* Gemeinsame UI-Bausteine: Icons, Dialoge, Toasts, Tooltip, Datei-Download,
 * wiederverwendbare Render-Helfer (Aufgabenzeile, Chips, Zifferblatt, Maskottchen). */
'use strict';

const Views = {};

const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = U.esc;
  const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  /* ---------- Dialoge ---------- */
  let onCloseCb = null;
  let cancelBound = false;
  const fireClose = () => { const cb = onCloseCb; onCloseCb = null; if (cb) cb(); };
  function openDialog({ title, body, footer, wide = false, onOpen, onSubmit }) {
    const dlg = $('#dlg');
    if (!cancelBound) { cancelBound = true; dlg.addEventListener('cancel', fireClose); }
    if (dlg.open) closeDialog();
    dlg.className = `dlg${wide ? ' dlg-wide' : ''}`;
    dlg.innerHTML = `<form class="dlg-form" method="dialog">
      <header class="dlg-head"><h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Schliessen">${icon('x')}</button></header>
      <div class="dlg-body">${body}</div>
      <footer class="dlg-foot">${footer}</footer></form>`;
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      const res = onSubmit(new FormData(form), form, e.submitter);
      if (res !== false) closeDialog();
    });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog()));
    if (onOpen) onOpen(form, dlg);
    dlg.showModal();
    const first = form.querySelector('[autofocus]');
    if (first && !U.isTouch) first.focus();
    return dlg;
  }
  /** Schliesst den Dialog; der Abbruch-Callback läuft synchron (kein verspätetes close-Ereignis) */
  function closeDialog() {
    const dlg = $('#dlg');
    fireClose();
    if (dlg.open) dlg.close();
  }

  /** Formular-Dialog */
  function form({ title, body, submitLabel = 'Speichern', danger = false, wide = false, extraFooter = '', onSubmit, onOpen }) {
    return openDialog({
      title, body, wide, onOpen, onSubmit,
      footer: `${extraFooter}<span class="grow"></span>
        <button type="button" class="btn btn-ghost" data-close>Abbrechen</button>
        <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>`,
    });
  }

  /** Auswahl-Dialog → Promise mit value oder null */
  function choice({ title, text, buttons }) {
    return new Promise((resolve) => {
      let done = false;
      openDialog({
        title,
        body: `<p class="dlg-text">${esc(text)}</p>`,
        footer: `<span class="grow"></span>${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || 'btn-ghost'}" data-choice="${i}">${esc(b.label)}</button>`).join('')}`,
        onOpen(f) {
          f.querySelectorAll('[data-choice]').forEach((el) => el.addEventListener('click', () => {
            done = true; resolve(buttons[+el.dataset.choice].value); closeDialog();
          }));
        },
      });
      onCloseCb = () => { if (!done) resolve(null); };
    });
  }
  const confirm = (text, { title = 'Bist du sicher?', ok = 'OK', danger = false } = {}) =>
    choice({ title, text, buttons: [{ label: 'Abbrechen', value: false }, { label: ok, value: true, kind: danger ? 'btn-danger' : 'btn-primary' }] })
      .then((v) => v === true);

  /* ---------- Toasts ---------- */
  function toast(msg, { action, timeout = 4500 } = {}) {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    const span = document.createElement('span');
    span.textContent = msg;
    el.append(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-btn';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.fn(); el.remove(); });
      el.append(b);
    }
    host.append(el);
    setTimeout(() => el.classList.add('is-out'), timeout);
    setTimeout(() => el.remove(), timeout + 350);
  }

  /* ---------- Tooltip (Diagramme) ---------- */
  function showTip(target, build) {
    const tip = $('#tip');
    tip.replaceChildren();
    build(tip);
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth; const th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = U.clamp(x, 8, window.innerWidth - tw - 8);
    let y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  const hideTip = () => { $('#tip').hidden = true; };

  /* ---------- Dateien & Zwischenablage ---------- */
  async function saveFile(filename, data, mime = 'application/octet-stream') {
    if (window.claude && typeof window.claude.use === 'function') {
      let dl = null;
      try { dl = await window.claude.use('downloads'); } catch { dl = null; }
      if (dl) {
        try { await dl.save({ filename, data }); return true; } catch (e) {
          if (e && e.code === 'declined') return false;
          toast('Download ist in dieser Ansicht nicht möglich.');
          return false;
        }
      }
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }
  function copy(text, selectEl) {
    const fallback = () => {
      if (!selectEl) { toast('Kopieren ist hier nicht möglich.'); return; }
      const r = document.createRange();
      r.selectNodeContents(selectEl);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      toast('Text markiert – mit Strg+C kopieren');
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast('In die Zwischenablage kopiert'), fallback);
    } catch { fallback(); }
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept;
      inp.addEventListener('change', () => resolve(inp.files && inp.files[0] ? inp.files[0] : null));
      inp.click();
    });
  }

  /* ---------- Render-Helfer ---------- */
  const projChip = (p) => (p ? `<span class="pchip" style="--pc: var(--pc-${p.color || 1})"><i></i>${esc(p.name)}</span>` : '');
  const catChip = (c) => `<span class="cchip" style="--cc: var(--cat-${c})"><i></i>${esc(CATS[c]?.label || c)}</span>`;

  function pomoDots(done, est) {
    const max = 8;
    const total = Math.max(est, done);
    const shown = Math.min(total, max);
    let s = '';
    for (let i = 0; i < shown; i++) s += `<i class="${i < done ? (i >= est ? 'is-over' : 'is-on') : ''}"></i>`;
    if (total > max) s += `<b>+${total - max}</b>`;
    return `<span class="pdots" title="${done} von ${est} Pomodoros" aria-label="${done} von ${est} Pomodoros">${s}</span>`;
  }

  function taskRow(t, { showDate = true, showProject = true, draggable = false } = {}) {
    const st = Store.taskStats(t.id);
    const p = Store.project(t.projectId);
    const isTarget = Store.state.timer.target === `t:${t.id}`;
    const overdue = !t.done && t.date && t.date < U.todayKey();
    const meta = [];
    if (showProject && p) meta.push(projChip(p));
    if (showDate && t.date) meta.push(`<span class="meta ${overdue ? 'is-overdue' : ''}">${icon('calendar')}${overdue ? 'überfällig · ' : ''}${U.relDay(t.date)}${t.time ? ` · ${t.time}` : ''}</span>`);
    else if (t.time) meta.push(`<span class="meta">${icon('clock')}${t.time}</span>`);
    if (st.sec) meta.push(`<span class="meta">${icon('timer')}${U.fmtDur(st.sec)}</span>`);
    return `<li class="task${t.done ? ' is-done' : ''}${isTarget ? ' is-target' : ''}" data-task="${t.id}"${draggable ? ' draggable="true"' : ''}>
      <label class="check"><input type="checkbox" data-change="taskDone" data-id="${t.id}"${t.done ? ' checked' : ''}><span class="check-box" aria-hidden="true">${icon('check')}</span><span class="sr-only">Erledigt: ${esc(t.title)}</span></label>
      <button type="button" class="task-main" data-act="editTask" data-id="${t.id}"><span class="task-title">${esc(t.title)}</span>${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}</button>
      ${pomoDots(st.pomos, t.estimate || 1)}
      ${t.done ? '<span class="play-gap"></span>' : `<button type="button" class="icon-btn play-btn${isTarget ? ' is-on' : ''}" data-act="focusTask" data-id="${t.id}" title="Mit dieser Aufgabe fokussieren" aria-label="Fokussieren: ${esc(t.title)}">${icon('play')}</button>`}
    </li>`;
  }

  function projectOptions(sel, none = 'Ohne Projekt') {
    return `<option value="">${esc(none)}</option>${Store.projects().map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  }

  function targetOptions(sel) {
    const today = U.todayKey();
    const open = Store.state.tasks.filter((t) => !t.done);
    const todays = open.filter((t) => t.date && t.date <= today).sort(taskSort);
    const others = open.filter((t) => !(t.date && t.date <= today))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const opt = (v, label) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`;
    const tl = (t) => { const p = Store.project(t.projectId); return p ? `${t.title} · ${p.name}` : t.title; };
    let h = opt('', 'Ohne Zuordnung');
    if (sel && sel.startsWith('t:') && !open.some((t) => `t:${t.id}` === sel)) {
      const t = Store.task(sel.slice(2));
      if (t) h += opt(sel, `${tl(t)} (erledigt)`);
    }
    if (todays.length) h += `<optgroup label="Für heute geplant">${todays.map((t) => opt(`t:${t.id}`, tl(t))).join('')}</optgroup>`;
    if (others.length) h += `<optgroup label="Weitere offene Aufgaben">${others.map((t) => opt(`t:${t.id}`, tl(t))).join('')}</optgroup>`;
    const ps = Store.projects();
    if (ps.length) h += `<optgroup label="Nur Projekt">${ps.map((p) => opt(`p:${p.id}`, p.name)).join('')}</optgroup>`;
    h += `<optgroup label="Nur Kategorie">${CAT_KEYS.map((c) => opt(`c:${c}`, CATS[c].label)).join('')}</optgroup>`;
    return h;
  }

  /* Zifferblatt wie bei einer Küchenuhr: 60 Striche, Bogen = verbleibender Anteil */
  let ticksCache = '';
  function dial(prefix = '') {
    if (!ticksCache) {
      for (let i = 0; i < 60; i++) {
        const a = (i * 6 * Math.PI) / 180;
        const major = i % 5 === 0;
        const r1 = 152; const r2 = major ? 140 : 146;
        const p = (r) => `${(160 + r * Math.sin(a)).toFixed(1)} ${(160 - r * Math.cos(a)).toFixed(1)}`;
        const [x1, y1] = p(r1).split(' '); const [x2, y2] = p(r2).split(' ');
        ticksCache += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${major ? 'tk tk-major' : 'tk'}"></line>`;
      }
    }
    const C = (2 * Math.PI * 126).toFixed(2);
    return `<svg class="dial" viewBox="0 0 320 320" aria-hidden="true">
      <g class="dial-ticks">${ticksCache}</g>
      <circle class="dial-track" cx="160" cy="160" r="126"></circle>
      <circle class="dial-arc" id="${prefix}arc" cx="160" cy="160" r="126" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 160 160)"></circle>
      <circle class="dial-knob" id="${prefix}knob" cx="160" cy="34" r="8"></circle>
    </svg>`;
  }
  function updateDial(root, frac, prefix = '') {
    const arc = root.getElementById ? root.getElementById(`${prefix}arc`) : root.querySelector(`#${prefix}arc`);
    const knob = root.getElementById ? root.getElementById(`${prefix}knob`) : root.querySelector(`#${prefix}knob`);
    if (!arc) return;
    const C = 2 * Math.PI * 126;
    const f = U.clamp(frac, 0, 1);
    arc.setAttribute('stroke-dashoffset', (C * (1 - f)).toFixed(2));
    if (knob) {
      const th = (f * 360 - 90) * (Math.PI / 180);
      knob.setAttribute('cx', (160 + 126 * Math.cos(th)).toFixed(2));
      knob.setAttribute('cy', (160 + 126 * Math.sin(th)).toFixed(2));
    }
  }

  /* Maskottchen für den Anime-Stil: Tomaten-Chan */
  function mascot(mood) {
    const eyes = {
      idle: '<ellipse cx="45" cy="66" rx="6.5" ry="8.5" class="m-ink"/><ellipse cx="75" cy="66" rx="6.5" ry="8.5" class="m-ink"/><circle cx="47.5" cy="62.5" r="2.6" class="m-white"/><circle cx="77.5" cy="62.5" r="2.6" class="m-white"/>',
      focus: '<ellipse cx="45" cy="67" rx="6.5" ry="7.5" class="m-ink"/><ellipse cx="75" cy="67" rx="6.5" ry="7.5" class="m-ink"/><circle cx="47.5" cy="64" r="2.4" class="m-white"/><circle cx="77.5" cy="64" r="2.4" class="m-white"/><path d="M36 53 L53 58 M84 53 L67 58" class="m-line"/>',
      paused: '<path d="M38 67 h13 M69 67 h13" class="m-line"/>',
      break: '<path d="M38 69 q6.5 -9 13 0 M69 69 q6.5 -9 13 0" class="m-line"/>',
      yay: '<path d="M45 58 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 6 -2.2z M75 58 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 6 -2.2z" class="m-ink"/>',
    };
    const mouth = {
      idle: '<path d="M53 80 q7 7 14 0" class="m-line"/>',
      focus: '<path d="M54 83 q6 -3 12 0" class="m-line"/>',
      paused: '<ellipse cx="60" cy="83" rx="3.5" ry="4" class="m-ink"/>',
      break: '<path d="M51 79 q9 12 18 0 z" class="m-mouth"/>',
      yay: '<path d="M49 78 q11 15 22 0 z" class="m-mouth"/>',
    };
    const extra = {
      paused: '<text x="92" y="34" class="m-zzz">z</text><text x="101" y="24" class="m-zzz m-zzz-2">z</text>',
      yay: '<path d="M14 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z M104 82 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" class="m-spark"/>',
      focus: '<path d="M98 50 q6 4 3 12 q-5 -2 -3 -12z" class="m-sweat"/>',
    };
    const m = eyes[mood] ? mood : 'idle';
    return `<svg class="mascot" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="70" rx="44" ry="39" class="m-body"/>
      <ellipse cx="42" cy="50" rx="10" ry="6" class="m-shine" transform="rotate(-25 42 50)"/>
      <path d="M60 22 l7 10 12 -4 -6 11 11 6 -13 2 -11 0 -13 -2 11 -6 -6 -11 12 4z" class="m-leaf"/>
      <path d="M60 22 q2 -8 7 -11" class="m-stem"/>
      <ellipse cx="34" cy="80" rx="7" ry="4" class="m-blush"/><ellipse cx="86" cy="80" rx="7" ry="4" class="m-blush"/>
      ${eyes[m]}${mouth[m]}${extra[m] || ''}
    </svg>`;
  }

  return {
    $, icon, openDialog, closeDialog, form, choice, confirm, toast, showTip, hideTip, saveFile, copy, pickFile,
    projChip, catChip, pomoDots, taskRow, projectOptions, targetOptions, dial, updateDial, mascot,
  };
})();
