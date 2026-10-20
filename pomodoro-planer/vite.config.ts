/**
 * Build der v2-App (Preact + TypeScript).
 *   npm run dev          Entwicklungsserver (http://localhost:5173)
 *   npm run build:v2     PWA nach dist/v2 (GitHub Pages: /pomodoro-planer/v2/)
 *   npm run build:single Eine einzige HTML-Datei ohne Service Worker (zum Herunterladen)
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = fileURLToPath(new URL('./v2', import.meta.url));
const out = (dir: string) => fileURLToPath(new URL(`./dist/${dir}`, import.meta.url));

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    root,
    base: './',
    define: { __PP_BUILD__: JSON.stringify(single ? 'standalone' : 'web') },
    plugins: [
      preact(),
      single
        ? viteSingleFile({ removeViteModuleLoader: true })
        : VitePWA({
          registerType: 'autoUpdate',
          injectRegister: false,
          includeAssets: ['icon.svg', 'icon-192.png'],
          manifest: {
            name: 'Pomodoro-Planer',
            short_name: 'Pomodoro',
            description: 'Pomodoro-Timer und Stechuhr mit Projekten, Aufgaben, Auswertung und Sync zwischen Laptop und Handy.',
            lang: 'de-CH',
            id: './',
            start_url: './#fokus',
            scope: './',
            display: 'standalone',
            background_color: '#edf1f0',
            theme_color: '#edf1f0',
            categories: ['productivity', 'education'],
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            ],
            shortcuts: [
              { name: 'Timer', url: './#fokus', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
              { name: 'Mini-Timer', url: './#mini', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
              { name: 'Aufgaben', url: './#aufgaben', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            // ExcelJS ist gross und wird erst bei Bedarf geladen
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            navigateFallback: 'index.html',
            runtimeCaching: [{
              urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            }],
          },
        }),
    ],
    build: {
      outDir: out(single ? 'single' : 'v2'),
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
    },
    server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  };
});
