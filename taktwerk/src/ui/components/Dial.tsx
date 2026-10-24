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

export function Dial({ frac }: { frac: number }) {
  const f = clamp(frac, 0, 1);
  const th = (f * 360 - 90) * (Math.PI / 180);
  return (
    <svg class="dial" viewBox="0 0 320 320" aria-hidden="true">
      <g class="dial-ticks">{TICKS}</g>
      <circle class="dial-track" cx="160" cy="160" r={R} />
      <circle
        class="dial-arc" cx="160" cy="160" r={R}
        stroke-dasharray={C.toFixed(2)} stroke-dashoffset={(C * (1 - f)).toFixed(2)}
        transform="rotate(-90 160 160)"
      />
      <circle class="dial-knob" cx={(160 + R * Math.cos(th)).toFixed(2)} cy={(160 + R * Math.sin(th)).toFixed(2)} r="8" />
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
