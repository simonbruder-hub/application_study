/**
 * Szenen der Stile Meer, Flora, Sci-Fi, Elemente und Zug (Hintergrund der Timer-Karte und Ebene hinter dem
 * Zifferblatt). Wie in SkinDecor: alles liegt im DOM, CSS blendet je Phase ein und startet Animationen.
 */
import type { ComponentChildren } from 'preact';

const many = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);
const Deco = ({ children }: { children: ComponentChildren }) => <div class="deco" aria-hidden="true">{children}</div>;

/* ---------- Meer ---------- */

export const FISH = 'M15 0 Q9 -9 -3 -7 Q-9 -5 -11 0 Q-9 5 -3 7 Q9 9 15 0 Z M-11 0 L-19 -8 L-17 0 L-19 8 Z M9 -3 a1.8 1.8 0 1 0 0.01 0 Z';
const FISH_COLORS = ['#ff8a3d', '#ffd23f', '#4cc9f0', '#f72585', '#80ed99', '#ffb3c1', '#7b2cbf'];

function Octopus() {
  return (
    <svg class="octopus" viewBox="-50 -40 100 110">
      <g class="octo-arms">
        {[-34, -24, -13, -4, 4, 13, 24, 34].map((x, i) => (
          <path key={i} class="octo-arm" style={{ '--i': i, transformOrigin: `${x * 0.5}px 8px` }}
            d={`M${x * 0.5} 8 C${x * 0.9} 26 ${x * 1.2} 34 ${x * 1.1} 52 Q${x * 1.05 + (x > 0 ? 6 : -6)} 60 ${x * 1.25} 56`} />
        ))}
      </g>
      <ellipse class="octo-head" cx="0" cy="-6" rx="24" ry="26" />
      <circle class="octo-eye" cx="-9" cy="-2" r="5" /><circle class="octo-eye" cx="9" cy="-2" r="5" />
      <circle class="octo-pupil" cx="-8" cy="-1" r="2.2" /><circle class="octo-pupil" cx="10" cy="-1" r="2.2" />
      <path class="octo-smile" d="M-5 8 Q0 12 5 8" />
    </svg>
  );
}

function Jelly() {
  return (
    <svg class="jellyfish" viewBox="-20 -16 40 60">
      <path class="jelly-bell" d="M-16 4 Q-16 -14 0 -14 Q16 -14 16 4 Q8 1 0 4 Q-8 1 -16 4 Z" />
      {[-10, -4, 2, 8].map((x) => <path key={x} class="jelly-tail" d={`M${x} 4 q4 8 0 16 t0 16`} />)}
    </svg>
  );
}

export function MeerScene() {
  return (
    <Deco>
      <div class="caustics" />
      <div class="godrays">{many(5)}</div>
      <div class="school">
        {FISH_COLORS.map((c, i) => (
          <svg key={i} class="fish" viewBox="-20 -10 36 20" style={{ '--c': c, '--i': i }}><path d={FISH} fill-rule="evenodd" /></svg>
        ))}
      </div>
      <div class="sea-bubbles">{many(12)}</div>
      <div class="jellies"><Jelly /><Jelly /></div>
      <Octopus />
      <svg class="seaweed" viewBox="0 0 400 80" preserveAspectRatio="xMidYMax slice">
        {[18, 40, 330, 356, 380].map((x, i) => <path key={x} class="weed" style={{ '--i': i, transformOrigin: `${x}px 80px` }} d={`M${x} 80 C${x - 10} 60 ${x + 10} 45 ${x} 25 C${x - 8} 15 ${x + 4} 8 ${x} 0`} />)}
        <path class="sand" d="M0 80 V70 Q100 62 200 70 T400 68 V80 Z" />
      </svg>
      <div class="plankton">{many(14)}</div>
    </Deco>
  );
}

/* ---------- Flora ---------- */

function MeadowFlower({ x, h, c, kind }: { x: number; h: number; c: string; kind: number }) {
  const y = 80 - h;
  return (
    <g class="mf" style={{ '--c': c, transformOrigin: `${x}px 80px` }}>
      <path class="mf-stem" d={`M${x} 80 Q${x - 3} ${80 - h / 2} ${x} ${y}`} />
      {kind === 0 && <path class="mf-tulip" d={`M${x - 6} ${y} Q${x - 7} ${y - 12} ${x - 3} ${y - 13} L${x} ${y - 8} L${x + 3} ${y - 13} Q${x + 7} ${y - 12} ${x + 6} ${y} Q${x} ${y + 4} ${x - 6} ${y} Z`} />}
      {kind === 1 && <g>{[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} class="mf-petal" cx={x} cy={y - 6} rx="2.6" ry="6" transform={`rotate(${a} ${x} ${y})`} />)}<circle class="mf-core" cx={x} cy={y} r="2.8" /></g>}
      {kind === 2 && <g>{[0, 1, 2, 3].map((k) => <circle key={k} class="mf-bell" cx={x + (k % 2 ? 3 : -3)} cy={y - k * 4} r="2.8" />)}</g>}
    </g>
  );
}

const MEADOW: [number, number, string, number][] = [
  [14, 34, '#e63946', 0], [34, 26, '#ffffff', 1], [52, 40, '#c77dff', 2], [74, 30, '#ffb703', 1], [96, 22, '#ff8fab', 0],
  [300, 28, '#ff8fab', 1], [320, 38, '#e63946', 0], [342, 24, '#ffffff', 1], [362, 36, '#c77dff', 2], [384, 30, '#ffb703', 0],
];

function Bee() {
  return <span class="bee"><i class="bee-w" /><i class="bee-w" /></span>;
}

export function FloraScene() {
  return (
    <Deco>
      <div class="pollen">{many(10)}</div>
      <svg class="meadow" viewBox="0 0 400 80" preserveAspectRatio="xMidYMax slice">
        <path class="grass" d="M0 80 V70 Q20 62 40 70 T80 68 T120 70 T160 66 T200 70 T240 66 T280 70 T320 66 T360 70 T400 66 V80 Z" />
        {MEADOW.map(([x, h, c, k]) => <MeadowFlower key={x} x={x} h={h} c={c} kind={k} />)}
      </svg>
      <div class="bees"><Bee /><Bee /><Bee /></div>
      <span class="ladybug"><i /></span>
      <span class="beetle"><i /></span>
      <div class="petals flora-petals">{many(6)}</div>
      <div class="butterflies flora-butterflies">{[0, 1].map((i) => <span key={i}><i /><i /></span>)}</div>
      <div class="fireflies">{many(7)}</div>
    </Deco>
  );
}

/* ---------- Sci-Fi ---------- */

export function ScifiScene() {
  return (
    <Deco>
      <div class="stars-a" /><div class="stars-b" />
      <div class="warp">{many(28)}</div>
      <div class="hud"><i /><i /><i /><i /><span class="hud-l">NAV · OK</span><span class="hud-r">SHD 100</span></div>
      <div class="radar"><i /></div>
      <div class="planet"><i class="ring" /></div>
      <div class="comets">{many(2)}</div>
    </Deco>
  );
}

/* ---------- Elemente ---------- */

export function ElementeScene() {
  return (
    <Deco>
      <div class="fire-glow" />
      <div class="embers">{many(16)}</div>
      <svg class="waves" viewBox="0 0 800 60" preserveAspectRatio="none">
        <path class="wave-b" d="M0 30 Q50 14 100 30 T200 30 T300 30 T400 30 T500 30 T600 30 T700 30 T800 30 V60 H0 Z" />
        <path class="wave-a" d="M0 36 Q50 22 100 36 T200 36 T300 36 T400 36 T500 36 T600 36 T700 36 T800 36 V60 H0 Z" />
      </svg>
      <div class="droplets">{many(10)}</div>
      <div class="wind">{many(6)}</div>
      <div class="pebbles">{many(6)}</div>
    </Deco>
  );
}

/** Die vier alchemistischen Zeichen auf dem Zifferblatt: Feuer oben, Wasser rechts, Luft unten, Erde links */
export function ElementMarks() {
  const tri = (up: boolean, bar: boolean) => (
    <svg viewBox="-10 -10 20 20"><path d={up ? 'M0 -8 L8 7 H-8 Z' : 'M0 8 L8 -7 H-8 Z'} />{bar && <path d="M-6 0 H6" />}</svg>
  );
  return (
    <div class="el-marks">
      <span class="el-fire">{tri(true, false)}</span>
      <span class="el-water">{tri(false, false)}</span>
      <span class="el-air">{tri(true, true)}</span>
      <span class="el-earth">{tri(false, true)}</span>
    </div>
  );
}

/* ---------- Zug ---------- */

const ALPS = 'M0 60 L40 30 L70 44 L110 12 L150 40 L190 22 L230 46 L270 18 L310 38 L350 24 L400 60 L440 30 L470 44 L510 12 L550 40 L590 22 L630 46 L670 18 L710 38 L750 24 L800 60 V80 H0 Z';
const SNOW = 'M100 21 L110 12 L120 21 L113 19 L107 23 Z M260 27 L270 18 L280 27 L273 25 L267 29 Z M500 21 L510 12 L520 21 L513 19 L507 23 Z M660 27 L670 18 L680 27 L673 25 L667 29 Z';
const HILLS = 'M0 70 Q100 40 200 66 T400 62 T600 66 T800 62 V80 H0 Z';

export function ZugScene() {
  return (
    <Deco>
      <div class="sky-z" />
      <svg class="alps" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={ALPS} /><path class="snow" d={SNOW} /></svg>
      <svg class="hills" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={HILLS} /></svg>
      <div class="poles">{many(3)}</div>
      <div class="rails" />
      <div class="steam">{many(6)}</div>
      <div class="platform"><span class="sign">Gleis 3</span><span class="clock-z"><i /></span></div>
      <div class="tunnel-lights">{many(6)}</div>
    </Deco>
  );
}
