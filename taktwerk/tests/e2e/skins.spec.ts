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
      await page.clock.fastForward('25:02');
      await expect(page.locator('.celebration')).toBeVisible();
      await expect(page.locator('.celebration .cel-text')).toBeVisible();
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
});
