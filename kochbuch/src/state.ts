/** Zustand der App: geladene Rezepte (IndexedDB) und Einkaufszettel (localStorage) */
import { computed, effect, signal } from '@preact/signals';
import { ladeDatei } from './data/laden';
import { dauerhaft, lies, loesche, schreibe } from './data/speicher';
import type { Bestand, Kochbuch } from './data/types';
import { LEERER_ZETTEL, type Zettel } from './logic/einkauf';

export const bereit = signal(false);
export const bestand = signal<Bestand | null>(null);
export const buch = computed<Kochbuch | null>(() => bestand.value?.kochbuch ?? null);
export const speicherFehlt = signal(false);

export async function starte() {
  try {
    bestand.value = (await lies<Bestand>('bestand')) ?? null;
  } catch {
    speicherFehlt.value = true;
  } finally {
    bereit.value = true;
  }
}

export async function importiere(datei: File): Promise<Kochbuch> {
  const kochbuch = await ladeDatei(datei);
  const neu: Bestand = { kochbuch, datei: datei.name, geladen: new Date().toISOString() };
  await schreibe('bestand', neu);
  bestand.value = neu;
  // Rezepte, die es nicht mehr gibt, vom Zettel nehmen
  const ids = new Set(kochbuch.rezepte.map(r => r.id));
  zettel.value = { ...zettel.value, rezepte: zettel.value.rezepte.filter(e => ids.has(e.id)) };
  dauerhaft();
  return kochbuch;
}

export async function entferne() {
  await loesche('bestand');
  bestand.value = null;
  zettel.value = LEERER_ZETTEL;
}

const ZETTEL_KEY = 'kochbuch.zettel.v1';

function liesZettel(): Zettel {
  try {
    const z = JSON.parse(localStorage.getItem(ZETTEL_KEY) ?? 'null') as Partial<Zettel> | null;
    if (z && Array.isArray(z.rezepte)) {
      return {
        rezepte: z.rezepte.filter(e => typeof e?.id === 'string' && typeof e.faktor === 'number' && e.faktor > 0),
        wahl: z.wahl && typeof z.wahl === 'object' ? z.wahl : {},
      };
    }
  } catch { /* leer anfangen */ }
  return LEERER_ZETTEL;
}

export const zettel = signal<Zettel>(liesZettel());
effect(() => {
  try { localStorage.setItem(ZETTEL_KEY, JSON.stringify(zettel.value)); } catch { /* ohne Speicher */ }
});
