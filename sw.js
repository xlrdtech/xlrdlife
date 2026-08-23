/* hitthe.link root service worker — TOMBSTONE, 2026-08-19.
 *
 * WHY THIS EXISTS AS A TOMBSTONE AND NOT A DELETION:
 * The previous root SW ("Aura OS") was CACHE-FIRST over the root document —
 *   SHELL included './' and 'index.html'
 *   fetch: caches.match(req).then(hit => hit || fetch(req))
 * so the cache ALWAYS won. Every device that ever loaded hitthe.link kept
 * serving itself the OLD root forever, while the CDN served the new one.
 * MEASURED 2026-08-19: hitthe.link returned 49,086 new bytes with the official
 * mark, and qi's phone still showed the old site. Both facts were true.
 *
 * Simply DELETING this file would 404 — and a 404 on the SW script does not
 * reliably unregister an already-installed worker. The only guaranteed eviction
 * is to SHIP a new worker that removes itself. Browsers byte-compare sw.js on
 * navigation, so this installs, evicts, unregisters and reloads with no tap
 * from qi (cmd 4: no human in the loop).
 *
 * ⚠️ CacheStorage is per-ORIGIN, NOT per-scope. A bare caches.keys() wipe here
 * would also destroy the caches of /desk/, /vision/, /xos/, /vvsvei/,
 * /switchboard/, /extendlm/, /rays-home/ and /subscriptions/ — each of which
 * ships its OWN sw.js. So this deletes ONLY the root worker's own 'htl-v*'
 * caches and leaves every other app's cache untouched.
 *
 * There is deliberately NO fetch handler: nothing is intercepted, ever.
 */
const OWN_CACHE_PREFIX = 'htl-v';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith(OWN_CACHE_PREFIX)).map(k => caches.delete(k))
    );
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      try { c.navigate(c.url); } catch (_) { /* client may be gone */ }
    }
  })());
});
