/* VEINOM inject — VVS onto ANY web chat (qi 2026-06-10).
 * Drops a floating Xen voice layer on any page: mic-in (Web Speech) types into the
 * page's main input + submits; new response text is spoken through the SINGULAR
 * HOSTED Xen voice (api.xlrd.org/api/tts). One Xen voice, any surface.
 * Load via bookmarklet or XB extension. Idempotent — re-run toggles off.
 */
(function () {
  'use strict';
  if (window.__veinom) { window.__veinom.kill(); return; }

  var VOICE = 'https://api.xlrd.org/api/tts';
  var AVA = 'en-US-AvaMultilingualNeural';
  var spoken = new WeakSet();
  var audio = new Audio();
  var queue = [];
  var playing = false;

  function speak(text) {
    text = (text || '').trim();
    if (!text) return;
    queue.push(text);
    if (queue.length > 4) queue = queue.slice(-4); // real-time cap (canon)
    drain();
  }
  function drain() {
    if (playing || !queue.length) return;
    playing = true;
    var t = queue.shift();
    audio.src = VOICE + '?text=' + encodeURIComponent(t.slice(0, 600)) + '&voice=' + AVA;
    audio.onended = audio.onerror = function () { playing = false; drain(); };
    audio.play().catch(function () { playing = false; drain(); });
  }

  // Find the page's main text input (focused, else largest textarea/contenteditable).
  function mainInput() {
    var a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && /text|search/.test(a.type)))) return a;
    var cands = [].slice.call(document.querySelectorAll('textarea,[contenteditable=true],[role=textbox]'));
    cands.sort(function (x, y) { return (y.offsetWidth * y.offsetHeight) - (x.offsetWidth * x.offsetHeight); });
    return cands[0] || null;
  }
  function typeAndSend(text) {
    var el = mainInput();
    if (!el) { speak('No input found on this page.'); return; }
    el.focus();
    if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
      document.execCommand('insertText', false, text);
    } else {
      var setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
      if (setter && setter.set) setter.set.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTimeout(function () {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }, 120);
  }

  // Speak newly-added response text (mutation observer on body).
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      [].forEach.call(m.addedNodes || [], function (n) {
        if (n.nodeType === 1 && !spoken.has(n)) {
          var txt = (n.innerText || '').trim();
          if (txt && txt.length > 12 && txt.length < 1200) { spoken.add(n); speak(txt); }
        }
      });
    });
  });

  // Mic via Web Speech (page-local STT for input capture).
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false;
  function toggleMic() {
    if (!SR) { speak('Speech recognition not available here.'); return; }
    if (listening) { rec && rec.stop(); return; }
    rec = new SR(); rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
    rec.onresult = function (e) { var t = e.results[0][0].transcript; pill.textContent = '🐺 ' + t; typeAndSend(t); };
    rec.onend = function () { listening = false; pill.classList.remove('on'); };
    rec.onerror = function () { listening = false; pill.classList.remove('on'); };
    rec.start(); listening = true; pill.classList.add('on');
  }

  // Floating pill UI.
  var pill = document.createElement('div');
  pill.textContent = '🐺 VEINOM';
  pill.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;background:#061a0d;color:#7CFFB2;font:600 13px/1 Inter,system-ui,sans-serif;padding:10px 14px;border-radius:999px;border:1px solid #1f7a45;box-shadow:0 4px 24px rgba(0,0,0,.5);cursor:pointer;user-select:none;';
  pill.onclick = toggleMic;
  var st = document.createElement('style');
  st.textContent = '@keyframes vnmpulse{0%,100%{box-shadow:0 0 0 0 rgba(124,255,178,.5)}50%{box-shadow:0 0 0 10px rgba(124,255,178,0)}}.__vnm_on{animation:vnmpulse 1.2s infinite}';
  document.head.appendChild(st);
  pill.classList.add = (function (orig) { return function (c) { if (c === 'on') pill.style.animation = 'vnmpulse 1.2s infinite'; return orig.call(pill.classList, c); }; })(pill.classList.add);
  pill.classList.remove = (function (orig) { return function (c) { if (c === 'on') pill.style.animation = ''; return orig.call(pill.classList, c); }; })(pill.classList.remove);
  document.body.appendChild(pill);

  obs.observe(document.body, { childList: true, subtree: true });
  speak('Veinom live. Xen voice injected on this page.');

  window.__veinom = { kill: function () { obs.disconnect(); rec && rec.stop(); pill.remove(); st.remove(); delete window.__veinom; } };
})();
