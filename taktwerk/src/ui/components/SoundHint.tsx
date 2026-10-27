import { prefs } from '../../app/prefs';
import { timerState } from '../../app/store';
import { audioReady, ensureAudio } from '../../app/timer/signals';
import { Icon } from '../Icon';

/**
 * Hinweis, solange der Browser den Ton sperrt: nach dem Neuladen läuft der Timer weiter, der Ton
 * kommt aber erst nach einem Klick oder Tastendruck. Jeder Klick in die App reicht.
 */
export function SoundHint() {
  const s = timerState.value;
  if (audioReady.value || !prefs.value.sound || s.status !== 'running' || s.kind !== 'pomodoro') return null;
  return (
    <div class="sound-hint" role="alert">
      <span>Der Browser hält den Ton zurück, bis du einmal klickst.</span>
      <button type="button" class="toast-btn" onClick={() => ensureAudio()}><Icon name="bell" />Ton aktivieren</button>
    </div>
  );
}
