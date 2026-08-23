# Xen Matrix — omni-inbox client

A zero-build, single-page web app that is a Xen-skinned chat client for qi's
Beeper-Matrix account. Drops into the iOS-style PWA at `/apps/matrix/` on
hitthe.link, and also runs standalone (just open `index.html`).

## Files
- `index.html` — entry point + top-of-file connection/security comment
- `matrix.css` — dark, metallic/iridescent, mobile-first, two-pane→stack
- `matrix.js`  — client engine (two backends, login, sync, send, live receive)
- `README.md`  — this file

## How it connects (two modes, one UI)

### Mode A — "Beeper token" (DEFAULT, public-safe)  ← active
Browser talks **directly** to the Matrix client-server API at
`https://matrix.beeper.com` (raw `/_matrix/client/v3/*`). No SDK, no proxy.

Verified live (2026-06-28): Beeper's Synapse homeserver returns
`Access-Control-Allow-Origin: *` on both the OPTIONS preflight (204) and the
real request (200), so a public browser page on hitthe.link CAN call it.

What runs end to end: `whoami` → initial `/sync` (lazy members, 20 msgs/room)
→ long-poll incremental `/sync` (30s) for live receive → room list across all
bridges with name/avatar/last-message/unread → open room → timeline →
`PUT …/send/m.room.message` to send → read markers.

### Mode B — "Beeper Desktop" (fallback, localhost only)
Browser talks to the Beeper Desktop local REST API at
`http://localhost:23373/v1`. Verified live (app v4.2.945, remote_access on, and
it returns `Access-Control-Allow-Origin: https://hitthe.link`). Only works on
the machine running Beeper Desktop. Use it if you don't want to expose a raw
`syt_` token, or if homeserver CORS ever changes.

## How qi authenticates (token-input flow)
1. Open the app → first-run login screen.
2. **Beeper token** tab → paste the Beeper access token (`syt_…`).
   Get it: Beeper Desktop → Settings → Help & About → "Access token" (or `/devtools`).
3. Press Connect. The app calls `whoami` to validate, then stores the session in
   `localStorage["xenmx.session"]` **only**. It is never embedded in the page,
   never read from any server file, never uploaded anywhere but the homeserver.
4. Sign-out button wipes the stored token from the device.

## Security
- No token is hardcoded or fetched from a server file. The page is fully static.
- A leaked token = full account compromise, so it lives only in the user's
  browser localStorage and is sent only to the homeserver/local API they chose.

## CORS caveat & proxy fallback
If Beeper ever drops the wildcard CORS header, Mode A breaks in browsers
(`TypeError: Failed to fetch`, no status). Fixes in order:
1. Switch to **Beeper Desktop** mode (works today, localhost).
2. Stand up a tiny same-origin reverse proxy on hitthe.link forwarding
   `/mx/*` → `https://matrix.beeper.com/*` and re-adding the CORS header, then
   set Homeserver = `https://hitthe.link/mx`. Sketch is in the top of `index.html`.

## Status
- Works end-to-end **now**, requiring only qi's input: paste the Beeper access
  token on the login screen. Everything else (sync, room list across all
  bridges, open/read/send/live-receive) runs with no further setup.
