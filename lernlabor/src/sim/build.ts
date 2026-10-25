/**
 * Kurzschreibweise für Schaltungen im Code (Beispiele, Aufgaben, Tests):
 * Bauteile werden über ihre zwei Anschlusspunkte angegeben.
 */
import { type Circuit, defaults, type Kind, newId, nextName, type Part, type Pt, type Rot } from './circuit';

export const P = (x: number, y: number): Pt => ({ x, y });

/** Drehung aus der Richtung von a nach b (Abstand 2 auf dem Raster) */
function rotOf(a: Pt, b: Pt): Rot {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 2 && dy === 0) return 0;
  if (dx === 0 && dy === 2) return 1;
  if (dx === -2 && dy === 0) return 2;
  if (dx === 0 && dy === -2) return 3;
  throw new Error(`Bauteil braucht zwei Rasterpunkte im Abstand 2: ${a.x},${a.y} → ${b.x},${b.y}`);
}

type Props = Partial<Omit<Part, 'id' | 'kind' | 'at' | 'rot' | 'to'>>;

/** Zweipol von a nach b; bei Quellen ist a der Pluspol (Spannung) bzw. der Anschluss, aus dem der Strom fliesst */
export function two(kind: Kind, a: Pt, b: Pt, props: Props = {}): Part {
  return { id: newId(), kind, name: '', at: a, rot: rotOf(a, b), ...defaults(kind), value: 0, ...props } as Part;
}

/** Umschalter: Mittelanschluss c, Kontakte bei Drehung 0 oben rechts (Stellung 0) und unten rechts (Stellung 1) */
export function spdt(c: Pt, rot: Rot, pos: 0 | 1, name = ''): Part {
  return { id: newId(), kind: 'S2', name, at: c, rot, value: 0, pos };
}

export const wire = (a: Pt, b: Pt): Part => ({ id: newId(), kind: 'wire', name: '', at: a, rot: 0, to: b, value: 0 });
export const gnd = (a: Pt): Part => ({ id: newId(), kind: 'ground', name: '', at: a, rot: 0, value: 0 });

/** Linienzug aus Drähten */
export const wires = (...pts: Pt[]): Part[] => pts.slice(1).map((p, i) => wire(pts[i]!, p));

/** Fasst Bauteile zusammen und vergibt fehlende Namen */
export function circuit(...items: (Part | Part[])[]): Circuit {
  const parts: Part[] = [];
  for (const it of items.flat()) {
    parts.push(it.name || it.kind === 'wire' || it.kind === 'ground' ? it : { ...it, name: nextName(parts, it.kind) });
  }
  return { parts };
}

export const byName = (c: Circuit, name: string) => {
  const p = c.parts.find((x) => x.name === name);
  if (!p) throw new Error(`Bauteil ${name} fehlt`);
  return p;
};
