/**
 * Laufende Simulation des Baukastens: rechnet den Zeitverlauf in Echtzeit oder Zeitlupe,
 * speichert u(t) und i(t) aller Bauteile für das Oszilloskop und hält Kennwerte, Arbeitspunkt
 * und Zeigerrechnung zur aktuellen Schaltung bereit.
 */
import { effect, signal } from '@preact/signals';
import { acFrequency, autoTiming, type Modes, naturalModes, onlyDC, type Timing } from '../sim/analysis';
import type { Circuit } from '../sim/circuit';
import { type Solution, solveAC, solveDC, Transient } from '../sim/mna';
import { buildNetlist, type Netlist } from '../sim/netlist';
import { circuit } from './state';

/** Simulation läuft */
export const running = signal(true);
/** Tempo relativ zur gewählten Zeitlupe (0.25 … 4) */
export const tempo = signal(1);
/** Zeit pro Teilung von Hand (null: automatisch) */
export const manualDiv = signal<number | null>(null);
/** Zählt hoch, wenn sich Werte geändert haben (für Anzeigen, etwa 8-mal pro Sekunde) */
export const live = signal(0);
/** Neu aufgebaut (Schaltung geändert) */
export const version = signal(0);

/** Anzahl gespeicherter Messpunkte je Bauteil */
export const NS = 1200;
const MAX_STEPS_PER_FRAME = 4000;

export interface Buf { u: Float32Array; i: Float32Array }

class Engine {
  net!: Netlist;
  modes!: Modes;
  auto!: Timing;
  sim!: Transient;
  perDiv = 1;
  h = 1e-3;
  /** Wechselstromrechnung (alle Sinusquellen gleicher Frequenz) */
  acF: number | null = null;
  ac: Solution | null = null;
  /** Gleichstrom-Arbeitspunkt (nur Gleichquellen) */
  dc: Solution | null = null;
  readonly times = new Float64Array(NS).fill(NaN);
  head = 0;
  readonly bufs = new Map<string, Buf>();
  private sampleDt = 1e-3;
  private nextSample = 0;
  private raf = 0;
  private lastFrame = 0;
  private lastLive = 0;

  constructor() {
    effect(() => {
      const c = circuit.value;
      manualDiv.value;
      this.rebuild(c);
    });
  }

  /** Sekunden Simulationszeit pro Sekunde Echtzeit */
  get speed(): number {
    const sweep = this.perDiv * 10;
    const base = sweep >= 2 ? (sweep > 20 ? sweep / 20 : 1) : sweep / 2.5;
    return base * tempo.value;
  }

  rebuild(c: Circuit, fresh = false) {
    this.net = buildNetlist(c);
    this.modes = naturalModes(this.net);
    this.auto = autoTiming(this.net, this.modes);
    this.perDiv = manualDiv.value ?? this.auto.perDiv;
    const sweep = this.perDiv * 10;
    this.h = Math.min(Math.max(this.auto.h, sweep / 40000), sweep / 1500);
    // Neue Schaltung (keine gemeinsamen Bauteile): bei t = 0 neu beginnen, sonst stetig weiterrechnen
    const keep = !fresh && this.sim && this.net.elems.some((e) => this.sim.hist.has(e.part.id) || this.bufs.has(e.part.id));
    this.sim = new Transient(this.net, this.h, keep ? this.sim.hist : undefined, keep ? this.sim.t : 0);
    this.sampleDt = sweep / (NS - 100);
    if (!keep) { this.times.fill(NaN); this.bufs.clear(); this.nextSample = 0; this.head = 0; }
    for (const e of this.net.elems) {
      if (!this.bufs.has(e.part.id)) this.bufs.set(e.part.id, { u: new Float32Array(NS).fill(NaN), i: new Float32Array(NS).fill(NaN) });
    }
    this.acF = acFrequency(this.net);
    this.ac = this.acF ? solveAC(this.net, this.acF) : null;
    this.dc = onlyDC(this.net) ? solveDC(this.net) : null;
    if (!keep) this.record();
    // peek: Schreiben ohne Lesen, sonst hängt der effect von sich selbst ab
    version.value = version.peek() + 1;
    live.value = live.peek() + 1;
  }

  /** Neustart bei t = 0 mit leeren Speichern */
  reset() {
    this.rebuild(circuit.value, true);
  }

  private record() {
    const s = this.sim.last;
    const k = this.head;
    this.times[k] = this.sim.t;
    this.net.elems.forEach((e, idx) => {
      const b = this.bufs.get(e.part.id)!;
      b.u[k] = s.uRe[idx]!;
      b.i[k] = s.iRe[idx]!;
    });
    this.head = (k + 1) % NS;
    this.nextSample = this.sim.t + this.sampleDt;
  }

  advance(realDt: number) {
    const target = this.sim.t + Math.min(realDt, 0.1) * this.speed;
    let n = 0;
    while (this.sim.t < target && n < MAX_STEPS_PER_FRAME) {
      this.sim.step();
      n++;
      if (this.sim.t >= this.nextSample) this.record();
    }
  }

  start() {
    if (this.raf) return;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      if (running.value && !this.sim.error) this.advance(dt);
      if (now - this.lastLive > 120) { this.lastLive = now; live.value = live.peek() + 1; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  indexOf(id: string): number {
    return this.net.elems.findIndex((e) => e.part.id === id);
  }

  /** Momentanwerte eines Bauteils */
  now(id: string): { u: number; i: number } | null {
    const k = this.indexOf(id);
    if (k < 0) return null;
    return { u: this.sim.last.uRe[k]!, i: this.sim.last.iRe[k]! };
  }

  /** Statistik über die sichtbare Zeit (10 Teilungen): Spitze, Mittelwert, Effektivwert */
  stats(id: string, q: 'u' | 'i'): { peak: number; mean: number; rms: number } | null {
    const b = this.bufs.get(id);
    if (!b) return null;
    const t1 = this.sim.t, t0 = t1 - this.perDiv * 10;
    let n = 0, sum = 0, sq = 0, peak = 0;
    const arr = b[q];
    for (let k = 0; k < NS; k++) {
      const t = this.times[k]!, v = arr[k]!;
      if (!(t >= t0) || Number.isNaN(v)) continue;
      n++; sum += v; sq += v * v;
      if (Math.abs(v) > Math.abs(peak)) peak = v;
    }
    if (!n) return null;
    return { peak, mean: sum / n, rms: Math.sqrt(sq / n) };
  }
}

export const engine = new Engine();
