import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

/**
 * Desktop-Build (dist/desktop) im Browser, die Desktop-App (Tauri) wird nachgebildet: Jeder Aufruf
 * an Rust landet in window.__calls. Geprüft wird, was die App an die Desktop-App meldet.
 */
interface Fake {
  handover?: unknown;
  update?: { version: string; notes: string | null } | null;
}

function fakeTauri(fake: Fake) {
  const w = window as unknown as { __calls: [string, unknown][]; __TAURI_INTERNALS__: unknown };
  w.__calls = [];
  w.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args?: unknown) => {
      w.__calls.push([cmd, args]);
      if (cmd === 'handover_take') {
        // nur beim ersten Start, wie in der Desktop-App
        if (!fake.handover || sessionStorage.getItem('handover-done')) return Promise.resolve(null);
        sessionStorage.setItem('handover-done', '1');
        return Promise.resolve(JSON.stringify(fake.handover));
      }
      if (cmd === 'update_check') return Promise.resolve(fake.update ?? null);
      if (cmd === 'desktop_info') return Promise.resolve({ version: '1.1.0' });
      return Promise.resolve(null);
    },
  };
}

const calls = (page: Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __calls: [string, unknown][] }).__calls.filter(([x]) => x === c).map(([, a]) => a), cmd);

test.describe('Desktop-App', () => {
  test.skip(({ isMobile }) => isMobile, 'gilt für den Laptop');

  test('Hauptfenster: zeigt sich, Taste M öffnet das Widget statt der Mini-Ansicht', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(fakeTauri, {});
    await page.goto('./#fokus');
    await expect(page.locator('#main .boot')).toHaveCount(0);
    expect(await calls(page, 'main_show')).toHaveLength(1);

    await page.keyboard.press('m');
    await expect.poll(() => calls(page, 'widget_open')).toEqual([{ place: true }]);
    await expect(page.locator('.mini-root')).toHaveCount(0);
    await expect(page.locator('.app')).toBeVisible();

    // beim nächsten Start gleich wieder als Widget, das Hauptfenster bleibt ausgeblendet
    await page.reload();
    await expect(page.locator('#main .boot')).toHaveCount(0);
    await expect.poll(() => calls(page, 'widget_open')).toEqual([{ place: false }]);
    expect(await calls(page, 'main_show')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('Widget: Höhe folgt dem Inhalt, schmal gezogen nur noch Uhr und Start', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(fakeTauri, {});
    await page.setViewportSize({ width: 260, height: 400 });
    await page.goto('./?widget');
    const mini = page.locator('.widget .mini');
    await expect(mini).toBeVisible();
    await expect(page.locator('.app')).toHaveCount(0);

    const fit = async () => ((await calls(page, 'widget_fit')).at(-1) as { height: number } | undefined)?.height ?? 0;
    const fitWidth = async () => ((await calls(page, 'widget_fit')).at(-1) as { width: number } | undefined)?.width ?? 0;
    await expect.poll(fit).toBeGreaterThan(120);
    const full = await fit();
    const box = await page.locator('.widget').boundingBox();
    expect(Math.abs((box?.height ?? 0) - full)).toBeLessThanOrEqual(1);
    expect(full).toBeLessThan(260);

    // doppelt so breit: alles doppelt so gross, auch die Höhe
    await page.setViewportSize({ width: 520, height: 800 });
    await expect.poll(fit).toBeGreaterThan(full * 1.8);

    await page.setViewportSize({ width: 170, height: 400 });
    await expect(page.locator('.mini.is-compact')).toBeVisible();
    await expect.poll(fit).toBeLessThan(80);
    expect(await fitWidth()).toBe(170);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(170);

    // Start im Widget: Phasenende geht an die Desktop-App (Ton und Benachrichtigung aus Rust)
    await page.locator('.mini-toggle').click();
    await expect.poll(async () => (await calls(page, 'alarm_set')).length).toBeGreaterThan(0);
    const [alarm] = (await calls(page, 'alarm_set')) as { key: string; delayMs: number; sound: string | null }[];
    expect(alarm!.delayMs).toBeGreaterThan(24 * 60_000);
    expect(alarm!.delayMs).toBeLessThanOrEqual(25 * 60_000);
    expect(alarm!.sound).toMatch(/@/);
    expect(await calls(page, 'sound_load')).toHaveLength(1);

    await page.keyboard.press('Escape');
    await expect.poll(() => calls(page, 'widget_close')).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('Widget merkt sich die Breite: öffnet wieder so schmal, wie es war', async ({ page }) => {
    await page.addInitScript(fakeTauri, {});
    await page.addInitScript(() => localStorage.setItem('taktwerk.widget.width', '170'));
    // das neue Fenster hat zuerst die Standardbreite aus tauri.conf.json
    await page.setViewportSize({ width: 280, height: 400 });
    await page.goto('./?widget');
    await expect(page.locator('.mini.is-compact')).toBeVisible();
    const [first] = (await calls(page, 'widget_fit')) as { width: number; height: number }[];
    expect(first).toMatchObject({ width: 170 });
    expect(first!.height).toBeLessThan(80);
  });

  test('Update: Hinweis in der Kopfzeile, Installation auf Wunsch', async ({ page }) => {
    await page.addInitScript(fakeTauri, { update: { version: '9.9.9', notes: 'Neu: alles besser' } });
    await page.goto('./#fokus');
    const btn = page.locator('.topbar button:has-text("Update")');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await expect(page.locator('dialog')).toContainText('Taktwerk 9.9.9');
    await page.locator('dialog button:has-text("Jetzt installieren")').click();
    await expect.poll(() => calls(page, 'update_install')).toHaveLength(1);
  });

  test('Datenübernahme: Projekte und Einstellungen der bisherigen Desktop-App kommen mit', async ({ page }) => {
    const errors = trackErrors(page);
    const now = Date.now();
    const project = {
      id: '0b9e6a2e-5d1c-4c64-9a53-2f1c3a7c9d11', project_code: 'ALT1', name: 'Projekt aus der alten App', mode: 'study',
      status: 'active', color: '#2a7de1', planned_hours: null, start_date: null, end_date: null, notes: '', sort_order: 0,
      created_at: now, updated_at: now, updated_by: 'alt', is_deleted: false, _dirty: 1,
    };
    await page.addInitScript(fakeTauri, {
      handover: { ok: true, tables: { projects: [project] }, local: { 'pomodoro-planer.v2.prefs': JSON.stringify({ skin: 'zug' }) } },
    });
    await page.goto('./#projekte');
    await expect(page.locator('#main .boot')).toHaveCount(0);
    await expect(page.locator('#main')).toContainText('Projekt aus der alten App');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'zug');
    expect(errors).toEqual([]);
  });

  test('Übernahme-Skript: liest Datenbank und Einstellungen der Online-Version, ohne sie zu starten', async ({ page }) => {
    // gleiches Skript wie in der Desktop-App, nur für die Adresse des Testservers (Web-Build = bisherige Desktop-App)
    const script = readFileSync(new URL('../../desktop/src-tauri/src/handover.js', import.meta.url), 'utf8')
      .replace("'https://simonbruder-hub.github.io'", "'http://localhost:4173'");
    await page.goto('http://localhost:4173/#fokus');
    await expect(page.locator('#main .boot')).toHaveCount(0);
    await page.evaluate(() => new Promise<void>((resolve) => {
      localStorage.setItem('taktwerk.test', 'alt');
      const req = indexedDB.open('pomodoro-planer');
      req.onsuccess = () => {
        const tx = req.result.transaction('tasks', 'readwrite');
        tx.objectStore('tasks').put({ id: 'task-alt', title: 'Aufgabe aus der alten App', status: 'todo' });
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    }));

    await page.addInitScript(() => {
      const w = window as unknown as { __emitted: unknown[]; __TAURI_INTERNALS__: unknown };
      w.__emitted = [];
      w.__TAURI_INTERNALS__ = { invoke: (cmd: string, args: unknown) => { w.__emitted.push({ cmd, args }); return Promise.resolve(null); } };
    });
    await page.addInitScript(script);
    // das Skript bricht das Laden der Seite ab (window.stop), darum nur auf den Seitenwechsel warten
    await page.goto('http://localhost:4173/?desktop=1&handover=1', { waitUntil: 'commit' });
    const emitted = () => page.evaluate(() => (window as unknown as { __emitted: { cmd: string; args: { event: string; payload: Record<string, unknown> } }[] }).__emitted);
    await expect.poll(async () => (await emitted()).length).toBe(1);
    const [{ cmd, args }] = await emitted();
    expect(cmd).toBe('plugin:event|emit');
    expect(args.event).toBe('taktwerk-handover');
    const payload = args.payload as { ok: boolean; tables: Record<string, { id?: string }[]>; local: Record<string, string> };
    expect(payload.ok).toBe(true);
    expect(payload.tables.tasks?.map((t) => t.id)).toContain('task-alt');
    expect(payload.tables.meta?.length).toBeGreaterThan(0);
    expect(payload.local['taktwerk.test']).toBe('alt');
    // die Online-App selbst ist nicht gestartet
    await expect(page.locator('.app')).toHaveCount(0);
  });
});
