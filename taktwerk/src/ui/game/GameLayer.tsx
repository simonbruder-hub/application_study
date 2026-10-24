/**
 * Vollbild-Ebene für die Pausenspiele (Space Rider, Hummelflug, Grand Prix, Waldjagd). Zu öffnen in den Pausen
 * über den Knopf unter dem Zifferblatt des passenden Stils. Steuern: Pfeiltasten oder WASD, Leertaste;
 * am Handy mit dem Finger. Solange ein Spiel offen ist, gehen Tasten nicht an die App.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { readTimer } from '../../app/timer/view';
import { GAMES, gameOpen, type GameId, type GameMeta } from './games';
import type { Pt, Tone } from './types';

export function GameLayer() {
  const id = gameOpen.value;
  return id ? <Game key={id} meta={GAMES[id]} onClose={() => (gameOpen.value = null)} /> : null;
}

type Mode = 'ready' | 'play' | 'paused' | 'over' | 'ended';
interface Saved { best: Partial<Record<GameId, number>>; sound: boolean; auto: boolean }

const STORE = 'taktwerk.games';
function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Saved>;
    return { best: raw.best ?? {}, sound: raw.sound ?? true, auto: raw.auto ?? true };
  } catch { return { best: {}, sound: true, auto: true }; }
}
function save(s: Saved): void {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* privater Modus: nur für diese Sitzung */ }
}

const MOVE: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};
const FIRE = new Set([' ', 'Spacebar', 'j', 'k']);

function tone(ac: AudioContext, cfg: Tone): void {
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

function Game({ meta, onClose }: { meta: GameMeta; onClose: () => void }) {
  const { engine } = meta;
  const v = readTimer();
  const breakOver = v.kind !== 'pomodoro' || v.phase === 'focus';
  const [mode, setMode] = useState<Mode>(breakOver ? 'ended' : 'ready');
  const [saved, setSaved] = useState(load);
  const [hud, setHud] = useState(() => engine.hud(engine.create()));
  const [score, setScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const game = useRef<unknown>(engine.create());
  const keys = useRef(new Set<string>());
  const pointer = useRef<Pt | null>(null);
  const pressed = useRef(false);
  const taps = useRef<Pt[]>([]);
  const reload = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const scale = useRef(1);
  const live = useRef({ mode, saved, onClose });
  live.current = { mode, saved, onClose };
  const best = saved.best[meta.id] ?? 0;

  const setSave = (patch: Partial<Saved>) => setSaved((s) => { const n = { ...s, ...patch }; save(n); return n; });

  const paint = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const k = scale.current * (window.devicePixelRatio || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    engine.draw(ctx, game.current);
  };

  const start = () => {
    if (!audio.current && typeof AudioContext !== 'undefined') {
      try { audio.current = new AudioContext(); } catch { /* ohne Ton */ }
    }
    void audio.current?.resume();
    if (live.current.mode !== 'paused') {
      game.current = engine.create();
      setHud(engine.hud(game.current));
      setScore(0);
      setNewBest(false);
    }
    keys.current.clear();
    pressed.current = false;
    taps.current = [];
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
      const k = Math.max(0.4, Math.min(el.clientWidth / engine.W, el.clientHeight / engine.H));
      scale.current = k;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(engine.W * k * dpr);
      c.height = Math.round(engine.H * k * dpr);
      c.style.width = `${engine.W * k}px`;
      c.style.height = `${engine.H * k}px`;
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
      if (MOVE[key] || FIRE.has(key)) {
        e.preventDefault();
        if (FIRE.has(key) && !e.repeat && m === 'play') pressed.current = true;
        keys.current.add(key);
      }
      if (key === 'r' && m === 'play') reload.current = true;
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
    let lastHud = '';
    const frame = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const g = game.current;
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      for (const key of k) { const m = MOVE[key]; if (m) { dx += m[0]; dy += m[1]; } }
      const held = [...k].some((key) => FIRE.has(key));
      const steerHeld = meta.mode === 'steer' && pointer.current !== null;
      const events = engine.step(g, dt, {
        dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)),
        fire: held || steerHeld || (meta.autofire && live.current.saved.auto),
        press: pressed.current,
        target: pointer.current,
        taps: taps.current,
        reload: reload.current,
      });
      pressed.current = false;
      taps.current = [];
      reload.current = false;
      // Zielen: die Zeigerposition gilt nur, wenn sich die Maus bewegt hat (sonst zielen die Tasten)
      if (meta.mode === 'aim') pointer.current = null;
      if (live.current.saved.sound && audio.current) {
        for (const ev of new Set(events)) { const cfg = engine.tones[ev]; if (cfg) tone(audio.current, cfg); }
      }
      const h = engine.hud(g);
      const key = JSON.stringify(h);
      if (key !== lastHud) { lastHud = key; setHud(h); setScore(engine.score(g)); }
      paint();
      if (engine.over(g)) {
        overFor += dt;
        if (overFor > 1.2) {
          const sc = engine.score(g);
          const b = live.current.saved.best[meta.id] ?? 0;
          setScore(sc);
          if (sc > b) { setSave({ best: { ...live.current.saved.best, [meta.id]: sc } }); setNewBest(true); }
          setMode('over');
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  /** Bildschirm → Spielwelt; beim Steuern am Handy etwas über dem Finger, damit die Figur sichtbar bleibt */
  const toWorld = (e: PointerEvent, lift: boolean): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    const up = lift && e.pointerType === 'touch' ? meta.lift : 0;
    return { x: ((e.clientX - r.left) / r.width) * engine.W, y: ((e.clientY - r.top) / r.height) * engine.H - up };
  };

  return (
    <div class={`sr-layer game-${meta.id}`} role="dialog" aria-modal="true" aria-label={meta.title}>
      <div class="sr-hud">
        {hud.map((h) => <span key={h.label} class={`sr-stat${h.tone ? ` tone-${h.tone}` : ''}`}><small>{h.label}</small><b>{h.value}</b></span>)}
        <span class="sr-stat"><small>Rekord</small><b>{Math.max(best, score)}</b></span>
        <span class="sr-stat sr-time"><small>Pause</small><b>{breakOver ? 'vorbei' : v.clock}</b></span>
        <span class="sr-tools">
          {meta.autofire && (
            <button type="button" class="sr-btn" aria-pressed={saved.auto} onClick={() => setSave({ auto: !saved.auto })} title="Automatisch schiessen">Autofeuer {saved.auto ? 'an' : 'aus'}</button>
          )}
          <button type="button" class="sr-btn" aria-pressed={saved.sound} onClick={() => setSave({ sound: !saved.sound })}>Ton {saved.sound ? 'an' : 'aus'}</button>
          {mode === 'play' && <button type="button" class="sr-btn" onClick={() => setMode('paused')}>Pause</button>}
          <button type="button" class="sr-btn sr-close" onClick={onClose} aria-label="Spiel schliessen">✕</button>
        </span>
      </div>
      <div class="sr-box" ref={box}>
        <div class="sr-stage">
          <canvas
            ref={canvas} class={`sr-canvas mode-${meta.mode}`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (mode !== 'play') return;
              const el = e.currentTarget as HTMLCanvasElement;
              if (meta.mode === 'aim') {
                if (e.button === 2) { reload.current = true; return; }
                const p = toWorld(e, false);
                pointer.current = p;
                taps.current.push(p);
                return;
              }
              el.setPointerCapture(e.pointerId);
              pointer.current = toWorld(e, true);
              pressed.current = true;
            }}
            onPointerMove={(e) => {
              if (meta.mode === 'aim') { if (e.pointerType !== 'touch') pointer.current = toWorld(e, false); return; }
              if (pointer.current) pointer.current = toWorld(e, true);
            }}
            onPointerUp={() => { if (meta.mode === 'steer') pointer.current = null; }}
            onPointerCancel={() => { if (meta.mode === 'steer') pointer.current = null; }}
          />
          {mode !== 'play' && (
            <div class="sr-screen">
              {mode === 'ready' && (
                <>
                  <h2>{meta.title}</h2>
                  <p>{meta.intro}</p>
                  <ul class="sr-keys">
                    {meta.help.map(([ks, text]) => (
                      <li key={text}>{ks.map((k, i) => <span key={k}>{i > 0 && k.startsWith('/') ? ' oder ' : ''}<kbd>{k.replace(/^\//, '')}</kbd></span>)} {text}</li>
                    ))}
                  </ul>
                  {meta.legend && <p class="sr-legend">{meta.legend}</p>}
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
                  <h2>{meta.overTitle}</h2>
                  <p class="sr-score">{score} Punkte</p>
                  {newBest && <p class="sr-best">Neuer Rekord!</p>}
                  <button type="button" class="sr-go" onClick={start}>Nochmal</button>
                  <button type="button" class="sr-btn" onClick={onClose}>Schliessen</button>
                </>
              )}
              {mode === 'ended' && (
                <>
                  <h2>Pause vorbei</h2>
                  <p>Zurück an die Arbeit. {score > 0 ? `Du hast ${score} Punkte geholt.` : ''}</p>
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
