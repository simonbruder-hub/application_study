/**
 * Alles, was den Timer ausserhalb der Ansicht sichtbar hält: Fenstertitel mit Restzeit,
 * Medien-Steuerung (Android-Benachrichtigung, Sperrbildschirm), Hinweise nach einer Phase.
 */
import { effect } from '@preact/signals';
import { elementOf } from './element';
import { playSpectacle, type SpxKind } from '../ui/components/Spectacle';
import { toast } from '../ui/toast';
import { targetTitle } from './selectors';
import { app, phaseEvents } from './services';
import { prefs } from './prefs';
import { timerState } from './store';
import type { PhaseCompleteInfo } from './timer/controller';
import { syncMediaSession } from './timer/signals';
import { celebration, flashMood, PHASE_ATTR, readTimer } from './timer/view';

export function initBackground(): () => void {
  let lastKey = '';
  /** Vorheriger Stand für das Elemente-Spektakel: welches Element gerade endet */
  let prev: { phase: string; active: boolean; kind: string; element: number } | null = null;
  const SPX: SpxKind[] = ['fire', 'water', 'air', 'earth'];
  const disposeTitle = effect(() => {
    const v = readTimer();
    const title = targetTitle(timerState.value);
    const p = prefs.value;
    // Der Anzeigetakt ist 250 ms – Titel und Medien-Steuerung nur bei sichtbarer Änderung aktualisieren
    const key = [v.clock, v.running, v.active, v.phaseLabel, title, p.background, p.skin, p.element].join('|');
    if (key === lastKey) return;
    lastKey = key;
    document.title = v.active ? `${v.clock} · ${v.paused ? 'Pausiert' : v.phaseLabel} – ${title}` : 'Taktwerk';
    // Stil-Szenen: Hintergrund und Animationen hängen an Phase und Lauf-Zustand
    const root = document.documentElement;
    root.dataset.phase = PHASE_ATTR[v.phase];
    root.dataset.run = v.running ? '1' : '0';
    root.dataset.active = v.active ? '1' : '0';
    // Stil Elemente: angezeigtes Element (fest gewählt oder nach Phase)
    const element = elementOf(v);
    if (p.skin === 'elemente') root.dataset.element = String(element); else delete root.dataset.element;
    // Spektakel, wenn ein Element endet. Nach Phase: Erde beim Start aus der Ruhe, Wasser und Luft am Ende der
    // kurzen und langen Pause. Fest gewählt: das gewählte Element am Ende jeder Pause.
    if (prev) {
      const fixed = p.element !== 'auto';
      if (!fixed && !prev.active && v.active) playSpectacle('earth');
      else if (prev.active && prev.phase !== v.phase && prev.phase !== 'focus') playSpectacle(SPX[fixed ? prev.element : prev.phase === 'short_break' ? 1 : 2]!);
    }
    prev = { phase: v.phase, active: v.active, kind: v.kind, element };
    syncMediaSession({
      enabled: p.background && v.active,
      running: v.running,
      title: `${v.clock} · ${v.phaseLabel}`,
      artist: title,
      durationSec: v.plannedSec,
      positionSec: v.plannedSec !== null ? Math.max(0, v.plannedSec - v.frac * (v.spanSec ?? v.plannedSec)) : null,
    }, {
      play: () => { void app().timer.resume(); },
      pause: () => { void app().timer.pause(); },
      next: () => {
        const s = timerState.value;
        if (s.kind === 'pomodoro' && s.phase !== 'focus') void app().timer.skip();
        else void app().timer.finish();
      },
    });
  });

  let yayTimer: ReturnType<typeof setTimeout> | null = null;
  const onComplete = (e: Event) => {
    const info = (e as CustomEvent<PhaseCompleteInfo>).detail;
    toast(info.message, { timeout: 7000 });
  };
  // Jede gespeicherte Session (Pomodoro geschafft, «Fertig & speichern», Stechuhr gestoppt) wird gefeiert
  const onLogged = () => {
    // Elemente: Feuer endet mit dem Fokus (die Stechuhr gehört zur Erde)
    playSpectacle(prefs.value.element !== 'auto' ? SPX[prev?.element ?? 0]! : prev?.kind === 'stopwatch' ? 'earth' : 'fire');
    flashMood.value = 'yay';
    celebration.value += 1;
    if (yayTimer) clearTimeout(yayTimer);
    yayTimer = setTimeout(() => { flashMood.value = null; }, 8000);
  };
  phaseEvents.addEventListener('logged', onLogged);
  phaseEvents.addEventListener('complete', onComplete);
  return () => {
    disposeTitle();
    phaseEvents.removeEventListener('complete', onComplete);
    phaseEvents.removeEventListener('logged', onLogged);
  };
}
