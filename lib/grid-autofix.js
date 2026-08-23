/* grid-autofix.js — canonical fix for the "orphan tile in the last row, left-aligned/uncentered" issue.
 * qi 2026-06-18: no site may ever ship with an uncentered odd-number last row.
 * Runtime, conservative, idempotent, reversible. Include on EVERY hitthe.link page:
 *   <script src="https://hitthe.link/lib/grid-autofix.js" defer></script>
 * Opt a container OUT with data-no-gridfix. Re-runs on resize, rotation, and DOM changes.
 *
 * What it does: finds tile containers (>=3 roughly-uniform-width children laid out in
 * wrapping rows), detects when the LAST row has fewer tiles than a full row, and centers
 * that container so the orphan(s) sit centered instead of left-aligned.
 * - flex-wrap containers  -> justify-content:center (the canonical, never-breaks fix)
 * - grid containers       -> converted to flex-wrap+center, preserving each tile's width
 * Guards (skip if any fail): <3 children, children width variance >18%, last row already full,
 * a child spans full width (heading/footer), or container opted out.
 *
 * ---- 2026-07-30 REWRITE. Measured client-visible breakage on bookmb.com. ----
 * Three defects, all caused by the conversion being ONE-SHOT and the pixel basis STICKY:
 *  1. Tiles revealed AFTER load (the "See All 11 Songs" button un-hiding 6 cards) entered the
 *     already-converted flex container with no flex basis, so they rendered one-per-row at
 *     full width. Measured at 1440px: [596 x5, 802,802,1202,802,802,802].
 *  2. No MutationObserver, so nothing noticed those tiles appearing.
 *  3. resize re-entered the display:flex branch and only set justifyContent, never recomputing
 *     the basis. Phone rotate landscape->portrait left tiles pinned at 378px in a 342px column
 *     (18px overflow). Desktop 1440->390 left 596px tiles in a 342px container (127px of
 *     horizontal scroll), and the flyer wall became 36 rows of 1.
 * FIX: stop mutating state in place. Every run REVERTS each container to its authored layout,
 * re-measures, then re-applies. Correct at any width, and new children are handled for free.
 * A re-entrancy flag keeps our own style writes from retriggering the observer.
 * Still conservative, still idempotent, still fully reversible.
 */
(function () {
  'use strict';
  var TAG = 'data-gridfix';
  var SAVE = '__gridfixSaved';
  var busy = false;

  function rowsOf(kids) {
    // group children by offsetTop into visual rows
    var rows = [], cur = [], top = null;
    for (var i = 0; i < kids.length; i++) {
      var t = kids[i].offsetTop;
      if (top === null || Math.abs(t - top) <= 4) { cur.push(kids[i]); top = (top === null ? t : top); }
      else { rows.push(cur); cur = [kids[i]]; top = t; }
    }
    if (cur.length) rows.push(cur);
    return rows;
  }
  function uniform(kids) {
    var ws = [], i;
    for (i = 0; i < kids.length; i++) { var w = kids[i].offsetWidth; if (w > 0) ws.push(w); }
    if (ws.length < 3) return false;
    var min = Math.min.apply(null, ws), max = Math.max.apply(null, ws);
    if (max === 0) return false;
    return (max - min) / max <= 0.18; // tiles roughly same width
  }
  function visibleKids(el) {
    var kids = [], i;
    for (i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      var cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.position === 'absolute') continue;
      kids.push(c);
    }
    return kids;
  }

  /* Put a container back exactly as authored so the next measurement is honest.
   * Without this, a basis measured at one viewport leaks into every later one. */
  function revert(el) {
    var mode = el.getAttribute(TAG);
    if (!mode) return;
    var s = el[SAVE] || {};
    if (mode === 'grid2flex') {
      el.style.display = s.display || '';
      el.style.flexWrap = s.flexWrap || '';
      el.style.gap = s.gap || '';
    }
    el.style.justifyContent = s.justifyContent || '';
    // clear the pinned width on EVERY child, including any added since conversion
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.style) { c.style.flex = ''; c.style.maxWidth = ''; }
    }
    el.removeAttribute(TAG);
  }

  function fixOne(el) {
    if (el.hasAttribute('data-no-gridfix')) return;
    var kids = visibleKids(el);
    if (kids.length < 3) return;
    var cw = el.clientWidth;
    if (!cw) return;
    var i;
    // a child spanning ~full width = not a tile grid (header/feature row) -> skip
    for (i = 0; i < kids.length; i++) { if (kids[i].offsetWidth > cw * 0.92) return; }
    if (!uniform(kids)) return;
    var rows = rowsOf(kids);
    if (rows.length < 2) return;                 // single row: nothing to orphan
    var full = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var last = rows[rows.length - 1].length;
    if (last >= full) return;                    // last row already full -> no orphan
    var cs = getComputedStyle(el);
    var disp = cs.display;
    if (disp === 'flex') {
      el[SAVE] = { justifyContent: el.style.justifyContent };
      el.style.justifyContent = 'center';
      el.setAttribute(TAG, 'flex');
    } else if (disp === 'grid' || disp === 'inline-grid') {
      // preserve each tile's pixel width, switch to centered flex-wrap
      var gap = cs.gap; if (!gap || gap === 'normal') gap = '';
      var basis = kids[0].offsetWidth;
      if (!basis) return;
      el[SAVE] = {
        display: el.style.display, flexWrap: el.style.flexWrap,
        gap: el.style.gap, justifyContent: el.style.justifyContent
      };
      el.style.display = 'flex';
      el.style.flexWrap = 'wrap';
      el.style.justifyContent = 'center';
      if (gap) el.style.gap = gap;
      /* basis goes on ALL children, not only those visible at conversion time, so a tile
       * un-hidden later is already sized correctly even before the observer fires. */
      for (i = 0; i < el.children.length; i++) {
        var c = el.children[i];
        if (!c.style) continue;
        c.style.flex = '0 0 ' + basis + 'px';
        c.style.maxWidth = basis + 'px';
      }
      el.setAttribute(TAG, 'grid2flex');
    }
  }

  function run() {
    if (busy) return;
    busy = true;
    try {
      var live = document.body ? document.body.getElementsByTagName('*') : [];
      var i, el, all = [];
      /* snapshot first: converting mutates layout, and iterating a LIVE NodeList while
       * forcing reflow is how the old version got inconsistent measurements */
      for (i = 0; i < live.length; i++) all.push(live[i]);
      // 1. revert everything previously touched, so we measure against authored CSS
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (el.hasAttribute && el.hasAttribute(TAG)) { try { revert(el); } catch (e) {} }
      }
      // 2. re-measure and re-apply
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (!el.children || el.children.length < 3) continue;
        var d = getComputedStyle(el).display;
        if (d === 'grid' || d === 'inline-grid' || d === 'flex') {
          try { fixOne(el); } catch (e) {}
        }
      }
    } finally {
      busy = false;
    }
  }

  var t;
  function deb() { clearTimeout(t); t = setTimeout(run, 120); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.addEventListener('load', run);
  window.addEventListener('resize', deb);
  window.addEventListener('orientationchange', deb);

  /* Tiles that appear or become visible after load must get sized too. The busy flag above
   * means our own style writes cannot retrigger this. Debounced, so a burst of reveals
   * costs a single pass. */
  if (window.MutationObserver) {
    var startObserver = function () {
      if (!document.body) return;
      try {
        new MutationObserver(function (recs) {
          if (busy) return;
          for (var i = 0; i < recs.length; i++) {
            var r = recs[i];
            if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) { deb(); return; }
            if (r.type === 'attributes') { deb(); return; }
          }
        }).observe(document.body, {
          childList: true, subtree: true,
          attributes: true, attributeFilter: ['style', 'class', 'hidden']
        });
      } catch (e) {}
    };
    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver);
  }
})();
