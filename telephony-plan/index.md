# 24/7 Dial-In + Dial-Out — settle plan (canonical-voice attached)
_2026-06-15. Goal: always-on inbound (~44.4k min/mo flat) + outbound, both speaking/hearing through qi's ONE canonical voice (xen-reply-vvs via the unified queue router `xen-router`). D.I.E.-compliant: Telnyx+FreeSWITCH, NOT Twilio-direct/Phound._

## Target path (PSTN ⇄ canonical voice)
```
PSTN caller ──► Telnyx DID (Channel Billing = flat unlimited inbound)
            ──► SIP trunk ──► FreeSWITCH (dialplan: route to the agent)
            ──► LiveKit SIP gateway ──► voice-agent (Railway project xen-livekit-voice)
            ──► STT  ─┐
                      ├─► omnimind /api/dictate-inject  (tag: call:)  → VEI → TUI/brain
            TTS ◄─────┘  ◄── xen-reply-vvs reply ──► xen-router (ONE queue) ──► same canonical voice
Dial-OUT: omnimind → Telnyx /calls (or FS originate) → callee; agent speaks via the SAME canonical voice.
```
The caller hears the canonical Xen voice; qi's outbound uses it too. Tag `call:` already exists in the taxonomy → no new gate.

## CURRENT (verified)
- Railway `xen-livekit-voice`: livekit-server + voice-agent + web-frontend + Redis live (transport up). voice-agent needs a non-metered STT/TTS (OpenAI-Realtime is D.I.E.-banned).
- FreeSWITCH: NOT deployed. Telnyx: NO account/key on the box. Live rails today: Beside 9934, GV 2217, Phound room 2142 (D.I.E.-listed, audio-bridge incomplete).
- Canonical voice: xen-reply-vvs + xen-router (unified queue) — STABLE.

## GATED — needs qi (cannot do autonomously; no creds, involves spend)
1. **Telnyx API key** → `xen-secret set telnyx_api_key <key>` (then I provision via API, no further taps).
2. **Spend approval:** buy 1 DID (~$1/mo) + enable **Channel Billing** for flat unlimited inbound (≈ per-channel/mo; sized to ~44.4k min). Outbound stays metered (kept low).

## I CAN do now (no key, no spend) — pre-staged so it's one-shot on unblock
- FreeSWITCH dialplan + SIP-trunk profile templates (Telnyx IP-auth, codecs PCMU/OPUS) → route inbound to LiveKit SIP.
- LiveKit SIP gateway/dispatch config to land calls on the voice-agent.
- voice-agent wired to the canonical-voice path (STT→/api/dictate-inject tag `call:`; replies via xen-reply-vvs→xen-router) instead of a separate voice.
- Swap voice-agent STT/TTS off banned OpenAI-Realtime to a D.I.E.-compliant engine.
- Decide host: FreeSWITCH as a Railway service (in the existing project) vs a Tailscale daemon on M4/nitro.

## Interim (today, no spend)
- Phound room 678-345-2142 already held 24/7 by the keeper daemon = inbound presence NOW — but Phound is D.I.E.-listed and two-way audio needs the CoreAudio loopback wired (qi sudo/mic touch). Not the target; bridge only if qi wants a stopgap.

## One-line ask
Drop the Telnyx key in the broker + say "yes" to the DID+channel spend, and I provision + wire the whole path to your canonical voice in one pass.
