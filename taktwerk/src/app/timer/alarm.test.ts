import { afterEach, describe, expect, it, vi } from 'vitest';

/** Nachbau von Worker: merkt sich Nachrichten, «klingelt» auf Abruf */
class FakeWorker {
  static last: FakeWorker | null = null;
  posted: unknown[] = [];
  onmessage: (() => void) | null = null;
  constructor() { FakeWorker.last = this; }
  postMessage(m: unknown) { this.posted.push(m); }
}

afterEach(() => { vi.unstubAllGlobals(); FakeWorker.last = null; });

describe('Wecker im Worker', () => {
  it('stellt, verschiebt und löscht den Wecker und ruft beim Klingeln zurück', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.resetModules();
    const a = await import('./alarm');
    const rang = vi.fn();
    a.onAlarm(rang);
    a.setAlarm(1500.4);
    a.setAlarm(-20);
    a.setAlarm(null);
    expect(FakeWorker.last?.posted).toEqual([1500, 0, null]);
    FakeWorker.last?.onmessage?.();
    expect(rang).toHaveBeenCalledTimes(1);
  });

  it('löschen ohne gestellten Wecker startet keinen Worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.resetModules();
    const a = await import('./alarm');
    a.setAlarm(null);
    expect(FakeWorker.last).toBeNull();
  });

  it('ohne Worker (alte Umgebung) passiert nichts', async () => {
    vi.stubGlobal('Worker', undefined);
    vi.resetModules();
    const a = await import('./alarm');
    expect(() => a.setAlarm(1000)).not.toThrow();
  });
});
