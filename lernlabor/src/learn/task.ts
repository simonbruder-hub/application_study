/**
 * Aufgaben mit zufälligen Werten: Jede Aufgabe ist ein Generator, der aus einem Startwert (seed)
 * Angaben, gesuchte Grössen mit Lösung, den Lösungsweg und die passende Schaltung erzeugt.
 */
import type { Circuit } from '../sim/circuit';
import { si } from '../sim/units';

export interface Answer {
  key: string;
  /** Formelzeichen in TeX, z. B. "U_2" */
  label: string;
  unit: string;
  value: number;
  /** Erlaubte relative Abweichung (Standard 2.5 %) */
  tol?: number;
  /** Erlaubte absolute Abweichung (z. B. Winkel in Grad) */
  abs?: number;
}

export interface Choice { key: string; label: string; options: string[]; correct: number }

export interface Step {
  /** Erklärung, $…$ wird als Formel gesetzt */
  text: string;
  /** Formel als eigene Zeile */
  tex?: string;
}

export interface Task {
  question: string;
  given: string[];
  answers: Answer[];
  choices?: Choice[];
  steps: Step[];
  circuit?: Circuit;
  /** Bauteil, das im Baukasten ausgewählt wird */
  focus?: string;
  /** Hinweis im Baukasten */
  lab?: string;
}

export interface Gen {
  id: string;
  chapter: string;
  stage: 1 | 2 | 3;
  title: string;
  make: (r: Rng) => Task;
}

export type Rng = () => number;

/** Reproduzierbarer Zufall (mulberry32) */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const TEX_UNIT: Record<string, string> = { Ω: '\\Omega', µ: '\\mu ', '°': '^\\circ' };

/** Wert mit Einheit als TeX, z. B. 4700 Ω → 4.7\,\mathrm{k\Omega} */
export function q(value: number, unit: string, digits = 3): string {
  const s = si(value, unit, digits);
  const sp = s.indexOf(' ');
  const n = (sp < 0 ? s : s.slice(0, sp)).replace('−', '-');
  const u = sp < 0 ? '' : s.slice(sp + 1);
  if (!u) return n;
  if (u === '°') return `${n}^\\circ`;
  const tu = [...u].map((ch) => TEX_UNIT[ch] ?? ch).join('');
  return `${n}\\,\\mathrm{${tu}}`;
}

/** Wert in 1/s als TeX (ohne SI-Vorsatz) */
export const qs = (value: number, digits = 3) => `${n(value, digits)}\\,\\mathrm{s^{-1}}`;

/** Zahl ohne Einheit für TeX */
export function n(value: number, digits = 3): string {
  const s = Number(value.toPrecision(digits));
  if (Math.abs(s) >= 1e5 || (Math.abs(s) < 1e-3 && s !== 0)) {
    const e = Math.floor(Math.log10(Math.abs(s)));
    return `${Number((s / 10 ** e).toPrecision(digits))}\\cdot 10^{${e}}`;
  }
  return String(s);
}

export function isCorrect(a: Answer, x: number): boolean {
  if (!Number.isFinite(x)) return false;
  if (a.abs !== undefined) return Math.abs(x - a.value) <= a.abs;
  return Math.abs(x - a.value) <= (a.tol ?? 0.025) * Math.abs(a.value) + 1e-15;
}
