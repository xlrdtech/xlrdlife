// Xen Omni Vision Wall — NETWORK-FIRST service worker.
// Lesson from vvsvei: a cache-first SW traps you on a stale/broken shell. For a
// monitoring wall you depend on, fresh-always beats instant-but-stale. Cache is
// only the offline fallback. Never intercepts vdo.ninja / cross-origin streams.
const CACHE = 'vision-shell-v1';
const SHELL = ['./', './index.html', './devices.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // vdo.ninja & all streams untouched
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
