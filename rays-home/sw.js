// Ray's House of Fun — service worker
// Bump CACHE_VERSION on deploys to bust caches.
const CACHE_VERSION = 'rays-home-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  '/rays-home/',
  '/rays-home/index.html',
  '/rays-home/manifest.webmanifest',
  '/rays-home/icon-192.png',
  '/rays-home/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://unpkg.com/lucide@latest',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Use no-cors-tolerant individual adds so one CDN miss doesn't kill install.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const req = new Request(url, { mode: url.startsWith('http') && !url.includes(self.location.origin) ? 'no-cors' : 'cors' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res.clone());
      } catch (_) { /* ignore single-asset failure */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (!k.startsWith(CACHE_VERSION)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for navigations (HTML)
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match(request) || await caches.match('/rays-home/index.html');
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Cache-first for everything else (static assets, CDNs)
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'Offline asset' });
    }
  })());
});
