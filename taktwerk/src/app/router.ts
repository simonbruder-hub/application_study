/** Ansichten und Hash-Navigation (#fokus, #aufgaben …; #mini öffnet die Mini-Ansicht) */
import { signal } from '@preact/signals';
import type { IconName } from '../ui/Icon';
import { setPrefs } from './prefs';

export type ViewName = 'fokus' | 'aufgaben' | 'projekte' | 'auswertung' | 'einstellungen';

export const VIEWS: readonly { id: ViewName; label: string; icon: IconName; tab: boolean }[] = [
  { id: 'fokus', label: 'Fokus', icon: 'timer', tab: true },
  { id: 'aufgaben', label: 'Aufgaben', icon: 'list', tab: true },
  { id: 'projekte', label: 'Projekte', icon: 'folder', tab: true },
  { id: 'auswertung', label: 'Auswertung', icon: 'chart', tab: true },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'sliders', tab: true },
];

const isView = (h: string): h is ViewName => VIEWS.some((v) => v.id === h);

function fromHash(): ViewName | null {
  const h = typeof location === 'undefined' ? '' : location.hash.slice(1);
  if (h === 'mini') { setPrefs({ mini: true }); return null; }
  return isView(h) ? h : null;
}

export const view = signal<ViewName>(fromHash() ?? 'fokus');

/** Zusatzangabe für eine Ansicht, z. B. Projektfilter in «Aufgaben» */
export const viewParam = signal<string | null>(null);

export function go(v: ViewName, param: string | null = null): void {
  viewParam.value = param;
  view.value = v;
  if (location.hash.slice(1) !== v) history.replaceState(null, '', `#${v}`);
  document.getElementById('main')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const v = fromHash();
    if (v && v !== view.value) view.value = v;
  });
}
