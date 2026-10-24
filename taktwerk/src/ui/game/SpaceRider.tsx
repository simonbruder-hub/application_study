/**
 * Space Rider als Vollbild-Ebene: nur in den Pausen (Stil Sci-Fi) über den Knopf unter dem Zifferblatt zu öffnen.
 * Steuerung: Pfeiltasten oder WASD, Leertaste schiesst, P oder Esc pausiert; am Handy mit dem Finger ziehen.
 * Solange das Spiel offen ist, gehen Tasten nicht an die App (die Leertaste startet also nicht den Timer).
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { readTimer } from '../../app/timer/view';
import { draw, type Game, type GameEvent, H, type Input, newGame, step, W } from './spaceRider';

export const spaceRiderOpen = signal(false);

export function SpaceRiderLayer() {
  return spaceRiderOpen.value ? <SpaceRider onClose={() => (spaceRiderOpen.value = false)} /> : null;
}

type Mode = 'ready' | 'play' | 'paused' | 'over' | 'ended';
interface Saved { best: number; sound: boolean; auto: boolean }

const STORE = 'taktwerk.spacerider';
function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Saved>;
    return { best: Number(raw.best) || 0, sound: raw.sound ?? true, auto: raw.auto ?? true };
  } catch { return { best: 0, sound: true, auto: true }; }
}
function save(s: Saved): void {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* privater Modus: nur für diese Sitzung */ }
}

const MOVE: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};
const FIRE = new Set([' ', 'Spacebar', 'j', 'k']);

/** Kurze Synthesizer-Töne zu den Ereignissen */
const TONE: Partial<Record<GameEvent, [OscillatorType, number, number, number, number]>> = {
  shoot: ['square', 900, 420, 0.05, 0.012],
  boom: ['sawtooth', 180, 40, 0.28, 0.05],
  hit: ['triangle', 240, 60, 0.4, 0.09],
  power: ['sine', 520, 1300, 0.22, 0.06],
  level: ['sine', 660, 1320, 0.4, 0.06],
  over: ['triangle', 330, 70, 0.9, 0.08],
};
function tone(ac: AudioContext, ev: GameEvent): void {
  const cfg = TONE[ev];
  if (!cfg) return;
  const [type, f0, f1, dur, vol] = cfg;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function SpaceRider({ onClose }: { onClose: () => void }) {
  const v = readTimer();
  const breakOver = v.kind !== 'pomodoro' || v.phase === 'focus';
  const [mode, setMode] = useState<Mode>(breakOver ? 'ended' : 'ready');
  const [saved, setSaved] = useState(load);
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, double: false, shield: false });
  const [newBest, setNewBest] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const game = useRef<Game>(newGame());
  const keys = useRef(new Set<string>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const scale = useRef(1);
  const live = useRef({ mode, saved, onClose });
  live.current = { mode, saved, onClose };

  const setSave = (patch: Partial<Saved>) => setSaved((s) => { const n = { ...s, ...patch }; save(n); return n; });

  const paint = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const k = scale.current * (window.devicePixelRatio || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    draw(ctx, game.current);
  };

  const start = () => {
    if (!audio.current && typeof AudioContext !== 'undefined') {
      try { audio.current = new AudioContext(); } catch { /* ohne Ton */ }
    }
    void audio.current?.resume();
    if (live.current.mode !== 'paused') {
      game.current = newGame();
      setHud({ score: 0, lives: 3, level: 1, double: false, shield: false });
      setNewBest(false);
    }
    setMode('play');
  };

  // Pause vorbei: Spiel anhalten und zurück an die Arbeit
  useEffect(() => {
    if (breakOver && mode !== 'over') setMode('ended');
  }, [breakOver]);

  // Grösse: Spielwelt passend in den freien Platz skalieren, scharf auf hochauflösenden Bildschirmen
  useEffect(() => {
    const el = box.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const k = Math.max(0.4, Math.min(el.clientWidth / W, el.clientHeight / H));
      scale.current = k;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(W * k * dpr);
      c.height = Math.round(H * k * dpr);
      c.style.width = `${W * k}px`;
      c.style.height = `${H * k}px`;
      paint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tastatur: Tasten gehen nur ans Spiel, nicht an die App
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const m = live.current.mode;
      e.stopPropagation();
      if (MOVE[key] || FIRE.has(key)) { e.preventDefault(); keys.current.add(key); }
      if (key === 'Escape' || key === 'p') {
        e.preventDefault();
        if (m === 'play') setMode('paused');
        else if (m === 'paused' && key === 'p') start();
        else if (key === 'Escape') live.current.onClose();
      } else if ((key === 'Enter' || key === ' ') && (m === 'ready' || m === 'paused' || m === 'over')) {
        e.preventDefault();
        start();
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current.delete(key);
      if (MOVE[key] || FIRE.has(key)) { e.preventDefault(); e.stopPropagation(); }
    };
    const hide = () => { if (document.hidden && live.current.mode === 'play') setMode('paused'); };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  // Spielschleife
  useEffect(() => {
    if (mode !== 'play') { paint(); return; }
    let raf = 0;
    let last = performance.now();
    let overFor = 0;
    const frame = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const g = game.current;
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      for (const key of k) { const m = MOVE[key]; if (m) { dx += m[0]; dy += m[1]; } }
      const fire = live.current.saved.auto || pointer.current !== null || [...k].some((key) => FIRE.has(key));
      const input: Input = { dx, dy, fire, target: pointer.current };
      const events = step(g, dt, input);
      if (live.current.saved.sound && audio.current) for (const ev of new Set(events)) tone(audio.current, ev);
      setHud((h) => (h.score === g.score && h.lives === g.lives && h.level === g.level && h.double === g.player.double > 0 && h.shield === g.player.shield
        ? h : { score: g.score, lives: g.lives, level: g.level, double: g.player.double > 0, shield: g.player.shield }));
      paint();
      if (g.over) {
        overFor += dt;
        if (overFor > 1.2) {
          const best = live.current.saved.best;
          if (g.score > best) { setSave({ best: g.score }); setNewBest(true); }
          setMode('over');
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Finger oder Maus: Schiff folgt (am Handy etwas über dem Finger, damit es sichtbar bleibt)
  const toWorld = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const lift = e.pointerType === 'touch' ? 56 : 0;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H - lift };
  };

  const best = Math.max(saved.best, hud.score);
  return (
    <div class="sr-layer" role="dialog" aria-modal="true" aria-label="Space Rider">
      <div class="sr-hud">
        <span class="sr-stat"><small>Punkte</small><b>{hud.score}</b></span>
        <span class="sr-stat"><small>Rekord</small><b>{best}</b></span>
        <span class="sr-stat"><small>Stufe</small><b>{hud.level}</b></span>
        <span class="sr-stat sr-lives" aria-label={`${hud.lives} Leben`}><small>Leben</small><b>{'♥'.repeat(Math.max(0, hud.lives)) || '–'}</b></span>
        {(hud.double || hud.shield) && <span class="sr-stat sr-extra"><small>Extra</small><b>{[hud.double && '2×', hud.shield && 'Schild'].filter(Boolean).join(' ')}</b></span>}
        <span class="sr-stat sr-time"><small>Pause</small><b>{breakOver ? 'vorbei' : v.clock}</b></span>
        <span class="sr-tools">
          <button type="button" class="sr-btn" aria-pressed={saved.auto} onClick={() => setSave({ auto: !saved.auto })} title="Automatisch schiessen">Autofeuer {saved.auto ? 'an' : 'aus'}</button>
          <button type="button" class="sr-btn" aria-pressed={saved.sound} onClick={() => setSave({ sound: !saved.sound })}>Ton {saved.sound ? 'an' : 'aus'}</button>
          {mode === 'play' && <button type="button" class="sr-btn" onClick={() => setMode('paused')}>Pause</button>}
          <button type="button" class="sr-btn sr-close" onClick={onClose} aria-label="Spiel schliessen">✕</button>
        </span>
      </div>
      <div class="sr-box" ref={box}>
        <div class="sr-stage">
          <canvas
            ref={canvas} class="sr-canvas"
            onPointerDown={(e) => {
              if (mode !== 'play') return;
              (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
              pointer.current = toWorld(e);
            }}
            onPointerMove={(e) => { if (pointer.current) pointer.current = toWorld(e); }}
            onPointerUp={() => { pointer.current = null; }}
            onPointerCancel={() => { pointer.current = null; }}
          />
          {mode !== 'play' && (
            <div class="sr-screen">
              {mode === 'ready' && (
                <>
                  <h2>Space Rider</h2>
                  <p>Schiess die Angreifer ab, sammle Extras und hol dir den Rekord, solange die Pause dauert.</p>
                  <ul class="sr-keys">
                    <li><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> oder <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steuern</li>
                    <li><kbd>Leertaste</kbd> schiesst (oder Autofeuer)</li>
                    <li><kbd>P</kbd> oder <kbd>Esc</kbd> pausiert</li>
                    <li>Am Handy: Finger ziehen, das Schiff folgt</li>
                  </ul>
                  <p class="sr-legend"><span class="sr-e1">▼ 10</span><span class="sr-e2">◉ 25</span><span class="sr-e3">▣ 50</span><span>Extras: 2× · Schild · Leben</span></p>
                  <button type="button" class="sr-go" onClick={start}>Start</button>
                </>
              )}
              {mode === 'paused' && (
                <>
                  <h2>Pausiert</h2>
                  <button type="button" class="sr-go" onClick={start}>Weiter</button>
                  <button type="button" class="sr-btn" onClick={onClose}>Spiel beenden</button>
                </>
              )}
              {mode === 'over' && (
                <>
                  <h2>Game Over</h2>
                  <p class="sr-score">{hud.score} Punkte</p>
                  {newBest && <p class="sr-best">Neuer Rekord!</p>}
                  <button type="button" class="sr-go" onClick={start}>Nochmal</button>
                  <button type="button" class="sr-btn" onClick={onClose}>Schliessen</button>
                </>
              )}
              {mode === 'ended' && (
                <>
                  <h2>Pause vorbei</h2>
                  <p>Zurück an die Arbeit. {hud.score > 0 ? `Du hast ${hud.score} Punkte geholt.` : ''}</p>
                  <button type="button" class="sr-go" onClick={onClose}>Zum Fokus</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
