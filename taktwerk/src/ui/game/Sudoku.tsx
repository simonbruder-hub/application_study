/**
 * Sudoku (Stil Amtlich): vier Stufen, Notizen, Rückgängig, Tipps mit Begründung. Wählt man eine Zahl,
 * werden alle Felder schraffiert, in denen sie nicht stehen darf. Der Spielstand bleibt für die nächste Pause.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardProps } from './games';
import { allowed, box, col, findHint, generate, type Hint, type Level, LEVELS, PEERS, row, scoreFor } from './sudoku';

interface Saved {
  level: Level;
  puzzle: number[];
  solution: number[];
  board: number[];
  notes: number[];
  seconds: number;
  hints: number;
  mistakes: number;
  done: boolean;
}

const STORE = 'taktwerk.sudoku';
function load(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Saved | null;
    return s && Array.isArray(s.board) && s.board.length === 81 ? s : null;
  } catch { return null; }
}
function persist(s: Saved | null): void {
  try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch { /* privater Modus */ }
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function Sudoku({ onScore, ended }: BoardProps) {
  const [game, setGame] = useState<Saved | null>(load);
  const [choose, setChoose] = useState(() => !load() || load()!.done);
  const [busy, setBusy] = useState(false);

  const start = (level: Level) => {
    setBusy(true);
    // Erzeugen dauert einen Moment; erst den Hinweis zeichnen lassen
    setTimeout(() => {
      const { puzzle, solution } = generate(level);
      const g: Saved = { level, puzzle, solution, board: [...puzzle], notes: Array(81).fill(0), seconds: 0, hints: 0, mistakes: 0, done: false };
      persist(g);
      setGame(g);
      setChoose(false);
      setBusy(false);
    }, 30);
  };

  if (choose || !game) {
    return (
      <div class="sd-choose">
        <h2>Sudoku</h2>
        <p>Wähle eine Stufe. Wählst du eine Zahl, siehst du schraffiert, wo sie nicht hin darf. Der Spielstand bleibt für die nächste Pause.</p>
        <div class="sd-levels">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" class="sd-level" disabled={busy} onClick={() => start(l.id)}>
              <b>{l.label}</b><small>{l.clues} Vorgaben · {l.points} Punkte</small>
            </button>
          ))}
        </div>
        {game && !game.done && <button type="button" class="sr-btn" onClick={() => setChoose(false)}>Zurück zum laufenden Spiel</button>}
        {busy && <p class="sd-busy">Rätsel wird erstellt …</p>}
      </div>
    );
  }
  return <Board key={game.puzzle.join('')} initial={game} ended={ended} onScore={onScore} onNew={() => setChoose(true)} />;
}

function Board({ initial, ended, onScore, onNew }: { initial: Saved; ended: boolean; onScore: (n: number) => void; onNew: () => void }) {
  const [g, setG] = useState(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [numberMode, setNumberMode] = useState(false);
  const [notesOn, setNotesOn] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [hint, setHint] = useState<Hint | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const history = useRef<{ board: number[]; notes: number[] }[]>([]);
  const live = useRef({ g, sel, active, notesOn, numberMode });
  live.current = { g, sel, active, notesOn, numberMode };

  const update = (next: Saved) => { setG(next); persist(next); };

  // Spielzeit läuft, solange das Rätsel offen und die Pause nicht vorbei ist
  useEffect(() => {
    if (g.done || ended) return;
    const t = setInterval(() => setG((cur) => { const n = { ...cur, seconds: cur.seconds + 1 }; if (n.seconds % 5 === 0) persist(n); return n; }), 1000);
    return () => clearInterval(t);
  }, [g.done, ended]);

  const given = (i: number) => g.puzzle[i] !== 0;
  const counts = useMemo(() => {
    const c = Array(10).fill(0);
    g.board.forEach((v, i) => { if (v && v === g.solution[i]) c[v]++; });
    return c;
  }, [g.board]);

  const place = (i: number, n: number) => {
    const cur = live.current.g;
    if (cur.done || cur.puzzle[i]) return;
    history.current.push({ board: [...cur.board], notes: [...cur.notes] });
    const board = [...cur.board];
    const notes = [...cur.notes];
    if (live.current.notesOn && n) {
      if (board[i]) return;
      notes[i] = notes[i]! ^ (1 << n);
      update({ ...cur, notes });
      return;
    }
    board[i] = board[i] === n ? 0 : n;
    notes[i] = 0;
    let mistakes = cur.mistakes;
    if (board[i]) {
      if (board[i] !== cur.solution[i]) mistakes += 1;
      // Notizen mit dieser Zahl in Zeile, Spalte und Block entfernen
      for (const j of PEERS[i]!) notes[j] = notes[j]! & ~(1 << n);
    }
    const done = board.every((v, k) => v === cur.solution[k]);
    const next = { ...cur, board, notes, mistakes, done };
    update(next);
    setHint(null);
    if (done) {
      const s = scoreFor(cur.level, cur.seconds, cur.hints, mistakes);
      setScore(s);
      onScore(s);
    }
  };

  const pressNumber = (n: number) => {
    const { sel: s, active: a, numberMode: nm, g: cur } = live.current;
    if (s !== null && !cur.puzzle[s] && !nm) { place(s, n); setActive(n); return; }
    if (nm && a === n) { setNumberMode(false); setActive(null); return; }
    setActive(n);
    setNumberMode(true);
    setSel(null);
  };

  const tapCell = (i: number) => {
    const { active: a, numberMode: nm, g: cur } = live.current;
    if (nm && a && !cur.puzzle[i]) { setSel(i); place(i, a); return; }
    setNumberMode(false);
    setSel(i);
    setActive(cur.board[i] || null);
  };

  const undo = () => {
    const last = history.current.pop();
    if (last) update({ ...live.current.g, board: last.board, notes: last.notes, done: false });
  };
  const erase = () => {
    const s = live.current.sel;
    if (s === null || live.current.g.puzzle[s]) return;
    history.current.push({ board: [...live.current.g.board], notes: [...live.current.g.notes] });
    const board = [...live.current.g.board];
    const notes = [...live.current.g.notes];
    board[s] = 0;
    notes[s] = 0;
    update({ ...live.current.g, board, notes });
  };
  const tip = () => {
    const cur = live.current.g;
    const h = findHint(cur.board, cur.solution);
    if (!h) return;
    setHint(h);
    setSel(h.index);
    setActive(h.value);
    setNumberMode(false);
    history.current.push({ board: [...cur.board], notes: [...cur.notes] });
    const board = [...cur.board];
    board[h.index] = h.value;
    const notes = [...cur.notes];
    notes[h.index] = 0;
    for (const j of PEERS[h.index]!) notes[j] = notes[j]! & ~(1 << h.value);
    const done = board.every((v, k) => v === cur.solution[k]);
    update({ ...cur, board, notes, hints: cur.hints + 1, done });
    if (done) { const s = scoreFor(cur.level, cur.seconds, cur.hints + 1, cur.mistakes); setScore(s); onScore(s); }
  };

  // Tastatur: Pfeile bewegen, 1 bis 9 setzen, 0 oder Rücktaste löscht, N Notizen, H Tipp, Z rückgängig
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const { sel: s } = live.current;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); pressNumber(Number(e.key)); return; }
      const moves: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (moves[e.key] !== undefined) {
        e.preventDefault();
        const from = s ?? 40;
        const to = from + moves[e.key]!;
        if (to >= 0 && to < 81 && (Math.abs(moves[e.key]!) === 9 || row(to) === row(from))) tapCell(to);
        return;
      }
      if (['0', 'Backspace', 'Delete'].includes(e.key)) { e.preventDefault(); erase(); }
      else if (e.key.toLowerCase() === 'n') setNotesOn((v) => !v);
      else if (e.key.toLowerCase() === 'h') tip();
      else if (e.key.toLowerCase() === 'z') undo();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, []);

  const level = LEVELS.find((l) => l.id === g.level)!;
  const focusN = active;
  return (
    <div class="sd">
      <div class="sd-head">
        <span><small>Stufe</small><b>{level.label}</b></span>
        <span><small>Zeit</small><b>{fmt(g.seconds)}</b></span>
        <span><small>Fehler</small><b>{g.mistakes}</b></span>
        <span><small>Tipps</small><b>{g.hints}</b></span>
      </div>
      <div class={`sd-grid${focusN ? ' has-focus' : ''}`} role="grid" aria-label="Sudoku">
        {g.board.map((v, i) => {
          const isGiven = given(i);
          const wrong = showErrors && v && !isGiven && v !== g.solution[i];
          const same = focusN && v === focusN;
          // gesperrt: die gewählte Zahl darf hier nicht stehen (Feld belegt oder Zahl schon in Zeile, Spalte, Block)
          const blocked = focusN && !same && (v !== 0 || !allowed(g.board, i, focusN));
          const peer = sel !== null && i !== sel && (row(i) === row(sel) || col(i) === col(sel) || box(i) === box(sel));
          const cls = ['sd-cell', isGiven && 'is-given', wrong && 'is-wrong', same && 'is-same', blocked && 'is-blocked', peer && 'is-peer',
            sel === i && 'is-sel', hint?.index === i && 'is-hint', hint?.unit?.includes(i) && 'is-hint-unit',
            col(i) % 3 === 2 && col(i) < 8 && 'b-r', row(i) % 3 === 2 && row(i) < 8 && 'b-b'].filter(Boolean).join(' ');
          return (
            <button key={i} type="button" class={cls} role="gridcell" aria-label={`Zeile ${row(i) + 1}, Spalte ${col(i) + 1}${v ? `: ${v}` : ', leer'}`} onClick={() => tapCell(i)}>
              {v ? v : g.notes[i] ? (
                <span class="sd-notes">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <i key={n} class={focusN === n ? 'is-on' : ''}>{g.notes[i]! & (1 << n) ? n : ''}</i>)}</span>
              ) : ''}
            </button>
          );
        })}
      </div>
      {hint && <p class="sd-hint">{hint.text}</p>}
      {g.done && (
        <div class="sd-done">
          <b>Gelöst!</b>
          <span>{fmt(g.seconds)} · {g.hints} Tipps · {g.mistakes} Fehler{score !== null ? ` · ${score} Punkte` : ''}</span>
          <button type="button" class="sr-go" onClick={onNew}>Neues Rätsel</button>
        </div>
      )}
      <div class="sd-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" class={`sd-num${active === n ? ' is-on' : ''}${counts[n] >= 9 ? ' is-full' : ''}`} onClick={() => pressNumber(n)} aria-pressed={active === n}>
            {n}<small>{9 - counts[n]}</small>
          </button>
        ))}
      </div>
      <div class="sd-tools">
        <button type="button" class="sr-btn" aria-pressed={notesOn} onClick={() => setNotesOn((v) => !v)}>Notizen {notesOn ? 'an' : 'aus'}</button>
        <button type="button" class="sr-btn" onClick={erase}>Löschen</button>
        <button type="button" class="sr-btn" onClick={undo}>Rückgängig</button>
        <button type="button" class="sr-btn" onClick={tip}>Tipp</button>
        <button type="button" class="sr-btn" aria-pressed={showErrors} onClick={() => setShowErrors((v) => !v)}>Fehler {showErrors ? 'zeigen' : 'verbergen'}</button>
        <button type="button" class="sr-btn" onClick={onNew}>Neues Rätsel</button>
      </div>
      <p class="sd-help">Feld antippen, dann Zahl. Oder zuerst eine Zahl: schraffiert ist, wo sie nicht hin darf; dann Felder antippen. Tasten: 1 bis 9, Pfeile, 0 löscht, N Notizen, H Tipp, Z rückgängig.</p>
    </div>
  );
}
