/**
 * Stil Baustelle: Turmdrehkran mit schwingender Last, Rohbau mit Gerüst, Bagger, Kipplaster, Bauarbeiter und
 * ein Elektriker am Baustromverteiler. Nach jeder geschafften Session bekommt er einen Stromschlag
 * (Röntgenblitz, Funken, Rauch). Alles liegt im DOM, CSS steuert die Phasen.
 */
import { celebration, flashMood } from '../../app/timer/view';

const many = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

/** Gitterstück (Kranmast, Ausleger): zwei Gurte mit Zickzack */
function lattice(x0: number, y0: number, x1: number, y1: number, w: number, n: number): string {
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = (-(y1 - y0) / len) * w, ny = ((x1 - x0) / len) * w;
  let d = `M${x0} ${y0} L${x1} ${y1} M${x0 + nx} ${y0 + ny} L${x1 + nx} ${y1 + ny}`;
  for (let i = 0; i < n; i++) {
    const ax = x0 + dx * i, ay = y0 + dy * i;
    d += ` M${ax} ${ay} L${ax + dx + nx} ${ay + dy + ny} L${ax + dx} ${ay + dy}`;
  }
  return d;
}

function Crane({ far = false }: { far?: boolean }) {
  return (
    <svg class={`bs-crane${far ? ' is-far' : ''}`} viewBox="0 0 300 260">
      <path class="bc-mast" d={lattice(90, 258, 90, 64, 14, 14)} />
      <rect class="bc-base" x="74" y="250" width="46" height="10" />
      <g class="bc-slew">
        <path class="bc-tie" d="M97 30 L20 62 M97 30 L290 62" />
        <path class="bc-apex" d="M90 64 L97 30 L104 64" />
        <path class="bc-jib" d={lattice(104, 64, 296, 64, 8, 16)} />
        <path class="bc-counter" d={lattice(16, 64, 90, 64, 8, 5)} />
        <rect class="bc-weight" x="18" y="70" width="14" height="22" /><rect class="bc-weight" x="34" y="70" width="14" height="22" />
        <rect class="bc-cab" x="90" y="66" width="22" height="16" rx="2" />
        <rect class="bc-cabwin" x="100" y="69" width="10" height="8" rx="1" />
        <circle class="bc-beacon" cx="97" cy="28" r="3" />
        <g class="bc-trolley">
          <rect class="bc-car" x="-7" y="70" width="14" height="5" />
          <g class="bc-load">
            <line class="bc-cable" x1="0" y1="75" x2="0" y2="150" />
            <path class="bc-hook" d="M-4 150 H4 V156 Q4 162 0 162 Q-4 162 -4 158" />
            <path class="bc-sling" d="M0 158 L-26 172 M0 158 L26 172" />
            <rect class="bc-beam" x="-34" y="172" width="68" height="9" />
            <path class="bc-beam-web" d="M-34 176.5 H34" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function Building() {
  const floors = [0, 1, 2, 3, 4];
  return (
    <svg class="bs-building" viewBox="0 0 200 220" preserveAspectRatio="xMidYMax meet">
      {floors.map((f) => (
        <g key={f} transform={`translate(0 ${200 - f * 38})`}>
          <rect class="bb-slab" x="10" y="-6" width="150" height="6" />
          {[14, 60, 106, 150].map((x) => <rect key={x} class="bb-col" x={x} y="-38" width="7" height="32" />)}
          {f < 3 && [24, 70, 116].map((x) => <rect key={x} class="bb-win" x={x} y="-30" width="26" height="18" />)}
        </g>
      ))}
      <rect class="bb-slab" x="10" y="4" width="150" height="6" />
      <path class="bb-scaffold" d="M164 210 V24 M190 210 V24 M164 200 H190 M164 162 H190 M164 124 H190 M164 86 H190 M164 48 H190 M164 200 L190 162 L164 124 L190 86 L164 48" />
      <rect class="bb-net" x="164" y="24" width="26" height="186" />
      <path class="bb-rebar" d="M14 10 V-30 M60 10 V-24 M106 10 V-34" transform="translate(0 0)" />
    </svg>
  );
}

function Excavator() {
  return (
    <svg class="bs-excavator" viewBox="0 0 170 110">
      <rect class="bx-track" x="20" y="84" width="96" height="20" rx="10" />
      {[30, 50, 70, 90, 106].map((x) => <circle key={x} class="bx-wheel" cx={x} cy="94" r="6" />)}
      <path class="bx-body" d="M26 84 V58 H86 L98 70 V84 Z" />
      <path class="bx-cab" d="M30 58 V30 H62 L66 58 Z" />
      <path class="bx-glass" d="M35 54 V35 H58 L61 54 Z" />
      <rect class="bx-stripe" x="26" y="74" width="72" height="4" />
      <g class="bx-boom">
        <path class="bx-arm" d="M84 62 L124 22 L132 28 L94 68 Z" />
        <g class="bx-stick">
          <path class="bx-arm" d="M126 24 L158 54 L152 60 L122 32 Z" />
          <g class="bx-bucket"><path class="bx-scoop" d="M150 52 L168 58 L162 76 L146 70 Z M162 76 L166 80 M156 74 L158 79 M150 72 L151 77" /></g>
        </g>
      </g>
    </svg>
  );
}

function Truck() {
  return (
    <div class="bs-truck">
      <svg viewBox="0 0 150 76">
        <path class="bt-bed" d="M6 18 H90 L84 48 H12 Z" />
        <path class="bt-load" d="M10 18 Q30 2 50 10 Q70 0 88 18 Z" />
        <rect class="bt-chassis" x="6" y="48" width="134" height="8" />
        <path class="bt-cab" d="M96 20 H124 Q132 20 136 30 L142 42 V50 H96 Z" />
        <path class="bt-window" d="M104 24 H122 Q127 24 130 32 L133 38 H104 Z" />
        <rect class="bt-light" x="138" y="42" width="5" height="4" />
        <path class="bt-stripe" d="M96 46 H142" />
        {[26, 54, 118].map((x) => (
          <g key={x} transform={`translate(${x} 58)`}><g class="bt-wheel"><circle r="11" /><circle class="bt-hub" r="4.5" /><path class="bt-spoke" d="M0 -9 V9 M-9 0 H9" /></g></g>
        ))}
      </svg>
      <div class="bs-dust">{many(5)}</div>
    </div>
  );
}

/** Bauarbeiter mit Helm und Warnweste; Laufzyklus über CSS */
function Worker({ cls, vest = '#ff6b00', carry = false }: { cls: string; vest?: string; carry?: boolean }) {
  return (
    <svg class={`bs-walker ${cls}`} viewBox="-20 -46 40 92" style={{ '--vest': vest }}>
      <g class="bw-leg bw-leg-b"><path d="M2 14 L4 36" /><path class="bw-boot" d="M2 36 H10" /></g>
      <g class="bw-arm bw-arm-b"><path d="M2 -12 L6 6" /></g>
      <path class="bw-pants" d="M-6 8 H8 V18 H-6 Z" />
      <path class="bw-vest" d="M-8 -16 H9 L8 10 H-7 Z" />
      <path class="bw-reflect" d="M-7.6 -6 H8.6 M-7.3 2 H8.3" />
      <g class="bw-leg bw-leg-f"><path d="M-2 14 L-4 36" /><path class="bw-boot" d="M-4 36 H4" /></g>
      <circle class="bw-face" cx="1" cy="-23" r="7" />
      <path class="bw-helmet" d="M-8 -24 Q-8 -34 1 -34 Q10 -34 10 -24 H13 V-22 H-8 Z" />
      <g class="bw-arm bw-arm-f"><path d="M-2 -12 L-6 6" /></g>
      {carry && <rect class="bw-plank" x="-22" y="-44" width="46" height="4" rx="1" transform="rotate(-6)" />}
    </svg>
  );
}

/**
 * Elektriker am Verteiler. Mit `zap` zuckt er: Röntgenblitz (Skelett), Haare stehen, Helm fliegt, Funken und Rauch.
 * Wird auch in der Feier gross gezeigt.
 */
export function Electrician({ zap = false, box = true }: { zap?: boolean; box?: boolean }) {
  return (
    <svg class={`bs-elec${zap ? ' is-zapped' : ''}`} viewBox="-60 -70 130 140">
      {box && (
        <g class="be-box">
          <rect class="be-cab" x="22" y="-14" width="40" height="58" rx="3" />
          <rect class="be-door" x="26" y="-10" width="32" height="26" rx="2" />
          <circle class="be-sock" cx="32" cy="28" r="4" /><circle class="be-sock" cx="44" cy="28" r="4" /><circle class="be-sock" cx="56" cy="28" r="4" />
          <path class="be-warn" d="M42 -6 L50 8 H34 Z" />
          <path class="be-bolt" d="M43 -3 L40 3 H43 L41 7 L46 1 H43 L45 -3 Z" />
          <path class="be-cable" d="M32 32 C30 50 10 52 -10 62 M56 32 C60 50 70 56 70 66" />
          <rect class="be-leg" x="26" y="44" width="4" height="22" /><rect class="be-leg" x="54" y="44" width="4" height="22" />
        </g>
      )}
      <g class="be-man">
        <g class="be-body">
          <path class="be-boot" d="M-20 62 H-8 V56 H-18 Z M-2 62 H10 V56 H0 Z" />
          <path class="be-pants" d="M-18 22 H8 L10 57 H0 L-4 32 L-8 57 H-18 Z" />
          <path class="be-vest" d="M-20 -14 H10 L12 24 H-20 Z" />
          <path class="be-reflect" d="M-19.5 0 H10.6 M-19.6 12 H11.2" />
          <rect class="be-belt" x="-20" y="20" width="31" height="5" />
          <rect class="be-pouch" x="-18" y="24" width="8" height="9" rx="1" />
          <path class="be-arm" d="M4 -10 L20 2 L26 -2" />
          <path class="be-arm be-arm-back" d="M-18 -8 L-24 10 L-20 18" />
          <path class="be-tool" d="M24 -3 L33 -6" />
          <circle class="be-face" cx="-4" cy="-26" r="12" />
          <path class="be-soot" d="M-13 -22 Q-4 -14 6 -22 Q2 -30 -4 -30 Q-10 -30 -13 -22 Z" />
          <g class="be-eyes"><circle cx="-8" cy="-27" r="1.6" /><circle cx="1" cy="-27" r="1.6" /></g>
          <path class="be-xeyes" d="M-10 -29 L-6 -25 M-6 -29 L-10 -25 M-1 -29 L3 -25 M3 -29 L-1 -25" />
          <path class="be-mouth" d="M-7 -20 Q-4 -18 -1 -20" />
          <path class="be-hair" d="M-14 -32 L-18 -48 M-9 -36 L-10 -54 M-3 -37 L-2 -56 M3 -36 L7 -53 M8 -32 L14 -46" />
        </g>
        <g class="be-skeleton">
          <circle class="bk-skull" cx="-4" cy="-26" r="10" />
          <circle class="bk-hole" cx="-8" cy="-27" r="2.6" /><circle class="bk-hole" cx="0" cy="-27" r="2.6" />
          <path class="bk-bone" d="M-4 -16 V22 M-14 -8 Q-4 -4 6 -8 M-14 -2 Q-4 2 6 -2 M-14 4 Q-4 8 6 4 M-14 10 Q-4 14 6 10 M-14 22 H6 M-12 22 L-14 56 M2 22 L4 56 M4 -10 L20 2 L26 -2 M-12 -10 L-24 10 L-20 18" />
        </g>
        <path class="be-helmet" d="M-17 -30 Q-17 -44 -4 -44 Q9 -44 9 -30 H13 V-27 H-17 Z" />
      </g>
      <g class="be-sparks">{[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d="M0 0 L3 -9 L5 -2 L12 -6 L6 2 L10 8 L2 4 L-3 10 L-1 2 L-9 2 Z" style={{ '--i': i }} />)}</g>
      <g class="be-smoke">{[0, 1, 2].map((i) => <circle key={i} cx={-6 + i * 6} cy="-40" r="7" style={{ '--i': i }} />)}</g>
    </svg>
  );
}

const SKYLINE = 'M0 100 V70 H18 V52 H34 V64 H46 V40 H60 V58 H74 V48 H92 V66 H104 V30 H112 V22 H120 V30 H128 V60 H146 V44 H162 V68 H178 V56 H196 V38 H214 V62 H232 V50 H252 V70 H268 V46 H284 V60 H300 V36 H316 V64 H334 V54 H352 V70 H372 V48 H388 V66 H400 V100 Z';

export function BaustelleScene() {
  // Nach einer gespeicherten Session (Feier) bekommt der Elektriker seinen Schlag; key spielt die Animation neu ab
  const n = celebration.value;
  const zap = n > 0 && flashMood.value === 'yay';
  return (
    <div class="deco" aria-hidden="true">
      <div class="bs-sky" />
      <i class="bs-sun" />
      <div class="bs-clouds">{many(3)}</div>
      <Crane far />
      <svg class="bs-city" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice"><path d={SKYLINE} /></svg>
      <Building />
      <Crane />
      <div class="bs-lights">{many(2)}</div>
      <Excavator />
      <div class="bs-workers">
        <Worker cls="w1" carry />
        <Worker cls="w2" vest="#ffd400" />
      </div>
      <div class="bs-break">
        <svg viewBox="0 0 120 60">
          <rect class="bk-bench" x="8" y="40" width="104" height="6" rx="2" />
          <path class="bk-steam" d="M40 18 q-4 -5 0 -10 M78 18 q-4 -5 0 -10" />
          <rect class="bk-cup" x="36" y="22" width="8" height="10" rx="2" /><rect class="bk-cup" x="74" y="22" width="8" height="10" rx="2" />
          <path class="bk-sandwich" d="M50 34 H66 L62 30 H54 Z" />
        </svg>
      </div>
      <div class="bs-elec-wrap">
        <div key={zap ? `z${n}` : 'idle'} class="bs-elec-anim"><Electrician zap={zap} /></div>
        <div class="bs-sparks">{many(4)}</div>
      </div>
      <Truck />
      <div class="bs-ground" />
      <div class="bs-tape" />
      <div class="bs-cones">{many(3)}</div>
    </div>
  );
}

/** Begleiter: Der Rohbau wächst Stockwerk um Stockwerk; der Kran setzt gerade das nächste */
export function RohbauMeter({ p }: { p: number }) {
  const q = Math.max(0, Math.min(1, p));
  const N = 8;
  const exact = q * N;
  const done = Math.min(N, Math.floor(exact + 1e-6));
  const part = done >= N ? 0 : exact - done;
  const floorH = 8;
  const top = 86 - done * floorH;
  const hookY = 10 + part * (top - floorH - 10);
  return (
    <div class="rohbau-row" aria-hidden="true">
      <svg class="rohbau" viewBox="0 0 200 92">
        <rect class="rb-ground" x="0" y="86" width="200" height="6" />
        {Array.from({ length: done }, (_, i) => (
          <g key={i}>
            <rect class="rb-floor" x="40" y={86 - (i + 1) * floorH} width="70" height={floorH - 1.5} />
            {[48, 64, 80, 96].map((x) => <rect key={x} class="rb-win" x={x} y={86 - (i + 1) * floorH + 2} width="8" height={floorH - 5} />)}
          </g>
        ))}
        <path class="rb-crane" d="M160 86 V6 M150 6 H196 M160 6 L196 6 M160 16 L196 6 M150 6 L160 16" />
        {done < N && (
          <g>
            <line class="rb-cable" x1="75" y1="6" x2="75" y2={hookY} />
            <rect class="rb-floor is-next" x="40" y={hookY} width="70" height={floorH - 1.5} />
          </g>
        )}
        <path class="rb-jib" d="M60 6 H196" />
      </svg>
      <p class="meter-text"><b>{done >= N ? 'Aufrichte!' : `Stock ${done + 1} von ${N}`}</b><span>Rohbau</span></p>
    </div>
  );
}
