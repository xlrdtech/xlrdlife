// hitthe.link/_shared/ava-play.js
// Drop-in floating Ava TTS play button — plays pre-generated ./ava.mp3 sibling file.
// Generate the MP3 per page at build time with edge-tts:
//   edge-tts --voice en-US-AvaMultilingualNeural --text "..." --write-media path/to/page/ava.mp3
//
// Optional <script> data attrs:
//   data-ava-src="./ava.mp3"    explicit MP3 path (default: ./ava.mp3 relative to current page)
//   data-ava-bottom="24" / data-ava-right="24"   position in px

(function(){
  if (window.__avaPlayInit) return;
  window.__avaPlayInit = true;

  const SCRIPT_TAG = document.currentScript || document.querySelector('script[src*="ava-play.js"]');
  const SRC        = (SCRIPT_TAG && SCRIPT_TAG.dataset.avaSrc)    || './ava.mp3';
  const BOTTOM_PX  = parseInt((SCRIPT_TAG && SCRIPT_TAG.dataset.avaBottom) || '24', 10);
  const RIGHT_PX   = parseInt((SCRIPT_TAG && SCRIPT_TAG.dataset.avaRight)  || '24', 10);

  const css = `
    .ava-play-btn {
      position: fixed; bottom: ${BOTTOM_PX}px; right: ${RIGHT_PX}px;
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(155deg, #00FF88, #00cc66);
      color: #0A0A0C;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; border: 0;
      box-shadow: 0 8px 24px rgba(0,255,136,.35), 0 0 0 1px rgba(0,255,136,.4);
      z-index: 9999; font: 600 11px 'JetBrains Mono', ui-monospace, monospace;
      letter-spacing: .12em; text-transform: uppercase;
      transition: transform .15s, box-shadow .15s, background .15s;
    }
    .ava-play-btn:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 12px 32px rgba(0,255,136,.5); }
    .ava-play-btn:active { transform: scale(.96); }
    .ava-play-btn svg { width:24px; height:24px; }
    .ava-play-btn.loading { background: linear-gradient(155deg, #FFB347, #d97706); }
    .ava-play-btn.playing { background: linear-gradient(155deg, #A5F3FC, #06b6d4); }
    .ava-play-btn.error   { background: linear-gradient(155deg, #F87171, #dc2626); }
    .ava-play-label {
      position: fixed; bottom: ${BOTTOM_PX + 70}px; right: ${RIGHT_PX}px;
      background: rgba(10,10,12,.92); color: #F4EEE4;
      padding: 8px 14px; border-radius: 50px; border: 1px solid rgba(244,238,228,.18);
      font: 500 10px 'JetBrains Mono', ui-monospace, monospace;
      letter-spacing: .14em; text-transform: uppercase;
      z-index: 9999; backdrop-filter: blur(8px);
      transform: translateY(8px); opacity: 0;
      transition: opacity .2s, transform .2s; pointer-events:none;
    }
    .ava-play-btn:hover + .ava-play-label,
    .ava-play-label.show { opacity: 1; transform: translateY(0); }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const btn = document.createElement('button');
  btn.className = 'ava-play-btn';
  btn.title = 'Listen with Ava';
  btn.setAttribute('aria-label', 'Play this page with Ava TTS');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>';

  const label = document.createElement('div');
  label.className = 'ava-play-label';
  label.textContent = 'Listen · Ava';

  document.body.appendChild(btn);
  document.body.appendChild(label);

  let audio = null;
  let state = 'idle';

  function setState(next, msg) {
    state = next;
    btn.classList.remove('loading','playing','error');
    if (next === 'loading') {
      btn.classList.add('loading');
      label.textContent = 'Loading Ava...';
      label.classList.add('show');
    } else if (next === 'playing') {
      btn.classList.add('playing');
      label.textContent = 'Playing · tap to pause';
      label.classList.add('show');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
    } else if (next === 'paused') {
      btn.classList.add('playing');
      label.textContent = 'Paused · tap to resume';
      label.classList.add('show');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>';
    } else if (next === 'error') {
      btn.classList.add('error');
      label.textContent = msg || 'ava.mp3 missing';
      label.classList.add('show');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>';
      setTimeout(() => setState('idle'), 5000);
    } else {
      label.classList.remove('show');
      label.textContent = 'Listen · Ava';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>';
    }
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.preload = 'auto';
    audio.addEventListener('canplay', () => { if (state === 'loading') setState('playing'); });
    audio.addEventListener('play',    () => setState('playing'));
    audio.addEventListener('pause',   () => { if (state === 'playing') setState('paused'); });
    audio.addEventListener('ended',   () => setState('idle'));
    audio.addEventListener('error',   () => setState('error', 'ava.mp3 missing'));
    return audio;
  }

  btn.addEventListener('click', async () => {
    if (state === 'playing') { audio && audio.pause(); setState('paused'); return; }
    if (state === 'paused')  { audio && audio.play();  setState('playing'); return; }
    if (state === 'loading') return;
    setState('loading');
    ensureAudio();
    try { await audio.play(); }
    catch (e) { setState('error', 'tap blocked · retry'); }
  });

  // ── Autoplay (canon: qi 2026-05-22 "autoplay for all ava tts's") ─────────
  // 1) Try silent autoplay on load. Most browsers block this for new visitors;
  //    that's expected and is suppressed without flashing the error state.
  // 2) On first user gesture anywhere on the document, fire play within the
  //    gesture context — this always succeeds and unlocks audio for the rest
  //    of the session. Engaged repeat visitors skip the gesture step.
  let unlocked = false;

  async function silentAutoplay() {
    ensureAudio();
    try {
      await audio.play();
      unlocked = true;
    } catch (_) {
      // Stay idle without surfacing the gesture-policy rejection.
      if (state !== 'playing') setState('idle');
    }
  }

  function gestureUnlock() {
    if (unlocked) return;
    unlocked = true;
    ensureAudio();
    if (audio.paused) {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => setState('error', 'tap blocked · retry'));
      }
    }
  }

  // ── URL-level mute override ──────────────────────────────────────────
  // Append ?mute=1 (or ?silent=1) to any page URL to disable autoplay +
  // gesture-unlock entirely for that load. Use during echo-loop sessions
  // when audio output would feed back into the STT chain (canon: 2026-05-22
  // GV/Rogue-Amoeba feedback diagnosis). Button stays visible and manual
  // play still works if user explicitly taps it.
  const urlParams = new URLSearchParams(location.search);
  const urlMuted = urlParams.has('mute') || urlParams.has('silent') || urlParams.has('nopa');

  if (!urlMuted) {
    const GESTURES = ['pointerdown','touchstart','keydown','scroll','wheel'];
    const onGesture = () => {
      gestureUnlock();
      GESTURES.forEach(g => document.removeEventListener(g, onGesture, true));
    };
    GESTURES.forEach(g => document.addEventListener(g, onGesture, { capture: true, passive: true }));

    // Kick off the silent attempt; if HTML is still parsing, defer to DOMContentLoaded.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', silentAutoplay, { once: true });
    } else {
      silentAutoplay();
    }
  } else {
    // Muted load — show the button in a distinct state but do not autoplay or bind gestures.
    label.textContent = 'Muted · ?mute=1';
    label.classList.add('show');
    btn.title = 'Audio muted by URL param. Tap to play anyway.';
  }
})();
