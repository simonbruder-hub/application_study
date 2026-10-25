// Rendert die PNG-Icons des Lernlabors aus den SVG-Vorlagen.
// Benötigt Playwright (npx playwright …). Aufruf: node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright lokal oder global installiert verwenden
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = playwright;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['web/public/icon.svg', 'web/public/icon-192.png', 192],
  ['web/public/icon.svg', 'web/public/icon-512.png', 512],
  ['web/icon-maskable.svg', 'web/public/icon-maskable-512.png', 512],
];
// In Umgebungen mit vorinstalliertem Chromium (anderer Playwright-Stand) diesen verwenden
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(join(root, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(out);
}
await browser.close();
