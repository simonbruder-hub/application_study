/** Aufgaben eines Kapitels: Stufen wählen, Werte eingeben, prüfen, Lösungsweg Schritt für Schritt, im Baukasten öffnen */
import { useMemo, useState } from 'preact/hooks';
import { CircuitSvg, viewFor } from '../lab/CircuitSvg';
import { loadCircuit } from '../lab/state';
import { tasksOf } from '../learn/et/tasks';
import { subjectById } from '../learn/subjects';
import { type Gen, isCorrect, rng, type Task } from '../learn/task';
import { buildNetlist } from '../sim/netlist';
import { parseSI } from '../sim/units';
import { go, href, route } from '../router';
import { Tex, TexText } from '../ui/Tex';

const SOLVED_KEY = 'lernlabor.solved.v1';

function readSolved(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function markSolved(id: string) {
  const s = readSolved();
  s.add(id);
  try { localStorage.setItem(SOLVED_KEY, JSON.stringify([...s])); } catch { /* ohne Speicher */ }
}

function Preview({ task }: { task: Task }) {
  const c = task.circuit!;
  const net = useMemo(() => buildNetlist(c), [c]);
  const v = viewFor(c);
  return <CircuitSvg c={c} net={net} view={v} class="preview" title="Schaltung zur Aufgabe" />;
}

type Status = 'idle' | 'ok' | 'bad';

function TaskCard({ gen, solvedBefore }: { gen: Gen; solvedBefore: boolean }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const task = useMemo(() => gen.make(rng(seed)), [gen, seed]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [steps, setSteps] = useState(0);
  const [solved, setSolved] = useState(solvedBefore);

  const fresh = () => {
    setSeed(Math.floor(Math.random() * 1e9));
    setInputs({}); setChoice({}); setStatus({}); setSteps(0);
  };
  const check = () => {
    const st: Record<string, Status> = {};
    for (const a of task.answers) {
      const raw = inputs[a.key] ?? '';
      st[a.key] = raw.trim() === '' ? 'idle' : isCorrect(a, parseSI(raw)) ? 'ok' : 'bad';
    }
    for (const c of task.choices ?? []) st[c.key] = choice[c.key] === undefined ? 'idle' : choice[c.key] === c.correct ? 'ok' : 'bad';
    setStatus(st);
    const all = [...task.answers.map((a) => a.key), ...(task.choices ?? []).map((c) => c.key)];
    if (all.every((k) => st[k] === 'ok')) { markSolved(gen.id); setSolved(true); }
  };
  const openLab = () => {
    if (!task.circuit) return;
    loadCircuit(task.circuit, task.focus, task.lab ?? `Schaltung aus der Aufgabe «${gen.title}».`);
    go('/et/bauen');
  };
  const allOk = Object.keys(status).length > 0 && Object.values(status).every((s) => s === 'ok');

  return (
    <article class="card task">
      <header class="task-head">
        <span class="badge">Stufe {gen.stage}</span>
        <h2>{gen.title}</h2>
        {solved && <span class="badge badge-on" title="Schon einmal gelöst">gelöst</span>}
      </header>
      <div class="task-body">
        <div class="task-text">
          <p>{task.question}</p>
          <p class="given">{task.given.map((g) => <span key={g} class="given-item"><Tex>{g}</Tex></span>)}</p>
          <div class="answers">
            {task.answers.map((a) => (
              <label key={a.key} class={`answer is-${status[a.key] ?? 'idle'}`}>
                <span class="answer-label"><Tex>{`${a.label} =`}</Tex></span>
                <input
                  value={inputs[a.key] ?? ''}
                  inputMode="decimal"
                  placeholder={a.unit ? `in ${a.unit}` : 'Zahl'}
                  onInput={(e) => setInputs({ ...inputs, [a.key]: (e.target as HTMLInputElement).value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
                  aria-label={`${a.key} in ${a.unit || 'ohne Einheit'}`}
                />
                <span class="answer-unit">{a.unit}</span>
                <span class="answer-mark" aria-live="polite">{status[a.key] === 'ok' ? '✓' : status[a.key] === 'bad' ? '✗' : ''}</span>
              </label>
            ))}
            {task.choices?.map((c) => (
              <div key={c.key} class={`choice is-${status[c.key] ?? 'idle'}`} role="radiogroup" aria-label={c.label}>
                <span class="answer-label">{c.label}:</span>
                {c.options.map((o, i) => (
                  <button key={o} type="button" role="radio" aria-checked={choice[c.key] === i} class={`chip${choice[c.key] === i ? ' is-on' : ''}`} onClick={() => setChoice({ ...choice, [c.key]: i })}>{o}</button>
                ))}
                <span class="answer-mark">{status[c.key] === 'ok' ? '✓' : status[c.key] === 'bad' ? '✗' : ''}</span>
              </div>
            ))}
          </div>
          <p class="small muted">Eingabe mit SI-Vorsatz möglich: 4.7k, 2,2 m, 100u. Toleranz 2.5 %.</p>
          <div class="task-actions">
            <button type="button" class="btn btn-primary" onClick={check}>Prüfen</button>
            <button type="button" class="btn" onClick={() => setSteps(steps < task.steps.length ? steps + 1 : steps)} disabled={steps >= task.steps.length}>
              {steps === 0 ? 'Lösungsweg' : 'Nächster Schritt'}
            </button>
            {steps > 0 && steps < task.steps.length && <button type="button" class="btn btn-sm" onClick={() => setSteps(task.steps.length)}>Alle Schritte</button>}
            <button type="button" class="btn" onClick={fresh}>Neue Werte</button>
            {task.circuit && <button type="button" class="btn" onClick={openLab}>Im Baukasten öffnen</button>}
          </div>
          {allOk && <p class="praise">Alles richtig.</p>}
        </div>
        {task.circuit && <div class="task-figure"><Preview task={task} /></div>}
      </div>
      {steps > 0 && (
        <ol class="steps">
          {task.steps.slice(0, steps).map((s, i) => (
            <li key={i}>
              <p><TexText text={s.text} /></p>
              {s.tex && <Tex block>{s.tex}</Tex>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

export function Exercises({ chapter }: { chapter: string }) {
  const ch = subjectById('et')!.chapters!.find((c) => c.id === chapter);
  const stageParam = Number(route.value.query.get('stufe')) || 0;
  const all = tasksOf(chapter);
  const list = stageParam ? all.filter((t) => t.stage === stageParam) : all;
  const solved = readSolved();
  if (!ch) return <div class="page"><p>Dieses Kapitel gibt es nicht. <a href={href('/et')}>Zur Elektrotechnik</a></p></div>;
  return (
    <div class="page">
      <p class="crumbs"><a href={href('/')}>Fächer</a> / <a href={href('/et')}>Elektrotechnik</a> / Aufgaben</p>
      <h1>Aufgaben: {ch.title}</h1>
      <p class="lead">Jede Aufgabe hat zufällige Werte aus der E12-Reihe. Rechne selbst, prüfe, und hol dir den Lösungsweg Schritt für Schritt.</p>
      <div class="chips" role="tablist" aria-label="Stufe">
        {[0, 1, 2, 3].map((s) => (
          <a key={s} role="tab" aria-selected={stageParam === s} class={`chip${stageParam === s ? ' is-on' : ''}`} href={href(`/et/aufgaben/${chapter}${s ? `?stufe=${s}` : ''}`)}>
            {s ? `Stufe ${s}` : 'Alle'}
          </a>
        ))}
        <span class="muted small">{all.filter((t) => solved.has(t.id)).length} von {all.length} gelöst</span>
      </div>
      {list.map((g) => <TaskCard key={g.id} gen={g} solvedBefore={solved.has(g.id)} />)}
      <div class="page-next">
        <a class="btn" href={href(`/et/theorie/${chapter}`)}>Theorie zu {ch.title}</a>
      </div>
    </div>
  );
}
