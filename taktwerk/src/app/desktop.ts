/**
 * Desktop-App (Tauri, Ordner desktop/): Brücke zu den nativen Funktionen. Widget-Fenster, Ton und
 * Benachrichtigung am Phasenende, Updates und die einmalige Übernahme der Daten aus der bisherigen
 * Desktop-App. Nur im Desktop-Build aktiv (npm run build:desktop); im Browser und in der älteren
 * Desktop-App, die noch die Online-Version lädt, tun alle Funktionen nichts.
 */
import { signal } from '@preact/signals';
import { PlannerDB } from '../data/db';
import { playSound, type SoundId } from './timer/sounds';

declare const __PP_BUILD__: 'web' | 'standalone' | 'desktop';

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}
declare global {
  interface Window { __TAURI_INTERNALS__?: TauriInternals }
}

const build = (): string => (typeof __PP_BUILD__ === 'undefined' ? 'web' : __PP_BUILD__);

export const isDesktop = (): boolean =>
  build() === 'desktop' && typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

/** Dieses Fenster ist das Widget (eigenes Fenster der Desktop-App) */
export const isWidget = (): boolean => isDesktop() && new URLSearchParams(location.search).has('widget');

/** Ältere Desktop-App (bis 1.0.x): lädt die Online-Version, kennt kein Widget und keine Updates */
export const isOldDesktop = (): boolean =>
  build() === 'web' && typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

type Result<T> = { ok: true; value: T } | { ok: false };

async function call<T = null>(cmd: string, args?: Record<string, unknown>): Promise<Result<T>> {
  if (!isDesktop()) return { ok: false };
  try {
    return { ok: true, value: await window.__TAURI_INTERNALS__!.invoke<T>(cmd, args) };
  } catch (err) {
    console.warn(`Desktop: ${cmd} fehlgeschlagen`, err);
    return { ok: false };
  }
}

/* ---------- Fenster ---------- */

const PLACED_KEY = 'taktwerk.widget.placed';
const WIDTH_KEY = 'taktwerk.widget.width';

export function showMain(): void {
  void call('main_show');
}

/** Widget öffnen (blendet das Hauptfenster aus); beim ersten Mal oben rechts */
export async function openWidget(): Promise<boolean> {
  let placed = false;
  try { placed = localStorage.getItem(PLACED_KEY) === '1'; localStorage.setItem(PLACED_KEY, '1'); } catch { /* egal */ }
  return (await call('widget_open', { place: !placed })).ok;
}

/** Grosse Ansicht: Widget schliessen, Hauptfenster zeigen */
export function closeWidget(): void {
  void call('widget_close');
}

/** Widget-Fenster auf Breite und Inhaltshöhe setzen (CSS-Pixel); die Breite bleibt gemerkt */
export function fitWidget(width: number, height: number): void {
  try { localStorage.setItem(WIDTH_KEY, String(Math.round(width))); } catch { /* egal */ }
  void call('widget_fit', { width, height });
}

/** Breite des Widgets beim Öffnen: gemerkt, sonst 280 (das noch unsichtbare Fenster kennt seine Breite nicht sicher) */
export function widgetStartWidth(): number {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w >= 100 && w <= 1600) return w;
  } catch { /* Standard */ }
  return 280;
}

/* ---------- Ton und Benachrichtigung am Phasenende ---------- */

export interface DesktopAlarm {
  /** Phasenende (Serverzeit, ms); in allen Fenstern gleich, damit es nur einmal klingelt */
  end: number;
  delayMs: number;
  sound: { id: SoundId; volume: number } | null;
  note: { title: string; body: string } | null;
}

const RATE = 32000;
const loaded = new Map<string, Promise<boolean>>();

/** Klang mit derselben Synthese wie im Browser berechnen, als 16-Bit-PCM in Base64 */
async function renderSound(id: SoundId, volume: number): Promise<string> {
  const ctx = new OfflineAudioContext(1, RATE * 5, RATE);
  playSound(ctx, id, 0.02, volume);
  const data = (await ctx.startRendering()).getChannelData(0);
  let end = data.length;
  while (end > 0 && Math.abs(data[end - 1]!) < 1e-4) end--;
  const pcm = new Int16Array(end);
  for (let i = 0; i < end; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, data[i]!)) * 32767);
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function soundKey(id: SoundId, volume: number): string {
  return `${id}@${volume.toFixed(2)}`;
}

function loadSound(id: SoundId, volume: number): Promise<boolean> {
  const key = soundKey(id, volume);
  let p = loaded.get(key);
  if (!p) {
    p = renderSound(id, volume)
      .then((data) => call('sound_load', { key, rate: RATE, data }))
      .then((r) => r.ok, () => false);
    loaded.set(key, p);
  }
  return p;
}

let lastSent = '';

/** Phasenende an die Desktop-App melden (null: nichts geplant). Doppelte Meldungen werden ausgelassen. */
export function setDesktopAlarm(a: DesktopAlarm | null): void {
  if (!isDesktop()) return;
  const sig = a ? JSON.stringify([a.end, a.sound, a.note]) : '';
  if (sig === lastSent) return;
  lastSent = sig;
  if (!a) { void call('alarm_clear'); return; }
  const sent = Date.now();
  void (async () => {
    const ok = a.sound ? await loadSound(a.sound.id, a.sound.volume) : false;
    if (lastSent !== sig) return; // inzwischen überholt
    await call('alarm_set', {
      key: String(a.end),
      delayMs: Math.round(a.delayMs - (Date.now() - sent)),
      sound: ok && a.sound ? soundKey(a.sound.id, a.sound.volume) : null,
      title: a.note?.title ?? null,
      body: a.note?.body ?? null,
    });
  })();
}

/* ---------- Updates ---------- */

export interface UpdateInfo { version: string; notes: string | null }

/** Gefundenes Update (für Hinweis und Einstellungen) */
export const desktopUpdate = signal<UpdateInfo | null>(null);
export const desktopVersion = signal<string | null>(null);

/** Nach einer neuen Version fragen; ohne Netz: false */
export async function checkUpdate(): Promise<boolean> {
  const r = await call<UpdateInfo | null>('update_check');
  if (r.ok) desktopUpdate.value = r.value;
  return r.ok;
}

/** Herunterladen und installieren; die App startet danach neu. false: fehlgeschlagen */
export async function installUpdate(): Promise<boolean> {
  return (await call('update_install')).ok;
}

export async function loadDesktopInfo(): Promise<void> {
  const r = await call<{ version: string }>('desktop_info');
  desktopVersion.value = r.ok ? r.value.version : null;
}

/* ---------- Datenübernahme aus der bisherigen Desktop-App ---------- */

interface HandoverPayload {
  ok: boolean;
  tables?: Record<string, unknown[]> | null;
  local?: Record<string, string | null>;
}

/**
 * Daten der bisherigen Desktop-App übernehmen (einmalig, beim ersten Start). Datensätze, die hier
 * schon existieren, bleiben unverändert; Einstellungen (localStorage) kommen vollständig mit.
 * true: es wurde etwas übernommen, die App muss neu laden.
 */
export async function takeHandover(): Promise<boolean> {
  const r = await call<string | null>('handover_take');
  const raw = r.ok ? r.value : null;
  if (!raw) return false;
  let payload: HandoverPayload;
  try { payload = JSON.parse(raw) as HandoverPayload; } catch { return false; }
  if (!payload.ok) return false;
  let changed = false;
  if (payload.tables) {
    const db = new PlannerDB();
    await db.open();
    try {
      for (const table of db.tables) {
        const rows = payload.tables[table.name];
        if (!Array.isArray(rows) || !rows.length) continue;
        const keyPath = table.schema.primKey.keyPath as string;
        const keys = rows.map((r) => (r as Record<string, unknown>)[keyPath] as string);
        const existing = await table.bulkGet(keys);
        const fresh = rows.filter((_, i) => existing[i] === undefined);
        if (!fresh.length) continue;
        try { await table.bulkAdd(fresh); } catch (err) { console.warn(`Übernahme ${table.name}: teilweise`, err); }
        changed = true;
      }
    } finally {
      db.close();
    }
  }
  for (const [k, v] of Object.entries(payload.local ?? {})) {
    if (v === null) continue;
    try { localStorage.setItem(k, v); changed = true; } catch { /* Speicher voll */ }
  }
  return changed;
}
