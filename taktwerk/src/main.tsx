/**
 * Einstieg der v2-App: Darstellung setzen, Dienste starten, Oberfläche zeichnen, Service Worker registrieren.
 * Desktop-App: Hauptfenster zeigen (oder gleich das Widget), beim ersten Start die Daten der bisherigen
 * Desktop-App übernehmen, nach Updates fragen. Im Widget-Fenster nur den Mini-Player zeichnen.
 */
import { effect } from '@preact/signals';
import { render } from 'preact';
import './ui/styles/app.css';
import './ui/styles/v2.css';
import './ui/styles/skins/base.css';
import './ui/styles/skins/klassisch.css';
import './ui/styles/skins/anime.css';
import './ui/styles/skins/technik.css';
import './ui/styles/skins/barock.css';
import './ui/styles/skins/natur.css';
import './ui/styles/skins/amtlich.css';
import './ui/styles/skins/rennen.css';
import './ui/styles/skins/flug.css';
import './ui/styles/skins/meer.css';
import './ui/styles/skins/flora.css';
import './ui/styles/skins/scifi.css';
import './ui/styles/skins/elemente.css';
import './ui/styles/skins/zug.css';
import './ui/styles/skins/weihnacht.css';
import './ui/styles/skins/halloween.css';
import './ui/styles/skins/dschungel.css';
import './ui/styles/skins/baustelle.css';
import './ui/styles/skins/progress.css';
import './ui/styles/skins/celebration.css';
import './ui/styles/skins/spectacle.css';
import './ui/styles/game.css';
import { App } from './App';
import { initBackground } from './app/background';
import { elementOf } from './app/element';
import { checkUpdate, fitWidget, isDesktop, isWidget, loadDesktopInfo, openWidget, showMain, takeHandover, widgetStartWidth } from './app/desktop';
import { initKeyboard } from './app/keyboard';
import { expand } from './app/pip';
import { prefs } from './app/prefs';
import { bootstrap } from './app/services';
import { PHASE_ATTR, readTimer } from './app/timer/view';
import { hintNewDesktop } from './ui/components/DesktopUpdate';
import { WidgetView } from './ui/components/Widget';
import { initTheme } from './ui/theme';

declare const __PP_BUILD__: 'web' | 'standalone' | 'desktop';

/** Widget-Fenster der Desktop-App: nur der Mini-Player, die Fensterhöhe folgt dem Inhalt */
function Widget() {
  return <WidgetView win={window} onExpand={expand} onFit={fitWidget} startWidth={widgetStartWidth()} />;
}

/** Stile färben nach Phase und Lauf-Zustand (im Hauptfenster macht das initBackground) */
function initWidgetPhase(): void {
  effect(() => {
    const v = readTimer();
    const root = document.documentElement;
    root.dataset.phase = PHASE_ATTR[v.phase];
    root.dataset.run = v.running ? '1' : '0';
    root.dataset.active = v.active ? '1' : '0';
    if (prefs.value.skin === 'elemente') root.dataset.element = String(elementOf(v)); else delete root.dataset.element;
  });
}

/** Desktop-App, Hauptfenster: vor dem Start einmalig die Daten der bisherigen Desktop-App übernehmen */
async function desktopBeforeStart(root: HTMLElement): Promise<boolean> {
  if (!prefs.value.mini) showMain();
  const boot = root.querySelector('.boot');
  if (boot) boot.textContent = 'Taktwerk startet …';
  const timer = setTimeout(() => { if (boot) boot.textContent = 'Daten der bisherigen Desktop-App werden übernommen …'; }, 800);
  const changed = await takeHandover().catch((err) => { console.error('Übernahme fehlgeschlagen', err); return false; });
  clearTimeout(timer);
  if (changed) { location.reload(); return false; }
  return true;
}

async function main(): Promise<void> {
  initTheme();
  const root = document.getElementById('root')!;
  const widget = isWidget();
  if (widget) document.body.classList.add('widget-doc');
  else if (isDesktop() && !await desktopBeforeStart(root)) return;
  try {
    await bootstrap();
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'boot';
    p.textContent = 'Die lokale Datenbank konnte nicht geöffnet werden. Im privaten Fenster oder bei blockiertem Speicher funktioniert die App nicht.';
    root.append(p);
    return;
  }
  root.innerHTML = '';
  if (widget) {
    render(<Widget />, root);
    initKeyboard();
    initWidgetPhase();
    return;
  }
  render(<App />, root);
  initKeyboard();
  initBackground();

  if (isDesktop()) {
    if (prefs.value.mini) void openWidget().then((ok) => { if (!ok) showMain(); });
    void loadDesktopInfo();
    // kurz nach dem Start nach Updates fragen, danach alle sechs Stunden
    setTimeout(() => void checkUpdate(), 5000);
    setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000);
  }
  hintNewDesktop();

  if (__PP_BUILD__ === 'web' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !import.meta.env.DEV) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({
      immediate: true,
      // Bleibt die App lange offen, trotzdem regelmässig nach Updates schauen; der Timer übersteht das Neuladen
      onRegisteredSW: (_url, reg) => { if (reg) setInterval(() => { void reg.update(); }, 30 * 60 * 1000); },
    });
  }
}

void main();
