/**
 * Aufgaben Elektrotechnik in drei Stufen je Kapitel. Die Werte stammen aus der E12-Reihe,
 * die Lösungen werden in den Tests mit dem Rechenkern nachgeprüft.
 */
import { switched } from '../../lab/examples';
import { circuit, gnd, P, two, wire, wires } from '../../sim/build';
import { nearestE12 } from '../../sim/units';
import { type Gen, n, pick, q, qs, type Rng } from '../task';

const PI2 = 2 * Math.PI;
const deg = (rad: number) => (rad * 180) / Math.PI;
/** Auf zwei signifikante Stellen runden (schöne Angaben) */
const nice = (x: number) => Number(x.toPrecision(2));
const par = (a: number, b: number) => (a * b) / (a + b);

const RS = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700];

/* ---------- Schaltungen ---------- */

function oneR(U: number, R: number) {
  return circuit(
    two('V', P(0, 0), P(0, 2), { value: U, name: 'U1' }),
    wire(P(0, 0), P(2, 0)),
    two('R', P(2, 0), P(2, 2), { value: R, name: 'R1' }),
    wire(P(2, 2), P(0, 2)),
    gnd(P(0, 2)),
  );
}

/** R1 in Reihe, dann R2 und optional R3 parallel */
function ladder(U: number, R1: number, R2: number, R3?: number, n3 = 'R3') {
  return circuit(
    two('V', P(0, 0), P(0, 2), { value: U, name: 'U1' }),
    two('R', P(0, 0), P(2, 0), { value: R1, name: 'R1' }),
    wire(P(2, 0), P(4, 0)),
    two('R', P(4, 0), P(4, 2), { value: R2, name: 'R2' }),
    R3 !== undefined ? [wire(P(4, 0), P(6, 0)), two('R', P(6, 0), P(6, 2), { value: R3, name: n3 }), wire(P(6, 2), P(4, 2))] : [],
    wire(P(4, 2), P(0, 2)),
    gnd(P(0, 2)),
  );
}

function twoSources(U1: number, U2: number, R1: number, R2: number, R3: number) {
  return circuit(
    two('V', P(0, 0), P(0, 2), { value: U1, name: 'U1' }),
    two('R', P(0, 0), P(2, 0), { value: R1, name: 'R1' }),
    wire(P(2, 0), P(3, 0)),
    two('R', P(3, 0), P(3, 2), { value: R3, name: 'R3' }),
    wire(P(3, 0), P(4, 0)),
    two('R', P(6, 0), P(4, 0), { value: R2, name: 'R2' }),
    two('V', P(6, 0), P(6, 2), { value: U2, name: 'U2' }),
    wires(P(0, 2), P(3, 2), P(6, 2)),
    gnd(P(3, 2)),
  );
}

const sine = (Ueff: number, f: number) => ({ value: Ueff * Math.SQRT2, shape: 'sine' as const, freq: f, phase: 0, offset: 0, name: 'U1' });

/** Quelle, Längsglied a (oben) und Querglied b (rechts) */
function series2(src: ReturnType<typeof sine>, a: ['R' | 'L' | 'C', number, string], b: ['R' | 'L' | 'C', number, string]) {
  return circuit(
    two('V', P(0, 0), P(0, 2), src),
    two(a[0], P(0, 0), P(2, 0), { value: a[1], name: a[2] }),
    wire(P(2, 0), P(4, 0)),
    two(b[0], P(4, 0), P(4, 2), { value: b[1], name: b[2] }),
    wire(P(4, 2), P(0, 2)),
    gnd(P(0, 2)),
  );
}

function rlc(src: ReturnType<typeof sine>, R: number, L: number, C: number) {
  return circuit(
    two('V', P(0, 0), P(0, 2), src),
    two('R', P(0, 0), P(2, 0), { value: R, name: 'R1' }),
    two('L', P(2, 0), P(4, 0), { value: L, name: 'L1' }),
    two('C', P(4, 0), P(4, 2), { value: C, name: 'C1' }),
    wire(P(4, 2), P(0, 2)),
    gnd(P(0, 2)),
  );
}

/* ---------- Gleichstrom ---------- */

const g1: Gen = {
  id: 'ohm', chapter: 'gleichstrom', stage: 1, title: 'Ohmsches Gesetz und Leistung',
  make: (r: Rng) => {
    const U = pick(r, [4.5, 5, 9, 12, 24]);
    const R = pick(r, [47, 68, 100, 150, 220, 330, 470, 680, 1000]);
    const I = U / R, Pw = U * I;
    return {
      question: 'Ein Widerstand liegt an einer Gleichspannungsquelle. Wie gross sind der Strom und die umgesetzte Leistung?',
      given: [`U = ${q(U, 'V')}`, `R = ${q(R, 'Ω')}`],
      answers: [
        { key: 'I', label: 'I', unit: 'A', value: I },
        { key: 'P', label: 'P', unit: 'W', value: Pw },
      ],
      steps: [
        { text: 'Ohmsches Gesetz nach dem Strom auflösen:', tex: `I = \\frac{U}{R} = \\frac{${q(U, 'V')}}{${q(R, 'Ω')}} = ${q(I, 'A')}` },
        { text: 'Leistung aus Spannung und Strom (oder $P = U^2/R$):', tex: `P = U \\cdot I = ${q(U, 'V')} \\cdot ${q(I, 'A')} = ${q(Pw, 'W')}` },
      ],
      circuit: oneR(U, R), focus: 'R1',
      lab: 'Tippe R1 an: u, i und p stehen im Eigenschaftenfeld.',
    };
  },
};

const g2: Gen = {
  id: 'teiler', chapter: 'gleichstrom', stage: 1, title: 'Reihenschaltung als Spannungsteiler',
  make: (r) => {
    const U = pick(r, [5, 9, 10, 12, 24]);
    const R1 = pick(r, RS), R2 = pick(r, RS);
    const Rg = R1 + R2, I = U / Rg, U2 = I * R2;
    return {
      question: 'Zwei Widerstände in Reihe teilen die Spannung. Bestimme den Strom und die Spannung an R2.',
      given: [`U = ${q(U, 'V')}`, `R_1 = ${q(R1, 'Ω')}`, `R_2 = ${q(R2, 'Ω')}`],
      answers: [
        { key: 'I', label: 'I', unit: 'A', value: I },
        { key: 'U2', label: 'U_2', unit: 'V', value: U2 },
      ],
      steps: [
        { text: 'In Reihe addieren sich die Widerstände:', tex: `R_{ges} = R_1 + R_2 = ${q(Rg, 'Ω')}` },
        { text: 'Durch beide fliesst derselbe Strom:', tex: `I = \\frac{U}{R_{ges}} = ${q(I, 'A')}` },
        { text: 'Spannungsteilerregel: Die Spannungen verhalten sich wie die Widerstände.', tex: `U_2 = U \\cdot \\frac{R_2}{R_1 + R_2} = ${q(U, 'V')} \\cdot \\frac{${n(R2)}}{${n(Rg)}} = ${q(U2, 'V')}` },
      ],
      circuit: ladder(U, R1, R2), focus: 'R2',
    };
  },
};

const g3: Gen = {
  id: 'gemischt', chapter: 'gleichstrom', stage: 2, title: 'Gemischte Schaltung',
  make: (r) => {
    const U = pick(r, [10, 12, 24]);
    const R1 = pick(r, RS.slice(0, 9)), R2 = pick(r, RS.slice(0, 9)), R3 = pick(r, RS.slice(0, 9));
    const R23 = par(R2, R3), Rg = R1 + R23, I = U / Rg, U23 = I * R23, I2 = U23 / R2;
    return {
      question: 'R1 liegt in Reihe zur Parallelschaltung aus R2 und R3. Bestimme Gesamtwiderstand, Gesamtstrom, die Spannung an R2 und den Strom durch R2.',
      given: [`U = ${q(U, 'V')}`, `R_1 = ${q(R1, 'Ω')}`, `R_2 = ${q(R2, 'Ω')}`, `R_3 = ${q(R3, 'Ω')}`],
      answers: [
        { key: 'Rg', label: 'R_{ges}', unit: 'Ω', value: Rg },
        { key: 'I', label: 'I', unit: 'A', value: I },
        { key: 'U2', label: 'U_2', unit: 'V', value: U23 },
        { key: 'I2', label: 'I_2', unit: 'A', value: I2 },
      ],
      steps: [
        { text: 'Parallelschaltung zusammenfassen:', tex: `R_{23} = \\frac{R_2 R_3}{R_2 + R_3} = ${q(R23, 'Ω')}` },
        { text: 'Dazu R1 in Reihe:', tex: `R_{ges} = R_1 + R_{23} = ${q(Rg, 'Ω')}` },
        { text: 'Gesamtstrom:', tex: `I = \\frac{U}{R_{ges}} = ${q(I, 'A')}` },
        { text: 'An der Parallelschaltung liegt:', tex: `U_2 = I \\cdot R_{23} = ${q(U23, 'V')}` },
        { text: 'Strom durch R2:', tex: `I_2 = \\frac{U_2}{R_2} = ${q(I2, 'A')}` },
        { text: 'Probe mit der Knotenregel: $I = I_2 + I_3$ mit $I_3 = U_2 / R_3$.' },
      ],
      circuit: ladder(U, R1, R2, R3), focus: 'R2',
    };
  },
};

const g4: Gen = {
  id: 'belastet', chapter: 'gleichstrom', stage: 2, title: 'Belasteter Spannungsteiler',
  make: (r) => {
    const U = pick(r, [10, 12, 24]);
    const R1 = pick(r, [1000, 2200, 4700, 10000]), R2 = pick(r, [1000, 2200, 4700, 10000]);
    const RL = pick(r, [1000, 2200, 4700, 10000, 22000]);
    const U20 = (U * R2) / (R1 + R2);
    const R2L = par(R2, RL);
    const U2L = (U * R2L) / (R1 + R2L);
    return {
      question: 'An einen Spannungsteiler wird die Last RL parallel zu R2 angeschlossen. Wie gross ist die Ausgangsspannung ohne und mit Last?',
      given: [`U = ${q(U, 'V')}`, `R_1 = ${q(R1, 'Ω')}`, `R_2 = ${q(R2, 'Ω')}`, `R_L = ${q(RL, 'Ω')}`],
      answers: [
        { key: 'U20', label: 'U_{2,0}', unit: 'V', value: U20 },
        { key: 'U2L', label: 'U_{2,L}', unit: 'V', value: U2L },
      ],
      steps: [
        { text: 'Ohne Last (Leerlauf):', tex: `U_{2,0} = U \\cdot \\frac{R_2}{R_1 + R_2} = ${q(U20, 'V')}` },
        { text: 'Mit Last liegen R2 und RL parallel:', tex: `R_{2L} = \\frac{R_2 R_L}{R_2 + R_L} = ${q(R2L, 'Ω')}` },
        { text: 'Teilerregel mit dem kleineren unteren Widerstand:', tex: `U_{2,L} = U \\cdot \\frac{R_{2L}}{R_1 + R_{2L}} = ${q(U2L, 'V')}` },
        { text: `Die Last senkt die Spannung um ${n(((U20 - U2L) / U20) * 100, 2)} %. Der Teiler ist nur «steif», wenn $R_L \\gg R_2$.` },
      ],
      circuit: ladder(U, R1, R2, RL, 'RL'), focus: 'RL',
      lab: 'Lösche RL oder stelle RL sehr gross ein, dann siehst du die Leerlaufspannung.',
    };
  },
};

const g5: Gen = {
  id: 'knoten', chapter: 'gleichstrom', stage: 3, title: 'Knotenpotenzialverfahren mit zwei Quellen',
  make: (r) => {
    const U1 = pick(r, [10, 12, 15, 24]), U2 = pick(r, [5, 6, 9]);
    const R1 = pick(r, [100, 220, 470, 1000]), R2 = pick(r, [100, 220, 470, 1000]), R3 = pick(r, [100, 220, 470, 1000]);
    const G = 1 / R1 + 1 / R2 + 1 / R3;
    const phi = (U1 / R1 + U2 / R2) / G;
    const I3 = phi / R3, I1 = (U1 - phi) / R1;
    return {
      question: 'Zwei Quellen speisen über R1 und R2 einen gemeinsamen Knoten K, von dem R3 nach Masse führt. Bestimme das Potenzial von K sowie die Ströme durch R3 und R1.',
      given: [`U_1 = ${q(U1, 'V')}`, `U_2 = ${q(U2, 'V')}`, `R_1 = ${q(R1, 'Ω')}`, `R_2 = ${q(R2, 'Ω')}`, `R_3 = ${q(R3, 'Ω')}`],
      answers: [
        { key: 'phi', label: '\\varphi_K', unit: 'V', value: phi },
        { key: 'I3', label: 'I_3', unit: 'A', value: I3 },
        { key: 'I1', label: 'I_1', unit: 'A', value: I1 },
      ],
      steps: [
        { text: 'Masse als Bezug ($\\varphi = 0$). Knotenregel in K: Was über R1 und R2 zufliesst, fliesst über R3 ab.', tex: '\\frac{U_1 - \\varphi_K}{R_1} + \\frac{U_2 - \\varphi_K}{R_2} = \\frac{\\varphi_K}{R_3}' },
        { text: 'Nach $\\varphi_K$ auflösen:', tex: `\\varphi_K = \\frac{U_1/R_1 + U_2/R_2}{1/R_1 + 1/R_2 + 1/R_3} = ${q(phi, 'V')}` },
        { text: 'Ströme aus dem Potenzial:', tex: `I_3 = \\frac{\\varphi_K}{R_3} = ${q(I3, 'A')}, \\quad I_1 = \\frac{U_1 - \\varphi_K}{R_1} = ${q(I1, 'A')}` },
        { text: 'Ein negativer Strom heisst: Er fliesst entgegen der angenommenen Richtung.' },
      ],
      circuit: twoSources(U1, U2, R1, R2, R3), focus: 'R3',
    };
  },
};

const g6: Gen = {
  id: 'ersatzquelle', chapter: 'gleichstrom', stage: 3, title: 'Ersatzspannungsquelle',
  make: (r) => {
    const U = pick(r, [12, 24]);
    const R1 = pick(r, [1000, 2200, 4700]), R2 = pick(r, [1000, 2200, 4700]);
    const RL = pick(r, [470, 1000, 2200, 4700]);
    const U0 = (U * R2) / (R1 + R2), Ri = par(R1, R2), IL = U0 / (Ri + RL);
    const Pmax = (U0 * U0) / (4 * Ri);
    return {
      question: 'Ersetze den Spannungsteiler (U, R1, R2) bezüglich der Klemmen von RL durch eine Ersatzspannungsquelle. Wie gross sind Leerlaufspannung, Innenwiderstand und Laststrom?',
      given: [`U = ${q(U, 'V')}`, `R_1 = ${q(R1, 'Ω')}`, `R_2 = ${q(R2, 'Ω')}`, `R_L = ${q(RL, 'Ω')}`],
      answers: [
        { key: 'U0', label: 'U_0', unit: 'V', value: U0 },
        { key: 'Ri', label: 'R_i', unit: 'Ω', value: Ri },
        { key: 'IL', label: 'I_L', unit: 'A', value: IL },
      ],
      steps: [
        { text: 'Leerlaufspannung (RL entfernt):', tex: `U_0 = U \\cdot \\frac{R_2}{R_1 + R_2} = ${q(U0, 'V')}` },
        { text: 'Innenwiderstand: Quelle durch Kurzschluss ersetzen, von den Klemmen aus liegen R1 und R2 parallel.', tex: `R_i = \\frac{R_1 R_2}{R_1 + R_2} = ${q(Ri, 'Ω')}` },
        { text: 'Laststrom aus der Ersatzschaltung:', tex: `I_L = \\frac{U_0}{R_i + R_L} = ${q(IL, 'A')}` },
        { text: `Leistungsanpassung bei $R_L = R_i$: $P_{max} = U_0^2/(4 R_i) = ${q(Pmax, 'W')}$.` },
      ],
      circuit: ladder(U, R1, R2, RL, 'RL'), focus: 'RL',
    };
  },
};

/* ---------- Wechselstrom ---------- */

const w1: Gen = {
  id: 'blind', chapter: 'wechselstrom', stage: 1, title: 'Blindwiderstände von L und C',
  make: (r) => {
    const f = pick(r, [50, 100, 1000]);
    const L = pick(r, [0.01, 0.022, 0.047, 0.1, 0.22]);
    const C = pick(r, [1e-6, 2.2e-6, 4.7e-6, 10e-6, 22e-6]);
    const XL = PI2 * f * L, XC = 1 / (PI2 * f * C);
    const fx = 1 / (PI2 * Math.sqrt(L * C));
    return {
      question: 'Spule und Kondensator liegen parallel an einer Sinusspannung. Wie gross sind ihre Blindwiderstände?',
      given: [`f = ${q(f, 'Hz')}`, `L = ${q(L, 'H')}`, `C = ${q(C, 'F')}`],
      answers: [
        { key: 'XL', label: 'X_L', unit: 'Ω', value: XL },
        { key: 'XC', label: 'X_C', unit: 'Ω', value: XC },
      ],
      steps: [
        { text: 'Kreisfrequenz:', tex: `\\omega = 2\\pi f = ${qs(PI2 * f)}` },
        { text: 'Spule: wächst mit der Frequenz.', tex: `X_L = \\omega L = ${q(XL, 'Ω')}` },
        { text: 'Kondensator: sinkt mit der Frequenz.', tex: `X_C = \\frac{1}{\\omega C} = ${q(XC, 'Ω')}` },
        { text: `Gleich gross wären sie bei $f = 1/(2\\pi\\sqrt{LC}) = ${q(fx, 'Hz')}$.` },
      ],
      circuit: circuit(
        two('V', P(0, 0), P(0, 2), { value: 10, shape: 'sine', freq: f, phase: 0, offset: 0, name: 'U1' }),
        wire(P(0, 0), P(2, 0)),
        two('L', P(2, 0), P(2, 2), { value: L, name: 'L1' }),
        wire(P(2, 0), P(4, 0)),
        two('C', P(4, 0), P(4, 2), { value: C, name: 'C1' }),
        wires(P(4, 2), P(2, 2), P(0, 2)),
        gnd(P(0, 2)),
      ),
      focus: 'C1', lab: 'Im Reiter «Werte» steht Z für L1 und C1.',
    };
  },
};

const w2: Gen = {
  id: 'rc-sinus', chapter: 'wechselstrom', stage: 2, title: 'RC-Reihenschaltung an Sinusspannung',
  make: (r) => {
    const U = pick(r, [10, 12, 24, 230]);
    const f = pick(r, [50, 100, 1000]);
    const R = pick(r, [100, 220, 470, 1000]);
    const C = nearestE12(1 / (PI2 * f * R * pick(r, [0.5, 1, 2])));
    const XC = 1 / (PI2 * f * C);
    const Z = Math.hypot(R, XC), phi = -deg(Math.atan(XC / R));
    const I = U / Z, UR = I * R, UC = I * XC;
    return {
      question: 'R und C liegen in Reihe an einer Sinusspannung (Effektivwert U). Bestimme Scheinwiderstand, Phasenwinkel, Strom und die Spannung am Kondensator.',
      given: [`U = ${q(U, 'V')}`, `f = ${q(f, 'Hz')}`, `R = ${q(R, 'Ω')}`, `C = ${q(C, 'F')}`],
      answers: [
        { key: 'Z', label: '|\\underline{Z}|', unit: 'Ω', value: Z },
        { key: 'phi', label: '\\varphi', unit: '°', value: phi, abs: 1 },
        { key: 'I', label: 'I', unit: 'A', value: I },
        { key: 'UC', label: 'U_C', unit: 'V', value: UC },
      ],
      steps: [
        { text: 'Blindwiderstand des Kondensators:', tex: `X_C = \\frac{1}{2\\pi f C} = ${q(XC, 'Ω')}` },
        { text: 'Komplexer Widerstand in Reihe:', tex: `\\underline{Z} = R - jX_C, \\quad |\\underline{Z}| = \\sqrt{R^2 + X_C^2} = ${q(Z, 'Ω')}` },
        { text: 'Phasenwinkel (Spannung gegenüber Strom), negativ heisst kapazitiv: Der Strom eilt vor.', tex: `\\varphi = -\\arctan\\frac{X_C}{R} = ${n(phi, 3)}^\\circ` },
        { text: 'Strom und Teilspannungen:', tex: `I = \\frac{U}{|\\underline{Z}|} = ${q(I, 'A')}, \\quad U_R = I R = ${q(UR, 'V')}, \\quad U_C = I X_C = ${q(UC, 'V')}` },
        { text: 'Probe: Die Teilspannungen addieren sich als Zeiger, nicht als Beträge: $U = \\sqrt{U_R^2 + U_C^2}$.' },
      ],
      circuit: series2(sine(U, f), ['R', R, 'R1'], ['C', C, 'C1']), focus: 'C1',
      lab: 'Reiter «Zeiger»: U_R und U_C stehen senkrecht aufeinander.',
    };
  },
};

const w3: Gen = {
  id: 'rl-leistung', chapter: 'wechselstrom', stage: 2, title: 'RL an Netzspannung: Leistungen',
  make: (r) => {
    const U = 230, f = 50;
    const R = pick(r, [47, 100, 150, 220]);
    const L = pick(r, [0.1, 0.22, 0.47, 1]);
    const XL = PI2 * f * L, Z = Math.hypot(R, XL), I = U / Z;
    const Pw = I * I * R, Q = I * I * XL, S = U * I, cos = R / Z;
    return {
      question: 'Eine Spule mit Wicklungswiderstand (R und L in Reihe) hängt am Netz. Bestimme Strom, Wirk-, Blind- und Scheinleistung sowie den Leistungsfaktor.',
      given: [`U = ${q(U, 'V')}`, `f = ${q(f, 'Hz')}`, `R = ${q(R, 'Ω')}`, `L = ${q(L, 'H')}`],
      answers: [
        { key: 'I', label: 'I', unit: 'A', value: I },
        { key: 'P', label: 'P', unit: 'W', value: Pw },
        { key: 'Q', label: 'Q', unit: 'var', value: Q },
        { key: 'S', label: 'S', unit: 'VA', value: S },
        { key: 'cos', label: '\\cos\\varphi', unit: '', value: cos, abs: 0.01 },
      ],
      steps: [
        { text: 'Blindwiderstand und Scheinwiderstand:', tex: `X_L = 2\\pi f L = ${q(XL, 'Ω')}, \\quad |\\underline{Z}| = \\sqrt{R^2 + X_L^2} = ${q(Z, 'Ω')}` },
        { text: 'Strom:', tex: `I = \\frac{U}{|\\underline{Z}|} = ${q(I, 'A')}` },
        { text: 'Wirkleistung nur im Widerstand, Blindleistung nur in der Spule:', tex: `P = I^2 R = ${q(Pw, 'W')}, \\quad Q = I^2 X_L = ${q(Q, 'var')}` },
        { text: 'Scheinleistung und Leistungsfaktor:', tex: `S = U I = \\sqrt{P^2 + Q^2} = ${q(S, 'VA')}, \\quad \\cos\\varphi = \\frac{P}{S} = \\frac{R}{|\\underline{Z}|} = ${n(cos, 3)}` },
      ],
      circuit: series2(sine(U, f), ['R', R, 'R1'], ['L', L, 'L1']), focus: 'U1',
      lab: 'Reiter «Werte»: P, Q und S der Quelle.',
    };
  },
};

const w4: Gen = {
  id: 'resonanz', chapter: 'wechselstrom', stage: 3, title: 'RLC-Reihenschwingkreis',
  make: (r) => {
    const R = pick(r, [10, 22, 47, 100]);
    const L = pick(r, [0.01, 0.022, 0.047, 0.1]);
    const C = pick(r, [1e-6, 2.2e-6, 4.7e-6, 10e-6]);
    const U = pick(r, [1, 5, 10]);
    const f0 = 1 / (PI2 * Math.sqrt(L * C));
    const I0 = U / R, X0 = Math.sqrt(L / C), Q = X0 / R, UC = I0 * X0;
    return {
      question: 'Ein RLC-Reihenkreis wird bei seiner Resonanzfrequenz betrieben. Bestimme f₀, den Strom, die Spannung am Kondensator und die Güte.',
      given: [`U = ${q(U, 'V')}`, `R = ${q(R, 'Ω')}`, `L = ${q(L, 'H')}`, `C = ${q(C, 'F')}`],
      answers: [
        { key: 'f0', label: 'f_0', unit: 'Hz', value: f0 },
        { key: 'I0', label: 'I_0', unit: 'A', value: I0 },
        { key: 'UC', label: 'U_C', unit: 'V', value: UC },
        { key: 'Q', label: 'Q', unit: '', value: Q },
      ],
      steps: [
        { text: 'Resonanz: $X_L = X_C$, also $\\omega_0 L = 1/(\\omega_0 C)$.', tex: `f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = ${q(f0, 'Hz')}` },
        { text: 'Die Blindwiderstände heben sich auf, nur R begrenzt den Strom:', tex: `I_0 = \\frac{U}{R} = ${q(I0, 'A')}` },
        { text: 'Bei Resonanz ist der Blindwiderstand (Kennwiderstand):', tex: `X_0 = \\omega_0 L = \\sqrt{\\frac{L}{C}} = ${q(X0, 'Ω')}` },
        { text: 'Spannung am Kondensator (gleich gross wie an der Spule):', tex: `U_C = I_0 X_0 = ${q(UC, 'V')}` },
        { text: 'Güte = Spannungsüberhöhung:', tex: `Q = \\frac{X_0}{R} = \\frac{U_C}{U} = ${n(Q, 3)}` },
      ],
      circuit: rlc(sine(U, f0), R, L, C), focus: 'C1',
      lab: 'Ändere die Frequenz der Quelle: Abseits von f₀ sinkt der Strom.',
    };
  },
};

const w5: Gen = {
  id: 'tiefpass', chapter: 'wechselstrom', stage: 3, title: 'RC-Tiefpass: Grenzfrequenz und Dämpfung',
  make: (r) => {
    const R = pick(r, [1000, 2200, 4700, 10000]);
    const C = pick(r, [10e-9, 22e-9, 47e-9, 100e-9]);
    const fg = 1 / (PI2 * R * C);
    const f = nice(fg * pick(r, [0.5, 2, 5, 10]));
    const x = f / fg;
    const H = 1 / Math.sqrt(1 + x * x), dB = 20 * Math.log10(H), phi = -deg(Math.atan(x));
    return {
      question: 'Am Kondensator eines RC-Glieds wird die Ausgangsspannung abgegriffen (Tiefpass). Bestimme die Grenzfrequenz und bei der Frequenz f den Betrag und die Phase von H = U_a / U_e.',
      given: [`R = ${q(R, 'Ω')}`, `C = ${q(C, 'F')}`, `f = ${q(f, 'Hz')}`],
      answers: [
        { key: 'fg', label: 'f_g', unit: 'Hz', value: fg },
        { key: 'H', label: '|\\underline{H}|', unit: '', value: H },
        { key: 'dB', label: '|\\underline{H}|_{dB}', unit: 'dB', value: dB, abs: 0.3 },
        { key: 'phi', label: '\\varphi', unit: '°', value: phi, abs: 1 },
      ],
      steps: [
        { text: 'Spannungsteiler mit komplexen Widerständen:', tex: '\\underline{H} = \\frac{\\underline{U}_a}{\\underline{U}_e} = \\frac{1/(j\\omega C)}{R + 1/(j\\omega C)} = \\frac{1}{1 + j\\omega RC} = \\frac{1}{1 + j\\,f/f_g}' },
        { text: 'Grenzfrequenz (dort ist $|\\underline{H}| = 1/\\sqrt{2}$, also −3 dB):', tex: `f_g = \\frac{1}{2\\pi RC} = ${q(fg, 'Hz')}` },
        { text: `Bei $f/f_g = ${n(x, 3)}$:`, tex: `|\\underline{H}| = \\frac{1}{\\sqrt{1 + (f/f_g)^2}} = ${n(H, 3)} \\;\\hat{=}\\; ${n(dB, 3)}\\,\\mathrm{dB}` },
        { text: 'Phase:', tex: `\\varphi = -\\arctan\\frac{f}{f_g} = ${n(phi, 3)}^\\circ` },
        { text: 'Weit oberhalb von $f_g$ fällt der Betrag mit 20 dB pro Dekade.' },
      ],
      circuit: series2({ ...sine(1 / Math.SQRT2, f) }, ['R', R, 'R1'], ['C', C, 'C1']), focus: 'C1',
      lab: 'Reiter «Frequenzgang»: f_g ist markiert.',
    };
  },
};

/* ---------- Schaltvorgänge ---------- */

const rcSwitched = (U: number, R: number, C: number) => switched((a) => [
  two('R', a, P(6, 0), { value: R, name: 'R1' }),
  two('C', P(6, 0), P(6, 2), { value: C, name: 'C1' }),
  wires(P(6, 2), P(2, 2), P(0, 2)),
], U);

const s1: Gen = {
  id: 'tau', chapter: 'schaltvorgaenge', stage: 1, title: 'Zeitkonstante beim Laden',
  make: (r) => {
    const U = pick(r, [5, 10, 12]);
    const R = pick(r, [1000, 2200, 4700, 10000]);
    const C = pick(r, [10e-6, 22e-6, 47e-6, 100e-6]);
    const tau = R * C, u1 = U * (1 - Math.exp(-1)), th = tau * Math.LN2;
    return {
      question: 'Ein leerer Kondensator wird bei t = 0 über R an U gelegt. Bestimme die Zeitkonstante, die Spannung nach einer Zeitkonstanten und wann die halbe Endspannung erreicht ist.',
      given: [`U = ${q(U, 'V')}`, `R = ${q(R, 'Ω')}`, `C = ${q(C, 'F')}`],
      answers: [
        { key: 'tau', label: '\\tau', unit: 's', value: tau },
        { key: 'u1', label: 'u_C(\\tau)', unit: 'V', value: u1 },
        { key: 'th', label: 't_{1/2}', unit: 's', value: th },
      ],
      steps: [
        { text: 'Zeitkonstante:', tex: `\\tau = R C = ${q(R, 'Ω')} \\cdot ${q(C, 'F')} = ${q(tau, 's')}` },
        { text: 'Ladekurve:', tex: `u_C(t) = U \\left(1 - e^{-t/\\tau}\\right), \\quad u_C(\\tau) = U (1 - e^{-1}) = 0.632\\,U = ${q(u1, 'V')}` },
        { text: 'Halbe Endspannung: $1 - e^{-t/\\tau} = 1/2$:', tex: `t_{1/2} = \\tau \\ln 2 = ${q(th, 's')}` },
        { text: `Nach $5\\tau = ${q(5 * tau, 's')}$ ist der Kondensator praktisch voll (99.3 %).` },
      ],
      circuit: rcSwitched(U, R, C), focus: 'C1',
      lab: 'Neustart drücken: Die Ladekurve beginnt bei t = 0. Umschalter antippen entlädt.',
    };
  },
};

const s2: Gen = {
  id: 'laden', chapter: 'schaltvorgaenge', stage: 2, title: 'Kondensator laden: Spannung und Strom',
  make: (r) => {
    const U = pick(r, [5, 10, 12, 24]);
    const R = pick(r, [1000, 2200, 4700]);
    const C = pick(r, [10e-6, 22e-6, 47e-6, 100e-6]);
    const tau = R * C;
    const t = nice(tau * pick(r, [0.5, 1.5, 2, 3]));
    const e = Math.exp(-t / tau);
    const i0 = U / R, uc = U * (1 - e), it = i0 * e;
    return {
      question: 'Ein leerer Kondensator wird bei t = 0 über R an U geschaltet. Wie gross ist der Strom im Einschaltmoment, und welche Werte haben Spannung und Strom zur Zeit t?',
      given: [`U = ${q(U, 'V')}`, `R = ${q(R, 'Ω')}`, `C = ${q(C, 'F')}`, `t = ${q(t, 's')}`],
      answers: [
        { key: 'i0', label: 'i(0)', unit: 'A', value: i0 },
        { key: 'uc', label: 'u_C(t)', unit: 'V', value: uc },
        { key: 'it', label: 'i(t)', unit: 'A', value: it },
      ],
      steps: [
        { text: 'Die Kondensatorspannung kann nicht springen: Im ersten Moment ist $u_C = 0$ und die ganze Spannung liegt an R.', tex: `i(0) = \\frac{U}{R} = ${q(i0, 'A')}` },
        { text: 'Zeitkonstante:', tex: `\\tau = RC = ${q(tau, 's')}, \\quad \\frac{t}{\\tau} = ${n(t / tau, 3)}` },
        { text: 'Spannung:', tex: `u_C(t) = U\\left(1 - e^{-t/\\tau}\\right) = ${q(U, 'V')} \\cdot (1 - ${n(e, 3)}) = ${q(uc, 'V')}` },
        { text: 'Strom (klingt ab):', tex: `i(t) = \\frac{U}{R} e^{-t/\\tau} = ${q(it, 'A')}` },
      ],
      circuit: rcSwitched(U, R, C), focus: 'C1',
      lab: 'Neustart drücken und den Wert bei t im Oszilloskop ablesen (Anhalten hilft).',
    };
  },
};

const s3: Gen = {
  id: 'rl-ein', chapter: 'schaltvorgaenge', stage: 2, title: 'Spule einschalten (RL)',
  make: (r) => {
    const U = pick(r, [10, 12, 24]);
    const R = pick(r, [10, 22, 47, 100]);
    const L = pick(r, [0.1, 0.22, 0.47, 1]);
    const tau = L / R, Iend = U / R;
    const t = nice(tau * pick(r, [0.5, 1, 2]));
    const e = Math.exp(-t / tau);
    const it = Iend * (1 - e), ul = U * e;
    return {
      question: 'Eine Spule (L) mit Vorwiderstand R wird bei t = 0 an U geschaltet. Bestimme Zeitkonstante, Endstrom, den Strom zur Zeit t und die Spannung an der Spule.',
      given: [`U = ${q(U, 'V')}`, `R = ${q(R, 'Ω')}`, `L = ${q(L, 'H')}`, `t = ${q(t, 's')}`],
      answers: [
        { key: 'tau', label: '\\tau', unit: 's', value: tau },
        { key: 'Iend', label: 'I_\\infty', unit: 'A', value: Iend },
        { key: 'it', label: 'i(t)', unit: 'A', value: it },
        { key: 'ul', label: 'u_L(t)', unit: 'V', value: ul },
      ],
      steps: [
        { text: 'Zeitkonstante bei der Spule:', tex: `\\tau = \\frac{L}{R} = ${q(tau, 's')}` },
        { text: 'Im eingeschwungenen Zustand wirkt die Spule wie ein Draht:', tex: `I_\\infty = \\frac{U}{R} = ${q(Iend, 'A')}` },
        { text: 'Der Strom kann nicht springen, er steigt exponentiell:', tex: `i(t) = I_\\infty\\left(1 - e^{-t/\\tau}\\right) = ${q(it, 'A')}` },
        { text: 'Die Spulenspannung springt auf U und klingt ab:', tex: `u_L(t) = U e^{-t/\\tau} = ${q(ul, 'V')}` },
      ],
      circuit: switched((a) => [
        two('R', a, P(6, 0), { value: R, name: 'R1' }),
        two('L', P(6, 0), P(6, 2), { value: L, name: 'L1' }),
        wires(P(6, 2), P(2, 2), P(0, 2)),
      ], U),
      focus: 'L1',
    };
  },
};

const s4: Gen = {
  id: 'entladen', chapter: 'schaltvorgaenge', stage: 3, title: 'Kondensator entladen: Energie und Verlauf',
  make: (r) => {
    const U = pick(r, [10, 12, 24]);
    const C = pick(r, [100e-6, 220e-6, 470e-6, 1000e-6]);
    const R = pick(r, [100, 220, 470, 1000]);
    const tau = R * C;
    const t = nice(tau * pick(r, [0.5, 1, 2, 3]));
    const W = 0.5 * C * U * U, uc = U * Math.exp(-t / tau), i0 = U / R;
    return {
      question: 'Ein auf U geladener Kondensator wird bei t = 0 über R entladen. Bestimme die gespeicherte Energie, den Strombetrag im ersten Moment und die Spannung zur Zeit t.',
      given: [`U = ${q(U, 'V')}`, `C = ${q(C, 'F')}`, `R = ${q(R, 'Ω')}`, `t = ${q(t, 's')}`],
      answers: [
        { key: 'W', label: 'W', unit: 'J', value: W },
        { key: 'i0', label: '|i(0)|', unit: 'A', value: i0 },
        { key: 'uc', label: 'u_C(t)', unit: 'V', value: uc },
      ],
      steps: [
        { text: 'Energie im elektrischen Feld:', tex: `W = \\tfrac{1}{2} C U^2 = ${q(W, 'J')}` },
        { text: 'Die Spannung am Kondensator bleibt im ersten Moment U, sie treibt den Strom durch R (entgegen der Ladestromrichtung):', tex: `|i(0)| = \\frac{U}{R} = ${q(i0, 'A')}` },
        { text: 'Entladekurve mit $\\tau = RC$:', tex: `\\tau = ${q(tau, 's')}, \\quad u_C(t) = U e^{-t/\\tau} = ${q(uc, 'V')}` },
        { text: 'Die ganze Energie W wird im Widerstand in Wärme umgesetzt, unabhängig von R.' },
      ],
      circuit: rcSwitched(U, R, C), focus: 'C1',
      lab: 'Warte, bis C voll ist (über 5 τ), dann Umschalter antippen: Der Strom springt negativ.',
    };
  },
};

const DAMP_OPTIONS = ['gedämpfte Schwingung (Schwingfall)', 'aperiodischer Grenzfall', 'Kriechfall (aperiodisch)'];

const s5: Gen = {
  id: 'rlc-fall', chapter: 'schaltvorgaenge', stage: 3, title: 'RLC-Schaltvorgang: welcher Fall?',
  make: (r) => {
    const R = pick(r, [10, 22, 47, 100, 220, 470]);
    const L = pick(r, [0.1, 0.22]);
    const C = pick(r, [1e-6, 2.2e-6, 10e-6]);
    const delta = R / (2 * L), w0 = 1 / Math.sqrt(L * C), f0 = w0 / PI2, Rg = 2 * Math.sqrt(L / C);
    const osc = delta < w0;
    const fd = osc ? Math.sqrt(w0 * w0 - delta * delta) / PI2 : 0;
    return {
      question: 'Ein Reihenkreis aus R, L und C wird an eine Gleichspannung geschaltet. Bestimme Abklingkonstante und Kennfrequenz, den Widerstand für den aperiodischen Grenzfall und entscheide, welcher Fall vorliegt.',
      given: [`R = ${q(R, 'Ω')}`, `L = ${q(L, 'H')}`, `C = ${q(C, 'F')}`],
      answers: [
        { key: 'delta', label: '\\delta', unit: '1/s', value: delta },
        { key: 'f0', label: 'f_0', unit: 'Hz', value: f0 },
        { key: 'Rg', label: 'R_{aG}', unit: 'Ω', value: Rg },
        ...(osc ? [{ key: 'fd', label: 'f_d', unit: 'Hz', value: fd }] : []),
      ],
      choices: [{ key: 'fall', label: 'Fall', options: DAMP_OPTIONS, correct: osc ? 0 : 2 }],
      steps: [
        { text: 'Die Differentialgleichung des Reihenkreises hat die charakteristische Gleichung', tex: 's^2 + 2\\delta s + \\omega_0^2 = 0 \\quad\\text{mit}\\quad \\delta = \\frac{R}{2L},\\; \\omega_0 = \\frac{1}{\\sqrt{LC}}' },
        { text: 'Einsetzen:', tex: `\\delta = ${qs(delta)}, \\quad \\omega_0 = ${qs(w0)}, \\quad f_0 = \\frac{\\omega_0}{2\\pi} = ${q(f0, 'Hz')}` },
        { text: 'Grenzfall bei $\\delta = \\omega_0$:', tex: `R_{aG} = 2\\sqrt{\\frac{L}{C}} = ${q(Rg, 'Ω')}` },
        osc
          ? { text: `Hier ist $\\delta < \\omega_0$ (R kleiner als ${q(Rg, 'Ω')}): gedämpfte Schwingung mit`, tex: `\\omega_d = \\sqrt{\\omega_0^2 - \\delta^2}, \\quad f_d = ${q(fd, 'Hz')}` }
          : { text: `Hier ist $\\delta > \\omega_0$ (R grösser als ${q(Rg, 'Ω')}): Kriechfall, keine Schwingung. Die Lösung ist eine Summe zweier abklingender e-Funktionen.` },
      ],
      circuit: switched((a) => [
        two('R', a, P(6, 0), { value: R, name: 'R1' }),
        two('L', P(6, 0), P(8, 0), { value: L, name: 'L1' }),
        two('C', P(8, 0), P(8, 2), { value: C, name: 'C1' }),
        wires(P(8, 2), P(2, 2), P(0, 2)),
      ], 10),
      focus: 'C1',
      lab: 'Reiter «Werte»: Kennwerte zeigen δ, f₀ und den Fall. Ändere R und vergleiche.',
    };
  },
};

export const TASKS: Gen[] = [g1, g2, g3, g4, g5, g6, w1, w2, w3, w4, w5, s1, s2, s3, s4, s5];

export const tasksOf = (chapter: string) => TASKS.filter((t) => t.chapter === chapter);
