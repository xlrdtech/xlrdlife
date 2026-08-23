# XEN Real-Time Fabric — Architecture

> Single-seat, race-safe, cross-timeline. One brain, many hands, one durable truth.
> Generated 2026-07-22. This document is the reference; the running system is the referee.

---

## 0. The invariant

**There is exactly one live context.** Every inbound signal — voice, SMS, a pasted URL, an agent hand-off — is *promoted into that one live session*. It is never allowed to spawn a competing session, pane, queue item, or context. Duplication is the regression; single-seat is the cure.

---

## 1. VVSVEI `/btw` promotion loop

`/btw` = "by the way." It is the promotion verb of the fabric.

```
inbound (voice / SMS / URL / hand-off)
        │
        ▼
   /btw promote  ──►  existing authenticated TUI webhook
        │
        ▼
   the ONE live TUI session   (no new session, pane, queue item, or context)
        │
        ▼
   reply streams back on the same seat
```

**Rules**
- Route through the **existing** authenticated webhook — never mint a new endpoint.
- Confirm the **target session** first, then inject, then wait for that session's own response.
- If a seat already holds the context, `/btw` reaches *that* seat. It does not fork one.

Why it exists: when hands run heavy background work, naive injection stacks inputs behind that work and they arrive late. `/btw` promotes the utterance into the live seat as a first-class turn instead of a queued item behind the backlog.

---

## 2. Race-safe copy → paste → enter injection state machine

Injecting into a live terminal seat is a race unless it is a machine. It is a machine:

```
 idle ─► claim-lock ─► paste ─► settle ─► enter ─► confirm ─► release ─► idle
   ▲                                                                   │
   └───────────────────────────────────────────────────────────────────┘
```

| State | Guarantee |
|-------|-----------|
| **claim-lock** | single-flight lock; only one inject owns the seat at a time |
| **paste** | payload written to the input, not yet submitted |
| **settle** | brief settle delay so the UI registers the paste before Enter |
| **enter** | submit exactly once |
| **confirm** | verify the turn was accepted (no lost/duplicated submit) |
| **release** | lock freed; next inject may claim |

**Race guards:** no overlapping injects (the lock), no premature Enter (the settle), no double-submit (confirm-before-release). This is what stops the "stuck in the queue / arrived twice / arrived late" failure mode.

---

## 3. Persistent cross-seat shared context

One brain across all seats and timelines.

- Every seat **reads and writes the same context store**.
- A seat dying (crash, relaunch, reboot) loses nothing — the reborn seat rehydrates from the shared context.
- Past = total recall, present = live omniscience, future = anticipation. The context is the continuity.

The live streams **are** the hand-off: a reborn brain pulls the current state from the event spine rather than from a frozen snapshot file.

---

## 4. Event spine — WSS / NATS / JetStream

```
   commands ──► gateway ──► persist to JetStream (durable, append-only)
                                   │  (ack on persist)
                                   ▼
                        ┌──────────┴───────────┐
                        ▼                      ▼
                  read-model projections   WSS fan-out
                  (browsers, agents,       (live clients reconnect
                   canon, summaries)        with a stored cursor)
```

- **NATS JetStream** is the durable, append-only **source of truth** for all execution events.
- Everything else — browsers, agent-sessions, canon pages, WSS clients — is a **projection / read-model**, never a competing source of truth.
- **CQRS:** command → persist → execute. The gateway returns `accepted` as soon as JetStream persists; durable work never runs directly on a raw WSS message.
- **No content lost on restart:** a cloud seat, phone, remote host, or browser that drops reconnects with its **stored JetStream cursor** and replays the delta.
- Subjects are **routing keys**, not a database. Canon is a **projection**, never a hand-maintained rival.

---

## 5. Opt-in local HTTP observation

For the reborn brain and for debugging, the live stream is observable **locally, opt-in**:

- Loopback HTTP / SSE on the **owning host only** — not public.
- It is a *view* of the fabric, never a second write path.
- Off by default; enabled deliberately per host.

---

## 6. One-line summary

> Inbound → `/btw` promotes it into the one live seat via the existing webhook → a race-safe state machine injects it exactly once → the turn and its result land in the shared cross-seat context → every execution event is durably logged to JetStream, and every surface is a projection of that log.
