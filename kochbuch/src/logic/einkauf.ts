/**
 * Einkaufszettel: Rezepte mit Portionen sammeln und die Zutaten zusammenzählen.
 * Gleiche Zutaten (gleicher Name) werden addiert, Gramm mit Kilo und Milliliter mit dl und l.
 * Grundvorrat wie Salz, Öl, Mehl und getrocknete Gewürze ist zuerst abgewählt, alles andere zum Kaufen angehakt.
 */
import type { Kochbuch, Rezept } from '../data/types';
import { mengeText, zahlText } from './mengen';

export interface ZettelEintrag {
  id: string;
  /** Vielfaches der Mengen im Buch (2 Personen: 1, 3 Personen: 1,5) */
  faktor: number;
}

export interface Zettel {
  rezepte: ZettelEintrag[];
  /** Von Hand gesetzt: kaufen ja oder nein, sonst gilt der Vorschlag */
  wahl: Record<string, boolean>;
}

export const LEERER_ZETTEL: Zettel = { rezepte: [], wahl: {} };

export interface Posten {
  schluessel: string;
  name: string;
  /** z. B. ["400 g", "1 EL"] */
  mengen: string[];
  /** kommt mindestens einmal ohne Menge vor */
  ohneMenge: boolean;
  /** Titel der Rezepte, die die Zutat brauchen */
  rezepte: string[];
  kaufen: boolean;
}

/** Einheiten, die sich zusammenzählen lassen, mit Umrechnung in die Grundeinheit */
const GRUNDEINHEIT: Record<string, [string, number]> = {
  g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000],
};

export const schluessel = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Typischer Grundvorrat: ein ganzes Wort im Namen genügt («Chili- oder Paprikapulver», aber nicht «Puderzucker») */
const VORRAT = new Set([
  'salz', 'meersalz', 'pfeffer', 'zucker', 'rohrzucker', 'mehl', 'öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl', 'bratöl',
  'essig', 'apfelessig', 'weissweinessig', 'balsamico', 'bouillon', 'gemüsebouillon', 'hühnerbouillon', 'wasser',
  'paprikapulver', 'kreuzkümmel', 'zimt', 'muskat', 'muskatnuss', 'curry', 'currypulver', 'kurkuma', 'oregano',
  'chili', 'chiliflocken', 'cayennepfeffer', 'kartoffelgewürz', 'backpulver', 'natron', 'vanillezucker',
]);

export const istVorrat = (name: string) => schluessel(name).split(/[\s,\-\u2013]+/).some(w => VORRAT.has(w));

/** Gebäck rechnet in Blechen oder Stück, alles andere in Personen */
export const proStueck = (r: Rezept) => r.art === 'Gebäck';

export function portionText(r: Rezept, faktor: number, personen: number): string {
  if (proStueck(r)) return `× ${zahlText(faktor)}`;
  const n = Math.round(faktor * personen);
  return `${n} ${n === 1 ? 'Person' : 'Personen'}`;
}

/** Erlaubte Schritte: eine Person mehr oder weniger (bis 12), bei Gebäck halbe Mengen bis ×4 */
export function portionSchritte(r: Rezept, personen: number) {
  return proStueck(r)
    ? { min: 0.5, max: 4, schritt: 0.5 }
    : { min: 1 / personen, max: 12 / personen, schritt: 1 / personen };
}

export function aufZettel(z: Zettel, id: string, faktor: number): Zettel {
  const da = z.rezepte.some(e => e.id === id);
  return { ...z, rezepte: da ? z.rezepte.map(e => (e.id === id ? { id, faktor } : e)) : [...z.rezepte, { id, faktor }] };
}

export const vomZettel = (z: Zettel, id: string): Zettel => ({ ...z, rezepte: z.rezepte.filter(e => e.id !== id) });

/** Setzt kaufen ja/nein; entspricht die Wahl dem Vorschlag, wird sie wieder vergessen */
export function waehle(z: Zettel, p: Posten, kaufen: boolean): Zettel {
  const wahl = { ...z.wahl };
  if (kaufen === !istVorrat(p.name)) delete wahl[p.schluessel];
  else wahl[p.schluessel] = kaufen;
  return { ...z, wahl };
}

interface Summe { wert: number; bis: number; mitBis: boolean; einheit: string | null; inDl: boolean }

export function posten(buch: Kochbuch, zettel: Zettel): Posten[] {
  const sammlung = new Map<string, { name: string; summen: Map<string, Summe>; ohneMenge: boolean; rezepte: string[] }>();
  for (const { id, faktor } of zettel.rezepte) {
    const r = buch.rezepte.find(x => x.id === id);
    if (!r) continue;
    for (const zutat of r.zutaten) {
      for (const e of zutat.einkauf) {
        const k = schluessel(e.name);
        let p = sammlung.get(k);
        if (!p) sammlung.set(k, (p = { name: e.name, summen: new Map(), ohneMenge: false, rezepte: [] }));
        if (!p.rezepte.includes(r.titel)) p.rezepte.push(r.titel);
        if (e.menge === null) { p.ohneMenge = true; continue; }
        const einheit = e.einheit ?? '';
        const [grund, mal] = GRUNDEINHEIT[einheit.toLowerCase()] ?? [einheit, 1];
        const art = grund.toLowerCase();
        const s = p.summen.get(art) ?? { wert: 0, bis: 0, mitBis: false, einheit: grund || null, inDl: false };
        s.wert += e.menge * mal * faktor;
        s.bis += (e.menge_bis ?? e.menge) * mal * faktor;
        s.mitBis ||= e.menge_bis !== null;
        s.inDl ||= einheit.toLowerCase() === 'dl';
        p.summen.set(art, s);
      }
    }
  }

  const liste: Posten[] = [];
  for (const [k, p] of sammlung) {
    const mengen = [...p.summen.values()].map(s => {
      // Milliliter aus Rezepten mit dl auch wieder in dl zeigen (3 dl statt 300 ml)
      const dl = s.einheit === 'ml' && s.inDl && s.wert < 1000;
      const teiler = dl ? 100 : 1;
      return mengeText(s.wert / teiler, s.mitBis ? s.bis / teiler : null, dl ? 'dl' : s.einheit);
    });
    liste.push({ schluessel: k, name: p.name, mengen, ohneMenge: p.ohneMenge, rezepte: p.rezepte, kaufen: zettel.wahl[k] ?? !istVorrat(p.name) });
  }
  const abc = (a: Posten, b: Posten) => a.name.localeCompare(b.name, 'de');
  return [...liste.filter(p => p.mengen.length).sort(abc), ...liste.filter(p => !p.mengen.length).sort(abc)];
}

/** «Champignons (400 g)», «Salz (1 TL + etwas)» oder nur «Salz» */
export function postenText(p: Posten): string {
  const teile = [...p.mengen, ...(p.ohneMenge && p.mengen.length ? ['etwas'] : [])];
  return teile.length ? `${p.name} (${teile.join(' + ')})` : p.name;
}

export function zettelText(buch: Kochbuch, zettel: Zettel, liste: Posten[]): string {
  const fuer = zettel.rezepte.flatMap(e => {
    const r = buch.rezepte.find(x => x.id === e.id);
    return r ? [`${r.titel} (${portionText(r, e.faktor, buch.personen)})`] : [];
  });
  return ['Einkaufszettel', `Für: ${fuer.join(', ')}`, '', ...liste.filter(p => p.kaufen).map(p => `- ${postenText(p)}`)].join('\n');
}
