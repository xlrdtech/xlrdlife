// xos service worker — offline cache + asset shell + version bust
// Per canon_xos_canon_xenphone_dead_2026-05-22 + canon_xen_pwa_gh_pages_failover_2026-05-16
// SSE + REST calls always go to network (never cached) so live data isn't stale.
//
// qi 2026-08-10 20:26 — MEASURED DEFECT, and it made a correct deploy look broken:
// this worker was cache-first-with-background-refresh (stale-while-revalidate) for
// EVERYTHING under /xos/, app.jsx included. That is always exactly one page load
// behind — load N serves the old file and refreshes the cache in the background, so
// new code first appears on load N+1. Evidence from the live page after a
// verified-correct deploy: in-page `fetch('app.jsx')` returned 80,827 bytes WITHOUT
// the fix while `fetch('app.jsx?nocache=…')` returned 82,272 bytes WITH it, and the
// resource timing entry showed transferSize 0 — served from cache, never the network.
// The deploy was fine the whole time; this file was the bug.
//
// A surface that is live by default (canon 9) cannot serve its own code cache-first.
// NETWORK-FIRST for code (html/jsx/css + navigations), cache as the offline fallback
// only. CACHE-FIRST stays for genuinely immutable assets (icons, manifest), where
// staleness is harmless and offline speed is the entire point.

const VERSION = "xos-v4-2026-08-12";     // bumped: activate() drops every older cache
const SHELL = [
  "/xos/",
  "/xos/index.html",
  "/xos/app.jsx",
  "/xos/ios-frame.jsx",
  "/xos/tweaks-panel.jsx",
  "/xos/styles.css",
  "/xos/icon.svg",
  "/xos/icon-circular.svg",
  "/xos/manifest.json"
];

// Code, not content — must never be served stale while a newer copy exists.
const isCode = (pathname) =>
  /\.(jsx|js|css|html)$/.test(pathname) || pathname === "/xos/" || pathname === "/xos";

self.addEventListener("install", (ev) => {
  // Per-asset add() instead of addAll(): cache.addAll is atomic — if ANY URL 404s,
  // the entire batch rejects and offline cache never populates. xen.xlrd.org's CF
  // proxy only serves a subset of /xos/ assets (styles.css yes, JSX modules no),
  // so addAll silently fails on that origin. Per-asset catch lets cache build with
  // whatever assets ARE available, gracefully degrading instead of total miss.
  ev.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => {
            // 404s and CORS rejections silently skipped — preserves install
            console.warn("[xos-sw] skip:", url, err && err.message);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  const url = new URL(req.url);

  // Never cache live data — SSE + API endpoints must hit network
  if (url.host === "xen.xlrd.org" || url.pathname.startsWith("/api/") || url.pathname === "/events" || url.pathname === "/mirror/reply") {
    return; // default network behavior
  }

  if (!(url.pathname.startsWith("/xos/") || url.pathname === "/xos")) return;

  // NETWORK-FIRST for code + navigations. Cache is the offline fallback, not the
  // default answer — otherwise a shipped fix stays invisible for a whole load.
  if (req.mode === "navigate" || isCode(url.pathname)) {
    ev.respondWith(
      // cache:"reload" IS THE WHOLE POINT OF THIS BRANCH. A bare fetch(req) still
      // goes through the browser's HTTP cache, and GitHub Pages serves app.jsx with
      // `cache-control: max-age=600` (MEASURED 2026-08-12: `age: 108` on a live
      // request). So "network-first" was really "HTTP-cache-first for ten minutes":
      // this worker believed it had gone to the network and handed back a file up to
      // 10 minutes old. That is why a verified deploy did not appear on qi's phone,
      // and why he called it — "live is fake" (2026-08-02:08 PM). He was right: bytes
      // on the server are not bytes on the device.
      //
      // "reload" bypasses the HTTP cache for this request and updates it on the way
      // through, so a deploy lands on the very next load. The offline fallback below
      // is untouched — this only changes WHERE the fresh copy comes from, never
      // whether there is one.
      //
      // LIVE means rendered on his device. Nothing else earns the word.
      fetch(req, { cache: "reload" })
        .then((fresh) => {
          if (fresh && fresh.ok && req.method === "GET") {
            caches.open(VERSION).then((c) => c.put(req, fresh.clone())).catch(() => {});
          }
          return fresh;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/xos/index.html")))
    );
    return;
  }

  // CACHE-FIRST for immutable assets (icons, manifest, images) — stale is harmless
  // here and offline speed is the point. Still refreshes in the background.
  ev.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((fresh) => {
          if (fresh && fresh.ok) caches.open(VERSION).then((c) => c.put(req, fresh.clone())).catch(() => {});
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((fresh) => {
        if (fresh && fresh.ok && req.method === "GET") {
          caches.open(VERSION).then((c) => c.put(req, fresh.clone())).catch(() => {});
        }
        return fresh;
      }).catch(() => caches.match("/xos/index.html"));
    })
  );
});
