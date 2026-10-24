import { expect, type Page } from '@playwright/test';

/** Sammelt Seitenfehler und Konsolenfehler; am Testende prüfen */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Google Fonts sind im Testnetz nicht erreichbar – kein App-Fehler
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_|net::/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** App öffnen und warten, bis die Daten geladen sind */
export async function openApp(page: Page, hash = 'fokus'): Promise<void> {
  await page.goto(`./#${hash}`);
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#main .boot')).toHaveCount(0);
}

export const isMobile = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 900;

/** Navigation über Seitenleiste (Desktop) oder Tab-Leiste (Handy) */
export async function nav(page: Page, label: string): Promise<void> {
  const sel = isMobile(page) ? `.tabbar .tab:has-text("${label}")` : `.sidebar .nav-item:has-text("${label}")`;
  await page.locator(sel).first().click();
}

/** Ziffernanzeige des grossen Timers */
export const clock = (page: Page) => page.locator('.timer-card .clock');
