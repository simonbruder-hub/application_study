/** Einstieg der v2-App: Darstellung setzen, Dienste starten, Oberfläche zeichnen, Service Worker registrieren */
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
import './ui/styles/skins/progress.css';
import './ui/styles/skins/celebration.css';
import './ui/styles/skins/spectacle.css';
import './ui/styles/game.css';
import { App } from './App';
import { initBackground } from './app/background';
import { initKeyboard } from './app/keyboard';
import { bootstrap } from './app/services';
import { initTheme } from './ui/theme';

declare const __PP_BUILD__: 'web' | 'standalone';

async function main(): Promise<void> {
  initTheme();
  const root = document.getElementById('root')!;
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
  render(<App />, root);
  initKeyboard();
  initBackground();

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
