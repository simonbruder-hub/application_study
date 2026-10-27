/**
 * Desktop-App: Hinweis auf eine neue Version (Kopfzeile und Einstellungen) und Installation mit Neustart.
 * In der älteren Desktop-App (lädt noch die Online-Version, ohne Updater) ein einmaliger Hinweis auf
 * die neue Desktop-App zum Herunterladen.
 */
import { useState } from 'preact/hooks';
import { checkUpdate, desktopUpdate, desktopVersion, installUpdate, isDesktop, isOldDesktop } from '../../app/desktop';
import { DialogFrame, openDialog } from '../dialog';
import { Icon } from '../Icon';
import { toast } from '../toast';

const SETUP_URL = 'https://github.com/simonbruder-hub/apps/releases/latest/download/Taktwerk-Setup.exe';

function UpdateDialog({ close }: { close: () => void }) {
  const u = desktopUpdate.value;
  const [busy, setBusy] = useState(false);
  const install = async () => {
    setBusy(true);
    const ok = await installUpdate();
    // bei Erfolg startet die App neu und kommt nicht hierher zurück
    if (!ok) { setBusy(false); toast('Update fehlgeschlagen. Später nochmals versuchen.'); }
  };
  return (
    <DialogFrame
      title={u ? `Taktwerk ${u.version}` : 'Update'} onClose={close}
      footer={<><span class="grow" /><button type="button" class="btn btn-ghost" onClick={close}>Später</button>
        <button type="button" class="btn btn-primary" data-autofocus disabled={busy || !u} onClick={() => void install()}>
          <Icon name="download" />{busy ? 'Wird installiert …' : 'Jetzt installieren'}
        </button></>}
    >
      <p>Eine neue Version der Desktop-App ist bereit. Die App lädt sie herunter, prüft die Signatur, installiert sie und startet neu. Der Timer läuft dabei einfach weiter.</p>
      {u?.notes && <p class="small muted">{u.notes}</p>}
    </DialogFrame>
  );
}

export function openUpdateDialog(): void {
  openDialog(({ close }) => <UpdateDialog close={close} />);
}

/** Kopfzeile: erscheint nur, wenn ein Update bereitsteht */
export function UpdateButton() {
  const u = desktopUpdate.value;
  if (!u) return null;
  return (
    <button type="button" class="btn btn-primary btn-sm" onClick={openUpdateDialog} title={`Taktwerk ${u.version} installieren`}>
      <Icon name="download" /><span>Update</span>
    </button>
  );
}

/** Einstellungen → App: Version und Suche nach Updates */
export function DesktopInfo() {
  const [busy, setBusy] = useState(false);
  if (!isDesktop()) return null;
  const u = desktopUpdate.value;
  const search = async () => {
    setBusy(true);
    const ok = await checkUpdate();
    setBusy(false);
    if (!ok) toast('Keine Verbindung zum Update-Server.');
    else if (!desktopUpdate.value) toast('Taktwerk ist aktuell.');
    else openUpdateDialog();
  };
  return (
    <div class="row-gap">
      <p class="small grow">Desktop-App {desktopVersion.value ?? ''}{u ? ` · Version ${u.version} verfügbar` : ''}</p>
      {u
        ? <button type="button" class="btn btn-primary btn-sm" onClick={openUpdateDialog}><Icon name="download" />Update installieren</button>
        : <button type="button" class="btn btn-ghost btn-sm" disabled={busy} onClick={() => void search()}>{busy ? 'Suche …' : 'Nach Updates suchen'}</button>}
    </div>
  );
}

const OLD_HINT_KEY = 'taktwerk.desktop11.hint';

/** Ältere Desktop-App: einmal auf die neue Version hinweisen (eigenes Widget, offline, Updates) */
export function hintNewDesktop(): void {
  if (!isOldDesktop()) return;
  try {
    if (localStorage.getItem(OLD_HINT_KEY)) return;
    localStorage.setItem(OLD_HINT_KEY, '1');
  } catch { return; }
  toast('Neue Desktop-App: eigenes Widget, läuft offline und aktualisiert sich selbst. Einmal neu installieren, die Daten kommen mit.', {
    timeout: 20000,
    action: { label: 'Herunterladen', fn: () => { location.href = SETUP_URL; } },
  });
}
