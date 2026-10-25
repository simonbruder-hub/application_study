/**
 * Modifiziertes Knotenpotenzialverfahren (MNA).
 * Unbekannte: Knotenpotenziale (ohne Masse) und Zweigströme von Spannungsquellen, Strommessern und Spulen.
 *   Gleichstrom: C offen, L Kurzschluss
 *   Wechselstrom: komplexe Rechnung mit jωL und 1/(jωC), Zeiger mit Sinus als Bezug
 *   Zeitverlauf: Begleitmodelle mit Rückwärts-Euler (erster Schritt) und BDF2 (danach)
 * Zählpfeile: Spannung u = φ(a) − φ(b), Strom i von a nach b durch das Bauteil (Verbraucher-Zählpfeilsystem).
 */
import { type Part, sourceAt, sourceDC } from './circuit';
import { CMatrix, type LU, luDet, luFactor, luSolve } from './linalg';
import type { Elem, Netlist } from './netlist';

/** Widerstand eines geschlossenen bzw. offenen Schalters */
export const R_ON = 1e-3;
export const R_OFF = 1e12;
/** Kleiner Leitwert jedes Knotens gegen Masse, damit schwebende Knoten lösbar bleiben */
export const GMIN = 1e-12;
/** Spule bei Gleichstrom: sehr kleiner Widerstand statt idealem Kurzschluss (parallele Spulen bleiben lösbar) */
const R_L_DC = 1e-6;

type Mode =
  | { kind: 'dc' }
  | { kind: 'tran'; h: number; bdf2: boolean }
  | { kind: 'ac'; w: number }
  | { kind: 'det'; s: number };

const hasBranch = (e: Elem) => e.part.kind === 'V' || e.part.kind === 'AM' || e.part.kind === 'L';

interface Layout { size: number; branch: Map<Elem, number> }

function layout(net: Netlist): Layout {
  const branch = new Map<Elem, number>();
  let k = net.nodes;
  for (const e of net.elems) if (hasBranch(e)) branch.set(e, k++);
  return { size: k, branch };
}

/** Leitwert eines Schalterpfads */
function switchG(e: Elem, path: 0 | 1): number {
  const p = e.part;
  if (p.kind === 'S') return p.closed ? 1 / R_ON : 1 / R_OFF;
  return (p.pos ?? 0) === path ? 1 / R_ON : 1 / R_OFF;
}

function assemble(net: Netlist, lay: Layout, mode: Mode): CMatrix {
  const A = new CMatrix(lay.size);
  const Y = (i: number, j: number, re: number, im = 0) => {
    if (i) A.add(i - 1, i - 1, re, im);
    if (j) A.add(j - 1, j - 1, re, im);
    if (i && j) { A.add(i - 1, j - 1, -re, -im); A.add(j - 1, i - 1, -re, -im); }
  };
  for (let i = 0; i < net.nodes; i++) A.add(i, i, GMIN);
  for (const e of net.elems) {
    const p = e.part;
    const [a = 0, b = 0, c = 0] = e.n;
    switch (p.kind) {
      case 'R': case 'lamp':
        Y(a, b, 1 / Math.max(p.value, 1e-6));
        break;
      case 'S':
        Y(a, b, switchG(e, 0));
        break;
      case 'S2':
        Y(a, b, switchG(e, 0));
        Y(a, c, switchG(e, 1));
        break;
      case 'C':
        if (mode.kind === 'tran') Y(a, b, ((mode.bdf2 ? 1.5 : 1) * p.value) / mode.h);
        else if (mode.kind === 'ac') Y(a, b, 0, mode.w * p.value);
        else if (mode.kind === 'det') Y(a, b, mode.s * p.value);
        break;
      case 'V': case 'AM': case 'L': {
        const k = lay.branch.get(e)!;
        if (a) { A.add(a - 1, k, 1); A.add(k, a - 1, 1); }
        if (b) { A.add(b - 1, k, -1); A.add(k, b - 1, -1); }
        let zr = 0, zi = 0;
        if (p.kind === 'L') {
          if (mode.kind === 'tran') zr = ((mode.bdf2 ? 1.5 : 1) * p.value) / mode.h;
          else if (mode.kind === 'ac') zi = mode.w * p.value;
          else if (mode.kind === 'det') zr = mode.s * p.value;
          else zr = R_L_DC;
        }
        // Beide Anschlüsse am gleichen Knoten: Strom bleibt bestimmt (Strommesser 0, Spule behält ihren Strom)
        if (a === b && zr === 0 && zi === 0 && p.kind !== 'V') zr = 1;
        A.add(k, k, -zr, -zi);
        break;
      }
      default:
        break;
    }
  }
  return A;
}

/** Speicherzustand für den Zeitverlauf: C: Spannungen, L: Ströme der letzten zwei Schritte */
export interface Hist { x1: number; x2: number }

function rhs(net: Netlist, lay: Layout, mode: Mode, t: number, hist: Map<string, Hist> | null, phasor: (p: Part) => [number, number]) {
  const re = new Float64Array(lay.size);
  const im = new Float64Array(lay.size);
  const inj = (i: number, j: number, vr: number, vi = 0) => {
    // Strom vr+j·vi fliesst aus dem Bauteil in Knoten i und aus Knoten j ins Bauteil
    if (i) { re[i - 1]! += vr; im[i - 1]! += vi; }
    if (j) { re[j - 1]! -= vr; im[j - 1]! -= vi; }
  };
  for (const e of net.elems) {
    const p = e.part;
    const [a = 0, b = 0] = e.n;
    if (p.kind === 'V') {
      const k = lay.branch.get(e)!;
      if (mode.kind === 'dc') re[k] = sourceDC(p);
      else if (mode.kind === 'tran') re[k] = sourceAt(p, t);
      else if (mode.kind === 'ac') [re[k], im[k]] = phasor(p);
    } else if (p.kind === 'I') {
      if (mode.kind === 'dc') inj(a, b, sourceDC(p));
      else if (mode.kind === 'tran') inj(a, b, sourceAt(p, t));
      else if (mode.kind === 'ac') inj(a, b, ...phasor(p));
    } else if (mode.kind === 'tran' && hist) {
      const hs = hist.get(p.id) ?? { x1: 0, x2: 0 };
      if (p.kind === 'C') {
        const ih = mode.bdf2 ? (p.value / (2 * mode.h)) * (hs.x2 - 4 * hs.x1) : -(p.value / mode.h) * hs.x1;
        inj(a, b, -ih);
      } else if (p.kind === 'L') {
        const k = lay.branch.get(e)!;
        re[k] = mode.bdf2 ? -(p.value / (2 * mode.h)) * (4 * hs.x1 - hs.x2) : -(p.value / mode.h) * hs.x1;
      }
    }
  }
  return { re, im };
}

export interface Solution {
  ok: boolean;
  error?: string;
  /** Knotenpotenziale, Index 0 = Masse */
  vRe: Float64Array;
  vIm: Float64Array;
  /** Je Element (Reihenfolge wie net.elems) */
  uRe: Float64Array;
  uIm: Float64Array;
  iRe: Float64Array;
  iIm: Float64Array;
}

function check(net: Netlist): string | undefined {
  for (const e of net.elems) {
    if (e.part.kind === 'V' && e.n[0] === e.n[1]) return `${e.part.name} ist kurzgeschlossen.`;
  }
  return undefined;
}

const SINGULAR = 'Die Schaltung ist so nicht lösbar: Masche nur aus Spannungsquellen oder kurzgeschlossene Quelle.';

function readout(net: Netlist, lay: Layout, mode: Mode, x: { re: Float64Array; im: Float64Array }, hist: Map<string, Hist> | null, t: number): Solution {
  const N = net.elems.length;
  const vRe = new Float64Array(net.nodes + 1);
  const vIm = new Float64Array(net.nodes + 1);
  for (let i = 1; i <= net.nodes; i++) { vRe[i] = x.re[i - 1]!; vIm[i] = x.im[i - 1]!; }
  const uRe = new Float64Array(N), uIm = new Float64Array(N), iRe = new Float64Array(N), iIm = new Float64Array(N);
  net.elems.forEach((e, idx) => {
    const p = e.part;
    const [a = 0, b = 0, c = 0] = e.n;
    let ur = vRe[a]! - vRe[b]!, ui = vIm[a]! - vIm[b]!;
    let ir = 0, ii = 0;
    switch (p.kind) {
      case 'R': case 'lamp': { const g = 1 / Math.max(p.value, 1e-6); ir = g * ur; ii = g * ui; break; }
      case 'S': { const g = switchG(e, 0); ir = g * ur; ii = g * ui; break; }
      case 'S2': {
        const g0 = switchG(e, 0), g1 = switchG(e, 1);
        const u0r = ur, u0i = ui;
        const u1r = vRe[a]! - vRe[c]!, u1i = vIm[a]! - vIm[c]!;
        ir = g0 * u0r + g1 * u1r; ii = g0 * u0i + g1 * u1i;
        if ((p.pos ?? 0) === 1) { ur = u1r; ui = u1i; }
        break;
      }
      case 'C':
        if (mode.kind === 'tran') {
          const hs = hist?.get(p.id) ?? { x1: 0, x2: 0 };
          const g = ((mode.bdf2 ? 1.5 : 1) * p.value) / mode.h;
          const ih = mode.bdf2 ? (p.value / (2 * mode.h)) * (hs.x2 - 4 * hs.x1) : -(p.value / mode.h) * hs.x1;
          ir = g * ur + ih;
        } else if (mode.kind === 'ac') { ir = -mode.w * p.value * ui; ii = mode.w * p.value * ur; }
        break;
      case 'V': case 'AM': case 'L': { const k = lay.branch.get(e)!; ir = x.re[k]!; ii = x.im[k]!; break; }
      case 'I':
        if (mode.kind === 'dc') ir = -sourceDC(p);
        else if (mode.kind === 'tran') ir = -sourceAt(p, t);
        break;
      default: break;
    }
    uRe[idx] = ur; uIm[idx] = ui; iRe[idx] = ir; iIm[idx] = ii;
  });
  return { ok: true, vRe, vIm, uRe, uIm, iRe, iIm };
}

function failed(net: Netlist, error: string): Solution {
  const N = net.elems.length;
  const z = () => new Float64Array(N);
  return { ok: false, error, vRe: new Float64Array(net.nodes + 1), vIm: new Float64Array(net.nodes + 1), uRe: z(), uIm: z(), iRe: z(), iIm: z() };
}

/** Gleichstrom-Arbeitspunkt (Sinus- und Rechteckquellen mit ihrem Gleichanteil) */
export function solveDC(net: Netlist): Solution {
  const err = check(net);
  if (err) return failed(net, err);
  const lay = layout(net);
  const mode: Mode = { kind: 'dc' };
  const lu = luFactor(assemble(net, lay, mode));
  if (!lu.ok) return failed(net, SINGULAR);
  const b = rhs(net, lay, mode, 0, null, () => [0, 0]);
  return readout(net, lay, mode, luSolve(lu, b.re, b.im), null, 0);
}

/**
 * Wechselstromrechnung bei der Frequenz f. Es wirken nur Sinusquellen dieser Frequenz
 * (Zeiger Amplitude·e^{jφ}); mit `only` wirkt nur diese Quelle mit dem Zeiger 1.
 */
export function solveAC(net: Netlist, f: number, only?: string): Solution {
  const err = check(net);
  if (err) return failed(net, err);
  const lay = layout(net);
  const mode: Mode = { kind: 'ac', w: 2 * Math.PI * f };
  const lu = luFactor(assemble(net, lay, mode));
  if (!lu.ok) return failed(net, SINGULAR);
  const phasor = (p: Part): [number, number] => {
    if (only !== undefined) return p.id === only ? [1, 0] : [0, 0];
    if (p.shape !== 'sine' || Math.abs((p.freq ?? 50) - f) > 1e-9 * f) return [0, 0];
    const ph = ((p.phase ?? 0) * Math.PI) / 180;
    return [p.value * Math.cos(ph), p.value * Math.sin(ph)];
  };
  const b = rhs(net, lay, mode, 0, null, phasor);
  return readout(net, lay, mode, luSolve(lu, b.re, b.im), null, 0);
}

/** Determinante der MNA-Matrix mit s statt jω, alle Quellen null (Nullstellen = Eigenwerte der Schaltung) */
export function charDet(net: Netlist, s: number): number {
  const lay = layout(net);
  return luDet(luFactor(assemble(net, lay, { kind: 'det', s }))).re;
}

/**
 * Zeitverlauf mit festem Zeitschritt h. Startet energielos (alle u_C = 0, i_L = 0) oder mit übergebenem Zustand
 * (nach einer Änderung an der Schaltung läuft die Simulation stetig weiter).
 */
export class Transient {
  t: number;
  readonly h: number;
  readonly error?: string;
  private readonly lay: Layout;
  private luBE: LU | null = null;
  private luBDF: LU | null = null;
  private steps = 0;
  readonly hist = new Map<string, Hist>();
  last: Solution;

  constructor(readonly net: Netlist, h: number, init?: Map<string, Hist>, t0 = 0) {
    this.h = h;
    this.t = t0;
    this.lay = layout(net);
    this.error = check(net);
    for (const e of net.elems) {
      if (e.part.kind === 'C' || e.part.kind === 'L') {
        const s = init?.get(e.part.id);
        this.hist.set(e.part.id, s ? { x1: s.x1, x2: s.x1 } : { x1: 0, x2: 0 });
      }
    }
    if (!this.error) {
      this.luBE = luFactor(assemble(net, this.lay, { kind: 'tran', h, bdf2: false }));
      this.luBDF = luFactor(assemble(net, this.lay, { kind: 'tran', h, bdf2: true }));
      if (!this.luBE.ok || !this.luBDF.ok) this.error = SINGULAR;
    }
    this.last = this.error ? failed(net, this.error) : this.initial();
  }

  /** Werte zum Startzeitpunkt (Speicher im Anfangszustand) */
  private initial(): Solution {
    // Ein sehr kleiner Rückwärts-Euler-Schritt bildet den Anfangszustand nach (C hält u, L hält i)
    const h = this.h * 1e-6;
    const mode: Mode = { kind: 'tran', h, bdf2: false };
    const lu = luFactor(assemble(this.net, this.lay, mode));
    const b = rhs(this.net, this.lay, mode, this.t, this.hist, () => [0, 0]);
    return readout(this.net, this.lay, mode, luSolve(lu, b.re, b.im), this.hist, this.t);
  }

  step(): Solution {
    if (this.error) { this.t += this.h; return this.last; }
    const bdf2 = this.steps > 0;
    const mode: Mode = { kind: 'tran', h: this.h, bdf2 };
    const tn = this.t + this.h;
    const b = rhs(this.net, this.lay, mode, tn, this.hist, () => [0, 0]);
    const x = luSolve(bdf2 ? this.luBDF! : this.luBE!, b.re, b.im);
    const sol = readout(this.net, this.lay, mode, x, this.hist, tn);
    this.net.elems.forEach((e, idx) => {
      const hs = this.hist.get(e.part.id);
      if (!hs) return;
      hs.x2 = hs.x1;
      hs.x1 = e.part.kind === 'C' ? sol.uRe[idx]! : sol.iRe[idx]!;
    });
    this.t = tn;
    this.steps++;
    this.last = sol;
    return sol;
  }
}
