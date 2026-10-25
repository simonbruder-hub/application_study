/**
 * Zahlen mit SI-Vorsätzen lesen und schreiben (4.7k, 4k7, 100µ, 2,2 mF) und E-Reihen.
 */

const PREFIXES: [string, number][] = [
  ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15],
];

/** Schreibt einen Wert mit SI-Vorsatz und Einheit, z. B. 0.0047 F → "4.7 mF" */
export function si(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return value > 0 ? `∞ ${unit}`.trim() : value < 0 ? `−∞ ${unit}`.trim() : '–';
  const abs = Math.abs(value);
  // Unterhalb von Femto: Rechenrauschen
  if (abs < 1e-15) return `0 ${unit}`.trim();
  let [pre, f] = PREFIXES[PREFIXES.length - 1]!;
  for (const [p, m] of PREFIXES) {
    if (abs >= m * 0.9995) { pre = p; f = m; break; }
  }
  let m = value / f;
  let s = m.toPrecision(digits);
  // 999.7 → 1000: eine Stufe höher
  if (Math.abs(Number(s)) >= 1000 && f < 1e9) {
    const i = PREFIXES.findIndex(([p]) => p === pre);
    [pre, f] = PREFIXES[i - 1]!;
    m = value / f;
    s = m.toPrecision(digits);
  }
  if (s.includes('e')) s = String(Number(s));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return `${s.replace('-', '−')} ${pre}${unit}`.trim();
}

/** Wert in 1/s ohne SI-Vorsatz (k1/s liest sich schlecht) */
export const perSecond = (value: number) => `${Math.abs(value) >= 1000 ? Math.round(value).toLocaleString('de-CH') : num(value)} 1/s`;

/** Zahl ohne Einheit, gerundet auf signifikante Stellen */
export function num(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return '0';
  let s = value.toPrecision(digits);
  if (s.includes('e')) {
    const [m, e] = s.split('e') as [string, string];
    return `${m.replace(/\.?0+$/, '')}·10^${Number(e)}`.replace('-', '−');
  }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('-', '−');
}

const PREFIX_OF: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
/** Längere Einheiten zuerst (VA vor A) */
const UNITS = ['Ohm', 'ohm', '1/s', '/s', 'var', 'VA', 'Hz', 'Ω', 'V', 'A', 'F', 'H', 'W', 'J', 's', 'S', '°', 'dB'];

/** Liest Eingaben wie "4.7k", "4,7 kΩ", "4k7", "100u", "1e-3", "2.2 mF", "50 Hz". Ungültig: NaN */
export function parseSI(text: string): number {
  let t = text.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/−/g, '-');
  if (!t) return NaN;
  for (const u of UNITS) {
    if (t.endsWith(u) && t.length > u.length) { t = t.slice(0, -u.length); break; }
  }
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([GMkKmuµμnpf]?)(\d*)$/.exec(t);
  if (!m) return NaN;
  const [, base, pre = '', tail = ''] = m;
  let v = Number(base);
  if (tail) {
    // 4k7 = 4.7k
    if (!pre || base!.includes('.') || base!.includes('e')) return NaN;
    v = Number(`${base}.${tail}`);
  }
  return v * (pre ? PREFIX_OF[pre]! : 1);
}

export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** Nächster Wert der E12-Reihe nach oben (dir = 1) oder unten (dir = −1) */
export function stepE12(value: number, dir: 1 | -1): number {
  if (!(value > 0)) return 1;
  const e = Math.floor(Math.log10(value) + 1e-9);
  const all = [-1, 0, 1].flatMap((d) => E12.map((x) => x * 10 ** (e + d)));
  const eps = 1e-6 * value;
  if (dir > 0) return all.find((x) => x > value + eps) ?? value * 10;
  const lower = all.filter((x) => x < value - eps);
  return lower.length ? lower[lower.length - 1]! : value / 10;
}

/** Rundet auf den nächsten E12-Wert */
export function nearestE12(value: number): number {
  if (!(value > 0)) return value;
  const e = Math.floor(Math.log10(value));
  const all = [-1, 0, 1].flatMap((d) => E12.map((x) => x * 10 ** (e + d)));
  return all.reduce((best, x) => (Math.abs(Math.log(x / value)) < Math.abs(Math.log(best / value)) ? x : best), all[0]!);
}
