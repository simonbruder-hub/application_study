import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/**
 * Ton-Sperre wie in Chrome und Firefox: Web Audio läuft erst nach einem Klick oder Tastendruck.
 * Der Testbrowser ohne Bildschirm erlaubt Ton immer, darum wird die Sperre hier nachgebildet.
 */
function lockAudioUntilGesture() {
  let gesture = false;
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, () => { gesture = true; setTimeout(() => { gesture = false; }, 0); }, { capture: true });
  }
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(opts?: AudioContextOptions) {
      super(opts);
      if (!gesture) void super.suspend();
    }
    override resume(): Promise<void> {
      return gesture ? super.resume() : Promise.resolve();
    }
  };
}

test.describe('Ton nach dem Neuladen', () => {
  test.skip(({ isMobile }) => isMobile, 'gilt für den Laptop');

  test('Hinweis erscheint, solange der Ton gesperrt ist; ein Klick irgendwo gibt ihn frei', async ({ page }) => {
    await page.addInitScript(lockAudioUntilGesture);
    await openApp(page);
    await page.keyboard.press('Space');
    await expect(page.locator('.btn-start')).toContainText('Pause');
    await expect(page.locator('.sound-hint')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#main .boot')).toHaveCount(0);
    await expect(page.locator('.btn-start')).toContainText('Pause');
    await expect(page.locator('.sound-hint')).toBeVisible();

    await page.locator('.sound-hint span').click();
    await expect(page.locator('.sound-hint')).toHaveCount(0);
  });
});
