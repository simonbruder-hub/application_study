/**
 * Zahlen lesen und schreiben wie in der Schweiz: 5’000.00 Fr., 10.64 %.
 * Eingaben dürfen Tausendertrennzeichen (' oder ’) und ein Komma statt des Punkts enthalten.
 */

/** Liest «5'000», «5’000.50», «37,5» oder « 42 ». Leer, negativ oder ungültig: null */
export function zahl(text: string): number | null {
  const t = text.trim().replace(/[\s'’`]/g, '').replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** Auf Rappen runden (kaufmännisch, 2.675 → 2.68 trotz Gleitkomma) */
export function rappen(x: number): number {
  return Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100;
}

/**
 * Tausender mit ’ trennen. Bewusst ohne Intl: Browser und Node schreiben de-CH
 * mal mit ' und mal mit ’, so sieht es überall gleich aus.
 */
const tausender = (ganz: string) => ganz.replace(/\B(?=(\d{3})+(?!\d))/g, '’');

/** 5000 → «5’000.00» */
export function franken(x: number): string {
  const [ganz = '0', rp = '00'] = rappen(x).toFixed(2).split('.');
  return `${tausender(ganz)}.${rp}`;
}

/** 2184 → «2’184», 1747.2 → «1’747.2» */
export function anzahl(x: number): string {
  const [ganz = '0', rest] = String(Math.round(x * 100) / 100).split('.');
  return rest ? `${tausender(ganz)}.${rest}` : tausender(ganz);
}

/** 0.1064 → «10.64 %» */
export const prozent = (satz: number) => `${(satz * 100).toFixed(2)} %`;
