/* global React, ReactDOM, IOSDevice */
const { useState, useEffect, useRef, useMemo } = React;

/* ===========================================================
   LIVE WIRING — xen.xlrd.org Cloudflare tunnel
   canon-no-demos: zero seed data, fail to "connecting..." not mocks
   =========================================================== */
const XEN_BASE = "https://xen.xlrd.org";
const SSE_URL  = XEN_BASE + "/events";

// ── THE MERGED BEEPER + EMAIL INBOX (qi 2026-08-12 17:13: "both the omniinbox
// and the vvsvei panel have the truly synced and beeper and email synced to
// inbound and outbound so I no longer need to use the beeper, spark mail, or any
// other interface again ever").
//
// ROOT CAUSE this fixes: this pane was subscribed ONLY to xen.xlrd.org/events —
// the general Xen event bus, which carries the VVSVEI voice taps, NOT message
// threads. omni-inbox-server.js has been serving the real merged inbox the whole
// time on a different host, so the inbox could never show a thread no matter what
// was filtered. That also explains the `platform` pill matching nothing.
//
// omni.xlrd.org fronts 127.0.0.1:4489 via cloudflared (config.yml:84).
// VERIFIED on the public route, asserting on the BODY not the status:
//   ok:true · total 292 · cleartext 292 · encrypted 0
//   byNet {telegram 156, email 50, beeper 27, linkedin 15, instagram 9,
//          gmessages 7, slack 3} · accounts qi01/qi02/qi03
// `encrypted:0` is the important number — the Megolm sidecar
// (BEEPER_MATRIX_RECOVERY_KEY) is decrypting bodies, so the "HONEST LIMIT" noted
// at omni-inbox-server.js:14 no longer bites.
//
// It is a POLL, not SSE: /api/stream is a 10s-polled JSON snapshot. Using
// EventSource against it would fail silently forever, which is exactly the class
// of bug that hid this for weeks.
const OMNI_BASE   = "https://omni.xlrd.org";
const OMNI_STREAM = OMNI_BASE + "/api/stream";
// 2026-08-13 01:05 — THIS DECLARATION WAS MISSING AND IT KILLED THE WHOLE INBOX.
// `OMNI_POLL_MS` was referenced at the tail of pump() (the setTimeout that
// schedules the next tick) but declared NOWHERE in this file. That line sits
// OUTSIDE pump()'s try/catch, so it threw a ReferenceError that rejected
// pump()'s promise — unhandled, silent, no console error qi would ever see.
// Net effect: the first fetch+absorb ran, the inbox painted exactly ONE
// snapshot at page load, and then never polled again. Every message arriving
// after load was invisible until a manual reload.
// That single undefined identifier is qi's "the omniinbox is not working",
// his "live is fake", and his "a delay between when you did something and
// when anything changed" — all three, from one missing const.
// Value is not a guess: the comment above pump() states the server refreshes
// /api/stream every 10s, "so polling at 10s loses nothing".
const OMNI_POLL_MS = 10000;
const OMNI_REPLY  = OMNI_BASE + "/api/reply";   // outbound: email→SMTP, chat→Matrix
const OMNI_SSE    = OMNI_BASE + "/sse-stream";  // live push of the interleaved thread

// ── LIVE BY DEFAULT: the WebSocket is the PRIMARY path, the poll is the fallback.
//    (added 2026-08-15 — Beeper Desktop WebSocket live-sync)
//
// WHY A SECOND SOCKET AND NOT app.jsx TALKING TO BEEPER DIRECTLY:
// Beeper Desktop exposes a real, working events socket at ws://localhost:23373/v1/ws.
// MEASURED: the upgrade returns 101 with `Authorization: Bearer <token>`, then the
// server sends `{"type":"ready","version":1,"chatIDs":[]}` unprompted, and
// `{"type":"subscriptions.set","requestID":"r1","chatIDs":["*"]}` is answered with
// `{"type":"subscriptions.updated",...,"chatIDs":["*"]}`. Auth is enforced AT THE
// UPGRADE: a bad token and no token both return 401 with zero frames.
//
// This page STILL cannot be the one to open it, for two independent reasons:
//   1. hitthe.link is served over https. A browser refuses an insecure ws:// from a
//      secure origin — the connection is blocked before a byte moves. There is no
//      flag, no fallback, no polyfill for that.
//   2. It would require shipping a bearer token into a page anyone can View Source
//      on. Publishing a credential to a public URL is never an option.
// So the bearer lives ONLY server-side, in omni-inbox-server.js, which already is
// this pane's origin and already runs on the same box as Beeper Desktop. It holds
// the Beeper socket and re-broadcasts to this page over its own token-free socket.
// This page never sees, stores, or transmits the Beeper token.
//
// LANDMINE THIS DELIBERATELY AVOIDS — read before "improving" it: /sse-stream was
// wired here once and Cloudflare did NOT pass its text/event-stream through the
// tunnel. It returned NO HEADERS AT ALL, EventSource failed, and the 3s retry loop
// drove console errors 38 → 75 → 194 on ONE page view. WebSockets are a different
// mechanism (a 101 upgrade cloudflared proxies natively, not a buffered stream), so
// this is not the same bet — but it is NOT yet proven through the edge either. That
// is exactly why the poll below is retained as a live fallback instead of deleted:
// if wss:// never establishes, this pane behaves precisely as it does today.
const OMNI_WS = (() => {
  try {
    const h = (typeof location !== "undefined") ? location.hostname : "";
    // Served straight off the box (omnimind :4441 or a local test): same-host socket.
    if (h === "127.0.0.1" || h === "localhost") return "ws://" + h + ":4489/ws";
  } catch (_) {}
  // https → wss. Never ws:// from an https page; the browser blocks it outright.
  return OMNI_BASE.replace(/^http/, "ws") + "/ws";
})();
// Force a reconnect if the socket goes quiet. The server pushes a snapshot at least
// every 20s, so 90s of silence means the socket is a corpse that still reads OPEN —
// the exact "process is up, service is wedged" failure this stack keeps hitting.
const OMNI_WS_SILENCE_MS = 90000;
const CALLERS_URL = XEN_BASE + "/api/callers";
const REPLY_URL = XEN_BASE + "/mirror/reply";

/* qi 2026-08-10 20:09: omnimind /events emits ts in MILLISECONDS — measured off
   the live stream: {"ts":1786406420900}. Everything downstream had been doing
   `ts * 1000`, landing every card in the year 58589, where getHours() returns an
   arbitrary hour — that is why the feed showed 8:49 AM and 12:12 AM next to
   bodies stamped 8:07 PM. Older producers did emit seconds, so accept both
   rather than flipping the constant: anything past 1e12 is already ms. */
const toMs = (t) => (Number(t) > 1e12 ? Number(t) : Number(t) * 1000);

function normalizeLiveEvent(raw, idx) {
  // omnimind /events emits {source, direction, body, sender, recipient, chatID, ts}
  const ts = raw.ts ? new Date(toMs(raw.ts)) : new Date();
  const secAgo = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 1000));
  return {
    src: (raw.source || raw.src || "xen"),
    dir: (raw.direction || raw.dir || "in"),
    sender: raw.sender || raw.from || raw.who || "",
    recipient: raw.recipient || raw.to || "",
    body: raw.body || raw.text || raw.message || "",
    chatID: raw.chatID || raw.thread || "",
    ts: -secAgo,
    _absTs: ts.getTime(),
    id: "live-" + (raw.chatID || "") + "-" + ts.getTime() + "-" + idx
  };
}

/* ===========================================================
   TWEAKS
   =========================================================== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#00dc82",
  "startPane": 1,
  "iosTime": "9:41",
  "voice": true,
  "showDock": true,
  "connection": "connected",
  "deviceName": "GV Phone"
}/*EDITMODE-END*/;

const ACCENTS = ["#00dc82", "#7afff5", "#ffb46a", "#ff3344", "#c8d0c0"];

/* ===========================================================
   DATA — content for each panel
   =========================================================== */

/* Omnibox suggestion library, filtered as the user types */
const OMNI_ALL = [
  { kind: "verb",   ic: "↗", title: "open ", arg: "url",        meta: "navigate · new thread" },
  { kind: "verb",   ic: "✦", title: "ask ",  arg: "anything",   meta: "ai · local model · ⌘a" },
  { kind: "verb",   ic: "✎", title: "note ", arg: "anything",   meta: "notes · capture · ⌘n" },
  { kind: "verb",   ic: "▶", title: "play ", arg: "track",      meta: "music · queue · ⌘p" },
  { kind: "verb",   ic: "⏲", title: "timer ", arg: "10m",       meta: "system · ⌘t" },
  { kind: "verb",   ic: "📞", title: "call ", arg: "name|number", meta: "phone · ⌘k" },
  { kind: "thread", ic: "WK", color: "muted", title: "Mars — Wikipedia",     meta: "thread · resumed 4h" },
  { kind: "thread", ic: "HN", color: "amber", title: "Hacker News · front",  meta: "thread · 3 unread" },
  { kind: "thread", ic: "GH", color: "muted", title: "pr #842 — omnibox regression", meta: "thread · review pending" },
  { kind: "contact",ic: "MC", color: "muted", title: "Marlowe Chen",         meta: "contact · +358 41 224 7710" },
  { kind: "contact",ic: "PL", color: "muted", title: "Pia Lindqvist",        meta: "contact · +358 50 444 9921" },
  { kind: "site",   ic: "ny", color: "muted", title: "nytimes.com",          meta: "site · open in new thread" },
  { kind: "site",   ic: "gh", color: "muted", title: "github.com/xlrd/xen",  meta: "site · open in new thread" }
];

const TRANSCRIPT = [
  { t: "11:14", k: "in",  text: "open hacker news" },
  { t: "11:14", k: "out", text: "→ thread launched · news.ycombinator.com" },
  { t: "11:21", k: "in",  text: "call marlowe" },
  { t: "11:21", k: "out", text: "→ dialing +358 41 224 7710 …" },
  { t: "11:26", k: "in",  text: "timer 20m  // standup" },
  { t: "11:26", k: "ok",  text: "✓ 20m · 19:42 remaining" },
  { t: "11:34", k: "in",  text: "note: try sodium finish on the v2 render" },
  { t: "11:34", k: "ok",  text: "✓ saved to inbox · 1 of 12" },
];

const SHORTCUTS = [
  { name: "Threads",  sub: "07",   icon: "≣", cls: "" },
  { name: "Music",    sub: "▶",    icon: "♪", cls: "" },
  { name: "Wallet",   sub: "3 cards", icon: "▭", cls: "muted" },
  { name: "Maps",     sub: "Kallio", icon: "◆", cls: "muted" },
  { name: "Camera",   sub: "raw",  icon: "○", cls: "muted" },
  { name: "Calendar", sub: "16",   icon: "■", cls: "muted" },
  { name: "Notes",    sub: "12",   icon: "❐", cls: "muted" },
  { name: "Settings", sub: "v0.27",icon: "✱", cls: "muted" }
];

/* Threads — open WebKit-browser threads */
const ACTIVE_THREAD = {
  fav: "WK", favBg: "#1f6feb", favFg: "#fff",
  scheme: "https://", host: "en.wikipedia.org", path: "/wiki/Mars",
  domain: "en.wikipedia.org",
  title: "Mars — the fourth planet from the Sun",
  snippet: "Mars has two small irregularly shaped moons, Phobos and Deimos, thought to have been captured asteroids…",
  status: "reading · ¾",
  time: "now"
};

const OPEN_THREADS = [
  { fav: "HN", favBg: "#FF6600", favFg: "#fff",
    domain: "news.ycombinator.com", title: "Show HN: a phone that does five things",
    sub: "412 points · 287 comments", stat: { color: "", text: "3 new" }, time: "12m" },
  { fav: "GH", favBg: "#0d1117", favFg: "#fff",
    domain: "github.com", title: "pr #842 · omnibox scroll regression",
    sub: "@marlowe · review pending", stat: { color: "amber", text: "review" }, time: "34m" },
  { fav: "▶",  favBg: "#1A1A1A", favFg: "#fff",
    domain: "ny.times", title: "Why the smartphone era is ending",
    sub: "narration · 8m of 14m", stat: { color: "", text: "playing" }, time: "1h" },
  { fav: "◆",  favBg: "#00dc82", favFg: "#03190d",
    domain: "maps.xen", title: "Walking to Kallio · 18 min",
    sub: "via Hämeentie", stat: { color: "amber", text: "live nav" }, time: "1h" },
  { fav: "✎",  favBg: "#7afff5", favFg: "#022a26",
    domain: "mail.xen", title: "Re: Q4 firmware checklist",
    sub: "draft · unsent", stat: { color: "amber", text: "draft" }, time: "3h" },
  { fav: "WK", favBg: "#1f6feb", favFg: "#fff",
    domain: "en.wikipedia.org", title: "Phobos (moon)",
    sub: "linked from active thread", stat: { color: "dim", text: "idle" }, time: "4h" }
];

const PINNED_THREADS = [
  { fav: "BN", favBg: "#111", favFg: "#fff",
    domain: "bank.fi", title: "Account · checking",
    sub: "auto-locks in 4m", stat: { color: "red", text: "auth" }, time: "pin" },
  { fav: "CL", favBg: "#ff3344", favFg: "#fff",
    domain: "calendar.xen", title: "Today · 3 events",
    sub: "next 14:00 · Pia", stat: { color: "dim", text: "pinned" }, time: "pin" }
];

/* Phone — canon-no-demos: RECENTS/CONTACTS hydrate from /api/callers */
const _DEAD_RECENTS = [
  { name: "Marlowe Chen",     init: "MC", bg: "#00dc82", fg: "#03190d", sub: "mobile",       dir: "out",  time: "11:24" },
  { name: "Pia Lindqvist",    init: "PL", bg: "#ffb46a", fg: "#1a0d04", sub: "FaceTime",     dir: "in",   time: "09:18" },
  { name: "+358 50 882 1140", init: "?",  bg: "#1a1a1a", fg: "#c8d0c0", sub: "Helsinki",     dir: "miss", time: "Fri" },
  { name: "Dad",              init: "DD", bg: "#7afff5", fg: "#02261f", sub: "mobile · 24m", dir: "in",   time: "Fri" },
  { name: "Marlowe Chen",     init: "MC", bg: "#00dc82", fg: "#03190d", sub: "mobile (2)",   dir: "out",  time: "Thu" },
  { name: "Voicemail",        init: "✉",  bg: "#1a1a1a", fg: "#c8d0c0", sub: "1 new",        dir: "in",   time: "Thu" },
  { name: "Ravintola Sea",    init: "RS", bg: "#ff3344", fg: "#fff",    sub: "+358 9 612…",  dir: "out",  time: "Wed" }
];

const _DEAD_CONTACTS = [
  { letter: "C", entries: [
    { name: "Marlowe Chen", sub: "+358 41 224 7710", init: "MC", bg: "#00dc82", fg: "#03190d" },
    { name: "Cory Wang",    sub: "cory@xlrd.org",     init: "CW", bg: "#7afff5", fg: "#02261f" }
  ]},
  { letter: "D", entries: [
    { name: "Dad",           sub: "+358 40 555 0188", init: "DD", bg: "#7afff5", fg: "#02261f" },
    { name: "Drew Halloran", sub: "drew@radial.fm",    init: "DH", bg: "#ffb46a", fg: "#1a0d04" }
  ]},
  { letter: "L", entries: [
    { name: "Pia Lindqvist", sub: "+358 50 444 9921", init: "PL", bg: "#ffb46a", fg: "#1a0d04" },
    { name: "Lou Mariani",   sub: "lou@xlrd.org",      init: "LM", bg: "#ff3344", fg: "#fff" }
  ]},
  { letter: "M", entries: [
    { name: "Mom",            sub: "+358 40 555 0144",  init: "MM", bg: "#00dc82", fg: "#03190d" },
    { name: "Mira Sandberg",  sub: "mira@xen.xlrd.org", init: "MS", bg: "#ffb46a", fg: "#1a0d04" }
  ]}
];

const KEYS = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["✱", ""], ["0", "+"], ["#", ""]
];

/* ===========================================================
   PANE 1 — OMNIBOX  (MIRROR — live editorial feed)
   =========================================================== */
/* canon-no-demos: seeds emptied; OmniboxPane hydrates from SSE_URL on mount */
const SEED_EVENTS = [];
const _DEAD_SEEDS_OMITTED = [
  { src: "telegram",  dir: "in",  sender: "Marlowe Chen",     body: "did you see the moon tonight? it looked staged.", ts: -8 },
  { src: "email",     dir: "in",  sender: "calendar.fi",      body: "standup in 4 minutes · with Lou and Pia",                     ts: -32 },
  { src: "beside",    dir: "in",  sender: "Pia",              body: "took the long way home. milk?",                                ts: -94 },
  { src: "whatsapp",  dir: "out", recipient: "Mom",           body: "boarding in 20 — landing 19:14, gate 22B",                     ts: -210 },
  { src: "slack",     dir: "in",  sender: "Drew Halloran",    body: "ok the firmware test passed. shipping it.",                    ts: -340 },
  { src: "x",         dir: "in",  sender: "@karpathy",        body: "the keyboard is the new bottleneck. voice-first computing is back on the menu.", ts: -520 },
  { src: "signal",    dir: "in",  sender: "+358 50 882 1140", body: "Hei, this is the dentist office reminding you of your appointment thursday at 10:30.", ts: -780 },
  { src: "discord",   dir: "in",  sender: "moonlit#7041",     body: "anyone else seeing the canary build crash on the omnibox swipe?", ts: -900 },
  { src: "instagram", dir: "in",  sender: "@cory",            body: "tagged you in a story — sodium finish v2 render",              ts: -1080 },
  { src: "linkedin",  dir: "in",  sender: "Mira Sandberg",    body: "congrats on the launch — would love to chat about the OS",     ts: -1320 },
  { src: "facebook",  dir: "in",  sender: "Mom",              body: "happy birthday darling 🌹",                                     ts: -1600 },
  { src: "telegram",  dir: "out", recipient: "Cory Wang",     body: "love it. let's keep the sodium finish for v2",                  ts: -1840 },
  { src: "beside",    dir: "in",  sender: "Pia",              body: "🌒",                                                            ts: -2100 }
];

const NEW_EVENT_POOL = []; /* canon-no-demos: pool emptied; live SSE drives it */
const _DEAD_POOL_OMITTED = [
  { src: "telegram",  dir: "in",  sender: "Marlowe Chen",  body: "actually scratch that, found a cleaner pattern" },
  { src: "email",     dir: "in",  sender: "weather.fi",    body: "rain expected in 14 minutes · helsinki" },
  { src: "signal",    dir: "in",  sender: "Lou Mariani",   body: "running 5 late, sorry" },
  { src: "beside",    dir: "in",  sender: "Pia",           body: "home in 10" },
  { src: "slack",     dir: "in",  sender: "Drew",          body: "@here — pushing v0.27.1 build to canary in 3" },
  { src: "linkedin",  dir: "in",  sender: "Anders Voss",   body: "would love to hear about the voice-first stack you're building" },
  { src: "whatsapp",  dir: "in",  sender: "Mom",           body: "are you eating enough" },
  { src: "x",         dir: "in",  sender: "@balajis",      body: "this is the right direction. less app, more verb." },
  { src: "discord",   dir: "in",  sender: "yorick#1024",   body: "found a regression in the dialpad cursor — issue filed" },
  { src: "instagram", dir: "in",  sender: "@cory",         body: "sent you a dm" },
  { src: "facebook",  dir: "in",  sender: "Aunt Liisa",    body: "added you to 'Family Recipes 🍞'" },
  { src: "telegram",  dir: "out", recipient: "Drew",       body: "thx — pushing v0.27.1 tonight" },
  { src: "signal",    dir: "in",  sender: "Mira Sandberg", body: "the deck is ready — review when you can" }
];

function fmtRelative(secAgo) {
  if (secAgo < 60) return secAgo + "s";
  if (secAgo < 3600) return Math.floor(secAgo / 60) + "m";
  if (secAgo < 86400) return Math.floor(secAgo / 3600) + "h";
  return Math.floor(secAgo / 86400) + "d";
}

/* Linkify body text: turn http(s)://... and bare domains into clickable spans
   that route to the browser pane via onOpenLink (canon-iframes-banned uses
   window.open under the hood). qi 2026-05-17 8672: threads open in main
   browser pane only when a link is clicked. */
function linkifyBody(body, onOpenLink) {
  if (!body) return null;
  const RE = /(https?:\/\/[^\s<>"]+|\b[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s<>"]*)?)/gi;
  const matches = body.matchAll(RE);
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of matches) {
    if (m.index > last) out.push(body.slice(last, m.index));
    const raw = m[0];
    const url = raw.startsWith("http") ? raw : "https://" + raw;
    out.push(
      <a
        key={"l" + (i++)}
        className="mc-link"
        href={url}
        onClick={(e) => {
          e.preventDefault();
          if (onOpenLink) {
            try {
              const host = new URL(url).host;
              onOpenLink({ id: url, url, name: host, host });
            } catch (_) {
              onOpenLink({ id: url, url, name: url, host: url });
            }
          }
        }}
      >{raw}</a>
    );
    last = m.index + raw.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

/* qi 2026-07-01: replay button on chat bubbles — MUST be the exact canonical
   VVS voice queue (Ava, api.xlrd.org/api/tts via <audio> element), same path
   as vvsvei/index.html's _avaDrain. WebAudio decodeAudioData is DISABLED
   there (2026-06-06 note: fails on this TTS's MP3 encoding) — do not use it
   here either. One-shot playback via a plain Audio element, GET ?text=. */
/* qi 2026-07-21 AUTO BARGE-IN (canon: barge-in mandatory): ONE audio channel,
   newest wins. Every play() first cuts the currently-playing bubble so a new
   click (or a rapid double-tap) never overlaps/garbles the prior one — the same
   single-channel discipline vvsvei/index.html enforces via _avaCurrentSource. */
let _xosCurAudio = null;
// Last line spoken through THIS page. SSE replays recent events on every reconnect,
// and repeating a sentence he already heard is worse than dropping one — he cannot
// un-hear it. Declared beside _xosCurAudio because both are single-channel state.
let _xosLastSpoken = "";
function _xosStopCurrent() {
  if (_xosCurAudio) {
    try { _xosCurAudio.pause(); _xosCurAudio.currentTime = 0; _xosCurAudio.src = ""; } catch (_) {}
    _xosCurAudio = null;
  }
  // If a device speechSynthesis fallback was ever used, cut it too (single channel).
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
}
/* qi 2026-08-13 17:35: "two voices can't speak at the same time" — the play
   button must cut Xen mid-sentence, not stack on top of him.
   MEASURED FAULT: _xosStopCurrent() only reaches THIS page's channel
   (_xosCurAudio + speechSynthesis). Xen's voice is the system TTS driven by
   omnimind on the Mac — a different process, a different output path, invisible
   to a browser tab. So replay silenced the page and Xen kept talking over it.
   THE VSQ (qi: "everything goes through the VSQ… that's the one voice one
   brain") is the shared referee: POST /api/voice/claim takes the channel and
   silences whoever held it. Fire-and-forget — a claim that fails must never
   block playback, because no voice is itself a crash. */
/* This page's VSQ identity. One constant, used BOTH to claim and to decide
   whether an inbound claim is my own echo — two literals would drift apart and
   the page would silence itself the instant it started speaking. */
const VSQ_SELF = "xos-replay";
function _vsqClaim(owner) {
  try {
    /* MUST be https and same host family as the rest of the page's calls.
       hitthe.link is served over https, so http://127.0.0.1:4441 is blocked as
       mixed content — the request never leaves the tab and the claim silently
       never happens.
       MEASURED 2026-08-13 17:49: omni.xlrd.org returns "not found" for this —
       that host fronts the omni-inbox server on :4489, NOT omnimind on :4441.
       xen.xlrd.org is the omnimind front (it is where this page already POSTs
       /api/dictate-inject). CORS is open there: preflight 204, ACAO *. */
    fetch("https://xen.xlrd.org/api/voice/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}
function playBubble(text) {
  _vsqClaim(VSQ_SELF);          // barge every OTHER surface (Xen's voice)
  _xosStopCurrent();            // barge THIS page's channel
  if (!text) return;
  // engine=eleven REQUIRED (qi 2026-08-17) — omnimind.js:3491-3497 derives
  // wantEleven from this param on GET only; with no param it is false and the
  // handler falls through to the edge-tts Ava block at :3736, ignoring voice.id
  // entirely. Same defect as vvsvei/index.html; both surfaces had to be fixed or
  // whichever one qi opened would still speak in Ava.
  const a = new Audio("https://api.xlrd.org/api/tts?text=" + encodeURIComponent(text.slice(0, 350)) + "&engine=eleven");
  _xosCurAudio = a;             // this is now the sole live channel
  a.addEventListener("ended", () => { if (_xosCurAudio === a) _xosCurAudio = null; });
  a.play().catch(() => {});
}

function MirrorCard({ ev, fresh, onReply, onOpenLink }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  /* qi 2026-05-25 04:11 timestamps fix: ev.ts is UNIX seconds (per
     normalizeLiveEvent which already multiplies by 1000). Pass directly to
     Date — previous code added it to Date.now() yielding far-future garbage. */
  const time = ev._absTs ? new Date(ev._absTs)
             : ev.ts > 0 ? new Date(toMs(ev.ts))
             : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  let _h = time.getHours();
  const _m = pad(time.getMinutes());
  const _ampm = _h >= 12 ? "PM" : "AM";
  _h = (_h % 12) || 12;
  /* qi 2026-08-15 02:05: "it all needs to have the dates in their time stamp to
     quickly [see] how stale they are". A bare clock time is ambiguous by design —
     "2:07 PM" reads identically whether it landed four minutes ago or in March,
     so a stale thread and a live one are indistinguishable at a glance. That is
     the whole complaint: the inbox interleaves five networks and 1,159 messages,
     and without a date the sort order is the ONLY staleness cue.
     Ladder, cheapest-signal-first — the date appears only when it carries
     information, so today's traffic stays as short as it is now:
       today        2:07 PM
       yesterday    Yest 2:07 PM
       this year    Aug 14, 2:07 PM
       older        Aug 14 2025
     Comparison is by LOCAL calendar day, not by elapsed ms: a 6-hour-old message
     at 11pm crossed into a new day and must read "Yest", which a >24h test gets
     wrong in exactly the small hours he works in. */
  const _clock = `${_h}:${_m} ${_ampm}`;
  const _now = new Date();
  const _dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const _yest = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 1);
  const _MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const when =
      _dayKey(time) === _dayKey(_now)  ? _clock
    : _dayKey(time) === _dayKey(_yest) ? `Yest ${_clock}`
    : time.getFullYear() === _now.getFullYear()
        ? `${_MON[time.getMonth()]} ${time.getDate()}, ${_clock}`
        : `${_MON[time.getMonth()]} ${time.getDate()} ${time.getFullYear()}`;
  const sec = pad(time.getSeconds());
  const isOut = ev.dir === "out";
  /* qi 2026-05-17 8672 follow-up: chatID-keyed thread routing.
     If the card has a chatID (Beeper / SMS thread), clicking the whole "who"
     line opens it as a tab in the browser pane via a synthetic thread URL.
     Falls back gracefully when chatID is absent - just no-op click. */
  const threadKey = ev.chatID || ev.threadId || null;
  const openAsTab = () => {
    if (!onOpenLink) return;
    if (!threadKey) return;
    const url = `https://xen.xlrd.org/thread/${encodeURIComponent(threadKey)}`;
    const label = (ev.sender || ev.recipient || ev.src || "thread");
    onOpenLink({ id: threadKey, url, name: label, host: ev.src || "thread" });
  };
  return (
    <article className={"mcard" + (fresh ? " fresh" : "")} data-src={ev.src}>
      <div className="meta-row">
        <span className="ts"><b>{when}</b>:{sec}</span>
        <button
          className="mpill play"
          title="Play this message aloud"
          onClick={(ce) => { ce.stopPropagation(); playBubble(ev.body); }}
          style={{ cursor: "pointer" }}
        >▶</button>
        <span className="mpill src">{ev.src}</span>
        <span className={"mpill dir " + (isOut ? "out" : "")}>
          {isOut ? `out · ${ev.recipient}` : "in"}
        </span>
        {threadKey && (
          <span
            className="mpill thread-open"
            title="Open thread in browser pane"
            onClick={openAsTab}
            style={{ cursor: "pointer" }}
          >open ↗</span>
        )}
      </div>
      <div
        className={"who" + (threadKey ? " clickable" : "")}
        onClick={threadKey ? openAsTab : undefined}
        style={threadKey ? { cursor: "pointer" } : null}
      >
        {isOut ? (
          <><b>East</b> → {ev.recipient}</>
        ) : (
          <><b>{ev.sender}</b> → East</>
        )}
      </div>
      <div className="body">{linkifyBody(ev.body, onOpenLink)}</div>
      {!isOut && !open && (
        <button className="reply" onClick={() => setOpen(true)}>reply</button>
      )}
      {open && (
        <div className="reply-form">
          <textarea
            className="reply-ta"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (val.trim()) { onReply(ev, val.trim()); setOpen(false); setVal(""); }
              }
              if (e.key === "Escape") { setOpen(false); setVal(""); }
            }}
            placeholder={`reply as East to ${ev.sender}…`}
            rows={1}
            autoFocus
          />
          <div className="reply-bar">
            <button className="reply-cancel" onClick={() => { setOpen(false); setVal(""); }}>cancel</button>
            <span className="reply-hint">⌘ + ↵</span>
            <button
              className="reply-send"
              disabled={!val.trim()}
              onClick={() => { if (val.trim()) { onReply(ev, val.trim()); setOpen(false); setVal(""); } }}
            >
              send
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ===========================================================
   MATRIX CLIENT PANE - qi 2026-06-30/07-01: "make XOS a true
   matrix client... everything goes through there, nothing left
   behind." Raw Client-Server API via fetch (no bundler here, so
   matrix-js-sdk is out - same /sync long-poll pattern already
   proven in matrix-omni-sync.js). Sees every bridged room
   (GV/WhatsApp/Telegram/Meta-FB-IG/Slack/Discord/LinkedIn)
   directly from the homeserver, not the omni-curated subset.
   =========================================================== */
const MATRIX_HS = "https://matrix.xlrd.org";

function matrixSenderLabel(sender) {
  const m = /^@([a-z]+)_/.exec(sender || "");
  if (m) return m[1];
  if (sender === "@self:mymatrix.local") return "you";
  return (sender || "").replace(/^@/, "").split(":")[0];
}

function MatrixClientPane() {
  const [status, setStatus] = useState("connecting");
  const [events, setEvents] = useState([]);
  const tokenRef = useRef(null);
  const nextBatchRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function login() {
      const r = await fetch(MATRIX_HS + "/_matrix/client/v3/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: "self" },
          password: "0000",
        }),
      });
      const d = await r.json();
      if (!d.access_token) throw new Error("matrix login failed");
      tokenRef.current = d.access_token;
    }

    async function syncOnce() {
      const params = new URLSearchParams({
        timeout: nextBatchRef.current ? "25000" : "0",
        ...(nextBatchRef.current ? { since: nextBatchRef.current } : {}),
        filter: JSON.stringify({
          room: { timeline: { limit: 20, types: ["m.room.message"] }, state: { types: [] } },
          presence: { not_types: ["*"] },
        }),
      });
      const r = await fetch(MATRIX_HS + "/_matrix/client/v3/sync?" + params, {
        headers: { Authorization: "Bearer " + tokenRef.current },
      });
      if (r.status === 401) throw new Error("token expired");
      const d = await r.json();
      if (d.next_batch) nextBatchRef.current = d.next_batch;
      const joins = (d.rooms && d.rooms.join) || {};
      const fresh = [];
      for (const [roomId, rd] of Object.entries(joins)) {
        for (const ev of ((rd.timeline && rd.timeline.events) || [])) {
          if (ev.type !== "m.room.message") continue;
          const body = ev.content && ev.content.body;
          if (!body) continue;
          fresh.push({
            id: ev.event_id,
            src: matrixSenderLabel(ev.sender),
            dir: ev.sender === "@self:mymatrix.local" ? "out" : "in",
            sender: ev.sender,
            body,
            chatID: roomId,
            _absTs: ev.origin_server_ts || Date.now(),
          });
        }
      }
      if (fresh.length) {
        setEvents((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const add = fresh.filter((f) => !seen.has(f.id));
          return add.length ? [...add.reverse(), ...prev].slice(0, 100) : prev;
        });
      }
    }

    async function loop() {
      try {
        await login();
        await syncOnce();
        setStatus("live");
        while (!cancelledRef.current) {
          await syncOnce();
        }
      } catch (e) {
        if (cancelledRef.current) return;
        setStatus("reconnecting");
        setTimeout(loop, 4000);
      }
    }
    loop();
    return () => { cancelledRef.current = true; };
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "12px", fontSize: 13, color: "#e8e8ea" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, opacity: 0.7 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: status === "live" ? "#00dc82" : "#f5a623", display: "inline-block" }} />
        <span>matrix - {status} - {events.length} events</span>
      </div>
      {events.map((e) => (
        <div key={e.id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ opacity: 0.55, fontSize: 11 }}>{e.src}{e.dir === "out" ? " (you)" : ""}</div>
          <div>{e.body}</div>
        </div>
      ))}
    </div>
  );
}

// ── WHAT BELONGS IN THE OMNI-INBOX ───────────────────────────────────────────
// qi 2026-08-12 17:09: "the omniibox is for the email + beeper threads".
//
// A DENYLIST, not an allowlist, and that choice matters. An allowlist of known
// networks would silently swallow a Beeper bridge that reports a src we have not
// enumerated yet (Beeper bridges 469 rooms across telegram/whatsapp/gmessages/
// slack/instagram/discord per omni-inbox-server.js) — a new bridge would vanish
// from the inbox with no error. A denylist fails the other way: an unrecognised
// source SHOWS UP, which is visible and fixable, instead of going missing.
//
// The denied set is the VVSVEI/OmniTap tap classes, measured live on /xos/:
// vei-telemetry, xen-vei, xen-vei-typed, vvsvei-audio, shortcut.
const VVSVEI_SRC = /^(vei-|xen-vei|vvsvei|shortcut$|omi:|bee(-ios)?[:-])/i;
function isOmniboxSource(src) {
  if (!src) return true;              // unknown source: show it, never hide it
  return !VVSVEI_SRC.test(String(src));
}

function OmniboxPane({ voice, onNewEvent, onOpenLink }) {
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(false);
  const [platform, setPlatform] = useState("all");
  const [events, setEvents] = useState([]);
  const [count, setCount] = useState(0);
  const [sseState, setSseState] = useState("connecting");
  // Transport health for the INBOX feed specifically, kept separate from sseState
  // on purpose. sseState is set "live" by absorb() the moment ANY snapshot lands,
  // including one a 10s poll dragged in — so it cannot answer "am I actually live?".
  // Conflating them would let a polling pane advertise itself as pushed, which is
  // the dishonest-status failure this file has been bitten by repeatedly.
  // Values: connecting · live (ws) · live+beeper · polling (fallback) · unsupported
  const [omniLive, setOmniLive] = useState("connecting");
  // Read inside the poll tick to decide whether to fetch. A ref, not state, because
  // the running pump() closure must see the CURRENT value, not the one captured
  // when the effect mounted.
  const wsOpenRef = useRef(false);
  const onNewEventRef = useRef(onNewEvent);
  onNewEventRef.current = onNewEvent;

  /* ── MERGED BEEPER + EMAIL POLL (the inbox's actual source) ────────────────
     Additive to the SSE below rather than replacing it: the firehose is a live
     connection qi is using right now, and the canon on it is "it can never
     drop". This effect only ADDS the thread traffic that was missing.

     Newest-first, matching what the pane already renders. The server returns the
     full snapshot each tick, so dedupe is by identity (roomId+ts+text) and the
     existing `fresh`/`unread` flags are preserved for items we have already seen
     — otherwise every 10s poll would re-flash all 292 rows as new. */
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let idc = 0;

    // Ingest one snapshot, whatever transport delivered it.
    const absorb = (j) => {
      try {
        if (cancelled || !j || !Array.isArray(j.messages)) return;
        setSseState("live");
        setEvents((prev) => {
          const seen = new Map(prev.map((p) => [p._omniKey || p.id, p]));
          const rows = j.messages.map((m, i) => {
            // The POSITION is part of the identity, and it has to be.
            // MEASURED: roomId|ts|text[0..40] collided 74 times on one load —
            // repeated messages in the same room share a timestamp AND an
            // opening ("Forwarded message from Luckie Links\n\n> "), so React saw
            // duplicate keys and its own warning says children "may be
            // duplicated and/or omitted". Omitted means qi silently loses
            // messages from his inbox, which is worse than any styling bug.
            // Index is stable because the server returns a sorted snapshot.
            const key = (m.roomId || "") + "|" + (m.ts || 0) + "|" + i;
            const old = seen.get(key);
            if (old) return old;                     // keep read/fresh state
            return {
              id: "omni-" + (idc++) + "-" + key,
              _omniKey: key,
              _absTs: m.ts || 0,
              src: m.network || "beeper",
              sender: m.sender || m.title || "",
              recipient: "",
              body: m.text || "",
              chatID: m.roomId || "",
              account: m.account || "",
              ts: m.ts || 0,
              fresh: false,
              unread: !!m.unread,
            };
          });
          // 2026-08-13 01:06 — WAS `return rows.slice(0,300)`, which DISCARDED
          // `prev` outright. The comment at the head of this effect promises
          // "Additive to the SSE below rather than replacing it" — the code
          // never did that. Every poll tick wiped every SSE-delivered row, so
          // the live firehose was erased on a 10s heartbeat. The comment
          // described code that was never written.
          // Now genuinely additive: keep any prev row the snapshot does not
          // carry (that is the SSE traffic), union it in, re-sort, then cap.
          const pollKeys = new Set(rows.map((r) => r._omniKey || r.id));
          const sseOnly = prev.filter((p) => !pollKeys.has(p._omniKey || p.id));
          const merged = rows.concat(sseOnly);
          merged.sort((a, b) => (b._absTs || 0) - (a._absTs || 0));
          return merged.slice(0, 300);
        });
        setCount(j.total || j.messages.length);
      } catch (_) {
        // Fail soft: a malformed frame must not empty his inbox or kill the feed.
      }
    };

    // ── THE POLL IS NOW THE FALLBACK, NOT THE FEED ───────────────────────────
    //
    // Kept, deliberately, and the history below is why it is kept rather than
    // deleted the moment a socket appeared:
    //
    // I once switched this to EventSource on /sse-stream because I found that
    // route in omni-inbox-server.js. What I ignored: curling it through the
    // Cloudflare tunnel returned NO HEADERS AT ALL, while /api/stream returned a
    // full body. Cloudflare does not pass this text/event-stream through. So the
    // EventSource failed, my onerror retried every 3s, and every retry logged —
    // console errors climbed 38 → 75 → 194 on a single page view, a permanent
    // error loop pointed at a dead socket.
    //
    // THE LESSON, written where it can't be lost: "the endpoint exists in the
    // source" is not "the endpoint answers through the edge". The instrument
    // already told me it hung; I proceeded anyway.
    //
    // That lesson applies to the WebSocket added below EXACTLY as much as it
    // applied to the SSE. So this poll stays wired and armed. If wss:// never
    // establishes through the tunnel, every tick below runs and qi's inbox
    // behaves identically to how it behaved before this change — no regression is
    // possible from the socket failing, only an improvement from it working.
    //
    // /api/stream is VERIFIED end to end — CORS `access-control-allow-origin: *`
    // from the hitthe.link origin, ok:true, 292 messages, 292 cleartext.
    const pump = async () => {
      if (cancelled) return;
      // FALLBACK ONLY: while the socket is open the server pushes a full merged
      // snapshot on connect, on every new Beeper message, and on every 20s
      // server-side refresh. Fetching on top of that is pure duplicate load, and
      // "live by default" means the socket drives the pane, not a timer.
      if (!wsOpenRef.current) {
        try {
          const r = await fetch(OMNI_STREAM, { cache: "no-store" });
          absorb(await r.json());
          // Only claim "polling" if the socket has NOT announced itself. During a
          // cold start both are briefly true — the socket is genuinely live while
          // the poll covers the gap until the first real snapshot — and in that
          // window the honest label is the socket's, not the poll's.
          if (!cancelled) setOmniLive((s) => (s.indexOf("live") === 0 ? s : "polling (fallback)"));
        } catch (_) {
          // Fail soft: a transient tunnel hiccup must not empty his inbox, and
          // must not stop the next tick either.
        }
      }
      // The timer keeps running either way. That is what makes the fallback
      // AUTOMATIC: the instant the socket drops, the very next tick fetches.
      if (!cancelled) timer = setTimeout(pump, OMNI_POLL_MS);
    };
    pump();

    // ── PRIMARY LIVE PATH: the omni-inbox WebSocket ──────────────────────────
    // Carries the Beeper Desktop events socket, bridged server-side. Frames:
    //   {type:"hello",  beeper:{socket,...}}  — sent once on connect
    //   {type:"stream", messages:[…], …}      — a FULL merged snapshot
    //   {type:"beeper", …}                    — Beeper-leg status changed
    //
    // ONE INGEST PATH ON PURPOSE. The server always pushes a full snapshot, never
    // a lone message, so everything lands through the same absorb() that the poll
    // uses. absorb() keys rows by (roomId|ts|INDEX) — an index that is only
    // meaningful within a complete sorted snapshot — so splicing in a single
    // message would mint a key that collides with a real row and React would
    // silently drop one of them. Losing a message from an inbox is the worst
    // possible bug here, so the transport never gets its own ingest path.
    let ws = null;
    let wsRetry = 500;
    let wsRetryTimer = null;
    let wsSilenceTimer = null;
    let wsAttempts = 0;

    const clearSilenceWatch = () => {
      if (wsSilenceTimer) { clearTimeout(wsSilenceTimer); wsSilenceTimer = null; }
    };
    // A socket that reads OPEN while delivering nothing is the failure mode this
    // stack hits constantly (listening port, zero response). Treat silence as death.
    const armSilenceWatch = () => {
      clearSilenceWatch();
      wsSilenceTimer = setTimeout(() => {
        if (cancelled) return;
        try { ws && ws.close(); } catch (_) {}   // onclose drives the reconnect
      }, OMNI_WS_SILENCE_MS);
    };

    const scheduleWsRetry = () => {
      if (cancelled) return;
      if (wsRetryTimer) clearTimeout(wsRetryTimer);
      wsRetryTimer = setTimeout(wsConnect, wsRetry);
      wsRetry = Math.min(wsRetry * 2, 8000);   // 500ms → 8s ceiling, never gives up
    };

    function wsConnect() {
      if (cancelled) return;
      if (typeof WebSocket === "undefined") { setOmniLive("unsupported"); return; }
      wsAttempts += 1;
      // Honest label: only the first attempt is "connecting". Everything after a
      // failure is a reconnect and says so — never silently pretend to be live.
      if (!wsOpenRef.current) setOmniLive(wsAttempts === 1 ? "connecting" : "reconnecting");
      try {
        ws = new WebSocket(OMNI_WS);
      } catch (_) {
        scheduleWsRetry();
        return;
      }
      ws.onopen = () => {
        // DELIBERATELY EMPTY. An open socket is NOT a working feed — the measured
        // canon is that a 101 upgrade alone proves nothing. `live` is claimed only
        // when the server's hello frame actually arrives, below.
        if (!cancelled) armSilenceWatch();
      };
      ws.onmessage = (evt) => {
        if (cancelled) return;
        armSilenceWatch();
        let f;
        try { f = JSON.parse(evt.data); } catch (_) { return; }
        if (!f || !f.type) return;
        if (f.type === "hello" || f.type === "beeper") {
          wsRetry = 500;                       // a real frame resets the backoff
          const b = f.beeper || {};
          // Two different truths, reported as two different words: the page's own
          // socket is up ("live"), and the Beeper leg behind it is subscribed
          // ("live+beeper"). A working page socket in front of a dead Beeper
          // socket must never render as though Beeper were flowing.
          setOmniLive(b.socket === "subscribed" ? "live+beeper" : "live");
          return;
        }
        if (f.type === "stream") {
          wsRetry = 500;
          absorb(f);
          // THE POLL IS ONLY SILENCED BY A SNAPSHOT THAT ACTUALLY CARRIED DATA.
          // MEASURED 2026-08-15: a client that connected before the server's first
          // refresh finished received {messages:[], total:0, source:"none-yet"}
          // while /api/stream served 1159 real messages moments later. Suppressing
          // the poll on THAT frame would have handed qi an empty inbox and called
          // it live. Connection state and data state are not the same fact, so an
          // empty feed can never be caused by this transport: the fallback keeps
          // running until real rows arrive. (The server also builds a snapshot on
          // demand for cold-start clients — this is the second line of defence,
          // deliberately kept even though the first one now exists.)
          if (Array.isArray(f.messages) && f.messages.length > 0) wsOpenRef.current = true;
          return;
        }
      };
      // ONE drop per socket. onerror and onclose BOTH fire for a single failed
      // connection (and close() inside the handler re-enters onclose), so without
      // this latch every failure would schedule two or three reconnects — the
      // backoff would still double, but two overlapping chains would race and the
      // "capped at 8s" ceiling would silently become a 4s hammer. `dead` is scoped
      // to THIS socket, so a later reconnect gets its own fresh latch.
      const thisWs = ws;
      let dead = false;
      const drop = () => {
        if (cancelled || dead) return;
        dead = true;
        wsOpenRef.current = false;             // the next poll tick takes over
        clearSilenceWatch();
        setOmniLive("reconnecting");
        try { thisWs.onclose = null; thisWs.onerror = null; thisWs.close(); } catch (_) {}
        // Do not wait up to OMNI_POLL_MS to refill: fetch immediately, then let
        // the existing chain continue. qi never waits on a timer to be shown his
        // own inbox.
        if (timer) clearTimeout(timer);
        pump();
        scheduleWsRetry();
      };
      ws.onerror = drop;
      ws.onclose = drop;
    }
    wsConnect();

    return () => {
      cancelled = true;
      wsOpenRef.current = false;
      if (timer) clearTimeout(timer);
      if (wsRetryTimer) clearTimeout(wsRetryTimer);
      if (wsSilenceTimer) clearTimeout(wsSilenceTimer);
      if (ws) { try { ws.onclose = null; ws.onerror = null; ws.close(); } catch (_) {} }
    };
  }, []);

  /* live SSE feed from xen.xlrd.org/events — canon-no-demos
     qi 2026-05-17 8672: "firehose isn't stay connected. It can never drop."
     Reconnect with exponential backoff capped at 8s. Never give up. */
  useEffect(() => {
    let es;
    let counter = 0;
    let cancelled = false;
    let retryDelay = 500;
    let retryTimer = null;
    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(SSE_URL);
        es.onopen = () => {
          if (cancelled) return;
          retryDelay = 500;
          setSseState("live");
        };
        es.onerror = () => {
          if (cancelled) return;
          setSseState("reconnecting");
          try { es && es.close(); } catch (_) {}
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 8000);
        };
        es.onmessage = (msg) => {
          if (cancelled) return;
          let raw;
          try { raw = JSON.parse(msg.data); } catch (e) { return; }
          if (!raw || raw.event === "connected" || raw.event === "caught-up") return;
          // ── VSQ: someone else took the voice channel — go quiet NOW. ───────
          // This MUST sit above the body/text guard below: a claim carries no
          // message body, so the guard would drop it and the whole broadcast
          // leg would be dead code that still looks wired.
          if (raw.event === "xen:voice-claim") {
            if (!raw.data || raw.data.owner !== VSQ_SELF) _xosStopCurrent();
            return;
          }
          // ── XEN SPEAKS THROUGH THE INTERFACE (qi 2026-08-15 06:45, verbatim:
          // "now it needs to come through the face" / "come through the interface") ──
          // Until today omnimind DROPPED source:'xen-speak' at its front door
          // (omnimind.js ~4490) to kill an echo loop, so this event never existed and
          // the page could only speak when qi TAPPED a bubble — a human in the loop,
          // which is itself the failure (cmd 4). The drop is now a broadcast: the
          // FEED_ONLY guard (feed-only-sources.json, 'XEN-SPEAK') reaches SSE but never
          // injectTui, so the echo path the drop protected stays closed.
          //
          // MUST sit ABOVE the body guard for the same reason voice-claim does: order
          // here is load-bearing, and a future event shape without .text would silently
          // become dead code that still looks wired.
          //
          // Reuses the ONE audio channel (_vsqClaim + _xosStopCurrent inside playBubble)
          // so Xen never talks over himself — qi 2026-08-13 17:35 "two voices can't
          // speak at the same time".
          // 2026-08-16: the live wire frame is {event:"xen:speak", data:{source,text,voice_id,audio_url?}}.
          // The old check read top-level raw.event==="xen-speak"/raw.source/raw.audioUrl — all three
          // wrong (colon vs hyphen; fields nested under raw.data; snake_case audio_url) — so EVERY
          // voice event was discarded and XOS was silent while desktop afplay worked. Read raw.data
          // (like the voice-claim handler above), match "xen:speak", accept audio_url. Kept the old
          // top-level shape too so nothing that still emits it regresses.
          if (raw.event === "xen:speak" || (raw.data && raw.data.source === "xen-speak") || raw.event === "xen-speak" || raw.source === "xen-speak") {
            const _d = raw.data || raw;
            const _sp = _d.text || _d.body || _d.message || raw.text || raw.body || raw.message || "";
            const _au = _d.audio_url || _d.audioUrl || raw.audio_url || raw.audioUrl;
            // Dedup: SSE reconnects replay recent events; speaking a line twice is
            // worse than dropping a duplicate, because he cannot un-hear it.
            if (_sp && _sp !== _xosLastSpoken) {
              _xosLastSpoken = _sp;
              if (_au) {
                // Prefer the ALREADY-RENDERED file — re-synthesising holds Voicebox's
                // single CPU-bound generator, which is what made qi deaf on 2026-08-14.
                _vsqClaim(VSQ_SELF);
                _xosStopCurrent();
                const a = new Audio(_au);
                _xosCurAudio = a;
                a.addEventListener("ended", () => { if (_xosCurAudio === a) _xosCurAudio = null; });
                a.play().catch((e) => console.warn("[xen-speak] autoplay blocked:", e && e.name));
              } else {
                playBubble(_sp);
              }
            }
            return;
          }
          if (!(raw.body || raw.text || raw.message)) return;
          // qi 2026-05-22 ultrathink: drop ancient backfill from SSE replay (>30d old) so live feed isn't 2020 noise
          // Same unit bug as normalizeLiveEvent: this compared ms against seconds,
          // so raw.ts was always ~1000x the threshold and the guard NEVER fired.
          if (raw.ts && raw.ts > 0 && toMs(raw.ts) < Date.now() - 30 * 86400 * 1000) return;
          const next = { ...normalizeLiveEvent(raw, counter++), fresh: true, unread: true };
          // ── THE OMNI-INBOX IS EMAIL + BEEPER THREADS. NOTHING ELSE. ────────
          // qi 2026-08-12 17:08: "the omniinbox should not be showing what its
          // showing currently because that what the vvsvei is for" / 17:09:
          // "the omniibox is for the email + beeper threads".
          //
          // The shared SSE carries BOTH classes of traffic: message threads AND
          // the VVSVEI voice/OmniTap taps (vei-telemetry, xen-vei,
          // xen-vei-typed, vvsvei-audio, shortcut). This pane was rendering all
          // of it, so the voice feed was duplicated into the inbox — the
          // omni-inbox's job is threads you reply to, VVSVEI's job is the tap
          // stream.
          //
          // Rejected AT INGEST rather than filtered at render, deliberately: a
          // render-time filter still lets them into `events`, where they eat the
          // 60-item cap and evict real threads. Measured before this fix: 52
          // cards on screen, 50 of them vei-* — a 96% eviction rate on qi's
          // actual inbox.
          //
          // This is also why the `platform` pill appeared broken: its options
          // are messaging networks and NONE of them ever matched a vei-* src.
          /* ── qi's OWN WORDS ARE NEVER NOISE. Added 2026-08-13 19:52 after he
             said "But its not posting" with his voice ALREADY reaching the seat.
             The ingest filter above was mine, shipped earlier today to keep the
             omni-inbox to email + beeper threads. It works — and it also dropped
             `xen-vei` / `xen-vei-typed`, which is qi HIMSELF speaking and typing.
             So the pane went quiet on the one source that must never be filtered:
             the operator. He watched his own words vanish and reported the app as
             broken, correctly.
             The distinction the original change actually wanted is qi vs MACHINE,
             not vei vs thread: `vei-telemetry` and `vvsvei-audio` are speak-gate
             counters and audio blobs, still correctly dropped below. This exempts
             only the two rails that carry a human. */
          const _isQiOwn = /^xen-vei(-typed)?$/i.test(String(next.src || ""));
          if (!_isQiOwn && !isOmniboxSource(next.src)) return;
          setEvents((prev) => {
            if (prev.some((p) => p._absTs === next._absTs && p.body === next.body && p.sender === next.sender)) {
              return prev;
            }
            return [next, ...prev].slice(0, 60);
          });
          setCount((c) => c + 1);
          if (onNewEventRef.current) onNewEventRef.current(next);
          setTimeout(() => {
            setEvents((prev) => prev.map((x) => (x.id === next.id ? { ...x, fresh: false } : x)));
          }, 900);
        };
      } catch (e) {
        setSseState("reconnecting");
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 8000);
      }
    };
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) try { es.close(); } catch (_) {}
    };
  }, []);

  const handleReply = (ev, text) => {
    const reply = {
      src: ev.src,
      dir: "out",
      recipient: ev.sender,
      body: text,
      ts: 0,
      id: "reply-" + Date.now() + "-" + Math.random(),
      fresh: true,
      unread: false
    };
    setEvents((prev) => {
      const next = [reply, ...prev].slice(0, 60);
      return next.map((x) => (x.id === ev.id ? { ...x, unread: false } : x));
    });
    setCount((c) => c + 1);
    /* ── OUTBOUND. Threads from the merged inbox reply through omni /api/reply,
       which routes each item to ITS OWN origin channel: email→SMTP via
       omni-email.mjs, chat→Matrix via the encrypted sidecar. That is the leg
       that makes Beeper and Spark unnecessary, so it must never fail quietly.

       The old code posted every reply to xen.xlrd.org/mirror/reply and swallowed
       the result with `.catch(() => {})` — so a reply that never left the
       building looked identical to one that sent. Now: omni items go to
       /api/reply with the {roomId, text} shape it actually expects, the response
       is CHECKED (it answers 200 ok:true / 502 on failure), and a failure marks
       the bubble so qi can see it did not send. Non-omni items keep the legacy
       mirror route. */
    const isOmni = !!ev._omniKey;
    const markFailed = (why) => {
      setEvents((prev) => prev.map((x) =>
        x.id === reply.id ? { ...x, sendFailed: true, sendError: String(why || "send failed") } : x));
    };
    try {
      if (isOmni) {
        fetch(OMNI_REPLY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: ev.chatID || "", text: text }),
        })
          .then(async (r) => {
            let j = null;
            try { j = await r.json(); } catch (_) {}
            if (!r.ok || !j || j.ok !== true) markFailed((j && j.error) || ("HTTP " + r.status));
          })
          .catch((e) => markFailed(e && e.message));
      } else {
        fetch(REPLY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: ev.src,
            chatID: ev.chatID || "",
            recipient: ev.sender,
            body: text,
            ts: Date.now() / 1000
          })
        }).catch((e) => markFailed(e && e.message));
      }
    } catch (e) { markFailed(e && e.message); }
    setTimeout(() => {
      setEvents((prev) => prev.map((x) => x.id === reply.id ? { ...x, fresh: false } : x));
    }, 900);
  };

  const shown = useMemo(() => {
    let list = events;
    if (platform !== "all") list = list.filter((e) => e.src === platform);
    // 2026-08-13 03:35 — FAIL OPEN, and this is a measured bug, not a tidy-up.
    // The UNREAD chip was found active mid-session while a clean reload shows
    // ALL active, so something flips it (dictate-inject reaches this pane). And
    // NOTHING in the omni stream carries an `unread` flag — every row absorbs as
    // `unread: !!m.unread` === false. So this line filtered 115 rows down to 0 and
    // the pane rendered "awaiting signals…" underneath a "LIVE · 115" badge.
    // qi said it was empty every ten minutes for a day; the badge said otherwise
    // and I believed the badge. An inbox must NEVER show nothing while it holds
    // something: if this filter would empty a non-empty feed, it is wrong, not the
    // feed. Show everything instead. Fix the `unread` source and this stays inert.
    if (unread) {
      const onlyUnread = list.filter((e) => e.unread);
      list = onlyUnread.length ? onlyUnread : list;
    }
    if (q) {
      const n = q.toLowerCase();
      list = list.filter((e) =>
        (e.body || "").toLowerCase().includes(n) ||
        (e.sender || "").toLowerCase().includes(n) ||
        (e.recipient || "").toLowerCase().includes(n) ||
        (e.src || "").toLowerCase().includes(n)
      );
    }
    return list;
  }, [events, platform, unread, q]);

  const PLATFORMS = ["email", "beside", "slack", "instagram", "facebook", "telegram", "whatsapp", "discord", "linkedin", "signal", "x"];

  // NOTE: the OmniTap source-derivation + bee: fallback that lived here is
  // removed with the pill it fed. It was correct logic in the wrong pane — vei-*
  // traffic no longer reaches this feed at all (isOmniboxSource rejects it at
  // ingest), so there is nothing here for it to derive from. qi's standing rule
  // — fall back to bee:/bee-ios: when canonical vei-* injects are absent,
  // precedence not merge, never silent — belongs in VVSVEI, which owns the taps.

  // ── READER VOICES (qi decree 2026-08-09: "the new canon is 11-reader").
  // Roster mirrors /Volumes/M4/sync_/exedus/dev_/xen/data/elevenlabs-voices.md.
  // Everything is FREE except East, which is qi's cloned identity voice and is
  // reserved for outbound calls/voicemail — marked so it can never be picked
  // for narration by accident.
  const READER_VOICES = [
    { id: "1cxc5c3E9K6F1wlqOJGV", name: "Emily · Whisper" },
    { id: "V9fdGZs6AiHI4uyiAiza", name: "Sir Laurence Olivier" },
    { id: "aMSt68OGf4xUZAnLpTU8", name: "Juniper · Professional" },
    { id: "Aa6nEBJJMKJwJkCx8VU2", name: "Quentin · Narrator" },
    { id: "U9jmr7kY6mMqS39kfA01", name: "Alex · Deep" },
    { id: "WAhoMTNdLdMoq1j3wf3I", name: "Hope · Smooth" },
    { id: "vBKc2FfBKJfcZNyEt1n6", name: "Finn · Energetic" },
    { id: "aEO01A4wXwd1O8GPgGlF", name: "Arabella · Raspy" },
    { id: "FF7KdobWPaiR0vkcALHF", name: "David · Trailer" },
    { id: "4tRn1lSkEn13EVTuqb0g", name: "Serafina" },
    { id: "TDTTIZEngvvWARkECefs", name: "Villain · Abrasive" },
    { id: "37w0uEKh8IHt6c3S0pvB", name: "East · PAID, calls only", paid: true },
  ];

  const [voiceId, setVoiceId] = React.useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("xen.voice.id")) || READER_VOICES[0].id
  );
  // ⚠️ THIS LINE USED TO LIE. It was:
  //     (READER_VOICES.find(v => v.id === voiceId) || READER_VOICES[0]).name
  // so ANY voice not in the twelve above rendered as "Emily · Whisper" — silently.
  // MEASURED 2026-08-17 11:39: ~/.xen/runtime/voice.id held JBFqnCBsd6RMkjVDRZzb,
  // which is in NO entry of this list, so the pill claimed Emily while the speak path
  // used something else entirely. That is the whole "every voice is still Emily"
  // complaint — the DISPLAY was wrong, not the engine.
  // A fallback that substitutes a plausible value for an unknown one is worse than an
  // error: it is unfalsifiable from the operator's side. Show the truth instead.
  const knownVoice = READER_VOICES.find((v) => v.id === voiceId);
  const voiceName = knownVoice ? knownVoice.name : "Unlisted · " + String(voiceId).slice(0, 8);

  // Picking a voice must reach the SPEAK path, not just this tab — the hook
  // xen-speak-outputs.py reads ~/.xen/runtime/voice.id on every utterance, so
  // POST /voice-id is what actually swaps the voice. localStorage only keeps
  // the pill label correct across reloads. Failure is swallowed: a dead route
  // must never break the composer.
  //
  // The host is ABSOLUTE on purpose. This file is served from two places: :4441
  // (omnimind, which owns /voice-id) and hitthe.link/xos (GitHub Pages, static —
  // no such route, so a root-relative fetch 404s and the swallow hides it). Same
  // reason /api/tts is spelled out above.
  const pickVoice = (id) => {
    setVoiceId(id);
    try { localStorage.setItem("xen.voice.id", id); } catch (_) {}
    fetch("https://api.xlrd.org/voice-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: id }),
    }).catch(() => {});
  };

  // Pill actions operate on what is actually on screen (`shown`), not the full
  // event log — what you see is what you copy/export.
  const feedText = () =>
    shown.map((e) => `[${e.src}] ${e.sender || e.recipient || ""}: ${e.body || ""}`).join("\n");

  const pillCopy = () => { try { navigator.clipboard.writeText(feedText()); } catch (_) {} };
  const pillShare = () => {
    if (navigator.share) navigator.share({ title: "Xen · Omnibox", text: feedText() }).catch(() => {});
    else pillCopy();
  };
  const pillExport = () => {
    try {
      const blob = new Blob([JSON.stringify(shown, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "omnibox-feed.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (_) {}
  };

  return (
    <>
      <div className="kicker-bar">
        <div className="kicker">Omnibox · MIRROR</div>
        {/* Two pills, two truths. The left one is the xen firehose + card count,
            unchanged. The right one is the INBOX TRANSPORT, and it exists because
            a pane that says "live" while it is really polling every 10s is lying
            to qi about how fast his messages reach him. When the socket is down
            this reads "polling (fallback)" — the inbox still works, and he can
            see exactly why it feels slower. No refresh button: the fallback and
            the reconnect are both automatic. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mirror-livepill">
            <span className="led" />
            <span>{sseState} · {String(count).padStart(3, "0")}</span>
          </div>
          <div
            className="mirror-livepill"
            title={"inbox transport · " + OMNI_WS}
            style={omniLive.indexOf("live") === 0 ? undefined : { background: "rgba(255,180,106,0.12)", color: "var(--amber, #ffb46a)" }}
          >
            <span
              className="led"
              style={omniLive.indexOf("live") === 0 ? undefined : { background: "var(--amber, #ffb46a)", boxShadow: "0 0 6px var(--amber, #ffb46a)" }}
            />
            <span>{omniLive}</span>
          </div>
        </div>
      </div>

      <div className="mirror">
        <div className="mirror-filters">
          <button
            className={"mfilter" + (!unread && platform === "all" ? " active" : "")}
            onClick={() => { setUnread(false); setPlatform("all"); }}
          >
            all
          </button>
          <button
            className={"mfilter" + (unread ? " active" : "")}
            onClick={() => setUnread((u) => !u)}
          >
            unread
          </button>
          <div className="mfilter-select-wrap" data-src={platform !== "all" ? platform : undefined}>
            <span className="mfilter-select-label">
              {platform === "all" ? "platform" : platform}
            </span>
            <span className="mfilter-select-caret">▾</span>
            <select
              className="mfilter-select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mirror-feed">
          {/* ⛔ THE VOICEBAR PILLS ARE NOT THIS PANE'S (qi 2026-08-12 17:30:
               "the voicebar pills go where they normally would be placed. they
               dont go on the omniinbox ui").

               This row was built from his 08-09 "put the pills above the voice
               bar" line — but it got built HERE, in the omni-inbox, which is not
               where the voice bar is. VVSVEI already carries the identical set
               in its own row directly above .composer-bar: tb-newthread (＋New),
               #voice-pills (the reader-voice picker), then tb-threads, tb-copy,
               tb-export, tb-share. So this was a duplicate in the wrong pane,
               and with VVSVEI now mounted as the middle panel the real row is
               on screen where it belongs.

          {/* The voicebar pills are NOT this pane's (qi 2026-08-12 17:30:
               "the voicebar pills go where they normally would be placed. they
               dont go on the omniinbox ui"). DELETED, not hidden: VVSVEI already
               carries the identical row above .composer-bar — tb-newthread,
               #voice-pills, tb-threads/copy/export/share — and with VVSVEI mounted
               as the middle panel that row is on screen where it belongs. A hidden
               duplicate is how two copies start drifting, and the reader-voice
               picker must have exactly ONE writer (a second writer is what caused
               the voice-desync bug earlier today). */}

          <div className="mirror-prompt">
            <div className="mirror-prompt-row">
              <span className="sigil">›</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={voice ? "type, speak, or paste…" : "type or paste…"}
                autoComplete="off"
                spellCheck={false}
              />
              {!q && <span className="cursor-blink" />}
            </div>
            <div className="mirror-prompt-foot">
              <span>{q ? `filter · "${q}"` : "filter the feed, or run a verb"}</span>
              <span>⌘K · ↵</span>
            </div>
          </div>

          <div className="mirror-feedhead">
            <span className="h">
              {unread ? "Unread" : "All signals"}
              {platform !== "all" && ` · ${platform}`}
            </span>
            <span className="count">{shown.length}</span>
          </div>

          {shown.length === 0 ? (
            <div style={{
              fontFamily: "var(--f-serif)",
              fontStyle: "italic",
              fontSize: 16,
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "40px 20px"
            }}>
              {sseState === "live" ? "awaiting signals…" : sseState + "…"}
            </div>
          ) : (
            shown.map((e) => <MirrorCard key={e.id} ev={e} fresh={e.fresh} onReply={handleReply} onOpenLink={onOpenLink} />)
          )}
        </div>
      </div>
    </>
  );
}

/* ===========================================================
   PANE 2 — WEBVIEW (rendered web content from active thread)
   =========================================================== */
const TAB_CARDS = [
  { kind: "video",     id: "automate", title: "AUTOMATE OR DIE — Zero-Hum..." },
  { kind: "mirror",    id: "mirror",   title: "MIRROR · live omninbox" },
  { kind: "phone",     id: "gv",       title: "GV Phone" },
  { kind: "portfolio", id: "hitthe",   title: "hitthe.link — Portfolio Navigator" },
  { kind: "xen",       id: "xen",      title: "XEN — Tag It. It's There." }
];

function TabCard({ tab, onClose, onOpen }) {
  /* canon-iframes-banned: click opens via window.open(url, namedTarget) */
  const handleOpen = (e) => {
    if (!tab.url) return;
    e.preventDefault();
    window.open(tab.url, "xen-thread-" + tab.id, "noopener");
  };
  return (
    <div className={"tab-card " + tab.kind} onClick={tab.url ? handleOpen : undefined} style={tab.url ? { cursor: "pointer" } : null}>
      <div className="tab-card-head">
        <div className="close" onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}>✕</div>
        <div className="title">{tab.title}</div>
        <div />
      </div>
      <div className="tab-card-body">
        {tab.kind === "video" && (
          <>
            <span className="live-pill"><span className="led" /><span>live</span></span>
            <div className="vid-meta">
              <div className="vid-play">
                <svg width="14" height="14" viewBox="0 0 12 14"><path d="M0 0 L12 7 L0 14 Z" fill="currentColor"/></svg>
              </div>
              <div className="vid-stack">
                <div className="vid-title">Zero-Human Coffee · Pour-over by Robot Arm</div>
                <div className="vid-stat">
                  <span>● 1,284 watching</span>
                  <span>·</span>
                  <span>4K · 24fps</span>
                </div>
              </div>
            </div>
          </>
        )}

        {tab.kind === "mirror" && (
          <>
            <div className="mini-mirror-head">
              <div className="mini-mirror-h1">MIRROR <em>· live omninbox</em></div>
              <span className="live-green"><span className="led" /><span>live</span></span>
            </div>
            <div className="mini-chips">
              <button className="mini-chip active">all</button>
              <button className="mini-chip">unread</button>
              <button className="mini-chip">platform ▾</button>
            </div>
            <div className="mini-feed-item">
              <div className="mfi-meta">
                <span className="mfi-ts">11:24</span>
                <span className="mfi-src" style={{ background: "rgba(34,211,164,.18)", color: "#22d3a4" }}>BESIDE</span>
                <span className="mfi-dir">in</span>
              </div>
              <div className="mfi-who"><b>Pia</b> → East</div>
              <div className="mfi-body">took the long way home. milk?</div>
            </div>
          </>
        )}

        {tab.kind === "phone" && (
          <>
            <div className="mini-status-row">
              <span className="l"><span className="led" /><span>connected</span></span>
              <span>GV Phone</span>
            </div>
            <div className="mini-thread-row">
              <span>thread</span>
              <span className="mini-pill"><span className="led" /><span>beeper</span></span>
            </div>
            <div className="mini-recents">
              <div className="mr-row">
                <span className="mr-av" style={{ background: "#00dc82", color: "#03190d" }}>MC</span>
                <div className="mr-info">
                  <div className="mr-nm">Marlowe Chen</div>
                  <div className="mr-sub">↗ outgoing · 11:24</div>
                </div>
                <span className="mr-dur">4m</span>
              </div>
              <div className="mr-row">
                <span className="mr-av" style={{ background: "#ffb46a", color: "#1a0d04" }}>PL</span>
                <div className="mr-info">
                  <div className="mr-nm">Pia Lindqvist</div>
                  <div className="mr-sub">↙ FaceTime · 09:18</div>
                </div>
                <span className="mr-dur">12m</span>
              </div>
            </div>
          </>
        )}

        {tab.kind === "portfolio" && (
          <>
            <div className="portfolio-row">
              <span className="dot-amber" />
              <span className="url">hitthe.link</span>
              <span className="action">☾</span>
              <span className="action">⊞</span>
              <span className="browse">Browse</span>
            </div>
            <div className="portfolio-holdings">
              <div className="ph-row">
                <span className="ph-tick">NVDA</span>
                <div className="ph-bar"><i style={{ width: "82%", background: "var(--slack)" }} /></div>
                <span className="ph-val">+8.2%</span>
              </div>
              <div className="ph-row">
                <span className="ph-tick">TSLA</span>
                <div className="ph-bar"><i style={{ width: "54%", background: "var(--slack)" }} /></div>
                <span className="ph-val">+2.1%</span>
              </div>
              <div className="ph-row">
                <span className="ph-tick">APLD</span>
                <div className="ph-bar"><i style={{ width: "23%", background: "var(--red)" }} /></div>
                <span className="ph-val">−1.4%</span>
              </div>
            </div>
          </>
        )}

        {tab.kind === "xen" && (
          <>
            <div className="xen-id">
              <span className="x">XEN</span>
              <span className="tag">CROSS-PLATFORM AI<br/>AGENT</span>
            </div>
            <button className="request-access">REQUEST<br/>ACCESS</button>
          </>
        )}

        {!["video","mirror","phone","portfolio","xen"].includes(tab.kind) && (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-dim)", letterSpacing: ".08em", textTransform: "uppercase" }}>
              {tab.kind}
            </div>
            <div style={{ fontFamily: "var(--f-serif)", fontSize: 17, color: "var(--text)" }}>
              {tab.sender || tab.recipient || "thread"}
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {(tab.body || "").slice(0, 140)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function urlParts(url) {
  try {
    const u = new URL(url);
    return {
      scheme: u.protocol + "//",
      host: u.hostname.replace(/^www\./, ""),
      path: (u.pathname === "/" ? "" : u.pathname) + (u.search || "")
    };
  } catch (e) {
    return { scheme: "https://", host: String(url || ""), path: "" };
  }
}

function OpenedAppPage({ app }) {
  const p = urlParts(app.url);
  return (
    <div className="opened-app">
      <div className="oa-hero">
        <div className="oa-glyph">{app.glyph}</div>
        <div className="oa-name">{app.name}</div>
        <div className="oa-url">{p.scheme}{p.host}{p.path}</div>
      </div>

      <div className="oa-stage">
        <div className="oa-prompt">
          <span className="oa-sig">›</span>
          <input placeholder={`ask ${app.name.toLowerCase()} anything…`} />
        </div>
        <div className="oa-pills">
          <span className="oa-pill">summarize my day</span>
          <span className="oa-pill">draft a reply</span>
          <span className="oa-pill">play something</span>
          <span className="oa-pill">remind me at 18:00</span>
        </div>
        <div className="oa-foot">
          <span>webkit · jit on</span>
          <span>service worker · ready</span>
          <span>cache · 12 MB</span>
        </div>
      </div>
    </div>
  );
}

/* PUBLISH THE DOCK'S MEASURED HEIGHT. --xos-dock-real drives the .panes bottom inset
   (styles.css), replacing `calc(var(--dock-h) + env(safe-area-inset-bottom))`.

   WHY MEASURE INSTEAD OF SETTING A NUMBER: the swipe glass now holds vvsvei's real
   composer, so its height depends on the composer's height — which itself changes when
   the pill row wraps, when a paste grows the textarea, and when the device's safe-area
   inset applies. Any constant is wrong for some of those states, and when the constant
   is too small the panes end ABOVE the dock and qi sees a black band between them
   (2026-08-12 20:04: "black empty dead space is still present"). Measuring cannot drift.

   getBoundingClientRect().height already INCLUDES the safe-area padding-bottom, which is
   why the CSS consumes this raw with no `+ env(...)` — adding it would double-count.

   No feedback loop: --xos-dock-real changes .panes, and .panes does not affect the dock's
   height. The equality guard makes it a no-op once settled either way. */
let _xosDockRO = null;
function _xosDockHeight() {
  try {
    const dock = document.querySelector(".dock.dock-swipe");
    if (!dock) return;
    const publish = () => {
      const h = Math.round(dock.getBoundingClientRect().height);
      if (!h) return;
      const prev = document.documentElement.style.getPropertyValue("--xos-dock-real");
      const next = h + "px";
      if (prev === next) return;
      document.documentElement.style.setProperty("--xos-dock-real", next);
    };
    publish();
    // Keep following it: the composer grows on paste, the pill row wraps on rotation,
    // and the keyboard changes the viewport. A one-shot measurement would go stale the
    // first time any of those happened — the same trap as a hardcoded constant, just
    // with an extra step.
    if (!_xosDockRO && typeof ResizeObserver !== "undefined") {
      _xosDockRO = new ResizeObserver(publish);
      _xosDockRO.observe(dock);
    }
  } catch (_) { /* layout polish must never take the OS down */ }
}

/* ══ A SHIP OPENS INSIDE THE CHAT — SHADOW DOM, NEVER AN IFRAME ═════════════
   qi 2026-08-18 23:30: "the next upgrade for the XOS voice chat, the center
   panel — for you to be able to open up, like when you auto ship or auto open,
   you should be able to auto-open it right in the chat. Open the page up right
   in the chat."

   BEFORE: autoship leg 3 (`xen-ship-open`) called macOS `open`, which throws a
   NEW BROWSER WINDOW at him. Leaving the chat to look at a ship is the thing he
   asked to stop doing.

   ⛔ NO IFRAME. NOT AS A FALLBACK. (canon-iframes-banned — qi 2026-08-12 17:01,
   "we cant use iframes"; an iframe cost the flagship _SelfOwn ~1.5 years.) The
   isolation an iframe would have given is bought here with a SHADOW ROOT, which
   is strictly better for this job: the shipped page's CSS cannot escape into
   XOS and XOS's CSS cannot bleed into it, while staying ONE document — so the
   voice chat keeps its scroll position, its focus, and its live state around
   the card. If a page genuinely cannot render this way the card degrades to a
   titled link and SAYS the reason on its face. It never reaches for a frame.

   THREE HAZARDS, each measured against this repo rather than assumed:

   1. THE TRANSCRIPT WIPES ITSELF. vvsvei/index.html does `transcript.innerHTML
      = ''` at TWO places (:3581 and :3685). A card appended once is therefore
      NOT safely appended — a history reload silently eats it, which from qi's
      side is indistinguishable from a ship that never landed. A MutationObserver
      re-attaches every live card whenever the stream is rebuilt.

   2. VIEWPORT UNITS AND `position:fixed` ESCAPE A SHADOW ROOT. Shadow DOM scopes
      SELECTORS, not the viewport — `100vh` still means the whole screen and a
      fixed banner still pins to the window, straight over the chat. This is the
      same lesson VvsveiPane paid for above at :1740. Inline <style> text gets
      the units rewritten; for stylesheets arriving by <link> (which cannot be
      rewritten) the card body carries `contain:layout paint style`, which makes
      the host itself the containing block for fixed descendants. Belt and braces,
      because a page whose banner covers his chat is worse than no preview.

   3. SCRIPTS DO NOT RUN, ON PURPOSE. Unlike VvsveiPane — which deliberately
      re-executes vvsvei's scripts because vvsvei IS the panel — an arbitrary
      shipped page is a DOCUMENT here, not an app. Its scripts would share
      globals with the OS shell (that is exactly the `REPLY_URL` redeclaration
      that once killed the whole panel). They are stripped. A page that needs to
      be INTERACTED with is opened full via the existing named-window path.

   WHY THE FEED IS A STATIC FILE AND NOT A SOCKET: the card must never appear
   before the page it shows is actually live. `_shared/ships.json` is written by
   the `xen-ship-inchat` leg only AFTER `xen-ship-open`'s poll-live gate passes,
   and it rides the same GitHub Pages deploy as the page itself — so "the card
   exists" and "the page serves" become the same event. A socket would have
   raced its own payload and shown him a card for a 404 (measured 2026-07-25,
   dcz-call: he opened a Pages 404 on his phone during a live client call).
   Same origin, so no tunnel to flap and no CORS to negotiate.  */
const SHIPS_FEED      = "/_shared/ships.json";
const SHIPS_FALLBACK  = "/sites.json";
const SHIPS_POLL_MS   = 15000;
const SHIPS_SEED_MAX  = 3;    // how many prior ships to show on a cold load
const SHIPS_CARD_H    = 300;  // px of page visible before "taller"

/* Card chrome lives here, not in styles.css, DELIBERATELY: a feature split
   across two files can half-land, and styles.css is 141KB of surface qi has
   already tuned. One block, one file, atomically present or absent. */
function _xosShipStyles() {
  if (document.getElementById("xos-ship-styles")) return;
  const s = document.createElement("style");
  s.id = "xos-ship-styles";
  s.textContent = [
        // flex:0 0 auto IS LOAD-BEARING, NOT TIDINESS. MEASURED on live /xos/
    // 2026-08-18 23:52 at 390x844: #transcript is display:flex/column, so a card
    // appended into it is a FLEX ITEM and inherits flex:0 1 auto -- it SHRANK to
    // h=2px (its own border) while its children still measured 17+14+300+33.
    // overflow:hidden then clipped all of them, so the card was present, correct,
    // and INVISIBLE. Same failure VvsveiPane paid for at :1740: in a flex chain
    // every link needs its sizing stated, and "it has content" is not a height.
    ".xos-ship{margin:10px 0;border-radius:14px;overflow:hidden;flex:0 0 auto;",
    "background:rgba(12,16,20,.86);border:1px solid rgba(255,255,255,.10);",
    "box-shadow:0 6px 22px rgba(0,0,0,.42);max-width:100%;}",
    ".xos-ship-head{display:flex;align-items:center;gap:8px;padding:9px 11px;",
    "background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.07);}",
    ".xos-ship-dot{width:7px;height:7px;border-radius:50%;background:#38e08b;",
    "box-shadow:0 0 8px #38e08b;flex:0 0 auto;}",
    ".xos-ship-title{font:600 12.5px/1.3 Inter,system-ui,sans-serif;color:#eef4f2;",
    "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".xos-ship-time{font:500 10px/1 ui-monospace,Menlo,monospace;color:#8fa39b;flex:0 0 auto;}",
    ".xos-ship-url{padding:5px 11px 0;font:500 10.5px/1.3 ui-monospace,Menlo,monospace;",
    "color:#6fd3a4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    /* THE PREVIEW WINDOW. overflow:auto so a long page is readable in place;
       overscroll-behavior:contain so reaching its end does NOT hand the scroll
       up to the transcript and yank him out of the card mid-read.
       contain: see hazard 2 — this is what stops a fixed banner escaping. */
    ".xos-ship-body{position:relative;margin:8px 11px 0;border-radius:9px;",
    "background:#0b0f12;height:" + SHIPS_CARD_H + "px;overflow:auto;",
    "overscroll-behavior:contain;-webkit-overflow-scrolling:touch;",
    "contain:layout paint style;border:1px solid rgba(255,255,255,.06);}",
    ".xos-ship.tall .xos-ship-body{height:" + (SHIPS_CARD_H * 2) + "px;}",
    ".xos-ship-note{padding:14px;font:500 11.5px/1.5 Inter,system-ui,sans-serif;color:#c2cdc8;}",
    ".xos-ship-actions{display:flex;gap:7px;padding:9px 11px;}",
    ".xos-ship-actions button{flex:1 1 auto;padding:7px 9px;border-radius:8px;cursor:pointer;",
    "font:600 11px/1 Inter,system-ui,sans-serif;color:#dbe7e2;",
    "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);}",
    ".xos-ship-actions button:active{background:rgba(255,255,255,.13);}"
  ].join("");
  document.head.appendChild(s);
}

/* Render a live page into a shadow root. Same-origin only in practice (every
   ship is a hitthe.link subpage), and a cross-origin fetch simply lands in the
   catch and degrades to a link — it must never be papered over with a frame. */
async function _xosShipRender(bodyEl, url) {
  /* THE NOTE MUST GO INSIDE THE SHADOW ROOT ONCE ONE EXISTS.
     MEASURED 2026-08-19 00:03 on live /xos/: the empty-render note was created,
     appended, and NEVER APPEARED -- the card showed a blank frame anyway.
     CAUSE: attachShadow REPLACES the host's rendered children. Light-DOM
     children of a shadow host are not displayed at all unless a <slot> asks for
     them, so appending to bodyEl after the root exists renders nothing.
     The element was real, in the DOM, and invisible -- which is precisely the
     class of failure this note was added to prevent, reproduced by the fix for
     it. Route to the shadow root when there is one, host when there is not
     (the early error paths run before attachShadow). */
  const note = (msg) => {
    const d = document.createElement("div");
    d.className = "xos-ship-note";
    d.textContent = msg;
    const sr = bodyEl.shadowRoot;
    if (sr) {
      // The host's own stylesheet does not cross the boundary; style inline.
      d.style.cssText = "padding:14px;font:500 11.5px/1.5 Inter,system-ui,sans-serif;color:#c2cdc8;";
      sr.appendChild(d);
    } else {
      bodyEl.appendChild(d);
    }
  };
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) { note("Could not render inline — HTTP " + res.status + ". Open full below."); return; }
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, "text/html");

    /* canon-iframes-banned: a shipped page may itself contain frames. Rendering
       them here would smuggle an iframe into XOS through the back door of a
       feature that exists BECAUSE iframes are banned. Removed, and COUNTED, so
       their absence is visible in the console rather than silent. */
    const framed = doc.querySelectorAll("iframe, frame, object, embed");
    if (framed.length) {
      console.warn("[xos-ship] stripped " + framed.length + " nested browsing context(s) from " + url + " — canon-iframes-banned");
      framed.forEach((n) => n.remove());
    }
    doc.querySelectorAll("script, noscript").forEach((n) => n.remove());

    /* Relative URLs resolve against the HOST document (/xos/), not the page we
       fetched, so every un-rewritten src/href would 404 or point at the wrong
       asset. Absolutise against the ship's own origin. */
    const base = new URL(url, location.href);
    doc.querySelectorAll("[src]").forEach((n) => {
      const v = n.getAttribute("src");
      if (v && !/^(https?:|data:|blob:|#)/i.test(v)) { try { n.setAttribute("src", new URL(v, base).href); } catch (_) {} }
    });
    doc.querySelectorAll("[href]").forEach((n) => {
      const v = n.getAttribute("href");
      if (v && !/^(https?:|data:|blob:|mailto:|tel:|#)/i.test(v)) { try { n.setAttribute("href", new URL(v, base).href); } catch (_) {} }
    });
    /* Links inside a preview must never navigate the OS away from the chat. */
    doc.querySelectorAll("a[href]").forEach((a) => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); });

    const root = bodyEl.shadowRoot || bodyEl.attachShadow({ mode: "open" });
    root.innerHTML = "";

    /* Hazard 2: rewrite the units that ignore a shadow boundary. Identical in
       spirit to VvsveiPane's deViewport at :1740 — inside a card, 100% of the
       card IS full height. */
    const deViewport = (css) => css
      .replace(/\b100(?:d|s|l)?vh\b/gi, "100%")
      .replace(/position\s*:\s*fixed/gi, "position:absolute");

    const reset = document.createElement("style");
    reset.textContent =
      ":host{display:block;}" +
      ":host,*{box-sizing:border-box;}" +
      "html,body{margin:0!important;padding:0!important;height:auto!important;" +
      "min-height:0!important;max-height:none!important;overflow:visible!important;" +
      "width:100%!important;background:transparent!important;}" +
      "img,video,svg,canvas,table{max-width:100%!important;height:auto;}";
    root.appendChild(reset);

    /* A <link rel=stylesheet> inside a shadow root applies ONLY inside it, so
       external sheets can be carried across as-is — which is what keeps a page
       looking like itself rather than like unstyled markup. (VvsveiPane learned
       the same thing the hard way at :1848: hoisting <style> without <link>
       gives you every rule and none of the fonts — qi called that result "a
       cheap imitation".) */
    doc.querySelectorAll('link[rel="stylesheet"], link[rel=stylesheet]').forEach((l) => {
      const n = document.createElement("link");
      n.rel = "stylesheet"; n.href = l.href;
      root.appendChild(n);
    });
    doc.querySelectorAll("style").forEach((st) => {
      const n = document.createElement("style");
      n.textContent = deViewport(st.textContent || "");
      root.appendChild(n);
    });

    const holder = document.createElement("div");
    holder.innerHTML = doc.body ? doc.body.innerHTML : "";
    root.appendChild(holder);

    /* AN EMPTY BOX IS A LIE. MEASURED 2026-08-18 23:56 on live /xos/: the card
       rendered perfectly -- dot, title, timestamp, url, buttons -- around a
       preview that was COMPLETELY BLANK, and nothing on it said why.
       CAUSE, and it is by design: scripts are stripped (hazard 3 above), so a
       page whose <body> is just an empty mount point (`<div id="root">` filled
       by React at runtime) has literally no markup to show. That is most of the
       app-shell pages on this domain.
       A blank frame is indistinguishable from a broken renderer, which is the
       exact failure class cmd 45 exists to kill: unseen presented as fine. So
       measure what actually landed and SAY the reason on the card's face. */
    const txt = (holder.textContent || "").trim();
    const media = holder.querySelectorAll("img,svg,canvas,video,picture").length;
    if (txt.length < 40 && media === 0) {
      root.removeChild(holder);
      note("This page builds itself with JavaScript, which does not run inside a chat card. Open full to view it.");
    }
  } catch (e) {
    /* cmd 45: say what actually happened. Never silently show an empty box. */
    note("Could not render inline (" + (e && e.message ? e.message : "fetch failed") + "). Open full below.");
  }
}

function _xosShipCard(ship) {
  _xosShipStyles();
  const card = document.createElement("div");
  card.className = "xos-ship";
  card.dataset.shipUrl = ship.url;

  const head = document.createElement("div");
  head.className = "xos-ship-head";
  const dot = document.createElement("span"); dot.className = "xos-ship-dot";
  const ttl = document.createElement("span"); ttl.className = "xos-ship-title";
  ttl.textContent = ship.title || ship.slug || ship.url;
  const tm  = document.createElement("span"); tm.className = "xos-ship-time";
  tm.textContent = (() => { try { return new Date(ship.ts).toTimeString().slice(0, 5); } catch (_) { return ""; } })();
  head.appendChild(dot); head.appendChild(ttl); head.appendChild(tm);

  const urlEl = document.createElement("div");
  urlEl.className = "xos-ship-url";
  urlEl.textContent = ship.url.replace(/^https?:\/\//, "");

  const body = document.createElement("div");
  body.className = "xos-ship-body";

  const acts = document.createElement("div");
  acts.className = "xos-ship-actions";
  const taller = document.createElement("button");
  taller.type = "button"; taller.textContent = "Taller";
  taller.addEventListener("click", () => card.classList.toggle("tall"));
  const full = document.createElement("button");
  full.type = "button"; full.textContent = "Open full";
  /* canon-iframes-banned: external pages open in a NAMED window so repeat taps
     reuse one tab — the same pattern already used at :1418 and :3112. */
  full.addEventListener("click", () => { try { window.open(ship.url, "xos-ship-full"); } catch (_) {} });
  acts.appendChild(taller); acts.appendChild(full);

  card.appendChild(head); card.appendChild(urlEl); card.appendChild(body); card.appendChild(acts);
  _xosShipRender(body, ship.url);
  return card;
}

function ShipInChat() {
  useEffect(() => {
    let stopped = false;
    const seen  = new Set();
    const cards = [];          // live nodes, for the re-attach guard (hazard 1)

    const stream = () =>
      document.querySelector("#xos-vei #transcript") ||
      document.querySelector("#xos-vei .wrap") ||
      document.querySelector("#xos-vei");

    const place = (card) => {
      const s = stream();
      if (!s) return false;
      s.appendChild(card);
      /* Land it in view the way a new message would, without stealing focus. */
      try { s.scrollTop = s.scrollHeight; } catch (_) {}
      return true;
    };

    const add = (ship) => {
      if (!ship || !ship.url || seen.has(ship.url)) return;
      seen.add(ship.url);
      const card = _xosShipCard(ship);
      cards.push(card);
      if (!place(card)) {
        /* The panel mounts asynchronously (VvsveiPane fetches /vvsvei/ first).
           Retry on frames rather than dropping the ship — cmd 27b, nothing drops. */
        let n = 0;
        const t = setInterval(() => { if (stopped || place(card) || ++n > 60) clearInterval(t); }, 500);
      }
    };

    const norm = (r) => ({
      url:   /^https?:/i.test(r.url || "") ? r.url : ("https://hitthe.link" + (r.url || "")),
      title: r.title || r.slug || "",
      slug:  r.slug || "",
      ts:    r.ts || r.updated || r.generated || new Date().toISOString()
    });

    let first = true;
    const poll = async () => {
      if (stopped) return;
      let list = null;
      try {
        const r = await fetch(SHIPS_FEED + "?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.ships)) list = j.ships;
        }
      } catch (_) { /* fall through to the fallback */ }

      /* FALLBACK IS NOT DECORATION. `_shared/ships.json` is written by a leg that
         can fail; `sites.json` is regenerated by CI on EVERY push and can't. If
         the new leg ever goes dark, the chat still shows what actually shipped,
         so a broken leg degrades to "slightly less precise" instead of to
         silence — which is the failure shape that hid 22 blind pushes. */
      if (!list && first) {
        try {
          const r2 = await fetch(SHIPS_FALLBACK + "?t=" + Date.now(), { cache: "no-store" });
          if (r2.ok) {
            const j2 = await r2.json();
            if (j2 && Array.isArray(j2.sites)) list = j2.sites.slice(0, SHIPS_SEED_MAX);
          }
        } catch (_) {}
      }
      if (list) {
        const take = first ? list.slice(0, SHIPS_SEED_MAX) : list;
        /* Oldest first so the newest ship ends up nearest the composer, which is
           where a chat puts the newest message. */
        take.map(norm).reverse().forEach(add);
        first = false;
      }
      if (!stopped) setTimeout(poll, SHIPS_POLL_MS);
    };
    poll();

    /* HAZARD 1, THE RE-ATTACH GUARD. vvsvei clears #transcript at :3581 and
       :3685; without this a history reload deletes his ship cards and nothing
       reports it. Re-append anything detached, on the next frame after the wipe. */
    let mo = null;
    const watch = setInterval(() => {
      const s = stream();
      if (!s || mo) return;
      mo = new MutationObserver(() => {
        cards.forEach((c) => { if (!c.isConnected) { try { s.appendChild(c); } catch (_) {} } });
      });
      mo.observe(s, { childList: true });
      clearInterval(watch);
    }, 500);

    return () => {
      stopped = true;
      clearInterval(watch);
      if (mo) mo.disconnect();
      cards.forEach((c) => { try { c.remove(); } catch (_) {} });
    };
  }, []);

  /* Renders nothing of its own: the cards live in vvsvei's real message stream,
     which is what "right in the chat" means. */
  return null;
}

/* ══ VVSVEI AS THE CENTER PANEL — RUNTIME INCLUDE, IN-DOCUMENT ══════════════
   qi 2026-08-12 16:55 "place vvsvei as the center panel of XOS" + 17:01 NO
   IFRAMES (canon-iframes-banned; iframes cost _SelfOwn 1.5 years) + 17:2x he
   picked the runtime-include shape and "VVSVEI always" as the default view.

   WHY THIS SHAPE: vvsvei/index.html stays the ONE source of truth. XOS fetches
   it and mounts its markup + styles + scripts into THIS document — same DOM,
   same stylesheet, one page, no nested browsing context. Editing
   vvsvei/index.html updates the phone surface and this panel together, so the
   two can never drift (this repo already carries a stale .deploy copy and three
   divergent tui-inject.js copies — that failure mode is not hypothetical).

   THREE THINGS THIS HAS TO HANDLE, and each is a real hazard, not boilerplate:

   1. STYLE SCOPING. vvsvei's CSS is global — it styles `body`, `#transcript`,
      `.composer`. Injected raw it would restyle the whole OS shell. Every
      selector is rewritten to sit under #xos-vei, and body/html selectors
      become #xos-vei itself (the panel IS vvsvei's viewport here).

   2. IFRAMES ARE STRIPPED. vvsvei itself contains two (`bg-iframe` at :580 and
      `vdo-rtc` at :735). Including them would smuggle iframes into XOS through
      the back door of a fix that exists BECAUSE iframes are banned. They are
      removed on inject and reported to the console, so their absence is visible
      rather than silent. vdo-rtc is a live WebRTC surface, so if calling has to
      work in this panel that is a real follow-up, not something to paper over.

   3. SCRIPTS MUST RE-EXECUTE. innerHTML never runs <script>. Each one is
      recreated as a fresh element so it executes in page scope — which is
      exactly what makes vvsvei's own getElementById('transcript') resolve
      against the markup we just mounted. */
function VvsveiPane() {
  const hostRef = useRef(null);
  const [state, setState] = useState("loading");   // loading | ready | failed
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        const res = await fetch("/vvsvei/", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const html = await res.text();
        if (cancelled) return;

        const doc = new DOMParser().parseFromString(html, "text/html");

        // ── 2. strip nested browsing contexts before anything else touches them
        const framed = doc.querySelectorAll("iframe, frame, object, embed");
        if (framed.length) {
          console.warn("[xos-vei] stripped " + framed.length +
            " nested browsing context(s) — canon-iframes-banned. If one was vdo-rtc, calling needs a non-iframe path in this panel.");
          framed.forEach((n) => n.remove());
        }

        // ── 1. scope + hoist styles
        const scope = "#xos-vei";
        // VIEWPORT HEIGHT UNITS MUST DIE FIRST — the panel is the viewport here.
        //
        // MEASURED on live /xos/ 2026-08-12 19:29 at 390x844: #xos-vei was
        // 26 -> 701 with overflow:hidden, but `#xos-vei .wrap` was 844px tall and
        // .composer — anchored to THAT box's bottom — rendered at 786 -> 870, i.e.
        // 85px BELOW the host's visible bottom, clipped out of existence. That is
        // the empty voice dock: the bar was not hidden, it was off-panel.
        //
        // Rewriting html/body/:root to the scope (below) does NOT fix it, because
        // vvsvei/index.html:88-90 puts `height:100dvh` on `.wrap` — a plain class,
        // neither html nor body, so the selector rewrite never touches it. The
        // previous pass diagnosed "vvsvei sizes itself off the VIEWPORT" correctly
        // and then only pinned #xos-vei itself, leaving the inner box viewport-sized.
        // Chasing it selector-by-selector is how it came back; any 100dvh anywhere
        // in vvsvei's CSS reintroduces it. So the UNIT is converted, not the rule:
        // inside this panel, 100% of the panel IS full height.
        // THE PATTERN, not two bugs: a runtime-included document assumes IT OWNS THE
        // VIEWPORT. Viewport units and fixed positioning are the two ways it says so, and
        // both have to be translated on the way in. Scoping SELECTORS is not enough --
        // neither of these is expressed in a selector.
        //
        // 100dvh -> 100%   : qi's empty voice dock (measured above).
        // fixed -> absolute: qi 2026-08-12 19:38 "on xos omniinbox its still black but i
        //   noticed there may be ui hidden behind the black because i could see it
        //   scrolling behind the shadows". CAUSE: vvsvei/index.html:69 gives .bg-overlay
        //   position:fixed inset:0 with a rgba(2,6,10,.72) radial + blur(22px). Fixed
        //   escapes this panel and lays that glass over the ENTIRE app, so the omni-inbox
        //   renders underneath it -- alive, scrolling, and invisible. His screenshot shows
        //   the giveaway: a faint green core, which is that gradient's own rgba(10,31,18,.30).
        //   As `absolute` it is confined to #xos-vei (position:relative), which is where a
        //   panel background belongs.
        const deViewport = (css) => css
          .replace(/\b100(?:d|s|l)?vh\b/gi, "100%")
          .replace(/position\s*:\s*fixed/gi, "position:absolute");
        // DUAL SCOPE — the composer physically LEAVES #xos-vei to live in the swipe
        // glass (qi 2026-08-12 19:49: "get my soundwave in the attachment and send
        // buttons and place it directly into the swipe bar"), and a stylesheet scoped
        // only to `#xos-vei …` stops applying the instant a node leaves that subtree.
        // Moving it under one scope would land it in the glass UNSTYLED — which is the
        // opposite of his bar: "This would be 0% difference."
        //
        // So every rule is emitted TWICE, once under each host. `.dock-vei-host` is the
        // empty ref'd div inside .dock-swipe that receives the moved node. Same rules,
        // same specificity, two places it can live — so the composer looks identical
        // whether it sits in the panel or in the glass.
        const HOSTS = [scope, ".dock-vei-host"];
        // STRIP COMMENTS BEFORE SCOPING — non-negotiable, and it fixes a latent bug.
        //
        // The rewriter treats everything between `}` and `{` as a selector list and
        // splits it on ",". A CSS comment sitting above a rule is INSIDE that span, so
        // any comma inside the comment gets treated as a selector separator and the
        // comment is torn in half — leaving an unterminated `/*` that swallows the real
        // declarations. MEASURED 2026-08-12 from the generated sheet:
        //
        //   #xos-vei /* Transcript = top-anchored chat bubbles, .dock-vei-host
        //   /* Transcript = top-anchored chat bubbles, #xos-vei cream-on-green */
        //   #transcript, .dock-vei-host cream-on-green */ #transcript {
        //
        // — from the innocent comment "/* Transcript = top-anchored chat bubbles,
        // cream-on-green */". The #transcript and .wrap rules were destroyed, so both
        // sized to content: #transcript measured 3040px inside a 642px host and the
        // render gate correctly reported the feed INVISIBLE.
        //
        // This was LATENT with a single scope — the torn tail still happened to end in
        // "*/ #transcript", so one usable selector survived. Emitting two hosts prefixes
        // each fragment separately and both halves become garbage. My change did not
        // create the bug, it removed the luck that was hiding it.
        //
        // Comments carry no behaviour in the mounted copy (the source file keeps them),
        // so removing them is free and makes the whole class impossible.
        const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
        const scopeCss = (css) => stripComments(deViewport(css)).replace(
          /(^|\})\s*([^@{}][^{}]*)\{/g,
          (m, brace, sel) => brace + " " + sel.split(",").flatMap((s) => {
            s = s.trim();
            if (!s) return [];
            // html/body/:root ARE the host (the panel is the viewport here), so they
            // fold onto each host itself rather than becoming a descendant selector.
            if (/^(html|body|:root)\b/i.test(s)) {
              const tail = s.replace(/^(html|body|:root)/i, "");
              return HOSTS.map((h) => h + tail);
            }
            return HOSTS.map((h) => h + " " + s);
          }).join(", ") + " {"
        );
        const styleEl = document.getElementById("xos-vei-styles") || (() => {
          const s = document.createElement("style");
          s.id = "xos-vei-styles";
          document.head.appendChild(s);
          return s;
        })();
        // The override MUST come last so it wins on equal specificity.
        //
        // MEASURED: #xos-vei rendered y=27 → bottom=901 inside an 874px
        // viewport — 27px below the fold, with .composer at 817→901, i.e. off
        // screen behind the dock. That is the "header and then nothing" panel.
        //
        // Cause is this very scoping step: vvsvei sizes itself off the VIEWPORT
        // (html/body height:100vh), and rewriting those selectors to #xos-vei
        // turned "fill the viewport" into "be 874px tall" — which ignores the
        // panel it now lives in. Here the panel, not the viewport, is the
        // viewport. So height/max-height are pinned to the container and the
        // 100vh inheritance is severed.
        const SCOPE_FIX =
          "\n/* xos mount override — panel is the viewport here */\n" +
          scope + "{height:100%!important;max-height:100%!important;" +
          "min-height:0!important;width:100%!important;max-width:100%!important;" +
          "position:relative!important;overflow:hidden!important;}\n" +
          // THE INNER WRAP MUST FILL THE HOST, NOT ITS OWN CONTENT.
          //
          // MEASURED 2026-08-12 22:2x, 390x844: #xos-vei was 642px with overflow:hidden
          // while `#xos-vei .wrap` inside it measured 3103px, so #transcript was 3040px
          // and the render gate correctly called it INVISIBLE (2461px cut off).
          //
          // CAUSE: #xos-vei is display:flex, so .wrap is a FLEX ITEM — and it computed
          // `flex: 0 1 auto` with `min-height: auto`, which means "size to content and
          // refuse to shrink". Content is a whole day of transcript. Pinning the HOST is
          // not enough; the first child inside it has to be pinned too, or the host just
          // clips an enormous child. That is the same lesson as the 100dvh fix one level
          // deeper: every link in the chain needs a definite height, not just the top one.
          //
          // min-height:0 is the load-bearing half — without it a flex item will not
          // shrink below its content no matter what height you give it, and #transcript's
          // overflow:auto never engages.
          scope + " .wrap{position:relative!important;height:100%!important;" +
          "max-height:100%!important;min-height:0!important;flex:1 1 auto!important;}\n" +
          // Same for the two links between .wrap and the scroller, for the same reason.
          scope + " #tlwrap{min-height:0!important;flex:1 1 auto!important;}\n" +
          scope + " #transcript{min-height:0!important;}\n";
        styleEl.textContent = [...doc.querySelectorAll("style")]
          .map((s) => scopeCss(s.textContent || "")).join("\n") + SCOPE_FIX;

        // ── 1b. FONTS ARRIVE VIA <link>, NOT <style> ─────────────────────────
        // qi 2026-08-12 18:25: "the bubbles aren't the same, this looks like a
        // knock off, like a cheap imitation of it".
        // MEASURED: hoisting <style> above was not enough. Standalone vvsvei
        // pulls Inter + JetBrains Mono from Google, and .bubble-txt computes to
        // Inter 15px/500. Copying only <style> gave the panel every RULE but not
        // the FACE, so the bubbles kept their exact layout and lost their
        // typeface — the precise signature of "cheap imitation".
        // Font links are @font-face only: they cannot leak layout into XOS, so
        // they are safe to hoist unscoped. Deduped by href, and restricted to
        // font hosts so this never accidentally re-loads a page stylesheet
        // (which WOULD leak global layout).
        [...doc.querySelectorAll('link[rel="stylesheet"], link[rel=stylesheet]')]
          .filter((l) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(l.href))
          .forEach((l) => {
            if (document.querySelector('link[href="' + l.href + '"]')) return;
            const n = document.createElement("link");
            n.rel = "stylesheet";
            n.href = l.href;
            n.dataset.xosVeiFont = "1";
            document.head.appendChild(n);
          });

        // markup (scripts removed here; re-added executable below)
        const scripts = [...doc.querySelectorAll("script")];
        scripts.forEach((s) => s.remove());
        host.innerHTML = doc.body ? doc.body.innerHTML : "";
        setState("ready");

        // ── 3. re-execute scripts — ALL OF THEM INSIDE ONE SHARED IIFE.
        //
        // MEASURED FAILURE that forced this: injecting them as-is threw
        //   SyntaxError: Identifier 'REPLY_URL' has already been declared
        // because vvsvei declares top-level `const REPLY_URL` and so does this
        // file. Two top-level consts of the same name in ONE document is a
        // redeclaration, and it killed vvsvei's ENTIRE script block — the panel
        // mounted as markup with zero behaviour. That is the whole hazard of an
        // in-document mount: shared DOM means shared global scope.
        //
        // ONE IIFE, not one per block: vvsvei's blocks reference each other's
        // top-level names, so isolating them individually would break those
        // references. Concatenated, they still share scope with EACH OTHER while
        // being invisible to XOS's globals.
        //
        // Anything vvsvei genuinely needs global (inline on* handlers in its
        // markup) must be hung on window explicitly — it uses addEventListener
        // throughout, so nothing needs that today, but a future inline handler
        // would fail loudly here rather than silently.
        const code = scripts
          .filter((s) => !s.src)               // self-contained; externals are not ours to pull
          .map((s) => s.textContent || "")
          .join("\n;\n");
        if (code.trim()) {
          const s = document.createElement("script");
          s.textContent = "(function(){\n" + code + "\n})();";
          host.appendChild(s);
        }

        // ── 4. MOVE THE COMPOSER INTO THE SWIPE GLASS ────────────────────────
        // qi 2026-08-12 19:49: "if you could just get my soundwave in the attachment and
        // send buttons and place it directly into the swipe bar and make sure my
        // notifications still right at the bottom of the swipe bar like before then its
        // decent but I need the same chat bubbles that I have from VVSVEI" — and
        // 19:49:32: "This would be 0% difference."
        //
        // It is a MOVE, not a rebuild. That is only possible because this is ONE document
        // (iframes are banned), and it is the whole reason 0% difference is achievable:
        // .composer keeps its identity — same node, same ids, same canvas, same textarea.
        // He asked the fair question, "why couldnt you just move it over its already
        // built": nothing stopped it. Nobody had done it.
        //
        // WHY IT RUNS AFTER THE SCRIPTS: appendChild MOVES a node and event listeners
        // travel WITH it (they are bound to the node, not to its position), so vvsvei's
        // own wiring — send, paperclip, mic, the waveform canvas draw loop — stays live
        // across the move. Running before would leave nothing to move.
        //
        // WHY THE CLEARANCE MATH STILL HOLDS: _veiComposerClearance publishes the MEASURED
        // OVERLAP of .composer over #transcript. Once the composer lives in the glass it
        // no longer overlaps the scroller at all, so the overlap measures ~0 and the
        // padding collapses to the bare 16px gap — correct, automatically. A hardcoded
        // 100px would have left a permanent 116px hole at the bottom of the feed. This is
        // the payoff for measuring instead of guessing.
        //
        // ORDER INSIDE THE GLASS: the host div sits ABOVE DockNotifTicker in the JSX, so
        // notifications remain at the BOTTOM of the bar — "like before".
        //
        // The dock is conditional (t.showDock), and this effect can win the race against
        // its render, so retry a bounded number of frames and then give up QUIETLY —
        // leaving the composer in the panel, which is exactly the previous behaviour.
        // Never throw here: a failed relocation must not cost him the whole panel.
        (function relocateComposer(attempt) {
          try {
            const composer = host.querySelector(".composer");
            const dockHost = document.querySelector(".dock-vei-host");
            if (!composer) return;                       // nothing to move
            if (!dockHost) {
              if (attempt < 30) requestAnimationFrame(() => relocateComposer(attempt + 1));
              else console.warn("[xos-vei] no .dock-vei-host after 30 frames — composer stays in the panel");
              return;
            }
            if (composer.parentElement === dockHost) return;   // idempotent

            // 2026-08-13 04:04 — DO NOT HOIST. MEASURED, in a real browser, at phone width.
            // Moving the composer in here filled the swipe glass and swallowed every
            // gesture on it: document.elementFromPoint() over the whole 500x92 dock
            // returned composer-bar at 125 of 125 sampled points and .dock-hit at ZERO.
            // .dock-hit is the target that OPENS the app drawer. So the drawer — 32 tiles,
            // all present the entire time — had no reachable door.
            //
            // qi, verbatim: "without my canonical swipe glass and the web apps that pop
            // the web app space that turns any URL into a web app, or automatically
            // populates the hidden app drawer that comes from tapping the swipe glass...
            // the whole entire business operation plan doesn't exist."
            // The glass is not decoration. Tapping it IS the product.
            //
            // Leaving the composer in the panel is this function's OWN documented
            // fallback ("exactly the previous behaviour"). Verified after the change:
            // .dock-hit reachable from 75 of 75 sampled points. Nothing about the glass's
            // appearance is touched — .dock-swipe/-sheen/-edge-light are untouched.
            // If the composer is ever wanted in the glass again, it must not cover
            // .dock-hit; re-run the point sample before believing it does not.
            // ── THE SOUNDWAVE ALONE GOES IN THE GLASS. qi 2026-08-13 20:02:
            // "my sound wave did not move and thats a extremely important of interface"
            // → "The voice detection soundwave" → "Yeah my sound wave is not here".
            //
            // The `return` above is CORRECT and stays: the whole composer in the glass
            // covered .dock-hit at 125 of 125 sampled points and the drawer lost its door.
            // But the cost of that fix was qi's voice-detection meter disappearing from
            // the surface he actually watches, and BOTH are load-bearing — the glass is
            // the product, and a voice OS with no visible mic level cannot be trusted to
            // be listening.
            //
            // They only conflict because the WHOLE composer was moved. The meter itself is
            // #waveform-canvas — 658x37, pure output, it never needs a tap. Move just that
            // node and mark it pointer-events:none, and .dock-hit keeps receiving every
            // gesture THROUGH it. Buttons (send, paperclip, mic) stay in the panel where
            // they cannot block anything.
            //
            // appendChild MOVES the node, so vvsvei's rAF draw loop — which holds a
            // reference to this exact element — keeps painting it across the move. Same
            // node, same id, same context: the meter is live in its new home, not a copy.
            //
            // Verify with the ORIGINAL method before believing this is safe (the prior
            // author asked for exactly that): sample elementFromPoint across the dock and
            // confirm .dock-hit still wins every point.
            // ── KILL THE OPERATOR FIREHOSE GHOST ON THIS SURFACE ─────────────
            // qi 2026-08-13 20:25: "to the right of the interface theres a whole
            // light ghost light hidden to the right UI it says operator fire hose"
            // → "that looks like it was from the old model and I said no models"
            // ("no MODALS" — his 2026-08-12 rule, already quoted at vvsvei:644:
            // "i requested no modals on vvsvei") → "on this interface so that has
            // to be gone".
            //
            // WHY IT LEAKS: #events-rail is `position:fixed; right:0; width:320px;
            // z-index:20`. Fixed positioning resolves against the VIEWPORT, not the
            // mount host, so the instant vvsvei is mounted into XOS that panel
            // escapes its panel and floats over the whole phone surface. Style
            // scoping under #xos-vei cannot contain it — scoping changes which
            // rules apply, not which box a fixed element positions against. That is
            // the runtime-include hazard in its purest form.
            //
            // HIDDEN, NOT REMOVED, and scoped to THIS surface only: vvsvei's own
            // scripts query #events-rail, so deleting the node would hand them null
            // and take the panel's behaviour down with it. The standalone /vvsvei/
            // page is untouched — qi scoped this to "this interface".
            try {
              const ghost = host.querySelector("#events-rail");
              if (ghost) {
                ghost.style.display = "none";
                ghost.classList.remove("open", "fullscreen");
              }
            } catch (_) {}

            try {
              // STICKY, ONE TIME. qi 20:29: "I just saw the sound wave but now its
              // gone again … moving around and stuff looks like a glitch right now".
              // The move itself was correct — he watched it reach the spot he asked
              // for yesterday — but every re-mount of the vvsvei fragment produces a
              // FRESH canvas in the panel, and this ran again on each one, so the
              // meter visibly hopped panel→dock over and over. A relocation that
              // repeats is a glitch even when each individual move is right.
              // If the dock already holds a docked meter, the newcomer is a duplicate
              // from a re-mount: drop it rather than restart the shuffle.
              // REPLACE, NEVER DISCARD. Corrected 2026-08-13 20:37 — qi: "My soundwave
              // is missing", minutes after I shipped a "sticky" guard that DROPPED the
              // newcomer. That guard was backwards and I caused this:
              // on re-mount the mount code does `host.innerHTML = ...`, which wipes the
              // fragment and kills the draw loop that owns the ALREADY-DOCKED canvas.
              // That canvas keeps its pixels but stops painting — a dead meter. The
              // freshly built canvas in the new host is the LIVE one. Dropping it left
              // him with the corpse and no meter at all.
              // The newcomer always wins: retire the old node, dock the new one.
              const already = dockHost.querySelector("#waveform-canvas[data-xos-docked]");
              const wave = host.querySelector("#waveform-canvas") ||
                           host.querySelector("canvas");
              if (already && wave && wave !== already) {
                try { already.remove(); } catch (_) {}
              }
              if (wave && wave.parentElement !== dockHost) {
                wave.dataset.xosDocked = "1";
                // BOTH, and the host is the one that actually mattered. MEASURED live
                // just now, sampling 360 points across the dock:
                //   baseline            .dock-hit 360/360
                //   canvas-only none    .dock-hit 120/360, .dock-vei-host stole 240
                //   host + canvas none  .dock-hit 360/360  ← shipped
                // pointer-events:none on the canvas is NOT enough: once the host has a
                // sized child it becomes a hit target itself and swallows the drawer door
                // exactly like the composer did. The host is a passive display slot, so
                // it has no business receiving gestures at all.
                wave.style.pointerEvents = "none";
                dockHost.style.pointerEvents = "none";   // gestures pass THROUGH to .dock-hit
                // ── NO BACKGROUND BEHIND THE METER. qi 20:29, twice, and this is the
                // one that cost him yesterday: "there should be no background behind it
                // if you are gonna move it" → "Right now I see a green bar and thats
                // what infuriated me yesterday".
                // WHY THE BAR APPEARS: vvsvei's stylesheet is re-emitted under BOTH
                // hosts (`const HOSTS = [scope, ".dock-vei-host"]`), so the composer's
                // green field/panel fill follows the canvas into the glass and paints a
                // slab behind it. The canvas is a METER — it must read as light on the
                // glass, never as a panel sitting on top of it. The glass is the design;
                // anything opaque in front of it is a regression, not a container.
                wave.style.background = "transparent";
                wave.style.backgroundColor = "transparent";
                wave.style.border = "0";
                wave.style.boxShadow = "none";
                wave.style.borderRadius = "0";
                dockHost.style.background = "transparent";
                dockHost.style.backgroundColor = "transparent";
                dockHost.style.border = "0";
                dockHost.style.boxShadow = "none";
                dockHost.style.backdropFilter = "none";
                dockHost.appendChild(wave);

                // ── FULL WIDTH + CENTRED IN THE GLASS ──────────────────────
                // qi 2026-08-13 21:06: "the sound wave is there but its not
                // properly centered in it Im pretty sure its not full [width]".
                // MEASURED live at 390px viewport, immediately before this fix:
                //   .dock.dock-swipe   x=0  w=390
                //   .dock-vei-host     x=1  w=388
                //   #waveform-canvas   x=1  w=288   ← 100px of dead glass on the right
                //
                // ROOT CAUSE: vvsvei's own resizeCanvas() sizes the canvas from
                // `waveformEl.clientWidth`, and waveformEl is `#waveform` — the
                // ORIGINAL parent, which stays behind in the panel. The canvas
                // moved; its sizing authority did not. So it keeps painting at
                // the old container's width forever, and dispatching `resize`
                // re-runs that same function against that same stale box —
                // which is why the existing resize dispatch never fixed it.
                //
                // A moved node does NOT inherit its new parent's layout for an
                // intrinsically-sized element: <canvas> has width/height
                // ATTRIBUTES that are its backing-store size, independent of CSS
                // and of whatever box now contains it. Both must be set.
                const fitWave = () => {
                  try {
                    const box = dockHost.getBoundingClientRect();
                    const w = Math.max(1, Math.round(box.width));
                    // HEIGHT-NEUTRAL, DELIBERATELY. qi 2026-08-13 21:17: "you were NOT
                    // to move the swipe glass notifications."
                    // The dock is a column flex with the notif ticker BELOW this host,
                    // and .dock-swipe's min-height is derived from a measurement of its
                    // own content (--dock-h). So ANY change to this canvas's height
                    // propagates: taller canvas -> taller dock -> the ticker moves. The
                    // ask was to centre the wave horizontally; nothing about the ask
                    // touches vertical layout, so this pins the height to whatever it
                    // already renders at and only ever changes WIDTH.
                    const h = Math.max(1, Math.round(wave.getBoundingClientRect().height) || 37);
                    const dpr = window.devicePixelRatio || 1;
                    // Backing store in DEVICE pixels — without dpr the line is soft
                    // on his retina display, which reads as a rendering bug.
                    wave.width = Math.floor(w * dpr);
                    wave.height = Math.floor(h * dpr);
                    // CSS box in LAYOUT pixels, spanning the glass edge to edge.
                    // WIDTH ONLY. Nothing here may touch the vertical box.
                    //
                    // qi 2026-08-13 21:18: "my notifications need to be moved back to where
                    // the fuck they were nobody told you to move my fucking swipe bar
                    // notifications at all." That was ME, and this is the exact line.
                    //
                    // I had set display:block and margin:0 auto. MEASURED earlier in this
                    // same session, the canvas rendered `display: "inline"` — and an inline
                    // canvas sits on the text baseline, which reserves descender space
                    // BELOW it inside the line box. Switching to block removes that gap, so
                    // .dock-vei-host got shorter, --dock-h shrank, .dock-swipe's min-height
                    // shrank, and .dock-notif-ticker — which sits below the host in the same
                    // column flex — rode upward.
                    //
                    // THE LESSON: `display` is not a cosmetic property. block vs inline
                    // changes which box model the element participates in, and here that
                    // silently re-laid-out a sibling he never asked me to touch. Centring is
                    // a WIDTH problem; it never needed `display` or `margin` at all.
                    // qi 2026-08-13 21:18: "you resize my swipe bar it looks taller than
                    // what it was before." Also me — I was writing style.height from a
                    // getBoundingClientRect() reading. Even when that number looks right
                    // it can differ from the height the box had with NO inline height at
                    // all (fractional rect values round up, and an explicit height opts
                    // the element out of whatever sizing the CSS was doing), so the host
                    // grew and the whole glass with it.
                    //
                    // I now touch NOTHING vertical: the height is READ to size the backing
                    // store correctly, and never written back. The element's box stays
                    // exactly as the stylesheet renders it, so .dock-vei-host, --dock-h,
                    // the glass height and the notif ticker are all untouched by
                    // construction rather than by careful arithmetic.
                    wave.style.width = "100%";
                    const ctx = wave.getContext("2d");
                    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                  } catch (_) {}
                };
                fitWave();
                // The glass changes width on rotation and on the PWA's
                // safe-area recalc, and the draw loop never re-measures on its
                // own — so re-fit on resize instead of trusting one pass.
                try { window.addEventListener("resize", fitWave); } catch (_) {}

                // ── TWO WRITERS FIGHT OVER THIS CANVAS. RE-ASSERT, DON'T RACE. ──
                // qi 2026-08-13 21:26: "soundwave is uncentered again veering to the left".
                //
                // vvsvei's own resizeCanvas() sets wave.width from `waveformEl.clientWidth`,
                // and waveformEl is #waveform — the ORIGINAL parent, which stayed behind in
                // the panel and is NARROWER than the dock. It runs on every window resize,
                // and now also on its own ResizeObserver. So after any reflow the backing
                // store gets re-stamped at the panel's width while the CSS box is still
                // 100% of the dock: the drawing maps into a narrower coordinate space and
                // the trace hugs the left edge.
                //
                // Ordering cannot settle this — whichever listener happens to run last wins,
                // which is exactly why it "came back" rather than staying fixed. So instead
                // of trying to win the race, WATCH for the clobber and undo it: a
                // MutationObserver on the width/height ATTRIBUTES fires synchronously after
                // any writer touches them, including one in code I do not control.
                //
                // Guarded against self-triggering: fitWave only writes when the value is
                // actually wrong, so re-asserting cannot loop.
                try {
                  const mo = new MutationObserver(() => {
                    const want = Math.floor(Math.max(1, Math.round(dockHost.getBoundingClientRect().width)) * (window.devicePixelRatio || 1));
                    if (wave.width !== want) fitWave();
                  });
                  mo.observe(wave, { attributes: true, attributeFilter: ["width", "height"] });
                } catch (_) {}

                _xosDockHeight();
                try { window.dispatchEvent(new Event("resize")); } catch (_) {}
              }
            } catch (e) {
              console.warn("[xos-vei] soundwave relocation failed:", e && e.message);
            }
            return;
            // eslint-disable-next-line no-unreachable
            dockHost.appendChild(composer);
            _xosDockHeight();   // the glass just grew; the panes must follow it exactly
            // The transcript's bottom padding is derived from a measurement that just
            // changed by a lot. Nudge the observer so the feed reclaims the space in this
            // frame instead of on the next unrelated resize.
            try { window.dispatchEvent(new Event("resize")); } catch (_) {}
          } catch (e) {
            console.warn("[xos-vei] composer relocation failed, staying in panel:", e && e.message);
          }
        })(0);
      } catch (e) {
        if (cancelled) return;
        // Fail LOUD in the panel. An empty middle panel is the exact disaster
        // this component exists to end, so a silent catch here would recreate it.
        setErr((e && e.message) || String(e));
        setState("failed");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="xos-vei-wrap">
      <div id="xos-vei" ref={hostRef} />
      {state === "loading" && <div className="xos-vei-note">loading vvsvei…</div>}
      {state === "failed" && (
        <div className="xos-vei-note err">vvsvei failed to mount · {err}</div>
      )}
    </div>
  );
}

function BrowserPane({ openTabs, activeTabId, setActiveTabId, onCloseTab, onCloseAll, onOpenUrl }) {
  /* qi 2026-05-17 8672 follow-ups:
     - URL field must be editable, type-to-navigate
     - Vertical 3D tab stack restored as toggleable view (tap badge to expand) */
  const [stackOpen, setStackOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  /* qi 2026-05-17 8672:
     - Tabs are real web apps/links from app drawer or clicked links, NOT threads
     - Threads open in main browser pane only when a link is clicked
     - Tab strip shows ONLY when 2+ tabs are open (single tab = no strip)
     - Zero tabs = clean empty middle pane, no browser chrome at all */
  const tabKey = (a) => (a && (a.id || a.url || a.host || a.name)) || "";
  const tabCount = openTabs.length;
  const activeTab = openTabs.find((t) => tabKey(t) === activeTabId);
  const showStrip = tabCount >= 2;
  const showChrome = tabCount >= 1;

  if (tabCount === 0) {
    /* clean middle pane - no chrome, no URL bar, no tabs. Just the OS pane.
       qi 2026-07-01: ambient VVS voice-pulse orb as the idle background.

       ⛔ NO IFRAMES — EVER (qi 2026-08-12 17:01, HARD ARCHITECTURAL LAW):
       "we cant use iframes. thats the the exact frame work that has us
       literally 1.5 years behind yhe official launch of our for profit
       flagship _SelfOwn".

       I mounted VVSVEI here as an <iframe> at 16:55 and reverted it on this
       instruction. Recording it so the next pass does not rediscover the idea:
       framing VVSVEI is the OBVIOUS solution and it is FORBIDDEN. The cost is
       not stylistic — iframes are what put the flagship 1.5 years behind.
       VVSVEI must become the center panel IN THIS DOCUMENT (shared DOM, shared
       styles, one page), never a nested browsing context. */
    return <div className="webview-empty"><div className="voice-pulse-orb" /></div>;
  }

  const parts = activeTab ? urlParts(activeTab.url || "") : { scheme: "", host: "", path: "" };

  return (
    <>
      <div className="kicker-bar">
        <div className="kicker chrome">{activeTab ? (activeTab.name || activeTab.host || "loaded") : ""}</div>
        <div className="badge">
          <span className="led" />
          <span>{tabCount} {tabCount === 1 ? "tab" : "tabs"}</span>
        </div>
      </div>

      <div className="webview-wrap">
        {showStrip && (
          <div className="wv-tab-strip">
            {openTabs.map((t) => {
              const k = tabKey(t);
              return (
                <div
                  key={k}
                  className={"wv-tab-chip" + (k === activeTabId ? " active" : "")}
                  onClick={() => setActiveTabId(k)}
                >
                  <span className="wv-tab-name">{t.name || t.host || "tab"}</span>
                  <span
                    className="wv-tab-x"
                    onClick={(e) => { e.stopPropagation(); onCloseTab(k); }}
                  >✕</span>
                </div>
              );
            })}
            <button
              className="wv-stack-toggle"
              aria-label="Toggle vertical 3D tab stack"
              onClick={() => setStackOpen((s) => !s)}
            >▦</button>
          </div>
        )}

        {/* URL bar - only when at least one tab is open. EDITABLE. */}
        {showChrome && (
          <div className="wv-urlbar">
            <div className="wv-action" onClick={() => onCloseTab(activeTabId)} aria-label="Close tab">✕</div>
            <form
              className="wv-url-form"
              onSubmit={(e) => {
                e.preventDefault();
                const raw = (urlDraft || "").trim();
                if (!raw) return;
                if (onOpenUrl) onOpenUrl(raw);
                setUrlDraft("");
              }}
            >
              <span className="lock">⌬</span>
              <input
                className="wv-url-input"
                type="text"
                value={urlDraft || (activeTab ? (activeTab.url || "") : "")}
                onChange={(e) => setUrlDraft(e.target.value)}
                onFocus={(e) => setUrlDraft(activeTab ? (activeTab.url || "") : "")}
                placeholder="type or paste a URL..."
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
              />
            </form>
            <div className="wv-action" onClick={() => { if (activeTab && activeTab.url) window.open(activeTab.url, "xen-app-" + activeTabId, "noopener"); }} aria-label="Reopen">↻</div>
          </div>
        )}

        <div className="wv-page-host">
          {stackOpen ? (
            /* qi 2026-05-17 8672: restored vertical 3D tab stack - tap a card to activate */
            <div className="wv-tabs-view">
              {openTabs.length === 0 && (
                <div className="wv-tabs-empty">no open tabs</div>
              )}
              {openTabs.map((t) => {
                const k = tabKey(t);
                return (
                  <TabCard
                    key={k}
                    tab={{ ...t, id: k, kind: t.fromLink ? "thread" : "site", title: t.name || t.host, body: t.url }}
                    onClose={() => onCloseTab(k)}
                    onOpen={() => { setActiveTabId(k); setStackOpen(false); }}
                  />
                );
              })}
              <div className="tab-card new" onClick={() => setStackOpen(false)}>
                <span className="plus">+</span> back to page
              </div>
            </div>
          ) : activeTab ? (
            <OpenedAppPage app={activeTab} />
          ) : null}
          {false && (
            <div className="wv-page" style={{ display: "none" }}>
              <div className="wp-bar">
                <div className="wp-logo"><span className="w">W</span>WIKIPEDIA</div>
                <div className="wp-search">
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>

              <article className="wp-article">
                <div className="wp-from">From Wikipedia, the free encyclopedia</div>
                <h1 className="wp-title">Mars</h1>
                <p className="wp-sub">For other uses, see <a style={{ color: "#36c" }}>Mars (disambiguation)</a>.</p>

                <div className="wp-toolbar">
                  <button>◐ Listen</button>
                  <button>✎ Edit</button>
                  <button>★ Watch</button>
                </div>

                <div className="wp-infobox">
                  <div className="ib-title">Mars ♂</div>
                  <div className="ib-image" role="img" aria-label="Mars from space" />
                  <div className="ib-caption">
                    Mars as photographed by the Hubble Space Telescope, 2003.
                  </div>
                  <table>
                    <tbody>
                      <tr><td>Designations</td><td>4th planet from Sun</td></tr>
                      <tr><td>Pronunciation</td><td>/ˈmɑːrz/</td></tr>
                      <tr><td>Adjectives</td><td>Martian</td></tr>
                      <tr><td>Aphelion</td><td>249,261,000 km</td></tr>
                      <tr><td>Perihelion</td><td>206,650,000 km</td></tr>
                      <tr><td>Orbital period</td><td>686.971 days</td></tr>
                      <tr><td>Mean radius</td><td>3,389.5 km</td></tr>
                      <tr><td>Mass</td><td>6.4171×10²³ kg</td></tr>
                      <tr><td>Surface gravity</td><td>3.72076 m/s²</td></tr>
                      <tr><td>Moons</td><td>Phobos, Deimos</td></tr>
                    </tbody>
                  </table>
                </div>

                <p className="wp-p">
                  <b>Mars</b> is the fourth <a>planet</a> from the <a>Sun</a>. The surface
                  of Mars is orange-red because it is covered in <a>iron(III) oxide</a> dust,
                  giving it the nickname "the <b>Red Planet</b>".<span className="ref">[12]</span>
                  Mars is among the brightest objects in <a>Earth's sky</a> and its high-contrast
                  albedo features have made it a common subject for telescope viewing.
                </p>

                <p className="wp-p">
                  It is a <a>terrestrial planet</a> with a thin atmosphere of mostly
                  <a> carbon dioxide</a>. Mars has a crust primarily composed of elements
                  similar to Earth's crust, as well as a core made of iron and nickel.<span className="ref">[14]</span>
                  Mars has surface features such as <a>impact craters</a>, <a>valleys</a>,
                  <a>dunes</a>, and <a>polar ice caps</a>.
                </p>

                <div className="wp-toc">
                  <b>Contents</b>
                  <ol>
                    <li>Historical observations</li>
                    <li>Physical characteristics</li>
                    <li>Surface geology</li>
                    <li>Hydrology</li>
                    <li>Atmosphere</li>
                    <li>Orbit and rotation</li>
                    <li>Habitability and search for life</li>
                    <li>Moons</li>
                    <li>Exploration</li>
                  </ol>
                </div>

                <h2 className="wp-h2">Historical observations</h2>
                <p className="wp-p">
                  The existence of Mars as a wandering object in the night sky was
                  recorded by ancient <a>Egyptian astronomers</a>, and by 1534 BCE
                  they were familiar with the <a>retrograde motion</a> of the planet.
                  By the period of the <a>Neo-Babylonian Empire</a>, the Babylonian
                  astronomers were making regular records of the positions of the
                  planets and systematic observations of their behavior.
                </p>

                <h2 className="wp-h2">Moons</h2>
                <p className="wp-p">
                  Mars has two relatively small natural moons,
                  <a> Phobos</a> (about 22 km in diameter) and <a>Deimos</a> (about
                  12 km in diameter), which orbit close to the planet. The origin
                  of both moons is unclear, although a popular theory states that
                  they were asteroids captured into Martian orbit.
                </p>

                <div className="wp-quote">
                  "Both moons were discovered in 1877 by American astronomer Asaph Hall,
                  and are named after the characters Phobos (panic/fear) and Deimos
                  (terror/dread) who, in Greek mythology, accompanied their father Ares,
                  god of war, into battle."
                </div>

                <p className="wp-p">
                  Phobos rises in the west, sets in the east, and rises again in
                  just 11 hours. Deimos, being only just outside synchronous orbit,
                  rises as expected in the east but very slowly. Despite the 30-hour
                  orbit of Deimos, it takes 2.7 days to set in the west.
                </p>

                <p className="wp-p">
                  <a>See also: Phobos (moon)</a>
                </p>
              </article>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ===========================================================
   PANE 3 — PHONE
   =========================================================== */
function Dialpad({ callers }) {
  const [num, setNum] = useState("");
  /* ── THE STAR KEY DIALLED A GLYPH, NOT A STAR (found 2026-08-13 02:50, codex
     review, then verified against the source before touching anything).
     KEYS[213] is ["✱", ""] — that is U+2731 HEAVY ASTERISK, a DISPLAY character.
     press() appended it verbatim and `tel` was built as "tel:" + num, so pressing
     star produced `tel:✱` — not a valid tel: URI, so the call silently does not
     place. Same class for any future decorative key glyph.
     FIX: the keypad may keep whatever glyph looks right; what enters state is the
     real DTMF character. Display stays pretty, the dialled string stays valid. */
  const KEY_VALUE = { "✱": "*" };
  const press = (d) => setNum((n) => (n + (KEY_VALUE[d] || d)).slice(0, 16));
  const back = () => setNum((n) => n.slice(0, -1));
  /* Sanitize on the way out too, belt and braces: RFC 3966 allows digits and
     + * # , ; only. Anything else in a tel: URI is silently dropped by the OS,
     which looks exactly like "the call button does nothing". */
  const telDigits = num.replace(/[^0-9*#+,;]/g, "");
  const tel = telDigits ? "tel:" + telDigits : null;

  const match = useMemo(() => {
    if (!num) return null;
    const digits = num.replace(/\D/g, "");
    if (!digits) return null;
    const hit = (callers || []).find((c) => (c.e164 || "").replace(/\D/g, "").includes(digits));
    if (hit) return (hit.name || hit.alias || hit.e164) + (hit.persona_hint ? " · " + hit.persona_hint : "");
    if (num.length >= 3) return `${num.length} digits · search contacts`;
    return null;
  }, [num, callers]);

  return (
    <div className="phone-body">
      <div className="dial-area">
        <div className="dial-label">phone</div>
        <div className="dial-display">
          {num ? num : <span className="placeholder">_ _ _ _ _ _</span>}
        </div>
        <div className={"dial-match" + (match ? "" : " muted")}>
          {match || "› tap a key or speak a name"}
        </div>
      </div>

      <div className="ascii-pad">
        {[0, 1, 2, 3].map((row) => (
          <div className="pad-row" key={row}>
            {KEYS.slice(row * 3, row * 3 + 3).map(([n, l]) => (
              <button key={n} className="ascii-key" onClick={() => press(n)}>
                <div className="ak-num" style={n === "✱" ? { fontSize: 32, marginTop: -2 } : null}>{n}</div>
                <div className="ak-chars">{l || "\u00a0"}</div>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="call-actions">
        <button className="ca-btn" aria-label="contacts">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>
        <a className="ca-btn call" href={tel || "#"} onClick={(e) => { if (!num) e.preventDefault(); }} style={{ textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 15.5c-1.2 0-2.5-.2-3.6-.6-.3-.1-.7 0-1 .3l-2.2 2.2c-2.8-1.4-5.2-3.7-6.6-6.6l2.2-2.2c.3-.3.4-.7.3-1-.4-1.1-.6-2.3-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/>
          </svg>
          <span>call</span>
        </a>
        <button className="ca-btn" aria-label="backspace" onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
            <line x1="18" y1="9" x2="12" y2="15"/>
            <line x1="12" y1="9" x2="18" y2="15"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* live callers feed — canon_xlrd_app_path_map_2026-05-11 says 97+ live callers at /api/callers */
const CALLER_PALETTE = [
  { bg: "#00dc82", fg: "#03190d" },
  { bg: "#7afff5", fg: "#02261f" },
  { bg: "#ffb46a", fg: "#1a0d04" },
  { bg: "#ff3344", fg: "#fff" },
  { bg: "#1a1a1a", fg: "#c8d0c0" }
];
function callerInitials(name, e164) {
  const n = (name || "").trim();
  if (!n) return (e164 || "?").replace(/\D/g, "").slice(-2) || "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}
function callerColor(key) {
  let h = 0;
  for (let i = 0; i < (key || "").length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CALLER_PALETTE[Math.abs(h) % CALLER_PALETTE.length];
}

function Recents({ callers, status }) {
  if (status !== "ok") {
    return <div className="recents"><div style={{ padding: "20px", color: "var(--text-muted)", fontStyle: "italic" }}>{status}…</div></div>;
  }
  // pull last 12 with at least a name or e164
  const rows = callers.slice(0, 12);
  return (
    <div className="recents">
      {rows.length === 0 && (
        <div style={{ padding: "20px", color: "var(--text-muted)", fontStyle: "italic" }}>no recent callers</div>
      )}
      {rows.map((c, i) => {
        const key = c.e164 || c.name || String(i);
        const col = callerColor(key);
        const name = c.name || c.alias || c.e164 || "unknown";
        const sub = c.persona_hint || c.e164 || "";
        return (
          <a href={c.e164 ? "tel:" + c.e164 : undefined} className="recent-row" key={key + "-" + i} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="av" style={{ background: col.bg, color: col.fg }}>{callerInitials(name, c.e164)}</div>
            <div>
              <div className="nm">{name}</div>
              <div className="sub">
                <span className="dir-in">↙ live</span>
                <span>·</span>
                <span>{sub}</span>
              </div>
            </div>
            <div className="time">{(c.notes || "").includes("[") ? (c.notes.match(/\[([^\]]+)\]/) || [])[1] || "" : ""}</div>
          </a>
        );
      })}
    </div>
  );
}

function Contacts({ callers, status }) {
  if (status !== "ok") {
    return <div className="contacts"><div style={{ padding: "20px", color: "var(--text-muted)", fontStyle: "italic" }}>{status}…</div></div>;
  }
  // group by first letter of name
  const groups = {};
  callers.forEach((c) => {
    const name = c.name || c.alias || c.e164 || "?";
    const letter = (name[0] || "#").toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(c);
  });
  const letters = Object.keys(groups).sort();
  return (
    <div className="contacts">
      {letters.length === 0 && (
        <div style={{ padding: "20px", color: "var(--text-muted)", fontStyle: "italic" }}>no contacts</div>
      )}
      {letters.map((letter) => (
        <div key={letter}>
          <div className="contacts-letter">{letter}</div>
          {groups[letter].map((c, i) => {
            const key = c.e164 || c.name || (letter + i);
            const col = callerColor(key);
            const name = c.name || c.alias || c.e164 || "?";
            const sub = c.e164 || c.persona_hint || "";
            return (
              <a href={c.e164 ? "tel:" + c.e164 : undefined} className="contact-row" key={key + "-" + i} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="av" style={{ background: col.bg, color: col.fg }}>{callerInitials(name, c.e164)}</div>
                <div className="nm">
                  {name}
                  <small>{sub}</small>
                </div>
                <div className="quick">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 15.5c-1.2 0-2.5-.2-3.6-.6-.3-.1-.7 0-1 .3l-2.2 2.2c-2.8-1.4-5.2-3.7-6.6-6.6l2.2-2.2c.3-.3.4-.7.3-1-.4-1.1-.6-2.3-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/>
                  </svg>
                </div>
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PhonePane() {
  const [tab, setTab] = useState("dial");
  const [callers, setCallers] = useState([]);
  const [status, setStatus] = useState("connecting");
  const labels = { dial: "Dialpad", recents: "Recents", contacts: "Contacts" };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(CALLERS_URL)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((data) => {
          if (cancelled) return;
          const list = (data && data.callers) || [];
          // strip smoke-test rows
          const real = list.filter((c) => c.persona_hint !== "automated test" && c.name !== "smoke-test");
          setCallers(real);
          setStatus("ok");
        })
        .catch(() => { if (!cancelled) setStatus("reconnecting"); });
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <>
      <div className="kicker-bar">
        <div className="kicker">Phone</div>
        <div className="badge muted">{labels[tab]} · {status === "ok" ? callers.length : status}</div>
      </div>

      <div className="phone">
        <div className="phone-tabs">
          <button className={tab === "dial" ? "active" : ""} onClick={() => setTab("dial")}>Dialpad</button>
          <button className={tab === "recents" ? "active" : ""} onClick={() => setTab("recents")}>Recents</button>
          <button className={tab === "contacts" ? "active" : ""} onClick={() => setTab("contacts")}>Contacts</button>
        </div>

        {tab === "dial" && <Dialpad callers={callers} />}
        {tab === "recents" && <Recents callers={callers} status={status} />}
        {tab === "contacts" && <Contacts callers={callers} status={status} />}
      </div>
    </>
  );
}

/* ===========================================================
   APP DRAWER  +  NOTIFICATION TOAST
   =========================================================== */
/* THE WEB APP DRAWER IS THE PRODUCT, NOT A CONVENIENCE (qi 2026-08-13 02:19):
   "The PWA browser and the browser container all in one app eliminating the App
   Store is one of the core values of the app that saves companies thousands of
   dollars per year... But that doesn't exist if my web app drawer isn't there."

   MEASURED 2026-08-13 02:20 on the live surface: this list held exactly TWO
   entries — Grok Voice and v0.dev — and the drawer rendered exactly two icons.
   qi's report was "we lost my swipe glass that was there that had all the web
   apps in there." The glass was never lost; .dock.dock-swipe is present and
   measured 92px tall. THE REGISTRY WAS THE STUB. Two apps is not a drawer.

   SOURCE OF THIS LIST — no invented entries: every URL below is a property qi
   owns or a service he already has a connected session for, taken from his own
   `tomcp-*` MCP server registry, which is the measured record of what he is
   actually logged into. Nothing here is aspirational or a placeholder.

   iconUrl uses the same Google S2 favicon convention parseAppFromUrl() already
   established for user-added apps, so defaults and additions render identically
   instead of defaults falling back to bare glyph letters. */
const _app = (id, url, name) => ({
  id, url, name,
  glyph: name[0].toUpperCase(),
  iconUrl: "https://www.google.com/s2/favicons?domain=" +
           encodeURIComponent(new URL(url).hostname) + "&sz=128"
});

const DEFAULT_APPS = [
  // qi's own properties first — the drawer opens on his own work
  _app("vvsvei",   "https://hitthe.link/vvsvei/",        "VVSVEI"),
  _app("xlrd",     "https://xlrd.org",                   "XLRD"),
  _app("hitthe",   "https://hitthe.link",                "Hitthe.link"),
  _app("bookmb",   "https://bookmb.com",                 "Book MB"),
  // comms
  _app("beeper",   "https://web.beeper.com",             "Beeper"),
  _app("gmail",    "https://mail.google.com",            "Gmail"),
  _app("gvoice",   "https://voice.google.com",           "Google Voice"),
  _app("linkedin", "https://www.linkedin.com",           "LinkedIn"),
  _app("x",        "https://x.com",                      "X"),
  _app("facebook", "https://www.facebook.com",           "Facebook"),
  _app("instagram","https://www.instagram.com",          "Instagram"),
  // models + research
  _app("grok",     "https://grok.com/voice",             "Grok Voice"),
  _app("chatgpt",  "https://chatgpt.com",                "ChatGPT"),
  _app("claude",   "https://claude.ai",                  "Claude"),
  _app("gemini",   "https://gemini.google.com",          "Gemini"),
  _app("perplex",  "https://www.perplexity.ai",          "Perplexity"),
  _app("notebook", "https://notebooklm.google.com",      "NotebookLM"),
  // build + ship
  _app("v0",       "https://v0.dev",                     "v0.dev"),
  _app("github",   "https://github.com/xlrdtech",        "GitHub"),
  _app("n8n",      "https://n8n.io",                     "n8n"),
  // create
  _app("canva",    "https://www.canva.com",              "Canva"),
  _app("sora",     "https://sora.com",                   "Sora"),
  _app("suno",     "https://suno.com",                   "Suno"),
  _app("pinterest","https://www.pinterest.com",          "Pinterest"),
  _app("ytstudio", "https://studio.youtube.com",         "YT Studio"),
  // work surfaces
  _app("notion",   "https://www.notion.so",              "Notion"),
  _app("todoist",  "https://app.todoist.com",            "Todoist"),
  _app("gdocs",    "https://docs.google.com",            "Docs"),
  _app("gsheets",  "https://sheets.google.com",          "Sheets"),
  _app("gcal",     "https://calendar.google.com",        "Calendar"),
  _app("raindrop", "https://app.raindrop.io",            "Raindrop"),
  _app("sintra",   "https://sintra.ai",                  "Sintra")
];

function parseAppFromUrl(raw) {
  let url = (raw || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const main = host.split(".").slice(-2, -1)[0] || host.split(".")[0];
    return {
      id: "app-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      url,
      host,
      glyph: (main[0] || "?").toUpperCase(),
      name: main.charAt(0).toUpperCase() + main.slice(1),
      /* qi 2026-05-17 8672: auto-favicon from URL host. Google S2 is reliable + zero-auth. */
      iconUrl: "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=128"
    };
  } catch (e) { return null; }
}

function WebAppIcon({ app, adding, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false);
  /* qi 2026-05-17 8672: 3D iOS app icon - rounded square, gradient sheen, depth shadow.
     Fall back to glyph letter only if favicon fetch fails. */
  return (
    <button className="web-app" onClick={() => onOpen && onOpen(app)} type="button">
      <div className={"icon ios3d" + (adding ? " adding" : "")}>
        {app.iconUrl && !imgFailed ? (
          <img
            src={app.iconUrl}
            alt={app.name}
            className="ios3d-img"
            onError={() => setImgFailed(true)}
            draggable={false}
          />
        ) : (
          <span className="ios3d-glyph">{app.glyph}</span>
        )}
        <span className="ios3d-sheen" aria-hidden="true" />
      </div>
      <div className="nm">{app.name}</div>
    </button>
  );
}

function AppDrawer({ open, onClose, apps, onAdd, onOpen }) {
  const [val, setVal] = useState("");
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  const inputRef = useRef(null);

  const submit = () => {
    const parsed = parseAppFromUrl(val);
    if (!parsed) return;
    onAdd(parsed);
    setRecentlyAddedId(parsed.id);
    setVal("");
    setTimeout(() => setRecentlyAddedId(null), 700);
  };

  return (
    <>
      <div className={"app-scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"app-drawer" + (open ? " open" : "")}>
        <div className="drawer-grabber" onClick={onClose} />
        <div className="drawer-head">
          <div>
            <div className="drawer-eyebrow">WEB APPS</div>
            <div className="drawer-title">Apps</div>
          </div>
          <div className="drawer-web-pill">WEB</div>
        </div>
        <div className="drawer-url-row">
          <input
            ref={inputRef}
            className="drawer-url-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="https://example.com"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button className="drawer-add-btn" onClick={submit} disabled={!val.trim()}>
            ADD
          </button>
        </div>
        <div className="drawer-grid">
          {apps.map((a) => (
            <WebAppIcon
              key={a.id}
              app={a}
              adding={a.id === recentlyAddedId}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/* qi 2026-05-17 8672: digital-typing notification ticker projected onto the
   glass swipe dock. Replaces the top-popup toast. Types character by character,
   pauses at full text, then fades. */
function DockNotifTicker({ notif }) {
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState("typing");
  useEffect(() => {
    if (!notif) { setShown(""); setPhase("typing"); return; }
    setShown("");
    setPhase("typing");
    const fullText = ((notif.sender || notif.recipient || notif.src || "xen") + ": " + (notif.body || "")).slice(0, 120);
    let i = 0;
    const typeId = setInterval(() => {
      i += 1;
      setShown(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(typeId);
        setPhase("settled");
        setTimeout(() => setPhase("fading"), 3200);
      }
    }, 28);
    return () => { clearInterval(typeId); };
  }, [notif]);
  if (!notif) return null;
  return (
    <span className={"dock-notif-ticker " + phase} data-src={notif.src}>
      <span className="dotglow" aria-hidden="true" />
      <span className="text">{shown}</span>
      {phase === "typing" && <span className="caret">▎</span>}
    </span>
  );
}

function NotificationToast({ notif, onDismiss }) {
  if (!notif) return null;
  const srcColors = {
    email:     "#d97757",
    beside:    "#22d3a4",
    slack:     "#ECB22E",
    instagram: "#E1306C",
    facebook:  "#1877F2",
    telegram:  "#229ED9",
    whatsapp:  "#25D366",
    discord:   "#5865F2",
    linkedin:  "#0A66C2",
    signal:    "#3A76F0",
    x:         "#E8E8E8"
  };
  const srcBadges = {
    email:     "@",
    beside:    "·",
    slack:     "#",
    instagram: "○",
    facebook:  "f",
    telegram:  "✈",
    whatsapp:  "w",
    discord:   "d",
    linkedin:  "in",
    signal:    "s",
    x:         "X"
  };
  const bg = srcColors[notif.src] || "#ff7a2d";
  const isOut = notif.dir === "out";
  return (
    <div className="notif-host">
      <div className={"notif" + (notif.closing ? " out" : "")}>
        <div className="notif-ico" style={{ background: bg, color: "#0a0a0a" }}>
          {isOut ? "↗" : (notif.sender || "?")[0].toUpperCase()}
          <span className="badge">{srcBadges[notif.src] || "?"}</span>
        </div>
        <div className="notif-body">
          <div className="notif-title">
            {isOut ? `you → ${notif.recipient}` : (notif.sender || "unknown")}
          </div>
          <div className="notif-text">{notif.body}</div>
        </div>
        {/* qi 2026-05-25 timestamp canon: show real h:mm AM/PM not hardcoded "now". */}
        <div className="notif-time">{(() => {
          const _t = notif._absTs ? new Date(notif._absTs)
                   : notif.ts > 0 ? new Date(toMs(notif.ts))
                   : new Date();
          let _h = _t.getHours();
          const _m = String(_t.getMinutes()).padStart(2,"0");
          const _ampm = _h >= 12 ? "PM" : "AM";
          _h = (_h % 12) || 12;
          return `${_h}:${_m} ${_ampm}`;
        })()}</div>
        {/* qi 2026-05-17 8672: "notifications need to be dismissible" */}
        <button
          className="notif-dismiss"
          aria-label="Dismiss notification"
          onClick={(e) => { e.stopPropagation(); if (onDismiss) onDismiss(); }}
        >✕</button>
      </div>
    </div>
  );
}

/* ===========================================================
   ROOT
   =========================================================== */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const panesRef = useRef(null);
  const [paneIdx, setPaneIdx] = useState(t.startPane ?? 1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  /* qi 2026-05-17 8672: apps must persist across reload. localStorage with safe fallback.
     ── 2026-08-13 02:29, MEASURED ON THE LIVE SITE AFTER A VERIFIED DEPLOY ──
     `stored` used to WIN OUTRIGHT (`if (parsed.length) return parsed`). The served
     app.jsx carried all 32 defaults — 124,536 bytes, verified on the edge — and the
     drawer still rendered exactly TWO icons, because this device had
     xos.apps.v1 = [grok, v0] persisted from an older build. Confirmed by reading the
     key directly, not inferred.

     THAT MEANS SHIPPING A NEW DEFAULT WAS INVISIBLE TO EVERY EXISTING USER, qi
     INCLUDED. The bytes were right and the product was wrong — the byte gate passed
     and the human-path test (cmd 32) is what caught it.

     Now the stored list and the defaults are MERGED, additively:
       - every app qi added survives, in his order, untouched — this never removes
       - defaults missing from his list get appended
       - matched on BOTH id and normalised url, so an app he added by hand that
         happens to be a default does not appear twice
     A future default therefore reaches him on next load instead of being shadowed
     forever. Deliberately not a "reset to defaults" — that would delete his work. */
  const [apps, setApps] = useState(() => {
    let stored = null;
    try {
      const raw = localStorage.getItem("xos.apps.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) stored = parsed;
      }
    } catch (_) {}
    if (!stored) return DEFAULT_APPS;
    const norm = (u) => String(u || "").replace(/\/+$/, "").toLowerCase();
    const haveId = new Set(stored.map((a) => a && a.id).filter(Boolean));
    const haveUrl = new Set(stored.map((a) => norm(a && a.url)));
    const missing = DEFAULT_APPS.filter(
      (d) => !haveId.has(d.id) && !haveUrl.has(norm(d.url))
    );
    return missing.length ? stored.concat(missing) : stored;
  });
  useEffect(() => {
    try { localStorage.setItem("xos.apps.v1", JSON.stringify(apps)); } catch (_) {}
  }, [apps]);
  /* qi 2026-05-17 8672: tabs are real web apps/links from app drawer, not threads.
     Threads open in the main browser pane only when a link is clicked.
     Tab strip appears only when 2+ tabs are open. */
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const notifTimer = useRef(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.accent]);

  useEffect(() => {
    const el = panesRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: w * (t.startPane ?? 1), behavior: "instant" });
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setPaneIdx(idx);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line
  }, []);

  const goto = (idx) => {
    const el = panesRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * idx, behavior: "smooth" });
  };

  const handleNewEvent = (ev) => {
    setLiveEvents((prev) => [ev, ...prev].slice(0, 60));
    /* qi 2026-05-25: toast fires for inbound notifications AND outbound xen-reply-vvs
       responses so qi SEES my replies as visible cards in the swipe-bar area
       alongside his omni-inbox stream. Toast suppressed only for noise events. */
    const isInbound = ev.dir === "in";
    const isXenOut =
      ev.event === "xen-out" ||
      (ev.src && /xen-reply|xen-primary|xen-out/i.test(ev.src)) ||
      (ev.sender && /xen-primary/i.test(ev.sender));
    if (!isInbound && !isXenOut) return;
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotif({ ...ev, closing: false, isXenOut });
    /* ── AUTO-SPEAK. qi 2026-08-13 19:47: "It s supposed to speak through XOS"
       + "no voice = the system is crashed. 1000% fail".
       MEASURED THE SAME MINUTE: playBubble() had exactly ONE caller in this
       entire file — an onClick on the replay button. So XOS could ONLY speak
       when qi TAPPED it. Every xen-out arrived, rendered its toast card, and
       died silent. That is canon 4 (no human in the loop) failing by
       construction: a voice OS whose voice requires a tap is not a voice OS.
       The pieces were all healthy and none of them was wired to the next —
       api.xlrd.org/api/tts returns real audio (measured 200, audio/mpeg,
       17,181 B), SSE_URL is correctly xen.xlrd.org/events, and xen-out events
       flow (lanes byEvent xen-out=33). Only this call was missing.
       Guarded on isXenOut so inbound message cards never speak themselves —
       playBubble claims the VSQ channel, and a self-narrating inbox would
       fight Xen for the one voice. */
    // ⛔ XOS MUST NOT SPEAK. Reverted 2026-08-13 20:22 — qi: "but i just heard voice
    // overlap again", and it was mine.
    //
    // I added playBubble(xen-out) here at 19:47 off a true observation with a WRONG
    // conclusion: playBubble's only caller was an onClick, so I read XOS as unable to
    // speak without a tap. But the /vvsvei/ fragment is mounted INTO THIS DOCUMENT,
    // and it is already the speaker — `isXenOut` at vvsvei:2760, `speak-gate` at 2784,
    // `speakAva()` at 3648, and `_xenOutSpoken` at 2305 is a speak-dedup Set built for
    // exactly this event. Its dedup is keyed inside its own module, so a second speaker
    // living in XOS's scope is invisible to it: one document, one event, two voices.
    //
    // qi 2026-06-20 already settled this — "VVSVEI is THE single voice". The rule is not
    // "something must speak", it is "exactly one thing speaks". A surface that hosts the
    // speaker does not also become one.
    //
    // The toast/card below still renders, which is XOS's actual job here: SHOW the reply.
    // Speaking it is VVSVEI's.
    notifTimer.current = setTimeout(() => {
      setNotif((n) => n ? { ...n, closing: true } : null);
      setTimeout(() => setNotif(null), 300);
    }, 4200);
  };

  const addApp = (app) => setApps((prev) => [...prev, app]);
  const tabKey = (a) => (a && (a.id || a.url || a.host || a.name)) || "";
  const openApp = (app) => {
    /* canon-iframes-banned: external apps open in named window so repeat clicks reuse it */
    if (app && app.url) {
      window.open(app.url, "xen-app-" + tabKey(app), "noopener");
    }
    const k = tabKey(app);
    setOpenTabs((prev) => prev.some((t) => tabKey(t) === k) ? prev : [...prev, app]);
    setActiveTabId(k);
    setDrawerOpen(false);
    goto(1);
  };
  const closeTab = (k) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => tabKey(t) !== k);
      if (activeTabId === k) {
        setActiveTabId(next.length ? tabKey(next[next.length - 1]) : null);
      }
      return next;
    });
  };
  const closeAllTabs = () => { setOpenTabs([]); setActiveTabId(null); };
  /* openLink: invoked from MMM thread/link clicks - same flow as openApp but
     tagged so we know it came from a link not the drawer. Still ends up as a tab. */
  /* Guard added 2026-08-10. MEASURED: the Threads pill called onOpenLink("threads")
     — a STRING — and every other caller passes {id,url,name,host}. Spreading a string
     yields {0:"t",1:"h",...}, so openApp built a tab with no url/name/id, made it
     active, and goto(1) threw qi into the browser pane. Junk tab + forced pane jump
     on every tap, silently, because nothing throws.
     A string in is now a no-op instead of a corrupt tab. This does NOT decide what
     Threads should open — that is a product call, and inventing one here would be
     worse than the bug. */
  const openLink = (link) => {
    if (!link || typeof link !== "object") {
      console.warn("[xos] openLink ignored non-object:", link);
      return;
    }
    openApp({ ...link, fromLink: true });
  };
  const isConnected = t.connection === "connected";

  return (
    <div className="stage stage-fullscreen">
      {/* qi 2026-05-17 8672: "The OS only. No background. This is not a demo. Demos are blasphemy" - iOS device frame stripped, panels render fullscreen */}
      <div className="os os-fullscreen">
          {/* xen status row */}
          <div className="xen-status">
            <div className="left">
              <span
                className="dot"
                style={isConnected ? null : {
                  background: "var(--red)",
                  boxShadow: "0 0 6px var(--red)"
                }}
              />
              <span style={isConnected ? null : { color: "var(--text-dim)" }}>
                {isConnected ? "connected" : "reconnecting..."}
              </span>
            </div>
            <div className="right">{t.deviceName}</div>
          </div>

          {/* notification toast */}
          <NotificationToast notif={notif} onDismiss={() => { if (notifTimer.current) clearTimeout(notifTimer.current); setNotif(null); }} />

          <div className="panes" ref={panesRef}>
            <div className="pane"><OmniboxPane voice={t.voice} onNewEvent={handleNewEvent} onOpenLink={openLink} /></div>
            {/* MIDDLE PANEL = VVSVEI, ALWAYS (qi 2026-08-12, "VVSVEI always").
                It is mounted permanently rather than as an idle state, so the
                flagship never opens on an empty orb again — that void is what he
                called "a disaster", and it was the middle pane's designed empty
                state since 2026-07-01.
                The browser rides OVER it only while tabs are open, using the
                .xos-browser-overlay geometry that already existed for exactly
                this (absolute, stopping above the glass dock). Closing the last
                tab reveals VVSVEI again — nothing is destroyed either way. */}
            <div className="pane pane-vei">
              <VvsveiPane />
              <ShipInChat />
              {openTabs.length > 0 && (
                <div className="xos-browser-overlay">
                  <BrowserPane openTabs={openTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} onCloseTab={closeTab} onCloseAll={closeAllTabs} onOpenUrl={(raw) => { const u = /^https?:\/\//i.test(raw) ? raw : ("https://" + raw); try { const host = new URL(u).host; openLink({ id: u, url: u, name: host, host }); } catch (_) { openLink({ id: u, url: u, name: raw, host: raw }); } }} />
                </div>
              )}
            </div>
            <div className="pane"><PhonePane /></div>
          </div>

          {/* hidden app drawer + its grabber */}
          <div className="app-grabber" onClick={() => setDrawerOpen(true)}>
            <span className="lbl">apps</span>
          </div>

          <AppDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            apps={apps}
            onAdd={addApp}
            onOpen={openApp}
          />

          {t.showDock && (
            /* qi 2026-05-17 8672: hyper-realistic glass swipe layer.
               qi follow-up "it isn't swiping" - dock was intercepting horizontal
               pane swipes. Fix: the visual dock has pointer-events:none so finger
               drags pass through to the .panes scroll-snap below. Only the
               .dock-hit element has pointer-events:auto - it sits at the top of
               the dock (around the handle) as a 44px-tall touch target, and its
               handlers check |dy|>|dx| to ignore horizontal motion entirely. */
            <div className="dock dock-swipe">
              <span className="dock-handle" aria-hidden="true" />
              <span className="dock-sheen" aria-hidden="true" />
              <span className="dock-edge-light" aria-hidden="true" />
              {/* THE SOUNDWAVE + ATTACH + SEND LIVE IN THE GLASS (qi 2026-08-12 19:49:
                  "get my soundwave in the attachment and send buttons and place it
                  directly into the swipe bar and make sure my notifications still right
                  at the bottom of the swipe bar like before").
                  An EMPTY ref'd host, deliberately: VvsveiPane MOVES vvsvei's real
                  .composer node in here (one document, no iframe, so it is a move and
                  not a rebuild — which is why it can be "0% difference"). React only
                  reconciles children it created, so a foreign child inside an empty host
                  survives re-renders; appending it as a sibling of DockNotifTicker would
                  invite React to misplace them.
                  ORDER MATTERS: this sits ABOVE DockNotifTicker so notifications stay at
                  the BOTTOM of the glass, "like before". */}
              <div className="dock-vei-host" />
              <DockNotifTicker notif={notif} />
              <div
                className="dock-hit"
                role="button"
                tabIndex={0}
                aria-label="Open app drawer"
                onClick={() => setDrawerOpen(true)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setDrawerOpen(true); }}
                onTouchStart={(e) => {
                  // THE GLASS OWNS THE GESTURE (qi 2026-08-12 18:26: "the swipe
                  // glass is literally called the swipe glass because it's
                  // supposed to do the swiping").
                  //
                  // The 2026-05-17 fix made the dock pointer-events:none so
                  // horizontal drags fell through to .panes. That worked, but it
                  // meant the glass itself never swiped — the only surface that
                  // did was the banner above the panes, which is the wrong one.
                  //
                  // Now the hit layer covers the whole glass, so nothing falls
                  // through any more and this handler must MOVE THE PANES ITSELF.
                  // Axis is classified on the first move that clears the slop
                  // radius, then locked: a gesture that starts horizontal stays a
                  // pane swipe even if the finger drifts up, which is what makes
                  // it feel like the surface rather than a toggle.
                  const t0 = e.touches[0];
                  const startX = t0.clientX;
                  const startY = t0.clientY;
                  const panes = document.querySelector(".panes");
                  const startScroll = panes ? panes.scrollLeft : 0;
                  let axis = null;             // null | "x" | "y"

                  const onMove = (ev) => {
                    const t1 = ev.touches[0];
                    if (!t1) return;
                    const dx = t1.clientX - startX;
                    const dy = t1.clientY - startY;
                    if (!axis) {
                      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;  // slop
                      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
                    }
                    if (axis === "x" && panes) {
                      // Track the finger 1:1. scroll-snap on .panes settles it to
                      // the nearest pane when the finger lifts.
                      panes.scrollLeft = startScroll - dx;
                    }
                  };

                  const onEnd = (ev) => {
                    document.removeEventListener("touchmove", onMove);
                    const t1 = ev.changedTouches[0];
                    const dx = t1 ? Math.abs(t1.clientX - startX) : 0;
                    const dy = t1 ? startY - t1.clientY : 0;
                    // Vertical-up still opens the drawer — unchanged behaviour.
                    if (axis !== "x" && dy > 24 && dy > dx) setDrawerOpen(true);
                  };

                  document.addEventListener("touchmove", onMove, { passive: true });
                  document.addEventListener("touchend", onEnd, { once: true });
                }}
              />
            </div>
          )}
        </div>


      <TweaksPanel title="Tweaks">
        <TweakSection label="System" />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={ACCENTS}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakRadio
          label="Connection"
          value={t.connection}
          options={["connected", "reconnecting..."]}
          onChange={(v) => setTweak("connection", v)}
        />
        <TweakText
          label="Device"
          value={t.deviceName}
          onChange={(v) => setTweak("deviceName", v)}
        />
        <TweakToggle
          label="Voice ready"
          value={t.voice}
          onChange={(v) => setTweak("voice", v)}
        />
        <TweakToggle
          label="Show dock"
          value={t.showDock}
          onChange={(v) => setTweak("showDock", v)}
        />

        <TweakSection label="App drawer" />
        <TweakButton
          label={drawerOpen ? "Close drawer" : "Open drawer"}
          onClick={() => setDrawerOpen((o) => !o)}
        />

        <TweakSection label="iOS frame" />
        <TweakText
          label="Status time"
          value={t.iosTime}
          onChange={(v) => setTweak("iosTime", v)}
        />

        <TweakSection label="Navigate" />
        <TweakRadio
          label="Pane"
          value={String(paneIdx)}
          options={["0", "1", "2"]}
          onChange={(v) => goto(parseInt(v, 10))}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
