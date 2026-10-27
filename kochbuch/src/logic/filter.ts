/**
 * Filter und Suche. Innerhalb einer Gruppe gilt «oder» (Suppe oder Salat), zwischen den Gruppen «und».
 * Der Filter steht in der Adresse (#/?art=Suppe&jz=herbst), so bleibt er beim Zurückgehen erhalten.
 */
import { JAHRESZEITEN, MAGEN } from '../data/pruefen';
import type { Jahreszeit, MagenStufe, Rezept } from '../data/types';

export interface Filter {
  q: string;
  art: string[];
  ern: string[];
  jz: Jahreszeit[];
  magen: MagenStufe[];
}

export type Gruppe = 'art' | 'ern' | 'jz' | 'magen';

export const LEER: Filter = { q: '', art: [], ern: [], jz: [], magen: [] };

export const JAHRESZEIT_NAME: Record<Jahreszeit, string> = { fruehling: 'Frühling', sommer: 'Sommer', herbst: 'Herbst', winter: 'Winter' };
export const MAGEN_NAME: Record<MagenStufe, string> = { gut: 'gut verträglich', anpassung: 'mit Anpassung', meiden: 'eher meiden' };

/** Meteorologische Jahreszeit: März bis Mai Frühling, Juni bis August Sommer usw. */
export function jahreszeitAm(d: Date): Jahreszeit {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'fruehling';
  if (m >= 5 && m <= 7) return 'sommer';
  if (m >= 8 && m <= 10) return 'herbst';
  return 'winter';
}

export function saisonText(r: Rezept): string {
  if (r.saison.ganzjaehrig) return 'ganzjährig';
  return r.saison.jahreszeiten.map(j => JAHRESZEIT_NAME[j]).join(', ') || r.saison.text;
}

/** Für die Suche: klein, ohne Akzente, «ä» und «ae» gleich */
export function suchform(s: string): string {
  return s.toLowerCase()
    .replace(/ä|ae/g, 'a').replace(/ö|oe/g, 'o').replace(/ü|ue/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const index = new WeakMap<Rezept, string>();
function heuhaufen(r: Rezept): string {
  let h = index.get(r);
  if (h === undefined) {
    h = suchform([r.titel, r.kapitel, r.art, r.ernaehrung, ...r.zutaten.map(z => z.text)].join('\n'));
    index.set(r, h);
  }
  return h;
}

export function passt(r: Rezept, f: Filter): boolean {
  if (f.art.length && !f.art.includes(r.art)) return false;
  if (f.ern.length && !f.ern.includes(r.ernaehrung)) return false;
  if (f.jz.length && !f.jz.some(j => r.saison.jahreszeiten.includes(j))) return false;
  if (f.magen.length && !(r.magen && f.magen.includes(r.magen.stufe))) return false;
  const woerter = suchform(f.q).split(/\s+/).filter(Boolean);
  return !woerter.length || woerter.every(w => heuhaufen(r).includes(w));
}

export const filtere = (rezepte: Rezept[], f: Filter) => rezepte.filter(r => passt(r, f));

/** Wie viele Rezepte ein Knopf zeigen würde, wenn er (allein in seiner Gruppe) an wäre */
export function anzahlMit(rezepte: Rezept[], f: Filter, gruppe: Gruppe, wert: string): number {
  return filtere(rezepte, { ...f, [gruppe]: [wert] }).length;
}

export const anzahlAktiv = (f: Filter) => f.art.length + f.ern.length + f.jz.length + f.magen.length + (f.q.trim() ? 1 : 0);

export function umschalten<T>(liste: T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter(x => x !== wert) : [...liste, wert];
}

export function filterAus(q: URLSearchParams): Filter {
  const alle = (k: string) => q.getAll(k).filter(Boolean);
  return {
    q: q.get('q') ?? '',
    art: alle('art'),
    ern: alle('ern'),
    jz: JAHRESZEITEN.filter(j => alle('jz').includes(j)),
    magen: MAGEN.filter(m => alle('magen').includes(m)),
  };
}

export function filterQuery(f: Filter): string {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  for (const k of ['art', 'ern', 'jz', 'magen'] as const) for (const w of f[k]) q.append(k, w);
  return q.toString();
}
