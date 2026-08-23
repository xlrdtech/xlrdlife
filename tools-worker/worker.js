/**
 * tools.xlrd.org · Cloudflare Worker · IFTTT bridge runtime
 * Per canon_ifttt_tools_xlrd_org_3layer_auth_2026-05-22
 *
 * Three-layer auth gates every webhook hit:
 *   1. Peer token header (X-Xen-Token vs env.XEN_TOOLS_TOKEN)
 *   2. HMAC signature of body (X-Xen-Sig vs HMAC-SHA256(body, env.XEN_HMAC_KEY))
 *   3. Rate budget (per-applet token bucket via KV namespace TOOLS_RATE)
 *
 * 20-tool allowlist — only slugs in TOOL_ALLOWLIST are dispatched.
 * Anything else returns 404 + audit log entry.
 *
 * Deploy:
 *   wrangler init tools-runtime --type module
 *   cp worker.js src/index.js
 *   wrangler secret put XEN_TOOLS_TOKEN
 *   wrangler secret put XEN_HMAC_KEY
 *   wrangler kv namespace create TOOLS_RATE
 *   # update wrangler.toml with the KV binding ID
 *   wrangler deploy
 */

const TOOL_ALLOWLIST = [
  // payment events
  'paypal-paid', 'paypal-recurring', 'square-paid', 'square-recurring',
  // beside SMS triggers
  'beside-luckie-in', 'beside-qi-in', 'beside-8672-out',
  // drive uploads
  'drive-godly-inbox', 'drive-clients-inbox',
  // calendar
  'calendar-padre-call', 'calendar-daily-9am', 'calendar-tag',
  // pso-2 leads
  'pso2-new-lead', 'pso2-daily-queue',
  // voice
  'voice-stt-keyword', 'voice-reminder-due',
  // geofence + photos + padre
  'geofence-home-studio', 'photos-ocr-url', 'padre-published',
  // reserved
  'tools-reserved-20',
];

const RATE_LIMIT_PER_TOOL = 60;        // hits per window
const RATE_LIMIT_WINDOW_S = 60;        // 1 minute
const OMNIMIND_INJECT_URL = 'https://xen.xlrd.org/api/inject';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check (no auth)
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        ok: true,
        runtime: 'tools.xlrd.org',
        canon: 'canon_ifttt_tools_xlrd_org_3layer_auth_2026-05-22',
        allowlist_count: TOOL_ALLOWLIST.length,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // /ifttt/<slug> is the canonical webhook surface
    const match = url.pathname.match(/^\/ifttt\/([a-z0-9-]+)\/?$/);
    if (!match) {
      await auditLog(env, { event: 'unknown-path', path: url.pathname, ip: clientIp(request) });
      return new Response('not found', { status: 404 });
    }

    const slug = match[1];
    if (!TOOL_ALLOWLIST.includes(slug)) {
      await auditLog(env, { event: 'allowlist-reject', slug, ip: clientIp(request) });
      return new Response(JSON.stringify({ error: 'tool not in allowlist', slug }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── Layer 1: peer token ──
    const peerToken = request.headers.get('X-Xen-Token');
    if (peerToken !== env.XEN_TOOLS_TOKEN) {
      await auditLog(env, { event: 'auth-reject-peer', slug, ip: clientIp(request) });
      return new Response('forbidden', { status: 403 });
    }

    // ── Layer 2: HMAC of body ──
    const body = await request.text();
    const providedSig = request.headers.get('X-Xen-Sig') || '';
    const expectedSig = await hmacSha256(body, env.XEN_HMAC_KEY);
    if (!constantTimeEqual(providedSig, expectedSig)) {
      await auditLog(env, { event: 'auth-reject-hmac', slug, ip: clientIp(request) });
      return new Response('signature mismatch', { status: 403 });
    }

    // ── Layer 3: rate budget ──
    const allowed = await checkRate(env.TOOLS_RATE, slug);
    if (!allowed) {
      await auditLog(env, { event: 'rate-limit', slug });
      return new Response('rate limited', { status: 429 });
    }

    // ── Dispatch to omnimind ──
    let payload;
    try { payload = JSON.parse(body); }
    catch { payload = { raw: body }; }

    const injectRes = await fetch(OMNIMIND_INJECT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Xen-Token': env.XEN_MAC_TOKEN,
      },
      body: JSON.stringify({
        role: 'user',
        text: `[IFTTT/${slug}] ${JSON.stringify(payload)}`,
      }),
    });

    await auditLog(env, { event: 'dispatched', slug, status: injectRes.status });

    return new Response(JSON.stringify({
      ok: injectRes.ok,
      slug,
      forwarded_status: injectRes.status,
    }), { headers: { 'Content-Type': 'application/json' } });
  },
};

// ── Utilities ──

async function hmacSha256(message, key) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function checkRate(kv, slug) {
  if (!kv) return true; // KV not bound — fail-open during initial deploy
  const key = `rate:${slug}:${Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_S)}`;
  const current = parseInt(await kv.get(key) || '0');
  if (current >= RATE_LIMIT_PER_TOOL) return false;
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_S * 2 });
  return true;
}

function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';
}

async function auditLog(env, entry) {
  // Best-effort audit log to omnimind /api/audit endpoint
  // (silently swallows failures so logging never blocks dispatch)
  try {
    await fetch('https://xen.xlrd.org/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src: 'tools-runtime', ts: Date.now(), ...entry }),
    });
  } catch (_) {}
}
