// VVSVEI service worker (wf 2026-05-31) — cache-first shell so reopen is instant.
// Scope: /vvsvei/ ONLY. Never caches /events SSE, /api/*, or cross-origin xen.xlrd.org.
// qi: "having to reload vvsvei is a bottleneck. it should open and work instantly."
const VVSVEI_CACHE = 'vvsvei-shell-v30';  // v30 2026-08-15 — STEP-BUBBLE SIDE DELIVERY: `.tui-step` was
// moved to align-self:flex-end (Xen's side) — qi 05:01 "the terminal stream is on the my side, current is
// supposed to be your side" — but that shipped WITHOUT a cache bump, so his installed shell stayed on the
// v29 bytes and the fix never reached him. MEASURED 2026-08-15 05:22 via a live DOM read of
// https://hitthe.link/vvsvei/ : computed alignSelf = "flex-end", winning rule
// ".tui-step, .firehose.tui { align-self: flex-end }", navigator.serviceWorker.controller = true — i.e. the
// SERVER was already correct and the CLIENT was stale. His Firefox screenshot at 05:20 still showed the
// steps left-aligned on HIS side. ⚠️ THE LESSON, and the reason this comment is long: a CSS fix to this
// page is NOT delivered by pushing it. Network-first (v5) governs NAVIGATIONS; the installed PWA shell is
// governed by THIS constant. Ship a visual change without bumping here and you will verify green on the
// served bytes while qi still sees the bug — which is exactly how tonight burned an hour.
// v29 2026-08-11 — VOICE-LEG RETRY: the same-clip retry that was supposed to protect the voice leg was UNREACHABLE — `_hosts` held one entry so `_hostIdx < _hosts.length` was false on the FIRST failure and every audio-err jumped straight to device-tts (the browser's synthetic voice). Fault log: one fault every ~20-40s across MULTIPLE clients (rx non-monotonic) = qi hearing a voice that is not his, and two at once. Added 2 same-origin retries with cache-bust + backoff before any device path; his 'never silent' rule (2026-06-09) is NOT repealed, we just stop reaching for the robot on the first stumble. Bump delivers it to the installed PWA. // v28 2026-08-11 — NO MODALS: the full-screen inset:0/z-index:100000 arm overlay became a pointer-events:none pill above the voice bar (qi decree 00:20 "no more modals ... via vvsvei"). Zero behaviour change — the arming gesture is captured by the unlock listeners on document.body, never by the overlay, which was only ever an instruction to read. Bump exists ONLY to fire the SW update -> vvsvei-reload nudge so qi's INSTALLED PWA drops the modal without a manual hard-refresh (a required tap = total failure, cmd 4). // v17 2026-08-10 — VOICE PICKER + PLAY FIX: bump exists ONLY to fire the SW update -> vvsvei-reload nudge so qi's INSTALLED PWA picks up the reader-voice picker and the repaired PLAY buttons without a manual hard-refresh (a required tap = total failure, cmd 4). Navigations were already network-first (v5), so this was never a stale-shell bug — the bump is the delivery mechanism, not a cache fix. // v16 2026-07-23 — FOCUS/VISIBILITY AUTO-RECOVERY: on tab blur the browser aborted SpeechRecognition + force-suspended the AudioContext + could drop the SSE stream, leaving the page DEAD until qi manually tapped back in ("I had to go back to it in order for it to start outputting again"). A required tap = total failure (cmd 4). Added _veiAutoRecover() fired on visibilitychange→visible + window focus + pageshow: (1) re-arms the mic recognizer idempotently when durable intent _veiMicIntent is on (guarded by _reArmInFlight against double-arm), (2) resumes _avaCtx + re-asserts silent keepalive + un-sticks a wedged drain + re-drains the audio queue, (3) force-reconnects a CLOSED SSE stream, (4) replays queued dictate POSTs. Mic/voice/SSE all self-heal on return with NO tap. Barge-in (_avaGen) + v15 drain-watchdog untouched. Bump busts the installed PWA shell. // v15 2026-07-23 — VOICE-LEG UNBLOCK: the drain-watchdog mutex (_avaPlaying) stuck TRUE on a hung TTS fetch and STARVED the speak/voice leg for up to 16s while the display leg still rendered — qi's "I see it but don't hear it". Watchdog now ticks 1s + releases a genuinely-wedged (non-advancing) mutex in <2s, and speakAva() self-heals a stale mutex on every fresh inject so voice fires immediately. Barge-in (_avaGen) untouched. Bump busts the installed PWA shell. // v14 2026-07-22 — background-lane routing: XEN-STEP/xen-step/lane:steps + raw egress:cmd/egress:netconn (Xen's own bash/tool command egress) route to the Operator·Firehose rail (#er-list) ONLY, out of the main conversation feed; rail auto-reveals+auto-opens on first background event (visible, not behind a click). Main feed = xen-out + xen-dictate-in + real inbound only. Bump busts the installed PWA shell. // v13 (interim) // v12 2026-06-21 — step-lane: route XEN-STEP/xen-step/lane:steps events to the separate Operator·Firehose rail (#er-list), out of the conversation transcript; un-hide the rail + toggle. Bump busts the installed PWA shell. // v11 2026-06-11 — PWA install fix: own /vvsvei/manifest.json (was linking /vei manifest). v10 2026-06-11 — strip double-timestamp body prefix ("HH:MM:SS PM, in:" + mangled ":::") at render chokepoint; Ava->voice on all visible labels (pill tooltips + arm overlay). v8 2026-06-09 — multi-host TTS retry + stall-aware drain watchdog + park-on-unarmed + arm-resume hint + arm-safe SW auto-update/convergence. v7 — SSE __reload__ self-update hook.  // v5 2026-06-09 — bust cache, fix crossOrigin audio-err (was cache-first, which trapped qi on a broken cached shell during a P0). Fresh-always beats instant-but-stale.
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VVSVEI_CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VVSVEI_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() =>
      // PRE-v7 CONVERGENCE (H5), arm-safe: a force-reload re-locks iOS audio and
      // re-arm is a manual tap (no full persistence yet), so we MUST NOT blindly
      // reload a healthy armed tab. We postMessage every client (the page ignores
      // the nudge while armed/live) and only navigate clients that are NOT focused —
      // the stuck stale tab is the backgrounded/never-touched one; the live armed
      // tab qi is listening through stays put.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) =>
        Promise.all(cls.map((c) => {
          try { c.postMessage && c.postMessage({ type: 'vvsvei-reload', cache: VVSVEI_CACHE }); } catch (_) {}
          try {
            if (c.focused) return null;            // never yank the tab qi is using
            return c.navigate ? c.navigate(c.url) : null;
          } catch (_) { return null; }
        }))
      ).catch(() => {})
    )
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only handle same-origin GET navigations/shell. Everything else (SSE, API,
  // cross-origin TTS/events) goes straight to network untouched.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the SSE stream or any API path.
  if (url.pathname.includes('/events') || url.pathname.includes('/api/')) return;

  const isShell =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/vvsvei/') ||
    url.pathname.endsWith('/vvsvei/index.html');

  if (isShell) {
    // NETWORK-FIRST (qi 2026-06-09): always fetch the fresh shell; cache it; fall back to
    // cache ONLY when offline. Was cache-first, which served a stale broken shell and
    // trapped qi on a pre-fix page during a personal-P0. A broken-but-instant page is
    // worse than a fresh page that waits a beat.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VVSVEI_CACHE).then((c) => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.open(VVSVEI_CACHE).then((c) => c.match('./index.html')))
    );
  }
});
