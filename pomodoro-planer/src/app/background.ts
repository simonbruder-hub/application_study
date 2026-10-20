/**
 * Alles, was den Timer ausserhalb der Ansicht sichtbar hält: Fenstertitel mit Restzeit,
 * Medien-Steuerung (Android-Benachrichtigung, Sperrbildschirm), Hinweise nach einer Phase.
 */
import { effect } from '@preact/signals';
import { toast } from '../ui/toast';
import { targetTitle } from './selectors';
import { app, phaseEvents } from './services';
import { prefs } from './prefs';
import { timerState } from './store';
import type { PhaseCompleteInfo } from './timer/controller';
import { syncMediaSession } from './timer/signals';
import { flashMood, readTimer } from './timer/view';

export function initBackground(): () => void {
  const disposeTitle = effect(() => {
    const v = readTimer();
    const title = targetTitle(timerState.value);
    document.title = v.active ? `${v.clock} · ${v.paused ? 'Pausiert' : v.phaseLabel} – ${title}` : 'Pomodoro-Planer';
    const p = prefs.value;
    syncMediaSession({
      enabled: p.background && v.active,
      running: v.running,
      title: `${v.clock} · ${v.phaseLabel}`,
      artist: title,
      durationSec: v.plannedSec,
      positionSec: v.plannedSec !== null ? v.plannedSec * (1 - v.frac) : null,
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
    if (info.phase === 'focus' && info.loggedSeconds) {
      flashMood.value = 'yay';
      if (yayTimer) clearTimeout(yayTimer);
      yayTimer = setTimeout(() => { flashMood.value = null; }, 8000);
    }
  };
  phaseEvents.addEventListener('complete', onComplete);
  return () => {
    disposeTitle();
    phaseEvents.removeEventListener('complete', onComplete);
  };
}
