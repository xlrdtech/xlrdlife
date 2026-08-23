/* XOS middle-panel browser kernel (per qi's protocol: Downloads/"is browserOS the absolute most
 * controllable" -> "browser in browser in browser").
 *
 * A tab workspace manager with a pluggable 3-mode loader. iframe is the DEFAULT (Tier 1):
 * webapps open as NESTED managed document surfaces inside the shell, not a remote stream.
 *   Tier 1  iframe runtime           -> default; native scroll/touch, same-origin DOM control
 *   Tier 2  proxy/re-host (proxyHost) -> framing-blocked apps; mirror (XBB screencast) is the interim fallback
 *   Tier 3  fail-open breakout        -> "unless it's a faith" last resort
 *
 * Additive: self-mounts its own root, never edits app.jsx. window.XOS.open(url) / event 'xos:open'.
 * Kernel objects: runtimeModeResolver, iframeHost, mirrorHost(=proxyHost interim), breakoutPolicy.
 */
(function () {
  const { useState, useRef, useEffect, useCallback } = React;

  // ---- mirror (Tier-2 interim) bridge config: same-origin on the mesh node, else tailnet ----
  const onMesh = (location.port === '8444') || /\.ts\.net$/i.test(location.hostname);
  const BRIDGE = localStorage.getItem('xos.bridge') || (onMesh ? location.origin : 'https://nitro.salmon-alkaline.ts.net:8444');
  const WSBASE = BRIDGE.replace(/^http/, 'ws');
  let cachedTok = null;
  async function getToken() {
    const ls = localStorage.getItem('xos.token'); if (ls) return ls;
    if (cachedTok) return cachedTok;
    try { const r = await fetch(BRIDGE + '/ticket'); const j = await r.json(); if (j.ok) { cachedTok = j.ticket; return cachedTok; } } catch (e) {}
    return '';
  }

  // ---- runtimeModeResolver: iframe by default; force mirror via allowlist/localStorage ----
  function runtimeModeResolver(url) {
    let host = '';
    try { host = new URL(url, location.href).hostname; } catch (e) {}
    const forced = (localStorage.getItem('xos.forcemirror') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (forced.some(h => host === h || host.endsWith('.' + h))) return 'mirror';
    // same-host as the shell, or known cooperative-embed apps -> iframe (Tier 1)
    if (host === location.hostname || host.endsWith('hitthe.link')) return 'iframe';
    return 'iframe'; // optimistic Tier 1; iframeHost auto-degrades to mirror if framing is blocked
  }

  // ---- mirror host (Tier-2 interim): host-side CDP screencast via XBB, canvas + epoch-gated taps ----
  function MirrorHost({ url, onClose }) {
    const [status, setStatus] = useState('opening');
    const [err, setErr] = useState('');
    const canvasRef = useRef(null), wsRef = useRef(null), epochRef = useRef(1), tabRef = useRef(null);
    const draw = useCallback((arrbuf) => {
      const dv = new DataView(arrbuf); epochRef.current = dv.getUint32(0);
      const blob = new Blob([arrbuf.slice(8)], { type: 'image/jpeg' });
      createImageBitmap(blob).then((bm) => { const c = canvasRef.current; if (!c) { bm.close(); return; } if (c.width !== bm.width) { c.width = bm.width; c.height = bm.height; } c.getContext('2d').drawImage(bm, 0, 0); bm.close(); }).catch(() => {});
    }, []);
    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          const tok = await getToken();
          const r = await fetch(BRIDGE + '/tab', { method: 'POST', headers: { 'authorization': 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ url, scope: 'xos' }) });
          const j = await r.json(); if (!j.ok) throw new Error(j.error || 'open-failed');
          if (!alive) return; epochRef.current = j.epoch || 1; tabRef.current = j.tabId;
          const ws = new WebSocket(WSBASE + '/tab/' + j.tabId + '?t=' + tok); ws.binaryType = 'arraybuffer'; wsRef.current = ws;
          ws.onmessage = (ev) => { if (typeof ev.data !== 'string') { draw(ev.data); setStatus('live'); return; } const m = JSON.parse(ev.data); if (m.type === 'snapshot' || m.type === 'nav') epochRef.current = m.payload.epoch; };
          ws.onerror = () => { setStatus('error'); setErr('bridge unreachable'); };
        } catch (e) { setStatus('error'); setErr(String(e.message || e)); }
      })();
      return () => { alive = false; try { wsRef.current && wsRef.current.close(); } catch (e) {} const t = tabRef.current; if (t) getToken().then(tok => fetch(BRIDGE + '/tab/' + t, { method: 'DELETE', headers: { 'authorization': 'Bearer ' + tok } }).catch(() => {})); };
    }, [url, draw]);
    const send = (type, payload) => { const ws = wsRef.current; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ch: 'input', type, epoch: epochRef.current, payload })); };
    const norm = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    return React.createElement('div', { className: 'xos-browser-stage' },
      React.createElement('canvas', { ref: canvasRef, className: 'xos-browser-canvas', style: { touchAction: 'none' },
        onPointerDown: (e) => send('tap', norm(e)), onWheel: (e) => { const p = norm(e); send('scroll', { x: p.x, y: p.y, dx: e.deltaX, dy: e.deltaY }); } }),
      status !== 'live' && React.createElement('div', { className: 'xos-browser-state' }, status === 'error' ? ('reconnect needed - ' + err) : (status + '...')));
  }

  // ---- iframe host (Tier 1, default): nested managed document surface ----
  function IframeHost({ url, onDegrade }) {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => { const t = setTimeout(() => { if (!loaded) onDegrade('framing blocked or slow'); }, 5000); return () => clearTimeout(t); }, [loaded, onDegrade]);
    return React.createElement('div', { className: 'xos-browser-stage' },
      React.createElement('iframe', { className: 'xos-browser-frame', src: url, onLoad: () => setLoaded(true),
        sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads', allow: 'microphone; camera; clipboard-read; clipboard-write; autoplay' }),
      !loaded && React.createElement('div', { className: 'xos-browser-state' }, 'opening...'));
  }

  function XOSBrowser() {
    const [tab, setTab] = useState(null); // { url, mode }
    const open = useCallback((url) => { setTab({ url, mode: runtimeModeResolver(url) }); }, []);
    const close = useCallback(() => setTab(null), []);
    const degrade = useCallback((why) => { setTab((t) => (t && t.mode === 'iframe' ? { url: t.url, mode: 'mirror' } : t)); }, []);
    const breakout = useCallback(() => { if (tab) window.open(tab.url, '_blank', 'noopener'); }, [tab]);

    useEffect(() => {
      window.XOS = { open, close, breakout };
      const onOpen = (e) => open((e.detail && e.detail.url) || 'https://hitthe.link/vvsvei');
      window.addEventListener('xos:open', onOpen);
      window.addEventListener('xos:close', close);
      return () => { window.removeEventListener('xos:open', onOpen); window.removeEventListener('xos:close', close); };
    }, [open, close]);

    if (!tab) return null;
    return React.createElement('div', { className: 'xos-browser-overlay' },
      React.createElement('div', { className: 'xos-browser-bar' },
        React.createElement('span', { className: 'xos-dot on' }),
        React.createElement('span', { className: 'xos-browser-title' }, tab.mode === 'iframe' ? 'nested' : 'mirror'),
        React.createElement('button', { className: 'xos-browser-ext', onClick: breakout, title: 'open externally' }, '↗'),
        React.createElement('button', { className: 'xos-browser-close', onClick: close, 'aria-label': 'close' }, '×')),
      tab.mode === 'iframe'
        ? React.createElement(IframeHost, { url: tab.url, onDegrade: degrade })
        : React.createElement(MirrorHost, { url: tab.url, onClose: close }));
  }

  function mount() {
    if (document.getElementById('xos-browser-root')) return;
    const el = document.createElement('div'); el.id = 'xos-browser-root'; document.body.appendChild(el);
    ReactDOM.createRoot(el).render(React.createElement(XOSBrowser));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
