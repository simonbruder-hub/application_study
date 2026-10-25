/**
 * Jede Aufgabe wird mit vielen Zufallswerten erzeugt und ihre Lösung mit dem Rechenkern
 * (Gleichstrom, Zeigerrechnung, Zeitverlauf, Kennwerte) an der mitgelieferten Schaltung nachgeprüft.
 */
import { naturalModes } from '../../sim/analysis';
import type { Circuit } from '../../sim/circuit';
import { solveAC, solveDC, Transient } from '../../sim/mna';
import { buildNetlist } from '../../sim/netlist';
import { isCorrect, rng, type Task } from '../task';
import { TASKS } from './tasks';

function ix(c: Circuit, name: string) {
  const net = buildNetlist(c);
  const k = net.elems.findIndex((e) => e.part.name === name);
  if (k < 0) throw new Error(`${name} fehlt`);
  return { net, k };
}

const dc = (c: Circuit, name: string) => {
  const { net, k } = ix(c, name);
  const s = solveDC(net);
  return { u: s.uRe[k]!, i: s.iRe[k]! };
};

function ac(c: Circuit, name: string) {
  const { net, k } = ix(c, name);
  const src = net.elems.find((e) => e.part.kind === 'V')!.part;
  const s = solveAC(net, src.freq!);
  return { U: Math.hypot(s.uRe[k]!, s.uIm[k]!) / Math.SQRT2, I: Math.hypot(s.iRe[k]!, s.iIm[k]!) / Math.SQRT2, s, k, net };
}

/** Zeitverlauf: zuerst in Stellung pos0 einschwingen lassen (optional), dann umschalten und bis t rechnen */
function tran(c: Circuit, name: string, t: number, opts: { preCharge?: boolean } = {}) {
  const modes = naturalModes(buildNetlist(c));
  const tau = modes.tau ?? 1;
  let parts = c.parts;
  let hist;
  if (opts.preCharge) {
    const sim0 = new Transient(buildNetlist({ parts }), tau / 200);
    for (let k = 0; k < 200 * 12; k++) sim0.step();
    hist = sim0.hist;
    parts = parts.map((p) => (p.kind === 'S2' ? { ...p, pos: 0 as const } : p));
  }
  const { net, k } = ix({ parts }, name);
  const h = Math.min(tau, t) / 2000;
  const sim = new Transient(net, h, hist);
  const steps = Math.round(t / h);
  for (let s = 0; s < steps; s++) sim.step();
  return { u: sim.last.uRe[k]!, i: sim.last.iRe[k]!, first: new Transient(net, h, hist).last.iRe[k]! };
}

/** Messwerte aus dem Rechenkern je Aufgabe */
const MEASURE: Record<string, (t: Task) => Record<string, number>> = {
  ohm: (t) => { const r = dc(t.circuit!, 'R1'); return { I: r.i, P: r.u * r.i }; },
  teiler: (t) => ({ I: dc(t.circuit!, 'R1').i, U2: dc(t.circuit!, 'R2').u }),
  gemischt: (t) => {
    const r1 = dc(t.circuit!, 'R1'), r2 = dc(t.circuit!, 'R2'), u = dc(t.circuit!, 'U1');
    return { Rg: u.u / r1.i, I: r1.i, U2: r2.u, I2: r2.i };
  },
  belastet: (t) => {
    const loaded = dc(t.circuit!, 'RL').u;
    const open = dc({ parts: t.circuit!.parts.filter((p) => p.name !== 'RL') }, 'R2').u;
    return { U20: open, U2L: loaded };
  },
  knoten: (t) => ({ phi: dc(t.circuit!, 'R3').u, I3: dc(t.circuit!, 'R3').i, I1: dc(t.circuit!, 'R1').i }),
  ersatzquelle: (t) => {
    const open = dc({ parts: t.circuit!.parts.filter((p) => p.name !== 'RL') }, 'R2').u;
    // Kurzschlussstrom an den Klemmen von RL ergibt R_i = U_0 / I_k
    const shorted = { parts: t.circuit!.parts.map((p) => (p.name === 'RL' ? { ...p, value: 1e-6 } : p)) };
    const Ik = dc(shorted, 'RL').i;
    return { U0: open, Ri: open / Ik, IL: dc(t.circuit!, 'RL').i };
  },
  blind: (t) => { const l = ac(t.circuit!, 'L1'), c = ac(t.circuit!, 'C1'); return { XL: l.U / l.I, XC: c.U / c.I }; },
  'rc-sinus': (t) => {
    const r = ac(t.circuit!, 'R1'), c = ac(t.circuit!, 'C1'), src = ac(t.circuit!, 'U1');
    const { s, k } = src;
    // φ = φ_u − φ_i an der Quelle (abgegebener Strom = −i)
    const phi = (Math.atan2(s.uIm[k]!, s.uRe[k]!) - Math.atan2(-s.iIm[k]!, -s.iRe[k]!)) * 180 / Math.PI;
    return { Z: src.U / r.I, phi, I: r.I, UC: c.U };
  },
  'rl-leistung': (t) => {
    const { s, k, U, I } = ac(t.circuit!, 'U1');
    const P = -(s.uRe[k]! * s.iRe[k]! + s.uIm[k]! * s.iIm[k]!) / 2;
    const Q = -(s.uIm[k]! * s.iRe[k]! - s.uRe[k]! * s.iIm[k]!) / 2;
    return { I, P, Q, S: U * I, cos: P / (U * I) };
  },
  resonanz: (t) => {
    const r = ac(t.circuit!, 'R1'), c = ac(t.circuit!, 'C1'), u = ac(t.circuit!, 'U1');
    return { f0: naturalModes(r.net).f0!, I0: r.I, UC: c.U, Q: c.U / u.U };
  },
  tiefpass: (t) => {
    const c = ac(t.circuit!, 'C1'), u = ac(t.circuit!, 'U1');
    const H = c.U / u.U;
    const phi = (Math.atan2(c.s.uIm[c.k]!, c.s.uRe[c.k]!) - Math.atan2(u.s.uIm[u.k]!, u.s.uRe[u.k]!)) * 180 / Math.PI;
    return { fg: naturalModes(c.net).fg!, H, dB: 20 * Math.log10(H), phi };
  },
  tau: (t) => {
    const c = t.circuit!;
    const tau = naturalModes(buildNetlist(c)).tau!;
    return { tau, u1: tran(c, 'C1', tau).u, th: tau * Math.LN2 };
  },
  laden: (t) => {
    const time = givenTime(t);
    const r = tran(t.circuit!, 'C1', time);
    return { i0: r.first, uc: r.u, it: r.i };
  },
  'rl-ein': (t) => {
    const time = givenTime(t);
    const r = tran(t.circuit!, 'L1', time);
    return { tau: naturalModes(buildNetlist(t.circuit!)).tau!, Iend: dc(t.circuit!, 'L1').i, it: r.i, ul: r.u };
  },
  entladen: (t) => {
    const time = givenTime(t);
    const r = tran(t.circuit!, 'C1', time, { preCharge: true });
    const C = t.circuit!.parts.find((p) => p.name === 'C1')!.value;
    const U = t.circuit!.parts.find((p) => p.name === 'U1')!.value;
    return { W: 0.5 * C * U * U, i0: Math.abs(r.first), uc: r.u };
  },
  'rlc-fall': (t) => {
    const m = naturalModes(buildNetlist(t.circuit!));
    const L = t.circuit!.parts.find((p) => p.name === 'L1')!.value;
    const C = t.circuit!.parts.find((p) => p.name === 'C1')!.value;
    return { delta: m.delta!, f0: m.f0!, Rg: 2 * Math.sqrt(L / C), ...(m.fd ? { fd: m.fd } : {}) };
  },
};

/** Zeit t aus der Angabe "t = 4.7\,\mathrm{ms}" lesen */
function givenTime(t: Task): number {
  const g = t.given.find((x) => x.startsWith('t = '))!;
  const m = /t = ([\d.]+)(?:\\cdot 10\^\{(-?\d+)\})?\\,\\mathrm\{(.*)s\}/.exec(g)!;
  const pre: Record<string, number> = { '': 1, m: 1e-3, '\\mu ': 1e-6 };
  return Number(m[1]) * (m[2] ? 10 ** Number(m[2]) : 1) * pre[m[3]!]!;
}

describe('Aufgaben stimmen mit dem Rechenkern überein', () => {
  for (const gen of TASKS) {
    it(`${gen.id}: ${gen.title}`, () => {
      const measure = MEASURE[gen.id];
      expect(measure, `Prüfung für ${gen.id} fehlt`).toBeDefined();
      for (let seed = 1; seed <= 25; seed++) {
        const task = gen.make(rng(seed * 7919));
        expect(task.circuit).toBeDefined();
        expect(buildNetlist(task.circuit!).open, `${gen.id}: offene Anschlüsse`).toEqual([]);
        const got = measure!(task);
        for (const a of task.answers) {
          const v = got[a.key];
          expect(v, `${gen.id}/${a.key} nicht gemessen`).toBeDefined();
          expect(isCorrect({ ...a, tol: Math.min(a.tol ?? 0.025, 0.01), abs: a.abs }, v!), `${gen.id} seed ${seed}: ${a.key} soll ${a.value}, Rechenkern ${v}`).toBe(true);
        }
        if (gen.id === 'rlc-fall') {
          const m = naturalModes(buildNetlist(task.circuit!));
          const correct = task.choices![0]!.correct;
          expect(m.damping === 'schwingfall' ? 0 : m.damping === 'aperiodisch' ? 2 : 1).toBe(correct);
        }
      }
    });
  }
});
