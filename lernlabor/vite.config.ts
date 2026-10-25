/**
 * Build des Lernlabors (Preact + TypeScript).
 *   npm run dev    Entwicklungsserver (http://localhost:5174)
 *   npm run build  PWA nach dist/app (GitHub Pages: /lernlabor/app/)
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
        name: 'Lernlabor',
        short_name: 'Lernlabor',
        description: 'Elektrotechnik lernen: Schaltungen aufbauen, Strom und Spannung im Oszilloskop sehen, Theorie und Aufgaben in Stufen.',
        lang: 'de-CH',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#eef1f4',
        theme_color: '#eef1f4',
        categories: ['education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Baukasten', url: './#/et/bauen', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
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
  server: { port: 5174, fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
});
