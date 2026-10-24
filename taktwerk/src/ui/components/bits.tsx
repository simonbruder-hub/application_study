import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { allTags, cleanTags, TAG_SUGGESTIONS, tagColor } from '../../app/tags';
import type { Project, Workspace } from '../../data/types';
import { Icon, type IconName } from '../Icon';
import { clamp } from '../format';

export const WORKSPACE_LABEL: Record<Workspace, string> = { study: 'Lernen', work: 'Arbeit' };
export const WORKSPACE_ICON: Record<Workspace, IconName> = { study: 'book', work: 'briefcase' };

export function ProjectChip({ project }: { project: Project | undefined | null }) {
  if (!project) return null;
  return <span class="pchip" style={{ '--pc': project.color }}><i />{project.name}</span>;
}

export function PomoDots({ done, est }: { done: number; est: number }) {
  const max = 8;
  const total = Math.max(est, done);
  const shown = Math.min(total, max);
  const dots = Array.from({ length: shown }, (_, i) => (
    <i key={i} class={i < done ? (i >= est ? 'is-over' : 'is-on') : ''} />
  ));
  const label = `${done} von ${est} Pomodoros`;
  return (
    <span class="pdots" title={label} aria-label={label}>
      {dots}{total > max && <b>+{total - max}</b>}
    </span>
  );
}

export function Meter({ value, max, label, cls = '' }: { value: number; max: number; label: string; cls?: string }) {
  const f = max > 0 ? clamp(value / max, 0, 1) : 0;
  return (
    <div class={`meter ${cls}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <i style={{ width: `${(f * 100).toFixed(1)}%` }} />
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ComponentChildren }) {
  return (
    <label class="switch">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span>{props.label}{props.hint && <small>{props.hint}</small>}</span>
    </label>
  );
}

export function Seg<T extends string>(props: {
  value: T;
  options: readonly { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <div class={`seg${props.wide ? ' seg-wide' : ''}`} role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value} type="button" class={`seg-btn${o.value === props.value ? ' is-on' : ''}`}
          aria-pressed={o.value === props.value} disabled={props.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Zahlenfeld mit −/+ */
export function Stepper(props: {
  id: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void; label: string;
}) {
  const step = props.step ?? 1;
  const set = (v: number) => {
    if (!Number.isFinite(v)) return;
    props.onChange(clamp(Math.round(v / step) * step, props.min, props.max));
  };
  return (
    <div class="stepper">
      <button type="button" class="icon-btn sm" aria-label={`${props.label} verringern`} onClick={() => set(props.value - step)}><Icon name="minus" /></button>
      <input
        id={props.id} type="number" inputMode="numeric" min={props.min} max={props.max} step={step}
        value={props.value} onChange={(e) => set(Number(e.currentTarget.value))}
      />
      <button type="button" class="icon-btn sm" aria-label={`${props.label} erhöhen`} onClick={() => set(props.value + step)}><Icon name="plus" /></button>
      {props.unit && <span class="unit">{props.unit}</span>}
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children?: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="card empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div class="row-gap">{actions}</div>}
    </div>
  );
}

/** Zahl aus einem Eingabefeld (leer → null, Komma erlaubt) */
export function parseNum(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Tags als kleine farbige Marken */
export function TagChips({ tags, small = false }: { tags: readonly string[] | undefined; small?: boolean }) {
  if (!tags?.length) return null;
  return (
    <span class={`tag-chips${small ? ' is-small' : ''}`}>
      {tags.map((t) => <span key={t} class="tag" style={{ '--tc': tagColor(t) }}>{t}</span>)}
    </span>
  );
}

/** Tags wählen: bestehende antippen, neue eintippen (Enter oder Komma) */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const known = allTags.value;
  const options = cleanTags([...known, ...(known.length ? [] : TAG_SUGGESTIONS), ...value]);
  const has = (t: string) => value.some((v) => v.toLocaleLowerCase('de-CH') === t.toLocaleLowerCase('de-CH'));
  const toggle = (t: string) => onChange(has(t) ? value.filter((v) => v.toLocaleLowerCase('de-CH') !== t.toLocaleLowerCase('de-CH')) : cleanTags([...value, t]));
  const add = () => { if (text.trim()) onChange(cleanTags([...value, ...text.split(',')])); setText(''); };
  return (
    <div class="tag-picker">
      <div class="tag-chips">
        {options.map((t) => (
          <button key={t} type="button" class={`tag${has(t) ? ' is-on' : ''}`} style={{ '--tc': tagColor(t) }} aria-pressed={has(t)} onClick={() => toggle(t)}>{t}</button>
        ))}
      </div>
      <input
        aria-label="Neuer Tag" placeholder="Neuer Tag, Enter zum Hinzufügen" maxLength={30} value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}
