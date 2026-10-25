/**
 * Szenen der Stile Meer, Flora, Sci-Fi, Elemente und Zug (Hintergrund der Timer-Karte und Ebene hinter dem
 * Zifferblatt). Wie in SkinDecor: alles liegt im DOM, CSS blendet je Phase ein und startet Animationen.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';

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
const CLOUD = 'M14 44 C2 44 0 30 12 28 C10 16 26 10 34 18 C38 6 58 4 64 16 C72 8 90 12 90 26 C104 24 112 36 104 44 Z';
const HILLS = 'M0 66 Q100 40 200 66 T400 66 T600 66 T800 66 V80 H0 Z';
/** Tannen in Reihe: Höhe je Baum leicht verschieden, Periode 400 */
const FIRS = [0, 400].flatMap((o) => Array.from({ length: 16 }, (_, i) => {
  const x = o + i * 25 + (i % 3) * 4;
  const h = 16 + ((i * 7) % 5) * 4;
  return `M${x - 7} 40 L${x} ${40 - h} L${x + 7} 40 Z`;
})).join(' ');

/**
 * SBB-Bahnhofsuhr: weisses Zifferblatt, schwarze Balken, schwarze Zeiger mit der echten Uhrzeit und die rote
 * Kelle. Wie im Original läuft die Kelle in 58,5 Sekunden einmal herum, wartet oben, und der Minutenzeiger
 * springt dann weiter. Alles per CSS-Animation, gestartet mit der aktuellen Zeit (kein Takt im JS).
 */
export function SbbClock({ class: cls = '', hands = true }: { class?: string; hands?: boolean }) {
  const delays = useMemo(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() * 60 + s;
    const h = (d.getHours() % 12) * 3600 + m;
    // Startlage auch als feste Drehung: gilt, wenn Bewegung aus ist und die Animation nicht läuft
    return {
      h: { animationDelay: `-${h.toFixed(1)}s`, transform: `rotate(${(h / 120).toFixed(2)}deg)` },
      m: { animationDelay: `-${m.toFixed(1)}s`, transform: `rotate(${Math.floor(m / 60) * 6}deg)` },
      s: { animationDelay: `-${s.toFixed(2)}s`, transform: `rotate(${Math.min(360, (s / 58.5) * 360).toFixed(1)}deg)` },
    };
  }, []);
  return (
    <svg class={`sbb ${cls}`} viewBox="0 0 200 200" aria-hidden="true">
      <circle class="sbb-face" cx="100" cy="100" r="97" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        return <rect key={i} class="sbb-mark" x={big ? 96.6 : 98.8} y={big ? 8 : 8} width={big ? 6.8 : 2.4} height={big ? 25 : 7.5} transform={`rotate(${i * 6} 100 100)`} />;
      })}
      {hands && (
        <>
          <path class="sbb-hand sbb-h" style={delays.h} d="M95.4 118 L96.2 42 L103.8 42 L104.6 118 Z" />
          <path class="sbb-hand sbb-m" style={delays.m} d="M96.4 120 L97.2 16 L102.8 16 L103.6 120 Z" />
        </>
      )}
      <g class="sbb-s" style={delays.s}>
        <rect class="sbb-red" x="98.8" y="38" width="2.4" height="92" />
        <circle class="sbb-red" cx="100" cy="38" r="10" />
      </g>
      <circle class="sbb-red" cx="100" cy="100" r="2.6" />
    </svg>
  );
}

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
      <SbbClock class="clock-z" />
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
      <SbbClock class="clock-z hb-clock" />
      <div class="hb-board">
        <b>Zürich HB<small>Abfahrt</small></b>
        <span><i>IC 1</i>Genève-Aéroport<em>7</em></span>
        <span><i>IR 70</i>Luzern<em>12</em></span>
        <span><i>EC</i>Milano Centrale<em>9</em></span>
      </div>
    </div>
  );
}

/**
 * Zug: Fahrt durch die Alpen im Fokus, Halt an einem Bahnhof (kurze Pause) oder im Hauptbahnhof (lange Pause).
 * Der Zug fährt mit dem Fortschritt (p 0..1) über die Karte und steht in der Pause am Bahnsteig rechts;
 * beginnt die nächste Fahrt, steht er wieder vorne (neuer Schlüssel: kein Zurückgleiten).
 */
export function ZugScene({ station, p, stage }: { station: string; p: number; stage: string }) {
  return (
    <Deco>
      <div class="sky-day" />
      <div class="sun-z"><i /></div>
      <div class="clouds-z">{[0, 1, 2, 3, 4].map((i) => <svg key={i} viewBox="0 0 120 50"><path d={CLOUD} /></svg>)}</div>
      <div class="sky-night"><i class="moon-z" /></div>
      <div class="sky-z" />
      <svg class="alps" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={ALPS} /><path class="snow" d={SNOW} /></svg>
      <svg class="peaks" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={PEAKS} /></svg>
      <svg class="hills" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={HILLS} /></svg>
      <svg class="firs" viewBox="0 0 800 40" preserveAspectRatio="none"><path d={FIRS} /></svg>
      <div class="poles">{many(3)}</div>
      <Station name={station} />
      <MainStation />
      <div class="rails"><i class="sleepers" /><i class="rail" /><i class="rail" /></div>
      <div key={stage} class="z-consist" style={{ '--zp': Math.min(1, Math.max(0, p)).toFixed(4) }}>
        <Train />
        <div class="steam">{many(6)}</div>
      </div>
    </Deco>
  );
}

/* ---------- Weihnachten ---------- */

/** Geschmückter Tannenbaum mit Stern, blinkenden Kugeln und Geschenken */
function XmasTree() {
  const balls: [number, number, string][] = [[50, 34, '#e63946'], [38, 52, '#ffd166'], [62, 50, '#4cc9f0'], [30, 72, '#ffd166'], [50, 66, '#e63946'], [70, 74, '#c77dff'], [42, 88, '#4cc9f0'], [60, 92, '#e63946'], [24, 96, '#c77dff'], [76, 98, '#ffd166']];
  return (
    <svg class="xm-tree" viewBox="0 0 100 130">
      <rect class="xm-trunk" x="45" y="108" width="10" height="12" />
      {([[50, 8, 22, 40], [50, 28, 32, 66], [50, 50, 42, 92], [50, 72, 50, 112]] as const).map(([x, top, half, bottom], i) => (
        <path key={i} class="xm-fir" d={`M${x} ${top} L${x + half} ${bottom} Q${x} ${bottom + 6} ${x - half} ${bottom} Z`} />
      ))}
      <path class="xm-tinsel" d="M34 48 Q52 58 66 44 M26 70 Q50 82 74 66 M18 92 Q50 106 82 90" />
      {balls.map(([x, y, c], i) => <circle key={i} class="xm-ball" cx={x} cy={y} r="3.6" style={{ '--c': c, '--i': i }} />)}
      <path class="xm-star" d="M50 -1 L53 7 L61 7 L55 12 L57 20 L50 15 L43 20 L45 12 L39 7 L47 7 Z" />
      <g class="xm-gifts">
        <rect x="18" y="112" width="18" height="14" fill="#c8102e" /><rect x="25.5" y="112" width="3" height="14" fill="#ffd166" /><rect x="18" y="117.5" width="18" height="3" fill="#ffd166" />
        <rect x="64" y="108" width="20" height="18" fill="#1b6b3a" /><rect x="72.5" y="108" width="3" height="18" fill="#f1faee" /><rect x="64" y="115.5" width="20" height="3" fill="#f1faee" />
        <rect x="40" y="118" width="14" height="10" fill="#4361ee" /><rect x="45.5" y="118" width="3" height="10" fill="#ffd166" />
      </g>
    </svg>
  );
}

/** Kranz aus Tannengrün mit Kugeln und Schleife hinter dem Zifferblatt */
export function XmasWreath() {
  return (
    <svg class="xm-wreath" viewBox="0 0 320 320">
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        const r = 146 + (i % 3) * 3;
        const x = 160 + r * Math.sin(a);
        const y = 160 - r * Math.cos(a);
        return <ellipse key={i} class={i % 2 ? 'xw-needle' : 'xw-needle dark'} cx={x} cy={y} rx="12" ry="4.5" transform={`rotate(${(i / 48) * 360 + (i % 2 ? 30 : -30)} ${x} ${y})`} />;
      })}
      {Array.from({ length: 10 }, (_, i) => {
        const a = ((i + 0.5) / 10) * Math.PI * 2;
        return <circle key={`b${i}`} class="xw-ball" cx={160 + 150 * Math.sin(a)} cy={160 - 150 * Math.cos(a)} r="6" style={{ '--c': ['#e63946', '#ffd166', '#f1faee'][i % 3], '--i': i }} />;
      })}
      <path class="xw-bow" d="M160 312 L140 298 Q134 312 142 320 Z M160 312 L180 298 Q186 312 178 320 Z M160 312 L150 334 L156 334 Z M160 312 L170 334 L164 334 Z" />
      <circle class="xw-bow" cx="160" cy="312" r="5" />
    </svg>
  );
}

const SNOW_HILLS = 'M0 80 V52 Q60 34 120 48 T240 44 T360 50 T480 42 T600 50 T720 44 T800 48 V80 Z';

export function WeihnachtScene() {
  return (
    <Deco>
      <div class="xm-sky" />
      <i class="xm-moon" />
      <svg class="xm-hills" viewBox="0 0 800 80" preserveAspectRatio="none"><path d={SNOW_HILLS} /></svg>
      <div class="xm-houses">
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 40 40"><path class="xh-wall" d="M6 18 H34 V38 H6 Z" /><path class="xh-roof" d="M2 20 L20 4 L38 20 Z" /><rect class="xh-win" x="11" y="24" width="7" height="7" /><rect class="xh-win" x="23" y="24" width="7" height="7" /><path class="xh-snow" d="M2 20 L20 4 L38 20 L34 20 L20 8 L6 20 Z" /></svg>
        ))}
      </div>
      <div class="xm-garland">{many(16)}</div>
      <XmasTree />
      <div class="xm-sleigh">
        <svg viewBox="0 0 160 40">
          {[0, 1, 2].map((k) => (
            <g key={k} class="xm-deer" transform={`translate(${96 + k * 22} 14)`}>
              <path d="M0 6 Q4 0 12 1 L14 -4 L16 1 Q18 2 18 5 L16 6 L15 12 L13 12 L12 7 L4 8 L3 13 L1 13 Z" />
              <path class="xm-antler" d="M14 -4 L12 -10 M14 -4 L17 -9 M12 -8 L10 -10" />
              {k === 2 && <circle class="xm-nose" cx="18" cy="5" r="1.8" />}
            </g>
          ))}
          <path class="xm-rein" d="M70 22 Q90 18 100 20 Q120 22 142 18" />
          <path class="xm-sled" d="M24 14 H62 Q72 14 72 24 Q72 30 62 30 H24 Z M18 34 H70 Q78 34 78 28 L76 28 Q76 32 70 32 H18 Z" />
          <circle class="xm-santa" cx="44" cy="10" r="7" />
          <path class="xm-hat" d="M37 7 Q44 -6 52 6 Z" />
          <rect class="xm-sack" x="26" y="4" width="12" height="12" rx="4" />
        </svg>
      </div>
      <div class="xm-cabin">
        <svg viewBox="0 0 90 70">
          <path class="xc-smoke" d="M66 4 q-6 -4 0 -8 q6 -4 0 -8" />
          <rect class="xc-chimney" x="60" y="10" width="10" height="16" />
          <path class="xc-wall" d="M10 30 H80 V68 H10 Z" />
          <path class="xc-roof" d="M2 34 L45 6 L88 34 Z" />
          <path class="xc-roofsnow" d="M2 34 L45 6 L88 34 L82 34 L45 12 L8 34 Z" />
          <rect class="xc-door" x="40" y="46" width="12" height="22" rx="2" />
          <rect class="xc-win" x="18" y="42" width="14" height="12" /><rect class="xc-win" x="60" y="42" width="14" height="12" />
          <path class="xc-wreath" d="M46 40 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0" />
        </svg>
      </div>
      <div class="xm-snow">{many(34)}</div>
      <div class="xm-ground" />
    </Deco>
  );
}

/* ---------- Halloween ---------- */

/** Spinnennetz hinter dem Zifferblatt */
export function SpiderWeb() {
  return (
    <svg class="hw-web" viewBox="0 0 320 320">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1="160" y1="160" x2={160 + 158 * Math.cos(a)} y2={160 + 158 * Math.sin(a)} />;
      })}
      {[40, 66, 92, 118, 144].map((r) => (
        <path key={r} d={Array.from({ length: 13 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const rr = r * (i % 2 ? 0.93 : 1);
          return `${i ? 'L' : 'M'}${(160 + rr * Math.cos(a)).toFixed(1)} ${(160 + rr * Math.sin(a)).toFixed(1)}`;
        }).join(' ')} />
      ))}
    </svg>
  );
}

/** Kürbis mit geschnitztem Gesicht, flackerndes Licht innen */
function Pumpkin({ size }: { size: number }) {
  return (
    <svg class="hw-pumpkin" viewBox="0 0 60 52" style={{ width: `${size}px` }}>
      <path class="hp-stem" d="M28 8 Q27 2 32 0 L34 2 Q31 4 32 9 Z" />
      <ellipse class="hp-body" cx="30" cy="30" rx="27" ry="21" />
      <ellipse class="hp-rib" cx="30" cy="30" rx="10" ry="21" />
      <ellipse class="hp-rib" cx="30" cy="30" rx="19" ry="21" />
      <path class="hp-face" d="M16 22 L22 16 L26 24 Z M44 22 L38 16 L34 24 Z M28 28 L30 24 L32 28 Z M14 32 Q30 46 46 32 L42 34 L40 38 L36 35 L33 40 L30 36 L27 40 L24 35 L20 38 L18 34 Z" />
    </svg>
  );
}

const HAUNT = 'M0 80 V58 Q80 40 160 50 L200 50 L200 30 L214 30 L214 18 L222 6 L230 18 L230 30 L260 30 L260 22 L268 12 L276 22 L276 30 L286 30 L286 50 Q360 46 420 54 Q520 44 600 56 Q700 48 800 54 V80 Z';

export function HalloweenScene() {
  return (
    <Deco>
      <div class="hw-sky" />
      <i class="hw-moon" />
      <svg class="hw-hill" viewBox="0 0 800 80" preserveAspectRatio="xMidYMax slice">
        <path d={HAUNT} />
        {([[206, 36], [236, 36], [266, 36], [212, 22], [270, 26]] as const).map(([x, y], i) => <rect key={i} class="hw-window" x={x} y={y} width="6" height="7" style={{ '--i': i }} />)}
        <path class="hw-tree" d="M80 50 L84 26 L76 18 M84 26 L92 16 M83 34 L72 30 M84 30 L96 26" />
        {([[440, 52], [470, 50], [500, 53], [640, 54]] as const).map(([x, y], i) => <path key={i} class="hw-grave" d={`M${x} ${y} V${y - 10} Q${x + 6} ${y - 18} ${x + 12} ${y - 10} V${y} Z`} />)}
      </svg>
      <div class="hw-bats">{[0, 1, 2, 3, 4].map((i) => <svg key={i} viewBox="-16 -10 32 20"><path d="M0 -3 Q3 -6 5 -2 Q9 -9 16 -9 Q13 -5 15 -1 Q11 -2 10 2 Q7 -1 5 3 Q2 6 0 9 Q-2 6 -5 3 Q-7 -1 -10 2 Q-11 -2 -15 -1 Q-13 -5 -16 -9 Q-9 -9 -5 -2 Q-3 -6 0 -3 Z" /></svg>)}</div>
      <div class="hw-ghosts">{[0, 1].map((i) => <svg key={i} viewBox="0 0 40 50"><path d="M4 22 Q4 2 20 2 Q36 2 36 22 V46 L31 41 L26 46 L20 41 L14 46 L9 41 L4 46 Z" /><circle cx="14" cy="20" r="3" /><circle cx="26" cy="20" r="3" /><ellipse cx="20" cy="30" rx="3" ry="4" /></svg>)}</div>
      <div class="hw-fog"><i /><i /><i /></div>
      <div class="hw-pumpkins"><Pumpkin size={54} /><Pumpkin size={38} /><Pumpkin size={46} /></div>
    </Deco>
  );
}

/**
 * Halloween: Spinne am Faden zum Anfassen. Nach unten ziehen und loslassen: sie federt hoch. Nach oben schieben
 * und loslassen: sie fällt, fängt sich am Faden und klettert zurück an ihren Platz. Seitlich gezogen pendelt sie aus.
 */
export function SpiderToy({ phase, still }: { phase: string; still: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const s = useRef({ L: 60, v: 0, x: 0, vx: 0, mode: 'idle' as 'idle' | 'drag' | 'spring' | 'fall' | 'catch' | 'climb', catchAt: 0, t: 0, py: 0, px: 0, grab: 0 });

  useEffect(() => {
    const el = wrap.current!;
    const card = el.parentElement!;
    let raf = 0;
    let last = performance.now();
    const restFor = (H: number, t: number) => (phaseRef.current === 'short_break' ? H * (0.36 + Math.sin(t * 0.5) * 0.06) : phaseRef.current === 'long_break' ? H * 0.22 : H * 0.14);
    const frame = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const st = s.current;
      st.t += dt;
      const H = card.clientHeight;
      const rest = restFor(H, st.t);
      if (st.mode === 'drag') {
        const r = card.getBoundingClientRect();
        st.L = Math.max(16, Math.min(H * 0.9, st.py - r.top - st.grab));
        const anchor = r.left + r.width * 0.78;
        st.x = Math.max(-80, Math.min(80, st.px - anchor));
      } else {
        if (st.mode === 'idle') { st.L += (rest - st.L) * Math.min(1, dt * 1.5); }
        else if (st.mode === 'spring') {
          st.v += (-(st.L - rest) * 70 - st.v * 4.2) * dt;
          st.L += st.v * dt;
          if (Math.abs(st.L - rest) < 0.6 && Math.abs(st.v) < 6) st.mode = 'idle';
        } else if (st.mode === 'fall') {
          st.v += 1700 * dt;
          st.L += st.v * dt;
          if (st.L >= st.catchAt) { st.mode = 'catch'; st.t = 0; }
        } else if (st.mode === 'catch') {
          // der Faden fängt sie auf: kurz nachfedern
          st.v += (-(st.L - st.catchAt) * 120 - st.v * 6) * dt;
          st.L += st.v * dt;
          if (st.t > 0.7) { st.mode = 'climb'; st.v = 0; }
        } else if (st.mode === 'climb') {
          st.L -= 46 * dt;
          if (st.L <= rest) { st.L = rest; st.mode = 'idle'; }
        }
        st.vx += (-st.x * 28 - st.vx * 2.2) * dt;
        st.x += st.vx * dt;
      }
      const bob = st.mode === 'idle' && !still ? Math.sin(st.t * 1.6) * 2 : 0;
      const L = st.L + bob;
      const angle = Math.atan2(st.x, Math.max(20, L)) * (180 / Math.PI);
      el.style.setProperty('--len', `${Math.hypot(L, st.x).toFixed(1)}px`);
      el.style.setProperty('--ang', `${(-angle).toFixed(2)}deg`);
      el.dataset.mode = st.mode;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  const release = () => {
    const st = s.current;
    if (st.mode !== 'drag') return;
    const H = wrap.current!.parentElement!.clientHeight;
    const rest = phaseRef.current === 'short_break' ? H * 0.36 : phaseRef.current === 'long_break' ? H * 0.22 : H * 0.14;
    st.v = 0;
    if (st.L < rest - 6) { st.mode = 'fall'; st.catchAt = rest + Math.max(40, (rest - st.L) * 0.6); }
    else st.mode = 'spring';
  };

  return (
    <div class="spider-toy" ref={wrap} aria-hidden="true">
      <div class="spider-arm">
        <i class="spider-thread" />
        <button
          type="button" class="spider-body" tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const st = s.current;
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            st.grab = e.clientY - (r.top + r.height * 0.35);
            st.py = e.clientY;
            st.px = e.clientX;
            st.mode = 'drag';
          }}
          onPointerMove={(e) => { if (s.current.mode === 'drag') { s.current.py = e.clientY; s.current.px = e.clientX; } }}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <svg viewBox="-30 -24 60 52">
            <g class="sp-legs">
              {[-1, 1].map((side) => [0, 1, 2, 3].map((k) => (
                <path key={`${side}${k}`} class={`sp-leg l${k}`} d={`M${side * 5} ${-2 + k * 3} L${side * (15 + k)} ${-12 + k * 6} L${side * (24 + k * 0.5)} ${-2 + k * 7}`} />
              )))}
            </g>
            <ellipse class="sp-abdomen" cx="0" cy="9" rx="10" ry="12" />
            <path class="sp-mark" d="M0 3 L3 8 L0 13 L-3 8 Z" />
            <circle class="sp-head" cx="0" cy="-6" r="6.5" />
            <circle class="sp-eye" cx="-2.4" cy="-7" r="1.4" /><circle class="sp-eye" cx="2.4" cy="-7" r="1.4" />
            <ellipse class="sp-shine" cx="-3.5" cy="4" rx="2.5" ry="4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
