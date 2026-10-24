/**
 * Darstellung: Tag / Nacht / automatisch (System) und Stil klassisch / Anime / Technik. Gesetzt als
 * data-mode / data-skin auf <html>; die Farben kommen aus den Tokens in app.css.
 */
import { effect, signal } from '@preact/signals';
import { prefs, setPrefs } from '../app/prefs';

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const systemDark = signal(darkQuery?.matches ?? false);
darkQuery?.addEventListener('change', (e) => { systemDark.value = e.matches; });

/** Wirksam dunkel? (eigene Wahl oder System) */
export function isDark(): boolean {
  const m = prefs.value.mode;
  return m === 'nacht' || (m === 'auto' && systemDark.value);
}

let animeFontsLoaded = false;
function loadAnimeFonts(doc: Document): void {
  if (doc === document && animeFontsLoaded) return;
  if (doc === document) animeFontsLoaded = true;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&family=Mochiy+Pop+One&display=swap';
  doc.head.append(l);
}

/** Attribute auf ein Dokument übertragen (Hauptfenster und Bild-im-Bild-Fenster) */
export function applyThemeTo(doc: Document): void {
  const p = prefs.value;
  const root = doc.documentElement;
  if (p.mode === 'auto') delete root.dataset.mode;
  else root.dataset.mode = p.mode;
  root.dataset.skin = p.skin;
  if (p.skin === 'anime') loadAnimeFonts(doc);
}

export function initTheme(): () => void {
  return effect(() => {
    applyThemeTo(document);
    const dark = isDark();
    const skin = prefs.value.skin;
    const color = skin === 'anime' ? (dark ? '#130d26' : '#fdf1f6')
      : skin === 'technik' ? (dark ? '#040a09' : '#e9eff4')
        : dark ? '#0d1214' : '#edf1f0';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  });
}

/** Tag ↔ Nacht umschalten (Taste T) */
export function toggleDayNight(): void {
  setPrefs({ mode: isDark() ? 'tag' : 'nacht' });
}
