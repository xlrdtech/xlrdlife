/* desk — minimal offline shell cache. Bump CACHE on each ship to invalidate. */
const CACHE = 'desk-v2';
const SHELL = [
  '/desk/',
  '/desk/index.html',
  '/desk/manifest.webmanifest',
  '/lib/three.module.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // tolerate a missing asset so install never wholesale-fails
      Promise.allSettled(SHELL.map((u) => cache.add(u)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // never cache uploads or cross-origin POSTs — let them hit the network directly
  if (req.method !== 'GET') return;
  // network-first for the document, cache-first for the static shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/desk/index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // opportunistically cache same-origin shell assets
      if (res && res.ok && new URL(req.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
