import { expect, type Page, test } from '@playwright/test';

/** Bildschirmkoordinaten eines Rasterpunkts der Zeichenfläche (Rastermass 40) */
async function grid(page: Page, x: number, y: number) {
  await page.locator('.board').scrollIntoViewIfNeeded();
  return page.evaluate(([gx, gy]) => {
    const svg = document.querySelector('.board svg.circuit') as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = gx! * 40; pt.y = gy! * 40;
    const q = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, [x, y]);
}

async function clickGrid(page: Page, x: number, y: number) {
  const p = await grid(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function dragGrid(page: Page, a: [number, number], b: [number, number]) {
  const p = await grid(page, ...a);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const q = await grid(page, ...b);
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.mouse.up();
}

const row = (page: Page, section: string, name: string) =>
  page.locator('.values section').filter({ hasText: section }).locator('tbody tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${name}`) }) }).first();

test('Startseite zeigt die Fächer', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Lernlabor', level: 1 })).toBeVisible();
  await expect(page.locator('.subject')).toHaveCount(5);
  await expect(page.locator('.subject').first()).toContainText('bereit');
});

test('Schaltung selbst aufbauen und Strom ablesen', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./#/et/bauen');
  await page.getByRole('button', { name: 'Leeren' }).click();
  await expect(page.locator('.board .part')).toHaveCount(0);
  // Spannungsquelle senkrecht (Pluspol oben) bei x = 2
  await page.getByRole('button', { name: /U-Quelle/ }).click();
  await page.keyboard.press('r');
  await clickGrid(page, 2, 3);
  // Widerstand senkrecht bei x = 5
  await page.getByRole('button', { name: /Widerstand/ }).click();
  await clickGrid(page, 5, 3);
  await expect(page.locator('.board .part')).toHaveCount(2);
  // Zwei Drähte
  await page.getByRole('button', { name: /Draht/ }).click();
  await dragGrid(page, [2, 2], [5, 2]);
  await dragGrid(page, [2, 4], [5, 4]);
  await expect(page.locator('.board .part.wire')).toHaveCount(2);
  await expect(page.locator('.board .open-end')).toHaveCount(0);
  // 10 V an 100 Ω: 100 mA
  await page.getByRole('tab', { name: 'Werte' }).click();
  await expect(row(page, 'Augenblickswerte', 'R1')).toContainText('100 mA');
  await expect(row(page, 'Gleichstrom', 'R1')).toContainText('1 W');
});

test('Schalter antippen schaltet die zweite Lampe zu', async ({ page }) => {
  await page.goto('./#/et/bauen?bsp=lampen');
  await page.getByRole('tab', { name: 'Werte' }).click();
  await expect(row(page, 'Augenblickswerte', 'A1')).toContainText('250 mA');
  // S2 liegt zwischen (6,0) und (8,0)
  await clickGrid(page, 7, 0);
  await expect(row(page, 'Augenblickswerte', 'A1')).toContainText('500 mA');
});

test('Zeigerdiagramm und Frequenzgang beim Tiefpass', async ({ page }) => {
  await page.goto('./#/et/bauen?bsp=tiefpass');
  await page.getByRole('tab', { name: 'Zeiger' }).click();
  await expect(page.locator('.ph-table')).toContainText('U(C1)');
  await page.getByRole('tab', { name: 'Frequenzgang' }).click();
  await expect(page.locator('.bode')).toContainText('f_g = 1 kHz');
});

test('Aufgabe: Lösungsweg und Baukasten', async ({ page }) => {
  await page.goto('./#/et/aufgaben/gleichstrom?stufe=1');
  const card = page.locator('.task').first();
  await card.getByRole('textbox').first().fill('1e9');
  await card.getByRole('button', { name: 'Prüfen' }).click();
  await expect(card.locator('.answer.is-bad')).toHaveCount(1);
  await card.getByRole('button', { name: 'Lösungsweg' }).click();
  await expect(card.locator('.steps li')).toHaveCount(1);
  await card.getByRole('button', { name: 'Alle Schritte' }).click();
  await expect(card.locator('.steps .katex').first()).toBeVisible();
  await card.getByRole('button', { name: 'Im Baukasten öffnen' }).click();
  await expect(page).toHaveURL(/#\/et\/bauen/);
  await expect(page.locator('.board .label', { hasText: 'R1' })).toBeVisible();
});

test('Theorie mit Formeln', async ({ page }) => {
  await page.goto('./#/et/theorie/schaltvorgaenge');
  await expect(page.getByRole('heading', { name: 'Schaltvorgänge', level: 1 })).toBeVisible();
  expect(await page.locator('.katex').count()).toBeGreaterThan(10);
});
