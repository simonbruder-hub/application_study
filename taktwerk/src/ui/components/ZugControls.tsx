/**
 * Stil Zug: den Zug anfassen. Festhalten hält den Timer an, nach vorne schieben lässt die Zeit vorspringen
 * (zurückziehen gibt Zeit dazu), loslassen fährt weiter. Dazu oben links die Wahl des Zuges.
 */
import { useRef, useState } from 'preact/hooks';
import { prefs, setPrefs } from '../../app/prefs';
import { app } from '../../app/services';
import type { TimerView } from '../../app/timer/view';
import type { Seek } from './progress';
import { TRAINS } from './scenes';

export function ZugControls({ v, p, seek }: { v: TimerView; p: number; seek?: Seek }) {
  const grab = useRef<{ x: number; p: number; width: number; was: boolean; moved: boolean; last: number } | null>(null);
  const [held, setHeld] = useState(false);
  const model = prefs.value.train;
  const idx = Math.max(0, TRAINS.findIndex((t) => t.id === model));
  // gleiche Lage wie der Zug in der Szene (Breite 40 % der Karte, höchstens 210 px)
  const style = { '--zp': Math.min(1, Math.max(0, p)).toFixed(4) };
  const canSeek = !!seek && v.kind === 'pomodoro' && v.phase === 'focus';

  const end = () => {
    const g = grab.current;
    if (!g) return;
    grab.current = null;
    setHeld(false);
    if (g.moved && canSeek) { seek!.onDrag(null); seek!.onCommit(1 - g.last); }
    if (g.was) void app().timer.resume();
  };

  return (
    <div class="zug-controls">
      <button
        type="button" class="z-pick" title="Zug wechseln"
        onClick={() => setPrefs({ train: TRAINS[(idx + 1) % TRAINS.length]!.id })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3l2 3h-2.5l-2-3h-7l-2 3H4l2-3a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 3v5h12V6H6Zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>
        {TRAINS[idx]!.label}
      </button>
      <div
        class={`z-grab${held ? ' is-held' : ''}`} style={style} role="button" tabIndex={-1}
        aria-label="Zug festhalten hält den Timer an, nach vorne schieben spult vor"
        onPointerDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget as HTMLElement;
          el.setPointerCapture(e.pointerId);
          const card = el.parentElement!.getBoundingClientRect();
          const zw = Math.min(210, Math.max(150, card.width * 0.4));
          grab.current = { x: e.clientX, p, width: card.width * 0.94 - zw, was: v.running, moved: false, last: p };
          setHeld(true);
          if (v.running) void app().timer.pause();
        }}
        onPointerMove={(e) => {
          const g = grab.current;
          if (!g || !canSeek) return;
          const dx = e.clientX - g.x;
          if (Math.abs(dx) > 4) g.moved = true;
          if (!g.moved) return;
          g.last = Math.min(1, Math.max(0, g.p + dx / Math.max(40, g.width)));
          seek!.onDrag(1 - g.last);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {held && <span class="z-held-tip">{canSeek ? 'Angehalten · schieben spult vor' : 'Angehalten'}</span>}
      </div>
    </div>
  );
}
