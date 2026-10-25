/**
 * Zustand des Baukastens: Schaltung, Auswahl, Werkzeug, Verlauf (Rückgängig) und Speicherung im Browser.
 */
import { signal } from '@preact/signals';
import { type Circuit, defaults, type Kind, newId, nextName, type Part, type Pt, rotate, type Rot } from '../sim/circuit';
import { exampleById } from './examples';

export type Tool = 'select' | 'wire' | Exclude<Kind, 'wire'>;

const STORE = 'lernlabor.circuit.v1';

function load(): Circuit | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const c = JSON.parse(raw) as Circuit;
    return Array.isArray(c.parts) ? c : null;
  } catch {
    return null;
  }
}

function save(c: Circuit) {
  try { localStorage.setItem(STORE, JSON.stringify(c)); } catch { /* privater Modus: nicht speichern */ }
}

const first = exampleById('rc')!;
const stored = load();
export const circuit = signal<Circuit>(stored ?? first.make());
export const selected = signal<string | null>(stored ? null : (circuit.value.parts.find((p) => p.name === first.focus)?.id ?? null));
export const tool = signal<Tool>('select');
export const placeRot = signal<Rot>(0);
/** Hinweis zum geladenen Beispiel */
export const hint = signal<string>(stored ? '' : first.hint);

const undoStack: Circuit[] = [];
const redoStack: Circuit[] = [];
export const canUndo = signal(false);
export const canRedo = signal(false);

function syncFlags() { canUndo.value = undoStack.length > 0; canRedo.value = redoStack.length > 0; }

/** Neue Schaltung übernehmen; history: false für Bedienvorgänge wie Schalter umlegen */
export function commit(next: Circuit, history = true) {
  if (history) {
    undoStack.push(circuit.value);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    syncFlags();
  }
  circuit.value = next;
  save(next);
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(circuit.value);
  circuit.value = prev;
  save(prev);
  if (selected.value && !prev.parts.some((p) => p.id === selected.value)) selected.value = null;
  syncFlags();
}

export function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(circuit.value);
  circuit.value = next;
  save(next);
  syncFlags();
}

export const partById = (id: string | null) => (id ? circuit.value.parts.find((p) => p.id === id) ?? null : null);

export function updatePart(id: string, patch: Partial<Part>, history = true) {
  commit({ parts: circuit.value.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, history);
}

export function removePart(id: string) {
  commit({ parts: circuit.value.parts.filter((p) => p.id !== id) });
  if (selected.value === id) selected.value = null;
}

export function addPart(kind: Exclude<Kind, 'wire'>, at: Pt, rot: Rot): Part {
  const parts = circuit.value.parts;
  const part = { id: newId(), kind, name: kind === 'ground' ? '' : nextName(parts, kind), at, rot, ...defaults(kind) } as Part;
  commit({ parts: [...parts, part] });
  return part;
}

/** Draht von a nach b; nicht in einer Linie: zwei Stücke mit Ecke (erst waagrecht, dann senkrecht) */
export function addWire(a: Pt, b: Pt) {
  if (a.x === b.x && a.y === b.y) return;
  const segs: [Pt, Pt][] = a.x === b.x || a.y === b.y ? [[a, b]] : [[a, { x: b.x, y: a.y }], [{ x: b.x, y: a.y }, b]];
  const wires = segs.map(([p, q]) => ({ id: newId(), kind: 'wire' as const, name: '', at: p, rot: 0 as const, to: q, value: 0 }));
  commit({ parts: [...circuit.value.parts, ...wires] });
}

export function movePart(id: string, dx: number, dy: number) {
  if (!dx && !dy) return;
  commit({
    parts: circuit.value.parts.map((p) => (p.id === id
      ? { ...p, at: { x: p.at.x + dx, y: p.at.y + dy }, ...(p.to ? { to: { x: p.to.x + dx, y: p.to.y + dy } } : {}) }
      : p)),
  });
}

/** Dreht ein Bauteil um seine Mitte (Draht: um seinen Anfang) */
export function rotatePart(id: string) {
  const p = partById(id);
  if (!p) return;
  if (p.kind === 'wire') {
    const d = rotate({ x: p.to!.x - p.at.x, y: p.to!.y - p.at.y }, 1);
    updatePart(id, { to: { x: p.at.x + d.x, y: p.at.y + d.y } });
    return;
  }
  if (p.kind === 'ground') { updatePart(id, { rot: ((p.rot + 1) % 4) as Rot }); return; }
  const r = ((p.rot + 1) % 4) as Rot;
  const c0 = rotate({ x: 1, y: 0 }, p.rot);
  const c1 = rotate({ x: 1, y: 0 }, r);
  updatePart(id, { rot: r, at: { x: p.at.x + c0.x - c1.x, y: p.at.y + c0.y - c1.y } });
}

/** Schalter umlegen (ohne Eintrag zum Rückgängigmachen) */
export function toggleSwitch(id: string) {
  const p = partById(id);
  if (!p) return;
  if (p.kind === 'S') updatePart(id, { closed: !p.closed }, false);
  else if (p.kind === 'S2') updatePart(id, { pos: p.pos === 1 ? 0 : 1 }, false);
}

export function loadExample(id: string) {
  const ex = exampleById(id);
  if (!ex) return;
  const c = ex.make();
  commit(c);
  selected.value = c.parts.find((p) => p.name === ex.focus)?.id ?? null;
  hint.value = ex.hint;
  tool.value = 'select';
}

export function loadCircuit(c: Circuit, focus?: string, text = '') {
  commit(c);
  selected.value = focus ? (c.parts.find((p) => p.name === focus)?.id ?? null) : null;
  hint.value = text;
  tool.value = 'select';
}

export function clearAll() {
  commit({ parts: [] });
  selected.value = null;
  hint.value = 'Wähle links ein Bauteil und tippe auf das Raster. Mit «Draht» verbindest du zwei Punkte.';
}

/** Schaltung als Link teilen: Teile ohne IDs, kompakt als Base64 */
export function encodeCircuit(c: Circuit): string {
  const slim = c.parts.map(({ id: _id, ...rest }) => rest);
  const json = JSON.stringify(slim);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCircuit(s: string): Circuit | null {
  try {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(b, (ch) => ch.charCodeAt(0)));
    const parts = (JSON.parse(json) as Omit<Part, 'id'>[]).map((p) => ({ ...p, id: newId() }) as Part);
    return { parts };
  } catch {
    return null;
  }
}

/** Im Oszilloskop angeheftete Grössen (zusätzlich zum ausgewählten Bauteil) */
export interface Trace { id: string; q: 'u' | 'i' }
export const pins = signal<Trace[]>([]);

export function togglePin(t: Trace) {
  const has = pins.value.some((p) => p.id === t.id && p.q === t.q);
  pins.value = has ? pins.value.filter((p) => !(p.id === t.id && p.q === t.q)) : [...pins.value, t].slice(-4);
}
