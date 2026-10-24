/** Ansicht «Fokus»: Pomodoro oder Stechuhr, Zuordnung, heutige Aufgaben und Tagesbilanz */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TimerKind, TimerPhase } from '../data/types';
import { createTask } from '../app/actions';
import { prefs, setPrefs } from '../app/prefs';
import { go } from '../app/router';
import {
  openProjects, projectsById, sortedProjects, streak, taskSort, taskStats, tasksById, today, todayStats,
} from '../app/selectors';
import { app } from '../app/services';
import { settings, timerState, workspaceData } from '../app/store';
import { minimize } from '../app/pip';
import { PHASE_LABEL } from '../app/timer/controller';
import { flashMood, PHASE_ATTR, readTimer } from '../app/timer/view';
import { DIAL_STYLE, PhaseCutIn, SkinBackdrop, SkinBadge, SkinCompanion, SkinDialFx } from '../ui/components/SkinDecor';
import { Dial, DialHandle, MOOD_LINES } from '../ui/components/Dial';
import {
  Meter, PomoDots, ProjectChip, Seg, WORKSPACE_ICON, WORKSPACE_LABEL,
} from '../ui/components/bits';
import { completeTarget, finishSession } from '../ui/components/Mini';
import { openProjectDialog } from '../ui/components/ProjectDialog';
import { TaskRow } from '../ui/components/TaskRow';
import { confirmDialog } from '../ui/dialog';
import { Icon } from '../ui/Icon';
import { atTime, fmtClock, fmtDayLong, fmtDur, fmtHM, fmtTime, pct, plural } from '../ui/format';
import { toast } from '../ui/toast';

const KIND_OPTIONS: readonly { value: TimerKind; label: string; icon: 'timer' | 'stopwatch' }[] = [
  { value: 'pomodoro', label: 'Pomodoro', icon: 'timer' },
  { value: 'stopwatch', label: 'Stechuhr', icon: 'stopwatch' },
];

export function Fokus() {
  return (
    <>
      <div class="view-head">
        <div>
          <p class="eyebrow">{fmtDayLong(new Date())}</p>
          <h1>Fokus</h1>
        </div>
        <div class="head-actions">
          <span class="mode-badge"><Icon name={WORKSPACE_ICON[prefs.value.workspace]} />{WORKSPACE_LABEL[prefs.value.workspace]}</span>
          <button type="button" class="btn btn-ghost" title="Minimieren (M)" onClick={() => void minimize()}>
            <Icon name="minimize" /><span>Minimieren</span>
          </button>
        </div>
      </div>
      <FocusGrid />
    </>
  );
}

function FocusGrid() {
  // Nur die Phase lesen (nicht readTimer): sonst zeichnet die ganze Ansicht im Viertelsekundentakt neu
  const s = timerState.value;
  const phase = s.status === 'idle' && app().timer.kindFor(prefs.value.workspace) === 'stopwatch' ? 'focus' : s.phase;
  return (
    <section class="focus-grid" data-phase={PHASE_ATTR[phase]}>
      <TimerCard />
      <div class="focus-side">
        <TargetCard />
        <TodayCard />
      </div>
    </section>
  );
}

function TimerCard() {
  const v = readTimer();
  const s = timerState.value;
  const set = settings.value;
  const ws = prefs.value.workspace;
  const { timer } = app();
  const skin = prefs.value.skin;
  const yay = flashMood.value === 'yay';
  // Phasenwechsel: Welle durchs Zifferblatt und Einblendung (nicht beim ersten Anzeigen)
  const lastPhase = useRef(v.phase);
  const [cut, setCut] = useState<{ phase: TimerPhase; n: number; late: boolean } | null>(null);
  useEffect(() => {
    if (lastPhase.current === v.phase) return;
    lastPhase.current = v.phase;
    // Läuft gerade die Feier (Pomodoro geschafft), kommt die Einblendung erst danach
    setCut((c) => ({ phase: v.phase, n: (c?.n ?? 0) + 1, late: flashMood.peek() === 'yay' }));
  }, [v.phase]);
  // Zeiger ziehen (nur Pomodoro): Vorschau während des Ziehens, beim Loslassen auf die Sekunde genau
  const [dragFrac, setDragFrac] = useState<number | null>(null);
  const planned = v.plannedSec ?? 0;
  const restSec = v.frac * planned;
  /** Neue Restzeit für einen Zeiger-Anteil: ganze Sekunden, mindestens 5 s, höchstens 3 Stunden */
  const restFor = (f: number) => Math.min(180 * 60, Math.max(5, Math.round(f * planned)));
  const dragRest = dragFrac !== null ? restFor(dragFrac) : null;
  const shownClock = dragRest !== null ? fmtClock(dragRest) : v.clock;
  const every = Math.max(1, set.long_break_every);
  const inRound = s.cycle % every;
  const otherWs = v.active && s.workspace !== ws;

  const chooseKind = async (kind: TimerKind) => {
    setPrefs({ timerKind: { ...prefs.value.timerKind, [ws]: kind } });
    await timer.setKind(kind);
  };

  const reset = async () => {
    if (v.kind === 'pomodoro' && v.phase !== 'focus') { await timer.reset(); return; }
    if (v.elapsedSec >= 60 && !(await confirmDialog(`Die laufende Sitzung (${fmtDur(v.elapsedSec)}) wird verworfen und nicht gespeichert.`, { title: 'Zurücksetzen?', ok: 'Verwerfen', danger: true }))) return;
    await timer.reset();
  };

  const say = MOOD_LINES[v.mood][s.cycle % MOOD_LINES[v.mood].length];

  return (
    <div class="card timer-card">
      <SkinBackdrop skin={skin} v={v} cycle={s.cycle} />
      {cut && <PhaseCutIn key={cut.n} skin={skin} phase={cut.phase} late={cut.late} />}
      <div class="kind-row">
        <Seg
          label="Timer-Art" value={v.kind} options={KIND_OPTIONS} disabled={v.active}
          onChange={(k) => void chooseKind(k)}
        />
      </div>
      {v.kind === 'pomodoro' && (
        <div class="phase-tabs" role="tablist" aria-label="Phase">
          {(['focus', 'short_break', 'long_break'] as TimerPhase[]).map((p) => {
            const min = p === 'focus' ? set.focus_minutes : p === 'short_break' ? set.short_break_minutes : set.long_break_minutes;
            return (
              <button
                key={p} type="button" role="tab" class={`phase-tab${p === v.phase ? ' is-on' : ''}`} aria-selected={p === v.phase}
                disabled={v.active && p !== v.phase} onClick={() => void timer.setPhase(p)}
              >
                {PHASE_LABEL[p]}<span class="mono">{min} min</span>
              </button>
            );
          })}
        </div>
      )}
      <div class={`dial-wrap${v.running ? ' is-running' : ''}${prefs.value.showClock && dragFrac === null ? '' : dragFrac !== null ? ' is-dragging' : ' no-clock'}`}>
        <SkinDialFx skin={skin} />
        <Dial frac={dragFrac !== null ? Math.min(1, dragFrac) : v.frac} trail={v.kind === 'stopwatch' ? -1 : 1} {...DIAL_STYLE[skin]} />
        {v.kind === 'pomodoro' && planned > 0 && (
          <DialHandle
            frac={dragFrac ?? v.frac} seconds={Math.round(restSec)}
            label="Restzeit: Zeiger ziehen, Pfeiltasten ändern um 1 Minute, mit Umschalt um 10 Sekunden" valueText={fmtClock(restSec)}
            onDrag={setDragFrac}
            onCommit={(f) => { const target = restFor(f); if (Math.abs(target - restSec) >= 1) void timer.setRest(target); }}
            onStep={(m) => void timer.adjust(m)}
          />
        )}
        <div class="dial-center">
          <SkinBadge skin={skin} v={v} />
          <div class="clock mono" role="timer" aria-live="off">{shownClock.split('').map((ch, i) => <span key={`${i}-${ch}`} class="ch">{ch}</span>)}</div>
          <div class="dial-sub">{v.statusLabel}</div>
        </div>
        {cut && <div key={cut.n} class="phase-wave" aria-hidden="true" />}
      </div>
      <SkinCompanion skin={skin} v={v} say={say ?? ''} set={set} yay={yay} cycle={s.cycle} every={every} />
      {otherWs && <p class="ws-note">Dieser Timer läuft im Modus {WORKSPACE_LABEL[s.workspace]}.</p>}
      {v.kind === 'pomodoro'
        ? (
          <div class="round">
            <span class="round-dots" aria-hidden="true">
              {Array.from({ length: every }, (_, i) => (
                <i key={i} class={i < inRound ? 'is-on' : i === inRound && v.phase === 'focus' ? 'is-now' : ''} />
              ))}
            </span>
            <span>{v.phase === 'focus' ? `Runde ${inRound + 1} von ${every}` : v.phase === 'long_break' ? 'Lange Pause verdient' : `Noch ${every - inRound} bis zur langen Pause`}</span>
          </div>
        )
        : <StopwatchInfo />}
      <div class="controls">
        <button
          type="button" class="btn-round" aria-label="5 Minuten weniger" title={v.kind === 'stopwatch' ? '5 Minuten abziehen' : '5 Minuten weniger'}
          disabled={v.kind === 'stopwatch' && !v.active} onClick={() => void timer.adjust(-5)}
        >−5</button>
        <button type="button" class="btn-start" aria-keyshortcuts="Space" onClick={() => void timer.toggle()}>
          <Icon name={v.running ? 'pause' : 'play'} /><span>{v.running ? 'Pause' : v.active ? 'Weiter' : 'Start'}</span>
        </button>
        <button
          type="button" class="btn-round" aria-label="5 Minuten mehr" title={v.kind === 'stopwatch' ? '5 Minuten hinzufügen (zu spät gestartet)' : '5 Minuten mehr'}
          disabled={v.kind === 'stopwatch' && !v.active} onClick={() => void timer.adjust(5)}
        >+5</button>
      </div>
      <div class="controls-2">
        {v.phase === 'focus' && v.active && (
          <button type="button" class="btn btn-ghost" title="Taste F" onClick={() => void finishSession()}>
            <Icon name="check" />{v.kind === 'stopwatch' ? 'Stopp & speichern' : 'Fertig & speichern'}
          </button>
        )}
        {v.kind === 'pomodoro' && v.phase !== 'focus' && (
          <button type="button" class="btn btn-ghost" title="Taste S" onClick={() => void timer.skip()}><Icon name="skip" />Pause überspringen</button>
        )}
        {v.active && <button type="button" class="btn btn-ghost" onClick={() => void reset()}><Icon name="reset" />Zurücksetzen</button>}
        <span class="kbd-hint"><kbd>Leertaste</kbd> Start/Pause</span>
      </div>
      {v.kind === 'pomodoro' && <Presets />}
    </div>
  );
}

function StopwatchInfo() {
  const v = readTimer();
  const s = timerState.value;
  const [editing, setEditing] = useState(false);
  if (!v.active || s.session_started_at == null) {
    return <p class="stopwatch-sub">Läuft offen, bis du stoppst. Pausen zählen nicht mit.</p>;
  }
  const start = s.session_started_at;
  const setStart = async (hhmm: string) => {
    if (!hhmm) return;
    let ms = atTime(today.value, hhmm);
    if (ms > Date.now()) ms -= 86_400_000;
    await app().timer.setStartTime(ms);
    setEditing(false);
    toast(`Beginn auf ${fmtTime(ms)} gesetzt`);
  };
  return (
    <div class="stopwatch-sub">
      {editing
        ? (
          <>
            <label for="swStart">Begonnen um</label>
            <input id="swStart" type="time" defaultValue={fmtTime(start)} onChange={(e) => void setStart(e.currentTarget.value)} />
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Fertig</button>
          </>
        )
        : (
          <>
            <span>Seit {fmtTime(start)}{v.paused ? ' · pausiert' : ''}</span>
            <button type="button" class="link" onClick={() => setEditing(true)}>Beginn korrigieren</button>
          </>
        )}
    </div>
  );
}

function Presets() {
  const set = settings.value;
  const list = prefs.value.presets;
  const apply = async (id: string) => {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    await app().sync.saveSettings({
      focus_minutes: p.focus, short_break_minutes: p.short, long_break_minutes: p.long, long_break_every: p.longEvery,
    });
    await app().timer.resetPlanned();
    toast(`Vorlage «${p.name}»: ${p.focus} min Fokus, ${p.short} min Pause`);
  };
  return (
    <div class="presets" role="group" aria-label="Vorlagen">
      {list.map((p) => {
        const on = p.focus === set.focus_minutes && p.short === set.short_break_minutes
          && p.long === set.long_break_minutes && p.longEvery === set.long_break_every;
        return (
          <button key={p.id} type="button" class={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => void apply(p.id)}>
            <b>{p.name}</b><span class="mono">{p.focus}·{p.short}·{p.long}</span>
          </button>
        );
      })}
      <button type="button" class="chip chip-link" onClick={() => go('einstellungen')}><Icon name="sliders" />Anpassen</button>
    </div>
  );
}

function TargetCard() {
  const s = timerState.value;
  const wd = workspaceData.value;
  const t = today.value;
  const open = wd.tasks.filter((x) => x.status !== 'done').sort(taskSort);
  const dueNow = open.filter((x) => x.due_date && x.due_date <= t);
  const later = open.filter((x) => !(x.due_date && x.due_date <= t));
  const projects = sortedProjects.value.filter((p) => p.status !== 'archived');
  const task = s.task_id ? tasksById.value.get(s.task_id) : undefined;
  const project = s.project_id ? projectsById.value.get(s.project_id) : undefined;
  const value = task ? `t:${task.id}` : project ? `p:${project.id}` : '';
  const stats = task ? taskStats.value.get(task.id) : undefined;
  const label = (id: string) => {
    const x = tasksById.value.get(id)!;
    const p = projectsById.value.get(x.project_id);
    return p ? `${x.title} · ${p.name}` : x.title;
  };

  const choose = async (val: string) => {
    const { timer } = app();
    if (val.startsWith('t:')) {
      const x = tasksById.value.get(val.slice(2));
      if (x) await timer.setTarget({ project_id: x.project_id, work_package_id: x.work_package_id, task_id: x.id });
    } else if (val.startsWith('p:')) {
      await timer.setTarget({ project_id: val.slice(2), work_package_id: null, task_id: null });
    } else {
      await timer.setTarget({ project_id: null, work_package_id: null, task_id: null });
    }
  };

  return (
    <div class="card target-card">
      <label class="label" for="targetSel">Woran arbeitest du?</label>
      <select id="targetSel" value={value} onChange={(e) => void choose(e.currentTarget.value)}>
        <option value="">Ohne Zuordnung</option>
        {task && task.status === 'done' && <option value={value}>{label(task.id)} (erledigt)</option>}
        {task && !wd.tasks.includes(task) && task.status !== 'done' && <option value={value}>{label(task.id)}</option>}
        {dueNow.length > 0 && <optgroup label="Heute fällig">{dueNow.map((x) => <option key={x.id} value={`t:${x.id}`}>{label(x.id)}</option>)}</optgroup>}
        {later.length > 0 && <optgroup label="Weitere offene Aufgaben">{later.map((x) => <option key={x.id} value={`t:${x.id}`}>{label(x.id)}</option>)}</optgroup>}
        {projects.length > 0 && <optgroup label="Nur Projekt">{projects.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>}
        {project && !task && !projects.includes(project) && <option value={value}>{project.name}</option>}
      </select>
      <div class="target-info">
        <ProjectChip project={project} />
        {task && stats && (
          <span class="target-progress">
            {(task.estimated_pomodoros ?? 0) > 0 && <PomoDots done={stats.pomos} est={task.estimated_pomodoros!} />}
            <span class="muted">{fmtDur(stats.sec)}</span>
          </span>
        )}
        {task && task.status !== 'done' && (
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => void completeTarget()}><Icon name="check" />Erledigt</button>
        )}
      </div>
    </div>
  );
}

function TodayCard() {
  const t = today.value;
  const st = todayStats.value;
  const goal = settings.value.daily_goal_minutes * 60;
  const tasks = workspaceData.value.tasks
    .filter((x) => (x.due_date === t) || (x.status !== 'done' && x.due_date && x.due_date < t)
      || (x.status === 'done' && x.completed_at && new Date(x.completed_at).toDateString() === new Date().toDateString() && x.due_date === t))
    .sort(taskSort);
  const byProject = [...st.byProject.entries()].sort((a, b) => b[1] - a[1]);
  const n = streak.value;
  return (
    <div class="card today-card">
      <div class="card-head">
        <h2>Heute</h2>
        <span class="muted">{n > 1 ? `${n} Tage in Folge` : ''}</span>
      </div>
      <div class="today-sum">
        <div class="today-big">
          <span class="big-num">{fmtDur(st.seconds)}</span>
          <span class="muted"> {prefs.value.workspace === 'study' ? 'gelernt' : 'gearbeitet'} · {plural(st.pomodoros, 'Pomodoro', 'Pomodoros')}</span>
        </div>
        {goal > 0 && (
          <>
            <Meter value={st.seconds} max={goal} label="Tagesziel" />
            <div class="meter-label muted"><span>Tagesziel {fmtDur(goal)}</span><span>{pct(st.seconds, goal)} %</span></div>
          </>
        )}
        {byProject.length > 0 && (
          <div class="cat-line">
            {byProject.map(([pid, sec]) => {
              const p = pid ? projectsById.value.get(pid) : undefined;
              return <span key={pid ?? 'none'}>{p ? <ProjectChip project={p} /> : <span class="pchip" style={{ '--pc': 'var(--pc-0)' }}><i />Ohne Projekt</span>} <span class="mono">{fmtHM(sec)}</span></span>;
            })}
          </div>
        )}
      </div>
      {tasks.length
        ? <ul class="task-list">{tasks.map((x) => <TaskRow key={x.id} task={x} showDate={x.due_date !== t} />)}</ul>
        : (
          <p class="empty-line">
            Für heute ist nichts fällig. Füge unten eine Aufgabe hinzu oder schau in die{' '}
            <button type="button" class="link" onClick={() => go('aufgaben')}>Aufgaben</button>.
          </p>
        )}
      <QuickAdd />
    </div>
  );
}

function QuickAdd() {
  const ws = prefs.value.workspace;
  const projects = openProjects.value;
  const last = prefs.value.lastProject[ws];
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [est, setEst] = useState('1');
  const pid = projectId && projects.some((p) => p.id === projectId) ? projectId
    : last && projects.some((p) => p.id === last) ? last : projects[0]?.id ?? '';

  if (!projects.length) {
    return (
      <div class="quick-add" style={{ justifyContent: 'space-between' }}>
        <span class="muted small">Lege zuerst ein Projekt im Modus {WORKSPACE_LABEL[ws]} an.</span>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => openProjectDialog(null)}><Icon name="plus" />Projekt</button>
      </div>
    );
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!title.trim() || !pid) return;
    await createTask({ title, project_id: pid, due_date: today.value, estimated_pomodoros: Math.max(0, Math.round(Number(est) || 0)) || null });
    setTitle('');
  };

  return (
    <form class="quick-add" autocomplete="off" onSubmit={(e) => void submit(e)}>
      <label class="sr-only" for="qtTitle">Neue Aufgabe für heute</label>
      <input id="qtTitle" name="title" placeholder="Aufgabe für heute …" required maxLength={200} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
      <label class="sr-only" for="qtProject">Projekt</label>
      <select id="qtProject" value={pid} onChange={(e) => setProjectId(e.currentTarget.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label class="sr-only" for="qtEst">Geschätzte Pomodoros</label>
      <input id="qtEst" type="number" min={0} max={20} inputMode="numeric" value={est} title="Geschätzte Pomodoros" onInput={(e) => setEst(e.currentTarget.value)} />
      <button type="submit" class="icon-btn icon-btn-solid" aria-label="Hinzufügen"><Icon name="plus" /></button>
    </form>
  );
}
