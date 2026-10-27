/**
 * Einkaufszettel: Rezepte mit Portionen, zusammengezählte Zutaten zum An- und Abwählen,
 * Senden an Kasse unterwegs und Teilen als Text.
 */
import { useState } from 'preact/hooks';
import type { Kochbuch } from '../data/types';
import { LEERER_ZETTEL, posten, postenText, vomZettel, waehle, zettelText, aufZettel } from '../logic/einkauf';
import { anKasseSenden, type KasseErgebnis, KasseFehlt, kasseListeUrl } from '../logic/kasse';
import { href } from '../router';
import { buch, zettel } from '../state';
import { Portionen } from '../ui/bits';
import { toast } from '../ui/toast';
import { Willkommen } from './Import';

type Senden = null | 'frage' | 'laeuft' | { ok: KasseErgebnis } | { fehler: string };

async function teilen(text: string) {
  try {
    if (navigator.share) { await navigator.share({ title: 'Einkaufszettel', text }); return; }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Einkaufszettel kopiert');
  } catch {
    toast('Kopieren ging nicht. Bitte von Hand abschreiben.');
  }
}

function Zettel({ b }: { b: Kochbuch }) {
  const [senden, setSenden] = useState<Senden>(null);
  const z = zettel.value;
  const liste = posten(b, z);
  const zuKaufen = liste.filter(p => p.kaufen);
  const mitMenge = liste.filter(p => p.mengen.length);
  const ohneMenge = liste.filter(p => !p.mengen.length);

  async function jetztSenden() {
    setSenden('laeuft');
    try {
      const ergebnis = await anKasseSenden(zuKaufen.map(p => ({ name: p.name, text: postenText(p) })));
      setSenden({ ok: ergebnis });
    } catch (e) {
      setSenden({
        fehler: e instanceof KasseFehlt
          ? 'Kasse unterwegs ist in diesem Browser noch nicht eingerichtet. Öffne sie einmal hier (gleiches Gerät, gleicher Browser) und sende dann nochmals.'
          : `Senden hat nicht geklappt${e instanceof Error && e.message ? ` (${e.message})` : ''}.`,
      });
    }
  }

  const leeren = () => { if (confirm('Einkaufszettel leeren?')) { zettel.value = LEERER_ZETTEL; setSenden(null); } };

  if (!z.rezepte.length) {
    return (
      <div class="page einkauf">
        <h1>Einkaufszettel</h1>
        <p class="panel-note">Noch nichts auf dem Zettel. Öffne ein Rezept und tippe auf «Auf den Einkaufszettel».</p>
        <p><a class="btn" href={href('/')}>Zu den Rezepten</a></p>
      </div>
    );
  }

  const zeile = (p: (typeof liste)[number]) => (
    <li key={p.schluessel} class={`posten${p.kaufen ? '' : ' is-aus'}`}>
      <label>
        <input type="checkbox" checked={p.kaufen} onChange={e => { zettel.value = waehle(zettel.value, p, e.currentTarget.checked); }} />
        <span class="posten-name">{p.name}</span>
        <span class="posten-menge">{[...p.mengen, ...(p.ohneMenge && p.mengen.length ? ['etwas'] : [])].join(' + ')}</span>
      </label>
      <span class="posten-aus">{p.rezepte.join(', ')}</span>
    </li>
  );

  return (
    <div class="page einkauf">
      <h1>Einkaufszettel</h1>

      <section class="card">
        <h2>Rezepte</h2>
        <ul class="zettel-rezepte">
          {z.rezepte.map(e => {
            const r = b.rezepte.find(x => x.id === e.id);
            if (!r) return null;
            return (
              <li key={e.id}>
                <a href={href(`/rezept/${encodeURIComponent(r.id)}`)}>{r.titel}</a>
                <Portionen r={r} faktor={e.faktor} personen={b.personen} onChange={f => { zettel.value = aufZettel(zettel.value, r.id, f); }} />
                <button type="button" class="btn-x" aria-label={`${r.titel} vom Zettel nehmen`} onClick={() => { zettel.value = vomZettel(zettel.value, r.id); }}>×</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="card">
        <h2>Zutaten</h2>
        <p class="muted small">{zuKaufen.length} von {liste.length} zum Kaufen. Grundvorrat wie Salz, Öl und Gewürze ist abgewählt; Haken weg bei allem, was du sonst noch hast.</p>
        <ul class="postenliste">{mitMenge.map(zeile)}</ul>
        {ohneMenge.length > 0 && (
          <>
            <h3 class="gruppe">Ohne Mengenangabe</h3>
            <ul class="postenliste">{ohneMenge.map(zeile)}</ul>
          </>
        )}
      </section>

      <section class="card senden">
        <h2>Weitergeben</h2>
        <div class="aktionen">
          <button type="button" class="btn btn-primary" disabled={!zuKaufen.length || senden === 'laeuft'} onClick={() => setSenden('frage')}>
            An Kasse unterwegs senden
          </button>
          <button type="button" class="btn" disabled={!zuKaufen.length} onClick={() => void teilen(zettelText(b, z, liste))}>Teilen</button>
          <button type="button" class="btn btn-danger" onClick={leeren}>Zettel leeren</button>
        </div>
        <p class="muted small">Schreibt die angehakten Zutaten direkt in die Einkaufsliste von Kasse unterwegs auf diesem Gerät.</p>

        {senden === 'frage' && (
          <div class="panel-note frage" role="alertdialog" aria-label="Senden bestätigen">
            <p><b>Ist Kasse unterwegs geschlossen?</b> Läuft sie noch im Hintergrund, überschreibt sie die neuen Einträge. Auf dem Handy die App aus den zuletzt benutzten Apps wegwischen.</p>
            <div class="aktionen">
              <button type="button" class="btn btn-primary" onClick={() => void jetztSenden()}>Ja, {zuKaufen.length} Zutaten senden</button>
              <button type="button" class="btn" onClick={() => setSenden(null)}>Abbrechen</button>
            </div>
          </div>
        )}
        {senden === 'laeuft' && <p class="panel-note">Wird gesendet …</p>}
        {senden && typeof senden === 'object' && 'ok' in senden && (
          <div class="panel-note is-good" role="status">
            <p>
              {senden.ok.neu === 1 ? '1 Zutat' : `${senden.ok.neu} Zutaten`} an Kasse unterwegs gesendet.
              {senden.ok.schon.length > 0 && ` Schon auf der Liste: ${senden.ok.schon.join(', ')}.`}
            </p>
            <div class="aktionen">
              <a class="btn btn-primary" href={kasseListeUrl()}>Kasse unterwegs öffnen</a>
              <button type="button" class="btn" onClick={leeren}>Zettel leeren</button>
            </div>
          </div>
        )}
        {senden && typeof senden === 'object' && 'fehler' in senden && <p class="panel-note is-bad" role="alert">{senden.fehler}</p>}
      </section>
    </div>
  );
}

export function Einkauf() {
  const b = buch.value;
  return b ? <Zettel b={b} /> : <Willkommen />;
}
