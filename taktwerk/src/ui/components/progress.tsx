/**
 * Fortschritts-Begleiter unter dem Zifferblatt: zeigen den Fortschritt der laufenden Phase (0..1) als
 * Bild, das wächst oder sich füllt (Tomate, Sanduhr, Reise, Baum, Blumen, Tauchtiefe …). Rein dekorativ.
 */
import type { ComponentChildren } from 'preact';
import { KNOB_PATH, type DialKnob } from './Dial';

const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
const pctText = (p: number) => `${Math.round(clamp01(p) * 100)} %`;

/* ---------- Reise von A nach B (Rennen, Flug, Zug, Sci-Fi) ---------- */

export function Journey({ p, from, to, vehicle, stops = 0, detail }: {
  p: number; from: string; to: string; vehicle: Exclude<DialKnob, 'dot'>; stops?: number; detail?: ComponentChildren;
}) {
  const x = 22 + clamp01(p) * 236;
  return (
    <div class="journey" aria-hidden="true">
      <svg viewBox="0 0 280 40">
        <line class="j-route" x1="22" y1="18" x2="258" y2="18" />
        <line class="j-done" x1="22" y1="18" x2={x.toFixed(1)} y2="18" />
        {Array.from({ length: stops }, (_, i) => {
          const sx = 22 + ((i + 1) / (stops + 1)) * 236;
          return <circle key={i} class={`j-stop${sx <= x ? ' is-past' : ''}`} cx={sx} cy="18" r="3" />;
        })}
        <circle class="j-end" cx="22" cy="18" r="5" />
        <g class="j-goal" transform="translate(258 18)"><rect x="-6" y="-6" width="12" height="12" rx="2" /><path d="M-6 -6 h6 v6 h-6 Z M0 0 h6 v6 h-6 Z" /></g>
        <path class={`j-vehicle j-${vehicle}`} d={KNOB_PATH[vehicle]} transform={`translate(${x.toFixed(1)} 18) scale(0.95)`} fill-rule="evenodd" />
      </svg>
      <div class="j-labels"><span>{from}</span><b>{detail ?? pctText(p)}</b><span>{to}</span></div>
    </div>
  );
}

/* ---------- Klassisch: Tomate füllt sich ---------- */

export function TomatoFill({ p, round }: { p: number; round: string }) {
  const y = 14 + (1 - clamp01(p)) * 50;
  return (
    <div class="meter-row" aria-hidden="true">
      <svg class="tomato-fill" viewBox="0 0 64 64">
        <defs><clipPath id="tf-clip"><circle cx="32" cy="38" r="22" /></clipPath></defs>
        <circle class="tf-shell" cx="32" cy="38" r="22" />
        <rect class="tf-juice" clip-path="url(#tf-clip)" x="0" y={y.toFixed(1)} width="64" height="64" />
        <path class="tf-wave" clip-path="url(#tf-clip)" d={`M0 ${y.toFixed(1)} q8 -3 16 0 t16 0 t16 0 t16 0 v4 h-64 Z`} />
        <circle class="tf-outline" cx="32" cy="38" r="22" />
        <path class="tf-leaf" d="M32 16 l5 -7 3 6 7 -2 -5 6 -10 1 -10 -1 -5 -6 7 2 3 -6 z" />
      </svg>
      <p class="meter-text"><b>{pctText(p)}</b><span>{round}</span></p>
    </div>
  );
}

/* ---------- Anime: Power-Leiste ---------- */

export function PowerBar({ p }: { p: number }) {
  const n = Math.round(clamp01(p) * 10);
  return (
    <div class={`power${n === 10 ? ' is-full' : ''}`} aria-hidden="true">
      <span class="power-label">POWER</span>
      <span class="power-cells">{Array.from({ length: 10 }, (_, i) => <i key={i} class={i < n ? 'is-on' : ''} />)}</span>
    </div>
  );
}

/* ---------- Technik: LED-Balken wie ein Pegelmesser ---------- */

export function LedBar({ p }: { p: number }) {
  const n = Math.round(clamp01(p) * 16);
  return (
    <div class="ledbar" aria-hidden="true">
      <span class="led-cells">{Array.from({ length: 16 }, (_, i) => <i key={i} class={`${i < n ? 'is-on ' : ''}${i >= 13 ? 'hi' : i >= 10 ? 'mid' : ''}`} />)}</span>
      <span class="led-text">Q {pctText(p)}</span>
    </div>
  );
}

/* ---------- Barock: Sanduhr ---------- */

export function Hourglass({ p, running }: { p: number; running: boolean }) {
  const q = clamp01(p);
  const top = 6 + q * 26; // Sandspiegel oben sinkt
  const bot = 66 - q * 24; // Sandberg unten wächst
  return (
    <svg class={`hourglass${running && q < 1 ? ' is-running' : ''}`} viewBox="0 0 44 72" aria-hidden="true">
      <defs>
        <clipPath id="hg-top"><path d="M8 6 H36 Q36 22 22 34 Q8 22 8 6 Z" /></clipPath>
        <clipPath id="hg-bot"><path d="M22 38 Q36 50 36 66 H8 Q8 50 22 38 Z" /></clipPath>
      </defs>
      <rect class="hg-sand" clip-path="url(#hg-top)" x="0" y={top.toFixed(1)} width="44" height="40" />
      <path class="hg-sand" clip-path="url(#hg-bot)" d={`M8 66 Q22 ${bot.toFixed(1)} 36 66 Z`} />
      <line class="hg-stream" x1="22" y1="34" x2="22" y2="64" />
      <path class="hg-glass" d="M8 6 H36 Q36 22 22 36 Q36 50 36 66 H8 Q8 50 22 36 Q8 22 8 6 Z" />
      <rect class="hg-cap" x="4" y="2" width="36" height="5" rx="1.5" />
      <rect class="hg-cap" x="4" y="65" width="36" height="5" rx="1.5" />
    </svg>
  );
}

/* ---------- Amtlich: Aktenstapel wächst ---------- */

export function PaperStack({ p }: { p: number }) {
  const n = Math.ceil(clamp01(p) * 8);
  return (
    <div class="stack-row" aria-hidden="true">
      <span class="stack">{Array.from({ length: 8 }, (_, i) => <i key={i} class={i < n ? 'is-on' : ''} style={{ '--i': i }} />)}</span>
      <span class="stack-text">Bearbeitet {pctText(p)}</span>
    </div>
  );
}

/* ---------- Forest: pro Pomodoro wächst ein Baum, jedes Mal eine andere Art ---------- */

export const TREE_KINDS = ['Tanne', 'Eiche', 'Birke', 'Kirschbaum', 'Weide', 'Ahorn'] as const;

function TreeShape({ kind }: { kind: number }) {
  switch (kind % TREE_KINDS.length) {
    case 0: return <g class="t-crown t-fir"><path d="M40 14 L58 44 H48 L62 66 H18 L32 44 H22 Z" /></g>;
    case 1: return <g class="t-crown t-oak"><circle cx="28" cy="44" r="14" /><circle cx="52" cy="44" r="14" /><circle cx="40" cy="30" r="17" /></g>;
    case 2: return <g class="t-crown t-birch"><ellipse cx="40" cy="38" rx="17" ry="24" /></g>;
    case 3: return <g class="t-crown t-cherry"><circle cx="30" cy="40" r="13" /><circle cx="50" cy="40" r="13" /><circle cx="40" cy="28" r="15" /><circle cx="33" cy="33" r="3" class="t-blossom" /><circle cx="47" cy="27" r="3" class="t-blossom" /><circle cx="44" cy="44" r="3" class="t-blossom" /></g>;
    case 4: return <g class="t-crown t-willow"><path d="M40 18 C18 20 14 40 16 64 C22 50 24 40 30 34 C30 48 32 58 34 66 C36 52 38 40 40 32 C42 40 44 52 46 66 C48 58 50 48 50 34 C56 40 58 50 64 64 C66 40 62 20 40 18 Z" /></g>;
    default: return <g class="t-crown t-maple"><path d="M40 12 L46 24 L58 20 L54 32 L66 38 L54 44 L58 56 L46 52 L40 62 L34 52 L22 56 L26 44 L14 38 L26 32 L22 20 L34 24 Z" /></g>;
  }
}

export function Tree({ kind, growth, size = 'big' }: { kind: number; growth: number; size?: 'big' | 'mini' }) {
  const g = clamp01(growth);
  const trunk = Math.max(0.12, g);
  const crown = Math.max(0, (g - 0.18) / 0.82);
  return (
    <svg class={`tree tree-${size} kind-${kind % TREE_KINDS.length}`} viewBox="0 0 80 96" aria-hidden="true">
      {size === 'big' && <ellipse class="t-ground" cx="40" cy="92" rx="30" ry="4" />}
      <g style={{ transform: `scaleY(${trunk.toFixed(3)})`, transformOrigin: '40px 92px' }}>
        <path class={`t-trunk${kind % TREE_KINDS.length === 2 ? ' is-birch' : ''}`} d="M37 92 L38 50 Q40 46 42 50 L43 92 Z" />
      </g>
      <g style={{ transform: `scale(${crown.toFixed(3)})`, transformOrigin: '40px 62px', transition: 'transform 0.8s cubic-bezier(.2,1.4,.4,1)' }}>
        <TreeShape kind={kind} />
      </g>
    </svg>
  );
}

/* ---------- Flora: Blumen öffnen sich nacheinander, eine Biene besucht die neueste ---------- */

const BLOOM_COLORS = ['#e63946', '#ffb703', '#c77dff', '#ff8fab', '#4cc9f0'];

export function Bouquet({ p }: { p: number }) {
  const q = clamp01(p);
  const open = Math.floor(q * 5 + 0.0001);
  return (
    <div class="bouquet-row" aria-hidden="true">
      <svg class="bouquet" viewBox="0 0 150 70">
        {BLOOM_COLORS.map((c, i) => {
          const x = 15 + i * 30;
          const on = i < open || q >= 1;
          return (
            <g key={i} class={`b-flower${on ? ' is-open' : ''}`} style={{ '--bc': c }}>
              <path class="b-stem" d={`M${x} 70 Q${x - 4} 52 ${x} 34`} />
              <path class="b-leaf" d={`M${x - 1} 56 q-10 -2 -12 -10 q9 1 12 10 z`} />
              <g class="b-head" style={{ transformOrigin: `${x}px 30px` }}>
                {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={x} cy="22" rx="5" ry="8" transform={`rotate(${a} ${x} 30)`} />)}
                <circle class="b-core" cx={x} cy="30" r="4" />
              </g>
            </g>
          );
        })}
        <g class="b-bee" style={{ transform: `translate(${(15 + Math.min(4, open) * 30).toFixed(0)}px, 14px)` }}>
          <ellipse cx="0" cy="0" rx="6" ry="4" class="bee-body" /><path d="M-2 -4 v8 M2 -4 v8" class="bee-stripe" />
          <ellipse cx="-1" cy="-6" rx="4" ry="3" class="bee-wing" /><ellipse cx="3" cy="-6" rx="4" ry="3" class="bee-wing" />
        </g>
      </svg>
      <span class="meter-text"><b>{open >= 5 || q >= 1 ? 'Volle Blüte' : `${open} von 5 offen`}</b></span>
    </div>
  );
}

/* ---------- Meer: Tauchtiefe, ein U-Boot taucht mit dem Fortschritt ab ---------- */

export function DepthGauge({ p, maxDepth = 40 }: { p: number; maxDepth?: number }) {
  const q = clamp01(p);
  const y = 10 + q * 40;
  return (
    <div class="depth-row" aria-hidden="true">
      <svg class="depth" viewBox="0 0 120 64">
        <rect class="d-water" x="0" y="6" width="120" height="58" rx="8" />
        <path class="d-surface" d="M0 8 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" />
        {[0.25, 0.5, 0.75].map((t) => <line key={t} class="d-mark" x1="104" x2="116" y1={10 + t * 40} y2={10 + t * 40} />)}
        <g class="d-sub" transform={`translate(52 ${y.toFixed(1)})`}>
          <path d="M-16 0 Q-16 -7 -6 -7 H8 Q16 -7 16 0 Q16 7 8 7 H-6 Q-16 7 -16 0 Z M-2 -7 V-12 H6 V-7" />
          <circle cx="-4" cy="0" r="2.4" class="d-port" /><circle cx="4" cy="0" r="2.4" class="d-port" />
        </g>
        <g class="d-bubbles"><circle cx="40" cy={y - 8} r="1.6" /><circle cx="36" cy={y - 16} r="1.2" /><circle cx="42" cy={y - 24} r="1" /></g>
      </svg>
      <p class="meter-text"><b>{Math.round(q * maxDepth)} m</b><span>Tauchtiefe</span></p>
    </div>
  );
}

/* ---------- Elemente: vier Kugeln, das aktive Element füllt sich ---------- */

export const ELEMENTS = [
  { id: 'feuer', label: 'Feuer' }, { id: 'wasser', label: 'Wasser' }, { id: 'luft', label: 'Luft' }, { id: 'erde', label: 'Erde' },
] as const;

export function ElementOrbs({ p, active }: { p: number; active: number }) {
  const q = clamp01(p);
  return (
    <div class="orbs" aria-hidden="true">
      {ELEMENTS.map((e, i) => (
        <span key={e.id} class={`orb orb-${e.id}${i === active ? ' is-active' : ''}`} style={{ '--fill': `${(i === active ? q : 0) * 100}%` }}>
          <i /><small>{e.label}</small>
        </span>
      ))}
    </div>
  );
}
