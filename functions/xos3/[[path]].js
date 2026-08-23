// Cloudflare Pages Function — hitthe.link/xos3 -> omni.xlrd.org (CF tunnel to M4 :4489).
//
// Serves the omni-inbox: an unlisted-but-public (noindex, no auth) merged
// Beeper/Matrix inbox that is server-side rendered upstream, so a PLAIN GET of
// https://hitthe.link/xos3 (human OR AI crawler, no JS) returns the real merged
// chats — not an empty JS shell. Also proxies the agent API so an AI agent with
// only the URL can list/read/send on every chat from the hitthe.link origin.
//
//   /xos3            -> https://omni.xlrd.org/xos3   (SSR page, real chats in HTML)
//   /xos3/api/rooms  -> https://omni.xlrd.org/api/rooms
//   /xos3/api/room/:id/messages | /send  -> same on omni
//   /xos3/api/discovery, /xos3/sse       -> same on omni
//
// CORS-open + noindex preserved from upstream. qi 2026-07-21.

const UPSTREAM = 'https://omni.xlrd.org';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const rest = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  // /xos3            -> upstream /xos3 (SSR page)
  // /xos3/<rest>     -> upstream /<rest>  (api, sse, discovery)
  const target = rest ? `${UPSTREAM}/${rest}${url.search}` : `${UPSTREAM}/xos3${url.search}`;

  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  };
  init.headers.delete('host');
  init.headers.delete('cf-connecting-ip');
  init.headers.delete('cf-ray');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    }});
  }

  try {
    const upstream = await fetch(target, init);
    const h = new Headers(upstream.headers);
    h.set('access-control-allow-origin', '*');
    h.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    h.set('access-control-allow-headers', 'Content-Type');
    h.set('x-robots-tag', 'noindex, nofollow'); // unlisted: fetchable by all, not search-indexed
    return new Response(upstream.body, { status: upstream.status, headers: h });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'omni upstream unreachable', detail: e.message }),
      { status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
    );
  }
}
