/**
 * End-to-End-Tests gegen den Produktions-Build (dist/app).
 *   npm run build && npm run test:e2e
 * Mit vorinstalliertem Chromium: PW_CHROMIUM=/pfad/zu/chrome npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test';

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4176/',
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'npx vite preview --port 4176 --strictPort',
    url: 'http://localhost:4176/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
