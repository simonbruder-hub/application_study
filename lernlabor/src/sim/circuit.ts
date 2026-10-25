/**
 * Schaltungsmodell: Bauteile auf einem Raster. Jedes Bauteil hat Anschlüsse auf Rasterpunkten;
 * Anschlüsse am gleichen Punkt (oder auf einem Draht) sind verbunden.
 */

export type Kind = 'wire' | 'R' | 'L' | 'C' | 'V' | 'I' | 'S' | 'S2' | 'lamp' | 'VM' | 'AM' | 'ground';
export type Shape = 'dc' | 'sine' | 'square';
export type Rot = 0 | 1 | 2 | 3;

export interface Pt { x: number; y: number }

export interface Part {
  id: string;
  kind: Kind;
  /** Name wie R1, C2 (für Anzeige und Aufgaben) */
  name: string;
  /** Erster Anschluss (Draht: Anfang) */
  at: Pt;
  /** Drehung in 90°-Schritten im Uhrzeigersinn */
  rot: Rot;
  /** Drahtende */
  to?: Pt;
  /** R in Ω, L in H, C in F, Quelle: Gleichwert bzw. Amplitude in V oder A, Lampe: Widerstand in Ω */
  value: number;
  /** Quellen: Kurvenform */
  shape?: Shape;
  /** Quellen: Frequenz in Hz */
  freq?: number;
  /** Quellen: Nullphasenwinkel in Grad (Bezug Sinus) */
  phase?: number;
  /** Quellen: Gleichanteil bei Sinus und Rechteck */
  offset?: number;
  /** Schalter: geschlossen */
  closed?: boolean;
  /** Umschalter: 0 = oberer Kontakt, 1 = unterer Kontakt */
  pos?: 0 | 1;
  /** Lampe: Nennleistung in W (für die Helligkeit) */
  power?: number;
}

export interface Circuit { parts: Part[] }

/** Lage der Anschlüsse bei Drehung 0 (vor dem Drehen) */
const LOCAL: Record<Exclude<Kind, 'wire'>, Pt[]> = {
  R: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  L: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  C: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  V: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  I: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  S: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  lamp: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  VM: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  AM: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
  S2: [{ x: 0, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }],
  ground: [{ x: 0, y: 0 }],
};

/** Dreht einen Punkt um k·90° im Uhrzeigersinn (y zeigt nach unten) */
export function rotate(p: Pt, k: Rot): Pt {
  let { x, y } = p;
  for (let i = 0; i < k; i++) [x, y] = [-y, x];
  return { x: x + 0, y: y + 0 };
}

export function terminals(p: Part): Pt[] {
  if (p.kind === 'wire') return [p.at, p.to ?? p.at];
  return LOCAL[p.kind].map((o) => {
    const r = rotate(o, p.rot);
    return { x: p.at.x + r.x, y: p.at.y + r.y };
  });
}

export const key = (p: Pt) => `${p.x},${p.y}`;

/** Bauteile mit zwei Anschlüssen, deren Spannung und Strom angezeigt werden */
export const isTwoTerminal = (k: Kind) => k !== 'wire' && k !== 'ground' && k !== 'S2';
export const isSource = (k: Kind) => k === 'V' || k === 'I';
export const isStorage = (k: Kind) => k === 'L' || k === 'C';

export const KIND_LABEL: Record<Kind, string> = {
  wire: 'Draht', R: 'Widerstand', L: 'Spule', C: 'Kondensator', V: 'Spannungsquelle', I: 'Stromquelle',
  S: 'Schalter', S2: 'Umschalter', lamp: 'Lampe', VM: 'Spannungsmesser', AM: 'Strommesser', ground: 'Masse',
};

/** Buchstabe für automatische Namen (R1, L1 …) */
const PREFIX: Record<Kind, string> = {
  wire: 'D', R: 'R', L: 'L', C: 'C', V: 'U', I: 'I', S: 'S', S2: 'S', lamp: 'H', VM: 'V', AM: 'A', ground: 'GND',
};

export function nextName(parts: Part[], kind: Kind): string {
  const pre = PREFIX[kind];
  const used = new Set(parts.map((p) => p.name));
  for (let i = 1; ; i++) if (!used.has(`${pre}${i}`)) return `${pre}${i}`;
}

let seq = 0;
export const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Standardwerte beim Platzieren */
export function defaults(kind: Kind): Partial<Part> {
  switch (kind) {
    case 'R': return { value: 100 };
    case 'L': return { value: 0.1 };
    case 'C': return { value: 100e-6 };
    case 'V': return { value: 10, shape: 'dc', freq: 50, phase: 0, offset: 0 };
    case 'I': return { value: 0.01, shape: 'dc', freq: 50, phase: 0, offset: 0 };
    case 'S': return { value: 0, closed: false };
    case 'S2': return { value: 0, pos: 0 };
    case 'lamp': return { value: 100, power: 1 };
    default: return { value: 0 };
  }
}

/** Wert einer Quelle zur Zeit t */
export function sourceAt(p: Part, t: number): number {
  const shape = p.shape ?? 'dc';
  if (shape === 'dc') return p.value;
  const f = p.freq ?? 50;
  const ph = ((p.phase ?? 0) * Math.PI) / 180;
  const off = p.offset ?? 0;
  if (shape === 'sine') return off + p.value * Math.sin(2 * Math.PI * f * t + ph);
  const x = f * t + ph / (2 * Math.PI);
  const frac = x - Math.floor(x);
  return off + (frac < 0.5 ? p.value : -p.value);
}

/** Gleichanteil einer Quelle */
export const sourceDC = (p: Part) => ((p.shape ?? 'dc') === 'dc' ? p.value : (p.offset ?? 0));
