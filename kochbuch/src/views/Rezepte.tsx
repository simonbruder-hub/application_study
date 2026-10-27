/** Rezeptliste mit Suche und Filtern nach Art, Ernährung, Jahreszeit und Verträglichkeit */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { JAHRESZEITEN, MAGEN } from '../data/pruefen';
import type { Kochbuch, Rezept } from '../data/types';
import {
  anzahlAktiv, anzahlMit, filterAus, filterQuery, filtere, type Filter, type Gruppe, jahreszeitAm,
  JAHRESZEIT_NAME, LEER, MAGEN_NAME, saisonText, umschalten,
} from '../logic/filter';
import { href, route, setzeQuery } from '../router';
import { buch, zettel } from '../state';
import { Ampel, MagenBadge } from '../ui/bits';
import { Willkommen } from './Import';

interface Knopf { wert: string; text: string; zusatz?: ComponentChildren }

function FilterGruppe({ titel, gruppe, knoepfe, f, rezepte, setze }: {
  titel: string; gruppe: Gruppe; knoepfe: Knopf[]; f: Filter; rezepte: Rezept[]; setze: (f: Filter) => void;
}) {
  const aktiv = f[gruppe] as string[];
  return (
    <fieldset class="filter-gruppe">
      <legend>{titel}</legend>
      <div class="chips">
        {knoepfe.map(k => {
          const an = aktiv.includes(k.wert);
          const n = anzahlMit(rezepte, f, gruppe, k.wert);
          return (
            <button
              type="button"
              key={k.wert}
              class={`chip${an ? ' is-on' : ''}`}
              aria-pressed={an}
              disabled={!an && n === 0}
              onClick={() => setze({ ...f, [gruppe]: umschalten(aktiv, k.wert) })}
            >
              {k.zusatz}{k.text}<span class="chip-n">{n}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Karte({ r }: { r: Rezept }) {
  const aufZettel = zettel.value.rezepte.some(e => e.id === r.id);
  return (
    <a class="karte" href={href(`/rezept/${encodeURIComponent(r.id)}`)}>
      <span class="karte-kopf">
        <span>{[r.art, r.ernaehrung].filter(Boolean).join(' · ')}</span>
        {aufZettel && <span class="badge badge-zettel">auf dem Zettel</span>}
      </span>
      <b class="karte-titel">{r.titel}</b>
      <span class="karte-meta">
        {r.magen && <MagenBadge stufe={r.magen.stufe} />}
        <span class="badge">{saisonText(r)}</span>
      </span>
    </a>
  );
}

/** Werte, die in den Daten vorkommen, in der Reihenfolge aus der Datei */
function vorhandene(werte: string[], rezepte: Rezept[], feld: 'art' | 'ernaehrung'): string[] {
  const da = new Set(rezepte.map(r => r[feld]).filter(Boolean));
  return [...werte.filter(w => da.has(w)), ...[...da].filter(w => !werte.includes(w))];
}

function Liste({ b }: { b: Kochbuch }) {
  const [offen, setOffen] = useState(false);
  const f = filterAus(route.value.query);
  const setze = (neu: Filter) => setzeQuery(filterQuery(neu));
  const treffer = filtere(b.rezepte, f);
  const n = anzahlAktiv(f);
  const jetzt = jahreszeitAm(new Date());

  return (
    <div class="page rezepte">
      <div class="suche">
        <input
          type="search"
          value={f.q}
          placeholder="Suchen nach Titel oder Zutat"
          aria-label="Rezepte durchsuchen"
          onInput={e => setze({ ...f, q: e.currentTarget.value })}
        />
        <button type="button" class={`btn filter-btn${n ? ' is-on' : ''}`} aria-expanded={offen} aria-controls="filter" onClick={() => setOffen(!offen)}>
          Filter{n ? ` (${n})` : ''}
        </button>
      </div>

      <div id="filter" class={`filter${offen ? ' is-open' : ''}`}>
        <FilterGruppe titel="Art" gruppe="art" f={f} rezepte={b.rezepte} setze={setze}
          knoepfe={vorhandene(b.werte.art, b.rezepte, 'art').map(w => ({ wert: w, text: w }))} />
        <FilterGruppe titel="Ernährung" gruppe="ern" f={f} rezepte={b.rezepte} setze={setze}
          knoepfe={vorhandene(b.werte.ernaehrung, b.rezepte, 'ernaehrung').map(w => ({ wert: w, text: w }))} />
        <FilterGruppe titel="Jahreszeit" gruppe="jz" f={f} rezepte={b.rezepte} setze={setze}
          knoepfe={JAHRESZEITEN.map(j => ({ wert: j, text: j === jetzt ? `${JAHRESZEIT_NAME[j]} (jetzt)` : JAHRESZEIT_NAME[j] }))} />
        <FilterGruppe titel="Verträglichkeit (Magen)" gruppe="magen" f={f} rezepte={b.rezepte} setze={setze}
          knoepfe={MAGEN.map(m => ({ wert: m, text: MAGEN_NAME[m], zusatz: <Ampel stufe={m} /> }))} />
      </div>

      <div class="ergebnis">
        <p class="treffer">
          {treffer.length === b.rezepte.length ? `${b.rezepte.length} Rezepte` : `${treffer.length} von ${b.rezepte.length} Rezepten`}
          {n > 0 && <button type="button" class="link" onClick={() => setze(LEER)}>Filter zurücksetzen</button>}
        </p>
        {treffer.length
          ? <ul class="karten">{treffer.map(r => <li key={r.id}><Karte r={r} /></li>)}</ul>
          : <p class="panel-note">Kein Rezept passt. Filter lockern oder zurücksetzen.</p>}
      </div>
    </div>
  );
}

export function Rezepte() {
  const b = buch.value;
  return b ? <Liste b={b} /> : <Willkommen />;
}
