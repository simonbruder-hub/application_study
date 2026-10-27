/**
 * Wecker für das Phasenende in einem eigenen Thread (Web Worker). Browser bremsen Zeitgeber in
 * Hintergrund-Tabs (Chrome nach einigen Minuten auf einmal pro Minute), Zeitgeber in Workers
 * nicht. So kommen Phasenwechsel und Benachrichtigung pünktlich, auch hinter anderen Programmen.
 */

const SRC = 'let t;onmessage=(e)=>{clearTimeout(t);if(e.data!==null)t=setTimeout(()=>postMessage(0),e.data)}';

let worker: Worker | null | undefined;
let handler: (() => void) | null = null;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })));
    worker.onmessage = () => handler?.();
  } catch {
    worker = null; // ohne Worker bleibt der normale Takt des Timers
  }
  return worker;
}

/** Rückruf, wenn der Wecker klingelt */
export function onAlarm(fn: (() => void) | null): void {
  handler = fn;
}

/** Wecker in delayMs stellen; null löscht ihn */
export function setAlarm(delayMs: number | null): void {
  if (delayMs === null && !worker) return;
  getWorker()?.postMessage(delayMs === null ? null : Math.max(0, Math.round(delayMs)));
}
