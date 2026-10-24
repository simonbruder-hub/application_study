/**
 * Memory für die Stile ohne eigenes Spiel: Motive passend zum Stil, drei Stufen (6, 8, 12 Paare).
 * Karten drehen sich in 3D; Rückseite und Farben kommen aus dem Stil.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Skin } from '../skins';
import type { BoardProps } from './games';

/** 12 Motive je Stil */
export const MOTIFS: Partial<Record<Skin, string[]>> = {
  klassisch: ['🍅', '⏱️', '☕', '📚', '✏️', '💡', '🎧', '🧠', '📝', '🗓️', '🎯', '🌱'],
  anime: ['🌸', '⚡', '💖', '🏮', '🍙', '🐱', '⭐', '🎐', '🍡', '🦊', '🌙', '🎀'],
  technik: ['⚙️', '🔌', '💡', '🔋', '📡', '🧲', '🔧', '🖥️', '🔬', '📟', '🛰️', '🧮'],
  barock: ['🎻', '🕯️', '👑', '🏰', '🎭', '🍷', '🗝️', '🦢', '🎼', '🏺', '💎', '🌹'],
  flug: ['✈️', '☁️', '🧳', '🛫', '🗺️', '🌍', '🧭', '🪂', '🛬', '🎫', '🌅', '🚁'],
  meer: ['🐠', '🐙', '🐬', '🦀', '🐚', '🐳', '🪸', '🦑', '🐡', '🦈', '🐢', '⚓'],
  elemente: ['🔥', '💧', '🌪️', '🪨', '⚡', '❄️', '🌋', '🌊', '🍃', '☀️', '🌙', '💎'],
  zug: ['🚂', '🚆', '🚉', '🎫', '⏰', '🏔️', '🌉', '🚦', '🧳', '🗺️', '🛤️', '🧀'],
};

/** Emblem auf der Kartenrückseite */
const EMBLEM: Partial<Record<Skin, string>> = { klassisch: '🍅', anime: '🌸', technik: '⚙️', barock: '👑', flug: '✈️', meer: '🐚', elemente: '☯️', zug: '🚂' };

const LEVELS = [
  { pairs: 6, label: 'Leicht', cols: 4 },
  { pairs: 8, label: 'Mittel', cols: 4 },
  { pairs: 12, label: 'Schwer', cols: 6 },
] as const;

interface Card { id: number; motif: string; open: boolean; done: boolean }

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
};

export function Memory({ onScore, ended, skin }: BoardProps) {
  const motifs = MOTIFS[skin] ?? MOTIFS.klassisch!;
  const [level, setLevel] = useState<(typeof LEVELS)[number] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [moves, setMoves] = useState(0);
  const [misses, setMisses] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const lock = useRef(false);

  const start = (l: (typeof LEVELS)[number]) => {
    const pick = shuffle(motifs).slice(0, l.pairs);
    setCards(shuffle([...pick, ...pick]).map((motif, id) => ({ id, motif, open: false, done: false })));
    setLevel(l);
    setMoves(0);
    setMisses(0);
    setSeconds(0);
    setScore(null);
    lock.current = false;
  };

  const won = cards.length > 0 && cards.every((c) => c.done);
  useEffect(() => {
    if (!level || won || ended) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [level, won, ended]);

  const flip = (id: number) => {
    if (lock.current) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.open || card.done) return;
    const open = cards.filter((c) => c.open && !c.done);
    const next = cards.map((c) => (c.id === id ? { ...c, open: true } : c));
    if (open.length === 0) { setCards(next); return; }
    const other = open[0]!;
    setMoves((m) => m + 1);
    if (other.motif === card.motif) {
      const matched = next.map((c) => (c.motif === card.motif ? { ...c, done: true } : c));
      setCards(matched);
      if (matched.every((c) => c.done) && level) {
        const s = Math.max(level.pairs * 20, level.pairs * 100 - misses * 10 - Math.floor(seconds / 2));
        setScore(s);
        onScore(s);
      }
      return;
    }
    setCards(next);
    setMisses((m) => m + 1);
    lock.current = true;
    setTimeout(() => {
      setCards((cur) => cur.map((c) => (c.done ? c : { ...c, open: false })));
      lock.current = false;
    }, 850);
  };

  if (!level) {
    return (
      <div class="mm-choose">
        <h2>Memory</h2>
        <p>Finde die Paare. Weniger Fehlversuche und weniger Zeit geben mehr Punkte.</p>
        <div class="mm-preview" aria-hidden="true">{motifs.slice(0, 6).map((m) => <span key={m}>{m}</span>)}</div>
        <div class="mm-levels">
          {LEVELS.map((l) => (
            <button key={l.pairs} type="button" class="mm-level" onClick={() => start(l)}>
              <b>{l.label}</b><small>{l.pairs} Paare</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const found = cards.filter((c) => c.done).length / 2;
  return (
    <div class="mm">
      <div class="mm-head">
        <span><small>Paare</small><b>{found}/{level.pairs}</b></span>
        <span><small>Züge</small><b>{moves}</b></span>
        <span><small>Zeit</small><b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</b></span>
      </div>
      <div class="mm-grid" style={{ '--cols': level.cols }}>
        {cards.map((c) => (
          <button
            key={c.id} type="button" class={`mm-card${c.open || c.done ? ' is-open' : ''}${c.done ? ' is-done' : ''}`}
            aria-label={c.open || c.done ? c.motif : 'verdeckte Karte'} onClick={() => flip(c.id)}
          >
            <span class="mm-back" aria-hidden="true"><i>{EMBLEM[skin] ?? '✦'}</i></span>
            <span class="mm-front" aria-hidden="true">{c.motif}</span>
          </button>
        ))}
      </div>
      {won && (
        <div class="mm-done">
          <b>Geschafft!</b>
          <span>{moves} Züge · {misses} Fehlversuche · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}{score !== null ? ` · ${score} Punkte` : ''}</span>
          <button type="button" class="sr-go" onClick={() => start(level)}>Nochmal</button>
        </div>
      )}
      <div class="mm-tools">
        <button type="button" class="sr-btn" onClick={() => start(level)}>Neu mischen</button>
        <button type="button" class="sr-btn" onClick={() => setLevel(null)}>Stufe wählen</button>
      </div>
    </div>
  );
}
