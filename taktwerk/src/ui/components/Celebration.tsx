/**
 * Feier über die ganze App, wenn eine Session gespeichert wurde: je Stil ein eigenes Spektakel
 * (Konfetti-Kanonen, Sternen-Explosion, Funkenregen, Feuerwerk, Blütenregen, Akten und Stempel).
 * Die Teilchen sind reine CSS-Animationen; Flugbahnen kommen als CSS-Variablen je Teilchen.
 */
import { useMemo } from 'preact/hooks';
import { prefs } from '../../app/prefs';
import { celebration, flashMood } from '../../app/timer/view';
import type { Skin } from '../skins';

type Vars = Record<string, string | number>;

const pick = <T,>(xs: readonly T[], i: number): T => xs[i % xs.length]!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Wurf: waagrecht gleichförmig (--dx), senkrecht erst hoch (--up), dann fallend (--fall) */
const thrown = (n: number, origin: (i: number) => [number, number], spread: (i: number) => Vars, colors: readonly string[]) =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = origin(i);
    return { x, y, style: { '--c': pick(colors, i), '--d': `${rand(0, 0.35).toFixed(2)}s`, ...spread(i) } as Vars };
  });

/** Strahlenförmig aus einem Punkt (Explosion, Feuerwerk) */
const rays = (n: number, r: [number, number], colors: readonly string[], delay = 0) =>
  Array.from({ length: n }, (_, i) => ({
    style: {
      '--a': `${((360 / n) * i + rand(-6, 6)).toFixed(1)}deg`, '--r': `${rand(r[0], r[1]).toFixed(0)}px`,
      '--c': pick(colors, i), '--d': `${(delay + rand(0, 0.12)).toFixed(2)}s`,
    } as Vars,
  }));

const TEXT: Record<Skin, [string, string]> = {
  klassisch: ['Geschafft!', 'Session gespeichert'],
  anime: ['やった!', 'Session geschafft!'],
  technik: ['PASS ✓', 'Messung gespeichert'],
  barock: ['Bravissimo!', 'Opus vollendet'],
  natur: ['Aufgeblüht!', 'Session geschafft'],
  amtlich: ['Erledigt', 'Akte geschlossen'],
  rennen: ['Sieg!', 'Zielflagge'],
  flug: ['Gelandet!', 'Session geschafft'],
};

export function CelebrationLayer() {
  const n = celebration.value;
  if (n === 0 || flashMood.value !== 'yay') return null;
  return <Celebration key={n} skin={prefs.value.skin} />;
}

function Celebration({ skin }: { skin: Skin }) {
  const parts = useMemo(() => build(skin), [skin]);
  const [title, sub] = TEXT[skin];
  return (
    <div class={`celebration cel-${skin}`} aria-hidden="true">
      <div class="cel-flash" />
      {parts}
      <div class="cel-text"><b>{title}</b><small>{sub}</small></div>
    </div>
  );
}

function build(skin: Skin) {
  switch (skin) {
    case 'klassisch': {
      // Zwei Kanonen unten links und rechts schiessen Konfetti zur Mitte hoch
      const colors = ['var(--tomato)', 'var(--sage)', 'var(--indigo)', '#eda100', '#e87ba4'];
      const bits = thrown(70, (i) => (i % 2 ? [102, 100] : [-2, 100]), (i) => {
        const dir = i % 2 ? -1 : 1;
        return {
          '--dx': `${(dir * rand(18, 62)).toFixed(1)}vw`, '--up': `${-rand(45, 92).toFixed(0)}vh`, '--fall': `${rand(-10, 20).toFixed(0)}vh`,
          '--rot': `${rand(-720, 720).toFixed(0)}deg`, '--t': `${rand(2.6, 3.6).toFixed(2)}s`,
        };
      }, colors);
      return bits.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class={`k${i % 3}`} /></span>);
    }
    case 'anime': {
      const colors = ['#ffd23f', 'var(--tomato)', 'var(--blush)', 'var(--sage)', '#ffffff', 'var(--indigo)'];
      return [
        <div key="lines" class="cel-speed" />,
        ...rays(36, [160, 480], colors).map((r, i) => <span key={i} class="p ray" style={r.style}><i class={`s${i % 3}`} /></span>),
        ...rays(18, [90, 260], colors, 0.25).map((r, i) => <span key={`b${i}`} class="p ray" style={r.style}><i class="s1" /></span>),
      ];
    }
    case 'technik': {
      // Funkenregen aus der Mitte, Funken zeigen in Flugrichtung und fallen mit der Schwerkraft
      const colors = ['#ffd23f', '#35e0ff', '#ffffff', '#ff6ad5'];
      const sparks = thrown(80, () => [50, 46], () => ({
        '--dx': `${rand(-48, 48).toFixed(1)}vw`, '--up': `${-rand(10, 45).toFixed(0)}vh`, '--fall': `${rand(25, 60).toFixed(0)}vh`,
        '--rot': '0deg', '--t': `${rand(1.4, 2.4).toFixed(2)}s`,
      }), colors);
      return [
        <div key="scan" class="cel-scan" />,
        <div key="grid" class="cel-grid" />,
        ...sparks.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i /></span>),
      ];
    }
    case 'barock': {
      // Königliches Feuerwerk: Raketen steigen auf und zerplatzen in Gold, Bordeaux und Weiss
      const shells: [number, number, number, readonly string[]][] = [
        [22, 26, 0, ['#ffd27a', '#ffffff', '#e8b04a']], [76, 20, 0.45, ['#e0566a', '#ffd27a', '#ffffff']],
        [50, 14, 0.9, ['#ffffff', '#ffd27a', '#9aa0f0']], [32, 40, 1.4, ['#e8b04a', '#e0566a', '#ffffff']],
        [68, 38, 1.9, ['#ffd27a', '#7fb38f', '#ffffff']], [50, 30, 2.5, ['#ffd27a', '#ffffff', '#e0566a']],
      ];
      return shells.flatMap(([x, y, d, colors], s) => [
        <span key={`r${s}`} class="p rocket" style={{ left: `${x}vw`, '--y': `${y}vh`, '--d': `${d}s` }} />,
        <div key={`s${s}`} class="shell" style={{ left: `${x}vw`, top: `${y}vh`, '--d': `${d + 0.7}s` }}>
          {rays(28, [90, 170], colors, d + 0.7).map((r, i) => <span key={i} class="p ray" style={r.style}><i /></span>)}
        </div>,
      ]);
    }
    case 'natur': {
      const colors = ['#f3a6bd', '#ffffff', '#f7c6d6', '#f0b429', 'var(--leaf)'];
      const petals = thrown(56, () => [50, 50], () => ({
        '--dx': `${rand(-46, 46).toFixed(1)}vw`, '--up': `${-rand(20, 50).toFixed(0)}vh`, '--fall': `${rand(20, 55).toFixed(0)}vh`,
        '--rot': `${rand(-540, 540).toFixed(0)}deg`, '--t': `${rand(3, 4.4).toFixed(2)}s`,
      }), colors);
      const flyers = Array.from({ length: 5 }, (_, i) => ({ '--dx': `${rand(-45, 45).toFixed(0)}vw`, '--dy': `${-rand(25, 50).toFixed(0)}vh`, '--d': `${(0.2 + i * 0.15).toFixed(2)}s` }));
      return [
        <div key="bloom" class="cel-bloom">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` }} />)}</div>,
        ...petals.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class={i % 5 === 4 ? 'leaf' : 'petal'} /></span>),
        ...flyers.map((f, i) => <span key={`f${i}`} class="p fly" style={f}><b><i /><i /></b></span>),
      ];
    }
    case 'rennen': {
      // Zielflagge: schwarz-weisse Karos und Champagner-Gold aus beiden Ecken
      const bits = thrown(64, (i) => (i % 2 ? [102, 100] : [-2, 100]), (i) => ({
        '--dx': `${((i % 2 ? -1 : 1) * rand(15, 60)).toFixed(1)}vw`, '--up': `${-rand(45, 90).toFixed(0)}vh`, '--fall': `${rand(-5, 25).toFixed(0)}vh`,
        '--rot': `${rand(-720, 720).toFixed(0)}deg`, '--t': `${rand(2.6, 3.6).toFixed(2)}s`,
      }), ['#111111', '#ffffff', '#ffd60a', '#e10600']);
      return [<div key="flag" class="cel-flag" />, ...bits.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i /></span>)];
    }
    case 'flug': {
      // Kunstflug: Flugzeug zieht eine Schleife, dazu Wolkenpuffs und Konfetti
      const puffs = rays(24, [140, 380], ['#ffffff', '#d6ecff', 'var(--tomato)', '#ffd60a']);
      return [
        <div key="loop" class="cel-loop"><svg viewBox="-16 -16 32 32"><path d="M15 0 Q14 -2 8 -2 L-9 -1.6 L-13 -6 L-15.5 -6 L-13.5 0 L-15.5 6 L-13 6 L-9 1.6 L8 2 Q14 2 15 0 Z M5 -1.5 L-2 -14 L-5.5 -14 L-2.5 -1.5 Z M5 1.5 L-2 14 L-5.5 14 L-2.5 1.5 Z" /></svg></div>,
        ...puffs.map((r, i) => <span key={i} class="p ray" style={r.style}><i /></span>),
      ];
    }
    case 'amtlich': {
      // Akten fliegen aus der Mitte hoch und flattern zu Boden
      const sheets = thrown(26, () => [50, 52], () => ({
        '--dx': `${rand(-42, 42).toFixed(1)}vw`, '--up': `${-rand(25, 55).toFixed(0)}vh`, '--fall': `${rand(30, 60).toFixed(0)}vh`,
        '--rot': `${rand(-360, 360).toFixed(0)}deg`, '--t': `${rand(3.2, 4.6).toFixed(2)}s`,
      }), ['#ffffff']);
      return sheets.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="sheet" /></span>);
    }
  }
}
