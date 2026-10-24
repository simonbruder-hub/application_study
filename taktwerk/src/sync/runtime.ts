/**
 * Laufzeit-Abhängigkeiten der Sync-Schicht (Browser-Ereignisse, Timer, Uhrstand) –
 * gekapselt, damit Tests sie injizieren können.
 */
import { META } from '../data/db';
import type { Repository } from '../data/repository';

type Listener = () => void;

/** window-ähnliches Objekt für online/offline/visibilitychange */
export interface SyncEnv {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  document?: {
    visibilityState?: string;
    addEventListener?(type: string, listener: Listener): void;
    removeEventListener?(type: string, listener: Listener): void;
  };
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function defaultEnv(): SyncEnv | null {
  return typeof window !== 'undefined' ? (window as unknown as SyncEnv) : null;
}

export function defaultIsOnline(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return typeof nav?.onLine === 'boolean' ? nav.onLine : true;
}

/** Ereignis-Listener registrieren und Abmeldefunktion liefern */
export function listen(target: Pick<SyncEnv, 'addEventListener' | 'removeEventListener'>, type: string, fn: Listener): () => void {
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}

/** visibilitychange hängt am document (bubbelt aber auch zum window) */
export function listenVisible(env: SyncEnv, fn: Listener): () => void {
  const doc = env.document;
  const handler = () => {
    if ((doc?.visibilityState ?? 'visible') === 'visible') fn();
  };
  if (doc?.addEventListener && doc.removeEventListener) {
    doc.addEventListener('visibilitychange', handler);
    return () => doc.removeEventListener!('visibilitychange', handler);
  }
  return listen(env, 'visibilitychange', handler);
}

/**
 * Uhrstand der HLC sichern, nachdem ausserhalb des Repositorys ein Zeitstempel vergeben
 * oder beobachtet wurde. Der Wert wird erst in der Transaktion gelesen und nie verkleinert.
 */
export async function persistClock(repo: Repository): Promise<void> {
  const { db } = repo;
  await db.transaction('rw', db.meta, async () => {
    const stored = (await db.getMeta<number>(META.clock)) ?? 0;
    if (repo.clock.value > stored) await db.setMeta(META.clock, repo.clock.value);
  });
}
