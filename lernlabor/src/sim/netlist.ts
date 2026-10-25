/**
 * Aus den Bauteilen auf dem Raster wird eine Netzliste: Anschlüsse am gleichen Punkt, auf einem Draht
 * oder über Drähte verbunden bilden einen Knoten. Knoten 0 ist die Masse (Bezugspotenzial).
 */
import { type Circuit, key, type Part, type Pt, terminals } from './circuit';

export interface Elem {
  part: Part;
  /** Knoten je Anschluss (0 = Masse) */
  n: number[];
}

export interface Netlist {
  /** Anzahl Knoten ohne Masse */
  nodes: number;
  elems: Elem[];
  /** Rasterpunkt → Knoten */
  nodeOf: Map<string, number>;
  /** Punkte mit drei oder mehr Verbindungen (Verbindungspunkt zeichnen) */
  junctions: Pt[];
  /** Offene Anschlüsse (nur eine Verbindung) */
  open: Pt[];
  /** Masse gesetzt; sonst wurde ein Bezugsknoten gewählt */
  hasGround: boolean;
}

class DSU {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) { this.parent.set(a, a); return a; }
    if (p === a) return a;
    p = this.find(p);
    this.parent.set(a, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Liegt q im Innern der Strecke a–b (nicht auf den Enden)? */
function onSegment(q: Pt, a: Pt, b: Pt): boolean {
  if ((q.x === a.x && q.y === a.y) || (q.x === b.x && q.y === b.y)) return false;
  const cross = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
  if (cross !== 0) return false;
  const dot = (q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y);
  const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot > 0 && dot < len;
}

export function buildNetlist(c: Circuit): Netlist {
  const dsu = new DSU();
  const wires = c.parts.filter((p) => p.kind === 'wire' && p.to && key(p.at) !== key(p.to));
  const comps = c.parts.filter((p) => p.kind !== 'wire');
  // Verbindungen je Punkt zählen (Draht durch einen Punkt zählt doppelt)
  const count = new Map<string, number>();
  const pts = new Map<string, Pt>();
  const bump = (p: Pt, n = 1) => { const k = key(p); count.set(k, (count.get(k) ?? 0) + n); pts.set(k, p); dsu.find(k); };

  for (const w of wires) {
    const [a, b] = terminals(w) as [Pt, Pt];
    bump(a); bump(b);
    dsu.union(key(a), key(b));
  }
  for (const p of comps) for (const t of terminals(p)) bump(t);
  // Punkte, die im Innern eines Drahts liegen, sind mit ihm verbunden
  for (const [k, q] of [...pts]) {
    for (const w of wires) {
      if (onSegment(q, w.at, w.to!)) { dsu.union(k, key(w.at)); bump(q, 2); }
    }
  }
  const GND = 'GND';
  let hasGround = false;
  for (const p of comps) {
    if (p.kind === 'ground') { dsu.union(key(p.at), GND); hasGround = true; }
  }
  if (!hasGround) {
    // Bezug: Minuspol der ersten Quelle, sonst irgendein Anschluss
    const src = comps.find((p) => p.kind === 'V' || p.kind === 'I');
    const first = src ? terminals(src)[1] : comps.map((p) => terminals(p)[0]).find(Boolean);
    if (first) dsu.union(key(first), GND);
  }
  const ground = dsu.find(GND);
  const index = new Map<string, number>();
  let nodes = 0;
  const nodeOf = new Map<string, number>();
  for (const k of pts.keys()) {
    const r = dsu.find(k);
    if (r === ground) { nodeOf.set(k, 0); continue; }
    let i = index.get(r);
    if (i === undefined) { i = ++nodes; index.set(r, i); }
    nodeOf.set(k, i);
  }
  const elems: Elem[] = comps
    .filter((p) => p.kind !== 'ground')
    .map((p) => ({ part: p, n: terminals(p).map((t) => nodeOf.get(key(t)) ?? 0) }));
  const junctions: Pt[] = [];
  const open: Pt[] = [];
  for (const [k, n] of count) {
    if (n >= 3) junctions.push(pts.get(k)!);
    else if (n === 1) open.push(pts.get(k)!);
  }
  return { nodes, elems, nodeOf, junctions, open, hasGround };
}
