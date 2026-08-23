/* grid-autofix.js — canonical fix for the "orphan tile in the last row, left-aligned/uncentered" issue.
 * qi 2026-06-18: no site may ever ship with an uncentered odd-number last row.
 * Runtime, conservative, idempotent, reversible. Include on EVERY hitthe.link page:
 *   <script src="https://hitthe.link/lib/grid-autofix.js" defer></script>
 * Opt a container OUT with data-no-gridfix. Re-runs on resize (debounced).
 *
 * What it does: finds tile containers (>=3 roughly-uniform-width children laid out in
 * wrapping rows), detects when the LAST row has fewer tiles than a full row, and centers
 * that container so the orphan(s) sit centered instead of left-aligned.
 * - flex-wrap containers  -> justify-content:center (the canonical, never-breaks fix)
 * - grid containers       -> converted to flex-wrap+center, preserving each tile's width
 * Guards (skip if any fail): <3 children, children width variance >18%, last row already full,
 * a child spans full width (heading/footer), or container opted out.
 */
(function () {
  'use strict';
  var TAG = 'data-gridfix';
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
  function fixOne(el) {
    if (el.hasAttribute('data-no-gridfix')) return;
    var kids = [];
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      var cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.position === 'absolute') continue;
      kids.push(c);
    }
    if (kids.length < 3) return;
    var cw = el.clientWidth;
    // a child spanning ~full width = not a tile grid (header/feature row) -> skip
    for (i = 0; i < kids.length; i++) { if (kids[i].offsetWidth > cw * 0.92) return; }
    if (!uniform(kids)) return;
    var rows = rowsOf(kids);
    if (rows.length < 2) return;                 // single row: nothing to orphan
    var full = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var last = rows[rows.length - 1].length;
    if (last >= full) return;                    // last row already full -> no orphan
    var disp = getComputedStyle(el).display;
    if (disp === 'flex') {
      el.style.justifyContent = 'center';
      el.setAttribute(TAG, 'flex');
    } else if (disp === 'grid' || disp === 'inline-grid') {
      // preserve each tile's pixel width, switch to centered flex-wrap
      if (!el.hasAttribute(TAG)) {
        var gap = getComputedStyle(el).gap; if (!gap || gap === 'normal') gap = '';
        var basis = kids[0].offsetWidth;
        el.style.display = 'flex';
        el.style.flexWrap = 'wrap';
        el.style.justifyContent = 'center';
        if (gap) el.style.gap = gap;
        for (i = 0; i < kids.length; i++) { kids[i].style.flex = '0 0 ' + basis + 'px'; kids[i].style.maxWidth = basis + 'px'; }
        el.setAttribute(TAG, 'grid2flex');
      }
    }
  }
  function run() {
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length < 3) continue;
      var d = getComputedStyle(el).display;
      if (d === 'grid' || d === 'inline-grid' || d === 'flex') {
        try { fixOne(el); } catch (e) {}
      }
    }
  }
  var t;
  function deb() { clearTimeout(t); t = setTimeout(run, 120); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.addEventListener('load', run);
  window.addEventListener('resize', deb);
})();
