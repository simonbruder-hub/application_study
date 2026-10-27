/**
 * Hash-Routing: #/pfad?schluessel=wert. Filter ändern nur die Query, ohne neuen Eintrag im Verlauf.
 * Die Rezeptliste merkt sich, wie weit man gescrollt hat, und stellt es beim Zurückkommen wieder her.
 */
import { signal } from '@preact/signals';

export interface Route { path: string; query: URLSearchParams }

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path = '/', q = ''] = h.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(q) };
}

export const route = signal<Route>(parse());

let listenPosition = 0;
let vonListe = false;

/** Kam man direkt aus der Liste? Dann führt «zurück» im Verlauf zur Liste mit Filter und Scrollstand. */
export const kamVonListe = () => vonListe;

window.addEventListener('hashchange', () => {
  const alt = route.value.path;
  if (alt === '/') listenPosition = window.scrollY;
  route.value = parse();
  const neu = route.value.path;
  vonListe = alt === '/' && neu.startsWith('/rezept/');
  if (neu === alt) return;
  // erst nach dem Zeichnen der neuen Seite scrollen
  const ziel = neu === '/' ? listenPosition : 0;
  requestAnimationFrame(() => window.scrollTo({ top: ziel }));
});

export const go = (path: string) => { location.hash = path; };
export const href = (path: string) => `#${path}`;

/** Ersetzt die Query der aktuellen Seite, ohne Eintrag im Verlauf */
export function setzeQuery(query: string) {
  const path = route.value.path;
  history.replaceState(history.state, '', `#${path}${query ? `?${query}` : ''}`);
  route.value = { path, query: new URLSearchParams(query) };
}
