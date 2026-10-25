/** Baukasten: Werkzeuge, Zeichenfläche, Eigenschaften und Anzeigen (Oszilloskop, Zeiger, Frequenzgang, Werte) */
import { useEffect, useState } from 'preact/hooks';
import { defaults, KIND_LABEL, type Part } from '../sim/circuit';
import { si } from '../sim/units';
import { route } from '../router';
import { Board } from './Board';
import { BodePlot } from './BodePlot';
import { engine, manualDiv, running, tempo, version } from './engine';
import { EXAMPLES } from './examples';
import { Inspector } from './Inspector';
import { Phasor } from './Phasor';
import { Scope } from './Scope';
import {
  canRedo, canUndo, circuit, clearAll, decodeCircuit, encodeCircuit, hint, loadCircuit, loadExample, placeRot, redo,
  removePart, rotatePart, selected, type Tool, tool, undo,
} from './state';
import { PartSymbol } from './symbols';
import { Values } from './Values';

const TOOLS: Tool[] = ['select', 'wire', 'R', 'L', 'C', 'V', 'I', 'S', 'S2', 'lamp', 'VM', 'AM', 'ground'];
const TOOL_LABEL: Record<Tool, string> = { ...KIND_LABEL, select: 'Auswahl', wire: 'Draht', VM: 'Voltmeter', AM: 'Amperemeter', V: 'U-Quelle', I: 'I-Quelle', C: 'Kondensator' } as Record<Tool, string>;
const TOOL_KEY: Partial<Record<Tool, string>> = { select: 'Esc', wire: 'D' };

function ToolIcon({ t }: { t: Tool }) {
  if (t === 'select') return <svg viewBox="0 0 24 24" class="ti"><path class="ti-fill" d="M6 3 L18 13 L12.5 13.8 L15.5 20 L13 21 L10 14.8 L6 18.5 Z" /></svg>;
  if (t === 'wire') return <svg viewBox="0 0 24 24" class="ti"><path class="ti-line" d="M3 18 H12 V6 H21" /><circle class="ti-fill" cx="3" cy="18" r="2" /><circle class="ti-fill" cx="21" cy="6" r="2" /></svg>;
  const p = { id: 'icon', kind: t, name: '', at: { x: 0, y: 0 }, rot: 0, ...defaults(t), ...(t === 'S' ? { closed: false } : {}) } as Part;
  const vb = t === 'ground' ? '-24 -6 48 36' : t === 'S2' ? '-4 -46 88 92' : '-4 -30 88 60';
  return <svg viewBox={vb} class="ti ti-part"><PartSymbol p={p} glow={0.4} /></svg>;
}

function Palette() {
  const t = tool.value;
  const placing = t !== 'select' && t !== 'wire';
  return (
    <div class="palette" role="toolbar" aria-label="Bauteile">
      {TOOLS.map((k) => (
        <button
          key={k} type="button" class={`tool${t === k ? ' is-on' : ''}`} aria-pressed={t === k}
          title={`${TOOL_LABEL[k]}${TOOL_KEY[k] ? ` (${TOOL_KEY[k]})` : ''}`}
          onClick={() => { tool.value = t === k && k !== 'select' ? 'select' : k; }}
        >
          <ToolIcon t={k} />
          <span>{TOOL_LABEL[k]}</span>
        </button>
      ))}
      {placing && (
        <button type="button" class="tool tool-rot" title="Drehen (R)" onClick={() => (placeRot.value = ((placeRot.value + 1) % 4) as 0 | 1 | 2 | 3)}>
          <svg viewBox="0 0 24 24" class="ti"><path class="ti-line" d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" /></svg>
          <span>Drehen {placeRot.value * 90}°</span>
        </button>
      )}
    </div>
  );
}

const DIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const TEMPI = [0.25, 0.5, 1, 2, 4];

function Controls() {
  version.value;
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/et/bauen?c=${encodeCircuit(circuit.value)}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { prompt('Link zur Schaltung:', url); }
  };
  return (
    <div class="controls">
      <button type="button" class="btn btn-primary" aria-pressed={running.value} onClick={() => (running.value = !running.value)} title="Leertaste">
        {running.value ? 'Anhalten' : 'Weiter'}
      </button>
      <button type="button" class="btn" onClick={() => engine.reset()} title="Zeit auf 0, Speicher leer">Neustart</button>
      <label class="ctl">
        <span>Zeit/Div</span>
        <select value={manualDiv.value === null ? 'auto' : String(manualDiv.value)} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          manualDiv.value = v === 'auto' ? null : Number(v);
        }}>
          <option value="auto">Auto ({si(engine.auto.perDiv, 's')})</option>
          {DIVS.map((d) => <option key={d} value={String(d)}>{si(d, 's')}</option>)}
        </select>
      </label>
      <label class="ctl">
        <span>Tempo</span>
        <select value={String(tempo.value)} onChange={(e) => (tempo.value = Number((e.target as HTMLSelectElement).value))}>
          {TEMPI.map((x) => <option key={x} value={String(x)}>{x === 1 ? 'normal' : `×${x}`}</option>)}
        </select>
      </label>
      <span class="ctl-spacer" />
      <button type="button" class="btn btn-sm" disabled={!canUndo.value} onClick={undo} title="Strg+Z">Rückgängig</button>
      <button type="button" class="btn btn-sm" disabled={!canRedo.value} onClick={redo} title="Strg+Y">Wiederholen</button>
      <button type="button" class="btn btn-sm" onClick={() => void share()}>{copied ? 'Link kopiert' : 'Link teilen'}</button>
      <button type="button" class="btn btn-sm btn-danger" onClick={() => { if (!circuit.value.parts.length || confirm('Ganze Schaltung löschen?')) clearAll(); }}>Leeren</button>
    </div>
  );
}

type Tab = 'scope' | 'phasor' | 'bode' | 'values';
const TABS: [Tab, string][] = [['scope', 'Oszilloskop'], ['phasor', 'Zeiger'], ['bode', 'Frequenzgang'], ['values', 'Werte']];

export function Lab() {
  const [tab, setTab] = useState<Tab>('scope');

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, []);

  // Schaltung aus dem Link (#/et/bauen?c=…) oder Beispiel (?bsp=rc) übernehmen
  useEffect(() => {
    const q = route.value.query;
    const enc = q.get('c');
    const ex = q.get('bsp');
    if (enc) {
      const c = decodeCircuit(enc);
      if (c) loadCircuit(c, undefined, 'Geteilte Schaltung geladen.');
      history.replaceState(null, '', '#/et/bauen');
    } else if (ex) {
      loadExample(ex);
      history.replaceState(null, '', '#/et/bauen');
    }
  }, [route.value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.key === 'Escape') { tool.value = 'select'; selected.value = null; }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value) { e.preventDefault(); removePart(selected.value); }
      else if (e.key === 'r' || e.key === 'R') {
        if (tool.value !== 'select' && tool.value !== 'wire') placeRot.value = ((placeRot.value + 1) % 4) as 0 | 1 | 2 | 3;
        else if (selected.value) rotatePart(selected.value);
      } else if (e.key === 'd' || e.key === 'D') tool.value = 'wire';
      else if (e.key === ' ' && !el.closest('button')) { e.preventDefault(); running.value = !running.value; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="lab">
      <div class="lab-top">
        <label class="ctl">
          <span>Beispiel</span>
          <select value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) loadExample(v); (e.target as HTMLSelectElement).value = ''; }}>
            <option value="">Beispiel laden …</option>
            <optgroup label="Gleichstrom">{EXAMPLES.filter((x) => x.topic === 'gleich').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>
            <optgroup label="Wechselstrom">{EXAMPLES.filter((x) => x.topic === 'wechsel').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>
            <optgroup label="Schaltvorgänge">{EXAMPLES.filter((x) => x.topic === 'zeit').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>
          </select>
        </label>
        {hint.value && <p class="hint">{hint.value}<button type="button" class="btn-x" aria-label="Hinweis schliessen" onClick={() => (hint.value = '')}>×</button></p>}
      </div>
      <Palette />
      <div class="lab-main">
        <div class="lab-board">
          <Board />
          <p class="board-help small muted">
            {tool.value === 'wire' ? 'Draht: von einem Punkt zum anderen ziehen (über Eck geht automatisch).'
              : tool.value !== 'select' ? `${TOOL_LABEL[tool.value]}: auf das Raster tippen. R dreht.`
                : 'Ziehen verschiebt, vom Anschluss ziehen zeichnet einen Draht, Schalter antippen schaltet.'}
          </p>
        </div>
        <aside class="lab-side"><Inspector /></aside>
      </div>
      <Controls />
      <div class="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} class={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div class="tab-body">
        {tab === 'scope' && <Scope />}
        {tab === 'phasor' && <Phasor />}
        {tab === 'bode' && <BodePlot />}
        {tab === 'values' && <Values />}
      </div>
    </div>
  );
}

