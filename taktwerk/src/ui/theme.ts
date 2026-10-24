/**
 * Darstellung: Tag / Nacht / automatisch (System) und Stil (siehe skins.ts). Gesetzt als
 * data-mode / data-skin auf <html>; die Farben kommen aus den Tokens in app.css.
 */
import { effect, signal } from '@preact/signals';
import { prefs, setPrefs } from '../app/prefs';
import { skinInfo, type Skin } from './skins';

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const systemDark = signal(darkQuery?.matches ?? false);
darkQuery?.addEventListener('change', (e) => { systemDark.value = e.matches; });

/** Wirksam dunkel? (eigene Wahl oder System) */
export function isDark(): boolean {
  const m = prefs.value.mode;
  return m === 'nacht' || (m === 'auto' && systemDark.value);
}

const fontsLoaded = new WeakMap<Document, Set<string>>();
function loadSkinFonts(doc: Document, skin: Skin): void {
  const fonts = skinInfo(skin).fonts;
  if (!fonts) return;
  const done = fontsLoaded.get(doc) ?? new Set<string>();
  fontsLoaded.set(doc, done);
  if (done.has(skin)) return;
  done.add(skin);
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${fonts}&display=swap`;
  doc.head.append(l);
}

/** Attribute auf ein Dokument übertragen (Hauptfenster und Bild-im-Bild-Fenster) */
export function applyThemeTo(doc: Document): void {
  const p = prefs.value;
  const root = doc.documentElement;
  if (p.mode === 'auto') delete root.dataset.mode;
  else root.dataset.mode = p.mode;
  root.dataset.skin = p.skin;
  root.dataset.motion = p.motion;
  loadSkinFonts(doc, p.skin);
}

export function initTheme(): () => void {
  return effect(() => {
    applyThemeTo(document);
    const [day, night] = skinInfo(prefs.value.skin).bar;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? night : day);
  });
}

/** Tag ↔ Nacht umschalten (Taste T) */
export function toggleDayNight(): void {
  setPrefs({ mode: isDark() ? 'tag' : 'nacht' });
}
