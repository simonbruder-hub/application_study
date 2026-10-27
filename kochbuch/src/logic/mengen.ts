/**
 * Mengen umrechnen, runden und schreiben. Schweizer Schreibweise mit Komma; Löffel und Stückzahlen
 * als Brüche (½ TL, 1½ Zwiebel), Gramm und Liter als Dezimalzahl (2,5 dl).
 */

const BRUECHE: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾']];
const BRUCH_WERT: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const METRISCH = new Set(['g', 'kg', 'ml', 'cl', 'dl', 'l']);
/** Wörter nach einer Zahl, die eine Einheit sind (sonst ist es ein Ding wie «Zwiebel») */
const EINHEITEN = new Set([...METRISCH, 'el', 'tl', 'msp', 'prise', 'prisen', 'dose', 'dosen', 'bund', 'handvoll',
  'würfel', 'päckchen', 'beutel', 'becher', 'glas', 'tasse', 'scheibe', 'scheiben', 'stück', 'zehe', 'zehen']);

const klein = (e: string | null | undefined) => (e ?? '').toLowerCase();

/** Rundet auf eine Stufe, die man in der Küche abmessen kann */
export function runde(x: number, einheit: string | null): number {
  const e = klein(einheit);
  if (e === 'g' || e === 'ml') return x >= 100 ? Math.round(x / 10) * 10 : x >= 20 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x));
  if (METRISCH.has(e)) return Math.max(0.05, Math.round(x * 20) / 20);
  return Math.max(0.25, Math.round(x * 4) / 4);
}

/** 1.5 → «1½» (Stück, Löffel) oder «1,5» (dl, kg) */
export function zahlText(x: number, einheit: string | null = null): string {
  const ganz = Math.floor(x + 1e-9);
  const rest = x - ganz;
  if (rest < 1e-6) return String(ganz);
  if (!METRISCH.has(klein(einheit))) {
    for (const [wert, zeichen] of BRUECHE) if (Math.abs(rest - wert) < 1e-6) return (ganz ? String(ganz) : '') + zeichen;
  }
  return String(Math.round(x * 100) / 100).replace('.', ',');
}

/** Summe mit Einheit; grosse Gramm- und Milliliterzahlen als kg und l */
export function mengeText(wert: number, bis: number | null, einheit: string | null): string {
  let e = einheit;
  let a = runde(wert, e);
  let b = bis !== null && bis > wert ? runde(bis, e) : null;
  const teile = (n: number, neu: string) => { a /= n; b = b === null ? null : b / n; e = neu; };
  if (klein(e) === 'g' && a >= 1000) teile(1000, 'kg');
  else if (klein(e) === 'ml' && a >= 1000) teile(1000, 'l');
  else if (klein(e) === 'dl' && a >= 10) teile(10, 'l');
  const zahl = zahlText(a, e) + (b !== null && b > a ? ` bis ${zahlText(b, e)}` : '');
  return e ? `${zahl} ${e}` : zahl;
}

const ZAHL = String.raw`\d+\s+\d+\s*\/\s*\d+|\d+\s*[¼½¾]|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[¼½¾]`;
const MUSTER = new RegExp(String.raw`(${ZAHL})(?:(\s*(?:\u2013|-|bis)\s*)(${ZAHL}))?(\s*)([A-Za-zÄÖÜäöü]+)?`, 'g');

export function zahlWert(s: string): number {
  const t = s.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(\d+) ?([¼½¾])$/);
  if (m) return Number(m[1]) + (BRUCH_WERT[m[2]!] ?? 0);
  if (t in BRUCH_WERT) return BRUCH_WERT[t]!;
  m = t.match(/^(\d+) (\d+) ?\/ ?(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+) ?\/ ?(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return Number(t.replace(',', '.'));
}

/**
 * Rechnet alle Zahlen einer Zutatenzeile um: «1 Kürbis (ca. 500 g)» mal 1,5 gibt «1½ Kürbis (ca. 750 g)».
 * Bereiche bleiben Bereiche (1 bis 2 TL), gerundet wird passend zur Einheit nach der Zahl.
 */
export function skaliereText(text: string, faktor: number): string {
  if (Math.abs(faktor - 1) < 1e-9) return text;
  return text.replace(MUSTER, (_alles, a: string, trenner: string | undefined, b: string | undefined, luecke: string, wort: string | undefined) => {
    const einheit = wort && EINHEITEN.has(wort.toLowerCase()) ? wort : null;
    const neu = (s: string) => zahlText(runde(zahlWert(s) * faktor, einheit), einheit);
    return neu(a) + (b !== undefined ? `${trenner ?? ''}${neu(b)}` : '') + luecke + (wort ?? '');
  });
}
