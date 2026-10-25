import { bode, naturalModes } from './analysis';
import { byName, circuit, gnd, P, spdt, two, wire, wires } from './build';
import type { Circuit } from './circuit';
import { solveAC, solveDC, Transient } from './mna';
import { buildNetlist } from './netlist';
import { nearestE12, parseSI, si, stepE12 } from './units';

/** Index eines Bauteils in der Netzliste */
function idx(c: Circuit, name: string) {
  const net = buildNetlist(c);
  return { net, i: net.elems.findIndex((e) => e.part.name === name) };
}

function dc(c: Circuit, name: string) {
  const { net, i } = idx(c, name);
  const s = solveDC(net);
  expect(s.ok).toBe(true);
  return { u: s.uRe[i]!, i: s.iRe[i]! };
}

/** Quelle links (Pluspol oben), Bauteile oben und rechts, Masse unten links */
function divider(U: number, R1: number, R2: number) {
  return circuit(
    two('V', P(0, 0), P(0, 2), { value: U, name: 'U1' }),
    two('R', P(0, 0), P(2, 0), { value: R1, name: 'R1' }),
    two('R', P(2, 0), P(2, 2), { value: R2, name: 'R2' }),
    wire(P(2, 2), P(0, 2)),
    gnd(P(0, 2)),
  );
}

describe('Gleichstrom', () => {
  it('Spannungsteiler: 10 V an 1 kΩ und 4 kΩ', () => {
    const c = divider(10, 1000, 4000);
    expect(dc(c, 'R2').u).toBeCloseTo(8, 6);
    expect(dc(c, 'R1').i).toBeCloseTo(2e-3, 9);
    // Quelle liefert Strom: im Verbraucher-Zählpfeilsystem negativ
    expect(dc(c, 'U1').i).toBeCloseTo(-2e-3, 9);
  });

  it('gemischte Schaltung: 100 Ω in Reihe mit 200 Ω ∥ 300 Ω an 12 V', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 12, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 100, name: 'R1' }),
      two('R', P(2, 0), P(2, 2), { value: 200, name: 'R2' }),
      wires(P(2, 0), P(4, 0)),
      two('R', P(4, 0), P(4, 2), { value: 300, name: 'R3' }),
      wires(P(4, 2), P(2, 2), P(0, 2)),
    );
    expect(dc(c, 'R1').i).toBeCloseTo(12 / 220, 10);
    expect(dc(c, 'R2').u).toBeCloseTo((12 * 120) / 220, 9);
    expect(dc(c, 'R3').i).toBeCloseTo((12 * 120) / 220 / 300, 10);
  });

  it('Knotenpotenzial mit zwei Quellen', () => {
    // U1 = 10 V über R1 = 1 kΩ und U2 = 5 V über R2 = 2 kΩ auf einen Knoten, R3 = 1 kΩ gegen Masse
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      two('R', P(2, 0), P(2, 2), { value: 1000, name: 'R3' }),
      two('R', P(4, 0), P(2, 0), { value: 2000, name: 'R2' }),
      two('V', P(4, 0), P(4, 2), { value: 5, name: 'U2' }),
      wires(P(0, 2), P(2, 2), P(4, 2)),
      gnd(P(2, 2)),
    );
    expect(dc(c, 'R3').u).toBeCloseTo(5, 6);
    expect(dc(c, 'R2').i).toBeCloseTo(0, 9);
  });

  it('Stromquelle treibt 2 mA durch 1 kΩ', () => {
    const c = circuit(
      two('I', P(0, 0), P(0, 2), { value: 2e-3, name: 'I1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      wires(P(2, 0), P(2, 2), P(0, 2)),
    );
    expect(dc(c, 'R1').u).toBeCloseTo(2, 6);
    expect(dc(c, 'I1').u).toBeCloseTo(2, 6);
  });

  it('Kondensator sperrt, Spule leitet', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 100, name: 'R1' }),
      two('L', P(2, 0), P(4, 0), { value: 1, name: 'L1' }),
      two('C', P(4, 0), P(4, 2), { value: 1e-6, name: 'C1' }),
      two('R', P(2, 0), P(2, 2), { value: 100, name: 'R2' }),
      wires(P(4, 2), P(2, 2), P(0, 2)),
    );
    expect(dc(c, 'C1').u).toBeCloseTo(5, 6);
    expect(dc(c, 'L1').i).toBeCloseTo(0, 6);
    expect(dc(c, 'R2').u).toBeCloseTo(5, 6);
  });

  it('Schalter offen und geschlossen, Strommesser', () => {
    const make = (closed: boolean) => circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('S', P(0, 0), P(2, 0), { closed, name: 'S1' }),
      two('AM', P(2, 0), P(4, 0), { name: 'A1' }),
      two('lamp', P(4, 0), P(4, 2), { value: 100, power: 1, name: 'H1' }),
      wires(P(4, 2), P(0, 2)),
    );
    expect(dc(make(true), 'A1').i).toBeCloseTo(0.1, 5);
    expect(Math.abs(dc(make(false), 'A1').i)).toBeLessThan(1e-8);
    expect(dc(make(false), 'S1').u).toBeCloseTo(10, 5);
  });

  it('kurzgeschlossene Spannungsquelle meldet einen Fehler', () => {
    const c = circuit(two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }), wire(P(0, 0), P(0, 2)));
    const s = solveDC(buildNetlist(c));
    expect(s.ok).toBe(false);
    expect(s.error).toContain('U1');
  });

  it('Draht endet auf einem anderen Draht: verbunden', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 6, name: 'U1' }),
      wire(P(0, 0), P(6, 0)),
      two('R', P(3, 0), P(3, 2), { value: 60, name: 'R1' }),
      wire(P(3, 2), P(0, 2)),
    );
    const net = buildNetlist(c);
    expect(net.junctions.some((p) => p.x === 3 && p.y === 0)).toBe(true);
    expect(dc(c, 'R1').i).toBeCloseTo(0.1, 9);
  });
});

describe('Wechselstrom', () => {
  it('RC-Reihenschaltung bei X_C = R', () => {
    const C = 1 / (2 * Math.PI * 50 * 100);
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, shape: 'sine', freq: 50, phase: 0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 100, name: 'R1' }),
      two('C', P(2, 0), P(2, 2), { value: C, name: 'C1' }),
      wire(P(2, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'R1');
    const ic = net.elems.findIndex((e) => e.part.name === 'C1');
    const s = solveAC(net, 50);
    const I = Math.hypot(s.iRe[i]!, s.iIm[i]!);
    expect(I).toBeCloseTo(10 / Math.SQRT2 / 100, 9);
    expect((Math.atan2(s.iIm[i]!, s.iRe[i]!) * 180) / Math.PI).toBeCloseTo(45, 6);
    expect(Math.hypot(s.uRe[ic]!, s.uIm[ic]!)).toBeCloseTo(10 / Math.SQRT2, 8);
    expect((Math.atan2(s.uIm[ic]!, s.uRe[ic]!) * 180) / Math.PI).toBeCloseTo(-45, 6);
  });

  it('RLC-Reihenschwingkreis: bei f0 nur R wirksam, Kennwerte', () => {
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.1 * 10e-6));
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, shape: 'sine', freq: f0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 10, name: 'R1' }),
      two('L', P(2, 0), P(4, 0), { value: 0.1, name: 'L1' }),
      two('C', P(4, 0), P(4, 2), { value: 10e-6, name: 'C1' }),
      wires(P(4, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'R1');
    const s = solveAC(net, f0);
    expect(Math.hypot(s.iRe[i]!, s.iIm[i]!)).toBeCloseTo(1, 6);
    const m = naturalModes(net);
    expect(m.order).toBe(2);
    expect(m.f0!).toBeCloseTo(f0, 3);
    expect(m.delta!).toBeCloseTo(50, 3);
    expect(m.damping).toBe('schwingfall');
    expect(m.fd!).toBeCloseTo(Math.sqrt(1e6 - 2500) / (2 * Math.PI), 3);
    expect(m.Q!).toBeCloseTo(10, 3);
  });

  it('RC-Tiefpass: bei f_g −3 dB und −45°', () => {
    const R = 1000, C = 1e-6;
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 1, shape: 'sine', freq: 100, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: R, name: 'R1' }),
      two('C', P(2, 0), P(2, 2), { value: C, name: 'C1' }),
      wire(P(2, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'C1');
    const fg = 1 / (2 * Math.PI * R * C);
    const b = bode(net, byName(c, 'U1').id, i, fg, fg, 1);
    expect(b.db[0]!).toBeCloseTo(-3.0103, 3);
    expect(b.phase[0]!).toBeCloseTo(-45, 6);
    const m = naturalModes(net);
    expect(m.order).toBe(1);
    expect(m.tau!).toBeCloseTo(R * C, 9);
    expect(m.fg!).toBeCloseTo(fg, 6);
  });

  it('Zeitkonstante mit Ersatzwiderstand: τ = (R1 ∥ R2)·C', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      two('R', P(2, 0), P(2, 2), { value: 3000, name: 'R2' }),
      wires(P(2, 0), P(4, 0)),
      two('C', P(4, 0), P(4, 2), { value: 1e-6, name: 'C1' }),
      wires(P(4, 2), P(2, 2), P(0, 2)),
    );
    expect(naturalModes(buildNetlist(c)).tau!).toBeCloseTo(750e-6, 10);
  });
});

describe('Zeitverlauf', () => {
  it('RC laden: u_C(τ) = 63.2 % der Endspannung', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      two('C', P(2, 0), P(2, 2), { value: 100e-6, name: 'C1' }),
      wire(P(2, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'C1');
    const tau = 0.1;
    const sim = new Transient(net, tau / 1000);
    expect(sim.last.uRe[i]!).toBeCloseTo(0, 6);
    // Strom springt sofort auf U/R
    expect(sim.last.iRe[i]!).toBeCloseTo(0.01, 5);
    for (let k = 0; k < 1000; k++) sim.step();
    expect(sim.t).toBeCloseTo(tau, 12);
    expect(sim.last.uRe[i]!).toBeCloseTo(10 * (1 - Math.exp(-1)), 4);
    expect(sim.last.iRe[i]!).toBeCloseTo(0.01 * Math.exp(-1), 6);
  });

  it('RL einschalten: i(τ) = 63.2 % von U/R', () => {
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 10, name: 'R1' }),
      two('L', P(2, 0), P(2, 2), { value: 1, name: 'L1' }),
      wire(P(2, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'L1');
    const sim = new Transient(net, 1e-4);
    expect(sim.last.uRe[i]!).toBeCloseTo(10, 4);
    for (let k = 0; k < 1000; k++) sim.step();
    expect(sim.last.iRe[i]!).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it('LC-Schwingkreis behält seine Amplitude (BDF2 dämpft kaum)', () => {
    // C auf 10 V geladen, dann über den Umschalter an L
    const L = 0.1, C = 10e-6;
    // Umschalter (Mitte rechts bei 5,1, Drehung 2): Stellung 1 lädt C über R1, Stellung 0 legt C an L
    const make = (pos: 0 | 1) => circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1, name: 'R1' }),
      wire(P(2, 0), P(3, 0)),
      spdt(P(5, 1), 2, pos, 'S1'),
      two('C', P(5, 1), P(5, 3), { value: C, name: 'C1' }),
      two('L', P(3, 2), P(3, 4), { value: L, name: 'L1' }),
      wires(P(0, 2), P(0, 4), P(3, 4), P(5, 4), P(5, 3)),
    );
    const c0 = make(1);
    const n0 = buildNetlist(c0);
    expect(n0.open.length).toBe(0);
    const sim0 = new Transient(n0, 1e-5);
    for (let k = 0; k < 2000; k++) sim0.step();
    const ic = n0.elems.findIndex((e) => e.part.name === 'C1');
    expect(sim0.last.uRe[ic]!).toBeCloseTo(10, 3);
    // Umschalten: Zustand wird übernommen
    const n1 = buildNetlist({ parts: c0.parts.map((p) => (p.kind === 'S2' ? { ...p, pos: 0 as const } : p)) });
    const T = 2 * Math.PI * Math.sqrt(L * C);
    const h = T / 400;
    const sim = new Transient(n1, h, sim0.hist);
    let max = 0;
    for (let k = 0; k < 400 * 10; k++) {
      sim.step();
      if (k > 400 * 9) max = Math.max(max, Math.abs(sim.last.uRe[ic]!));
    }
    expect(max).toBeGreaterThan(9.9);
    expect(max).toBeLessThan(10.05);
  });

  it('Sinus im eingeschwungenen Zustand passt zur Zeigerrechnung', () => {
    const C = 1 / (2 * Math.PI * 50 * 100);
    const c = circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, shape: 'sine', freq: 50, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 100, name: 'R1' }),
      two('C', P(2, 0), P(2, 2), { value: C, name: 'C1' }),
      wire(P(2, 2), P(0, 2)),
    );
    const { net, i } = idx(c, 'C1');
    const h = 1 / 50 / 2000;
    const sim = new Transient(net, h);
    let max = 0;
    for (let k = 0; k < 2000 * 20; k++) {
      sim.step();
      if (k >= 2000 * 19) max = Math.max(max, sim.last.uRe[i]!);
    }
    expect(max).toBeCloseTo(10 / Math.SQRT2, 2);
  });
});

describe('Einheiten', () => {
  it('liest SI-Eingaben', () => {
    expect(parseSI('4.7k')).toBeCloseTo(4700);
    expect(parseSI('4,7 kΩ')).toBeCloseTo(4700);
    expect(parseSI('4k7')).toBeCloseTo(4700);
    expect(parseSI('100u')).toBeCloseTo(100e-6);
    expect(parseSI('100 µF')).toBeCloseTo(100e-6);
    expect(parseSI('2.2mH')).toBeCloseTo(2.2e-3);
    expect(parseSI('50 Hz')).toBeCloseTo(50);
    expect(parseSI('1MHz')).toBeCloseTo(1e6);
    expect(parseSI('10 ms')).toBeCloseTo(0.01);
    expect(parseSI('1e-3')).toBeCloseTo(1e-3);
    expect(parseSI('-5 V')).toBeCloseTo(-5);
    expect(parseSI('abc')).toBeNaN();
  });

  it('schreibt SI-Werte', () => {
    expect(si(4700, 'Ω')).toBe('4.7 kΩ');
    expect(si(0.0047, 'F')).toBe('4.7 mF');
    expect(si(1e-6, 'F')).toBe('1 µF');
    expect(si(0.99996, 'V')).toBe('1 V');
    expect(si(999.96, 'Hz')).toBe('1 kHz');
    expect(si(-0.012, 'A')).toBe('−12 mA');
    expect(si(0, 'V')).toBe('0 V');
  });

  it('E12-Reihe', () => {
    expect(stepE12(4.7e3, 1)).toBeCloseTo(5.6e3);
    expect(stepE12(1e3, -1)).toBeCloseTo(820);
    expect(stepE12(8.2e3, 1)).toBeCloseTo(10e3);
    expect(nearestE12(5000)).toBeCloseTo(4.7e3);
  });
});
