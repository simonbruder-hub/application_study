/**
 * «Installieren» in der Kopfzeile: Chrome/Edge zeigen ihren eigenen Dialog, alle anderen Browser
 * bekommen eine passende Anleitung. Firefox auf dem PC kann keine Web-Apps installieren; dort gibt
 * es die Desktop-App (Tauri) für Windows und Linux zum Herunterladen.
 */
import type { ComponentChildren } from 'preact';
import { useInstallPrompt } from '../../app/install';
import { DialogFrame, openDialog } from '../dialog';
import { Icon } from '../Icon';

const RELEASES = 'https://github.com/simonbruder-hub/application_study/releases/latest';
const download = (file: string) => `${RELEASES}/download/${file}`;

type Platform = 'ios' | 'android-firefox' | 'android' | 'desktop-firefox' | 'mac-safari' | 'desktop';

function detect(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'ios';
  const firefox = /Firefox\//.test(ua);
  if (/Android/.test(ua)) return firefox ? 'android-firefox' : 'android';
  if (firefox) return 'desktop-firefox';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'mac-safari';
  return 'desktop';
}

/** Läuft die App schon installiert (eigenes Fenster statt Browser-Tab) oder ist keine Installation möglich? */
export const isInstalled = (): boolean =>
  typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches)
  || (navigator as Navigator & { standalone?: boolean }).standalone === true
  // Desktop-App (Tauri) oder Einzeldatei: dort gibt es nichts zu installieren
  || '__TAURI_INTERNALS__' in window || location.protocol === 'file:' || new URLSearchParams(location.search).has('desktop');

export function InstallButton() {
  const prompt = useInstallPrompt();
  if (isInstalled()) return null;
  const onClick = () => {
    if (prompt.available) void prompt.install();
    else openDialog(({ close }) => <InstallHelp close={close} />);
  };
  return (
    <button type="button" class="btn btn-ghost btn-sm install-btn" onClick={onClick} title="Taktwerk als App installieren">
      <Icon name="download" /><span>Installieren</span>
    </button>
  );
}

function Steps({ items }: { items: ComponentChildren[] }) {
  return <ol class="install-steps">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
}

function DesktopDownloads() {
  return (
    <div class="install-downloads">
      <a class="btn btn-primary" href={download('Taktwerk-Setup.exe')}><Icon name="download" />Windows</a>
      <a class="btn btn-ghost" href={download('Taktwerk.AppImage')}><Icon name="download" />Linux (AppImage)</a>
      <a class="btn btn-ghost" href={download('Taktwerk.deb')}><Icon name="download" />Linux (.deb)</a>
    </div>
  );
}

function InstallHelp({ close }: { close: () => void }) {
  const p = detect();
  return (
    <DialogFrame title="Taktwerk installieren" onClose={close} footer={<><span class="grow" /><button type="button" class="btn btn-primary" onClick={close}>Fertig</button></>}>
      {p === 'ios' && (
        <Steps items={[
          'In Safari unten (iPad: oben) auf das Teilen-Symbol tippen (Quadrat mit Pfeil).',
          <>Nach unten scrollen und <b>«Zum Home-Bildschirm»</b> wählen.</>,
          'Mit «Hinzufügen» bestätigen. Taktwerk startet dann wie eine App, auch offline.',
        ]} />
      )}
      {p === 'android-firefox' && (
        <Steps items={[
          <>Rechts oben das Menü <b>⋮</b> öffnen.</>,
          <><b>«Installieren»</b> bzw. <b>«Zum Startbildschirm hinzufügen»</b> wählen.</>,
          'Taktwerk erscheint als Symbol auf dem Startbildschirm.',
        ]} />
      )}
      {p === 'android' && (
        <Steps items={[
          <>In Chrome rechts oben das Menü <b>⋮</b> öffnen.</>,
          <><b>«App installieren»</b> wählen (bei manchen Geräten «Zum Startbildschirm hinzufügen»).</>,
          'In den Einstellungen von Taktwerk Benachrichtigungen erlauben, damit der Timer auch bei gesperrtem Handy meldet.',
        ]} />
      )}
      {p === 'mac-safari' && (
        <Steps items={[
          <>In der Menüleiste <b>Ablage → «Zum Dock hinzufügen…»</b> wählen.</>,
          'Taktwerk erscheint im Dock und öffnet sich im eigenen Fenster.',
        ]} />
      )}
      {p === 'desktop-firefox' && (
        <>
          <p>Firefox kann Web-Apps auf dem PC nicht selbst installieren. Dafür gibt es Taktwerk als <b>Desktop-App</b> für Windows und Linux: klein, offline, mit eigenem Fenster und Symbol.</p>
          <DesktopDownloads />
          <p class="small muted">Windows zeigt beim ersten Start eventuell «Der Computer wurde durch Windows geschützt»: auf «Weitere Informationen» und «Trotzdem ausführen» klicken. Die Desktop-App hat einen eigenen Speicher; mit Sync (Einstellungen → Sync & Konto) siehst du dort dieselben Daten.</p>
          <p class="small muted">Alternative ohne Download: die Firefox-Erweiterung «PWAsForFirefox» installiert Web-Apps im eigenen Fenster.</p>
        </>
      )}
      {p === 'desktop' && (
        <>
          <Steps items={[
            <>In Chrome oder Edge rechts in der Adressleiste auf das Symbol <b>«Installieren»</b> klicken (Bildschirm mit Pfeil).</>,
            <>Oder im Menü <b>⋮ → «Streamen, speichern und teilen» → «Seite als App installieren»</b> (Edge: <b>… → Apps → «Diese Website als App installieren»</b>).</>,
            'Ist Taktwerk schon installiert, öffnet es sich über das Startmenü bzw. das Dock.',
          ]} />
          <p class="small muted">Lieber als klassisches Programm?</p>
          <DesktopDownloads />
        </>
      )}
    </DialogFrame>
  );
}
