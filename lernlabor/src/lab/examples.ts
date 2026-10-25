/** Fertige Beispielschaltungen für den Baukasten */
import { circuit, gnd, P, spdt, two, wire, wires } from '../sim/build';
import type { Circuit, Part, Pt } from '../sim/circuit';

export interface Example {
  id: string;
  title: string;
  topic: 'gleich' | 'wechsel' | 'zeit';
  hint: string;
  /** Bauteil, das am Anfang ausgewählt ist (Oszilloskop) */
  focus: string;
  make: () => Circuit;
}

/** Quelle links mit Umschalter: oben (Stellung 1) liegt die Kette an der Quelle, unten (Stellung 0) ist sie kurzgeschlossen */
export function switched(chain: (from: Pt) => (Part | Part[])[], U: number) {
  return circuit(
    two('V', P(0, 0), P(0, 2), { value: U, name: 'U1' }),
    wires(P(0, 0), P(0, -1), P(2, -1)),
    spdt(P(4, 0), 2, 1, 'S1'),
    wire(P(2, 1), P(2, 2)),
    gnd(P(0, 2)),
    chain(P(4, 0)).flat(),
  );
}

export const EXAMPLES: Example[] = [
  {
    id: 'teiler', title: 'Spannungsteiler mit Last', topic: 'gleich', focus: 'R2',
    hint: 'Schliesse S1: Die Last R3 liegt parallel zu R2 und die Spannung am Teiler sinkt.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 12, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      wire(P(2, 0), P(4, 0)),
      two('R', P(4, 0), P(4, 2), { value: 2200, name: 'R2' }),
      wire(P(4, 0), P(6, 0)),
      two('VM', P(6, 0), P(6, 2), { name: 'V1' }),
      two('S', P(6, 0), P(8, 0), { closed: false, name: 'S1' }),
      two('R', P(8, 0), P(8, 2), { value: 1000, name: 'R3' }),
      wires(P(8, 2), P(6, 2), P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
  {
    id: 'lampen', title: 'Lampen in Reihe und parallel', topic: 'gleich', focus: 'H1',
    hint: 'Schalte S1 und S2: Der Strommesser zeigt den Gesamtstrom, jede Lampe leuchtet nach ihrer Leistung.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 12, name: 'U1' }),
      two('S', P(0, 0), P(2, 0), { closed: true, name: 'S1' }),
      two('AM', P(2, 0), P(4, 0), { name: 'A1' }),
      two('lamp', P(4, 0), P(4, 2), { value: 48, power: 3, name: 'H1' }),
      wire(P(4, 0), P(6, 0)),
      two('S', P(6, 0), P(8, 0), { closed: false, name: 'S2' }),
      two('lamp', P(8, 0), P(8, 2), { value: 48, power: 3, name: 'H2' }),
      wires(P(8, 2), P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
  {
    id: 'rc', title: 'RC: Laden und Entladen', topic: 'zeit', focus: 'C1',
    hint: 'Tippe den Umschalter S1 an: Oben lädt die Quelle C über R, unten entlädt sich C über R. Nach 1 τ sind 63 % erreicht, nach 5 τ ist der Vorgang praktisch fertig.',
    make: () => switched((a) => [
      two('R', a, P(6, 0), { value: 1000, name: 'R1' }),
      two('C', P(6, 0), P(6, 2), { value: 100e-6, name: 'C1' }),
      wires(P(6, 2), P(2, 2), P(0, 2)),
    ], 10),
  },
  {
    id: 'rl', title: 'RL: Ein- und Ausschalten', topic: 'zeit', focus: 'L1',
    hint: 'Die Spule hält den Strom fest: Beim Umschalten springt die Spannung, der Strom ändert sich stetig mit τ = L/R.',
    make: () => switched((a) => [
      two('R', a, P(6, 0), { value: 100, name: 'R1' }),
      two('L', P(6, 0), P(6, 2), { value: 1, name: 'L1' }),
      wires(P(6, 2), P(2, 2), P(0, 2)),
    ], 10),
  },
  {
    id: 'rlc-schalt', title: 'RLC: gedämpfte Schwingung', topic: 'zeit', focus: 'C1',
    hint: 'Nach dem Umschalten schwingt der Kreis mit f_d und klingt mit δ = R/(2L) ab. Ändere R: Bei R = 2·√(L/C) ist der aperiodische Grenzfall erreicht.',
    make: () => switched((a) => [
      two('R', a, P(6, 0), { value: 20, name: 'R1' }),
      two('L', P(6, 0), P(8, 0), { value: 0.1, name: 'L1' }),
      two('C', P(8, 0), P(8, 2), { value: 10e-6, name: 'C1' }),
      wires(P(8, 2), P(2, 2), P(0, 2)),
    ], 10),
  },
  {
    id: 'rc-rechteck', title: 'RC an Rechteckspannung', topic: 'zeit', focus: 'C1',
    hint: 'Die Periode ist 10 τ: C lädt und entlädt sich fast vollständig. Erhöhe die Frequenz und sieh, wie aus dem Rechteck ein Dreieck wird.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 2.5, offset: 2.5, shape: 'square', freq: 100, phase: 0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      wire(P(2, 0), P(4, 0)),
      two('C', P(4, 0), P(4, 2), { value: 1e-6, name: 'C1' }),
      wire(P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
  {
    id: 'tiefpass', title: 'RC-Tiefpass an Sinus', topic: 'wechsel', focus: 'C1',
    hint: 'Bei f_g ist U_C um 3 dB kleiner (Faktor 0.707) und eilt 45° nach. Sieh dir Zeiger und Frequenzgang an.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 1, shape: 'sine', freq: 1000, phase: 0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 1000, name: 'R1' }),
      wire(P(2, 0), P(4, 0)),
      two('C', P(4, 0), P(4, 2), { value: 159e-9, name: 'C1' }),
      wire(P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
  {
    id: 'rlc-reihe', title: 'RLC-Reihenschwingkreis', topic: 'wechsel', focus: 'R1',
    hint: 'Bei Resonanz heben sich U_L und U_C auf, der Strom ist maximal und nur durch R begrenzt. Ändere f und beobachte Phase und Strom.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 10, shape: 'sine', freq: 159.2, phase: 0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 10, name: 'R1' }),
      two('L', P(2, 0), P(4, 0), { value: 0.1, name: 'L1' }),
      two('C', P(4, 0), P(4, 2), { value: 10e-6, name: 'C1' }),
      wire(P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
  {
    id: 'rl-wechsel', title: 'RL an Wechselspannung: Leistung', topic: 'wechsel', focus: 'U1',
    hint: 'Der Strom eilt der Spannung nach. P ist die Wirkleistung in R, Q die Blindleistung in L, S = U·I.',
    make: () => circuit(
      two('V', P(0, 0), P(0, 2), { value: 325, shape: 'sine', freq: 50, phase: 0, name: 'U1' }),
      two('R', P(0, 0), P(2, 0), { value: 100, name: 'R1' }),
      wire(P(2, 0), P(4, 0)),
      two('L', P(4, 0), P(4, 2), { value: 0.318, name: 'L1' }),
      wire(P(4, 2), P(0, 2)),
      gnd(P(0, 2)),
    ),
  },
];

export const exampleById = (id: string) => EXAMPLES.find((e) => e.id === id);
