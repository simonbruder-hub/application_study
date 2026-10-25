import { exampleById } from '../lab/examples';
import { subjectById } from '../learn/subjects';
import { href } from '../router';

export function Fach({ id }: { id: string }) {
  const s = subjectById(id);
  if (!s) return <div class="page"><p>Dieses Fach gibt es nicht. <a href={href('/')}>Zur Übersicht</a></p></div>;
  return (
    <div class="page">
      <p class="crumbs"><a href={href('/')}>Fächer</a> / {s.title}</p>
      <h1>{s.title}</h1>
      <p class="lead">{s.blurb}</p>
      {s.ready && s.chapters ? (
        <>
          <a class="btn btn-primary" href={href('/et/bauen')}>Baukasten öffnen</a>
          <div class="chapters">
            {s.chapters.map((c, i) => (
              <section key={c.id} class="chapter card">
                <span class="chapter-no">{i + 1}</span>
                <h2>{c.title}</h2>
                <p class="muted">{c.summary}</p>
                <div class="chapter-links">
                  <a class="btn" href={href(`/et/theorie/${c.id}`)}>Theorie</a>
                  <a class="btn" href={href(`/et/aufgaben/${c.id}`)}>Aufgaben</a>
                </div>
                <p class="small">Im Baukasten: {c.examples.map((e, k) => (
                  <span key={e}>{k ? ' · ' : ''}<a href={href(`/et/bauen?bsp=${e}`)}>{exampleById(e)?.title}</a></span>
                ))}</p>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p class="panel-note">Dieses Fach ist geplant. So soll es aufgebaut sein:</p>
      )}
      <h2 class="section-title">Stufen</h2>
      <ol class="stages">
        {s.stages.map((st) => (
          <li key={st.title}><b>{st.title}</b><span>{st.topics.join(' · ')}</span></li>
        ))}
      </ol>
    </div>
  );
}
