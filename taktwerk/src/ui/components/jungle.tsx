/**
 * Stil Dschungel: Blätterwald in drei Ebenen, Lianen, und Tiere, die sich verstecken und nur zeitweise zeigen:
 * ein Tiger hinter dem Busch, eine Schlange an der Liane, ein Affe im Blätterdach, ein Tukan auf dem Ast,
 * Papageien im Flug, nachts Glühwürmchen und leuchtende Augen. Alles liegt im DOM, CSS steuert je Phase.
 */

const many = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

/** Lanzettliches Blatt mit Mittelrippe, Spitze bei (len, 0) */
const leaf = (len: number, w: number) =>
  `M0 0 C${len * 0.25} ${-w} ${len * 0.7} ${-w * 0.9} ${len} 0 C${len * 0.7} ${w * 0.9} ${len * 0.25} ${w} 0 0 Z`;

/** Fächer aus Blättern um einen Punkt (Busch, Palmwedel) */
function Fan({ x, y, leaves, cls }: { x: number; y: number; leaves: [number, number, number][]; cls: string }) {
  return (
    <g class={cls} transform={`translate(${x} ${y})`}>
      {leaves.map(([rot, len, w], i) => (
        <g key={i} transform={`rotate(${rot})`}>
          <path d={leaf(len, w)} />
          <path class="dj-rib" d={`M2 0 Q${len * 0.5} ${-w * 0.08} ${len * 0.96} 0`} />
        </g>
      ))}
    </g>
  );
}

/** Monstera-Blatt mit Schlitzen und Löchern */
function Monstera({ x, y, s, rot, cls }: { x: number; y: number; s: number; rot: number; cls: string }) {
  return (
    <g class={cls} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 0 C-8 -18 -34 -30 -40 -56 C-46 -84 -24 -104 0 -100 C24 -104 46 -84 40 -56 C34 -30 8 -18 0 0 Z" />
      <path class="dj-cut" d="M-6 -30 L-30 -40 L-26 -46 Z M-4 -50 L-36 -62 L-34 -70 Z M-2 -70 L-30 -86 L-24 -92 Z M6 -30 L30 -40 L26 -46 Z M4 -50 L36 -62 L34 -70 Z M2 -70 L30 -86 L24 -92 Z" />
      <circle class="dj-cut" cx="-14" cy="-58" r="3" /><circle class="dj-cut" cx="14" cy="-58" r="3" /><circle class="dj-cut" cx="-10" cy="-80" r="2.4" /><circle class="dj-cut" cx="10" cy="-80" r="2.4" />
      <path class="dj-rib" d="M0 -2 V-96" />
    </g>
  );
}

/** Ferne Baumkronen als eine Silhouette */
const CANOPY = 'M0 100 V54 Q14 30 32 44 Q40 22 60 34 Q72 14 92 30 Q106 20 118 36 Q132 18 150 32 Q166 10 186 30 Q200 24 210 38 Q226 16 246 32 Q262 22 274 40 Q290 20 310 34 Q324 16 344 30 Q360 22 372 40 Q388 28 400 40 V100 Z';
const CANOPY_TRUNKS = 'M40 100 V60 H44 V100 Z M120 100 V58 H125 V100 Z M210 100 V62 H214 V100 Z M300 100 V56 H305 V100 Z M372 100 V60 H376 V100 Z';

function Liana({ x, len, phase }: { x: string; len: number; phase: number }) {
  const leaves = [0.22, 0.4, 0.58, 0.76].map((t, i) => {
    const y = len * t;
    const side = i % 2 ? 1 : -1;
    return <path key={i} class="dj-lleaf" d={leaf(16, 6)} transform={`translate(${Math.sin(t * 9) * 3} ${y}) rotate(${side > 0 ? 20 : 160})`} />;
  });
  return (
    <svg class="dj-liana" viewBox={`-20 0 40 ${len}`} style={{ left: x, height: `${len}px`, '--d': `${-phase}s` }}>
      <path class="dj-vine" d={`M0 0 C6 ${len * 0.25} -6 ${len * 0.5} 2 ${len * 0.75} S0 ${len * 0.95} 0 ${len}`} />
      {leaves}
    </svg>
  );
}

function Tiger() {
  return (
    <svg class="dj-tiger" viewBox="-50 -50 100 92">
      <g class="dj-tiger-head">
        <circle class="tg-ear" cx="-27" cy="-30" r="12" /><circle class="tg-ear" cx="27" cy="-30" r="12" />
        <circle class="tg-ear-in" cx="-27" cy="-29" r="6.5" /><circle class="tg-ear-in" cx="27" cy="-29" r="6.5" />
        <ellipse class="tg-head" cx="0" cy="0" rx="38" ry="34" />
        <ellipse class="tg-cheek" cx="-17" cy="16" rx="19" ry="14" /><ellipse class="tg-cheek" cx="17" cy="16" rx="19" ry="14" />
        <path class="tg-stripe" d="M-6 -33 L0 -20 L6 -33 Z M-16 -30 L-10 -20 L-12 -31 Z M16 -30 L10 -20 L12 -31 Z M-37 -6 L-24 -2 L-36 2 Z M37 -6 L24 -2 L36 2 Z M-38 8 L-28 9 L-36 14 Z M38 8 L28 9 L36 14 Z M-3 -14 L0 -8 L3 -14 Z" />
        <g class="tg-eyes">
          <ellipse class="tg-eye" cx="-13" cy="-4" rx="7.5" ry="6" /><ellipse class="tg-eye" cx="13" cy="-4" rx="7.5" ry="6" />
          <ellipse class="tg-pupil" cx="-12" cy="-4" rx="1.8" ry="5" /><ellipse class="tg-pupil" cx="14" cy="-4" rx="1.8" ry="5" />
        </g>
        <path class="tg-nose" d="M-6 8 H6 L0 15 Z" />
        <path class="tg-mouth" d="M0 15 V19 M0 19 Q-6 25 -11 21 M0 19 Q6 25 11 21" />
        <path class="tg-whisker" d="M-14 18 L-40 13 M-14 21 L-40 23 M14 18 L40 13 M14 21 L40 23" />
      </g>
    </svg>
  );
}

function Snake() {
  return (
    <svg class="dj-snake" viewBox="-30 0 60 170">
      <path class="sn-body" d="M0 0 C18 20 -18 40 0 62 C18 84 -16 104 2 124 C12 136 8 146 0 150" />
      <path class="sn-pattern" d="M0 0 C18 20 -18 40 0 62 C18 84 -16 104 2 124 C12 136 8 146 0 150" />
      <g class="sn-head" transform="translate(0 154)">
        <path class="sn-tongue" d="M0 10 V20 M0 20 L-3 25 M0 20 L3 25" />
        <ellipse class="sn-skull" cx="0" cy="0" rx="9" ry="12" />
        <circle class="sn-eye" cx="-4.5" cy="-1" r="2.3" /><circle class="sn-eye" cx="4.5" cy="-1" r="2.3" />
        <ellipse class="sn-slit" cx="-4.5" cy="-1" rx="0.7" ry="1.8" /><ellipse class="sn-slit" cx="4.5" cy="-1" rx="0.7" ry="1.8" />
      </g>
    </svg>
  );
}

function Monkey() {
  return (
    <div class="dj-monkey">
      <svg viewBox="-40 0 80 220">
        <path class="mk-rope" d="M0 0 V140" />
        <g class="mk-body" transform="translate(0 140)">
          <path class="mk-tail" d="M6 36 C30 40 34 60 22 66 C14 70 10 62 16 58" />
          <path class="mk-arm" d="M-4 6 L-2 -16 M6 6 L2 -16" />
          <ellipse class="mk-torso" cx="0" cy="24" rx="13" ry="17" />
          <ellipse class="mk-belly" cx="0" cy="27" rx="8" ry="11" />
          <path class="mk-leg" d="M-7 38 L-12 54 M7 38 L12 54" />
          <circle class="mk-ear" cx="-14" cy="2" r="6" /><circle class="mk-ear" cx="14" cy="2" r="6" />
          <circle class="mk-head" cx="0" cy="2" r="12" />
          <path class="mk-face" d="M-8 0 Q-8 -8 0 -6 Q8 -8 8 0 Q10 10 0 12 Q-10 10 -8 0 Z" />
          <circle class="mk-eye" cx="-3.5" cy="-1" r="1.6" /><circle class="mk-eye" cx="3.5" cy="-1" r="1.6" />
          <path class="mk-mouth" d="M-3 6 Q0 9 3 6" />
        </g>
      </svg>
    </div>
  );
}

function Toucan() {
  return (
    <svg class="dj-toucan" viewBox="-40 -40 90 70">
      <path class="tc-branch" d="M-40 22 Q0 16 50 26" />
      <g class="tc-bird">
        <path class="tc-tail" d="M-12 14 L-26 30 L-18 31 L-8 18 Z" />
        <ellipse class="tc-body" cx="-2" cy="2" rx="13" ry="17" />
        <ellipse class="tc-chest" cx="3" cy="-4" rx="7" ry="9" />
        <g class="tc-head">
          <circle class="tc-skull" cx="2" cy="-14" r="9" />
          <path class="tc-beak" d="M8 -18 C24 -22 36 -16 38 -10 C30 -8 18 -8 8 -10 Z" />
          <path class="tc-beak-tip" d="M30 -15 C35 -14 38 -12 38 -10 C34 -9.5 31 -9.5 28 -10 Z" />
          <circle class="tc-eye-ring" cx="4" cy="-15" r="3.4" /><circle class="tc-eye" cx="4.4" cy="-15" r="1.5" />
        </g>
        <path class="tc-feet" d="M-4 18 V22 M2 18 V22" />
      </g>
    </svg>
  );
}

export function Parrot() {
  return (
    <svg viewBox="-30 -18 60 36">
      <path class="pr-tail" d="M-10 2 L-30 10 L-28 4 L-10 -1 Z" />
      <path class="pr-wing pr-wing-b" d="M0 -2 L-6 -18 L10 -6 Z" />
      <ellipse class="pr-body" cx="0" cy="0" rx="12" ry="6" />
      <circle class="pr-head" cx="11" cy="-3" r="5" />
      <path class="pr-beak" d="M15 -4 Q20 -3 17 1 L15 0 Z" />
      <path class="pr-wing" d="M0 -1 L-8 -17 L9 -5 Z" />
    </svg>
  );
}

export function JungleScene() {
  return (
    <div class="deco" aria-hidden="true">
      <div class="dj-sky" />
      <div class="dj-rays">{many(4)}</div>
      <svg class="dj-canopy" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice"><path d={CANOPY} /><path class="dj-trunks" d={CANOPY_TRUNKS} /></svg>
      <div class="dj-lianas">
        <Liana x="8%" len={190} phase={0} />
        <Liana x="22%" len={120} phase={1.2} />
        <Liana x="71%" len={150} phase={2.1} />
        <Liana x="90%" len={210} phase={0.6} />
      </div>
      <Snake />
      <Monkey />
      <Toucan />
      <div class="dj-birds">{[0, 1, 2].map((i) => <Parrot key={i} />)}</div>
      <div class="dj-eyes">{many(3)}</div>
      <svg class="dj-front dj-front-l" viewBox="0 0 200 160" preserveAspectRatio="xMinYMax meet">
        <Fan x={10} y={170} cls="dj-fan dj-fan-a" leaves={[[-80, 120, 22], [-62, 140, 24], [-40, 150, 26], [-20, 130, 22], [-5, 110, 18]]} />
        <Monstera x={120} y={168} s={1.05} rot={18} cls="dj-mon" />
        <Fan x={60} y={172} cls="dj-fan dj-fan-b" leaves={[[-100, 90, 16], [-75, 110, 18], [-50, 100, 16]]} />
      </svg>
      <svg class="dj-front dj-front-r" viewBox="0 0 200 160" preserveAspectRatio="xMaxYMax meet">
        <Monstera x={70} y={170} s={0.95} rot={-22} cls="dj-mon" />
        <Fan x={190} y={170} cls="dj-fan dj-fan-a" leaves={[[-100, 120, 22], [-120, 140, 24], [-140, 150, 26], [-160, 130, 22], [-176, 110, 18]]} />
      </svg>
      <div class="dj-tiger-wrap"><Tiger /></div>
      <svg class="dj-bush" viewBox="0 0 200 110" preserveAspectRatio="xMidYMax meet">
        <Fan x={100} y={118} cls="dj-fan dj-fan-a" leaves={[[-170, 90, 18], [-150, 110, 20], [-128, 118, 22], [-106, 112, 22], [-84, 118, 22], [-62, 110, 20], [-38, 104, 18], [-14, 86, 16]]} />
        <Fan x={60} y={118} cls="dj-fan dj-fan-b" leaves={[[-140, 70, 14], [-110, 84, 16], [-80, 72, 14]]} />
        <Fan x={150} y={118} cls="dj-fan dj-fan-b" leaves={[[-100, 70, 14], [-70, 84, 16], [-40, 72, 14]]} />
      </svg>
      <svg class="dj-top" viewBox="0 0 400 70" preserveAspectRatio="xMidYMin slice">
        <Fan x={-10} y={-12} cls="dj-fan dj-fan-c" leaves={[[20, 120, 18], [40, 110, 16], [60, 90, 14], [8, 100, 14]]} />
        <Fan x={410} y={-12} cls="dj-fan dj-fan-c" leaves={[[160, 120, 18], [140, 110, 16], [120, 90, 14], [172, 100, 14]]} />
        <Fan x={200} y={-20} cls="dj-fan dj-fan-d" leaves={[[60, 80, 12], [90, 70, 12], [120, 80, 12]]} />
      </svg>
      <div class="dj-fireflies">{many(9)}</div>
    </div>
  );
}

/** Lianenkranz hinter dem Zifferblatt */
export function JungleWreath() {
  const leaves = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    const r = 152 + (i % 2 ? 6 : -4);
    const x = 160 + r * Math.cos(a), y = 160 + r * Math.sin(a);
    const rot = (a * 180) / Math.PI + (i % 2 ? 60 : 120);
    return <path key={i} class="djw-leaf" d={leaf(18 + (i % 3) * 4, 6)} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(0)})`} />;
  });
  return (
    <svg class="djw" viewBox="0 0 320 320">
      <circle class="djw-vine" cx="160" cy="160" r="152" />
      <circle class="djw-vine thin" cx="160" cy="160" r="156" />
      {leaves}
      <circle class="djw-flower" cx="160" cy="6" r="6" /><circle class="djw-flower b" cx="300" cy="200" r="5" /><circle class="djw-flower" cx="40" cy="250" r="5" />
    </svg>
  );
}

/** Begleiter: Der Affe hangelt sich an der Liane zu den Bananen, je nach Fortschritt */
export function VineSwing({ p }: { p: number }) {
  const q = Math.max(0, Math.min(1, p));
  const P0 = [16, 16], P1 = [110, 58], P2 = [204, 16];
  const t = q;
  const bx = (1 - t) ** 2 * P0[0]! + 2 * (1 - t) * t * P1[0]! + t ** 2 * P2[0]!;
  const by = (1 - t) ** 2 * P0[1]! + 2 * (1 - t) * t * P1[1]! + t ** 2 * P2[1]!;
  const done = q >= 1;
  return (
    <div class="vine-row" aria-hidden="true">
      <svg class="vine-swing" viewBox="0 0 220 96">
        <rect class="vs-trunk" x="6" y="0" width="10" height="96" rx="3" />
        <rect class="vs-trunk" x="204" y="0" width="10" height="96" rx="3" />
        <path class="vs-liana" d={`M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`} />
        <g class="vs-bananas" transform="translate(196 24)">
          {[0, 1, 2, 3].map((i) => <path key={i} d="M0 0 C-2 8 2 16 10 18 C6 14 4 8 4 0 Z" transform={`rotate(${-20 + i * 14})`} />)}
        </g>
        <g class={`vs-monkey${done ? ' is-done' : ''}`} transform={`translate(${bx.toFixed(1)} ${by.toFixed(1)})`}>
          <path class="mk-arm" d="M-3 0 L-4 12 M3 0 L4 12" />
          <path class="mk-tail" d="M5 30 C16 34 18 44 10 46" />
          <ellipse class="mk-torso" cx="0" cy="24" rx="8" ry="10" />
          <circle class="mk-ear" cx="-8" cy="12" r="3.6" /><circle class="mk-ear" cx="8" cy="12" r="3.6" />
          <circle class="mk-head" cx="0" cy="12" r="7.5" />
          <path class="mk-face" d="M-5 11 Q-5 6 0 7 Q5 6 5 11 Q6 17 0 18 Q-6 17 -5 11 Z" />
          <circle class="mk-eye" cx="-2" cy="11" r="1" /><circle class="mk-eye" cx="2" cy="11" r="1" />
        </g>
      </svg>
      <p class="meter-text"><b>{done ? 'Bananen erreicht!' : `${Math.round(q * 100)} %`}</b><span>Lianenschwung</span></p>
    </div>
  );
}
