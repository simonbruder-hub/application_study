/**
 * End-to-End-Tests gegen den Produktions-Build (dist/app) und den Desktop-Build (dist/desktop,
 * desktop.spec.ts, die Desktop-App wird dort nachgebildet).
 *   npm run build && npm run build:desktop && npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /desktop\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', testIgnore: /desktop\.spec/, use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop-app', testMatch: /desktop\.spec/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, baseURL: 'http://localhost:4174/' },
    },
  ],
  webServer: [
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --mode desktop --port 4174 --strictPort',
      url: 'http://localhost:4174/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
