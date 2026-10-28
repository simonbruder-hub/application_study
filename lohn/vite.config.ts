/**
 * Build des Lohnrechners (Preact + TypeScript).
 *   npm run dev    Entwicklungsserver (http://localhost:5176)
 *   npm run build  PWA nach dist/app (GitHub Pages: /lohn/app/)
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const root = fileURLToPath(new URL('./web', import.meta.url));

export default defineConfig({
  root,
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-192.png'],
      manifest: {
        name: 'Lohnrechner',
        short_name: 'Lohn',
        description: 'Monatslohn in Stundenlohn umrechnen und zurück, mit 13. Monatslohn, Ferien- und Feiertagszuschlag.',
        lang: 'de-CH',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f2f1f6',
        theme_color: '#f2f1f6',
        categories: ['finance', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
    outDir: fileURLToPath(new URL('./dist/app', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { port: 5176, fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
});
