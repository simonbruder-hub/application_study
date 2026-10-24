import { expect, test } from '@playwright/test';
import { openApp, trackErrors } from './helpers';

test('Projekt mit Tags anlegen, Tag umbenennen', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, 'projekte');
  await page.locator('button:has-text("Neues Projekt"), button:has-text("Projekt anlegen")').first().click();
  await page.fill('#pName', 'Signale und Systeme');
  await page.locator('dialog .tag-picker button.tag', { hasText: 'Lernen' }).click();
  await page.locator('dialog .tag-picker input').fill('Prüfung');
  await page.locator('dialog .tag-picker input').press('Enter');
  await page.locator('dialog button[type=submit]').click();
  await expect(page.locator('.pj-head .tag')).toHaveText(['Lernen', 'Prüfung']);
  await page.goto('./#einstellungen');
  const name = page.locator('.tag-admin .tag-name').first();
  await expect(name).toHaveValue('Lernen');
  await name.fill('Studium');
  await name.press('Enter');
  await page.goto('./#projekte');
  await expect(page.locator('.tag-chips .tag')).toHaveText(['Studium', 'Prüfung']);
  expect(errors).toEqual([]);
});
