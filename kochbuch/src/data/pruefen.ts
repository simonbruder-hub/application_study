/**
 * Prüft eine eingelesene rezepte.json und bringt sie in eine feste Form.
 * Pflicht sind nur id, Titel und Zutaten; fehlende Zusatzfelder werden zu null.
 */
import type { EinkaufPosten, Jahreszeit, Kochbuch, MagenStufe, Rezept, Zutat } from './types';

export const JAHRESZEITEN: Jahreszeit[] = ['fruehling', 'sommer', 'herbst', 'winter'];
export const MAGEN: MagenStufe[] = ['gut', 'anpassung', 'meiden'];
const ARTEN = ['Frühstück', 'Salat', 'Suppe', 'Hauptgericht', 'Beilage', 'Dessert', 'Gebäck', 'Getränk', 'Snack'];
const ERNAEHRUNG = ['vegetarisch', 'Fisch', 'Fleisch'];

/** Fehler mit einer Meldung, die man direkt anzeigen kann */
export class DatenFehler extends Error {}

type Obj = Record<string, unknown>;
const istObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const textOder = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const zahlOder = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function pflicht(v: unknown, was: string): string {
  const t = textOder(v);
  if (!t) throw new DatenFehler(`${was} fehlt.`);
  return t;
}

function textListe(v: unknown, fallback: string[]): string[] {
  const l = Array.isArray(v) ? v.map(textOder).filter((x): x is string => !!x) : [];
  return l.length ? l : fallback;
}

function pruefeZutat(z: unknown, wo: string): Zutat {
  if (typeof z === 'string' && z.trim()) return { gruppe: null, text: z.trim(), einkauf: [] };
  if (!istObj(z)) throw new DatenFehler(`${wo} ist ungültig.`);
  const einkauf: EinkaufPosten[] = [];
  for (const e of Array.isArray(z.einkauf) ? z.einkauf : []) {
    const name = istObj(e) ? textOder(e.name) : null;
    if (!istObj(e) || !name) continue;
    einkauf.push({ menge: zahlOder(e.menge), menge_bis: zahlOder(e.menge_bis), einheit: textOder(e.einheit), name });
  }
  return { gruppe: textOder(z.gruppe), text: pflicht(z.text, `${wo}: Text`), einkauf };
}

function pruefeRezept(r: unknown, nr: number): Rezept {
  if (!istObj(r)) throw new DatenFehler(`Rezept ${nr} ist ungültig.`);
  const id = pflicht(r.id, `Rezept ${nr}: id`);
  const wo = `Rezept «${id}»`;
  if (!Array.isArray(r.zutaten)) throw new DatenFehler(`${wo}: Zutaten fehlen.`);

  const saison = istObj(r.saison) ? r.saison : {};
  const jahreszeiten = Array.isArray(saison.jahreszeiten)
    ? JAHRESZEITEN.filter(j => (saison.jahreszeiten as unknown[]).includes(j))
    : [];
  const magen = istObj(r.magen) && MAGEN.includes(r.magen.stufe as MagenStufe)
    ? { stufe: r.magen.stufe as MagenStufe, text: textOder(r.magen.text) ?? '' }
    : null;
  const prep = istObj(r.meal_prep) ? textOder(r.meal_prep.stichwort) : null;

  return {
    id,
    titel: pflicht(r.titel, `${wo}: Titel`),
    kapitel: textOder(r.kapitel) ?? '',
    art: textOder(r.art) ?? '',
    ernaehrung: textOder(r.ernaehrung) ?? '',
    saison: {
      text: textOder(saison.text) ?? '',
      jahreszeiten,
      ganzjaehrig: saison.ganzjaehrig === true || jahreszeiten.length === 4,
    },
    quelle: textOder(r.quelle),
    magen,
    meal_prep: prep && istObj(r.meal_prep) ? { stichwort: prep, text: textOder(r.meal_prep.text) ?? '' } : null,
    hinweis: textOder(r.hinweis),
    geschichte: textOder(r.geschichte),
    geheimtipp: textOder(r.geheimtipp),
    zutaten: r.zutaten.map((z, i) => pruefeZutat(z, `${wo}, Zutat ${i + 1}`)),
    schritte: Array.isArray(r.schritte) ? r.schritte.map(textOder).filter((s): s is string => !!s) : [],
  };
}

export function pruefeKochbuch(roh: unknown): Kochbuch {
  if (!istObj(roh) || !Array.isArray(roh.rezepte)) {
    throw new DatenFehler('Das ist keine Rezeptdatei: Die Liste «rezepte» fehlt.');
  }
  if (!roh.rezepte.length) throw new DatenFehler('Die Datei enthält keine Rezepte.');
  const rezepte = roh.rezepte.map((r, i) => pruefeRezept(r, i + 1));
  const ids = new Set<string>();
  for (const r of rezepte) {
    if (ids.has(r.id)) throw new DatenFehler(`Die id «${r.id}» kommt mehrfach vor.`);
    ids.add(r.id);
  }
  const werte = istObj(roh.werte) ? roh.werte : {};
  const personen = zahlOder(roh.personen);
  return {
    titel: textOder(roh.titel) ?? 'Kochbuch',
    personen: personen && personen > 0 ? personen : 2,
    werte: { art: textListe(werte.art, ARTEN), ernaehrung: textListe(werte.ernaehrung, ERNAEHRUNG) },
    rezepte,
  };
}
