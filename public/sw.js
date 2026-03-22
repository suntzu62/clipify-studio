// Self-destroying service worker used only to flush stale caches from legacy deploys.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));

    await self.registration.unregister();

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      clients.map((client) => ('navigate' in client ? client.navigate(client.url) : Promise.resolve(undefined)))
    );
  })());
});

self.addEventListener('fetch', () => {
  // Intentionally empty. This worker exists only to remove stale cached assets.
});
