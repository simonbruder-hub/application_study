/**
 * Lohnrechner auf einer Seite: Eingaben links, Ergebnis und Verdienst rechts (auf dem Handy untereinander).
 * Jede Änderung rechnet sofort neu und landet im Speicher des Browsers.
 */
import { useEffect, useState } from 'preact/hooks';
import { type Feld, feld, type Formular, lesen, START } from './logic/formular';
import { type Eingaben, type Ergebnis, rechne, verdienst } from './logic/lohn';
import { anzahl, franken, prozent } from './logic/zahlen';
import { laden, speichern } from './speicher';

type Setze = <K extends keyof Formular>(k: K, v: Formular[K]) => void;
type Fehler = Partial<Record<Feld, string>>;

const tage = (n: number) => `${anzahl(n)} ${n === 1 ? 'Tag' : 'Tage'}`;

export function App() {
  const [f, setF] = useState<Formular>(laden);
  useEffect(() => speichern(f), [f]);
  const setze: Setze = (k, v) => setF(alt => ({ ...alt, [k]: v }));
  const { eingaben, fehler } = lesen(f);
  const r = eingaben ? rechne(eingaben) : null;
  return (
    <>
      <header class="top">
        <a class="brand" href="./">
          <Logo />
          <span>Lohnrechner</span>
        </a>
        <a class="top-link" href="../../">Alle Apps</a>
      </header>
      <main>
        <div class="page">
          <section class="hero">
            <h1>Lohnrechner</h1>
            <p class="lead">Monatslohn in Stundenlohn umrechnen und zurück, mit 13. Monatslohn, Ferien und Feiertagen.</p>
          </section>
          <div class="raster">
            <Formularkarte f={f} setze={setze} fehler={fehler} zuruecksetzen={() => setF({ ...START })} />
            <div class="spalte">
              {eingaben && r ? <Resultat e={eingaben} r={r} /> : (
                <section class="card ergebnis">
                  <p class="panel-note" role="status">Bitte die rot markierten Felder prüfen.</p>
                </section>
              )}
              <VerdienstKarte f={f} setze={setze} r={r} />
            </div>
          </div>
          <p class="muted small fuss">
            Alle Beträge brutto, also vor den Abzügen für AHV, ALV und Pensionskasse, und auf Rappen gerundet.
            Deine Eingaben bleiben nur in diesem Browser.
          </p>
        </div>
      </main>
    </>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" class="brand-logo" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" class="bl-bg" />
      <circle cx="14" cy="14.5" r="7.5" class="bl-strich" />
      <path d="M14 10.5v4l2.8 1.9" class="bl-strich" />
      <circle cx="22.5" cy="22.5" r="4.8" class="bl-muenze" />
    </svg>
  );
}

function Formularkarte({ f, setze, fehler, zuruecksetzen }: {
  f: Formular; setze: Setze; fehler: Fehler; zuruecksetzen: () => void;
}) {
  return (
    <form class="card eingaben" aria-label="Eingaben" onSubmit={e => e.preventDefault()}>
      <fieldset class="wahl">
        <legend>Was kennst du?</legend>
        <div class="seg">
          {(['monat', 'stunde'] as const).map(w => (
            <label key={w} class={f.richtung === w ? 'is-on' : ''}>
              <input type="radio" name="richtung" value={w} checked={f.richtung === w} onChange={() => setze('richtung', w)} />
              {w === 'monat' ? 'Monatslohn' : 'Stundenlohn'}
            </label>
          ))}
        </div>
      </fieldset>
      {f.richtung === 'monat'
        ? <Zahl name="monatslohn" label="Monatslohn brutto" einheit="Fr." hinweis="Pro Monat, wie im Vertrag" f={f} setze={setze} fehler={fehler} />
        : <Zahl name="stundenlohn" label="Stundenlohn brutto" einheit="Fr." f={f} setze={setze} fehler={fehler}
            hinweis={f.dreizehnter ? 'Pro Stunde, mit 13. Monatslohn, Ferien- und Feiertagszuschlag' : 'Pro Stunde, mit Ferien- und Feiertagszuschlag'} />}
      <label class="schalter">
        <input type="checkbox" checked={f.dreizehnter} onChange={e => setze('dreizehnter', e.currentTarget.checked)} />
        13. Monatslohn
      </label>
      <div class="felder">
        <Zahl name="pensum" label="Pensum" einheit="%" f={f} setze={setze} fehler={fehler} />
        <Zahl name="wochenstunden" label="Wochenstunden bei 100 %" einheit="h" f={f} setze={setze} fehler={fehler} />
        <Zahl name="ferientage" label="Ferientage pro Jahr" einheit="Tage" f={f} setze={setze} fehler={fehler} />
        <Zahl name="feiertage" label="Bezahlte Feiertage" einheit="Tage" f={f} setze={setze} fehler={fehler} />
      </div>
      <button type="button" class="link" onClick={zuruecksetzen}>Beispielwerte laden</button>
    </form>
  );
}

function Zahl({ name, label, einheit, hinweis, f, setze, fehler }: {
  name: Feld; label: string; einheit: string; hinweis?: string; f: Formular; setze: Setze; fehler: Fehler;
}) {
  const id = `feld-${name}`;
  const meldung = fehler[name];
  const info = meldung ?? hinweis;
  return (
    <div class={meldung ? 'feld is-fehler' : 'feld'}>
      <label for={id}>{label}<span class="sr-only"> in {einheit}</span></label>
      <div class="eingabe">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellcheck={false}
          value={f[name]}
          aria-invalid={meldung ? 'true' : undefined}
          aria-describedby={info ? `${id}-info` : undefined}
          onInput={e => setze(name, e.currentTarget.value)}
        />
        <span class="einheit" aria-hidden="true">{einheit}</span>
      </div>
      {info && <p class="feld-info" id={`${id}-info`}>{info}</p>}
    </div>
  );
}

function Zeile({ text, satz, betrag, art }: { text: string; satz?: number; betrag: number; art?: 'summe' | 'total' }) {
  return (
    <tr class={art}>
      <th scope="row">{text}</th>
      <td class="satz">{satz === undefined ? '' : prozent(satz)}</td>
      <td class="zahl">{franken(betrag)}</td>
    </tr>
  );
}

function Resultat({ e, r }: { e: Eingaben; r: Ergebnis }) {
  const monat = e.richtung === 'monat';
  const s = r.stunde;
  const unter = monat
    ? e.dreizehnter ? 'mit 13. Monatslohn, Ferien- und Feiertagszuschlag' : 'mit Ferien- und Feiertagszuschlag'
    : `bei ${anzahl(e.pensum)} % Pensum, ${r.monatsloehne} Monatslöhne im Jahr`;
  return (
    <section class="card ergebnis" aria-labelledby="ergebnis-titel">
      <p class="eyebrow" id="ergebnis-titel">{monat ? 'Stundenlohn brutto' : 'Monatslohn brutto'}</p>
      <p class="gross" aria-live="polite">
        <span class="betrag" data-testid="ergebnis">{franken(monat ? s.brutto : r.monatslohn)}</span>
        <span class="einheit">{monat ? 'Fr. pro Stunde' : 'Fr. pro Monat'}</span>
      </p>
      <p class="muted unter">{unter}</p>
      <table class="rechnung">
        <caption class="sr-only">So setzt sich der Stundenlohn zusammen</caption>
        <thead><tr><th scope="col">Pro Stunde</th><th scope="col">Ansatz</th><th scope="col">Fr.</th></tr></thead>
        <tbody>
          {e.dreizehnter && <Zeile text="Stundenlohn ohne 13. Monatslohn" betrag={s.grund} />}
          {e.dreizehnter && <Zeile text="13. Monatslohn" satz={r.satz.dreizehnter} betrag={s.dreizehnter} />}
          <Zeile text={e.dreizehnter ? 'Stundenlohn mit 13. Monatslohn' : 'Stundenlohn'} betrag={s.zwischen} art={e.dreizehnter ? 'summe' : undefined} />
          <Zeile text={`Ferienzuschlag, ${tage(e.ferientage)}`} satz={r.satz.ferien} betrag={s.ferien} />
          <Zeile text={`Feiertagszuschlag, ${tage(e.feiertage)}`} satz={r.satz.feiertage} betrag={s.feiertage} />
          <Zeile text="Brutto pro Stunde" betrag={s.brutto} art="total" />
        </tbody>
      </table>
      <dl class="eckdaten">
        <div><dt>Jahreslohn</dt><dd>{franken(r.jahreslohn)} Fr.</dd></div>
        <div><dt>Arbeitsstunden im Jahr</dt><dd>{anzahl(r.jahresstunden)}</dd></div>
        {e.pensum < 100 && <div><dt>Monatslohn bei 100 %</dt><dd>{franken((r.monatslohn * 100) / e.pensum)} Fr.</dd></div>}
      </dl>
    </section>
  );
}

function VerdienstKarte({ f, setze, r }: { f: Formular; setze: Setze; r: Ergebnis | null }) {
  const gelesen = feld('stunden', f.stunden);
  const stunden = 'wert' in gelesen ? gelesen.wert : null;
  const v = r && stunden !== null ? verdienst(r, stunden) : null;
  // Ein leeres Feld ist kein Fehler, es gibt dann einfach noch keinen Verdienst
  const fehler: Fehler = 'fehler' in gelesen && f.stunden.trim() ? { stunden: gelesen.fehler } : {};
  return (
    <section class="card verdienst" aria-labelledby="verdienst-titel">
      <h2 id="verdienst-titel">Verdienst aus Stunden</h2>
      <Zahl name="stunden" label="Gearbeitete Stunden im Monat" einheit="h" hinweis="Auch halbe Stunden, z. B. 37,5" f={f} setze={setze} fehler={fehler} />
      {r && v && stunden !== null && (
        <>
          <div>
            <p class="gross klein" aria-live="polite">
              <span class="betrag" data-testid="verdienst">{franken(v.brutto)}</span>
              <span class="einheit">Fr. brutto</span>
            </p>
            <p class="muted unter">{anzahl(stunden)} {stunden === 1 ? 'Stunde' : 'Stunden'} zu {franken(v.satz)} Fr.</p>
          </div>
          <table class="rechnung">
            <caption class="sr-only">Woraus der Verdienst besteht</caption>
            <thead><tr><th scope="col">Anteile</th><th scope="col">Ansatz</th><th scope="col">Fr.</th></tr></thead>
            <tbody>
              <Zeile text="Grundlohn" betrag={v.grund} />
              {r.monatsloehne === 13 && <Zeile text="13. Monatslohn" satz={r.satz.dreizehnter} betrag={v.dreizehnter} />}
              <Zeile text="Ferienzuschlag" satz={r.satz.ferien} betrag={v.ferien} />
              <Zeile text="Feiertagszuschlag" satz={r.satz.feiertage} betrag={v.feiertage} />
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
