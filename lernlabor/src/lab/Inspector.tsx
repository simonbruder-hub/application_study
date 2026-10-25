/** Eigenschaften des ausgewählten Bauteils: Werte, Kurvenform, Schalten, Drehen, Löschen, Anheften */
import { useEffect, useState } from 'preact/hooks';
import { KIND_LABEL, type Part, type Shape } from '../sim/circuit';
import { parseSI, si, stepE12 } from '../sim/units';
import { engine, live } from './engine';
import { partById, pins, removePart, rotatePart, selected, toggleSwitch, togglePin, updatePart } from './state';

interface FieldProps {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  e12?: boolean;
  min?: number;
  allowZero?: boolean;
  allowNegative?: boolean;
}

/** Zahlenfeld mit SI-Vorsätzen (4k7, 100u …) und optional E12-Schritten */
export function ValueField({ label, value, unit, onChange, e12, allowZero, allowNegative }: FieldProps) {
  const [text, setText] = useState(si(value, unit, 4));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(si(value, unit, 4)); setBad(false); }, [value, unit]);
  const apply = () => {
    const v = parseSI(text);
    const ok = Number.isFinite(v) && (allowNegative || v >= 0) && (allowZero || v !== 0);
    setBad(!ok);
    if (ok && v !== value) onChange(v);
    else if (ok) setText(si(value, unit, 4));
  };
  return (
    <label class="field">
      <span>{label}</span>
      <span class="field-row">
        {e12 && <button type="button" class="btn-icon" aria-label={`${label} kleiner (E12)`} title="Nächstkleinerer E12-Wert" onClick={() => onChange(stepE12(value, -1))}>◀</button>}
        <input
          class={bad ? 'is-bad' : ''}
          inputMode="text"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onBlur={apply}
          onKeyDown={(e) => { if (e.key === 'Enter') { apply(); (e.target as HTMLInputElement).blur(); } }}
          aria-invalid={bad}
        />
        {e12 && <button type="button" class="btn-icon" aria-label={`${label} grösser (E12)`} title="Nächstgrösserer E12-Wert" onClick={() => onChange(stepE12(value, 1))}>▶</button>}
      </span>
    </label>
  );
}

const SHAPES: [Shape, string][] = [['dc', 'Gleich'], ['sine', 'Sinus'], ['square', 'Rechteck']];

function SourceFields({ p }: { p: Part }) {
  const set = (patch: Partial<Part>) => updatePart(p.id, patch);
  const unit = p.kind === 'V' ? 'V' : 'A';
  const shape = p.shape ?? 'dc';
  return (
    <>
      <div class="seg" role="radiogroup" aria-label="Kurvenform">
        {SHAPES.map(([s, l]) => (
          <button key={s} type="button" role="radio" aria-checked={shape === s} class={shape === s ? 'is-on' : ''} onClick={() => set({ shape: s })}>{l}</button>
        ))}
      </div>
      <ValueField label={shape === 'dc' ? (p.kind === 'V' ? 'Spannung U' : 'Strom I') : shape === 'sine' ? 'Amplitude (Scheitelwert)' : 'Amplitude (±)'} value={p.value} unit={unit} allowZero allowNegative onChange={(v) => set({ value: v })} />
      {shape !== 'dc' && (
        <>
          <ValueField label="Frequenz f" value={p.freq ?? 50} unit="Hz" onChange={(v) => set({ freq: v })} />
          <ValueField label="Gleichanteil" value={p.offset ?? 0} unit={unit} allowZero allowNegative onChange={(v) => set({ offset: v })} />
          <ValueField label="Nullphasenwinkel φ" value={p.phase ?? 0} unit="°" allowZero allowNegative onChange={(v) => set({ phase: v })} />
        </>
      )}
      {shape === 'sine' && <p class="small muted">Effektivwert {si(Math.abs(p.value) / Math.SQRT2, unit)} · Periode {si(1 / (p.freq ?? 50), 's')}</p>}
    </>
  );
}

function NowValues({ p }: { p: Part }) {
  live.value;
  const v = engine.now(p.id);
  if (!v || p.kind === 'wire' || p.kind === 'ground') return null;
  const src = p.kind === 'V' || p.kind === 'I';
  // Quellen im Erzeuger-Zählpfeilsystem: abgegebener Strom und abgegebene Leistung positiv
  const i = src ? -v.i : v.i;
  const pw = src ? -v.u * v.i : v.u * v.i;
  return (
    <dl class="now">
      <div><dt>u</dt><dd>{si(v.u, 'V')}</dd></div>
      <div><dt>i</dt><dd>{si(i, 'A')}</dd></div>
      <div><dt>{src ? 'p abgegeben' : 'p'}</dt><dd>{si(pw, 'W')}</dd></div>
    </dl>
  );
}

export function Inspector() {
  const p = partById(selected.value);
  if (!p) {
    return (
      <div class="inspector is-empty">
        <p class="muted small">Tippe ein Bauteil an, um seine Werte zu ändern. Ein Schalter schaltet beim Antippen; zum Bearbeiten ein Stück ziehen.</p>
      </div>
    );
  }
  const set = (patch: Partial<Part>) => updatePart(p.id, patch);
  const pinned = (q: 'u' | 'i') => pins.value.some((t) => t.id === p.id && t.q === q);
  return (
    <div class="inspector">
      <div class="insp-head">
        <span class="insp-kind">{KIND_LABEL[p.kind]}</span>
        {p.kind !== 'wire' && p.kind !== 'ground' && (
          <input class="insp-name" value={p.name} aria-label="Name" onChange={(e) => set({ name: (e.target as HTMLInputElement).value.slice(0, 8) || p.name })} />
        )}
      </div>
      {p.kind === 'R' && <ValueField label="Widerstand R" value={p.value} unit="Ω" e12 onChange={(v) => set({ value: v })} />}
      {p.kind === 'L' && <ValueField label="Induktivität L" value={p.value} unit="H" e12 onChange={(v) => set({ value: v })} />}
      {p.kind === 'C' && <ValueField label="Kapazität C" value={p.value} unit="F" e12 onChange={(v) => set({ value: v })} />}
      {p.kind === 'lamp' && (
        <>
          <ValueField label="Widerstand R" value={p.value} unit="Ω" e12 onChange={(v) => set({ value: v })} />
          <ValueField label="Nennleistung" value={p.power ?? 1} unit="W" onChange={(v) => set({ power: v })} />
        </>
      )}
      {(p.kind === 'V' || p.kind === 'I') && <SourceFields p={p} />}
      {p.kind === 'S' && (
        <button type="button" class={`btn ${p.closed ? 'btn-on' : ''}`} onClick={() => toggleSwitch(p.id)}>{p.closed ? 'Geschlossen: öffnen' : 'Offen: schliessen'}</button>
      )}
      {p.kind === 'S2' && (
        <button type="button" class="btn btn-on" onClick={() => toggleSwitch(p.id)}>Umschalten</button>
      )}
      <NowValues p={p} />
      <div class="insp-actions">
        {p.kind !== 'wire' && p.kind !== 'ground' && (
          <>
            {p.kind !== 'AM' && <button type="button" class={`btn btn-sm${pinned('u') ? ' is-on' : ''}`} aria-pressed={pinned('u')} onClick={() => togglePin({ id: p.id, q: 'u' })}>u anheften</button>}
            {p.kind !== 'VM' && <button type="button" class={`btn btn-sm${pinned('i') ? ' is-on' : ''}`} aria-pressed={pinned('i')} onClick={() => togglePin({ id: p.id, q: 'i' })}>i anheften</button>}
          </>
        )}
        <button type="button" class="btn btn-sm" title="Taste R" onClick={() => rotatePart(p.id)}>Drehen</button>
        <button type="button" class="btn btn-sm btn-danger" title="Taste Entf" onClick={() => removePart(p.id)}>Löschen</button>
      </div>
      {(p.kind === 'V' || p.kind === 'I') && <p class="small muted">Pluspol bzw. Stromrichtung: Seite mit dem «+» bzw. Pfeil. Werte der Quelle im Erzeuger-Zählpfeilsystem, alle anderen im Verbraucher-Zählpfeilsystem.</p>}
    </div>
  );
}
