import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerDB } from '../data/db';

// Klänge selbst sind hier egal: nur prüfen, ob und wie oft sie an die Desktop-App gehen
vi.mock('./timer/sounds', () => ({ playSound: () => [] }));

class FakeOfflineAudioContext {
  constructor(_ch: number, private readonly length: number, _rate: number) {}
  startRendering() {
    const data = new Float32Array(this.length);
    data.fill(0.5, 0, 100);
    return Promise.resolve({ getChannelData: () => data });
  }
}

const invoke = vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>();
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

async function load(build: string = 'desktop') {
  vi.resetModules();
  vi.stubGlobal('__PP_BUILD__', build);
  return await import('./desktop');
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(null);
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke } });
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
});

afterEach(() => vi.unstubAllGlobals());

describe('Erkennung', () => {
  it('Desktop nur im Desktop-Build mit Tauri', async () => {
    expect((await load('desktop')).isDesktop()).toBe(true);
    expect((await load('web')).isDesktop()).toBe(false);
  });

  it('ältere Desktop-App: Online-Version (Web-Build) in Tauri', async () => {
    const d = await load('web');
    expect(d.isOldDesktop()).toBe(true);
    expect(d.isWidget()).toBe(false);
  });

  it('im Web-Build ruft nichts die Desktop-App auf', async () => {
    const d = await load('web');
    expect(await d.openWidget()).toBe(false);
    d.setDesktopAlarm({ end: 1, delayMs: 1000, sound: null, note: null });
    await flush();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('Ton und Benachrichtigung am Phasenende', () => {
  it('Klang einmal ablegen, dann das Phasenende mit Schlüssel melden', async () => {
    const d = await load();
    const alarm = { end: 5_000_000, delayMs: 60_000, sound: { id: 'gong' as const, volume: 0.7 }, note: { title: 'Fokus beendet', body: 'Pause' } };
    d.setDesktopAlarm(alarm);
    await flush(); await flush(); await flush();
    expect(invoke).toHaveBeenCalledWith('sound_load', expect.objectContaining({ key: 'gong@0.70', rate: 32000 }));
    const set = invoke.mock.calls.find(([c]) => c === 'alarm_set');
    expect(set?.[1]).toMatchObject({ key: '5000000', sound: 'gong@0.70', title: 'Fokus beendet', body: 'Pause' });
    expect(set?.[1]?.delayMs).toBeGreaterThan(59_000);

    // gleiche Meldung (z. B. nach jeder Zustandsänderung) geht nicht nochmals raus
    invoke.mockClear();
    d.setDesktopAlarm(alarm);
    await flush(); await flush();
    expect(invoke).not.toHaveBeenCalled();

    // nächste Phase mit demselben Klang: kein zweites sound_load
    d.setDesktopAlarm({ ...alarm, end: 6_000_000 });
    await flush(); await flush(); await flush();
    expect(invoke.mock.calls.map(([c]) => c)).toEqual(['alarm_set']);
  });

  it('nichts geplant: alarm_clear', async () => {
    const d = await load();
    d.setDesktopAlarm({ end: 1, delayMs: 1000, sound: null, note: { title: 'a', body: 'b' } });
    await flush();
    d.setDesktopAlarm(null);
    await flush();
    expect(invoke).toHaveBeenLastCalledWith('alarm_clear', undefined);
  });
});

describe('Datenübernahme aus der bisherigen Desktop-App', () => {
  afterEach(async () => { await new PlannerDB().delete(); });

  it('ergänzt fehlende Datensätze, lässt vorhandene stehen, übernimmt Einstellungen', async () => {
    const db = new PlannerDB();
    await db.open();
    await db.projects.put({ id: 'p1', name: 'Neu' } as never);
    db.close();
    localStorage.setItem('pomodoro-planer.v2.prefs', '{"skin":"klassisch"}');

    const payload = {
      ok: true,
      tables: {
        projects: [{ id: 'p1', name: 'Alt' }, { id: 'p2', name: 'Nur alt' }],
        time_logs: [{ id: 't1', duration_seconds: 1500 }],
        meta: [{ key: 'device_id', value: 'dev-alt' }],
        unbekannt: [{ id: 'x' }],
      },
      local: { 'pomodoro-planer.v2.prefs': '{"skin":"zug"}', 'sb-xyz-auth-token': 'token' },
    };
    invoke.mockImplementation(async (cmd) => (cmd === 'handover_take' ? JSON.stringify(payload) : null));
    const d = await load();
    expect(await d.takeHandover()).toBe(true);

    const after = new PlannerDB();
    await after.open();
    expect((await after.projects.get('p1'))?.name).toBe('Neu');
    expect((await after.projects.get('p2'))?.name).toBe('Nur alt');
    expect(await after.time_logs.count()).toBe(1);
    expect(await after.getMeta('device_id')).toBe('dev-alt');
    after.close();
    expect(localStorage.getItem('pomodoro-planer.v2.prefs')).toBe('{"skin":"zug"}');
    expect(localStorage.getItem('sb-xyz-auth-token')).toBe('token');
  });

  it('ohne Daten oder bei Fehler: nichts tun', async () => {
    const d = await load();
    expect(await d.takeHandover()).toBe(false);
    invoke.mockResolvedValue(JSON.stringify({ ok: false, error: 'x' }));
    expect(await d.takeHandover()).toBe(false);
  });
});
