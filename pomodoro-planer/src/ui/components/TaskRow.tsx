import type { Task } from '../../data/types';
import { focusTask, setTaskDone } from '../../app/actions';
import { projectsById, taskStats, today } from '../../app/selectors';
import { timerState } from '../../app/store';
import { Icon } from '../Icon';
import { fmtDur, relDay } from '../format';
import { PomoDots, ProjectChip } from './bits';
import { openTaskDialog } from './TaskDialog';

const PRIO_LABEL = { high: 'Hoch', medium: '', low: 'Niedrig' } as const;

export function TaskRow({ task, showDate = true, showProject = true }: { task: Task; showDate?: boolean; showProject?: boolean }) {
  const st = taskStats.value.get(task.id) ?? { sec: 0, pomos: 0 };
  const project = projectsById.value.get(task.project_id);
  const isTarget = timerState.value.task_id === task.id;
  const done = task.status === 'done';
  const overdue = !done && !!task.due_date && task.due_date < today.value;
  const est = task.estimated_pomodoros ?? 0;
  return (
    <li class={`task${done ? ' is-done' : ''}${isTarget ? ' is-target' : ''}`}>
      <label class="check">
        <input type="checkbox" checked={done} onChange={(e) => void setTaskDone(task, e.currentTarget.checked)} />
        <span class="check-box" aria-hidden="true"><Icon name="check" /></span>
        <span class="sr-only">Erledigt: {task.title}</span>
      </label>
      <button type="button" class="task-main" onClick={() => openTaskDialog(task)}>
        <span class="task-title">{task.title}</span>
        <span class="task-meta">
          {showProject && <ProjectChip project={project} />}
          {showDate && task.due_date && (
            <span class={`meta${overdue ? ' is-overdue' : ''}`}><Icon name="calendar" />{overdue ? 'überfällig · ' : ''}{relDay(task.due_date)}</span>
          )}
          {task.status === 'in_progress' && <span class="meta">in Arbeit</span>}
          {PRIO_LABEL[task.priority] && <span class={`meta prio-${task.priority}`}><Icon name="flag" />{PRIO_LABEL[task.priority]}</span>}
          {st.sec > 0 && <span class="meta"><Icon name="timer" />{fmtDur(st.sec)}</span>}
        </span>
      </button>
      {est > 0 || st.pomos > 0 ? <PomoDots done={st.pomos} est={Math.max(est, 1)} /> : null}
      {done
        ? <span class="play-gap" />
        : (
          <button
            type="button" class={`icon-btn play-btn${isTarget ? ' is-on' : ''}`}
            title="Mit dieser Aufgabe fokussieren" aria-label={`Fokussieren: ${task.title}`}
            onClick={() => void focusTask(task)}
          ><Icon name="play" /></button>
        )}
    </li>
  );
}
