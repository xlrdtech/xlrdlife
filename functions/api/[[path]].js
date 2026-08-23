// Cloudflare Pages Function — same-origin proxy for /api/* to xen.xlrd.org
//
// qi 2026-05-23: iOS Safari blocks cross-origin POSTs from hitthe.link to
// xen.xlrd.org with opaque "Load failed" errors. Mac browsers and CLI work
// fine. By proxying through the same origin, we eliminate the cross-origin
// path entirely for mobile clients.
//
// Routes: every /api/* request hits this catch-all and is forwarded to
// https://xen.xlrd.org/api/<path> preserving method, headers, and body.

export async function onRequest(context) {
  const { request, params } = context;
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const url = new URL(request.url);
  const target = `https://xen.xlrd.org/api/${path}${url.search}`;

  const reqInit = {
    method: request.method,
    headers: new Headers(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  };
  // Strip headers that Cloudflare overrides anyway
  reqInit.headers.delete('host');
  reqInit.headers.delete('cf-connecting-ip');
  reqInit.headers.delete('cf-ray');

  try {
    const upstream = await fetch(target, reqInit);
    const respHeaders = new Headers(upstream.headers);
    // Always allow CORS on the proxy itself
    respHeaders.set('access-control-allow-origin', '*');
    respHeaders.set('access-control-allow-headers', 'Content-Type, X-Xen-Token');
    respHeaders.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: respHeaders });
    }
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'proxy upstream failed', detail: e.message }),
      { status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
    );
  }
}
