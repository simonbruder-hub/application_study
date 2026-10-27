/**
 * Kochbuch im Browser: Laden, Filtern, Portionen, Einkaufszettel und Übergabe an Kasse unterwegs.
 * Arbeitet mit dem Testkochbuch (erfundene Rezepte) aus tests/fixtures.
 */
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const JSON_DATEI = fileURLToPath(new URL('../fixtures/testkochbuch.json', import.meta.url));
const ZIP_DATEI = fileURLToPath(new URL('../fixtures/rezepte-json.zip', import.meta.url));

async function laden(page: Page, datei = JSON_DATEI) {
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles(datei);
  await expect(page.locator('.treffer')).toHaveText('6 Rezepte');
}

/** Auf dem Handy liegen die Filter hinter einem Knopf */
async function filterOeffnen(page: Page) {
  const knopf = page.getByRole('button', { name: /^Filter/ });
  if (await knopf.isVisible()) await knopf.click();
}

const posten = (page: Page, name: string) =>
  page.locator('.posten', { has: page.locator('.posten-name', { hasText: new RegExp(`^${name}$`) }) });

async function kasseAnlegen(page: Page) {
  // so wie Kasse unterwegs ihre Datenbank anlegt (kern.js), mit einem Eintrag auf der Liste
  await page.evaluate(() => new Promise<void>((ok, fehler) => {
    const r = indexedDB.open('kasse-unterwegs', 2);
    r.onupgradeneeded = () => { for (const n of ['kv', 'fotos', 'ablage']) r.result.createObjectStore(n); };
    r.onsuccess = () => {
      const t = r.result.transaction('kv', 'readwrite');
      t.objectStore('kv').put([{ pwaId: 'alt-1', text: 'Zwiebeln', quelle: 'Handy' }], 'listeNeu');
      t.oncomplete = () => { r.result.close(); ok(); };
      t.onerror = () => fehler(t.error);
    };
    r.onerror = () => fehler(r.error);
  }));
}

const kasseListe = (page: Page) => page.evaluate(() => new Promise<{ text: string; quelle: string }[]>((ok, fehler) => {
  const r = indexedDB.open('kasse-unterwegs', 2);
  r.onsuccess = () => {
    const g = r.result.transaction('kv').objectStore('kv').get('listeNeu');
    g.onsuccess = () => { r.result.close(); ok(g.result); };
  };
  r.onerror = () => fehler(r.error);
}));

test('lädt die Rezepte und behält sie nach dem Neuladen', async ({ page }) => {
  await laden(page);
  await page.reload();
  await expect(page.locator('.treffer')).toHaveText('6 Rezepte');
  await page.getByRole('link', { name: 'Daten' }).click();
  await expect(page.getByRole('heading', { name: 'Testkochbuch' })).toBeVisible();
  await expect(page.getByText('6 Rezepte aus «testkochbuch.json»')).toBeVisible();
});

test('lädt das ZIP aus GitHub Actions direkt', async ({ page }) => {
  await laden(page, ZIP_DATEI);
});

test('meldet eine falsche Datei verständlich', async ({ page }) => {
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles({ name: 'falsch.json', mimeType: 'application/json', buffer: Buffer.from('{"x": 1}') });
  await expect(page.getByRole('alert')).toContainText('keine Rezeptdatei');
});

test('filtert nach Art, Verträglichkeit und Suche, Zurück behält den Filter', async ({ page }) => {
  await laden(page);
  await filterOeffnen(page);
  await page.getByRole('button', { name: /^Suppe/ }).click();
  await expect(page.locator('.karte')).toHaveCount(2);
  await expect(page).toHaveURL(/art=Suppe/);
  await expect(page.getByRole('button', { name: /^eher meiden/ })).toBeDisabled();
  await page.getByRole('button', { name: /^gut verträglich/ }).click();
  await expect(page.locator('.karte')).toHaveCount(2);
  await page.getByRole('searchbox').fill('gurke');
  await expect(page.locator('.karte')).toHaveCount(1);

  await page.locator('.karte').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gurken-Kaltschale');
  await page.getByRole('link', { name: '← Alle Rezepte' }).click();
  await expect(page.locator('.karte')).toHaveCount(1);
  await expect(page.getByRole('searchbox')).toHaveValue('gurke');

  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await expect(page.locator('.karte')).toHaveCount(6);
});

test('rechnet Portionen um und zählt den Einkauf zusammen', async ({ page }) => {
  await laden(page);
  await page.getByRole('link', { name: /Kürbissuppe mit Ingwer/ }).click();
  await expect(page.locator('.magen-box')).toContainText('Magen: gut verträglich');
  await expect(page.getByRole('heading', { name: 'Geheimtipp' })).toBeVisible();
  const zutaten = page.locator('.zutatenliste');
  await expect(zutaten).toContainText('5 dl Gemüsebouillon');
  await page.getByRole('button', { name: 'mehr' }).click();
  await page.getByRole('button', { name: 'mehr' }).click();
  await expect(page.locator('.stepper output')).toHaveText('4 Personen');
  await expect(zutaten).toContainText('10 dl Gemüsebouillon');
  await expect(zutaten).toContainText('2 Butternusskürbis (ca. 1200');
  await page.getByRole('button', { name: 'Auf den Einkaufszettel' }).click();
  await expect(page.locator('.nav-n')).toHaveText('1');

  await page.getByRole('link', { name: '← Alle Rezepte' }).click();
  await page.getByRole('link', { name: /Zitronenpoulet/ }).click();
  await page.getByRole('button', { name: 'Auf den Einkaufszettel' }).click();
  await expect(page.locator('.nav-n')).toHaveText('2');

  await page.getByRole('link', { name: /^Einkauf/ }).click();
  await expect(posten(page, 'Zwiebel').locator('.posten-menge')).toHaveText('3');
  await expect(posten(page, 'Gemüsebouillon').locator('.posten-menge')).toHaveText('1 l');
  await expect(posten(page, 'Pfeffer').locator('input')).not.toBeChecked();
  await expect(posten(page, 'Rosmarin').locator('input')).toBeChecked();

  // Portionen auch auf dem Zettel ändern
  const suppe = page.locator('.zettel-rezepte li', { hasText: 'Kürbissuppe' });
  await suppe.getByRole('button', { name: 'weniger' }).click();
  await expect(posten(page, 'Zwiebel').locator('.posten-menge')).toHaveText('2½');

  // Nach dem Neuladen ist der Zettel noch da
  await page.reload();
  await expect(posten(page, 'Zwiebel').locator('.posten-menge')).toHaveText('2½');
});

test('sendet den Zettel an Kasse unterwegs, ohne Doppelte', async ({ page }) => {
  await laden(page);
  await page.getByRole('link', { name: /Zitronenpoulet/ }).click();
  await page.getByRole('button', { name: 'Auf den Einkaufszettel' }).click();
  await page.getByRole('link', { name: /^Einkauf/ }).click();
  await posten(page, 'Rosmarin').locator('input').uncheck();

  // Ohne Kasse unterwegs in diesem Browser: verständlicher Hinweis, keine leere Datenbank
  await page.getByRole('button', { name: 'An Kasse unterwegs senden' }).click();
  await page.getByRole('button', { name: /^Ja, \d+ Zutaten senden$/ }).click();
  await expect(page.getByRole('alert')).toContainText('noch nicht eingerichtet');
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name))).not.toContain('kasse-unterwegs');

  await kasseAnlegen(page);
  await page.getByRole('button', { name: 'An Kasse unterwegs senden' }).click();
  await page.getByRole('button', { name: 'Ja, 4 Zutaten senden' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'gesendet' })).toContainText('3 Zutaten an Kasse unterwegs gesendet. Schon auf der Liste: Zwiebel.');
  await expect(page.getByRole('link', { name: 'Kasse unterwegs öffnen' })).toHaveAttribute('href', /haushaltskasse-app\/\?tab=liste$/);

  const liste = await kasseListe(page);
  expect(liste.map(x => x.text)).toEqual(['Zwiebeln', 'Kartoffeln (600 g)', 'Pouletbrüstli (2)', 'Zitrone (1)']);
  expect(liste.slice(1).every(x => x.quelle === 'Kochbuch')).toBe(true);
});

test('teilt den Zettel als Text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: ShareData) => { (window as unknown as { geteilt: ShareData }).geteilt = d; } });
  });
  await laden(page);
  await page.getByRole('link', { name: /Apfelwähe/ }).click();
  await page.getByRole('button', { name: 'mehr' }).click();
  await expect(page.locator('.stepper output')).toHaveText('× 1½');
  await page.getByRole('button', { name: 'Auf den Einkaufszettel' }).click();
  await page.getByRole('link', { name: /^Einkauf/ }).click();
  await page.getByRole('button', { name: 'Teilen' }).click();
  const text = await page.evaluate(() => (window as unknown as { geteilt: ShareData }).geteilt.text);
  expect(text).toContain('Für: Apfelwähe (× 1½)');
  expect(text).toContain('- Äpfel (6)');
  expect(text).toContain('- Milch (3 dl)');
});
