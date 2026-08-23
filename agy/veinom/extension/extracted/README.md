# AGY VENOM · RUACH

**Voice-first universal web-chat wrapper.**
Every AI chat becomes hands-free. Every conversation also flows into `tui.xlrd.org/tui` for automanifestation.

---

## What it does

When loaded on a supported chat site (ChatGPT, Claude, Perplexity, Grok, Gemini, AI Studio, Mistral, DeepSeek, You.com, Copilot, HF Chat):

1. **Listens** for your voice (Chrome Speech Recognition API, continuous restart loop)
2. **Types** your speech into the chat's input field via DOM injection (works on textareas, ContentEditable, ProseMirror, Lexical)
3. **Auto-submits** by clicking the page's send button or pressing Enter
4. **Watches** the page DOM for the assistant's response via MutationObserver
5. **Speaks** the response aloud via native TTS once streaming stabilizes
6. **Dual-pipes** both directions to `tui.xlrd.org/tui?q=...` so qi's TUI pane gets every conversation for automanifestation

The page also gets a small **floating panel** bottom-right with a status dot + Start/Stop button. Drag to reposition. Hotkey `V` toggles.

---

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions/`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the folder `C:\Users\selfe\.xen\extensions\agyvenom\`
5. Pin AGY VENOM to the toolbar
6. Visit any supported chat site — the floating panel appears bottom-right; grant mic permission once when prompted

---

## Per-site adapters (built in)

| Domain | Adapter |
|---|---|
| chatgpt.com / chat.openai.com | ChatGPT — textarea#prompt-textarea |
| claude.ai | Claude — ProseMirror contenteditable |
| perplexity.ai | Perplexity — textarea |
| grok.com | Grok — textarea/contenteditable |
| gemini.google.com | Gemini — rich-textarea contenteditable |
| aistudio.google.com | AI Studio — textarea |
| chat.mistral.ai | Mistral — textarea/contenteditable |
| chat.deepseek.com | DeepSeek — textarea/contenteditable |
| you.com | You.com — textarea/contenteditable |
| copilot.microsoft.com | Copilot — textarea/contenteditable |
| huggingface.co/chat | HF Chat — textarea |

For sites not in the list, add them to `manifest.json` → `host_permissions` + `content_scripts.matches` and add a section to the `ADAPTERS` map in `content.js`.

---

## Hotkeys

- **V** — toggle voice listening on the current page (when not focused in an input)
- **Click AGY VENOM toolbar icon** — opens a popup with Start/Stop, autostart toggle, and reload

---

## Pipeline · what reaches tui.xlrd.org

Every speech → text becomes:
```
[VOICE] <adapter-name> :: <your transcript>
```

Every assistant reply becomes:
```
[ASSISTANT] <adapter-name> :: <full reply text>
```

Both POSTed via the background service worker (no CORS issues, no DevTools noise on the page).

---

## Known limits · v0.2.0

- **iOS Safari**: Chrome extensions don't run on iOS. For mobile voice loop, use the standalone bridge at `hitthe.link/agyvenom/` instead.
- **Streaming-only detection**: Response observer waits ~900ms of DOM-stable to consider streaming done. If a site streams very slowly (long pauses mid-reply), AGY VENOM might speak partial replies. Adjust `RESPONSE_STABLE_MS` in content.js if needed.
- **Shadow DOM chats**: Sites that hide their chat input inside `mode:'closed'` Shadow DOM won't be reachable. None of the supported sites do this currently.
- **TTS quality**: Uses native browser TTS (`window.speechSynthesis`). Replace with tts.rocks Kokoro or ElevenLabs if you want better voice — the speak() function in `content.js` is one block to swap.
- **No conversation history persistence**: Each page load starts fresh. State is per-tab.

---

## Architecture

```
[You speak]
    ↓
[Speech Recognition · content.js]
    ↓
[Types into chat input field via adapter]
    ↓
[Clicks send / presses Enter]
    ↓                                 ↓
[Chat site sends to its backend]   [Mirror to tui.xlrd.org via background.js]
    ↓
[Site renders streamed response in DOM]
    ↓
[MutationObserver detects stable response]
    ↓                                 ↓
[TTS speaks the response]          [Mirror to tui.xlrd.org via background.js]
    ↓
[SR resumes · loop continues]
```

---

## Files

- `manifest.json` — Manifest V3 declaration · host_permissions + content_scripts + service_worker
- `content.js` — The wrap script · adapters, voice loop, response observer, panel UI
- `background.js` — Service worker · relays inject requests to tui.xlrd.org
- `panel.html` — Toolbar popup · status + Start/Stop + autostart toggle
- `icons/` — Toolbar icons (16/32/48/128 — placeholder, replace with branded assets)

---

## Brand · AGY canon

Palette pulled verbatim from `hitthe.link/vei/`:
- `#0A0A0A` deep forest base
- `#FFD700` emerald phosphor accent
- `#F0EAD6` cream parchment text
- Inter sans + JetBrains Mono
- Glass-on-green hyperreal panels per qi 2026-05-23 spec
