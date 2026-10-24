/**
 * Feier über die ganze App, wenn eine Session gespeichert wurde: je Stil ein eigenes Spektakel
 * (Konfetti-Kanonen, Sternen-Explosion, Funkenregen, Feuerwerk, Blütenregen, Akten und Stempel).
 * Die Teilchen sind reine CSS-Animationen; Flugbahnen kommen als CSS-Variablen je Teilchen.
 */
import { spectacleOn } from './Spectacle';
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
  natur: ['Gepflanzt!', 'Ein neuer Baum in deinem Wald'],
  amtlich: ['Erledigt', 'Akte geschlossen'],
  rennen: ['Sieg!', 'Zielflagge'],
  flug: ['Gelandet!', 'Session geschafft'],
  meer: ['Perle gefunden!', 'Session geschafft'],
  flora: ['Volle Blüte!', 'Session geschafft'],
  scifi: ['Mission erfüllt', 'Sprung ins nächste System'],
  elemente: ['Im Gleichgewicht', 'Feuer · Wasser · Luft · Erde'],
  zug: ['Pünktlich angekommen!', 'Endstation erreicht'],
  weihnacht: ['Ho ho ho!', 'Geschenk ausgepackt'],
  halloween: ['Schaurig gut!', 'Pomodoro geschafft'],
};

export function CelebrationLayer() {
  const n = celebration.value;
  if (n === 0 || flashMood.value !== 'yay') return null;
  // Elemente feiert mit dem grossen Spektakel (Spectacle.tsx)
  if (spectacleOn()) return null;
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
    case 'meer': {
      // Luftblasen steigen auf, Fische springen aus der Mitte
      const bubbles = thrown(40, () => [rand(10, 90), 104], () => ({
        '--dx': `${rand(-6, 6).toFixed(1)}vw`, '--up': `${-rand(60, 110).toFixed(0)}vh`, '--fall': `${-rand(110, 130).toFixed(0)}vh`,
        '--rot': '0deg', '--t': `${rand(2.6, 4).toFixed(2)}s`,
      }), ['#ffffff']);
      const fish = thrown(14, () => [50, 60], () => ({
        '--dx': `${rand(-40, 40).toFixed(1)}vw`, '--up': `${-rand(30, 50).toFixed(0)}vh`, '--fall': `${rand(20, 45).toFixed(0)}vh`,
        '--rot': `${rand(-200, 200).toFixed(0)}deg`, '--t': `${rand(2.4, 3.2).toFixed(2)}s`,
      }), ['#ff8a3d', '#ffd23f', '#4cc9f0', '#f72585', '#80ed99']);
      return [
        ...bubbles.map((b, i) => <span key={`b${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="bubble-p" /></span>),
        ...fish.map((b, i) => <span key={`f${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="fish-p" /></span>),
      ];
    }
    case 'flora': {
      const petals = thrown(50, () => [50, 52], () => ({
        '--dx': `${rand(-46, 46).toFixed(1)}vw`, '--up': `${-rand(20, 50).toFixed(0)}vh`, '--fall': `${rand(20, 55).toFixed(0)}vh`,
        '--rot': `${rand(-540, 540).toFixed(0)}deg`, '--t': `${rand(3, 4.4).toFixed(2)}s`,
      }), ['#e63946', '#ffb703', '#c77dff', '#ff8fab', '#ffffff', '#52b788']);
      const bees = Array.from({ length: 7 }, (_, i) => ({ '--dx': `${rand(-45, 45).toFixed(0)}vw`, '--dy': `${-rand(20, 45).toFixed(0)}vh`, '--d': `${(0.1 + i * 0.12).toFixed(2)}s` }));
      return [
        ...petals.map((b, i) => <span key={i} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class={i % 6 === 5 ? 'leaf' : 'petal'} /></span>),
        ...bees.map((f, i) => <span key={`b${i}`} class="p fly bee-fly" style={f}><b><i /><i /></b></span>),
      ];
    }
    case 'scifi': {
      // Hyperraum: Sterne schiessen als Streifen aus der Mitte, danach ein Lichtring
      return [
        <div key="ring" class="cel-ring" />,
        ...rays(60, [300, 900], ['#00e5ff', '#ffffff', '#b388ff', '#ff4081']).map((r, i) => <span key={i} class="p ray" style={r.style}><i /></span>),
      ];
    }
    case 'elemente': {
      // Vier Wirbel in den Farben der Elemente
      const sets: [readonly string[], number][] = [[['#ff5722', '#ffb74d'], 0], [['#1e88e5', '#81d4fa'], 0.15], [['#b2dfdb', '#ffffff'], 0.3], [['#6d4c41', '#a1887f', '#7cb342'], 0.45]];
      return sets.flatMap(([c, d], k) => rays(18, [120, 320], c, d).map((r, i) => <span key={`${k}-${i}`} class={`p ray el-${k}`} style={{ ...r.style, '--spin': `${k % 2 ? -1 : 1}` }}><i /></span>));
    }
    case 'zug': {
      const puffs = thrown(18, () => [rand(30, 70), 70], () => ({
        '--dx': `${rand(-20, 20).toFixed(1)}vw`, '--up': `${-rand(25, 45).toFixed(0)}vh`, '--fall': `${-rand(45, 60).toFixed(0)}vh`,
        '--rot': '0deg', '--t': `${rand(2.6, 3.6).toFixed(2)}s`,
      }), ['#ffffff']);
      const confetti = thrown(50, (i) => (i % 2 ? [102, 100] : [-2, 100]), (i) => ({
        '--dx': `${((i % 2 ? -1 : 1) * rand(15, 60)).toFixed(1)}vw`, '--up': `${-rand(45, 90).toFixed(0)}vh`, '--fall': `${rand(-5, 25).toFixed(0)}vh`,
        '--rot': `${rand(-720, 720).toFixed(0)}deg`, '--t': `${rand(2.6, 3.6).toFixed(2)}s`,
      }), ['var(--tomato)', '#ffffff', 'var(--sage)', '#f4a261']);
      return [
        ...puffs.map((b, i) => <span key={`s${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="puff" /></span>),
        ...confetti.map((b, i) => <span key={`c${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="conf" /></span>),
      ];
    }
    case 'weihnacht': {
      // Geschenke fliegen aus der Mitte, dazu Schneeflocken und goldene Sterne
      const gifts = thrown(18, () => [50, 62], () => ({
        '--dx': `${rand(-42, 42).toFixed(1)}vw`, '--up': `${-rand(35, 60).toFixed(0)}vh`, '--fall': `${rand(20, 45).toFixed(0)}vh`,
        '--rot': `${rand(-360, 360).toFixed(0)}deg`, '--t': `${rand(2.6, 3.4).toFixed(2)}s`,
      }), ['#c8102e', '#1b6b3a', '#4361ee', '#ffd166']);
      const flakes = thrown(40, () => [rand(0, 100), -6], () => ({
        '--dx': `${rand(-10, 10).toFixed(1)}vw`, '--up': '0vh', '--fall': `${rand(100, 115).toFixed(0)}vh`,
        '--rot': `${rand(-180, 180).toFixed(0)}deg`, '--t': `${rand(3, 4.4).toFixed(2)}s`,
      }), ['#ffffff']);
      return [
        ...rays(24, [120, 360], ['#ffd166', '#fff3b0']).map((r, i) => <span key={`r${i}`} class="p ray" style={r.style}><i class="star-p" /></span>),
        ...gifts.map((b, i) => <span key={`g${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="gift-p" /></span>),
        ...flakes.map((b, i) => <span key={`f${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="flake-p" /></span>),
      ];
    }
    case 'halloween': {
      // Fledermäuse schwärmen aus, Bonbons fliegen, ein Geist steigt auf
      const candy = thrown(30, () => [50, 64], () => ({
        '--dx': `${rand(-45, 45).toFixed(1)}vw`, '--up': `${-rand(30, 60).toFixed(0)}vh`, '--fall': `${rand(20, 45).toFixed(0)}vh`,
        '--rot': `${rand(-540, 540).toFixed(0)}deg`, '--t': `${rand(2.4, 3.4).toFixed(2)}s`,
      }), ['#ff7518', '#7cfc00', '#b14cff', '#ffd166']);
      return [
        <div key="ghost" class="cel-ghost"><svg viewBox="0 0 40 50"><path d="M4 22 Q4 2 20 2 Q36 2 36 22 V46 L31 41 L26 46 L20 41 L14 46 L9 41 L4 46 Z" /><circle cx="14" cy="20" r="3" /><circle cx="26" cy="20" r="3" /><ellipse cx="20" cy="30" rx="3" ry="4" /></svg></div>,
        ...rays(22, [160, 460], ['#1a1024', '#2d1b3d']).map((r, i) => <span key={`b${i}`} class="p ray" style={r.style}><i class="bat-p" /></span>),
        ...candy.map((b, i) => <span key={`c${i}`} class="p throw" style={{ left: `${b.x}vw`, top: `${b.y}vh`, ...b.style }}><i class="candy-p" /></span>),
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
