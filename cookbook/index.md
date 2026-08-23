# XLRD TUI / AUA Inject Cookbook
> Reference for agents searching how to tap into qi's AUA at `tui.xlrd.org` (Windows) and `xen.xlrd.org` (Mac).
> Open, no-auth, public. Source: `E:\Exedus\Exedus\xen\tui-url-server.js`.

---

## Quick search glossary
`AUA` = Agentic URL · `inject` = drop text into qi's pane · `peer` = vessel-to-vessel mesh · `await` = godmode async polling · `narrate` = TTS via Ava daemon.

---

## Vessels

| Host | Role | Inbound endpoint |
|---|---|---|
| `tui.xlrd.org` | ezekiel-win (Windows) | `/peer` (no auth) |
| `xen.xlrd.org` | xen-mac (Mac) | `/api/inject` (X-Xen-Token) |

Tailscale underlay: Mac `100.97.145.50`, Win `100.80.76.79`.

---

## Recipe 1 — health probe

```
GET https://tui.xlrd.org/health
GET https://xen.xlrd.org/health
```

Returns JSON: `{ok, agent, version, port, ...}`. Use for liveness check before any other call.

---

## Recipe 2 — inject text into qi's Claude pane (Windows)

```
GET https://tui.xlrd.org/tui?q=<text>
```
or
```
POST https://tui.xlrd.org/tui
Content-Type: application/json
{"q":"<text>"}
```

Text appends to `~/.xen/inject-queue.txt`. The `inject-queue-daemon.ps1` (interactive PS) tails the file and types into the WindowsTerminal pane titled "Claude Code".

Returns: `{ok:true, via:"socket"|"tmux"|"windows-pane", chars}`.

---

## Recipe 3 — godmode async loop (Siri / browser pattern)

```
GET https://tui.xlrd.org/tui?q=<text>&await=1
```
Returns `{ok:true, request_id:"req_..."}`. Then long-poll:
```
GET https://tui.xlrd.org/await/<request_id>
```
Returns the assistant's reply when ready, or `{pending:true}` if still working.

---

## Recipe 4 — Ollama models (local, no auth, no key)

| Alias | Model |
|---|---|
| `/qwen` | `qwen3:0.6b` (fast) |
| `/qwen-coder` | `qwen3-coder:30b` |
| `/hermes` | `hermes3:8b` |
| `/deepseek` | `deepseek-r1:8b` |
| `/ask` | defaults to qwen |

```
GET https://tui.xlrd.org/qwen?q=<text>
```
Returns `{ok, model, text, chars, ms}` or HTML if `Accept: text/html`. Streams sentence-by-sentence to TTS via narrate-queue.

---

## Recipe 5 — Gemini (Google direct API)

| Alias | Model |
|---|---|
| `/gemini` | `gemini-2.5-flash` (default) |
| `/gemini-flash` | `gemini-2.5-flash` |
| `/gemini-pro` | `gemini-2.5-pro` |
| `/gemini-2` | `gemini-2.0-flash` |

```
GET https://tui.xlrd.org/gemini?q=<text>
```
Requires `GEMINI_API_KEY` in `~/.xen/secrets.env`. Returns same shape as Ollama recipes.

---

## Recipe 6 — peer-vessel mesh

Win inbound (post here to land in Win pane):
```
POST https://tui.xlrd.org/peer
Content-Type: application/json
{"from":"<your-name>","text":"<message>"}
```

Mac inbound (requires token):
```
POST https://xen.xlrd.org/api/inject
Content-Type: application/json
X-Xen-Token: <XEN_API_TOKEN>
{"role":"<role>","text":"<message>"}
```

Untagged messages = qi. Tag with `[FROM <vessel>]` or `[XEN-MAC]` / `[EZEKIEL]` for vessel-to-vessel.

---

## Recipe 7 — file upload (drop a file qi can pick up)

```
POST https://tui.xlrd.org/file
Content-Type: multipart/form-data
file=<binary>
name=<filename>
```
Saves to `~/.xen/uploads/`. Append `?silent=1` to skip auto-inject.

Fetch back:
```
GET https://tui.xlrd.org/file?name=<filename>
```

---

## Recipe 8 — share named text snippet

```
POST https://tui.xlrd.org/share
Content-Type: application/json
{"name":"<slug>","body":"<content>"}
```
Then:
```
GET https://tui.xlrd.org/share/<slug>
```

---

## Recipe 9 — narrate via TTS (Ava daemon)

Direct: append to `~/.xen/narrate-queue.txt`.
Indirect via AUA: any reply from /tui /qwen /gemini auto-narrates sentence-by-sentence. To force-narrate arbitrary text without a model call, use:
```
POST https://tui.xlrd.org/peer
{"from":"narrate","text":"<text to speak>"}
```
(falls into inject queue → narrator picks up).

---

## Recipe 10 — UI-TARS vision (when up)

```
POST https://uitars.xlrd.org/vision/analyze
Content-Type: application/json
{"image_b64":"<base64>","prompt":"<task>"}
```
Returns coordinates / action plan from UI-TARS-2B-SFT on RTX 3060.
Also `/vision/click` for click-target only.

Note: UI-TARS process can drop — check `/health` first.

---

## Recipe 11 — devices roster

```
GET https://tui.xlrd.org/devices
POST https://tui.xlrd.org/devices/register  {"name":"...","host":"..."}
DELETE via /devices/unregister  {"name":"..."}
```

---

## Recipe 12 — endpoint discovery (this cookbook is also at)

```
GET https://tui.xlrd.org/endpoints
```
Returns the canonical machine-readable endpoint list.

---

## Authentication posture

- All public AUA endpoints are **noauth by default** per qi's canon.
- Optional bearer: set `XEN_TUI_KEY` env var; if present, pass as `?key=` or `Authorization: Bearer <key>`.
- Mac `/api/inject` requires `X-Xen-Token` (the only auth-gated route).

---

## Discovery hints for agent search

Keywords agents will grep for: `inject`, `pane`, `tui`, `aua`, `xen.xlrd.org`, `tui.xlrd.org`, `peer`, `await`, `godmode`, `narrate`, `qwen`, `gemini`, `hermes`, `deepseek`, `uitars`, `vision`, `share`, `file`, `Possession`, `Siri`, `xen-reply-vvs`.

Map: voice-in → `/stt` page or Siri Possession → `/tui?await=1` → `/await/<id>` → narrate.

---

## qi's framework references

- VVS = Voice + Vision + SMS (response shape)
- VEI = Voice → Escalate → Inject (action shape)
- BPGS = Background ParallelGoalSwarm
- L7S = Luckie's 7 Systems
- 7 C's = Credit · Cashflow · Crypto · Corp/CEO · Capital · Coverage+Counsel · Currency

---

_Cookbook v0.1 · 2026-05-20 · local at `C:\Users\selfe\.xen\uploads\cookbook\aua-inject-cookbook.md` · not deployed to mono repo per SCAD canon — awaiting qi approval._
