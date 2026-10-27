/**
 * Format von rezepte.json. Die Datei erzeugt `skripte/rezepte_json.py` im (privaten) Kochbuch-Repo
 * aus den LaTeX-Rezepten. Alle Mengen gelten für `personen` (2), bei Gebäck für ein Backblech oder Stück.
 */
export type Jahreszeit = 'fruehling' | 'sommer' | 'herbst' | 'winter';
export type MagenStufe = 'gut' | 'anpassung' | 'meiden';

/** Zerlegte Zutat für den Einkauf, z. B. 400 g Champignons */
export interface EinkaufPosten {
  menge: number | null;
  menge_bis: number | null;
  einheit: string | null;
  name: string;
}

export interface Zutat {
  gruppe: string | null;
  /** Zeile wie im Buch */
  text: string;
  einkauf: EinkaufPosten[];
}

export interface Rezept {
  id: string;
  titel: string;
  kapitel: string;
  art: string;
  ernaehrung: string;
  saison: { text: string; jahreszeiten: Jahreszeit[]; ganzjaehrig: boolean };
  quelle: string | null;
  magen: { stufe: MagenStufe; text: string } | null;
  meal_prep: { stichwort: string; text: string } | null;
  hinweis: string | null;
  geschichte: string | null;
  geheimtipp: string | null;
  zutaten: Zutat[];
  schritte: string[];
}

export interface Kochbuch {
  titel: string;
  personen: number;
  werte: { art: string[]; ernaehrung: string[] };
  rezepte: Rezept[];
}

/** Was auf dem Gerät gespeichert ist */
export interface Bestand {
  kochbuch: Kochbuch;
  datei: string;
  /** ISO-Zeitpunkt des Imports */
  geladen: string;
}
