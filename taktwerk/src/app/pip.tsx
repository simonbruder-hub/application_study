/**
 * Minimieren: Auf dem Desktop öffnet sich ein schwebendes Fenster (Document Picture-in-Picture,
 * Chrome/Edge), das über allen Programmen bleibt. Ohne diese Schnittstelle (Firefox, Safari,
 * Android) schaltet die App in die Mini-Ansicht.
 */
import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { MiniPlayer } from '../ui/components/Mini';
import { applyThemeTo } from '../ui/theme';
import { prefs, setPrefs } from './prefs';

interface DocumentPictureInPicture {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}
declare global {
  interface Window { documentPictureInPicture?: DocumentPictureInPicture }
}

export const pipOpen = signal(false);
let pipWin: Window | null = null;

export const pipSupported = (): boolean => typeof window !== 'undefined' && 'documentPictureInPicture' in window && window.top === window;

let keyHandler: ((e: KeyboardEvent) => void) | null = null;
/** Tastenkürzel auch im schwebenden Fenster (wird von keyboard.ts gesetzt) */
export function setPipKeyHandler(fn: (e: KeyboardEvent) => void): void {
  keyHandler = fn;
}

function copyStyles(target: Document): void {
  for (const ss of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(ss.cssRules).map((r) => r.cssText).join('\n');
      const st = target.createElement('style');
      st.textContent = css;
      target.head.append(st);
    } catch {
      if (ss.href) {
        const l = target.createElement('link');
        l.rel = 'stylesheet';
        l.href = ss.href;
        target.head.append(l);
      }
    }
  }
}

export async function openPip(): Promise<boolean> {
  const api = window.documentPictureInPicture;
  if (!api || !pipSupported()) return false;
  if (pipWin) { pipWin.focus(); return true; }
  try {
    const w = await api.requestWindow({ width: 320, height: prefs.value.skin === 'anime' ? 300 : 252 });
    const doc = w.document;
    copyStyles(doc);
    doc.title = 'Pomodoro';
    doc.body.className = 'pip';
    const sprite = document.getElementById('sprite');
    if (sprite) doc.body.append(doc.importNode(sprite, true));
    const root = doc.createElement('div');
    root.id = 'pipRoot';
    doc.body.append(root);
    const disposeTheme = effect(() => applyThemeTo(doc));
    const onKey = (e: KeyboardEvent) => keyHandler?.(e);
    doc.addEventListener('keydown', onKey);
    render(<MiniPlayer onExpand={() => { closePip(); window.focus(); }} />, root);
    pipWin = w;
    pipOpen.value = true;
    w.addEventListener('pagehide', () => {
      render(null, root);
      disposeTheme();
      pipWin = null;
      pipOpen.value = false;
    }, { once: true });
    return true;
  } catch {
    return false;
  }
}

export function closePip(): void {
  pipWin?.close();
}

/** Taste M / Knopf «Minimieren» */
export async function minimize(): Promise<void> {
  if (pipOpen.value) { closePip(); return; }
  if (!prefs.value.mini && await openPip()) return;
  setPrefs({ mini: !prefs.value.mini });
}

export function expand(): void {
  if (pipOpen.value) closePip();
  setPrefs({ mini: false });
  if (location.hash === '#mini') history.replaceState(null, '', '#fokus');
}
