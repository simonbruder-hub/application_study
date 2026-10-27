/** Kurze Meldung unten am Bildschirm */
import { signal } from '@preact/signals';

const meldung = signal<{ text: string; n: number } | null>(null);
let timer: number | undefined;

export function toast(text: string) {
  meldung.value = { text, n: (meldung.value?.n ?? 0) + 1 };
  clearTimeout(timer);
  timer = window.setTimeout(() => { meldung.value = null; }, 2800);
}

export function Toast() {
  const m = meldung.value;
  return m ? <div class="toast" role="status" key={m.n}>{m.text}</div> : null;
}
