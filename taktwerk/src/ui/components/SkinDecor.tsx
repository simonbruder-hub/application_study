/**
 * Stil-Deko der Timer-Karte: Hintergrund-Effekte, Anzeige über der Uhr, Begleiter unter dem
 * Zifferblatt und eine kleine Feier nach einem geschafften Pomodoro. Rein dekorativ (aria-hidden).
 */
import { useState } from 'preact/hooks';
import type { UserSettings } from '../../data/types';
import type { Skin } from '../skins';
import { PHASE_CHANNEL, PHASE_KANJI, PHASE_LATIN, type TimerView } from '../../app/timer/view';
import { entities } from '../../app/store';
import { Mascot, type DialKnob } from './Dial';
import { Bouquet, DepthGauge, ElementOrbs, Hourglass, Journey, LedBar, PaperStack, PowerBar, type Seek, TomatoFill, Tree, TREE_KINDS } from './progress';
import { ElementeScene, ElementMarks, FloraScene, FloraWreath, MeerScene, SbbClock, ScifiScene, ZugScene } from './scenes';
import { GAME_OF_SKIN, GAMES, gameOpen } from '../game/games';
import { ScopeCursors, ScopeTrace, ScopeXY } from './Scope';

const many = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

/** Zifferblatt-Varianten je Stil */
export const DIAL_STYLE: Partial<Record<Skin, { numerals?: boolean; knob?: DialKnob }>> = {
  barock: { numerals: true, knob: 'gem' },
  natur: { knob: 'leaf' },
  rennen: { knob: 'car' },
  flug: { knob: 'plane' },
  meer: { knob: 'fish' },
  flora: { knob: 'bee' },
  scifi: { knob: 'ship' },
  zug: { knob: 'train' },
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
        <>
          <div class="deco" aria-hidden="true">
            <div class="scanlines" />
            <ScopeTrace phase={v.phase} running={v.running} />
            <div class="fft">{many(28)}</div>
            <span class="scope-trig">T▸</span>
          </div>
          <ScopeCursors running={v.running} />
        </>
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
          <div class="butterflies">{[0, 1, 2].map((i) => <span key={i}><i /><i /></span>)}</div>
          <div class="fireflies">{many(7)}</div>
        </div>
      );
    case 'rennen':
      return (
        <div class="deco" aria-hidden="true">
          <div class="checker" />
          <div class="lights">{many(5)}</div>
          <div class="streaks">{many(8)}</div>
        </div>
      );
    case 'flug':
      return (
        <div class="deco" aria-hidden="true">
          <div class="sky-f" />
          <div class="clouds-f">{many(5)}</div>
          <div class="stars-f" />
        </div>
      );
    case 'meer': return <MeerScene />;
    case 'flora': return <FloraScene />;
    case 'scifi': return <ScifiScene />;
    case 'elemente': return <ElementeScene />;
    case 'zug': {
      // Fahrt im Fokus mit dem Fortschritt, in der Pause steht der Zug am Bahnsteig (ganz rechts)
      const p = v.kind === 'stopwatch' ? v.frac : v.phase !== 'focus' ? 1 : !v.active && v.frac >= 1 ? 0 : 1 - v.frac;
      return <ZugScene station={pick(ZUG_STOPS, Math.max(0, cycle - 1))} p={p} stage={`${v.phase}-${v.active}`} />;
    }
    case 'amtlich':
      return (
        <div class="deco" aria-hidden="true">
          <div class="form-head">
            <span>Formular TW-1 · Zeiterfassung</span>
            <FormState text={v.paused ? 'Pendent' : !v.active ? 'Eingang' : v.kind === 'stopwatch' ? 'In Bearbeitung' : OFFICE[v.phase]} />
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
      return <div class="dial-fx" aria-hidden="true"><ScopeXY /></div>;
    case 'barock':
      return (
        <div class="dial-fx" aria-hidden="true">
          <Pendulum />
        </div>
      );
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
    case 'elemente':
      return <div class="dial-fx" aria-hidden="true"><ElementMarks /><div class="el-aura" /></div>;
    case 'scifi':
      return <div class="dial-fx" aria-hidden="true"><div class="holo"><i /><i /><i /></div></div>;
    case 'flora':
      return <div class="dial-fx" aria-hidden="true"><FloraWreath /></div>;
    case 'zug':
      return <div class="dial-fx" aria-hidden="true"><SbbClock class="sbb-dial" hands={false} /></div>;
    default:
      return null;
  }
}

/** Pendel hinter der Uhr; der Takt wird einmal beim Einblenden auf die echten Sekunden gelegt */
function Pendulum() {
  const [delay] = useState(() => SECOND_SYNC());
  return <div class="pendulum" style={{ animationDelay: delay }}><i class="rod" /><i class="bob" /></div>;
}

/** Status im Formularkopf, wird bei jedem Wechsel neu «getippt» */
const FormState = ({ text }: { text: string }) => (
  <span class="form-state"><span key={text} class="typed" style={{ '--chars': text.length }}>{text}</span></span>
);

/** Negative Verzögerung, damit Pendel und Sekundenpunkt im Takt der echten Sekunden laufen */
export const SECOND_SYNC = (period = 2000): string => `${-((Date.now() % period) / 1000).toFixed(3)}s`;

/* ---------- Einblendung beim Phasenwechsel ---------- */

const CUT_IN: Record<Skin, Record<TimerView['phase'], [string, string]>> = {
  klassisch: { focus: ['Fokus', 'Konzentriert bleiben'], short_break: ['Kurze Pause', 'Durchatmen'], long_break: ['Lange Pause', 'Gut gemacht'] },
  anime: { focus: ['集中モード!', 'Fokus'], short_break: ['休憩タイム!', 'Kurze Pause'], long_break: ['おやすみ〜', 'Lange Pause'] },
  technik: { focus: ['TRIG CH1', 'Fokus · Sinus'], short_break: ['TRIG CH2', 'Pause · Rechteck'], long_break: ['XY-MODUS', 'Lange Pause · Lissajous'] },
  barock: { focus: ['Allegro', 'Fokus'], short_break: ['Intermezzo', 'Kurze Pause'], long_break: ['Adagio', 'Lange Pause'] },
  natur: { focus: ['Pflanzen', 'Fokus'], short_break: ['Durchatmen', 'Kurze Pause'], long_break: ['Abendruhe', 'Lange Pause'] },
  amtlich: { focus: ['Antrag: Fokus', 'In Bearbeitung'], short_break: ['Bewilligt', 'Kaffeepause'], long_break: ['Bewilligt', 'Mittagspause'] },
  rennen: { focus: ['Lights out!', 'Fokus'], short_break: ['Boxenstopp', 'Kurze Pause'], long_break: ['Safety Car', 'Lange Pause'] },
  flug: { focus: ['Take-off', 'Fokus'], short_break: ['Reiseflughöhe', 'Kurze Pause'], long_break: ['Landeanflug', 'Lange Pause'] },
  meer: { focus: ['Abtauchen', 'Fokus'], short_break: ['Luft holen', 'Kurze Pause'], long_break: ['Ebbe', 'Lange Pause'] },
  flora: { focus: ['Aufblühen', 'Fokus'], short_break: ['Nektarpause', 'Kurze Pause'], long_break: ['Siesta im Garten', 'Lange Pause'] },
  scifi: { focus: ['Warp aktiviert', 'Fokus'], short_break: ['Orbit erreicht', 'Kurze Pause'], long_break: ['Andockmanöver', 'Lange Pause'] },
  elemente: { focus: ['Feuer entfacht', 'Fokus'], short_break: ['Wasser fliesst', 'Kurze Pause'], long_break: ['Luft bewegt', 'Lange Pause'] },
  zug: { focus: ['Abfahrt!', 'Fokus'], short_break: ['Kurzer Halt', 'Kurze Pause'], long_break: ['Umsteigen', 'Lange Pause'] },
};

/** Welle durchs Zifferblatt und Banner im Stil; wird über key bei jedem Wechsel neu abgespielt */
export function PhaseCutIn({ skin, phase, late = false }: { skin: Skin; phase: TimerView['phase']; late?: boolean }) {
  const [title, sub] = CUT_IN[skin][phase];
  return (
    <div class={`deco cutin cutin-${skin}`} aria-hidden="true" style={late ? { '--cut-delay': '3.8s' } : undefined}>
      <div class="cutin-band"><b>{title}</b><small>{sub}</small></div>
    </div>
  );
}

const SFX: Record<TimerView['phase'], string> = { focus: 'ドキドキ', short_break: 'ふわ〜', long_break: 'すやすや' };
const OFFICE: Record<TimerView['phase'], string> = { focus: 'In Bearbeitung', short_break: 'Kaffeepause', long_break: 'Mittagspause' };

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
    case 'rennen':
      return <span class="race-badge" aria-hidden="true">{stop ? 'Zeitfahren' : v.phase === 'focus' ? 'Rennen' : v.phase === 'short_break' ? 'Box' : 'Safety Car'}</span>;
    case 'flug':
      return <span class="flight-badge" aria-hidden="true">{stop ? 'Flugzeit' : v.phase === 'focus' ? 'Steigflug' : v.phase === 'short_break' ? 'Reiseflug' : 'Sinkflug'}</span>;
    case 'meer':
      return <span class="theme-badge" aria-hidden="true">{stop ? 'Tauchzeit' : v.phase === 'focus' ? 'Tauchgang' : v.phase === 'short_break' ? 'Auftauchen' : 'Riff-Pause'}</span>;
    case 'flora':
      return <span class="theme-badge" aria-hidden="true">{stop ? 'Gartenzeit' : v.phase === 'focus' ? 'Blütezeit' : v.phase === 'short_break' ? 'Nektarpause' : 'Siesta'}</span>;
    case 'scifi':
      return <span class="theme-badge" aria-hidden="true">{stop ? 'Missionszeit' : v.phase === 'focus' ? 'Warp' : v.phase === 'short_break' ? 'Orbit' : 'Andocken'}</span>;
    case 'elemente':
      return <span class="theme-badge" aria-hidden="true">{ELEMENT_OF(v) === 3 ? 'Erde' : ['Feuer', 'Wasser', 'Luft'][ELEMENT_OF(v)]}</span>;
    case 'zug':
      return <span class="theme-badge" aria-hidden="true">{stop ? 'Fahrzeit' : v.phase === 'focus' ? 'Fahrt' : v.phase === 'short_break' ? 'Halt' : 'Endstation'}</span>;
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

/** Elemente-Stil: Feuer im Fokus, Wasser in der kurzen, Luft in der langen Pause, Erde in Ruhe und bei der Stechuhr */
const ELEMENT_OF = (v: TimerView): number => (!v.active || v.kind === 'stopwatch' ? 3 : v.phase === 'focus' ? 0 : v.phase === 'short_break' ? 1 : 2);
const pick = <T,>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length]!;
/** Ziele der Bahnfahrt (Zug): Fokus fährt hin, die Pause danach hält dort */
const ZUG_STOPS = ['Bern', 'Luzern', 'Chur', 'Lugano', 'Genève', 'St. Gallen'] as const;

/** Heute geschaffte Pomodoros (für den Wald im Forest-Stil) */
function todaysPomodoros(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return entities.value.time_logs.filter((l) => l.counts_as_pomodoro && l.start_time >= start.getTime()).length;
}

export function SkinCompanion({ skin, v, say, set, yay, cycle, every, frac = v.frac, seek }: {
  skin: Skin; v: TimerView; say: string; set: UserSettings; yay: boolean; cycle: number; every: number;
  /** angezeigter Zeiger-Anteil (beim Ziehen die Vorschau) */
  frac?: number;
  /** Reise-Leiste ziehen wie den Zeiger (nur Pomodoro) */
  seek?: Seek;
}) {
  // Fortschritt der laufenden Phase: 0 am Anfang, 1 am Ende (Stechuhr: Anteil der laufenden Stunde).
  // Steht der Zeiger schon vor dem Start nicht mehr ganz oben, zeigt der Fortschritt das ebenfalls.
  const p = yay ? 1 : v.kind === 'stopwatch' ? (v.active ? frac : 0) : !v.active && frac >= 1 ? 0 : 1 - Math.min(1, frac);
  const lap = `Runde ${(cycle % Math.max(1, every)) + 1} von ${Math.max(1, every)}`;
  switch (skin) {
    case 'klassisch':
      return <TomatoFill p={p} round={lap} />;
    case 'anime':
      return <div class="companion-stack"><div class="mascot-wrap"><Mascot mood={v.mood} /><p class="bubble">{say}</p></div><PowerBar p={p} /></div>;
    case 'technik':
      return <div class="companion-stack"><ScopeReadout v={v} set={set} /><LedBar p={p} /></div>;
    case 'barock':
      return (
        <div class="baroque-row" aria-hidden="true">
          <Candle />
          <Hourglass p={p} running={v.running} />
          <p class="motto baroque-motto">{yay ? MOTTO.yay : MOTTO[v.mood]}</p>
          <Candle />
        </div>
      );
    case 'natur': {
      // Pro Pomodoro ein Baum, jedes Mal eine andere Art; in der Pause steht der gerade gewachsene Baum
      const focus = v.phase === 'focus' && v.kind === 'pomodoro';
      const done = todaysPomodoros();
      // In der Pause steht der zuletzt gewachsene Baum, aber nur wenn heute schon einer gewachsen ist
      const grown = !focus && v.kind === 'pomodoro' && done > 0;
      const kind = grown ? cycle - 1 : cycle;
      const growth = yay ? 1 : v.kind === 'stopwatch' ? p : grown ? 1 : focus && v.active ? p : 0.04;
      return (
        <div class="forest-row" aria-hidden="true">
          <Tree kind={((kind % 6) + 6) % 6} growth={growth} />
          <div class="forest-info">
            <p class="motto">{pick(TREE_KINDS, kind)}{grown ? ' · gewachsen' : v.active ? ` · ${Math.round(growth * 100)} %` : ' · wartet auf dich'}</p>
            <div class="mini-forest">{Array.from({ length: Math.min(done, 12) }, (_, i) => <Tree key={i} kind={i} growth={1} size="mini" />)}</div>
            <small class="muted">{done ? `Dein Wald heute: ${done} ${done === 1 ? 'Baum' : 'Bäume'}` : 'Heute noch kein Baum'}</small>
          </div>
        </div>
      );
    }
    case 'amtlich':
      return (
        <div class="companion-stack">
          <div class="visum" aria-hidden="true">
            <span>Visum <i /></span>
            <span>Datum <b>{new Date().toLocaleDateString('de-CH')}</b></span>
          </div>
          <PaperStack p={p} />
        </div>
      );
    case 'rennen':
      return <Journey p={p} from="Start" to="Ziel" vehicle="car" detail={lap} seek={seek} />;
    case 'flug':
      return <Journey p={p} from="ZRH" to={pick(['CDG', 'FCO', 'LHR', 'BCN', 'JFK', 'NRT'], cycle)} vehicle="plane" detail={`FL ${Math.round(p * 350)}`} seek={seek} />;
    case 'meer':
      return <DepthGauge p={p} />;
    case 'flora':
      return <Bouquet p={p} />;
    case 'scifi':
      return <Journey p={p} from="Erde" to={pick(['Mond', 'Mars', 'Jupiter', 'Saturn', 'Neptun'], cycle)} vehicle="ship" detail={`Warp ${(1 + p * 8).toFixed(1)}`} seek={seek} />;
    case 'elemente':
      return <ElementOrbs p={p} active={ELEMENT_OF(v)} />;
    case 'zug':
      return <Journey p={p} from="Zürich HB" to={pick(ZUG_STOPS, cycle)} vehicle="train" stops={3} seek={seek} />;
  }
}

/** Kerze: Docht, Flamme mit blauem Kern, Lichthof */
const Candle = () => <span class="candle"><i class="glow" /><i class="flame" /><i class="wax" /></span>;

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

/** Knopf zum Pausenspiel des Stils (Sci-Fi, Flora, Rennen, Forest), nur in den Pausen */
export function GameButton({ skin, v }: { skin: Skin; v: TimerView }) {
  const id = GAME_OF_SKIN[skin];
  if (!id || v.kind !== 'pomodoro' || v.phase === 'focus') return null;
  return (
    <button type="button" class="btn sr-open" onClick={() => (gameOpen.value = id)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10a5 5 0 0 1 0 10c-1.6 0-2.4-1-3.4-2h-3.2c-1 1-1.8 2-3.4 2A5 5 0 0 1 7 7Zm1 3v1.5H6.5v1.5H8v1.5h1.5V13H11v-1.5H9.5V10H8Zm8 .5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" /></svg>
      {GAMES[id].button}
    </button>
  );
}
