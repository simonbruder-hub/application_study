/**
 * Lohnrechner im Browser: vorwärts, rückwärts, ohne 13. Monatslohn, Verdienst, Fehler und Speicher.
 * Startwerte: 5000 Fr., 13 Monatslöhne, 100 %, 42 Stunden, 25 Ferientage, 9 Feiertage.
 */
import { expect, type Page, test } from '@playwright/test';

const ergebnis = (page: Page) => page.getByTestId('ergebnis');
const zeile = (page: Page, name: string | RegExp) => page.getByRole('row', { name }).first();

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('rechnet den Monatslohn in den Stundenlohn um', async ({ page }) => {
  await expect(ergebnis(page)).toHaveText('34.00');
  await expect(zeile(page, /Stundenlohn ohne 13\. Monatslohn/)).toContainText('27.47');
  await expect(zeile(page, /^13\. Monatslohn/)).toContainText('8.33 %');
  await expect(zeile(page, /Stundenlohn mit 13\. Monatslohn/)).toContainText('29.76');
  await expect(zeile(page, /Ferienzuschlag, 25 Tage/)).toContainText('10.64 %');
  await expect(zeile(page, /Feiertagszuschlag, 9 Tage/)).toContainText('1.07');
  await expect(page.getByText('65’000.00 Fr.')).toBeVisible();
  await expect(page.getByText('2’184', { exact: true })).toBeVisible();

  // Tausendertrennzeichen und weniger Wochenstunden
  await page.getByLabel('Monatslohn brutto').fill("6'500");
  await page.getByLabel('Wochenstunden').fill('40');
  await expect(ergebnis(page)).toHaveText('46.41');
});

test('rechnet rückwärts vom Stundenlohn auf den Monatslohn, auch im Teilpensum', async ({ page }) => {
  await page.getByRole('radio', { name: 'Stundenlohn' }).check();
  await page.getByLabel('Stundenlohn brutto').fill('40');
  await expect(page.getByText('Monatslohn brutto', { exact: true })).toBeVisible();
  await expect(ergebnis(page)).toHaveText('5’882.87');
  await page.getByLabel('Pensum').fill('80');
  await expect(ergebnis(page)).toHaveText('4’706.29');
  await expect(page.getByText('bei 80 % Pensum, 13 Monatslöhne im Jahr')).toBeVisible();
  await expect(page.getByText('5’882.87 Fr.')).toBeVisible();
  await expect(zeile(page, /Brutto pro Stunde/)).toContainText('40.00');
});

test('ohne 13. Monatslohn fällt sein Anteil weg', async ({ page }) => {
  await page.getByRole('checkbox', { name: '13. Monatslohn' }).uncheck();
  await expect(ergebnis(page)).toHaveText('31.38');
  await expect(page.getByRole('row', { name: /13\. Monatslohn/ })).toHaveCount(0);
  await expect(zeile(page, /^Stundenlohn/)).toContainText('27.47');
  await expect(page.getByText('60’000.00 Fr.')).toBeVisible();
});

test('zeigt den Verdienst für gearbeitete Stunden', async ({ page }) => {
  const verdienst = page.getByTestId('verdienst');
  await expect(verdienst).toHaveText('1’360.00');
  await page.getByLabel('Gearbeitete Stunden').fill('37,5');
  await expect(verdienst).toHaveText('1’275.00');
  await expect(page.getByText('37.5 Stunden zu 34.00 Fr.')).toBeVisible();
  await page.getByLabel('Gearbeitete Stunden').fill('800');
  await expect(page.getByText('0 bis 744 Stunden')).toBeVisible();
  await expect(verdienst).toHaveCount(0);
  // Leer ist kein Fehler
  await page.getByLabel('Gearbeitete Stunden').fill('');
  await expect(page.getByText('0 bis 744 Stunden')).toHaveCount(0);
  await expect(verdienst).toHaveCount(0);
});

test('meldet ungültige Eingaben', async ({ page }) => {
  await page.getByLabel('Monatslohn brutto').fill('viel');
  await expect(page.getByRole('status')).toHaveText('Bitte die rot markierten Felder prüfen.');
  await expect(page.getByLabel('Monatslohn brutto')).toHaveAttribute('aria-invalid', 'true');
  await expect(ergebnis(page)).toHaveCount(0);
  await page.getByLabel('Monatslohn brutto').fill('5000');
  await expect(ergebnis(page)).toHaveText('34.00');
});

test('merkt sich die Eingaben nach dem Neuladen', async ({ page }) => {
  await page.getByLabel('Monatslohn brutto').fill('6200');
  await page.getByLabel('Ferientage').fill('20');
  await expect(ergebnis(page)).not.toHaveText('34.00');
  await page.reload();
  await expect(page.getByLabel('Monatslohn brutto')).toHaveValue('6200');
  await expect(page.getByLabel('Ferientage')).toHaveValue('20');
  await page.getByRole('button', { name: 'Beispielwerte laden' }).click();
  await expect(page.getByLabel('Monatslohn brutto')).toHaveValue('5000');
  await expect(ergebnis(page)).toHaveText('34.00');
});

test('passt auf schmale Bildschirme', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
