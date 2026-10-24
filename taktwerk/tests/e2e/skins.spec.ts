import { expect, test } from '@playwright/test';
import { openApp, trackErrors } from './helpers';

const SKINS = ['klassisch', 'anime', 'technik', 'barock', 'natur', 'amtlich', 'rennen', 'flug', 'meer', 'flora', 'scifi', 'elemente', 'zug'] as const;

test.describe('Stile', () => {
  for (const skin of SKINS) {
    test(`${skin}: Timer läuft, Pomodoro wird gefeiert`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.addInitScript((s) => localStorage.setItem('pomodoro-planer.v2.prefs', JSON.stringify({ skin: s, notifyAsked: true })), skin);
      await page.clock.install();
      await openApp(page);
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await page.locator('.btn-start').click();
      if (skin === 'elemente') await expect(page.locator('.spx-earth')).toBeAttached();
      await page.clock.fastForward('25:02');
      // Elemente feiert mit dem Feuer-Spektakel, alle anderen mit ihrer Feier
      const party = skin === 'elemente' ? page.locator('.spx-fire') : page.locator('.celebration');
      await expect(party).toBeVisible();
      await expect(party.locator(skin === 'elemente' ? '.spx-text' : '.cel-text')).toBeVisible();
      await expect(page.locator('.phase-tab.is-on')).toContainText('Kurze Pause');
      expect(errors).toEqual([]);
    });
  }

  test('Auswahl in den Einstellungen wechselt den Stil', async ({ page }) => {
    await openApp(page, 'einstellungen');
    await page.locator('.skin-opt', { hasText: 'Barock' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'barock');
    await expect(page.locator('.skin-opt.is-on')).toContainText('Barock');
  });

  test('Sci-Fi: Space Rider in der Pause spielen, Tasten gehen nicht an den Timer', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => localStorage.setItem('pomodoro-planer.v2.prefs', JSON.stringify({ skin: 'scifi', notifyAsked: true })));
    await page.clock.install();
    await openApp(page);
    await expect(page.locator('.sr-open')).toHaveCount(0);
    await page.locator('.phase-tab', { hasText: 'Kurze Pause' }).click();
    await page.locator('.btn-start').click();
    await page.locator('.sr-open').click();
    await expect(page.locator('.sr-layer')).toBeVisible();
    await page.locator('.sr-go').click();
    await expect(page.locator('.sr-screen')).toHaveCount(0);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press(' ');
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-run', '1');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sr-screen h2')).toHaveText('Pausiert');
    await page.keyboard.press('p');
    await expect(page.locator('.sr-screen')).toHaveCount(0);
    // Pause vorbei: das Spiel hält an und schickt zurück an die Arbeit
    await page.clock.fastForward('05:02');
    await expect(page.locator('.sr-screen h2')).toHaveText('Pause vorbei');
    await page.locator('.sr-go').click();
    await expect(page.locator('.sr-layer')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  for (const [skin, title] of [['flora', 'Hummelflug'], ['rennen', 'Grand Prix'], ['natur', 'Waldjagd']] as const) {
    test(`${skin}: Pausenspiel ${title} startet und pausiert`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.addInitScript((s) => localStorage.setItem('pomodoro-planer.v2.prefs', JSON.stringify({ skin: s, notifyAsked: true })), skin);
      await openApp(page);
      await expect(page.locator('.sr-open')).toHaveCount(0);
      await page.locator('.phase-tab', { hasText: 'Kurze Pause' }).click();
      await page.locator('.sr-open').click();
      await expect(page.locator('.sr-screen h2')).toHaveText(title);
      await page.locator('.sr-go').click();
      await expect(page.locator('.sr-screen')).toHaveCount(0);
      const canvas = (await page.locator('.sr-canvas').boundingBox())!;
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.6);
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowLeft');
      await expect(page.locator('.sr-hud')).toContainText('Punkte');
      await page.keyboard.press('Escape');
      await expect(page.locator('.sr-screen h2')).toHaveText('Pausiert');
      await page.keyboard.press('Escape');
      await expect(page.locator('.sr-layer')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('Amtlich: Sudoku mit gesperrten Feldern und Tipp', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => localStorage.setItem('pomodoro-planer.v2.prefs', JSON.stringify({ skin: 'amtlich', notifyAsked: true })));
    await openApp(page);
    await page.locator('.phase-tab', { hasText: 'Kurze Pause' }).click();
    await page.locator('.sr-open').click();
    await page.locator('.sd-level', { hasText: 'Anfänger' }).click();
    await expect(page.locator('.sd-cell')).toHaveCount(81);
    await page.locator('.sd-num').nth(4).click();
    expect(await page.locator('.sd-cell.is-blocked').count()).toBeGreaterThan(20);
    await page.locator('.sd-tools button', { hasText: 'Tipp' }).click();
    await expect(page.locator('.sd-hint')).toBeVisible();
    await expect(page.locator('.sd-head')).toContainText('1');
    // Spielstand bleibt: schliessen und wieder öffnen
    await page.keyboard.press('Escape');
    await page.locator('.sr-open').click();
    await expect(page.locator('.sd-grid')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Meer: Memory mit Paaren', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => localStorage.setItem('pomodoro-planer.v2.prefs', JSON.stringify({ skin: 'meer', notifyAsked: true })));
    await openApp(page);
    await page.locator('.phase-tab', { hasText: 'Lange Pause' }).click();
    await page.locator('.sr-open').click();
    await page.locator('.mm-level', { hasText: 'Leicht' }).click();
    await expect(page.locator('.mm-card')).toHaveCount(12);
    // Paare über die Beschriftung der aufgedeckten Karten finden und alle lösen
    const labels: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.locator('.mm-card').nth(i).click();
      labels.push((await page.locator('.mm-card').nth(i).getAttribute('aria-label'))!);
      if (i % 2 === 1) await page.waitForTimeout(950);
    }
    for (let i = 0; i < 12; i++) {
      if (await page.locator('.mm-card').nth(i).evaluate((e) => e.classList.contains('is-done'))) continue;
      const j = labels.findIndex((l, k) => k !== i && l === labels[i]);
      await page.locator('.mm-card').nth(i).click();
      await page.locator('.mm-card').nth(j).click();
      await page.waitForTimeout(100);
    }
    await expect(page.locator('.mm-done')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
