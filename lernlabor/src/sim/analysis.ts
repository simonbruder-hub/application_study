/**
 * Kennwerte der Schaltung: Zeitkonstante, Eigenfrequenz, Dämpfung, Grenzfrequenz, Frequenzgang.
 * Die Eigenwerte sind die Nullstellen von det(Y(s)) der MNA-Matrix. Für Schaltungen 1. und 2. Ordnung ist
 * das ein Polynom 1. bzw. 2. Grades in s, das aus drei Stützstellen exakt bestimmt wird.
 */
import { isSource } from './circuit';
import { charDet, solveAC } from './mna';
import type { Netlist } from './netlist';

export type Damping = 'aperiodisch' | 'grenzfall' | 'schwingfall' | 'ungedaempft';

export interface Modes {
  order: number;
  /** 1. Ordnung: Zeitkonstante τ in s und Grenzfrequenz f_g = 1/(2πτ) */
  tau?: number;
  fg?: number;
  /** 2. Ordnung: Kennkreisfrequenz ω0, Abklingkonstante δ, Eigenfrequenz der gedämpften Schwingung */
  f0?: number;
  delta?: number;
  fd?: number;
  Q?: number;
  damping?: Damping;
  /** Zeitkonstanten der beiden Anteile im aperiodischen Fall */
  taus?: [number, number];
}

function storages(net: Netlist) {
  return net.elems.filter((e) => (e.part.kind === 'C' || e.part.kind === 'L') && e.n[0] !== e.n[1] && e.part.value > 0);
}

/** Typischer Widerstand der Schaltung (geometrisches Mittel), für die Wahl der Stützstellen */
function typicalR(net: Netlist): number {
  const rs = net.elems.filter((e) => e.part.kind === 'R' || e.part.kind === 'lamp').map((e) => Math.max(e.part.value, 1e-3));
  if (!rs.length) return 100;
  return Math.exp(rs.reduce((s, r) => s + Math.log(r), 0) / rs.length);
}

const geoMean = (xs: number[]) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);

export function naturalModes(net: Netlist): Modes {
  const st = storages(net);
  const order = st.length;
  if (order === 0 || order > 2) return { order };
  const R = typicalR(net);
  const Ls = st.filter((e) => e.part.kind === 'L').map((e) => e.part.value);
  const Cs = st.filter((e) => e.part.kind === 'C').map((e) => e.part.value);
  let s0: number;
  if (Ls.length && Cs.length) s0 = 1 / Math.sqrt(Ls[0]! * Cs[0]!);
  else if (Cs.length) s0 = 1 / (R * geoMean(Cs));
  else s0 = R / geoMean(Ls);
  const p0 = charDet(net, 0);
  const pp = charDet(net, s0);
  const pm = charDet(net, -s0);
  // det(s) = a s² + b s + c, mit x = s/s0 skaliert
  const a = (pp + pm - 2 * p0) / 2; // Koeffizient von x²
  const b = (pp - pm) / 2; // Koeffizient von x
  const c = p0;
  const size = Math.abs(a) + Math.abs(b) + Math.abs(c);
  if (size === 0 || !Number.isFinite(size)) return { order };
  const firstOrder = (bb: number, cc: number): Modes => {
    const root = -cc / bb; // in Einheiten von s0
    const s = root * s0;
    const tau = s < 0 ? -1 / s : Infinity;
    return { order: 1, tau, fg: Number.isFinite(tau) ? 1 / (2 * Math.PI * tau) : 0 };
  };
  if (order === 1 || Math.abs(a) < 1e-9 * size) {
    if (Math.abs(b) < 1e-12 * size) return { order };
    return firstOrder(b, c);
  }
  // Normiert: x² + 2·d·x + w² = 0
  const d = b / (2 * a);
  const w2 = c / a;
  const w0 = Math.sqrt(Math.max(w2, 0)) * s0;
  const delta = d * s0;
  const f0 = w0 / (2 * Math.PI);
  const disc = d * d - w2; // in Einheiten von s0²
  const rel = Math.abs(disc) / Math.max(d * d, Math.abs(w2), 1e-300);
  const Q = delta > 0 ? w0 / (2 * delta) : Infinity;
  if (rel < 1e-6) return { order: 2, f0, delta, Q, damping: 'grenzfall', taus: [1 / delta, 1 / delta] };
  if (disc > 0) {
    const r = Math.sqrt(disc);
    const s1 = (-d + r) * s0, s2 = (-d - r) * s0;
    return { order: 2, f0, delta, Q, damping: 'aperiodisch', taus: [s1 < 0 ? -1 / s1 : Infinity, s2 < 0 ? -1 / s2 : Infinity] };
  }
  const wd = Math.sqrt(-disc) * s0;
  return { order: 2, f0, delta, Q, fd: wd / (2 * Math.PI), damping: Q > 1e6 ? 'ungedaempft' : 'schwingfall' };
}

export interface Bode { f: number[]; mag: number[]; db: number[]; phase: number[] }

/** Frequenzgang H(f) = U_Ziel / U_Quelle (oder I_Ziel / Quelle) von fmin bis fmax, logarithmisch */
export function bode(net: Netlist, sourceId: string, targetIdx: number, fmin: number, fmax: number, n = 160, qty: 'u' | 'i' = 'u'): Bode {
  const out: Bode = { f: [], mag: [], db: [], phase: [] };
  const l0 = Math.log10(fmin), l1 = Math.log10(fmax);
  let lastPhase: number | null = null;
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? fmin : 10 ** (l0 + ((l1 - l0) * k) / (n - 1));
    const sol = solveAC(net, f, sourceId);
    if (!sol.ok) break;
    const re = qty === 'u' ? sol.uRe[targetIdx]! : sol.iRe[targetIdx]!;
    const im = qty === 'u' ? sol.uIm[targetIdx]! : sol.iIm[targetIdx]!;
    const mag = Math.hypot(re, im);
    let ph = (Math.atan2(im, re) * 180) / Math.PI;
    // Phase stetig halten
    if (lastPhase !== null) { while (ph - lastPhase > 180) ph -= 360; while (ph - lastPhase < -180) ph += 360; }
    lastPhase = ph;
    out.f.push(f); out.mag.push(mag); out.db.push(20 * Math.log10(Math.max(mag, 1e-30))); out.phase.push(ph);
  }
  return out;
}

/** Frequenz für die Wechselstromrechnung: alle Sinusquellen mit gleicher Frequenz, sonst null */
export function acFrequency(net: Netlist): number | null {
  const src = net.elems.filter((e) => isSource(e.part.kind));
  const sines = src.filter((e) => e.part.shape === 'sine' && e.part.value !== 0);
  if (!sines.length) return null;
  const f = sines[0]!.part.freq ?? 50;
  if (sines.some((e) => Math.abs((e.part.freq ?? 50) - f) > 1e-9 * f)) return null;
  return f;
}

/** Nur Gleichquellen (der Zeitverlauf endet im Gleichstrom-Arbeitspunkt) */
export const onlyDC = (net: Netlist) => net.elems.every((e) => !isSource(e.part.kind) || (e.part.shape ?? 'dc') === 'dc');

/** Rundet auf 1-2-5-Schritte */
export function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return n * 10 ** e;
}

export interface Timing {
  /** Zeit pro Teilung des Oszilloskops (10 Teilungen) */
  perDiv: number;
  /** Zeitschritt der Simulation */
  h: number;
}

/** Wählt Zeitbasis und Zeitschritt aus Quellenfrequenzen und Eigenwerten */
export function autoTiming(net: Netlist, modes: Modes): Timing {
  const periods = net.elems.filter((e) => isSource(e.part.kind) && (e.part.shape ?? 'dc') !== 'dc' && (e.part.freq ?? 0) > 0).map((e) => 1 / e.part.freq!);
  const slow: number[] = [];
  const fast: number[] = [];
  if (modes.tau && Number.isFinite(modes.tau)) { slow.push(8 * modes.tau); fast.push(modes.tau); }
  if (modes.taus) for (const t of modes.taus) if (Number.isFinite(t)) { slow.push(6 * t); fast.push(t); }
  if (modes.fd) { slow.push(4 / modes.fd); fast.push(1 / (2 * Math.PI * modes.fd)); }
  else if (modes.f0 && modes.damping === 'ungedaempft') { slow.push(4 / modes.f0); fast.push(1 / (2 * Math.PI * modes.f0)); }
  if (modes.delta && modes.delta > 0 && modes.damping === 'schwingfall') slow.push(Math.min(5 / modes.delta, 12 / (modes.fd ?? modes.f0 ?? 1)));
  let sweep: number;
  if (periods.length) {
    const T = Math.max(...periods);
    sweep = 3 * T;
  } else if (slow.length) sweep = Math.max(...slow);
  else sweep = 10;
  const perDiv = niceStep(sweep / 10);
  const minT = Math.min(...periods.map((T) => T / 200), ...fast.map((t) => t / 25), (perDiv * 10) / 2000);
  return { perDiv, h: minT };
}
