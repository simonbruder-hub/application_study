import { useState } from 'preact/hooks';
import type { Project, ProjectStatus, Workspace } from '../../data/types';
import {
  createProject, deleteProject, PROJECT_COLORS, projectCodeTaken, suggestProjectCode, updateProject,
} from '../../app/actions';
import { entities } from '../../app/store';
import { prefs } from '../../app/prefs';
import { isValidCode } from '../../excel/values';
import { confirmDialog, DialogFrame, openDialog } from '../dialog';
import { toast } from '../toast';
import { Icon } from '../Icon';
import { parseNum, Seg, WORKSPACE_ICON, WORKSPACE_LABEL } from './bits';

const STATUS: readonly { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Pausiert' },
  { value: 'archived', label: 'Archiviert' },
];

export function openProjectDialog(project: Project | null, onCreated?: (p: Project) => void): void {
  openDialog(({ close }) => <ProjectForm project={project} close={close} {...(onCreated ? { onCreated } : {})} />);
}

function ProjectForm({ project, close, onCreated }: { project: Project | null; close: () => void; onCreated?: (p: Project) => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [code, setCode] = useState(project?.project_code ?? '');
  const [codeTouched, setCodeTouched] = useState(!!project);
  const [mode, setMode] = useState<Workspace>(project?.mode ?? prefs.value.workspace);
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[entities.value.projects.length % 8]!);
  const [hours, setHours] = useState(project?.planned_hours != null ? String(project.planned_hours) : '');
  const [start, setStart] = useState(project?.start_date ?? '');
  const [end, setEnd] = useState(project?.end_date ?? '');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const shownCode = codeTouched ? code : (name.trim() ? suggestProjectCode(name, project?.id) : '');
  const codeError = shownCode && !isValidCode(shownCode)
    ? 'Nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich (max. 32 Zeichen).'
    : shownCode && projectCodeTaken(shownCode, project?.id) ? 'Dieser Code ist schon vergeben.' : '';
  const dateError = start && end && end < start ? 'Das Enddatum liegt vor dem Start.' : '';

  const save = async () => {
    if (!name.trim() || codeError || dateError || busy) return;
    const h = parseNum(hours);
    if (h !== null && h < 0) { toast('Das Budget darf nicht negativ sein.'); return; }
    setBusy(true);
    try {
      const fields = {
        name: name.trim(),
        project_code: shownCode || suggestProjectCode(name, project?.id),
        mode, status, color,
        planned_hours: h === null ? null : Math.round(h * 100) / 100,
        start_date: start || null,
        end_date: end || null,
        notes,
      };
      if (project) await updateProject(project.id, fields);
      else onCreated?.(await createProject(fields));
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    const n = entities.value.tasks.filter((t) => t.project_id === project.id).length;
    const ok = await confirmDialog(
      `«${project.name}» löschen? ${n ? `Auch ${n} Aufgabe${n === 1 ? '' : 'n'} werden gelöscht. ` : ''}Erfasste Zeiten bleiben ohne Projekt erhalten. Tipp: Archivieren blendet das Projekt nur aus.`,
      { title: 'Projekt löschen', ok: 'Löschen', danger: true },
    );
    if (!ok) { openProjectDialog(project); return; }
    await deleteProject(project.id);
    toast('Projekt gelöscht');
  };

  return (
    <DialogFrame
      title={project ? 'Projekt bearbeiten' : 'Neues Projekt'}
      onClose={close}
      onSubmit={save}
      footer={<>
        {project && <button type="button" class="btn btn-danger-text" onClick={() => void remove()}><Icon name="trash" />Löschen</button>}
        <span class="grow" />
        <button type="button" class="btn btn-ghost" onClick={close}>Abbrechen</button>
        <button type="submit" class="btn btn-primary" disabled={busy || !name.trim() || !!codeError || !!dateError}>Speichern</button>
      </>}
    >
      <div class="field-row">
        <div class="field">
          <label for="pName">Name</label>
          <input id="pName" data-autofocus required maxLength={120} value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div class="field field-s">
          <label for="pCode">Code</label>
          <input
            id="pCode" class="mono" maxLength={32} value={shownCode}
            onInput={(e) => { setCodeTouched(true); setCode(e.currentTarget.value.trim()); }}
            aria-describedby="pCodeHint"
          />
        </div>
      </div>
      <p id="pCodeHint" class={`small ${codeError ? 'is-error' : 'muted'}`} style={{ margin: '-8px 0 0' }}>
        {codeError || 'Kurzer, eindeutiger Code – verknüpft das Projekt im Excel-Export.'}
      </p>
      <div class="field">
        <span class="field-label">Modus</span>
        <Seg
          label="Modus" value={mode} wide onChange={setMode}
          options={(['study', 'work'] as const).map((w) => ({ value: w, label: WORKSPACE_LABEL[w], icon: WORKSPACE_ICON[w] }))}
        />
      </div>
      <div class="field">
        <span class="field-label">Status</span>
        <Seg label="Status" value={status} options={STATUS} onChange={setStatus} wide />
      </div>
      <fieldset class="field">
        <legend>Farbe</legend>
        <div class="swatches">
          {PROJECT_COLORS.map((c) => (
            <label key={c} class="swatch" style={{ '--pc': c }}>
              <input type="radio" name="pColor" checked={c.toLowerCase() === color.toLowerCase()} onChange={() => setColor(c)} />
              <span class="sr-only">{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div class="field-row">
        <div class="field field-s">
          <label for="pHours">Budget (Std.)</label>
          <input id="pHours" inputMode="decimal" value={hours} onInput={(e) => setHours(e.currentTarget.value)} placeholder="–" />
        </div>
        <div class="field">
          <label for="pStart">Start</label>
          <input id="pStart" type="date" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="pEnd">Ende</label>
          <input id="pEnd" type="date" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </div>
      </div>
      {dateError && <p class="small is-error" style={{ margin: '-8px 0 0' }}>{dateError}</p>}
      <div class="field">
        <label for="pNotes">Notizen</label>
        <textarea id="pNotes" rows={3} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
      </div>
    </DialogFrame>
  );
}
