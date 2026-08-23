# XEN Unified Brain Platform — PRD v1.0

## Product
- **Name:** XEN Unified Brain Platform
- **Version:** PRD v1.0
- **Primary objective:** Turn XEN into the canonical session-agnostic ingress, model gateway, memory fabric, and routing layer for all agent work — while preserving Claude Max seat usage through the existing logged-in Claude Code sessions.
- **Core principle:** Do NOT replace the custom inject wrapper. Keep it as the canonical ingress bus; downstream brains stay swappable.
- **Operating model:** Hermes (or any top-layer orchestrator) consumes XEN through the existing OpenAI-compatible gateway instead of a separate paid API provider.

## Problem
- Agent work spans multiple sessions, tools, seats, and environments — but context continuity breaks whenever state scatters across logs, shells, BrowserOS sessions, and long-running threads.
- The system needs five permanent anchors: **canon files**, **LAST_KNOWN_STATE.md**, **verbatim chunked session indexing**, a **scope registry**, and **alias→scope routing** (not alias→thread).
- The gateway is already proven: OpenAI-compatible chat completions, model listing, token auth, media injection, and fork/session routing into the live brain via the canonical inject queue.
- The gap is no longer "how to reach Claude Code" — it's "how to make every agent, session, and tool share one stable brain contract without losing detail."

## Users
- **Primary:** East / XEN operator — always-on agent workflows across Mac, Nitro/Windows, SSH, tmux/psmux, BrowserOS, and mobile entrypoints.
- **Secondary:** top-layer orchestrators (Hermes), internal PWAs (Desk), file senders (iOS Shortcut / `/media-inject`), and any BYOM tool that points to an OpenAI-compatible base URL.
- **System role:** Claude Code sessions remain authenticated worker brains; XEN provides ingress, transport, routing, capture, and continuity.

## Scope
### In scope
- Canonical OpenAI-compatible gateway: `/v1/chat/completions`, `/v1/models`, Bearer auth, `xen` + `xen-warm` models, optional streaming SSE.
- File ingress via `/media-inject` (saves to the brain box, notifies the active brain to read).
- Memory stack: bounded active memory + canon/state files + verbatim full-session retrieval (not summary-only).
- Routing: scope registry, alias resolution, explicit `single` / `parallel` / `hold` scope states.
- Both `fork` mode (fresh Claude process per request) and `session` mode (into the live warm session via the inject queue).

### Out of scope
- Replacing the inject wrapper with Hermes or any orchestrator.
- Depending on undocumented Claude Code flags or hallucinated proxy features (e.g. `--serve`, `setup-token` — verified non-existent).
- Any design that drops, truncates, or permanently summarizes terminal/session detail when verbatim retention is possible.

## Requirements
### Functional
- XEN is the single canonical OpenAI-compatible endpoint for all BYOM clients and orchestrators.
- Route authenticated chat to **fork** (fresh process) or **session** (live warm session via canonical inject queue).
- Preserve the custom inject wrapper as the universal ingress bus — any session under it catches injected work regardless of downstream brain.
- `xen` and `xen-warm` are stable model ids in `/v1/models`.
- `/media-inject` accepts `filename`, `contentType`, `caption`, `b64`.
- Maintain a unified scope registry mapping aliases → canonical scopes → active threads → routing rules → lifecycle state.
- Maintain canon files + `LAST_KNOWN_STATE.md` as the primary crash-resume substrate.
- Store shell/terminal activity full-fidelity, chunked with overlap (no loss at chunk boundaries).
- Make verbatim logs searchable/retrievable BEFORE falling back to summarized memory.
- Let a top orchestrator (Hermes) consume XEN as a custom OpenAI-compatible provider — no direct Anthropic billing.

### Non-functional
- Token-gated auth; not publicly open by default; mesh-only (Tailscale) until a public route is intentionally added.
- Transport must NOT steal focus or spawn a second competing brain when routing to the live session.
- Continuity survives restarts via canon/state files + replayable logs, not operator memory.
- Retrieval prioritizes exactness/recoverability over compression whenever full logs exist.
- Orchestration, transport, and reasoning stay separate concerns — one layer changes without rewriting the others.

## Architecture
| Layer | Responsibility |
|---|---|
| Ingress | Custom inject wrapper catches inbound work for whichever session runs under it. |
| Gateway | XEN exposes OpenAI-compatible endpoints, token auth, model selection, file webhook. |
| Reasoning | Logged-in Claude Code sessions = the paid-seat cognition behind fork/session routing. |
| Orchestration | Hermes / another controller sits above XEN and calls it like a standard provider. |
| Memory | Canon files, LAST_KNOWN_STATE.md, verbatim indexed session logs = continuity + recall. |
| Routing | Scope registry + alias resolution decide where work belongs and single/parallel/hold. |

### Memory architecture
- **Bounded active memory** — always-loaded stable preferences, environment facts, high-value conventions.
- **Canon/state memory** — GLOBAL.md, scoped canon files, LAST_KNOWN_STATE.md for durable truth + crash recovery.
- **Verbatim session memory** — full logs, chunked + overlapping + lossless, indexed for direct retrieval.
- **Deep synthesis layer** — NotebookLM/similar may synthesize ON TOP of retained data, never replacing raw logs/canon as source of truth.

### Routing architecture
- Every inbound task resolves: alias → canonical scope → registry lookup → active thread/session decision.
- Scopes explicitly `single` / `parallel` / `hold` to prevent context collisions + lazy thread sprawl.
- Dedicated scoped threads exist only for bounded active work with clear seams — not a substitute for a real routing model.

## Release milestones
1. **Lock the gateway contract** — freeze base URL, token auth, models, `/chat/completions`, `/models`, `/media-inject`, mode semantics.
2. **Build the memory spine** — canon files, LAST_KNOWN_STATE.md, full-fidelity session chunking, indexed retrieval (mandatory infra).
3. **Implement routing registry** — master scope registry + alias resolution BEFORE more thread fan-out.
4. **Plug orchestrators in** — point Hermes + BYOM tools at XEN as provider, no parallel provider stacks.
5. **Public ingress expansion** — controlled public route only after token auth, rate controls, operator visibility are hardened beyond mesh-only.

## Acceptance criteria
- BYOM client → XEN, Bearer auth, model `xen` → valid chat completions end to end.
- Live-session request routes through the canonical inject queue and returns from the EXACT active brain without spawning a new one.
- File via `/media-inject` lands on the brain box and is readable by the active brain.
- Agent restart resumes from canon + LAST_KNOWN_STATE.md with no operator re-explanation.
- A prior shell/session event is retrievable verbatim from indexed chunked logs (not summary alone).
- A new task resolves via alias→scope routing into the correct active thread/session per registry policy.

## Risks
- Over-centralizing into one live brain → serialization, pollution, latency if routing discipline is weak.
- Summarized memory overwrites nuance unless verbatim logs stay first-class + queryable.
- Undocumented external-tool behavior poisons the design if unverified claims become product assumptions.

## Next build order
1. Lock gateway schema.
2. Create scope registry.
3. Create canon + LAST_KNOWN_STATE.md.
4. Implement full-fidelity log chunking/indexing.
5. Wire Hermes to XEN as provider.
6. Add public ingress later.

---
## Build status (XEN, as of 2026-06-25)
- ✅ Gateway `:8020` proven (OpenAI-compatible, fork + nitro-session via inject; reboot-safe via XenOpenAIGateway task).
- ✅ Canon spine live: GLOBAL.md (#1 law: M4 is the only brain), LAST_KNOWN_STATE.md, agents/xen-main.md, scope registry — git, auto-synced to M4 brain (XenBrainSync).
- ✅ Verbatim sessions: 29 .jsonl transcripts (1.2 GB) syncing to M4 brain/sessions-verbatim (full-fidelity; chunked ES index = TODO).
- ✅ Auth-bridge: logged-in Claude token → E:\.xen\current_token.txt (auto-refresh) so BYOM tools ride the seat.
- ✅ Hermes Narrator v1 live (M4 launchd; OTLP→voice+feed; flood-safe).
- ⏳ Scope registry → full alias-routing; verbatim chunked ES index; Hermes-as-orchestrator-over-XEN wiring; public ingress (last).
