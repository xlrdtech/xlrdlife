/* L7S doc.js — makes the P.A.C.T.S™ document shells FILLABLE + E-SIGNABLE in-browser.
   Shared by both brands (solutions /l7s/docs/ and hero /l7s/docs/hero/).
   Pure relative/DOM logic — no brand assumptions. Vanilla, dependency-free.
   - Fillable: .field .line, .fill, and .placeholder become persistent contenteditable fields.
   - E-Sign: a "✎ Sign" button under each .sig .sline opens a draw/type signature, stamps date.
   - Print-safe: all editor chrome hidden via @media print; only filled text + signature remain. */
(function () {
  "use strict";

  // ---- storage key namespaced to this exact document path ----
  var NS = "l7s-doc:" + (location.pathname || "/") + ":";
  function load(k) { try { return localStorage.getItem(NS + k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(NS + k, v); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(NS + k); } catch (e) {} }

  // ---------- print-safe + editor styling (injected so the file is fully self-contained) ----------
  function injectStyle() {
    if (document.getElementById("l7s-doc-js-style")) return;
    var css = [
      /* subtle focus + hover affordance for editable blanks (screen only) */
      ".l7s-editable{outline:none;cursor:text;border-radius:3px;transition:background .12s,box-shadow .12s}",
      ".l7s-editable:hover{background:rgba(199,154,58,.10)}",
      ".l7s-editable:focus{background:rgba(199,154,58,.16);box-shadow:0 0 0 2px rgba(220,38,38,.35)}",
      /* empty blanks get a faint dashed hint so the signer knows they're clickable (screen only) */
      ".l7s-editable.l7s-empty{box-shadow:inset 0 0 0 1px rgba(199,154,58,.45)}",
      /* placeholder spans being edited drop the bracketed-guidance look once real text is typed */
      ".placeholder.l7s-editable.l7s-filled{color:var(--ink);font-style:normal;background:transparent;border-color:transparent}",
      /* the in-browser Sign control + canvas modal */
      ".l7s-signbtn{display:inline-block;margin-top:6px;font-family:var(--sans,system-ui);font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--gold,#c79a3a);background:transparent;border:1px solid var(--gold,#c79a3a);border-radius:999px;padding:2px 10px;cursor:pointer}",
      ".l7s-signbtn:hover{background:rgba(199,154,58,.14)}",
      ".l7s-signimg{display:block;max-width:100%;max-height:64px;margin:2px 0 1px}",
      ".l7s-signstamp{font-family:var(--sans,system-ui);font-size:9px;color:var(--mut,#6b6b6b);letter-spacing:.03em}",
      ".l7s-clearsig{font-family:var(--sans,system-ui);font-size:9px;color:var(--mut,#6b6b6b);background:none;border:0;cursor:pointer;text-decoration:underline;padding:0;margin-left:8px}",
      /* modal */
      ".l7s-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:var(--sans,system-ui)}",
      ".l7s-card{background:#fff;color:#111;border-radius:12px;padding:18px;width:min(440px,92vw);box-shadow:0 24px 80px rgba(0,0,0,.5)}",
      ".l7s-card h3{margin:0 0 4px;font-size:15px}",
      ".l7s-card p{margin:0 0 12px;font-size:12px;color:#6b6b6b}",
      ".l7s-tabs{display:flex;gap:6px;margin-bottom:10px}",
      ".l7s-tab{flex:1;font-size:12px;font-weight:700;border:1px solid #d8d8d8;background:#faf8f3;border-radius:8px;padding:7px;cursor:pointer}",
      ".l7s-tab.on{background:#111;color:#fff;border-color:#111}",
      ".l7s-canvas{width:100%;height:150px;border:1px dashed #c79a3a;border-radius:8px;background:#fff;touch-action:none;cursor:crosshair}",
      ".l7s-typed{width:100%;box-sizing:border-box;border:1px solid #d8d8d8;border-radius:8px;padding:10px;font-family:'Brush Script MT','Segoe Script',cursive;font-size:30px}",
      ".l7s-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}",
      ".l7s-actions button{font-size:12px;font-weight:700;border-radius:8px;padding:8px 14px;cursor:pointer;border:1px solid #d8d8d8;background:#fff}",
      ".l7s-actions .ok{background:linear-gradient(135deg,#ff3b46,#b3121d);color:#fff;border-color:transparent}",
      ".l7s-actions .ghost{color:#6b6b6b}",
      /* PRINT: strip every bit of editor chrome; keep filled text + signature image */
      "@media print{",
      ".l7s-signbtn,.l7s-clearsig,.l7s-modal{display:none !important}",
      ".l7s-editable{outline:none !important;background:transparent !important;box-shadow:none !important}",
      ".l7s-editable.l7s-empty{box-shadow:none !important}",
      ".placeholder.l7s-editable.l7s-filled{border:0 !important;background:transparent !important}",
      "}"
    ].join("");
    var s = document.createElement("style");
    s.id = "l7s-doc-js-style";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- fillable fields ----------
  function txt(el) { return (el.textContent || "").replace(/\s+$/, ""); }

  function makeEditable(el, key, isPlaceholder) {
    el.classList.add("l7s-editable");
    el.setAttribute("contenteditable", "true");
    el.setAttribute("role", "textbox");
    el.setAttribute("aria-multiline", "false");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

    // restore saved value
    var saved = load(key);
    if (saved !== null && saved !== "") {
      el.textContent = saved;
      if (isPlaceholder) el.classList.add("l7s-filled");
    }

    function refreshEmpty() {
      if (txt(el) === "") el.classList.add("l7s-empty");
      else el.classList.remove("l7s-empty");
    }
    refreshEmpty();

    // first focus on a bracketed placeholder -> select-all so typing replaces the guidance
    var firstFocus = true;
    el.addEventListener("focus", function () {
      if (isPlaceholder && firstFocus && !el.classList.contains("l7s-filled")) {
        try {
          var r = document.createRange();
          r.selectNodeContents(el);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (e) {}
      }
      firstFocus = false;
    });

    // Enter blurs instead of inserting a newline
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    });

    function persist() {
      var v = txt(el);
      if (isPlaceholder) {
        if (v === "") el.classList.remove("l7s-filled");
        else el.classList.add("l7s-filled");
      }
      if (v === "") drop(key); else save(key, v);
      refreshEmpty();
    }
    el.addEventListener("input", persist);
    el.addEventListener("blur", persist);
  }

  function wireFields() {
    var i;
    // .field .line and .sig .row .line underline blanks (in any .fieldgrid or sig row)
    var lines = document.querySelectorAll(".field .line, .sig .row .line");
    for (i = 0; i < lines.length; i++) makeEditable(lines[i], "line:" + i, false);

    // inline .fill blanks
    var fills = document.querySelectorAll(".fill");
    for (i = 0; i < fills.length; i++) makeEditable(fills[i], "fill:" + i, false);

    // bracketed [..] guidance placeholders
    var phs = document.querySelectorAll(".placeholder");
    for (i = 0; i < phs.length; i++) makeEditable(phs[i], "ph:" + i, true);
  }

  // ---------- e-sign ----------
  function buildModal(onConfirm) {
    var wrap = document.createElement("div");
    wrap.className = "l7s-modal";
    wrap.innerHTML =
      '<div class="l7s-card" role="dialog" aria-modal="true" aria-label="Sign document">' +
        '<h3>Sign document</h3>' +
        '<p>Draw your signature, or switch to Type. This stays on this device.</p>' +
        '<div class="l7s-tabs">' +
          '<button type="button" class="l7s-tab on" data-mode="draw">Draw</button>' +
          '<button type="button" class="l7s-tab" data-mode="type">Type</button>' +
        '</div>' +
        '<canvas class="l7s-canvas" width="800" height="300"></canvas>' +
        '<input class="l7s-typed" type="text" placeholder="Type your name" style="display:none">' +
        '<div class="l7s-actions">' +
          '<button type="button" class="ghost l7s-x">Cancel</button>' +
          '<button type="button" class="ghost l7s-erase">Clear</button>' +
          '<button type="button" class="ok l7s-ok">Apply signature</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var canvas = wrap.querySelector(".l7s-canvas");
    var typed = wrap.querySelector(".l7s-typed");
    var tabs = wrap.querySelectorAll(".l7s-tab");
    var mode = "draw";
    var ctx = canvas.getContext("2d");
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
    var drawing = false, dirty = false, last = null;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return; e.preventDefault();
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { drawing = false; }
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    function setMode(m) {
      mode = m;
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("on", tabs[i].getAttribute("data-mode") === m);
      canvas.style.display = m === "draw" ? "" : "none";
      typed.style.display = m === "type" ? "" : "none";
      if (m === "type") typed.focus();
    }
    for (var t = 0; t < tabs.length; t++) (function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    })(tabs[t]);

    function clearAll() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; typed.value = ""; }
    function close() { wrap.remove(); }

    wrap.querySelector(".l7s-x").addEventListener("click", close);
    wrap.querySelector(".l7s-erase").addEventListener("click", clearAll);
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) close(); });

    wrap.querySelector(".l7s-ok").addEventListener("click", function () {
      var dataURL = null;
      if (mode === "type") {
        var name = (typed.value || "").trim();
        if (!name) { typed.focus(); return; }
        var c = document.createElement("canvas"); c.width = 800; c.height = 300;
        var x = c.getContext("2d");
        x.fillStyle = "#111"; x.textBaseline = "middle"; x.textAlign = "center";
        x.font = "italic 110px 'Brush Script MT','Segoe Script',cursive";
        x.fillText(name, c.width / 2, c.height / 2 + 10);
        dataURL = c.toDataURL("image/png");
      } else {
        if (!dirty) return;
        dataURL = canvas.toDataURL("image/png");
      }
      onConfirm(dataURL);
      close();
    });

    return wrap;
  }

  function fmtStamp(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getMonth() + 1) + "/" + p(d.getDate()) + "/" + d.getFullYear() +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function renderSignature(sline, dataURL, stamp) {
    // remove any prior rendered signature
    var prev = sline.querySelector(".l7s-signimg");
    if (prev) prev.remove();
    var prevS = sline.querySelector(".l7s-signstamp");
    if (prevS) prevS.remove();

    var img = document.createElement("img");
    img.className = "l7s-signimg";
    img.alt = "Signature";
    img.src = dataURL;
    // place the signature ABOVE the "Signature" caption text within the .sline block
    sline.insertBefore(img, sline.firstChild);

    var st = document.createElement("div");
    st.className = "l7s-signstamp";
    st.textContent = "Signed " + stamp;
    sline.appendChild(st);
  }

  function wireSign() {
    var slines = document.querySelectorAll(".sig .sline");
    for (var i = 0; i < slines.length; i++) (function (sline, idx) {
      var imgKey = "sig:" + idx, stampKey = "sigts:" + idx;

      // restore saved signature
      var savedImg = load(imgKey), savedTs = load(stampKey);
      if (savedImg) renderSignature(sline, savedImg, savedTs || "");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "l7s-signbtn";
      btn.textContent = "✎ Sign";
      btn.addEventListener("click", function () {
        buildModal(function (dataURL) {
          var stamp = fmtStamp(new Date());
          save(imgKey, dataURL); save(stampKey, stamp);
          renderSignature(sline, dataURL, stamp);
          clear.style.display = "";
        });
      });

      var clear = document.createElement("button");
      clear.type = "button";
      clear.className = "l7s-clearsig";
      clear.textContent = "clear signature";
      clear.style.display = savedImg ? "" : "none";
      clear.addEventListener("click", function () {
        drop(imgKey); drop(stampKey);
        var im = sline.querySelector(".l7s-signimg"); if (im) im.remove();
        var st = sline.querySelector(".l7s-signstamp"); if (st) st.remove();
        clear.style.display = "none";
      });

      sline.appendChild(btn);
      sline.appendChild(clear);
    })(slines[i], i);
  }

  function init() {
    injectStyle();
    wireFields();
    wireSign();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
