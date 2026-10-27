/** Ein Rezept: Zutaten für die gewählte Anzahl Personen, Zubereitung, Magen-Ampel und Einkaufszettel */
import { useState } from 'preact/hooks';
import type { Kochbuch, Rezept, Zutat } from '../data/types';
import { aufZettel, portionText, vomZettel } from '../logic/einkauf';
import { MAGEN_NAME, saisonText } from '../logic/filter';
import { skaliereText } from '../logic/mengen';
import { href, kamVonListe } from '../router';
import { buch, zettel } from '../state';
import { Ampel, Portionen } from '../ui/bits';
import { toast } from '../ui/toast';
import { Willkommen } from './Import';

function gruppiert(zutaten: Zutat[]) {
  const gruppen: { titel: string | null; zeilen: Zutat[] }[] = [];
  for (const z of zutaten) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.titel === z.gruppe) letzte.zeilen.push(z);
    else gruppen.push({ titel: z.gruppe, zeilen: [z] });
  }
  return gruppen;
}

function Ansicht({ b, r }: { b: Kochbuch; r: Rezept }) {
  const eintrag = zettel.value.rezepte.find(e => e.id === r.id);
  const [eigen, setEigen] = useState(1);
  const faktor = eintrag?.faktor ?? eigen;
  // Steht das Rezept auf dem Zettel, ändert der Wähler die Menge dort
  const setFaktor = (f: number) => { if (eintrag) zettel.value = aufZettel(zettel.value, r.id, f); else setEigen(f); };
  const hinweis = r.hinweis && /^ergibt/i.test(r.hinweis) ? skaliereText(r.hinweis, faktor) : r.hinweis;

  return (
    <article class="page rezept">
      <a class="zurueck" href={href('/')} onClick={e => { if (kamVonListe()) { e.preventDefault(); history.back(); } }}>← Alle Rezepte</a>
      <header class="rezept-kopf">
        {r.kapitel && <p class="crumbs">{r.kapitel}</p>}
        <h1>{r.titel}</h1>
        <div class="chips">
          {r.art && <span class="badge">{r.art}</span>}
          {r.ernaehrung && <span class="badge">{r.ernaehrung}</span>}
          <span class="badge">{saisonText(r)}</span>
          {r.meal_prep && <span class="badge">Meal Prep: {r.meal_prep.stichwort}</span>}
        </div>
      </header>

      {r.magen && (
        <p class={`magen-box magen-${r.magen.stufe}`}>
          <b><Ampel stufe={r.magen.stufe} />Magen: {MAGEN_NAME[r.magen.stufe]}.</b> {r.magen.text}
        </p>
      )}

      <div class="rezept-raster">
        <section class="card zutaten">
          <div class="zutaten-kopf">
            <h2>Zutaten</h2>
            <Portionen r={r} faktor={faktor} personen={b.personen} onChange={setFaktor} />
          </div>
          {hinweis && <p class="muted small">{hinweis}</p>}
          {gruppiert(r.zutaten).map((g, i) => (
            <div key={i}>
              {g.titel && <h3 class="gruppe">{g.titel}</h3>}
              <ul class="zutatenliste">
                {g.zeilen.map((z, j) => <li key={j}>{skaliereText(z.text, faktor)}</li>)}
              </ul>
            </div>
          ))}
          <div class="zettel-aktion">
            {eintrag ? (
              <>
                <a class="btn btn-on" href={href('/einkauf')}>Auf dem Einkaufszettel ✓</a>
                <button type="button" class="btn" onClick={() => { zettel.value = vomZettel(zettel.value, r.id); setEigen(faktor); }}>Entfernen</button>
              </>
            ) : (
              <button type="button" class="btn btn-primary" onClick={() => {
                zettel.value = aufZettel(zettel.value, r.id, faktor);
                toast(`Auf dem Zettel: ${r.titel}, ${portionText(r, faktor, b.personen)}`);
              }}>Auf den Einkaufszettel</button>
            )}
          </div>
        </section>

        <section class="card zubereitung">
          <h2>Zubereitung</h2>
          <ol class="schrittliste">{r.schritte.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {r.meal_prep?.text && <p class="small"><b>Meal Prep ({r.meal_prep.stichwort}):</b> {r.meal_prep.text}</p>}
        </section>
      </div>

      {r.geheimtipp && <section class="card tipp"><h2>Geheimtipp</h2><p>{r.geheimtipp}</p></section>}
      {r.geschichte && <section class="card"><h2>Geschichte</h2><p>{r.geschichte}</p></section>}
      <p class="muted small">
        {r.saison.text && <>Saison: {r.saison.text}</>}
        {r.saison.text && r.quelle && ' · '}
        {r.quelle && <>Quelle: {r.quelle}</>}
      </p>
    </article>
  );
}

export function RezeptSeite({ id }: { id: string }) {
  const b = buch.value;
  if (!b) return <Willkommen />;
  const r = b.rezepte.find(x => x.id === id);
  if (!r) {
    return (
      <div class="page">
        <p class="panel-note">Dieses Rezept ist in den geladenen Daten nicht enthalten.</p>
        <p><a href={href('/')}>Zu allen Rezepten</a></p>
      </div>
    );
  }
  return <Ansicht b={b} r={r} />;
}
