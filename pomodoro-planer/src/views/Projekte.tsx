/** Ansicht «Projekte»: Übersicht als Karten, Detail mit Zeit, Budget, Aufgaben, Plan und Zeiteinträgen */
import { computed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  Milestone, MilestoneStatus, Project, ProjectStatus, TimeLog, TimeLogMode, WorkPackage,
} from '../data/types';
import { createTask } from '../app/actions';
import { prefs, setPrefs } from '../app/prefs';
import { go, view, viewParam } from '../app/router';
import { projectSeconds, projectsById, sortedProjects, taskSort, tasksById, today } from '../app/selectors';
import { app } from '../app/services';
import { entities, settings, snapshot, timerState } from '../app/store';
import {
  thresholdsFromSettings, type HealthOptions, type MilestoneHealthStatus, type PlanStatus,
} from '../domain/health';
import { milestoneMetrics, projectMetrics, workPackageMetrics } from '../domain/metrics';
import { Empty, Meter, WORKSPACE_ICON, WORKSPACE_LABEL } from '../ui/components/bits';
import { switchWorkspace } from '../ui/components/Chrome';
import { openLogDialog } from '../ui/components/LogDialog';
import { openProjectDialog } from '../ui/components/ProjectDialog';
import { TaskRow } from '../ui/components/TaskRow';
import { Icon } from '../ui/Icon';
import {
  addDays, clamp, daysBetween, fmtDate, fmtDay, fmtDur, fmtHours, fmtTime, pct, plural, startOfWeek,
} from '../ui/format';
import { toast } from '../ui/toast';
import '../ui/styles/projekte.css';

const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Aktiv', paused: 'Pausiert', archived: 'Archiviert' };
const MS_STATUS_LABEL: Record<MilestoneStatus, string> = { open: 'offen', achieved: 'Erreicht', delayed: 'Verzögert' };
const LOG_MODE_LABEL: Record<TimeLogMode, string> = { pomodoro: 'Pomodoro', stopwatch: 'Stechuhr', manual: 'Nachgetragen' };

type Tone = 'is-good' | 'is-warn' | 'is-bad' | '';
const PLAN_HEALTH: Record<PlanStatus, { label: string; tone: Tone }> = {
  ON_TRACK: { label: 'Im Plan', tone: 'is-good' },
  AT_RISK: { label: 'Frühwarnung', tone: 'is-warn' },
  OVER_BUDGET: { label: 'Kritisch', tone: 'is-bad' },
  COMPLETED: { label: 'Abgeschlossen', tone: '' },
};
const MS_HEALTH: Record<MilestoneHealthStatus, { label: string; tone: Tone }> = {
  on_track: { label: 'Im Plan', tone: 'is-good' },
  at_risk: { label: 'Frühwarnung', tone: 'is-warn' },
  delayed: { label: 'Verzug', tone: 'is-bad' },
  completed: { label: 'Abgeschlossen', tone: '' },
};

/* ---------- Abgeleitete Daten (alle Modi, damit auch ein Projekt aus dem anderen Modus angezeigt werden kann) ---------- */

interface Facts {
  weekSec: number;
  pomos: number;
  weekPomos: number;
  logCount: number;
  open: number;
  done: number;
}
const NO_FACTS: Facts = { weekSec: 0, pomos: 0, weekPomos: 0, logCount: 0, open: 0, done: 0 };

const weekStart = computed(() => startOfWeek(today.value).getTime());

const projectFacts = computed(() => {
  const w0 = weekStart.value;
  const w1 = addDays(w0, 7).getTime();
  const e = entities.value;
  const m = new Map<string, Facts>();
  const get = (id: string): Facts => {
    let f = m.get(id);
    if (!f) { f = { ...NO_FACTS }; m.set(id, f); }
    return f;
  };
  for (const l of e.time_logs) {
    if (!l.project_id) continue;
    const f = get(l.project_id);
    const inWeek = l.start_time >= w0 && l.start_time < w1;
    f.logCount += 1;
    if (inWeek) f.weekSec += l.duration_seconds;
    if (l.counts_as_pomodoro) { f.pomos += 1; if (inWeek) f.weekPomos += 1; }
  }
  for (const t of e.tasks) {
    const f = get(t.project_id);
    if (t.status === 'done') f.done += 1; else f.open += 1;
  }
  return m;
});

const factsOf = (id: string): Facts => projectFacts.value.get(id) ?? NO_FACTS;

const healthOpts = computed<HealthOptions>(() => ({ today: today.value, thresholds: thresholdsFromSettings(settings.value) }));
const wpHealth = computed(() => workPackageMetrics(snapshot.value, healthOpts.value));
const msHealth = computed(() => milestoneMetrics(snapshot.value, healthOpts.value));
const projectHealth = computed(() => projectMetrics(snapshot.value, healthOpts.value));

const byOrder = <T extends { sort_order: number }>(key: (r: T) => string) => (a: T, b: T): number =>
  a.sort_order - b.sort_order || key(a).localeCompare(key(b), 'de', { numeric: true });

const barWidth = (value: number, max: number): string => `${((max > 0 ? clamp(value / max, 0, 1) : 0) * 100).toFixed(1)}%`;

/** Ohne Soll-Stunden ist nur «überschritten» oder «abgeschlossen» aussagekräftig */
const planWorthShowing = (plannedHours: number, status: PlanStatus): boolean =>
  plannedHours > 0 || status === 'OVER_BUDGET' || status === 'COMPLETED';

/* ---------- Einstieg ---------- */

export function Projekte() {
  const id = viewParam.value;
  const project = id ? projectsById.value.get(id) : undefined;
  return project ? <Detail key={project.id} project={project} /> : <Overview />;
}

function newProject(): void {
  openProjectDialog(null, (p) => {
    if (p.mode === prefs.value.workspace) { go('projekte', p.id); return; }
    toast(`«${p.name}» liegt im Modus ${WORKSPACE_LABEL[p.mode]}.`, {
      action: { label: 'Anzeigen', fn: () => { void switchWorkspace(p.mode); go('projekte', p.id); } },
    });
  });
}

/* ---------- Übersicht ---------- */

function Overview() {
  const ws = prefs.value.workspace;
  const all = sortedProjects.value;
  const current = all.filter((p) => p.status !== 'archived');
  const archived = all.filter((p) => p.status === 'archived');
  const nActive = current.filter((p) => p.status === 'active').length;
  const nPaused = current.length - nActive;

  return (
    <>
      <div class="view-head">
        <div>
          <p class="eyebrow">
            {plural(nActive, 'aktives Projekt', 'aktive Projekte')}{nPaused ? ` · ${nPaused} pausiert` : ''} · {WORKSPACE_LABEL[ws]}
          </p>
          <h1>Projekte</h1>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-primary" onClick={newProject}><Icon name="plus" />Neues Projekt</button>
        </div>
      </div>

      {current.length > 0
        ? <div class="project-grid">{current.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
        : (
          <Empty
            title={archived.length ? 'Keine aktiven Projekte' : `Noch keine Projekte im Modus ${WORKSPACE_LABEL[ws]}`}
            actions={<button type="button" class="btn btn-primary" onClick={newProject}><Icon name="plus" />Projekt anlegen</button>}
          >
            {archived.length
              ? 'Alle Projekte in diesem Modus sind archiviert. Öffne eines unten und setze es wieder auf aktiv – oder leg ein neues an.'
              : 'Projekte bündeln Aufgaben und erfasste Zeit, z. B. ein Modul im Studium oder einen Auftrag bei der Arbeit. Mit Budget und Enddatum siehst du jederzeit, wie weit du bist.'}
          </Empty>
        )}

      {archived.length > 0 && (
        <details class="done-list pj-archive">
          <summary>Archiviert ({archived.length})</summary>
          <div class="project-grid">{archived.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
        </details>
      )}
    </>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const sec = projectSeconds.value.get(p.id) ?? 0;
  const f = factsOf(p.id);
  const total = f.open + f.done;
  const budget = (p.planned_hours ?? 0) * 3600;
  const over = budget > 0 && sec > budget;
  // Balken nur zur Ansicht (aria-hidden): Die Zahlen daneben tragen die Information
  return (
    <button
      type="button" class={`card project-card pj-card${p.status === 'archived' ? ' is-archived' : ''}`}
      style={{ '--pc': p.color }} onClick={() => go('projekte', p.id)}
    >
      <span class="pc-top">
        <span class="pc-swatch" aria-hidden="true" />
        <span class="pc-code">{p.project_code}</span>
        {p.status === 'paused' && <span class="badge">Pausiert</span>}
        {p.status !== 'archived' && p.end_date && <Deadline end={p.end_date} />}
      </span>
      <span class="pc-name">{p.name}</span>
      <span class="pc-stats">
        <span><b>{fmtDur(sec)}</b><small>erfasst</small></span>
        <span><b>{fmtDur(f.weekSec)}</b><small>diese Woche</small></span>
      </span>
      {budget > 0 && (
        <span class="pc-progress">
          <span class={`meter meter-load${over ? ' is-over' : ''}`} aria-hidden="true"><i style={{ width: barWidth(sec, budget) }} /></span>
          <span class="meter-label muted">
            <span>{fmtHours(sec / 3600)} von {fmtHours(p.planned_hours ?? 0)} Budget</span>
            <span class={over ? 'is-error' : ''}>{pct(sec, budget)} %</span>
          </span>
        </span>
      )}
      <span class="pc-progress">
        {total > 0
          ? (
            <>
              <span class="meter meter-pc" aria-hidden="true"><i style={{ width: barWidth(f.done, total) }} /></span>
              <span class="meter-label muted">
                <span>{f.open} offen · {f.done} erledigt</span>
                <span>{pct(f.done, total)} %</span>
              </span>
            </>
          )
          : <span class="meter-label muted"><span>Noch keine Aufgaben</span></span>}
      </span>
    </button>
  );
}

/** Enddatum relativ: «noch 12 Tage» / «überfällig seit 3 Tagen» */
function Deadline({ end }: { end: string }) {
  const d = daysBetween(today.value, end);
  const text = d > 1 ? `noch ${d} Tage` : d === 1 ? 'endet morgen' : d === 0 ? 'endet heute' : `überfällig seit ${plural(-d, 'Tag', 'Tagen')}`;
  const cls = d < 0 ? ' is-late' : d <= 7 ? ' is-soon' : '';
  return <span class={`badge${cls}`} title={`Ende ${fmtDate(end)}`}><Icon name="flag" />{text}</span>;
}

function HealthBadge({ label, tone, reason }: { label: string; tone: Tone; reason: string }) {
  return (
    <span class="badge pj-health" title={reason}>
      <span class={`status-dot ${tone}`} aria-hidden="true" />{label}<span class="sr-only">: {reason}</span>
    </span>
  );
}

/* ---------- Detail ---------- */

async function startFocus(p: Project): Promise<void> {
  const s = timerState.value;
  // Läuft schon eine Sitzung für dieses Projekt, bleibt die Zuordnung (samt Aufgabe) bestehen
  if (!(s.status !== 'idle' && s.project_id === p.id)) {
    await app().timer.setTarget({ workspace: p.mode, project_id: p.id, work_package_id: null, task_id: null });
  }
  if (prefs.value.workspace !== p.mode) setPrefs({ workspace: p.mode });
  go('fokus');
}

function dateRange(p: Project): string {
  if (p.start_date && p.end_date) return `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`;
  if (p.start_date) return `ab ${fmtDate(p.start_date)}`;
  return p.end_date ? `bis ${fmtDate(p.end_date)}` : '';
}

function Detail({ project: p }: { project: Project }) {
  const ws = prefs.value.workspace;
  const openedIn = useRef(ws);
  useEffect(() => {
    // Modus in der Kopfzeile gewechselt: zurück zur Übersicht des neuen Modus
    if (ws !== openedIn.current && p.mode !== ws && view.value === 'projekte') go('projekte');
  }, [ws]);

  const logs = entities.value.time_logs.filter((l) => l.project_id === p.id).sort((a, b) => b.start_time - a.start_time);
  const health = projectHealth.value.get(p.id);
  const range = dateRange(p);
  const notes = (p.notes || '').trim();

  return (
    <>
      <div class="view-head pj-head">
        <div class="pj-head-main">
          <button type="button" class="link back" onClick={() => go('projekte')}><Icon name="chevron-left" />Alle Projekte</button>
          <h1 class="with-swatch" style={{ '--pc': p.color }}><span class="pc-swatch" aria-hidden="true" /><span class="pj-title">{p.name}</span></h1>
          <p class="sub-line">
            <span class="pc-code">{p.project_code}</span>
            <span class="mode-badge"><Icon name={WORKSPACE_ICON[p.mode]} />{WORKSPACE_LABEL[p.mode]}</span>
            {p.status !== 'active' && <span class="badge">{STATUS_LABEL[p.status]}</span>}
            {p.status !== 'archived' && p.end_date && <Deadline end={p.end_date} />}
            {range && <span class="meta muted small"><Icon name="calendar" />{range}</span>}
            {health && planWorthShowing(health.plannedHours, health.status) && (
              <HealthBadge {...PLAN_HEALTH[health.status]} reason={health.reason} />
            )}
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-ghost" onClick={() => openProjectDialog(p)}><Icon name="edit" />Bearbeiten</button>
          <button type="button" class="btn btn-ghost" onClick={() => go('aufgaben', p.id)}><Icon name="list" />Alle Aufgaben</button>
          <button type="button" class="btn btn-primary" onClick={() => void startFocus(p)}><Icon name="play" />Fokus starten</button>
        </div>
      </div>

      {notes ? <p class="notes">{notes}</p> : null}

      <Tiles project={p} />

      <div class="two-col">
        <TasksCard project={p} />
        <LogsCard logs={logs} />
      </div>

      <PlanCard project={p} />
    </>
  );
}

function Tiles({ project: p }: { project: Project }) {
  const sec = projectSeconds.value.get(p.id) ?? 0;
  const f = factsOf(p.id);
  const total = f.open + f.done;
  const planned = p.planned_hours ?? 0;
  const hours = sec / 3600;
  const over = planned > 0 && hours > planned;
  return (
    <div class="tiles pj-tiles" style={{ '--pc': p.color }}>
      <div class="tile">
        <span class="tile-label">Erfasst gesamt</span>
        <span class="tile-value">{fmtDur(sec)}</span>
        <span class="tile-sub">{plural(f.logCount, 'Eintrag', 'Einträge')}</span>
      </div>
      <div class="tile">
        <span class="tile-label">Diese Woche</span>
        <span class="tile-value">{fmtDur(f.weekSec)}</span>
        <span class="tile-sub">seit {fmtDay(weekStart.value)}</span>
      </div>
      {planned > 0 && (
        <div class="tile">
          <span class="tile-label">Budget</span>
          <span class={`tile-value${over ? ' is-error' : ''}`}>{over ? `+${fmtHours(hours - planned)}` : fmtHours(planned - hours)}</span>
          <Meter value={Math.min(hours, planned)} max={planned} label="Budget verbraucht" cls={`meter-load${over ? ' is-over' : ''}`} />
          <span class="tile-sub">{over ? `über dem Budget von ${fmtHours(planned)}` : `verbleibend von ${fmtHours(planned)}`}</span>
        </div>
      )}
      <div class="tile">
        <span class="tile-label">Aufgaben</span>
        <span class="tile-value">{f.open} offen</span>
        {total > 0 && <Meter value={f.done} max={total} label="Aufgaben erledigt" cls="meter-pc" />}
        <span class="tile-sub">{f.done} von {total} erledigt</span>
      </div>
      <div class="tile">
        <span class="tile-label">Pomodoros</span>
        <span class="tile-value">{f.pomos}</span>
        <span class="tile-sub">{f.weekPomos} diese Woche</span>
      </div>
    </div>
  );
}

function TasksCard({ project: p }: { project: Project }) {
  const tasks = entities.value.tasks.filter((t) => t.project_id === p.id);
  const open = tasks.filter((t) => t.status !== 'done').sort(taskSort);
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
  const archived = p.status === 'archived';
  return (
    <section class="card" aria-labelledby="pjTasksTitle">
      <div class="card-head">
        <h2 id="pjTasksTitle">Offene Aufgaben</h2>
        <span class="muted">{open.length}</span>
      </div>
      {open.length > 0
        ? <ul class="task-list">{open.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</ul>
        : (
          <p class="empty-line">
            {done.length ? 'Alles erledigt – stark!' : archived ? 'Keine offenen Aufgaben.' : 'Noch keine Aufgaben. Leg unten die erste an.'}
          </p>
        )}
      {archived
        ? <p class="muted small">Archiviert: Setze das Projekt wieder auf aktiv, um Aufgaben hinzuzufügen.</p>
        : <TaskQuickAdd project={p} />}
      {done.length > 0 && (
        <details class="done-list">
          <summary>Erledigt ({done.length})</summary>
          <ul class="task-list">{done.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</ul>
        </details>
      )}
    </section>
  );
}

function TaskQuickAdd({ project }: { project: Project }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [est, setEst] = useState('1');

  const submit = async (e: Event) => {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle('');
    try {
      await createTask({
        title: text, project_id: project.id, due_date: due || null,
        estimated_pomodoros: Math.max(0, Math.round(Number(est) || 0)) || null,
      });
    } catch (err) {
      console.error('Aufgabe nicht gespeichert', err);
      setTitle(text);
      toast('Die Aufgabe konnte nicht gespeichert werden.');
    }
  };

  return (
    <form class="quick-add" autocomplete="off" onSubmit={(e) => void submit(e)}>
      <label class="sr-only" for="pjTaskTitle">Neue Aufgabe in diesem Projekt</label>
      <input
        id="pjTaskTitle" name="title" placeholder="Neue Aufgabe …" required maxLength={200}
        value={title} onInput={(e) => setTitle(e.currentTarget.value)}
      />
      <label class="sr-only" for="pjTaskDue">Fällig am</label>
      <input id="pjTaskDue" type="date" title="Fällig am" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
      <label class="sr-only" for="pjTaskEst">Geschätzte Pomodoros</label>
      <input
        id="pjTaskEst" type="number" min={0} max={20} inputMode="numeric" title="Geschätzte Pomodoros"
        value={est} onInput={(e) => setEst(e.currentTarget.value)}
      />
      <button type="submit" class="icon-btn icon-btn-solid" aria-label="Aufgabe hinzufügen"><Icon name="plus" /></button>
    </form>
  );
}

function logLabel(l: TimeLog): string {
  const task = l.task_id ? tasksById.value.get(l.task_id) : undefined;
  const parts = [task?.title, (l.comment || '').trim()].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : LOG_MODE_LABEL[l.mode];
}

function LogsCard({ logs }: { logs: TimeLog[] }) {
  const shown = logs.slice(0, 15);
  return (
    <section class="card pj-logs" aria-labelledby="pjLogsTitle">
      <div class="card-head">
        <h2 id="pjLogsTitle">Letzte Einträge</h2>
        {logs.length > 0 && <span class="muted">{logs.length > shown.length ? `${shown.length} von ${logs.length}` : logs.length}</span>}
      </div>
      {shown.length
        ? (
          <ul class="log-list">
            {shown.map((l) => (
              <li key={l.id}>
                <button type="button" class="log-item" title="Eintrag bearbeiten" onClick={() => openLogDialog(l)}>
                  <span class="mono log-when">{fmtDay(l.start_time)} · {fmtTime(l.start_time)}–{fmtTime(l.end_time)}</span>
                  <span class="log-title">{logLabel(l)}</span>
                  <span class="mono">{fmtDur(l.duration_seconds)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
        : <p class="empty-line">Noch keine Zeit erfasst. Mit «Fokus starten» geht es los.</p>}
    </section>
  );
}

/* ---------- Plan (Meilensteine, Arbeitspakete; vorerst nur Ansicht) ---------- */

function PlanCard({ project: p }: { project: Project }) {
  const e = entities.value;
  const milestones = e.milestones.filter((m) => m.project_id === p.id).sort(byOrder((m: Milestone) => m.ms_code));
  const wps = e.work_packages.filter((w) => w.project_id === p.id).sort(byOrder((w: WorkPackage) => w.ap_code));
  if (!milestones.length && !wps.length) return null;
  const ids = new Set(milestones.map((m) => m.id));
  const loose = wps.filter((w) => !w.milestone_id || !ids.has(w.milestone_id));
  return (
    <section class="card pj-plan" aria-labelledby="pjPlanTitle">
      <div class="card-head">
        <h2 id="pjPlanTitle">{'Meilensteine & Arbeitspakete'}</h2>
        <span class="muted small">
          {plural(milestones.length, 'Meilenstein', 'Meilensteine')} · {plural(wps.length, 'Arbeitspaket', 'Arbeitspakete')}
        </span>
      </div>
      <p class="muted small pj-plan-note">Nur Ansicht – Bearbeiten folgt in Phase 2.</p>
      {milestones.map((m) => <MilestoneGroup key={m.id} milestone={m} wps={wps.filter((w) => w.milestone_id === m.id)} />)}
      {loose.length > 0 && (
        <div class="pj-ms">
          {milestones.length > 0 && <div class="pj-ms-head"><h3 class="pj-ms-title">Ohne Meilenstein</h3></div>}
          <ul class="pj-wp-list">{loose.map((w) => <WpRow key={w.id} wp={w} />)}</ul>
        </div>
      )}
    </section>
  );
}

function MilestoneGroup({ milestone: m, wps }: { milestone: Milestone; wps: WorkPackage[] }) {
  const h = msHealth.value.get(m.id);
  const wm = wpHealth.value;
  const planned = wps.reduce((s, w) => s + (w.planned_hours ?? 0), 0);
  const actual = wps.reduce((s, w) => s + (wm.get(w.id)?.actualHours ?? 0), 0);
  const showHealth = !!h && m.status !== 'achieved' && (planned > 0 || h.status === 'delayed' || h.status === 'completed');
  return (
    <div class="pj-ms">
      <div class="pj-ms-head">
        <span class="pj-code" title={m.ms_code}>{m.ms_code}</span>
        <h3 class="pj-ms-title">{m.title}</h3>
        <span class="pj-meta">
          {m.target_date && <span class="meta" title="Zieldatum"><Icon name="flag" />{fmtDate(m.target_date)}</span>}
          {planned > 0 && <span class="mono">{fmtHours(actual)} von {fmtHours(planned)}</span>}
          {m.status === 'open'
            ? <span class="meta">{MS_STATUS_LABEL.open}</span>
            : <span class={`badge${m.status === 'delayed' ? ' is-late' : ''}`}>{m.status === 'achieved' && <Icon name="check" />}{MS_STATUS_LABEL[m.status]}</span>}
          {h && showHealth && <HealthBadge {...MS_HEALTH[h.status]} reason={h.reason} />}
        </span>
      </div>
      {wps.length > 0
        ? <ul class="pj-wp-list">{wps.map((w) => <WpRow key={w.id} wp={w} />)}</ul>
        : <p class="muted small pj-ms-empty">Keine Arbeitspakete zugeordnet.</p>}
    </div>
  );
}

function WpRow({ wp: w }: { wp: WorkPackage }) {
  const m = wpHealth.value.get(w.id);
  const actual = m?.actualHours ?? 0;
  const planned = w.planned_hours ?? 0;
  const over = planned > 0 && actual > planned;
  return (
    <li class="pj-wp">
      <span class="pj-code" title={w.ap_code}>{w.ap_code}</span>
      <div class="pj-wp-body">
        <div class="pj-wp-line">
          <span class="pj-wp-title">{w.title}</span>
          <span class="pj-meta">
            <span class={`mono${over ? ' is-error' : ''}`}>{fmtHours(actual)}{planned > 0 ? ` von ${fmtHours(planned)}` : ''}</span>
            {w.end_date && <span class="meta" title="Deadline"><Icon name="calendar" />{fmtDate(w.end_date)}</span>}
            {m && m.taskCount > 0 && <span class="meta" title="Erledigte Aufgaben"><Icon name="list" />{m.doneCount}/{m.taskCount}</span>}
            {m && planWorthShowing(planned, m.status) && <HealthBadge {...PLAN_HEALTH[m.status]} reason={m.reason} />}
          </span>
        </div>
        {planned > 0 && (
          <Meter
            value={Math.min(actual, planned)} max={planned} label={`${w.ap_code}: Budget verbraucht`}
            cls={`meter-load meter-thin${over ? ' is-over' : ''}`}
          />
        )}
      </div>
    </li>
  );
}
