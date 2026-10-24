/**
 * Stil-Deko der Timer-Karte: Hintergrund-Effekte, Anzeige über der Uhr, Begleiter unter dem
 * Zifferblatt und eine kleine Feier nach einem geschafften Pomodoro. Rein dekorativ (aria-hidden).
 */
import type { UserSettings } from '../../data/types';
import type { Skin } from '../skins';
import { PHASE_CHANNEL, PHASE_KANJI, PHASE_LATIN, type TimerView } from '../../app/timer/view';
import { Mascot, type DialKnob } from './Dial';

const many = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

/** Zifferblatt-Varianten je Stil */
export const DIAL_STYLE: Partial<Record<Skin, { numerals?: boolean; knob?: DialKnob }>> = {
  barock: { numerals: true, knob: 'gem' },
  natur: { knob: 'leaf' },
};

/* ---------- Hintergrund ---------- */

/*
 * Szenen je Phase: Alle Elemente sind im DOM, CSS blendet je nach :root[data-phase] (focus/short/long)
 * und :root[data-run] (läuft) ein und startet die Animationen.
 */
export function SkinBackdrop({ skin, v, cycle }: { skin: Skin; v: TimerView; cycle: number }) {
  switch (skin) {
    case 'klassisch':
      return (
        <div class="deco" aria-hidden="true">
          <div class="halo" />
          <div class="bubbles">{many(10)}</div>
        </div>
      );
    case 'anime':
      return (
        <div class="deco" aria-hidden="true">
          <div class="speedlines" />
          <div class="bolts">{many(4)}</div>
          <div class="petals">{many(6)}</div>
          <div class="hearts">{['♥', '♡', '♥', '✿', '♥', '♡', '✿', '♥'].map((c, i) => <span key={i}>{c}</span>)}</div>
          <div class="lanterns">{many(6)}</div>
          <div class="shooting">{many(3)}</div>
          <div class="sparkles">{many(4)}</div>
          {v.running && <span class="sfx">{v.kind === 'stopwatch' ? 'カチカチ' : SFX[v.phase]}</span>}
        </div>
      );
    case 'technik':
      return (
        <div class="deco" aria-hidden="true">
          <div class="scanlines" />
          <svg class="scope-wave" viewBox="0 0 800 60" preserveAspectRatio="none">
            <path class="ghost" d={WAVE[v.phase]} />
            <path d={WAVE[v.phase]} />
          </svg>
          <div class="fft">{many(28)}</div>
          <span class="scope-state">{v.running ? 'Run' : 'Stop'}</span>
          <span class="scope-trig">T▸</span>
        </div>
      );
    case 'barock':
      return (
        <div class="deco" aria-hidden="true">
          <div class="frame"><span class="fleuron">❦</span></div>
          <div class="notes">{['♪', '♫', '♩', '♬', '♪', '♫', '♩', '♬'].map((c, i) => <span key={i}>{c}</span>)}</div>
          <div class="fireworks">{many(4)}</div>
        </div>
      );
    case 'natur':
      return (
        <div class="deco" aria-hidden="true">
          <div class="sky" />
          <div class="sun" />
          <div class="clouds">{many(3)}</div>
          <svg class="birds" viewBox="0 0 120 40">{[[0, 20], [30, 8], [56, 26]].map(([x, y]) => <path key={x} d={`M${x} ${y} q6 -7 12 0 q6 -7 12 0`} />)}</svg>
          <svg class="trees trees-far" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice"><path d={TREES_FAR} /></svg>
          <svg class="trees trees-near" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice"><path d={TREES_NEAR} /></svg>
          <div class="petals leaves">{many(6)}</div>
          <div class="fireflies">{many(7)}</div>
        </div>
      );
    case 'amtlich':
      return (
        <div class="deco" aria-hidden="true">
          <div class="form-head">
            <span>Formular TW-1 · Zeiterfassung</span>
            <span class="form-state">{v.paused ? 'Pendent' : !v.active ? 'Eingang' : v.kind === 'stopwatch' ? 'In Bearbeitung' : OFFICE[v.phase]}</span>
            <span>Nr. {String(cycle + 1).padStart(3, '0')}</span>
          </div>
          {v.paused && <span class="stamp-pending">Pendent</span>}
          <div class="planes">{[0, 1].map((i) => <svg key={i} viewBox="0 0 40 24"><path d="M0 12 L40 0 L22 24 L18 15 Z M18 15 L40 0" /></svg>)}</div>
        </div>
      );
  }
}

/* ---------- Ebene hinter dem Zifferblatt (zentriert auf die Uhr) ---------- */

export function SkinDialFx({ skin }: { skin: Skin }) {
  switch (skin) {
    case 'klassisch':
      return <div class="dial-fx" aria-hidden="true"><div class="breath"><i /><span class="in">Einatmen</span><span class="out">Ausatmen</span></div></div>;
    case 'anime':
      return <div class="dial-fx" aria-hidden="true"><div class="aura" /></div>;
    case 'technik':
      return <div class="dial-fx" aria-hidden="true"><svg class="lissajous" viewBox="0 0 300 300"><path class="ghost" d={LISSAJOUS} /><path d={LISSAJOUS} /></svg></div>;
    case 'amtlich':
      return (
        <div class="dial-fx" aria-hidden="true">
          <svg class="coffee" viewBox="0 0 48 52">
            <path class="steam" d="M16 14 q-4 -5 0 -10 M24 14 q-4 -5 0 -10 M32 14 q-4 -5 0 -10" />
            <path class="cup" d="M8 20 H38 V34 a12 12 0 0 1 -12 12 H20 a12 12 0 0 1 -12 -12 Z M38 24 h3 a5 5 0 0 1 0 10 h-3" />
          </svg>
          <div class="closed"><span>Mittagspause</span><small>Schalter geschlossen</small></div>
        </div>
      );
    default:
      return null;
  }
}

const SFX: Record<TimerView['phase'], string> = { focus: 'ドキドキ', short_break: 'ふわ〜', long_break: 'すやすや' };
const OFFICE: Record<TimerView['phase'], string> = { focus: 'In Bearbeitung', short_break: 'Kaffeepause', long_break: 'Mittagspause' };

/* Oszilloskop: Sinus (CH1 Fokus), Rechteck (CH2 kurze Pause), Dreieck (CH3 lange Pause). Zwei gleiche
 * Hälften, damit die Spur nahtlos weiterläuft. */
const sampled = (fn: (x: number) => number) => {
  const pts: string[] = [];
  for (let x = 0; x <= 800; x += 4) pts.push(`${x},${fn(x).toFixed(1)}`);
  return `M${pts.join(' L')}`;
};
const WAVE: Record<TimerView['phase'], string> = {
  focus: sampled((x) => 30 - 22 * Math.sin((x / 100) * 2 * Math.PI)),
  short_break: (() => {
    let d = 'M0 52';
    for (let x = 0; x < 800; x += 100) d += ` H${x + 10} V8 H${x + 60} V52 H${x + 100}`;
    return d;
  })(),
  long_break: sampled((x) => { const t = (x % 100) / 100; return 52 - 44 * (t < 0.5 ? t * 2 : 2 - t * 2); }),
};
/* XY-Modus: Lissajous-Figur 3:2 */
const LISSAJOUS = (() => {
  const pts: string[] = [];
  for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.02) pts.push(`${(150 + 130 * Math.sin(3 * t + Math.PI / 2)).toFixed(1)},${(150 + 130 * Math.sin(2 * t)).toFixed(1)}`);
  return `M${pts.join(' L')}`;
})();

/* Baumreihen: Tannen und Laubbäume, als ein Pfad je Ebene */
const conifer = (x: number, h: number) => {
  const w = h * 0.42;
  const b = 100;
  return `M${x} ${b - h} L${x + w * 0.55} ${b - h * 0.55} L${x + w * 0.25} ${b - h * 0.55} L${x + w * 0.75} ${b - h * 0.18} L${x + w * 0.1} ${b - h * 0.18} L${x + w * 0.1} ${b} L${x - w * 0.1} ${b} L${x - w * 0.1} ${b - h * 0.18} L${x - w * 0.75} ${b - h * 0.18} L${x - w * 0.25} ${b - h * 0.55} L${x - w * 0.55} ${b - h * 0.55} Z`;
};
const round = (x: number, h: number) => {
  const r = h * 0.34;
  return `M${x - 2.5} 100 V${100 - h + r * 1.6} H${x + 2.5} V100 Z M${x - r} ${100 - h + r} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
};
const TREES_FAR = [conifer(14, 52), round(46, 44), conifer(82, 64), conifer(118, 46), round(160, 52), conifer(204, 60), round(240, 40), conifer(276, 56), conifer(312, 44), round(350, 50), conifer(388, 62)].join(' ') + ' M0 100 V92 H400 V100 Z';
const TREES_NEAR = [round(-6, 70), conifer(40, 82), conifer(70, 60), round(300, 64), conifer(342, 86), conifer(374, 66), round(408, 74)].join(' ') + ' M0 100 V96 H400 V100 Z';

/* ---------- Anzeige über der Uhr ---------- */

export function SkinBadge({ skin, v }: { skin: Skin; v: TimerView }) {
  const stop = v.kind === 'stopwatch';
  switch (skin) {
    case 'anime':
      return <span class="kanji" aria-hidden="true">{stop ? '計時' : PHASE_KANJI[v.phase]}</span>;
    case 'technik':
      return <span class="scope-ch" aria-hidden="true">{stop ? 'Δt · 1 h/Umlauf' : PHASE_CHANNEL[v.phase]}</span>;
    case 'barock':
      return <span class="baroque-badge" aria-hidden="true">{stop ? 'Chronometrum' : PHASE_LATIN[v.phase]}</span>;
    case 'amtlich':
      return <span class="form-label" aria-hidden="true">{stop ? 'Feld 1 · Laufzeit' : 'Feld 1 · Restzeit'}</span>;
    default:
      return null;
  }
}

/* ---------- Begleiter unter dem Zifferblatt ---------- */

const MOTTO: Record<TimerView['mood'], string> = {
  idle: 'Carpe diem',
  focus: 'Tempus fugit',
  break: 'Otium cum dignitate',
  paused: 'Festina lente',
  yay: 'Bravissimo!',
};

const SPROUT_TEXT: Record<TimerView['mood'], string> = {
  idle: 'Ein Samen wartet auf dich',
  focus: 'Wächst mit jeder Minute',
  break: 'Licht und Wasser tanken',
  paused: 'Die Pflanze ruht kurz',
  yay: 'Aufgeblüht!',
};

export function SkinCompanion({ skin, v, say, set, yay }: { skin: Skin; v: TimerView; say: string; set: UserSettings; yay: boolean }) {
  switch (skin) {
    case 'anime':
      return <div class="mascot-wrap"><Mascot mood={v.mood} /><p class="bubble">{say}</p></div>;
    case 'technik':
      return <ScopeReadout v={v} set={set} />;
    case 'barock':
      return (
        <div class="pendulum-wrap" aria-hidden="true">
          <Candle />
          <svg class={`pendulum${v.running ? ' is-swinging' : ''}`} viewBox="0 0 60 92">
            <g class="p-arm"><line x1="30" y1="5" x2="30" y2="66" /><circle cx="30" cy="74" r="13" /><circle cx="30" cy="74" r="6" class="p-inner" /></g>
            <circle cx="30" cy="5" r="4" class="p-pin" />
          </svg>
          <p class="motto">{yay ? MOTTO.yay : MOTTO[v.mood]}</p>
          <Candle />
        </div>
      );
    case 'natur': {
      const growth = yay ? 1 : !v.active ? 0.06 : v.kind === 'stopwatch' ? v.frac : v.phase === 'focus' ? 1 - v.frac : 1;
      return (
        <div class="sprout-wrap" aria-hidden="true">
          <Sprout growth={growth} bloom={yay || (v.active && v.phase !== 'focus')} />
          <p class="motto">{yay ? SPROUT_TEXT.yay : SPROUT_TEXT[v.mood]}{v.running && v.phase === 'focus' ? ` · ${Math.round(growth * 100)} %` : ''}</p>
        </div>
      );
    }
    case 'amtlich':
      return (
        <div class="visum" aria-hidden="true">
          <span>Visum <i /></span>
          <span>Datum <b>{new Date().toLocaleDateString('de-CH')}</b></span>
        </div>
      );
    default:
      return null;
  }
}

/** Kerze mit flackernder Flamme */
const Candle = () => <span class="candle"><i class="flame" /><i class="wax" /></span>;

/** Kennwerte wie am Messgerät: Periode, Frequenz und Tastgrad des Pomodoro-Takts */
function ScopeReadout({ v, set }: { v: TimerView; set: UserSettings }) {
  const fmt = (n: number, d = 2) => n.toLocaleString('de-CH', { maximumFractionDigits: d, minimumFractionDigits: d });
  if (v.kind === 'stopwatch') {
    return <p class="scope-readout" aria-hidden="true"><span>Δt {fmt(v.elapsedSec / 3600)} h</span><span>Ø 1 h / Div</span></p>;
  }
  const period = set.focus_minutes + set.short_break_minutes;
  const mhz = 1000 / (period * 60);
  const duty = (set.focus_minutes / period) * 100;
  return (
    <p class="scope-readout" aria-hidden="true">
      <span>T {period} min</span><span>f {fmt(mhz)} mHz</span><span>D {fmt(duty, 0)} %</span>
    </p>
  );
}

/** Pflanze: Stiel wächst mit dem Fortschritt, Blätter erscheinen nach und nach, Blüte am Ende */
function Sprout({ growth, bloom }: { growth: number; bloom: boolean }) {
  const g = Math.min(1, Math.max(0, growth));
  const leaf = (at: number) => `sp-leaf${g >= at ? ' is-on' : ''}`;
  return (
    <svg class="sprout" viewBox="0 0 80 96">
      <path class="sp-stem" d="M40 78 C40 64 35 52 40 40 C44 30 40 22 40 14" pathLength="1" stroke-dasharray="1" stroke-dashoffset={(1 - g).toFixed(3)} />
      <path class={leaf(0.2)} d="M40 64 C30 62 24 54 24 48 C32 48 39 54 40 64 Z" />
      <path class={leaf(0.45)} d="M39 50 C49 48 56 40 57 34 C48 34 41 40 39 50 Z" />
      <path class={leaf(0.7)} d="M41 32 C33 30 28 24 28 18 C35 19 40 24 41 32 Z" />
      <g class={`sp-flower${bloom ? ' is-on' : ''}`}>
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="40" cy="8" rx="4.5" ry="7" transform={`rotate(${a} 40 14)`} />)}
        <circle cx="40" cy="14" r="4" class="sp-core" />
      </g>
      <path class="sp-pot" d="M22 78 H58 L54 94 H26 Z" />
      <rect class="sp-rim" x="19" y="74" width="42" height="7" rx="2" />
    </svg>
  );
}

/* ---------- Feier nach einem geschafften Pomodoro ---------- */

export function Celebrate({ skin }: { skin: Skin }) {
  switch (skin) {
    case 'klassisch':
      return <div class="celebrate confetti" aria-hidden="true">{many(14)}</div>;
    case 'anime':
      return <div class="celebrate burst" aria-hidden="true"><span>やった!</span></div>;
    case 'technik':
      return <div class="celebrate pass" aria-hidden="true"><span>PASS ✓</span></div>;
    case 'barock':
      return <div class="celebrate bravo" aria-hidden="true"><span>Bravissimo!</span></div>;
    case 'natur':
      return <div class="celebrate bloom" aria-hidden="true">{many(10)}</div>;
    case 'amtlich':
      return <div class="celebrate stamp" aria-hidden="true"><span>Erledigt</span></div>;
  }
}
