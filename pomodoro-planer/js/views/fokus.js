/* Ansicht «Fokus»: Timer, aktuelle Aufgabe, heutige Aufgaben */
'use strict';

Views.fokus = {
  title: 'Fokus',
  render() {
    const st = Store.state;
    const x = st.timer;
    const set = st.settings;
    const { icon, esc } = { icon: UI.icon, esc: U.esc };
    const running = x.status === 'running';
    const active = x.status !== 'idle';
    const every = Math.max(1, set.longEvery || 4);
    const inRound = (x.cycle || 0) % every;
    const dots = Array.from({ length: every }, (_, i) => {
      const cls = i < inRound ? 'is-on' : i === inRound && x.phase === 'focus' ? 'is-now' : '';
      return `<i class="${cls}"></i>`;
    }).join('');
    const roundText = x.phase === 'focus'
      ? `Runde ${inRound + 1} von ${every}`
      : x.phase === 'long' ? 'Lange Pause verdient' : `Noch ${every - inRound} bis zur langen Pause`;

    const tg = Store.resolveTarget(x.target);
    const tStats = tg.taskId ? Store.taskStats(tg.taskId) : null;

    const today = U.todayKey();
    const todays = st.tasks.filter((t) => (t.date === today) || (!t.done && t.date && t.date < today)).sort((a, b) => {
      const oa = a.date < today ? 0 : 1; const ob = b.date < today ? 0 : 1;
      return oa - ob || taskSort(a, b);
    });
    const d0 = U.startOfDay(new Date());
    const daySessions = Store.sessionsBetween(d0, U.addDays(d0, 1));
    const daySec = U.sum(daySessions, (s) => s.sec);
    const dayPomos = daySessions.filter((s) => s.full).length;
    const byCat = CAT_KEYS.map((c) => [c, U.sum(daySessions.filter((s) => Store.sessionCat(s) === c), (s) => s.sec)]).filter(([, v]) => v > 0);
    const goal = (set.dailyGoalMin || 0) * 60;
    const goalPct = goal ? U.clamp(daySec / goal, 0, 1) : 0;
    const streak = Store.streak();

    const presetChips = (set.presets || []).map((p) => {
      const on = p.focus === set.focus && p.short === set.short && p.long === set.long && p.longEvery === set.longEvery;
      return `<button type="button" class="chip${on ? ' is-on' : ''}" data-act="applyPreset" data-id="${esc(p.id)}" aria-pressed="${on}">
        <b>${esc(p.name)}</b><span class="mono">${p.focus}·${p.short}·${p.long}</span></button>`;
    }).join('');

    const isAnime = document.documentElement.dataset.skin === 'anime';
    const mood = running ? (x.phase === 'focus' ? 'focus' : 'break') : active ? 'paused' : (App.flashMood || 'idle');
    const lines = {
      focus: ['Konzentration! 集中', 'Du schaffst das!', 'Nur noch diese Runde!'],
      break: ['Pause! Tee trinken~', 'Kurz strecken!', 'Augen entspannen ✿'],
      paused: ['Kurz verschnaufen …', 'Weiter mit Leertaste!'],
      idle: ['Bereit? Leertaste drücken!', 'Los geht’s!'],
      yay: ['Yatta! Geschafft! ✦', 'Super gemacht!'],
    };
    const say = lines[mood][(x.cycle || 0) % lines[mood].length];

    return `
    <div class="view-head">
      <div><p class="eyebrow">${U.fmtDayLong(new Date())}</p><h1>Fokus</h1></div>
      <div class="head-actions">
        <button type="button" class="btn btn-ghost" data-act="minimize" title="Minimieren (M)">${icon('minimize')}<span>Minimieren</span></button>
      </div>
    </div>
    <section class="focus-grid" data-phase="${x.phase}">
      <div class="card timer-card">
        ${isAnime ? '<div class="speedlines" aria-hidden="true"></div><div class="petals" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}
        <div class="phase-tabs" role="tablist" aria-label="Phase">
          ${['focus', 'short', 'long'].map((p) => `<button type="button" role="tab" class="phase-tab${p === x.phase ? ' is-on' : ''}" aria-selected="${p === x.phase}" data-act="phase" data-phase="${p}">
            ${PHASES[p].label}<span class="mono">${set[p]} min</span></button>`).join('')}
        </div>
        <div class="dial-wrap${running ? ' is-running' : ''}">
          ${UI.dial()}
          <div class="dial-center">
            ${isAnime ? `<span class="kanji" aria-hidden="true">${PHASES[x.phase].kanji}</span>` : ''}
            <div class="clock mono" data-clock role="timer" aria-live="off">${U.fmtClock(Timer.remaining())}</div>
            <div class="dial-sub">${running ? PHASES[x.phase].label : active ? 'Pausiert' : 'Bereit'}</div>
          </div>
        </div>
        ${isAnime ? `<div class="mascot-wrap">${UI.mascot(mood)}<p class="bubble">${esc(say)}</p></div>` : ''}
        <div class="round"><span class="round-dots" aria-hidden="true">${dots}</span><span>${roundText}</span></div>
        <div class="controls">
          <button type="button" class="btn-round" data-act="adjust" data-min="-5" aria-label="5 Minuten weniger" title="5 Minuten weniger">−5</button>
          <button type="button" class="btn-start" data-act="toggle" aria-keyshortcuts="Space">
            ${icon(running ? 'pause' : 'play')}<span>${running ? 'Pause' : active ? 'Weiter' : 'Start'}</span></button>
          <button type="button" class="btn-round" data-act="adjust" data-min="5" aria-label="5 Minuten mehr" title="5 Minuten mehr">+5</button>
        </div>
        <div class="controls-2">
          ${x.phase === 'focus' && active ? `<button type="button" class="btn btn-ghost" data-act="finish" title="Taste F">${icon('check')}Fertig &amp; speichern</button>` : ''}
          ${x.phase !== 'focus' ? `<button type="button" class="btn btn-ghost" data-act="skip" title="Taste S">${icon('skip')}Pause überspringen</button>` : ''}
          ${active ? `<button type="button" class="btn btn-ghost" data-act="reset">${icon('reset')}Zurücksetzen</button>` : ''}
          <span class="kbd-hint"><kbd>Leertaste</kbd> Start/Pause</span>
        </div>
        <div class="presets" role="group" aria-label="Vorlagen">${presetChips}
          <button type="button" class="chip chip-link" data-act="go" data-view="einstellungen">${icon('sliders')}Anpassen</button>
        </div>
      </div>

      <div class="focus-side">
        <div class="card target-card">
          <label class="label" for="targetSel">Woran arbeitest du?</label>
          <select id="targetSel" data-change="target">${UI.targetOptions(x.target)}</select>
          <div class="target-info">
            ${tg.project ? UI.projChip(tg.project) : ''}${UI.catChip(tg.category)}
            ${tStats ? `<span class="target-progress">${UI.pomoDots(tStats.pomos, tg.task.estimate || 1)}<span class="muted">${U.fmtDur(tStats.sec)}</span></span>` : ''}
            ${tg.task && !tg.task.done ? `<button type="button" class="btn btn-ghost btn-sm" data-act="doneTarget">${icon('check')}Erledigt</button>` : ''}
          </div>
        </div>

        <div class="card today-card">
          <div class="card-head">
            <h2>Heute</h2>
            <span class="muted">${streak > 1 ? `${streak} Tage in Folge` : ''}</span>
          </div>
          <div class="today-sum">
            <div class="today-big"><span class="big-num">${U.fmtDur(daySec)}</span><span class="muted"> fokussiert · ${dayPomos} Pomodoro${dayPomos === 1 ? '' : 's'}</span></div>
            ${goal ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(daySec)}" aria-label="Tagesziel"><i style="width:${(goalPct * 100).toFixed(1)}%"></i></div>
            <div class="meter-label muted"><span>Tagesziel ${U.fmtDur(goal)}</span><span>${U.pct(daySec, goal)} %</span></div>` : ''}
            ${byCat.length ? `<div class="cat-line">${byCat.map(([c, v]) => `<span>${UI.catChip(c)} <span class="mono">${U.fmtHM(v)}</span></span>`).join('')}</div>` : ''}
          </div>
          ${todays.length ? `<ul class="task-list">${todays.map((t) => UI.taskRow(t, { showDate: t.date !== today })).join('')}</ul>`
            : `<p class="empty-line">Für heute ist nichts geplant. Füge unten eine Aufgabe hinzu oder plane im <button type="button" class="link" data-act="go" data-view="kalender">Kalender</button>.</p>`}
          <form class="quick-add" data-form="quickTask" autocomplete="off">
            <input type="hidden" name="date" value="${today}">
            <label class="sr-only" for="qtTitle">Neue Aufgabe für heute</label>
            <input id="qtTitle" name="title" data-keep placeholder="Aufgabe für heute …" required maxlength="140">
            <label class="sr-only" for="qtProject">Projekt</label>
            <select id="qtProject" name="projectId" data-keep>${UI.projectOptions(App.ui.lastProject || '')}</select>
            <label class="sr-only" for="qtEst">Geschätzte Pomodoros</label>
            <input id="qtEst" name="estimate" data-keep type="number" min="1" max="20" value="1" inputmode="numeric" title="Geschätzte Pomodoros">
            <button type="submit" class="icon-btn icon-btn-solid" aria-label="Hinzufügen">${icon('plus')}</button>
          </form>
        </div>
      </div>
    </section>`;
  },
};
