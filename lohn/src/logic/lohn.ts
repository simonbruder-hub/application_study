/**
 * Lohn umrechnen wie in der Excel-Vorlage «Berechnung ML auf Std.»
 *
 * Monatslohn → Stundenlohn: Jahreslohn (12 oder 13 Monatslöhne) geteilt durch die Jahresstunden
 * (Wochenstunden × Pensum × 52 Wochen), dazu Ferien- und Feiertagszuschlag auf diesen Stundenlohn.
 * Zuschlag = Tage / (260 - Tage), auf 0.01 % gerundet wie in Verträgen (25 Tage → 10.64 %).
 * Stundenlohn → Monatslohn rechnet denselben Weg rückwärts.
 *
 * Die Beträge sind ungerundet, wie in der Excel-Tabelle. Gerundet wird erst für die Anzeige.
 */
import { rappen } from './zahlen';

export const WOCHEN = 52;
/** Arbeitstage im Jahr: 52 Wochen zu 5 Tagen */
export const ARBEITSTAGE = 260;

export type Richtung = 'monat' | 'stunde';

export interface Eingaben {
  /** Was bekannt ist: der Monatslohn oder der Stundenlohn */
  richtung: Richtung;
  /** Brutto pro Monat, gilt bei Richtung «monat» */
  monatslohn: number;
  /** Brutto pro Stunde mit allen Zuschlägen, gilt bei Richtung «stunde» */
  stundenlohn: number;
  dreizehnter: boolean;
  /** Prozent */
  pensum: number;
  /** Wochenstunden bei 100 % */
  wochenstunden: number;
  ferientage: number;
  feiertage: number;
}

/** Beträge pro Stunde in Franken */
export interface Stunde {
  /** Stundenlohn ohne 13. Monatslohn */
  grund: number;
  /** Anteil 13. Monatslohn, ohne 13. gleich 0 */
  dreizehnter: number;
  /** Stundenlohn mit 13. Monatslohn, ohne Zuschläge */
  zwischen: number;
  ferien: number;
  feiertage: number;
  brutto: number;
}

export interface Ergebnis {
  /** Brutto pro Monat, eingegeben oder berechnet */
  monatslohn: number;
  /** 12 oder 13 */
  monatsloehne: number;
  jahreslohn: number;
  jahresstunden: number;
  satz: { dreizehnter: number; ferien: number; feiertage: number };
  stunde: Stunde;
}

/** Zuschlag für bezahlte freie Tage: Tage / (260 - Tage), auf 0.01 % gerundet */
export function zuschlag(tage: number): number {
  return Math.round((tage / (ARBEITSTAGE - tage)) * 10_000) / 10_000;
}

export function rechne(e: Eingaben): Ergebnis {
  const monatsloehne = e.dreizehnter ? 13 : 12;
  const jahresstunden = e.wochenstunden * (e.pensum / 100) * WOCHEN;
  const satz = { dreizehnter: e.dreizehnter ? 1 / 12 : 0, ferien: zuschlag(e.ferientage), feiertage: zuschlag(e.feiertage) };
  const faktor = 1 + satz.ferien + satz.feiertage;
  const zwischen = e.richtung === 'monat'
    ? (e.monatslohn * monatsloehne) / jahresstunden
    : rappen(e.stundenlohn) / faktor;
  const grund = (zwischen * 12) / monatsloehne;
  const monatslohn = e.richtung === 'monat' ? e.monatslohn : (zwischen * jahresstunden) / monatsloehne;
  return {
    monatslohn,
    monatsloehne,
    jahreslohn: monatslohn * monatsloehne,
    jahresstunden,
    satz,
    stunde: {
      grund,
      dreizehnter: zwischen - grund,
      zwischen,
      ferien: zwischen * satz.ferien,
      feiertage: zwischen * satz.feiertage,
      brutto: zwischen * faktor,
    },
  };
}

/** Bruttolohn für gearbeitete Stunden und woraus er besteht, in Franken auf Rappen */
export interface Verdienst {
  /** Stundenlohn auf Rappen, wie angezeigt */
  satz: number;
  brutto: number;
  grund: number;
  dreizehnter: number;
  ferien: number;
  feiertage: number;
}

/**
 * Verdienst für gearbeitete Stunden: Stunden mal Brutto-Stundenlohn, wie er angezeigt wird.
 * Die Anteile sind auf Rappen gerundet, der Grundlohn ist der Rest, damit alles aufgeht.
 */
export function verdienst(r: Ergebnis, stunden: number): Verdienst {
  const { satz } = r;
  const faktor = 1 + satz.ferien + satz.feiertage;
  const stundensatz = rappen(r.stunde.brutto);
  const brutto = rappen(stunden * stundensatz);
  const ferien = rappen((brutto * satz.ferien) / faktor);
  const feiertage = rappen((brutto * satz.feiertage) / faktor);
  const zwischen = brutto - ferien - feiertage;
  const dreizehnter = rappen((zwischen * satz.dreizehnter) / (1 + satz.dreizehnter));
  return { satz: stundensatz, brutto, grund: rappen(zwischen - dreizehnter), dreizehnter, ferien, feiertage };
}
