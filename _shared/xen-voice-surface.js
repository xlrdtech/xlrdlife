/* ═══════════════════════════════════════════════════════════════════════════
   XEN — THE ONE VOICE SURFACE   (qi decree 2026-08-13 22:12: "it be all share
   one surface every where")

   WHAT THIS IS, AND WHAT IT IS NOT
   ────────────────────────────────
   This is the CONSUMER side. It is NOT the VSQ.

     · VSQ (producer side) decides the ORDER in which many things that want to
       speak — swarm agents, subagents, separate environments/machines — get the
       floor. It is correct, it works, and NOTHING here touches it.
     · This module decides WHERE whatever won the floor comes out. Exactly one
       audio-owning context per origin. Every other view renders the same text
       and mirrors the same playback state, but holds no speaker of its own.

   VSQ feeds one surface. It never fans out to twelve.

   THE DEFECT THIS ELIMINATES (measured 2026-08-13)
   ────────────────────────────────────────────────
   qi: "multiple voices overlapped again" / "i can tell multiple voices were
   just trying to speak the same thing". Not two lines colliding — ONE line
   spoken by more than one surface. Measured mouths on this origin:
     · /vvsvei/       speakAva()  — VSQ-gated, but the gate opens by DEFAULT
     · /xen/voice/    speakAva()  — no gate of any kind
     · /venom/listen  drain()     — no gate of any kind
   and every additional TAB of /vvsvei/ is another mouth, because a freshly
   loaded tab starts at `_vsqOwner === null`, which the VSQ reads as "nobody
   claimed → speak". Two fresh tabs both speak. That is a chorus by
   construction, and no lease tuning fixes it — a lease between PRODUCERS was
   never the thing duplicating across VIEWS.

   HOW ONE MOUTH IS GUARANTEED — BY CONSTRUCTION, NOT BY ARBITRATION
   ─────────────────────────────────────────────────────────────────
   navigator.locks, exclusive mode. The browser itself guarantees exactly one
   holder per origin per profile. This is not a claim, not a lease, not a
   timeout, and nothing races: the lock is requested at ARM time and held
   forever, so ownership is settled LONG BEFORE any utterance arrives. At speak
   time the decision is a synchronous boolean read — zero round trips, zero
   await, zero queue between a line being emitted and it being heard.

   TAKEOVER IS DETERMINISTIC. When the mouth tab closes, crashes, navigates or
   mutes, the browser releases the lock and grants it to the next waiter in FIFO
   request order. No election, no heartbeat, no gap to tune.

   ONLY A TAB THAT CAN ACTUALLY MAKE SOUND ENTERS THE ELECTION
   ───────────────────────────────────────────────────────────
   A silent mouth is worse than a chorus: qi hears nothing while the system
   believes it spoke. So a view does NOT request the lock on load — it calls
   enable() only once its audio is genuinely armed/unlocked, and calls disable()
   when muted or torn down, which hands the mouth to the next armed view.

   FAIL OPEN, TOWARD BEING HEARD
   ─────────────────────────────
   If navigator.locks is unavailable (insecure context, ancient browser) or the
   request rejects, we do NOT go silent. We fall back to a single DETERMINISTIC
   designated mouth: the view whose path is PRIMARY_PATH ('/vvsvei/').
   Why /vvsvei/: it is the canonical VVSVEI voice page qi actually keeps open,
   it carries the full ElevenLabs 11-reader path (the real voice, not a
   speechSynthesis twin), and it is the surface VSQ already targets. A degraded
   path that still produces qi's real voice beats one that produces a robot.

   And if a non-primary view is in that degraded state, it listens 1200ms for a
   live mouth announcement; hearing none, it speaks anyway. Better one extra
   voice than zero. This probe exists ONLY on the no-Locks path — the normal
   path never waits, ever.

   KNOWN BOUNDARY, STATED PLAINLY
   ──────────────────────────────
   Web Locks and BroadcastChannel are scoped per origin PER BROWSER PROFILE.
   Two different browsers/profiles open on this origin would each elect their
   own mouth. Covering that requires a cross-profile owner registry on the
   server; it is deliberately NOT bolted on here, because doing it through the
   VSQ would conflate the producer and consumer layers, which is the exact
   confusion that produced tonight's wrong diagnosis.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.XenVoice) return;               // one instance per context

  var LOCK_NAME    = 'xen-voice-mouth';
  var CHANNEL_NAME = 'xen-voice-surface';
  var PRIMARY_PATH = '/vvsvei/';             // deterministic degraded-mode mouth
  var NO_LOCKS_PROBE_MS = 1200;              // degraded path only; never the normal path

  var SELF = (location.pathname || '/') + '#' + Math.random().toString(36).slice(2, 8);

  var isMouth   = false;   // do I own the one surface?
  var enabled   = false;   // has this view armed audio (eligible to own)?
  var release   = null;    // resolve() that drops the lock
  var haveLocks = !!(navigator.locks && navigator.locks.request);
  var degraded  = false;   // running without Web Locks
  var spoken    = Object.create(null);  // utterance-id dedup within THIS mouth

  // Mirrored state — what every view shows, mouth or not.
  var state = { owner: null, speaking: false, id: null, text: '', t: 0 };
  var stateSubs = [];
  var caps = Object.create(null);   // capabilities the owning agent provides

  var bc = null;
  try { bc = new BroadcastChannel(CHANNEL_NAME); } catch (_) { bc = null; }

  function log(m) {
    try { console.log('[xen-voice-surface] ' + SELF + ' ' + m); } catch (_) {}
  }

  function post(msg) {
    if (!bc) return;
    msg.from = SELF;
    try { bc.postMessage(msg); } catch (_) {}
  }

  function emitState() {
    for (var i = 0; i < stateSubs.length; i++) {
      try { stateSubs[i](state); } catch (_) {}
    }
  }

  function setState(next) {
    state = {
      owner:    next.owner    !== undefined ? next.owner    : state.owner,
      speaking: next.speaking !== undefined ? next.speaking : state.speaking,
      id:       next.id       !== undefined ? next.id       : state.id,
      text:     next.text     !== undefined ? next.text     : state.text,
      t: Date.now()
    };
    emitState();
  }

  if (bc) {
    bc.onmessage = function (e) {
      var d = e && e.data;
      if (!d || d.from === SELF) return;
      if (d.k === 'state') {
        // Another view IS the surface. Mirror it verbatim — same surface,
        // shown everywhere, so qi sees one voice visually too.
        setState({ owner: d.owner, speaking: d.speaking, id: d.id, text: d.text });
      } else if (d.k === 'who') {
        // A view just opened and is asking who holds the surface. Only the
        // mouth answers, so a new tab paints the live state immediately.
        if (isMouth) post({ k: 'state', owner: SELF, speaking: state.speaking, id: state.id, text: state.text });
      } else if (d.k === 'mouth-alive') {
        sawForeignMouth = true;
      } else if (d.k === 'act') {
        // Only the owning agent executes. Another view asked it to do
        // something; authority lives in exactly one place.
        if (isMouth && caps[d.cap]) { try { caps[d.cap](d.args); } catch (_) {} }
      }
    };
  }

  var sawForeignMouth = false;

  // ── ELECTION ──────────────────────────────────────────────────────────────
  function takeMouth() {
    isMouth = true;
    setState({ owner: SELF, speaking: false });
    post({ k: 'state', owner: SELF, speaking: false, id: null, text: '' });
    post({ k: 'mouth-alive', owner: SELF });
    log('IS THE MOUTH' + (degraded ? ' (degraded / no Web Locks)' : ''));
  }

  function requestLock() {
    if (!haveLocks) { degradedElect(); return; }
    try {
      navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, function () {
        takeMouth();
        // Hold forever. The lock drops when this context dies OR when
        // disable() resolves it — either way the browser hands it to the next
        // waiter in FIFO order. That is the whole takeover mechanism.
        return new Promise(function (res) { release = res; });
      }).catch(function (err) {
        log('lock request rejected (' + err + ') → degraded');
        degradedElect();
      });
      log('waiting for the surface (lock requested)');
    } catch (err) {
      log('lock threw (' + err + ') → degraded');
      degradedElect();
    }
  }

  // Fail OPEN: no Web Locks available. One deterministic mouth, never silence.
  function degradedElect() {
    degraded = true;
    if ((location.pathname || '').indexOf(PRIMARY_PATH) === 0) {
      takeMouth();                       // designated primary always speaks
      return;
    }
    sawForeignMouth = false;
    post({ k: 'who' });
    setTimeout(function () {
      if (!enabled || isMouth) return;
      if (!sawForeignMouth) {
        log('no live mouth heard in ' + NO_LOCKS_PROBE_MS + 'ms → speaking anyway (fail open)');
        takeMouth();
      }
    }, NO_LOCKS_PROBE_MS);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────
  var XenVoice = {
    id: SELF,

    /* Call once this view's audio is genuinely armed/unlocked. Only an armed
       view may own the surface — a muted mouth would make qi hear nothing
       while every component reported success. */
    enable: function () {
      if (enabled) return;
      enabled = true;
      log('armed → entering election');
      requestLock();
    },

    /* Muted, backgrounded for good, or torn down. Drops the surface so the
       next armed view takes it over immediately. */
    disable: function () {
      if (!enabled) return;
      enabled = false;
      if (isMouth) {
        isMouth = false;
        setState({ owner: null, speaking: false });
        post({ k: 'state', owner: null, speaking: false, id: null, text: '' });
        log('released the surface');
      }
      if (release) { try { release(); } catch (_) {} release = null; }
    },

    isMouth: function () { return isMouth; },
    owner:   function () { return state.owner; },
    getState:function () { return state; },

    /* THE GATE. Synchronous, no await, no queue — the ownership decision was
       made at arm time, long before this line existed. Returns true only for
       the one surface, and only once per utterance id.

       Losing views get `false` instantly and stay silent. They must still
       RENDER the text — this gates sound only. */
    claim: function (id, text) {
      if (!isMouth) return false;
      var key = String(id == null || id === '' ? ('t:' + text) : id);
      if (spoken[key]) return false;        // same utterance already spoken here
      spoken[key] = 1;
      // keep the dedup map small
      var keys = Object.keys(spoken);
      if (keys.length > 300) { for (var i = 0; i < 100; i++) delete spoken[keys[i]]; }
      return true;
    },

    /* Mouth reports playback so every other view mirrors the same surface. */
    began: function (id, text) {
      if (!isMouth) return;
      setState({ owner: SELF, speaking: true, id: id, text: text });
      post({ k: 'state', owner: SELF, speaking: true, id: id, text: text });
    },
    ended: function (id) {
      if (!isMouth) return;
      setState({ owner: SELF, speaking: false, id: id });
      post({ k: 'state', owner: SELF, speaking: false, id: id, text: state.text });
    },

    /* Mirror hook — every view can paint the one surface's live state. */
    onState: function (fn) {
      if (typeof fn === 'function') { stateSubs.push(fn); try { fn(state); } catch (_) {} }
    },

    /* ── SEED OF ACTION AUTHORITY ──────────────────────────────────────────
       qi 2026-08-13 22:17: "autonomous voice agent that owns the entire pwa and
       everything within it in real time."

       The owning context is an AGENT, not a speaker other code pushes into. The
       same context that holds the voice is the one that holds authority over the
       PWA. This is deliberately the same singleton and the same lock: two agents
       both claiming to own the PWA is a conflict, not redundancy — singularity
       is the point, not merely an anti-echo trick.

       The full agent is NOT built here (that would be scope creep). What is
       built is the shape: the owner registers capabilities, and any view can
       invoke one without caring where the owner lives. Today that carries
       voice; tomorrow it carries navigation, app launch, pane and state control
       with no change to the election, the mirror, or the takeover. Had the
       speaker been a passive leaf that anything could push audio to, that
       growth path would have been foreclosed — which is exactly why it isn't. */

    /* Owner registers something it can DO. */
    provide: function (cap, handler) {
      if (typeof handler === 'function') caps[cap] = handler;
    },

    /* Any view invokes a capability. Runs locally if this IS the owner;
       otherwise it is forwarded to the owner over the live channel — real
       time, event-driven, no polling gate. */
    act: function (cap, args) {
      if (isMouth) {
        if (caps[cap]) { try { return caps[cap](args); } catch (_) { return null; } }
        return null;
      }
      post({ k: 'act', cap: cap, args: args });
      return null;
    },

    /* NEGATIVE CONTROL. Disables single-surface enforcement so the original
       chorus reproduces on demand. Verification that only shows the good case
       proves nothing. */
    __disableArbitration: function () {
      isMouth = true;
      spoken = Object.create(null);
      log('ARBITRATION DISABLED — negative control, every view will speak');
    }
  };

  window.XenVoice = XenVoice;

  // A new view asks who holds the surface, so it paints live state at once.
  post({ k: 'who' });

  // Releasing on unload is belt-and-braces; the browser already drops the lock
  // when the context dies. Both paths land on the same FIFO handoff.
  window.addEventListener('pagehide', function () { XenVoice.disable(); });

  log('loaded (locks=' + haveLocks + ')');
})();
