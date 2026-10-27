/** Datei wählen oder hineinziehen: rezepte.json oder das ZIP «rezepte-json» aus GitHub Actions */
import { useState } from 'preact/hooks';
import { DatenFehler } from '../data/pruefen';
import { importiere } from '../state';
import { toast } from '../ui/toast';

export function Import({ erneut = false }: { erneut?: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [darueber, setDarueber] = useState(false);

  async function nimm(datei: File | null | undefined) {
    if (!datei) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const b = await importiere(datei);
      toast(`${b.rezepte.length} Rezepte geladen`);
    } catch (e) {
      setFehler(e instanceof DatenFehler ? e.message : 'Die Datei liess sich nicht lesen oder nicht speichern.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div
      class={`drop${darueber ? ' is-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDarueber(true); }}
      onDragLeave={() => setDarueber(false)}
      onDrop={e => { e.preventDefault(); setDarueber(false); void nimm(e.dataTransfer?.files[0]); }}
    >
      <label class={`btn ${erneut ? '' : 'btn-primary'}`}>
        <input
          type="file"
          class="sr-only"
          accept=".json,.zip,application/json,application/zip"
          disabled={laeuft}
          onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void nimm(f); }}
        />
        {laeuft ? 'Wird geladen …' : erneut ? 'Neue Version laden' : 'Rezepte laden'}
      </label>
      <span class="muted small">rezepte.json oder das ZIP «rezepte-json», auch per Ziehen und Ablegen</span>
      {fehler && <p class="panel-note is-bad" role="alert">{fehler}</p>}
    </div>
  );
}

export function WoherDatei() {
  return (
    <>
      <ol class="schritte-klein">
        <li>Im Kochbuch-Repo auf GitHub unter «Actions» den neusten Lauf von «CI» öffnen.</li>
        <li>Unten bei «Artifacts» die Datei «rezepte-json» herunterladen. Das ist ein ZIP.</li>
        <li>Das ZIP hier laden, auspacken ist nicht nötig.</li>
      </ol>
      <p class="muted small">Oder im Kochbuch-Repo <code>python skripte/rezepte_json.py</code> ausführen und <code>daten/rezepte.json</code> laden.</p>
    </>
  );
}

/** Erster Start: noch keine Rezepte auf diesem Gerät */
export function Willkommen() {
  return (
    <div class="page willkommen">
      <section class="hero">
        <h1>Kochbuch</h1>
        <p class="lead">Rezepte nach Art, Saison und Verträglichkeit finden, Portionen umrechnen und die Zutaten auf den Einkaufszettel setzen.</p>
      </section>
      <section class="card">
        <h2>Rezepte auf dieses Gerät laden</h2>
        <p>Die Rezepte stehen nicht auf der Website. Du lädst sie einmal pro Gerät, danach bleiben sie nur in diesem Browser und die App läuft auch offline.</p>
        <Import />
      </section>
      <section class="card">
        <h2>Woher kommt die Datei?</h2>
        <WoherDatei />
      </section>
    </div>
  );
}
