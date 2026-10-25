/**
 * Elemente: grosses Spektakel, wenn ein Element endet. Feuer (Fokus vorbei): Flammenmeer über das ganze Fenster,
 * danach Brandspuren. Wasser (kurze Pause vorbei): ein Schwall fegt durch, danach tropft es. Luft (lange Pause
 * vorbei): eine Böe stösst alles weg, dann federt es zurück. Erde (Start aus der Ruhe): Felssturz, die Karten
 * verrutschen, das Zifferblatt bricht (Sprung im Glas, SkinDialFx).
 * Während des Spektakels steht data-spx am <html> (für die Karten), danach kurz data-spx-after (Spuren).
 */
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { prefs } from '../../app/prefs';

export type SpxKind = 'fire' | 'water' | 'air' | 'earth';

/** Dauer des Hauptteils und der Spuren danach (ms) */
const MAIN: Record<SpxKind, number> = { fire: 4200, water: 3800, air: 3600, earth: 2800 };
const AFTER: Record<SpxKind, number> = { fire: 5000, water: 2600, air: 0, earth: 6000 };

export const spectacle = signal<{ kind: SpxKind; n: number } | null>(null);

/** Spielt das Spektakel nur im Stil Elemente und wenn Bewegung erlaubt ist */
export function spectacleOn(): boolean {
  if (prefs.value.skin !== 'elemente' || prefs.value.motion === 'aus') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function playSpectacle(kind: SpxKind): void {
  if (!spectacleOn()) return;
  spectacle.value = { kind, n: (spectacle.value?.n ?? 0) + 1 };
}

export function SpectacleLayer() {
  const s = spectacle.value;
  return s ? <Spectacle key={s.n} kind={s.kind} /> : null;
}

/** Vorhersagbare Streuung je Index (gleiches Bild bei jedem Mal, kein Flackern beim Neuzeichnen) */
const rnd = (i: number, k = 0) => { const v = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453; return v - Math.floor(v); };
const many = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

function Spectacle({ kind }: { kind: SpxKind }) {
  const [phase, setPhase] = useState<'main' | 'after'>('main');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.spx = kind;
    const t1 = setTimeout(() => {
      delete root.dataset.spx;
      if (AFTER[kind] > 0) { root.dataset.spxAfter = kind; setPhase('after'); }
    }, MAIN[kind]);
    const t2 = setTimeout(() => {
      delete root.dataset.spxAfter;
      spectacle.value = null;
    }, MAIN[kind] + AFTER[kind]);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      delete root.dataset.spx;
      delete root.dataset.spxAfter;
    };
  }, [kind]);

  return (
    <div class={`spx spx-${kind} is-${phase}`} aria-hidden="true">
      {kind === 'fire' && (
        <>
          <div class="spx-glow" />
          {many(11, (i) => <i key={`b${i}`} class="flame back" style={{ '--x': `${(i / 10) * 100 - 5 + rnd(i, 11) * 8}%`, '--d': `${(0.15 + rnd(i, 12) * 0.5).toFixed(2)}s`, '--h': `${95 + rnd(i, 13) * 40}vh`, '--w': `${18 + rnd(i, 14) * 14}vw`, '--sway': `${(rnd(i, 15) - 0.5) * 8}deg` }} />)}
          {many(17, (i) => <i key={i} class="flame" style={{ '--x': `${(i / 16) * 100 - 4 + rnd(i) * 7}%`, '--d': `${(rnd(i, 1) * 0.6).toFixed(2)}s`, '--h': `${45 + rnd(i, 2) * 55}vh`, '--w': `${9 + rnd(i, 10) * 13}vw`, '--sway': `${(rnd(i, 16) - 0.5) * 10}deg` }} />)}
          {many(40, (i) => <i key={`e${i}`} class="ember" style={{ '--x': `${rnd(i, 3) * 100}%`, '--d': `${(0.4 + rnd(i, 4) * 2.6).toFixed(2)}s`, '--t': `${(1.4 + rnd(i, 5) * 1.6).toFixed(2)}s`, '--dx': `${(rnd(i, 6) - 0.5) * 30}vw` }} />)}
          {many(12, (i) => <i key={`s${i}`} class="scorch" style={{ '--x': `${rnd(i, 7) * 92}%`, '--y': `${8 + rnd(i, 8) * 84}%`, '--s': `${50 + rnd(i, 9) * 110}px`, '--r': `${rnd(i, 17) * 180}deg` }} />)}
          <div class="spx-text"><b>Feuer entfacht</b><small>Pomodoro geschafft</small></div>
        </>
      )}
      {kind === 'water' && (
        <>
          <svg class="wave" viewBox="0 0 200 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="spx-water" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stop-color="#0d47a1" stop-opacity="0" />
                <stop offset="0.25" stop-color="#1565c0" stop-opacity="0.75" />
                <stop offset="0.85" stop-color="#1e88e5" stop-opacity="0.92" />
                <stop offset="1" stop-color="#81d4fa" stop-opacity="0.95" />
              </linearGradient>
            </defs>
            <path fill="url(#spx-water)" d="M0 100 V18 C60 6 120 2 165 6 C190 9 202 22 196 36 C190 48 176 46 174 38 C172 31 180 28 184 32 C178 50 186 76 200 100 Z" />
            <path class="foam" d="M100 4 C130 1 160 2 175 6 C192 11 201 24 195 37 C190 47 177 45 175 38" />
          </svg>
          {many(26, (i) => <i key={i} class="splash" style={{ '--x': `${rnd(i) * 100}%`, '--d': `${(0.2 + rnd(i, 1) * 1.2).toFixed(2)}s`, '--up': `${-20 - rnd(i, 2) * 40}vh` }} />)}
          {many(46, (i) => <i key={`d${i}`} class="drop" style={{ '--x': `${rnd(i, 3) * 100}%`, '--y': `${rnd(i, 4) * 60}%`, '--d': `${(1.8 + rnd(i, 5) * 2.6).toFixed(2)}s`, '--t': `${(0.7 + rnd(i, 6) * 0.8).toFixed(2)}s` }} />)}
        </>
      )}
      {kind === 'air' && (
        <>
          {many(34, (i) => <i key={i} class="streak" style={{ '--y': `${rnd(i) * 100}%`, '--d': `${(0.1 + rnd(i, 1) * 1.6).toFixed(2)}s`, '--w': `${20 + rnd(i, 2) * 40}vw`, '--t': `${(0.5 + rnd(i, 3) * 0.5).toFixed(2)}s` }} />)}
          <div class="vortex">
            {many(30, (i) => <i key={i} class={i % 3 ? 'leaf' : 'dust'} style={{ '--r': `${20 + rnd(i, 4) * 34}vmin`, '--a': `${rnd(i, 5) * 360}deg`, '--d': `${(rnd(i, 6) * 0.6).toFixed(2)}s`, '--c': ['#7cb342', '#c0ca33', '#ffb300', '#a1887f'][i % 4] }} />)}
          </div>
        </>
      )}
      {kind === 'earth' && (
        <>
          {many(16, (i) => (
            <i key={i} class="rock" style={{
              '--x': `${4 + rnd(i) * 92}%`, '--s': `${26 + rnd(i, 1) * 52}px`, '--d': `${(rnd(i, 2) * 0.9).toFixed(2)}s`,
              '--rot': `${(rnd(i, 3) - 0.5) * 720}deg`, '--land': `${8 + rnd(i, 4) * 14}vh`,
              '--shape': ['polygon(20% 0, 80% 8%, 100% 52%, 78% 100%, 18% 92%, 0 45%)', 'polygon(30% 0, 100% 22%, 88% 86%, 40% 100%, 0 70%, 6% 18%)', 'polygon(10% 12%, 64% 0, 100% 40%, 84% 94%, 26% 100%, 0 58%)'][i % 3],
            }} />
          ))}
          {many(10, (i) => <i key={`p${i}`} class="dust" style={{ '--x': `${rnd(i, 5) * 100}%`, '--d': `${(0.6 + rnd(i, 6) * 0.9).toFixed(2)}s` }} />)}
        </>
      )}
    </div>
  );
}
