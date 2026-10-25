import { THEORY } from '../learn/et/theory';
import { subjectById } from '../learn/subjects';
import { href } from '../router';

export function Theory({ chapter }: { chapter: string }) {
  const th = THEORY[chapter];
  const chapters = subjectById('et')!.chapters!;
  if (!th) return <div class="page"><p>Dieses Kapitel gibt es nicht. <a href={href('/et')}>Zur Elektrotechnik</a></p></div>;
  const idx = chapters.findIndex((c) => c.id === chapter);
  const next = chapters[idx + 1];
  return (
    <div class="page prose">
      <p class="crumbs"><a href={href('/')}>Fächer</a> / <a href={href('/et')}>Elektrotechnik</a> / Theorie</p>
      <h1>{th.title}</h1>
      <p class="lead">{th.intro}</p>
      <nav class="toc" aria-label="Inhalt">
        {th.sections.map((s, i) => <a key={s.title} href={`#sec-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{s.title}</a>)}
      </nav>
      {th.sections.map((s, i) => (
        <section key={s.title} id={`sec-${i}`} class="card theory-sec">
          <h2>{s.title}</h2>
          {s.body}
        </section>
      ))}
      <div class="page-next">
        <a class="btn btn-primary" href={href(`/et/aufgaben/${chapter}`)}>Aufgaben zu {th.title}</a>
        {next && <a class="btn" href={href(`/et/theorie/${next.id}`)}>Weiter: {next.title}</a>}
      </div>
    </div>
  );
}
