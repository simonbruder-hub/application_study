import { useRef, useState } from 'preact/hooks';
import { clamp } from '../format';

/** Zifferblatt wie bei einer Küchenuhr: 60 Striche, Bogen = verbleibender (bzw. erreichter) Anteil */
const R = 126;
const C = 2 * Math.PI * R;

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i * 6 * Math.PI) / 180;
  const major = i % 5 === 0;
  const r1 = 152;
  const r2 = major ? 140 : 146;
  const p = (r: number) => [(160 + r * Math.sin(a)).toFixed(1), (160 - r * Math.cos(a)).toFixed(1)] as const;
  const [x1, y1] = p(r1);
  const [x2, y2] = p(r2);
  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} class={major ? 'tk tk-major' : 'tk'} />;
});

const ROMAN = ['XII', 'III', 'VI', 'IX'];

export type DialKnob = 'dot' | 'leaf' | 'gem' | 'car' | 'plane';

const KNOB_PATH: Record<Exclude<DialKnob, 'dot'>, string> = {
  leaf: 'M0 -13 C9 -7 9 7 0 13 C-9 7 -9 -7 0 -13 Z M0 -10 V10',
  gem: 'M0 -12 L8 0 L0 12 L-8 0 Z',
  car: 'M-12 -6 H6 Q13 -6 14 0 Q13 6 6 6 H-12 Q-14 6 -14 4 V-4 Q-14 -6 -12 -6 Z M1 -4 H5 V4 H1 Z M-13 -9 H-9 V9 H-13 Z M-8 -9 H-4 V-7 H-8 Z M-8 7 H-4 V9 H-8 Z M4 -9 H8 V-7 H4 Z M4 7 H8 V9 H4 Z',
  plane: 'M15 0 Q14 -2 8 -2 L-9 -1.6 L-13 -6 L-15.5 -6 L-13.5 0 L-15.5 6 L-13 6 L-9 1.6 L8 2 Q14 2 15 0 Z M5 -1.5 L-2 -14 L-5.5 -14 L-2.5 -1.5 Z M5 1.5 L-2 14 L-5.5 14 L-2.5 1.5 Z',
};

/** Kometenschweif: kurze Bogenstücke hinter dem Zeiger, nach aussen blasser */
const TAIL_STEPS = 8;
const TAIL_STEP = 0.011;

export function Dial({ frac, numerals = false, knob = 'dot', trail = 1 }: { frac: number; numerals?: boolean; knob?: DialKnob; trail?: 1 | -1 }) {
  const f = clamp(frac, 0, 1);
  // Sekundenpunkt: einmal beim Einblenden auf die echten Sekunden gelegt, danach reine CSS-Animation
  const [secDelay] = useState(() => `${-((Date.now() % 60000) / 1000).toFixed(3)}s`);
  const tail = Array.from({ length: TAIL_STEPS }, (_, k) => {
    const start = trail > 0 ? f + k * TAIL_STEP : f - (k + 1) * TAIL_STEP;
    if (start < 0 || start + TAIL_STEP > 1) return null;
    return (
      <circle
        key={k} class="dial-tail" cx="160" cy="160" r={R} transform="rotate(-90 160 160)"
        stroke-dasharray={`${(TAIL_STEP * C).toFixed(2)} ${C.toFixed(2)}`} stroke-dashoffset={(-start * C).toFixed(2)}
        style={{ opacity: (0.6 * (1 - k / TAIL_STEPS)).toFixed(2) }}
      />
    );
  });
  const th = (f * 360 - 90) * (Math.PI / 180);
  const kx = (160 + R * Math.cos(th)).toFixed(2);
  const ky = (160 + R * Math.sin(th)).toFixed(2);
  return (
    <svg class="dial" viewBox="0 0 320 320" aria-hidden="true">
      <g class="dial-ticks">{TICKS}</g>
      {numerals && (
        <g class="dial-num">
          {ROMAN.map((n, i) => {
            const a = (i * 90 * Math.PI) / 180;
            return <text key={n} x={(160 + 100 * Math.sin(a)).toFixed(1)} y={(160 - 100 * Math.cos(a)).toFixed(1)}>{n}</text>;
          })}
        </g>
      )}
      <circle class="dial-track" cx="160" cy="160" r={R} />
      <circle
        class="dial-arc" cx="160" cy="160" r={R}
        stroke-dasharray={C.toFixed(2)} stroke-dashoffset={(C * (1 - f)).toFixed(2)}
        transform="rotate(-90 160 160)"
      />
      <g class="dial-tails">{tail}</g>
      <g class="sec-orbit" style={{ animationDelay: secDelay }}><circle cx="160" cy="14" r="3.6" /></g>
      {knob === 'dot'
        ? <circle class="dial-knob" cx={kx} cy={ky} r="8" />
        : <path class={`dial-knob dial-knob-${knob}`} d={KNOB_PATH[knob]} fill-rule="evenodd" transform={`translate(${kx} ${ky}) rotate(${(f * 360 + (trail > 0 ? 180 : 0)).toFixed(1)})`} />}
    </svg>
  );
}

export type Mood = 'idle' | 'focus' | 'paused' | 'break' | 'yay';

const EYES: Record<Mood, string> = {
  idle: '<ellipse cx="45" cy="66" rx="6.5" ry="8.5" class="m-ink"/><ellipse cx="75" cy="66" rx="6.5" ry="8.5" class="m-ink"/><circle cx="47.5" cy="62.5" r="2.6" class="m-white"/><circle cx="77.5" cy="62.5" r="2.6" class="m-white"/>',
  focus: '<ellipse cx="45" cy="67" rx="6.5" ry="7.5" class="m-ink"/><ellipse cx="75" cy="67" rx="6.5" ry="7.5" class="m-ink"/><circle cx="47.5" cy="64" r="2.4" class="m-white"/><circle cx="77.5" cy="64" r="2.4" class="m-white"/><path d="M36 53 L53 58 M84 53 L67 58" class="m-line"/>',
  paused: '<path d="M38 67 h13 M69 67 h13" class="m-line"/>',
  break: '<path d="M38 69 q6.5 -9 13 0 M69 69 q6.5 -9 13 0" class="m-line"/>',
  yay: '<path d="M45 58 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 6 -2.2z M75 58 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 6 -2.2z" class="m-ink"/>',
};
const MOUTH: Record<Mood, string> = {
  idle: '<path d="M53 80 q7 7 14 0" class="m-line"/>',
  focus: '<path d="M54 83 q6 -3 12 0" class="m-line"/>',
  paused: '<ellipse cx="60" cy="83" rx="3.5" ry="4" class="m-ink"/>',
  break: '<path d="M51 79 q9 12 18 0 z" class="m-mouth"/>',
  yay: '<path d="M49 78 q11 15 22 0 z" class="m-mouth"/>',
};
const EXTRA: Partial<Record<Mood, string>> = {
  paused: '<text x="92" y="34" class="m-zzz">z</text><text x="101" y="24" class="m-zzz m-zzz-2">z</text>',
  yay: '<path d="M14 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z M104 82 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" class="m-spark"/>',
  focus: '<path d="M98 50 q6 4 3 12 q-5 -2 -3 -12z" class="m-sweat"/>',
};
const BODY = '<ellipse cx="60" cy="70" rx="44" ry="39" class="m-body"/>'
  + '<ellipse cx="42" cy="50" rx="10" ry="6" class="m-shine" transform="rotate(-25 42 50)"/>'
  + '<path d="M60 22 l7 10 12 -4 -6 11 11 6 -13 2 -11 0 -13 -2 11 -6 -6 -11 12 4z" class="m-leaf"/>'
  + '<path d="M60 22 q2 -8 7 -11" class="m-stem"/>'
  + '<ellipse cx="34" cy="80" rx="7" ry="4" class="m-blush"/><ellipse cx="86" cy="80" rx="7" ry="4" class="m-blush"/>';

/** Maskottchen für den Anime-Stil: Tomaten-Chan (statische SVG-Bausteine) */
export function Mascot({ mood }: { mood: Mood }) {
  return (
    <svg
      class="mascot" viewBox="0 0 120 120" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: BODY + EYES[mood] + MOUTH[mood] + (EXTRA[mood] ?? '') }}
    />
  );
}

export const MOOD_LINES: Record<Mood, readonly string[]> = {
  focus: ['Konzentration! 集中', 'Du schaffst das!', 'Nur noch diese Runde!'],
  break: ['Pause! Tee trinken~', 'Kurz strecken!', 'Augen entspannen ✿'],
  paused: ['Kurz verschnaufen …', 'Weiter mit Leertaste!'],
  idle: ['Bereit? Leertaste drücken!', 'Los geht’s!'],
  yay: ['Yatta! Geschafft! ✦', 'Super gemacht!'],
};

/* ---------- Zeiger ziehen ---------- */

const RING = (R / 320) * 100; // Radius des Bogens in % der Zifferblatt-Breite

/** Winkel des Zeigers (0 oben, im Uhrzeigersinn) aus einer Bildschirmposition, als Anteil einer Umdrehung */
function fracAt(el: HTMLElement, x: number, y: number): number {
  const r = el.getBoundingClientRect();
  const a = Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2)));
  return (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI);
}

/**
 * Unsichtbarer Griff über dem Zeiger: mit Maus oder Finger ziehen (auch über eine volle Umdrehung hinaus),
 * mit Pfeiltasten in Minuten, Bild auf/ab in 5 Minuten. Liefert den neuen Anteil (kann > 1 sein).
 */
export function DialHandle(props: {
  frac: number;
  label: string;
  valueText: string;
  minutes: number;
  onDrag: (frac: number | null) => void;
  onCommit: (frac: number) => void;
  onStep: (minutes: number) => void;
}) {
  const drag = useRef<{ start: number; last: number; acc: number } | null>(null);
  const [active, setActive] = useState(false);
  const f = ((props.frac % 1) + 1) % 1;
  const th = f * 2 * Math.PI;
  const wrap = (e: Event) => (e.currentTarget as HTMLElement).parentElement!;
  const current = () => drag.current ? drag.current.start + drag.current.acc : props.frac;

  return (
    <button
      type="button" role="slider" class={`dial-handle${active ? ' is-dragging' : ''}`}
      style={{ left: `${50 + RING * Math.sin(th)}%`, top: `${50 - RING * Math.cos(th)}%` }}
      aria-label={props.label} aria-valuetext={props.valueText} aria-valuenow={props.minutes} aria-valuemin={1}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const at = fracAt(wrap(e), e.clientX, e.clientY);
        drag.current = { start: props.frac, last: at, acc: 0 };
        setActive(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const at = fracAt(wrap(e), e.clientX, e.clientY);
        let step = at - d.last;
        if (step > 0.5) step -= 1;
        if (step < -0.5) step += 1;
        d.last = at;
        d.acc += step;
        props.onDrag(current());
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        const end = current();
        drag.current = null;
        setActive(false);
        props.onDrag(null);
        props.onCommit(end);
      }}
      onPointerCancel={() => { drag.current = null; setActive(false); props.onDrag(null); }}
      onKeyDown={(e) => {
        const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        props.onStep(step);
      }}
    />
  );
}
