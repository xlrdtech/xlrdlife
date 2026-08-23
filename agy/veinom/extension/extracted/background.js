/* =============================================================
 * VEINOM background service worker
 * Single job: relay content-script TUI inject requests to
 * tui.xlrd.org/tui so failures stay out of the page's DevTools
 * and we can debounce/queue if needed.
 * ============================================================= */

const INJECT_URL = 'https://tui.xlrd.org/tui';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'tui-inject' && typeof msg.text === 'string') {
    const text = msg.text;
    fetch(`${INJECT_URL}?q=${encodeURIComponent(text)}`, { mode: 'cors' })
      .then(r => r.text())
      .then(body => {
        let payload = null;
        try { payload = JSON.parse(body); } catch (_) {}
        sendResponse({ ok: !!(payload && payload.ok), payload });
      })
      .catch(err => {
        console.warn('[VEINOM bg] tui inject failed:', err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // async
  }

  /* Browser-control intents · invoked from content.js tryVoiceCommand */
  if (msg?.type === 'tab-create' && typeof msg.url === 'string') {
    chrome.tabs.create({ url: msg.url, active: true }).then(t => sendResponse({ ok: true, id: t.id }));
    return true;
  }
  if (msg?.type === 'tab-close') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id) chrome.tabs.remove(t.id).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  if (msg?.type === 'tab-switch' && typeof msg.match === 'string') {
    chrome.tabs.query({}).then(tabs => {
      const re = new RegExp(msg.match, 'i');
      const hit = tabs.find(t => re.test(t.title) || re.test(t.url));
      if (hit) chrome.tabs.update(hit.id, { active: true }).then(() => sendResponse({ ok: true }));
      else sendResponse({ ok: false });
    });
    return true;
  }
});

/* On install, set default autostart preference */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['veinom_autostart'], (v) => {
    if (typeof v.veinom_autostart === 'undefined') {
      chrome.storage.local.set({ veinom_autostart: true });
    }
  });
});
