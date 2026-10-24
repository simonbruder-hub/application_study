/**
 * Signale rund um den Timer: Signalton (WebAudio, im Voraus auf das Phasenende geplant – klingt
 * pünktlich auch in gedrosselten Hintergrund-Tabs), Systembenachrichtigung, Wake Lock und
 * Medien-Steuerung (Android-Benachrichtigung / Sperrbildschirm, hält die App im Hintergrund aktiv).
 */

import { prefs } from '../prefs';
import { playSound, type SoundId } from './sounds';

let audio: AudioContext | null = null;
let scheduled: { at: number; nodes: OscillatorNode[] } | null = null;

export type ChimeKind = 'focusEnd' | 'shortEnd' | 'longEnd' | 'test';

/** Muss in einer Nutzeraktion (Klick, Taste) aufgerufen werden, sonst blockiert der Browser den Ton. */
export function ensureAudio(): AudioContext | null {
  try {
    if (!audio) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
    }
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
  return audio;
}

/** Klang je Ereignis aus den Geräte-Einstellungen; «test» spielt einen bestimmten Klang zur Vorschau */
function playChime(kind: ChimeKind, volume: number, when?: number, sound?: SoundId): OscillatorNode[] {
  const ctx = audio;
  if (!ctx) return [];
  const key = kind === 'focusEnd' ? 'focus' : kind === 'shortEnd' ? 'short' : 'long';
  return playSound(ctx, sound ?? prefs.value.sounds[key], when ?? ctx.currentTime + 0.02, Math.min(1, Math.max(0, volume)));
}

/** Ton auf den Zeitpunkt endsAt (Epoch-ms) planen; ersetzt eine frühere Planung. */
export function scheduleChime(endsAt: number | null, kind: ChimeKind, volume: number): void {
  if (scheduled && scheduled.at === endsAt) return;
  cancelChime();
  if (!audio || endsAt === null || audio.state !== 'running') return;
  const delay = Math.max(0, (endsAt - Date.now()) / 1000);
  scheduled = { at: endsAt, nodes: playChime(kind, volume, audio.currentTime + delay) };
}

export function cancelChime(): void {
  scheduled?.nodes.forEach((n) => { try { n.stop(); } catch { /* bereits gestoppt */ } });
  scheduled = null;
}

/** War für dieses Phasenende bereits ein Ton geplant (und spielt gerade)? Dann nicht doppelt läuten. */
export function chimeWasScheduledFor(endsAt: number): boolean {
  const hit = scheduled !== null && scheduled.at === endsAt && audio?.state === 'running';
  if (hit) scheduled = null; // weiterklingen lassen
  return hit;
}

export function chimeNow(kind: ChimeKind, volume: number, sound?: SoundId): void {
  ensureAudio();
  playChime(kind, volume, undefined, sound);
}

/* ---------- Benachrichtigung ---------- */

export async function requestNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  try {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function notify(title: string, body: string): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // renotify: gleiche Kennung ersetzt die alte Meldung, soll aber trotzdem wieder klingeln/vibrieren
    const opts = { body, tag: 'pomodoro', icon: './icon-192.png', renotify: true, vibrate: [200, 100, 200] } as NotificationOptions;
    if (navigator.serviceWorker?.controller) {
      void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => undefined);
    } else new Notification(title, opts);
  } catch { /* nicht verfügbar */ }
}

/* ---------- Wake Lock ---------- */

let wakeLock: WakeLockSentinel | null = null;

export async function holdWakeLock(on: boolean): Promise<void> {
  try {
    if (!on) { await wakeLock?.release(); wakeLock = null; return; }
    if (wakeLock || document.hidden || !('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

/* ---------- Medien-Steuerung / Hintergrund-Modus ---------- */

let bgAudio: HTMLAudioElement | null = null;

function silentWavUrl(): string {
  const rate = 8000;
  const n = rate * 10;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export interface MediaInfo {
  enabled: boolean;
  running: boolean;
  title: string;
  artist: string;
  durationSec: number | null;
  positionSec: number | null;
}

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  next: () => void;
}

let handlersSet = false;

export function syncMediaSession(info: MediaInfo, handlers: MediaHandlers): void {
  try {
    if (info.enabled && info.running) {
      if (!bgAudio) { bgAudio = new Audio(silentWavUrl()); bgAudio.loop = true; }
      if (bgAudio.paused) void bgAudio.play().catch(() => undefined);
    } else if (bgAudio && !bgAudio.paused) bgAudio.pause();

    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!info.enabled) { ms.metadata = null; ms.playbackState = 'none'; return; }
    if (!handlersSet) {
      handlersSet = true;
      const h = (a: MediaSessionAction, fn: () => void) => { try { ms.setActionHandler(a, fn); } catch { /* nicht unterstützt */ } };
      h('play', () => handlers.play());
      h('pause', () => handlers.pause());
      h('stop', () => handlers.pause());
      h('nexttrack', () => handlers.next());
    }
    ms.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: 'Taktwerk' });
    ms.playbackState = info.running ? 'playing' : 'paused';
    if (ms.setPositionState && info.durationSec && info.positionSec !== null) {
      ms.setPositionState({ duration: info.durationSec, playbackRate: 1, position: Math.min(info.durationSec, Math.max(0, info.positionSec)) });
    }
  } catch { /* Medien-API nicht verfügbar */ }
}
