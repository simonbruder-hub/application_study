import { expect, test } from '@playwright/test';
import { clock, isMobile, nav, openApp, trackErrors } from './helpers';

test.describe('Timer', () => {
  test('startet ohne Fehler und zeigt 25:00', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await expect(clock(page)).toHaveText('25:00');
    await expect(page.locator('.sync')).toContainText(/Nur lokal|lokal/);
    expect(errors).toEqual([]);
  });

  test('Leertaste startet und pausiert; Zeit läuft aus Zeitstempeln weiter', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.keyboard.press('Space');
    await expect(page.locator('.btn-start')).toContainText('Pause');
    await page.clock.runFor(61_000);
    await expect(clock(page)).toHaveText('23:59');
    await page.keyboard.press('Space');
    await expect(page.locator('.btn-start')).toContainText('Weiter');
    await page.clock.runFor(120_000);
    await expect(clock(page)).toHaveText('23:59');
  });

  test('läuft nach dem Neuladen an der richtigen Stelle weiter', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.keyboard.press('Space');
    await page.clock.runFor(5 * 60_000);
    await expect(clock(page)).toHaveText('20:00');
    await page.reload();
    await expect(page.locator('#main .boot')).toHaveCount(0);
    await page.clock.runFor(60_000);
    // Die Uhr läuft während des Neuladens real weiter – Restzeit also höchstens 19:00, knapp darunter
    await expect(page.locator('.btn-start')).toContainText('Pause');
    const [m, sec] = (await clock(page).textContent())!.split(':').map(Number);
    const rest = m! * 60 + sec!;
    expect(rest).toBeLessThanOrEqual(19 * 60);
    expect(rest).toBeGreaterThan(18 * 60 + 20);
  });

  test('nach Ablauf wird gespeichert und die Pause startet automatisch', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.keyboard.press('Space');
    await page.clock.fastForward('25:02');
    await expect(page.locator('.toast')).toContainText('Pomodoro geschafft');
    await expect(page.locator('.phase-tab.is-on')).toContainText('Kurze Pause');
    await expect(page.locator('.btn-start')).toContainText('Pause');
    await expect(page.locator('.today-card .big-num')).toHaveText('25 min');
  });

  test('Stechuhr im Arbeitsmodus: Korrektur und Speichern', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.locator('.ws-btn[data-ws="work"]').click();
    await page.locator('.kind-row .seg-btn:has-text("Stechuhr")').click();
    await expect(clock(page)).toHaveText('00:00');
    await page.keyboard.press('Space');
    await page.clock.runFor(30_000);
    await page.getByRole('button', { name: '5 Minuten mehr' }).click();
    await expect(clock(page)).toHaveText('05:30');
    await page.getByRole('button', { name: /Stopp & speichern/ }).click();
    await expect(page.locator('.toast')).toContainText('Gespeichert: 6 min');
    await expect(clock(page)).toHaveText('00:00');
    await expect(page.locator('.today-card .big-num')).toHaveText('6 min');
    // Lernmodus zeigt die Arbeitszeit nicht
    await page.locator('.ws-btn[data-ws="study"]').click();
    await expect(page.locator('.today-card .big-num')).toHaveText('0 min');
  });

  test('Minimieren ohne Bild-im-Bild schaltet die Mini-Ansicht um', async ({ page }) => {
    await page.addInitScript(() => { delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture; });
    await openApp(page);
    await page.keyboard.press('m');
    await expect(page.locator('.mini-root .mini')).toBeVisible();
    await expect(page.locator('.app')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(page.locator('.mini .btn-start')).toContainText('Pause');
    await page.keyboard.press('Escape');
    await expect(page.locator('.app')).toBeVisible();
    await expect(page.locator('.mini-root')).toHaveCount(0);
  });

  test('Handy: angedockte Leiste ausserhalb der Fokus-Ansicht', async ({ page }) => {
    test.skip(!isMobile(page), 'nur Handy-Layout');
    await openApp(page);
    await page.locator('.btn-start').click();
    await nav(page, 'Aufgaben');
    const dock = page.locator('.dock');
    await expect(dock).toBeVisible();
    await expect(dock.locator('.dock-clock')).toContainText(/2[45]:\d\d/);
    await dock.getByRole('button', { name: 'Pause' }).click();
    await expect(dock).toContainText('pausiert');
    await dock.locator('.dock-main').click();
    await expect(page.locator('.timer-card')).toBeVisible();
    await expect(page.locator('.dock')).toHaveCount(0);
  });

  test('Logo führt zur Fokus-Ansicht, der Timer läuft weiter', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await page.locator('.btn-start').click();
    await page.clock.fastForward('02:00');
    await nav(page, 'Aufgaben');
    await expect(page).toHaveURL(/#aufgaben$/);
    await page.locator('a.brand:visible').first().click();
    await expect(page).toHaveURL(/#fokus$/);
    await expect(page.locator('.btn-start')).toContainText('Pause');
    await page.clock.fastForward('01:00');
    await expect(clock(page)).toHaveText('22:00');
  });

  test('Zeiger ziehen ändert die Restzeit (auf ganze Minuten)', async ({ page }) => {
    await openApp(page);
    const wrap = await page.locator('.dial-wrap').boundingBox();
    const handle = await page.locator('.dial-handle').boundingBox();
    if (!wrap || !handle) throw new Error('Zifferblatt fehlt');
    const cx = wrap.x + wrap.width / 2;
    const cy = wrap.y + wrap.height / 2;
    const r = wrap.width * 0.39;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    // gegen den Uhrzeigersinn von 12 Uhr nach 9 Uhr: drei Viertel von 25 Minuten = 19 Minuten
    for (const a of [350, 330, 310, 290, 270]) {
      const rad = (a * Math.PI) / 180;
      await page.mouse.move(cx + r * Math.sin(rad), cy - r * Math.cos(rad));
    }
    await expect(clock(page)).toHaveText('19:00');
    await page.mouse.up();
    await expect(clock(page)).toHaveText('19:00');
    await page.locator('.dial-handle').press('ArrowUp');
    await expect(clock(page)).toHaveText('20:00');
  });
});
