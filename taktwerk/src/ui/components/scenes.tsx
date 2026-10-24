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

function MeadowFlower({ x, h, c, kind, back }: { x: number; h: number; c: string; kind: number; back?: boolean }) {
  const y = 80 - h;
  const ring = (n: number, rx: number, ry: number, d: number) =>
    Array.from({ length: n }, (_, k) => <ellipse key={k} class="mf-petal" cx={x} cy={y - d} rx={rx} ry={ry} transform={`rotate(${(360 / n) * k} ${x} ${y})`} />);
  return (
    <g class={back ? 'mf back' : 'mf'} style={{ '--c': c, transformOrigin: `${x}px 80px` }}>
      <path class="mf-stem" d={`M${x} 80 Q${x - 3} ${80 - h / 2} ${x} ${y}`} />
      {h > 26 && <ellipse class="mf-leaf" cx={x + 4} cy={80 - h * 0.35} rx="4" ry="1.8" transform={`rotate(-30 ${x + 4} ${80 - h * 0.35})`} />}
      {kind === 0 && <path class="mf-tulip" d={`M${x - 6} ${y} Q${x - 7} ${y - 12} ${x - 3} ${y - 13} L${x} ${y - 8} L${x + 3} ${y - 13} Q${x + 7} ${y - 12} ${x + 6} ${y} Q${x} ${y + 4} ${x - 6} ${y} Z`} />}
      {kind === 1 && <g>{ring(6, 2.6, 6, 6)}<circle class="mf-core" cx={x} cy={y} r="2.8" /></g>}
      {kind === 2 && <g>{[0, 1, 2, 3, 4].map((k) => <circle key={k} class="mf-bell" cx={x + (k % 2 ? 2.6 : -2.6)} cy={y - k * 3.6} r={2.9 - k * 0.3} />)}</g>}
      {kind === 3 && <g class="mf-sun">{ring(12, 2.2, 6.5, 7)}<circle class="mf-seed" cx={x} cy={y} r="4.4" /></g>}
      {kind === 4 && <g>{ring(4, 5, 5.4, 4)}<circle class="mf-eye" cx={x} cy={y} r="2" /></g>}
      {kind === 5 && <g class="mf-rose"><circle cx={x} cy={y} r="6" /><path d={`M${x - 3} ${y} a3 3 0 1 1 3 3 a4.5 4.5 0 1 1 4.5 -4.5`} /></g>}
      {kind === 6 && <g class="mf-puff"><circle cx={x} cy={y} r="6.5" /><circle class="mf-core" cx={x} cy={y} r="1.4" /></g>}
    </g>
  );
}

/** Deterministische Zufallszahl 0..1 für die Wiese (gleich bei jedem Laden) */
const rnd = (i: number) => { const v = Math.sin((i + 1) * 12.9898) * 43758.5453; return v - Math.floor(v); };
const BLOOM = ['#e63946', '#ffffff', '#c77dff', '#ffb703', '#ff8fab', '#4cc9f0', '#ff6d00', '#f72585'];
/** Wiese über die ganze Breite: hintere Reihe klein und blass, vordere Reihe gross; Arten 0 bis 6 */
const MEADOW_BACK: [number, number, string, number][] = Array.from({ length: 26 }, (_, i) =>
  [8 + i * 15 + rnd(i) * 6, 12 + rnd(i + 40) * 8, BLOOM[i % BLOOM.length]!, [1, 2, 4, 1, 6][i % 5]!]);
const MEADOW: [number, number, string, number][] = Array.from({ length: 30 }, (_, i) => {
  const kind = Math.floor(rnd(i + 7) * 7);
  return [4 + i * 13.2 + rnd(i + 3) * 5, 20 + rnd(i + 11) * 16, kind === 3 ? '#ffc300' : kind === 4 ? '#d00000' : kind === 5 ? '#e5383b' : BLOOM[(i * 3) % BLOOM.length]!, kind];
});

/** Kletterrosen in den oberen Ecken der Karte */
function Vine({ side }: { side: 'l' | 'r' }) {
  return (
    <svg class={`vine vine-${side}`} viewBox="0 0 120 120">
      <path class="vine-stem" d="M0 4 C30 10 46 24 52 46 S70 84 66 116 M0 30 C18 34 26 46 24 62 M20 0 C38 18 64 18 84 8" />
      {[[16, 9, 30], [40, 24, -40], [30, 48, 20], [58, 66, -30], [70, 15, 40], [62, 98, 10], [10, 34, -10]].map(([x, y, a], i) => (
        <ellipse key={i} class="vine-leaf" cx={x} cy={y} rx="7" ry="3.2" transform={`rotate(${a} ${x} ${y})`} />
      ))}
      {[[52, 46, 8, '#e63946'], [24, 62, 6, '#ff8fab'], [84, 8, 7, '#ff8fab'], [66, 84, 6.5, '#e63946'], [6, 12, 5, '#ffffff']].map(([x, y, r, c], i) => (
        <g key={i} class="vine-rose" style={{ '--c': c, '--i': i }}>
          <circle cx={x} cy={y} r={r} />
          <path d={`M${(x as number) - (r as number) / 2} ${y} a${(r as number) / 2} ${(r as number) / 2} 0 1 1 ${(r as number) / 2} ${(r as number) / 2} a${(r as number) * 0.75} ${(r as number) * 0.75} 0 1 1 ${(r as number) * 0.75} ${-(r as number) * 0.75}`} />
        </g>
      ))}
    </svg>
  );
}

/** Blütenkranz hinter dem Zifferblatt (Flora): Blüten wechseln Farbe, der Kranz dreht sich langsam beim Lauf */
export function FloraWreath() {
  return (
    <svg class="wreath" viewBox="0 0 320 320">
      <g class="wreath-turn">
        {Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * 2 * Math.PI;
          const x = 160 + 146 * Math.sin(a);
          const y = 160 - 146 * Math.cos(a);
          const lx = 160 + 146 * Math.sin(a + Math.PI / 18);
          const ly = 160 - 146 * Math.cos(a + Math.PI / 18);
          return (
            <g key={i}>
              <ellipse class="wr-leaf" cx={lx} cy={ly} rx="7" ry="3" transform={`rotate(${(i + 0.5) * 20} ${lx} ${ly})`} />
              <g class="wr-bloom" style={{ '--c': BLOOM[i % BLOOM.length], '--i': i }}>
                {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx={x} cy={y - 5} rx="3.6" ry="5.4" transform={`rotate(${r} ${x} ${y})`} />)}
                <circle class="wr-core" cx={x} cy={y} r="2.6" />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function Bee() {
  return <span class="bee"><i class="bee-w" /><i class="bee-w" /></span>;
}

export function FloraScene() {
  return (
    <Deco>
      <div class="pollen">{many(10)}</div>
      <Vine side="l" /><Vine side="r" />
      <svg class="meadow" viewBox="0 0 400 80" preserveAspectRatio="xMidYMax slice">
        <path class="grass-back" d="M0 80 V62 Q30 56 60 62 T120 60 T180 62 T240 58 T300 62 T360 58 T400 60 V80 Z" />
        {MEADOW_BACK.map(([x, h, c, k]) => <MeadowFlower key={`b${x}`} x={x} h={h + 6} c={c} kind={k} back />)}
        <path class="grass" d="M0 80 V70 Q20 62 40 70 T80 68 T120 70 T160 66 T200 70 T240 66 T280 70 T320 66 T360 70 T400 66 V80 Z" />
        {MEADOW.map(([x, h, c, k]) => <MeadowFlower key={x} x={x} h={h} c={c} kind={k} />)}
      </svg>
      <div class="bees"><Bee /><Bee /><Bee /></div>
      <span class="ladybug"><i /></span>
      <span class="beetle"><i /></span>
      <div class="petals flora-petals">{many(12)}</div>
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
      <div class="dogfight">
        {[0, 1, 2].map((k) => (
          <div key={k} class="df-lane">
            <span class="df-ship">
              <svg viewBox="0 0 44 22"><path d="M44 11 L26 4 L14 1 L8 6 L0 8 L0 14 L8 16 L14 21 L26 18 Z" /><path class="df-cockpit" d="M30 9 L37 11 L30 13 Z" /></svg>
              <i class="df-flame" /><i class="df-laser" /><i class="df-laser" />
            </span>
            <span class="df-enemy">
              <svg viewBox="0 0 32 22"><path d="M0 11 L12 2 L32 6 L24 11 L32 16 L12 20 Z" /><circle cx="13" cy="11" r="3" /></svg>
              <i class="df-boom" />
            </span>
          </div>
        ))}
      </div>
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

/** Landschaft, die sich nahtlos wiederholt: eine Periode von 400 Einheiten, zweimal gezeichnet (Breite 800) */
const tile = (pts: readonly (readonly [number, number])[], base: number) => {
  const line = [0, 400].flatMap((o) => pts.map(([x, y]) => `${x + o} ${y}`)).join(' L');
  return `M0 ${base} L${line} L800 ${base} Z`;
};
const ALPS = tile([[0, 60], [40, 30], [70, 44], [110, 12], [150, 40], [190, 22], [230, 46], [270, 18], [310, 38], [350, 24], [400, 60]], 80);
const SNOW = 'M100 21 L110 12 L120 21 L113 19 L107 23 Z M260 27 L270 18 L280 27 L273 25 L267 29 Z M500 21 L510 12 L520 21 L513 19 L507 23 Z M660 27 L670 18 L680 27 L673 25 L667 29 Z';
const PEAKS = tile([[0, 70], [30, 48], [55, 58], [95, 26], [130, 52], [165, 38], [205, 64], [245, 30], [285, 54], [320, 42], [360, 62], [400, 70]], 80);
const HILLS = 'M0 66 Q100 40 200 66 T400 66 T600 66 T800 66 V80 H0 Z';
/** Tannen in Reihe: Höhe je Baum leicht verschieden, Periode 400 */
const FIRS = [0, 400].flatMap((o) => Array.from({ length: 16 }, (_, i) => {
  const x = o + i * 25 + (i % 3) * 4;
  const h = 16 + ((i * 7) % 5) * 4;
  return `M${x - 7} 40 L${x} ${40 - h} L${x + 7} 40 Z`;
})).join(' ');

/** Zug auf dem Gleis unten: zwei Wagen und eine Lok, Räder drehen sich während der Fahrt */
function Train() {
  const wheels = [10, 26, 44, 60, 82, 98, 116, 132, 152, 168, 192, 208];
  return (
    <svg class="z-train" viewBox="0 0 222 46">
      <g class="z-body">
        {[0, 72].map((x) => (
          <g key={x}>
            <rect class="z-car" x={x} y="10" width="68" height="26" rx="4" />
            <rect class="z-band" x={x} y="27" width="68" height="3" />
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} class="z-win" x={x + 5 + i * 12.4} y="14" width="9" height="9" rx="1.5" />)}
          </g>
        ))}
        <path class="z-car z-loco" d="M144 10 H194 Q213 12 218 30 V36 H144 Z" />
        <path class="z-win" d="M198 14 Q209 16 213 26 H198 Z" />
        <rect class="z-band" x="144" y="27" width="72" height="3" />
        <rect class="z-door" x="182" y="14" width="9" height="16" rx="1" />
        <path class="z-panto" d="M158 10 L168 2 L178 10 M162 2 H176" />
        <circle class="z-lamp" cx="215" cy="31" r="1.6" />
      </g>
      {wheels.map((x) => (
        <g key={x} transform={`translate(${x} 39)`}>
          <g class="z-wheel"><circle r="5" /><path d="M-3.5 0 H3.5 M0 -3.5 V3.5" /></g>
        </g>
      ))}
    </svg>
  );
}

/** Kleiner Bahnhof (kurze Pause): Haus, Bahnsteig, Ortsschild, Bahnhofsuhr */
function Station({ name }: { name: string }) {
  return (
    <div class="station">
      <svg class="st-house" viewBox="0 0 120 70">
        <path class="st-roof" d="M2 26 L60 4 L118 26 Z" />
        <rect class="st-wall" x="10" y="26" width="100" height="40" />
        <rect class="st-door" x="52" y="44" width="16" height="22" />
        {[18, 32, 76, 90].map((x) => <rect key={x} class="st-window" x={x} y="46" width="10" height="11" />)}
        <rect class="st-platform" x="0" y="64" width="120" height="6" />
      </svg>
      <span class="st-sign">{name}</span>
      <span class="clock-z"><i /></span>
    </div>
  );
}

/** Hauptbahnhof (lange Pause): Glasdach über die ganze Karte, Säulen, Bahnhofsuhr und Abfahrtstafel */
const HB_ARCH = (lift: number) => `M-10 ${110 + lift} Q200 ${-70 + lift} 410 ${110 + lift}`;
/** Höhe des äussersten Bogens bei x (quadratische Bézierkurve, x läuft linear) */
const archY = (x: number) => { const t = (x + 10) / 420; return 110 * (1 - t) ** 2 - 140 * (1 - t) * t + 110 * t ** 2; };
function MainStation() {
  return (
    <div class="hb">
      <svg class="hb-hall" viewBox="0 0 400 300" preserveAspectRatio="none">
        <path class="hb-glass" d={`${HB_ARCH(0)} V300 H-10 Z`} />
        {[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => <path key={x} class="hb-rib" d={`M${x} ${archY(x)} V300`} />)}
        {[0, 34, 68].map((l) => <path key={l} class={l ? 'hb-rib' : 'hb-arch'} d={HB_ARCH(l)} />)}
        <rect class="hb-pillar" x="0" y="100" width="7" height="200" />
        <rect class="hb-pillar" x="393" y="100" width="7" height="200" />
      </svg>
      <span class="clock-z hb-clock"><i /></span>
      <div class="hb-board">
        <b>Zürich HB<small>Abfahrt</small></b>
        <span><i>IC 1</i>Genève-Aéroport<em>7</em></span>
        <span><i>IR 70</i>Luzern<em>12</em></span>
        <span><i>EC</i>Milano Centrale<em>9</em></span>
      </div>
    </div>
  );
}

/** Zug: Fahrt durch die Alpen im Fokus, Halt an einem Bahnhof (kurze Pause) oder im Hauptbahnhof (lange Pause) */
export function ZugScene({ station }: { station: string }) {
  return (
    <Deco>
      <div class="sky-z" />
      <svg class="alps" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={ALPS} /><path class="snow" d={SNOW} /></svg>
      <svg class="peaks" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={PEAKS} /></svg>
      <svg class="hills" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={HILLS} /></svg>
      <svg class="firs" viewBox="0 0 800 40" preserveAspectRatio="none"><path d={FIRS} /></svg>
      <div class="poles">{many(3)}</div>
      <Station name={station} />
      <MainStation />
      <div class="rails"><i class="sleepers" /><i class="rail" /><i class="rail" /></div>
      <Train />
      <div class="steam">{many(6)}</div>
    </Deco>
  );
}
