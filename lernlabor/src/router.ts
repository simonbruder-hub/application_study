/** Einfaches Hash-Routing: #/pfad?schluessel=wert */
import { signal } from '@preact/signals';

export interface Route { path: string; query: URLSearchParams }

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path = '/', q = ''] = h.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(q) };
}

export const route = signal<Route>(parse());

window.addEventListener('hashchange', () => {
  route.value = parse();
  window.scrollTo({ top: 0 });
});

export const go = (path: string) => { location.hash = path; };
export const href = (path: string) => `#${path}`;
