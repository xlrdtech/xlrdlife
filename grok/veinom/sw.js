self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Basic offline-first for static assets + app shell
  event.respondWith(
    caches.open('grokveinom-v1').then((cache) =>
      cache.match(event.request).then((resp) => resp || fetch(event.request))
    )
  );
});
