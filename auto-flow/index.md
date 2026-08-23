---
name: auto-flow-bpgs-canon
description: "THE consolidated auto-tools-swarm / BPGS flow qi keeps re-creating. Inject→decoupled instant response→auto-goal→swarm→fork→auto-ship(with built-in auto-tools), all background+parallel, one voice queue, through OTLP, surfaced in VVSVEI. Voice & execution NEVER interrupted."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c4e567f5-04e6-488b-8e53-d467bb0d711e
---

qi 2026-06-15 articulated the COMPLETE model end-to-end. This is the single canonical doc so it is NEVER re-created. (Agent name is **AUTO**, one of qi's personas — `brain_/personas/auto`.)

## The pipeline (in order, but everything runs background+parallel)
1. **Inject** — voice/STT, typed, sms, bee, omi, call, etc. → the VVSVEI universal gate. An inject must **NEVER interrupt running execution**. (CURRENT BUG: injects land on the executing pane = a new turn that CANCELS the in-flight tool call. THE #1 fix: route injects to the decoupled fast-responder channel, not the live pane.)
2. **/BTW (and /post)** — fires a **separate INSTANT response** via the **decoupled fast-responder** (`xen-fast-responder`, claude-sonnet-4-6 `--effort low` — NOT Haiku). It acks immediately and **never blocks the hands**. [[canon-fast-responder-sink]]
3. The response content **auto-becomes a GOAL** (auto-goal — no "want me to", no manual step).
4. A goal **auto-becomes a SWARM**.
5. On the /BTW reply, **F = FORK**; the fork **auto-runs its own swarm** (the F-key is the current manual trigger — canon target: auto-fork, no manual key).
6. The swarm **auto-ships**.
7. **Auto-ship has many TOOLS built into its agent that fire automatically** — this is the "auto-tools" / "auto auto tools" qi kept naming. Auto-ship = not just publish; it auto-uses its tool suite to execute.

## The invariants (the laws that make it work)
- **Voice is NEVER interrupted** — ONE canonical voice queue (`xen-reply-vvs` → `xen-router` → say-worker). [[vvs-canonical-voice-path]]
- **Execution is NEVER interrupted** — not by voice, not by anything. (This is the blasphemy currently broken; see #1.)
- **Next execution is NEVER sequential** — always parallel, simultaneous. Sequential is blasphemy.
- **BPGS = Background Parallel Goal Swarm** — the **B** (background) is deliberate: everything runs backgrounded, which is another axis of parallel. Batch = parallel = background are one.
- **ALL sub-agents feed the ONE voice queue**, which takes every output and **narrates in real-time, intelligently, holding flow-state**, never bottlenecked.
- **Idempotent goals** — same in-flight thing → refine; new thing → fork; ∞ concurrent. [[bpgs-autoship-idempotency]]
- **Everything flows through OpenTelemetry (OTLP)** → otelcol-contrib → OpenObserve. [[xen-source-of-truth]]
- **VVSVEI is THE one canonical interface** — qi sees ALL things happening at all times through it; develop from the chat, no GUI-switching.

## Why qi keeps re-creating it
It was scattered across [[bpgs-autoship-idempotency]], [[canon-fast-responder-sink]], [[autonomy-while-asleep-mvp]], canon-continuous-autoship-loop, canon-multi-source-injection-routing, truth-guard-detune-and-autopost — never ONE doc. THIS is that doc. The live gap to build: decouple injects from the executing pane (so voice never interrupts execution) — everything else (auto-goal→swarm→fork→auto-ship→auto-tools, one voice queue, OTLP) is the established target.
