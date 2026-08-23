/* AGY VENOM PWA service worker · cache-first shell for offline launch */
const CACHE = 'agyvenom-v1';
const SHELL = [
  './',
  './index.html',
  './app/',
  './onboarding/',
  './manifest.webmanifest',
  './assets/bg-poster.jpg',
  './icons/icon-128.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  /* Never cache Ava audio, TUI inject, or cross-origin API calls — always live */
  if (url.hostname === 'localhost' || url.hostname.endsWith('xlrd.org') || url.hostname.endsWith('bing.com')) {
    return; /* let it hit the network */
  }
  /* Cache-first for the app shell, network fallback */
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET' && url.origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
