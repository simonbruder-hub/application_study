/** Ansicht «Aufgaben»: alle Aufgaben des Modus mit Suche und Filtern, gruppiert nach Fälligkeit */
import { computed } from '@preact/signals';
import { useLayoutEffect, useState } from 'preact/hooks';
import type { Project, Task } from '../data/types';
import { createTask } from '../app/actions';
import { prefs } from '../app/prefs';
import { viewParam } from '../app/router';
import { openProjects, projectsById, sortedProjects, today } from '../app/selectors';
import { workspace, workspaceData } from '../app/store';
import {
  groupByDue, groupDone, matchesFilter, matchesStatus, resetTaskFilter, searchTerms, setProjectFilter, setTaskFilter,
  setTaskSearch, sortDone, taskFilter, taskSearch, type PrioFilter, type StatusFilter,
} from '../app/taskFilters';
import { Empty, Seg, WORKSPACE_LABEL } from '../ui/components/bits';
import { switchWorkspace } from '../ui/components/Chrome';
import { openProjectDialog } from '../ui/components/ProjectDialog';
import { openTaskDialog } from '../ui/components/TaskDialog';
import { TaskRow } from '../ui/components/TaskRow';
import { Icon } from '../ui/Icon';
import { plural } from '../ui/format';
import { toast } from '../ui/toast';
import '../ui/styles/aufgaben.css';

const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'all', label: 'Alle' },
  { value: 'done', label: 'Erledigt' },
];
const PRIO_FILTERS: readonly { value: PrioFilter; label: string }[] = [
  { value: 'all', label: 'Alle Prioritäten' },
  { value: 'high', label: 'Priorität hoch' },
  { value: 'medium', label: 'Priorität mittel' },
  { value: 'low', label: 'Priorität niedrig' },
];
/** So viele erledigte Aufgaben auf einmal */
const DONE_CAP = 50;

/** Gefilterte Liste; hängt nur an Daten, Filter und Datum (nicht am Sekundentakt) */
const model = computed(() => {
  const wd = workspaceData.value;
  const ws = workspace.value;
  const t = today.value;
  const f = taskFilter.value;
  const terms = searchTerms(taskSearch.value);
  const pid = f.project[ws];
  const project = pid ? wd.projects.find((p) => p.id === pid) : undefined;
  const active = { status: f.status, projectId: project?.id ?? null, prio: f.prio, terms };
  const open: Task[] = [];
  const done: Task[] = [];
  let openCount = 0;
  let overdue = 0;
  for (const x of wd.tasks) {
    const isDone = x.status === 'done';
    if (!isDone) {
      openCount++;
      if (x.due_date && x.due_date < t) overdue++;
    }
    if (matchesFilter(x, active)) (isDone ? done : open).push(x);
  }
  return {
    active,
    project,
    groups: groupByDue(open, t),
    openMatches: open.length,
    done: sortDone(done),
    total: wd.tasks.length,
    openCount,
    overdue,
    /** Projekt, Priorität oder Suche eingeschränkt */
    narrowed: !!project || f.prio !== 'all' || terms.length > 0,
  };
});

export function Aufgaben() {
  useProjectParam();
  const ws = prefs.value.workspace;
  const m = model.value;
  const hasProjects = workspaceData.value.projects.length > 0;
  const filterProject = m.project && m.project.status !== 'archived' ? m.project : undefined;

  const eyebrow = [WORKSPACE_LABEL[ws], `${m.openCount} offen`];
  if (m.overdue) eyebrow.push(`${m.overdue} überfällig`);

  return (
    <>
      <div class="view-head">
        <div>
          <p class="eyebrow">{eyebrow.join(' · ')}</p>
          <h1>Aufgaben</h1>
        </div>
        <div class="head-actions">
          <button
            type="button" class="btn btn-primary aufg-new" title="Neue Aufgabe (N)" aria-keyshortcuts="N"
            onClick={() => openTaskDialog(null, filterProject ? { project_id: filterProject.id } : {})}
          >
            <Icon name="plus" /><span>Neue Aufgabe</span><kbd aria-hidden="true">N</kbd>
          </button>
        </div>
      </div>
      {hasProjects
        ? (
          <>
            <QuickAdd filterProject={filterProject} />
            <Filters />
            <TaskLists />
          </>
        )
        : <NoProjects />}
    </>
  );
}

/** go('aufgaben', projektId) aus «Projekte»: diesen Projektfilter vorwählen */
function useProjectParam() {
  const param = viewParam.value;
  // Vor dem Zeichnen anwenden, damit nicht kurz die alte Auswahl erscheint
  useLayoutEffect(() => {
    if (!param) return;
    const p = projectsById.value.get(param);
    if (!p) return;
    setProjectFilter(p.mode, p.id);
    setTaskFilter({ prio: 'all' });
    setTaskSearch('');
    if (p.mode !== prefs.value.workspace) void switchWorkspace(p.mode);
  }, [param]);
}

function NoProjects() {
  const ws = prefs.value.workspace;
  return (
    <Empty
      title={`Noch keine Projekte im Modus ${WORKSPACE_LABEL[ws]}`}
      actions={<button type="button" class="btn btn-primary" onClick={() => openProjectDialog(null)}><Icon name="plus" />Projekt anlegen</button>}
    >
      Aufgaben gehören immer zu einem Projekt, {ws === 'study' ? 'zum Beispiel einem Fach oder einem Kurs' : 'zum Beispiel einem Auftrag oder einem Vorhaben'}.
      Lege zuerst ein Projekt an, danach sammelst du hier deine Aufgaben.
    </Empty>
  );
}

function QuickAdd({ filterProject }: { filterProject: Project | undefined }) {
  const ws = prefs.value.workspace;
  const projects = openProjects.value;
  const last = prefs.value.lastProject[ws];
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [due, setDue] = useState('');
  const [est, setEst] = useState('1');
  const [busy, setBusy] = useState(false);
  const usable = (id: string | undefined): id is string => !!id && projects.some((p) => p.id === id);
  const fid = filterProject?.id;
  // Eigene Wahl vor Projektfilter vor zuletzt verwendetem Projekt
  const pid = usable(projectId) ? projectId : usable(fid) ? fid : usable(last) ? last : projects[0]?.id ?? '';

  if (!projects.length) {
    return (
      <div class="card quick-add aufg-add aufg-add-note">
        <span class="muted small">Alle Projekte im Modus {WORKSPACE_LABEL[ws]} sind archiviert. Lege ein neues an, um Aufgaben hinzuzufügen.</span>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => openProjectDialog(null)}><Icon name="plus" />Projekt</button>
      </div>
    );
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!title.trim() || !pid || busy) return;
    setBusy(true);
    try {
      const n = Math.min(99, Math.max(0, Math.round(Number(est) || 0)));
      const task = await createTask({ title, project_id: pid, due_date: due || null, estimated_pomodoros: n || null });
      setTitle('');
      setDue('');
      const { active } = model.value;
      if (!matchesStatus(task, active.status) || !matchesFilter(task, active)) {
        toast(`«${task.title}» angelegt, aber vom Filter ausgeblendet`, {
          action: { label: 'Filter zurücksetzen', fn: () => resetTaskFilter(ws) },
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card quick-add aufg-add" autocomplete="off" onSubmit={(e) => void submit(e)}>
      <label class="sr-only" for="atTitle">Neue Aufgabe</label>
      <input
        id="atTitle" name="title" placeholder="Neue Aufgabe …" required maxLength={200}
        value={title} onInput={(e) => setTitle(e.currentTarget.value)}
      />
      <label class="sr-only" for="atProject">Projekt</label>
      <select id="atProject" value={pid} onChange={(e) => setProjectId(e.currentTarget.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label class="sr-only" for="atDue">Fällig am (optional)</label>
      <input id="atDue" type="date" value={due} title="Fällig am (optional)" onInput={(e) => setDue(e.currentTarget.value)} />
      <label class="sr-only" for="atEst">Geschätzte Pomodoros</label>
      <input
        id="atEst" type="number" min={0} max={99} inputMode="numeric" value={est} title="Geschätzte Pomodoros"
        onInput={(e) => setEst(e.currentTarget.value)}
      />
      <button type="submit" class="icon-btn icon-btn-solid" aria-label="Aufgabe hinzufügen" title="Hinzufügen" disabled={busy}>
        <Icon name="plus" />
      </button>
    </form>
  );
}

function Filters() {
  const ws = prefs.value.workspace;
  const f = taskFilter.value;
  const m = model.value;
  const projects = sortedProjects.value;
  const current = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');
  const shown = f.status === 'done' ? m.done.length : f.status === 'open' ? m.openMatches : m.openMatches + m.done.length;
  return (
    <div class="filters aufg-filters" role="search" aria-label="Aufgaben filtern">
      <label class="sr-only" for="afSearch">Suchen in Titel und Notizen</label>
      <input
        id="afSearch" type="search" placeholder="Suchen …" enterKeyHint="search" value={taskSearch.value}
        onInput={(e) => setTaskSearch(e.currentTarget.value)}
      />
      <Seg label="Status" value={f.status} options={STATUS_FILTERS} onChange={(status) => setTaskFilter({ status })} />
      <label class="sr-only" for="afProject">Projekt</label>
      <select id="afProject" value={m.project?.id ?? ''} onChange={(e) => setProjectFilter(ws, e.currentTarget.value || null)}>
        <option value="">Alle Projekte</option>
        {current.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === 'paused' ? ' (pausiert)' : ''}</option>)}
        {archived.length > 0 && (
          <optgroup label="Archiviert">
            {archived.map((p) => <option key={p.id} value={p.id}>{p.name} (archiviert)</option>)}
          </optgroup>
        )}
      </select>
      <label class="sr-only" for="afPrio">Priorität</label>
      <select id="afPrio" value={f.prio} onChange={(e) => setTaskFilter({ prio: e.currentTarget.value as PrioFilter })}>
        {PRIO_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {m.narrowed && (
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => resetTaskFilter(ws)}>
          <Icon name="x" />Zurücksetzen
        </button>
      )}
      <p class="sr-only" aria-live="polite">{m.narrowed ? `${plural(shown, 'Aufgabe', 'Aufgaben')} gefunden` : ''}</p>
    </div>
  );
}

function TaskLists() {
  const m = model.value;
  const status = taskFilter.value.status;
  const showProject = !m.project;

  if (status === 'done') {
    return m.done.length ? <DoneGroups tasks={m.done} showProject={showProject} /> : <NoMatch />;
  }
  const hasOpen = m.groups.length > 0;
  if (!hasOpen && (status === 'open' || !m.done.length)) return <NoMatch />;

  return (
    <>
      {m.groups.map((g) => (
        <section key={g.key} class={`task-group${g.key === 'overdue' ? ' is-overdue' : ''}`} aria-labelledby={`ag-${g.key}`}>
          <h2 class="group-title" id={`ag-${g.key}`}>
            {g.label} <span class="muted">{g.tasks.length}</span>
            {g.hint && <span class="group-hint">{g.hint}</span>}
          </h2>
          <ul class="task-list card">
            {g.tasks.map((x) => (
              <TaskRow key={x.id} task={x} showDate={g.key !== 'today' && g.key !== 'tomorrow'} showProject={showProject} />
            ))}
          </ul>
        </section>
      ))}
      {!hasOpen && <p class="empty-line">Keine offenen Aufgaben für diese Auswahl.</p>}
      {status === 'all' && m.done.length > 0 && <DoneDetails tasks={m.done} showProject={showProject} startOpen={!hasOpen} />}
    </>
  );
}

/** Status «Alle»: erledigte Aufgaben eingeklappt am Ende */
function DoneDetails({ tasks, showProject, startOpen }: { tasks: readonly Task[]; showProject: boolean; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const shown = tasks.slice(0, DONE_CAP);
  return (
    <details class="done-list aufg-done" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Erledigt ({tasks.length})</summary>
      {open && (
        <>
          <ul class="task-list card">
            {shown.map((x) => <TaskRow key={x.id} task={x} showProject={showProject} />)}
          </ul>
          {tasks.length > DONE_CAP && (
            <p class="empty-line">
              Hier stehen die {DONE_CAP} zuletzt erledigten.{' '}
              <button type="button" class="link" onClick={() => setTaskFilter({ status: 'done' })}>Alle {tasks.length} anzeigen</button>
            </p>
          )}
        </>
      )}
    </details>
  );
}

/** Status «Erledigt»: nach Erledigungsdatum, in Portionen */
function DoneGroups({ tasks, showProject }: { tasks: readonly Task[]; showProject: boolean }) {
  const [limit, setLimit] = useState(DONE_CAP);
  const groups = groupDone(tasks.slice(0, limit), today.value);
  const rest = tasks.length - limit;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} class="task-group" aria-labelledby={`ad-${g.key}`}>
          <h2 class="group-title" id={`ad-${g.key}`}>{g.label} <span class="muted">{g.tasks.length}</span></h2>
          <ul class="task-list card">
            {g.tasks.map((x) => <TaskRow key={x.id} task={x} showProject={showProject} />)}
          </ul>
        </section>
      ))}
      {rest > 0 && (
        <div class="aufg-more">
          <span class="muted small">{limit} von {tasks.length} angezeigt</span>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setLimit(limit + DONE_CAP)}>
            {rest > DONE_CAP ? `${DONE_CAP} weitere anzeigen` : `Restliche ${rest} anzeigen`}
          </button>
        </div>
      )}
    </>
  );
}

/** Nichts passt zu Status und Filtern */
function NoMatch() {
  const ws = prefs.value.workspace;
  const m = model.value;
  const status = taskFilter.value.status;
  const reset = <button type="button" class="btn btn-primary" onClick={() => resetTaskFilter(ws)}>Filter zurücksetzen</button>;
  const showDone = (
    <button type="button" class="btn btn-ghost" onClick={() => setTaskFilter({ status: 'done' })}>
      Erledigte anzeigen ({m.done.length})
    </button>
  );

  if (m.total === 0) {
    return (
      <Empty title="Noch keine Aufgaben">
        Lege oben deine erste Aufgabe an. Schätze dazu, wie viele Pomodoros sie ungefähr braucht.
      </Empty>
    );
  }
  if (!m.narrowed && status === 'open') {
    return (
      <Empty title="Alles erledigt" actions={m.done.length > 0 && showDone}>
        Im Modus {WORKSPACE_LABEL[ws]} ist gerade nichts offen. Gönn dir eine Pause oder plane oben, was als Nächstes kommt.
      </Empty>
    );
  }
  if (!m.narrowed && status === 'done') {
    return (
      <Empty title="Noch nichts erledigt" actions={<button type="button" class="btn btn-ghost" onClick={() => setTaskFilter({ status: 'open' })}>Offene anzeigen</button>}>
        Hake Aufgaben ab, sobald du fertig bist. Sie erscheinen dann hier.
      </Empty>
    );
  }
  return (
    <Empty title="Keine Aufgaben für diesen Filter" actions={<>{reset}{status === 'open' && m.done.length > 0 && showDone}</>}>
      {status === 'open' && m.done.length > 0
        ? 'Offen ist hier nichts mehr. Passe die Suche oder die Filter an, oder schau bei den erledigten Aufgaben.'
        : 'Passe die Suche oder die Filter an, um weitere Aufgaben zu sehen.'}
    </Empty>
  );
}
