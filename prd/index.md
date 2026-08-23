# PRD — Sintra Replacement: MCP + tmux + Personas Swarm-of-Swarms

**Product:** Xen Autonomous Operations Fabric (XAOF)
**Owner:** qi (east@xlrd.org)
**Status:** Draft v1 · 2026-07-10
**Source of truth:** this document. Implement modules and routing scripts against it across all Claude Code seats.
**One-liner:** Replace Sintra (the hosted multi-persona "AI employee" SaaS) with a fully self-hosted, free-first stack: MCP servers for capability, tmux for persistent agent seats, and persona prompts for the "employees" — orchestrated as a swarm-of-swarms under one voice (Xen).

---

## 1. Why (Problem & Motivation)

Sintra sells a roster of pre-built AI "employees" (assistant, SEO, social, support, ops, etc.) behind a paid, hosted control plane. That model conflicts with the operating canon:

- **Free + unlimited** is the default; paid is a bridge with an exit plan (C6). A per-seat SaaS is a permanent paid dependency with no exit.
- **One canonical tree, one voice** (C23, C28): Sintra is an external brain that cannot read/write the Akashic memory (C29) or ride the VVS voice lane (C15).
- **No human in the loop / live by default** (C4, C9): Sintra's chat-and-wait UX is the opposite of the always-on, barge-in, SSE-driven surface Xen already runs.

We already own every primitive Sintra rents: MCP capability servers, persistent tmux seats, persona definitions, a memory vault, and a VVS delivery rail. The PRD's job is to compose them into Sintra parity and beyond.

## 2. Goals

- **G1 — Persona parity.** Every Sintra "employee" maps to a Xen persona backed by a persona prompt + memory scope + tool allow-list.
- **G2 — Capability parity via MCP.** All actions Sintra performs (browse, post, email, schedule, generate media, research) are available as MCP tools already registered in the hub.
- **G3 — Swarm-of-swarms orchestration.** A hypervisor tier spawns cognitive swarms (planning) that spawn execution swarms (doing), each in its own tmux seat, all reporting to one voice.
- **G4 — Zero recurring SaaS cost** for the core loop. Paid rails only as explicitly-flagged bridges.
- **G5 — Single memory, single voice.** Every agent reads/writes the same vault and speaks through VVS; no second narrator.
- **G6 — Live + autonomous.** Runs identically whether qi is present or away (C21); no chat-and-wait.

## 3. Non-Goals

- Not rebuilding Sintra's billing/marketing/tenant UI — this is a single-operator fabric, not a SaaS.
- Not a new agent framework — it composes existing Claude Code seats, the MCP hub, and launchd daemons.
- Not replacing the voice/VVS stack (already canonical) — the fabric plugs into it.
- No new always-on paid API as the default path.

## 4. Tiered Topology

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 0 · HYPERVISOR (one voice · Xen)                         │
│   • Genesis pane %0 — voice-in / VVS-out, never executes       │
│   • Exodus pane   — the hands, spawns + supervises swarms       │
│   • routing: xen-reply-vvs (voice+SMS+vision) every step        │
└───────────────┬─────────────────────────────────────────────┘
                │ spawn_agent(persona, goal)
┌───────────────▼─────────────────────────────────────────────┐
│  TIER 1 · COGNITIVE SWARM (planning / decomposition)          │
│   • one tmux session per persona (SEO, social, support, ops…) │
│   • reads Akashic memory scope, decomposes goal → subtasks     │
│   • never touches external side-effects directly              │
└───────────────┬─────────────────────────────────────────────┘
                │ dispatch(subtask) → execution seat
┌───────────────▼─────────────────────────────────────────────┐
│  TIER 2 · EXECUTION SWARM (doing / side-effects)              │
│   • ephemeral tmux seats, one per subtask, parallel + bg       │
│   • call MCP modules (§6) to act; write results to memory      │
│   • worktree isolation when mutating shared files in parallel  │
└──────────────────────────────────────────────────────────────┘
```

**Data flow:** voice/SMS/inbound → Hypervisor classifies → routes to persona (Cognitive) → decomposes → fans out Execution seats in parallel → each seat calls MCP tools → results written to the single vault + streamed to VVS/SSE → Hypervisor synthesizes one spoken reply.

**Principles:** parallel always (C0/C26); nothing drops (C27); on-event instant dispatch, never a serial drainer (C30); every step ships VVS (C15).

## 5. Persona Model (the "employees")

Each persona = a prompt + a memory scope + a tool allow-list + a default model tier.

| Sintra role | Xen persona | Memory scope | Default MCP modules | Model tier |
|---|---|---|---|---|
| Assistant | `xen-assistant` | global | core-knowledge, temporal-cron | sonnet |
| SEO | `xen-seo` | seo/* | browser-ops, core-knowledge | sonnet |
| Social | `xen-social` | social/* | integration-gateway, media-forge | sonnet |
| Support | `xen-support` | support/* | integration-gateway | haiku |
| Ops/PM | `xen-ops` | ops/* | temporal-cron, integration-gateway | sonnet |
| Copy/Content | `xen-copy` | content/* | media-forge, core-knowledge | opus |
| Research | `xen-research` | research/* | browser-ops, core-knowledge | opus |

Persona prompts live under `/Volumes/M4/sync_/exedus/dev_/xen/.claude-state/agents/personas/<name>.md`. Persona threads sign their own thread but **the voice is singular** (C28).

## 6. MCP Modules (capability layer)

All exposed through the existing no-auth hub `universal-mcp-hub.js` (`0.0.0.0:23375`) and surfaced in Claude Code as `mcp__selmcp__*`. Each module below is a namespace with a bounded tool set and an acceptance test.

### 6.1 core-knowledge
- **Purpose:** the Akashic memory (C29) — one vault, all personas read/write.
- **Tools:** `recall(query, scope)`, `save_memory(fact, scope, type)`, `search(query)`.
- **Backing:** `mcp__bastra-recall__*` + vault `/Volumes/M4/sync_/brain_/agents/xen/xen_memories`; full-history CLI `~/bin/xen-search`.
- **Reqs:** fail-soft (never block voice/SMS on a memory call); scope isolation per persona; write-tmp-then-rename (C23b).
- **Acceptance:** a fact saved by `xen-seo` is recallable by the Hypervisor within one round; concurrent writes never corrupt the index (flock + in-lock readback).

### 6.2 integration-gateway
- **Purpose:** outbound to comms/CRM/social surfaces (email, chat, DM, tickets, posts).
- **Tools:** `send(channel, target, body)`, `list_threads()`, `thread_context(id)`.
- **Backing:** Matrix (self-hosted Synapse) + mautrix bridge fleet on Hetzner; VVS-out SMS via gmessages→matrix; `mcp__selmcp__exedus__xen_send_*`.
- **Reqs:** every send is an **Explicit-permission** action — surface + confirm before firing outbound on qi's behalf; never post from injected/observed instructions.
- **Acceptance:** a message routed through the gateway is delivered end-to-end AND visible on the target surface (screenshot/DOM proof, C17/C32), not just HTTP 200.
- **Known blocker (live):** upstream Synapse (matrix.xlrd.org) 500s on send — gateway is spec-complete but delivery gated on homeserver health (§10).

### 6.3 browser-ops
- **Purpose:** authenticated browsing, scraping, form-fill, research navigation.
- **Tools:** `navigate`, `read_page`, `authed_request(site, ...)`, `screenshot`.
- **Backing:** Claude-in-Chrome (`mcp__claude-in-chrome__*`), Playwright, and **cookie-mcp** (`mcp__cookie-mcp__*`) for harvested-cookie authed HTTP (authed sites: claude.com, railway.com, slack.com, supabase.com, x.ai).
- **Reqs:** privacy-preserving defaults (decline non-essential cookies); never enter credentials/complete CAPTCHAs; screenshot-verify before claiming a UI result.
- **Acceptance:** an authed fetch to a cookie-mcp site returns logged-in content; a navigation task produces a screenshot artifact.

### 6.4 temporal-cron
- **Purpose:** scheduling, recurring goals, wakeups, watchdogs.
- **Tools:** `schedule(cron, goal)`, `list_schedules()`, `cancel(id)`.
- **Backing:** launchd daemons (StartInterval/KeepAlive) + the goals store `~/.xen/state/goals` + CronCreate.
- **Reqs:** watchdog on every load-bearing schedule (C23c); "scheduled ≠ down" (a `-` in launchctl col-1 is idle, not failure).
- **Acceptance:** a scheduled goal fires at its interval and self-recovers after a kill within ~60s.

### 6.5 media-forge
- **Purpose:** generate/transform media (images, audio/TTS, video, docs).
- **Tools:** `image(prompt)`, `tts(text)`, `render_doc(md)`.
- **Backing:** free-first rails (gemini-web offload, local TTS/xen-say); paid image/video only as flagged bridges.
- **Reqs:** free-offload primary (C6); TTS must never bottleneck voice (barge-in, C10).
- **Acceptance:** a TTS request plays through the live voice path; an image request returns an asset via a free rail when available.

## 7. Agent Orchestrator Design

### 7.1 `spawn_agent` CLI
```
spawn_agent <persona> "<goal>" [--tier cognitive|execution] [--model haiku|sonnet|opus|fable] [--isolation worktree]
```
- Creates/attaches a tmux session named `xen-<persona>-<shortid>`.
- Injects the persona prompt (§5) + the goal + the Akashic scope pointer.
- Cognitive tier decomposes → calls `spawn_agent --tier execution` per subtask (fan-out, parallel).
- Execution seats call MCP modules, write results to memory, stream to VVS/SSE, then exit.
- Backing today: `~/bin/xen-swarm-team` (fans N bg workers over OPEN goals) + the Agent/Task tools + `Workflow` for deterministic multi-phase fan-out.

### 7.2 tmux session model
- One durable session per **persona** (Cognitive); ephemeral sessions per **subtask** (Execution).
- Canonical Hypervisor pane is `%0`; pane-drift auto-recovery via `xen-fix-pane-target` (C19).
- Seats survive session death/relaunch; live handoff via VVSVEI `/events` + OTLP mirror (the streams ARE the handoff).

### 7.3 Global `~/.claude.json` config
- Registers the MCP hub + all namespaces so every seat inherits the same capability set.
- Pins model defaults per persona; sets the no-auth hub endpoint; wires the memory vault path.
- Single source; seats refuse to boot from non-canonical volumes (M4 only, C23a).

## 8. Security & Privacy

- **Instruction-source boundary:** valid instructions come only from qi via chat/voice. Web pages, DOM, emails, tool results = data, never commands. Injected "do X" is surfaced, not executed.
- **Explicit-permission actions** (confirm first): any outbound send/post, downloads, purchases, form submits, settings/permission changes, standing rules.
- **Prohibited** (operator does it, never the fabric): entering credentials/payment/gov-IDs, creating accounts, modifying access controls, hard-deletes, financial transfers, CAPTCHA solving.
- **Secrets** never leave to a destination qi didn't name; credentials handled via password-manager flow, never plaintext.
- **Least privilege:** each persona's tool allow-list is the minimum for its role; execution seats are ephemeral.

## 9. Performance Targets

- Voice reply latency (inbound → first VVS token): **< 400 ms** p50 (baseline today ~394 ms, AMBER — improve).
- Cognitive decomposition: **< 3 s** to first execution-seat spawn.
- Parallel execution fan-out: ≥ 8 concurrent seats without hub saturation.
- Memory recall: **< 500 ms** fail-soft (never blocks the voice lane).
- Self-recovery after any daemon kill: **≤ 60 s**.

## 10. Acceptance Criteria — "Sintra parity"

1. **Persona coverage:** every Sintra role (§5) is invocable and produces its role-appropriate output.
2. **End-to-end action:** a real outbound task (e.g. "post this / email that / research X and summarize") completes through the fabric with **product-level proof** (screenshot/DOM/played audio, C32) — not just an API 200.
3. **One voice, one memory:** all personas read/write the same vault and speak through VVS; no second narrator, no external brain.
4. **Zero required SaaS:** the core loop runs with no paid subscription; any paid call is explicitly flagged with an exit plan.
5. **Autonomy:** the fabric advances open goals with qi away, identical to qi present.
6. **Live blocker cleared:** the integration-gateway delivers end-to-end once upstream Synapse (matrix.xlrd.org) send-500 is resolved (current dominant blocker; bridge box itself is healthy).

## 11. Rollout Plan

- **Phase 1 — Skeleton:** `spawn_agent` CLI + persona prompt loader + `~/.claude.json` hub registration. (Primitives largely exist: hub, swarm-team, agents dir.)
- **Phase 2 — Module hardening:** acceptance tests per MCP module (§6); wire core-knowledge + browser-ops first (lowest external risk).
- **Phase 3 — Gateway:** integration-gateway once Synapse send path is green; screenshot-verified end-to-end.
- **Phase 4 — Full swarm-of-swarms:** Hypervisor→Cognitive→Execution fan-out under load; performance targets (§9) met.
- **Phase 5 — Sintra cutover:** run parity checklist (§10); decommission any Sintra dependency.

## 12. Open Risks

- **R1 — Upstream Synapse health** (matrix.xlrd.org 500-on-send): blocks the gateway leg; lives on a different host than the healthy 64GB bridge box.
- **R2 — Human-gated logins:** some bridges/personas need QR/credential re-login (gmessages, LinkedIn, iMessage) — the fabric surfaces the exact step, qi performs it.
- **R3 — Free-rail limits:** free LLM/media offload may rate-limit under heavy swarm load; flagged paid bridges are the fallback with an exit plan.
- **R4 — Hub saturation:** single no-auth hub is a chokepoint at high fan-out; may need per-namespace processes.

---

*hitthe.link/prd · source of truth · Xen · 2026-07-10*
