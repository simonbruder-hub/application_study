import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Klänge selbst sind hier egal: nur prüfen, ob und wann ein Ton geplant wird
const playSound = vi.fn((..._args: unknown[]) => [] as OscillatorNode[]);
vi.mock('./sounds', () => ({ playSound: (...a: unknown[]) => playSound(...a) }));

/** Nachbau von AudioContext: läuft erst nach resume(), und nur wenn der «Browser» es erlaubt */
class FakeAudioContext {
  static allowed = false;
  state: AudioContextState = 'suspended';
  currentTime = 100;
  onstatechange: (() => void) | null = null;
  resume(): Promise<void> {
    if (FakeAudioContext.allowed && this.state !== 'running') { this.state = 'running'; this.onstatechange?.(); }
    return Promise.resolve();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  return await import('./signals');
}

beforeEach(() => {
  FakeAudioContext.allowed = false;
  playSound.mockClear();
  const win = new EventTarget() as EventTarget & { AudioContext?: unknown };
  win.AudioContext = FakeAudioContext;
  vi.stubGlobal('window', win);
});

afterEach(() => vi.unstubAllGlobals());

describe('Ton freischalten', () => {
  it('ohne Klick bleibt der Ton gesperrt und wird nicht geplant', async () => {
    const s = await load();
    s.armAudio();
    await flush();
    expect(s.audioReady.value).toBe(false);
    s.scheduleChime(Date.now() + 60_000, 'focusEnd', 0.8);
    expect(playSound).not.toHaveBeenCalled();
  });

  it('nach dem Neuladen schaltet irgendein Klick den Ton frei und meldet es einmal', async () => {
    const s = await load();
    const ready = vi.fn();
    s.onAudioReady(ready);
    s.armAudio();
    await flush();
    FakeAudioContext.allowed = true; // ab jetzt Nutzeraktion
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    await flush();
    expect(s.audioReady.value).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('nach der Freigabe wird der Ton genau auf das Phasenende geplant', async () => {
    const s = await load();
    s.onAudioReady(() => s.scheduleChime(Date.now() + 90_000, 'focusEnd', 0.8));
    s.armAudio();
    FakeAudioContext.allowed = true;
    window.dispatchEvent(new Event('keydown'));
    await flush();
    expect(playSound).toHaveBeenCalledTimes(1);
    const when = playSound.mock.calls[0]?.[2] as number;
    expect(when).toBeGreaterThan(100 + 89);
    expect(when).toBeLessThanOrEqual(100 + 90);
  });

  it('ohne Sperre (Desktop-App) ist der Ton schon beim Start bereit', async () => {
    FakeAudioContext.allowed = true;
    const s = await load();
    s.armAudio();
    await flush();
    expect(s.audioReady.value).toBe(true);
  });

  it('ein gesperrter Ton wird nicht nachträglich verspätet abgespielt', async () => {
    const s = await load();
    s.armAudio();
    s.scheduleChime(Date.now() + 1000, 'focusEnd', 0.8);
    expect(s.chimeWasScheduledFor(Date.now() + 1000)).toBe(false);
    expect(playSound).not.toHaveBeenCalled();
  });
});
