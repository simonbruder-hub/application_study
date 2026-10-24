// Ersetzt den Service Worker der früheren Adresse: meldet sich ab und schickt offene Fenster zu Taktwerk.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(new URL('../../taktwerk/app/', self.registration.scope).href);
  })());
});
