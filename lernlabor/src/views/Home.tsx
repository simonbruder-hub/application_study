import { href } from '../router';
import { SUBJECTS } from '../learn/subjects';

/** Adresse von Taktwerk (Pomodoro): auf GitHub Pages relativ, sonst die veröffentlichte Adresse */
export const TAKTWERK_URL = location.hostname.endsWith('github.io') ? '../../taktwerk/app/' : 'https://simonbruder-hub.github.io/application_study/taktwerk/app/';

export function Home() {
  return (
    <div class="page">
      <section class="hero">
        <h1>Lernlabor</h1>
        <p class="lead">Ausprobieren, messen, verstehen. Bau eine Schaltung, schalte sie ein und sieh im Oszilloskop, was Strom und Spannung tun. Theorie und Aufgaben in Stufen begleiten dich.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href={href('/et/bauen')}>Baukasten öffnen</a>
          <a class="btn" href={href('/et')}>Elektrotechnik lernen</a>
        </div>
      </section>
      <h2 class="section-title">Fächer</h2>
      <div class="subjects">
        {SUBJECTS.map((s) => (
          <a key={s.id} class={`subject${s.ready ? '' : ' is-planned'}`} href={href(`/${s.id}`)}>
            <span class="subject-head">
              <b>{s.title}</b>
              <span class={`badge${s.ready ? ' badge-on' : ''}`}>{s.ready ? 'bereit' : 'geplant'}</span>
            </span>
            <span class="subject-blurb">{s.blurb}</span>
            <span class="subject-stages">{s.stages.length} Stufen</span>
          </a>
        ))}
      </div>
      <p class="foot small muted">
        Lernzeit messen: <a href={TAKTWERK_URL}>Taktwerk (Pomodoro-Timer)</a> · Läuft offline und lässt sich installieren.
      </p>
    </div>
  );
}
