// Rendert die PNG-Icons für die installierbare App aus den SVG-Vorlagen.
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
  ['icons/icon.svg', 'icons/icon-192.png', 192],
  ['icons/icon.svg', 'icons/icon-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/icon-maskable-512.png', 512],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(join(root, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(out);
}
await browser.close();
