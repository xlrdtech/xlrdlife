/*! scroll-scrub-video.js — hitthe.link/lib
 * Scrub a <video> timeline from scroll position: forward on scroll-down,
 * reverse on scroll-up, frozen (paused) when not scrolling. One mechanism,
 * all three behaviours. Seamless + 60fps + zero dependencies.
 *
 * REQUIRES the video be encoded ALL-INTRA (every frame a keyframe) or reverse
 * scrubbing stutters. Recipe:
 *   ffmpeg -i in.mp4 -an -c:v libx264 -preset slow -crf 20 \
 *     -x264-params "keyint=1:scenecut=0" -pix_fmt yuv420p -movflags +faststart out.mp4
 *
 * Usage (declarative):
 *   <video data-scrub-video data-mode="page" muted playsinline preload="auto" src="scene.mp4"></video>
 *   <script src="https://hitthe.link/lib/scroll-scrub-video.js" defer></script>
 *
 * Usage (programmatic):
 *   ScrubVideo.create(document.querySelector('video'), { mode:'pin', pin:'#scene', ease:0.12 });
 *
 * Options:
 *   mode   'page' (default) = whole-document scroll maps 0..duration
 *          'pin'            = scrub only while `pin` element travels through viewport
 *   pin    selector/element for mode:'pin' (defaults to the video's offsetParent)
 *   ease   0..1 lerp factor toward target time per frame (default 0.12; lower = silkier/laggier)
 *   start  fraction of duration to map scroll-start to (default 0)
 *   end    fraction of duration to map scroll-end   to (default 1)
 *   fps    cap seek frequency to this (default = video fps or 30); avoids redundant seeks
 *   loop   true = wrap seamlessly past the ends (continuous world); default false (clamp)
 *   reducedMotionFrame  fraction to freeze on when prefers-reduced-motion (default 0)
 */
(function (root) {
  'use strict';
  var REDUCED = root.matchMedia && root.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Scrub(video, opts) {
    opts = opts || {};
    this.v = video;
    this.mode = opts.mode || video.getAttribute('data-mode') || 'page';
    this.pinEl = resolve(opts.pin || video.getAttribute('data-pin')) || video.offsetParent || document.documentElement;
    this.ease = clampNum(opts.ease != null ? opts.ease : video.getAttribute('data-ease'), 0.12);
    this.start = clampNum(opts.start != null ? opts.start : video.getAttribute('data-start'), 0);
    this.end = clampNum(opts.end != null ? opts.end : video.getAttribute('data-end'), 1);
    this.loop = (opts.loop != null ? opts.loop : video.hasAttribute('data-loop')) || false;
    this.rmFrame = clampNum(opts.reducedMotionFrame, 0);
    this.fpsCap = clampNum(opts.fps, 0);

    this.dur = 0; this.target = 0; this.current = 0;
    this.ready = false; this.running = false; this.seeking = false;
    this.lastSeek = -1; this.minSeekDelta = 1 / 30;

    // iOS/Safari demand these to allow programmatic scrubbing.
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (!video.getAttribute('preload')) video.preload = 'auto';
    video.removeAttribute('autoplay'); video.removeAttribute('loop');
    video.pause();

    this._bind();
  }

  Scrub.prototype._bind = function () {
    var s = this;
    var onMeta = function () {
      s.dur = s.v.duration || 0;
      if (s.fpsCap > 0) s.minSeekDelta = 1 / s.fpsCap;
      s.ready = true;
      if (REDUCED) { try { s.v.currentTime = s.rmFrame * s.dur; } catch (e) {} return; }
      s._recompute(); s.current = s.target; s._safeSeek(s.current); s._kick();
    };
    if (s.v.readyState >= 1 && s.v.duration) onMeta();
    else s.v.addEventListener('loadedmetadata', onMeta, { once: true });

    if (REDUCED) return;

    // iOS unlock: first gesture lets us drive currentTime thereafter.
    var unlock = function () {
      var p = s.v.play();
      if (p && p.then) p.then(function () { s.v.pause(); }).catch(function () {});
      else { try { s.v.pause(); } catch (e) {} }
      root.removeEventListener('touchstart', unlock);
      root.removeEventListener('pointerdown', unlock);
    };
    root.addEventListener('touchstart', unlock, { passive: true, once: true });
    root.addEventListener('pointerdown', unlock, { passive: true, once: true });

    var onScroll = function () { if (!s.ready) return; s._recompute(); s._kick(); };
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('resize', function () { s._recompute(); s._kick(); }, { passive: true });

    // requestVideoFrameCallback keeps `current` honest against real decoded frames.
    this._hasRVFC = typeof s.v.requestVideoFrameCallback === 'function';
  };

  Scrub.prototype._recompute = function () {
    var p; // 0..1 scroll progress
    if (this.mode === 'pin') {
      var r = this.pinEl.getBoundingClientRect();
      var vh = root.innerHeight || document.documentElement.clientHeight;
      var travel = r.height - vh;
      p = travel > 0 ? clamp(-r.top / travel, 0, 1) : (r.top <= 0 ? 1 : 0);
    } else {
      var max = document.documentElement.scrollHeight - (root.innerHeight || 0);
      p = max > 0 ? clamp((root.scrollY || root.pageYOffset || 0) / max, 0, 1) : 0;
    }
    var t = (this.start + (this.end - this.start) * p) * this.dur;
    this.target = this.loop ? ((t % this.dur) + this.dur) % this.dur : clamp(t, 0, this.dur);
  };

  Scrub.prototype._kick = function () {
    if (this.running || !this.ready) return;
    this.running = true;
    var s = this;
    requestAnimationFrame(function step() {
      // lerp current -> target; shortest path if looping
      var d = s.target - s.current;
      if (s.loop && Math.abs(d) > s.dur / 2) d -= Math.sign(d) * s.dur;
      s.current += d * s.ease;
      var settled = Math.abs(s.target - s.current) < 0.004;
      if (settled) s.current = s.target;
      var ct = s.loop ? ((s.current % s.dur) + s.dur) % s.dur : s.current;
      if (Math.abs(ct - s.lastSeek) >= s.minSeekDelta) s._safeSeek(ct);
      if (!settled) requestAnimationFrame(step);
      else s.running = false; // freeze = paused; loop stops, battery saved
    });
  };

  Scrub.prototype._safeSeek = function (t) {
    if (this.v.readyState < 2 || this.seeking) return; // HAVE_CURRENT_DATA
    this.seeking = true; this.lastSeek = t;
    var s = this;
    var done = function () { s.seeking = false; };
    // fastSeek (where available) is cheaper for scrubbing; fall back to currentTime
    try {
      if (typeof s.v.fastSeek === 'function') s.v.fastSeek(t); else s.v.currentTime = t;
    } catch (e) { s.seeking = false; return; }
    if (this._hasRVFC) this.v.requestVideoFrameCallback(done);
    else this.v.addEventListener('seeked', done, { once: true });
    // safety: never wedge if a seek event is dropped
    setTimeout(done, 120);
  };

  function resolve(x) { return typeof x === 'string' ? document.querySelector(x) : (x || null); }
  function clampNum(x, def) { var n = parseFloat(x); return isFinite(n) ? n : def; }

  var API = {
    create: function (video, opts) { return new Scrub(video, opts); },
    init: function (rootEl) {
      (rootEl || document).querySelectorAll('[data-scrub-video]').forEach(function (v) {
        if (!v.__scrub) v.__scrub = new Scrub(v);
      });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { API.init(); });
  else API.init();

  root.ScrubVideo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
