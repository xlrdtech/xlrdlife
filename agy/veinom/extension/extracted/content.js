/* =============================================================
 * AGY VENOM · RUACH
 * Voice-first universal web-chat wrapper · v0.2.0
 *
 * Hear every assistant reply.
 * Speak to inject every prompt.
 * Dual-pipe both directions to tui.xlrd.org for automanifestation.
 * ============================================================= */
(() => {
  if (window.__AGY VENOM_INSTALLED__) return;
  window.__AGY VENOM_INSTALLED__ = true;

  const INJECT_URL = 'https://tui.xlrd.org/tui';
  const RESPONSE_STABLE_MS = 900;   // assistant stream considered done after this
  const SR_RESTART_DELAY  = 280;
  const STALL_MS          = 50 * 60 * 1000;

  /* ─── PER-SITE ADAPTERS ───────────────────────────────────── */
  const ADAPTERS = {
    'chatgpt.com': {
      name: 'ChatGPT',
      input: () => document.querySelector('textarea#prompt-textarea, div#prompt-textarea[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main [role="presentation"], main') || document.body,
      messageNodeSelector: '[data-message-author-role="assistant"]',
      extractText: (n) => n.innerText.trim()
    },
    'chat.openai.com': null, // alias filled below
    'claude.ai': {
      name: 'Claude',
      input: () => document.querySelector('div[contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main, [class*="conversation"]') || document.body,
      messageNodeSelector: '[class*="font-claude-message"], .font-claude-message, div[data-is-streaming], [data-testid*="message-assistant"]',
      extractText: (n) => n.innerText.trim()
    },
    'perplexity.ai': {
      name: 'Perplexity',
      input: () => document.querySelector(
        'textarea[placeholder*="sk" i], textarea[placeholder*="Ask" i], textarea[placeholder*="follow" i], ' +
        'textarea, div[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
      ),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main, [class*="thread"]') || document.body,
      messageNodeSelector: '.prose, [class*="answer"] .prose, [data-testid*="answer"], [class*="markdown"]',
      extractText: (n) => cleanText(n)
    },
    'grok.com': {
      name: 'Grok',
      input: () => document.querySelector('textarea, div[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[class*="message-bubble"], [class*="assistant"], .response',
      extractText: (n) => n.innerText.trim()
    },
    'gemini.google.com': {
      name: 'Gemini',
      input: () => document.querySelector('div[contenteditable="true"][role="textbox"], rich-textarea div[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('chat-window, main') || document.body,
      /* Target the actual markdown body · NOT the .sr-only "Gemini said" label */
      messageNodeSelector: 'model-response message-content .markdown, message-content .markdown',
      extractText: (n) => cleanText(n)
    },
    'aistudio.google.com': {
      name: 'AI Studio',
      input: () => document.querySelector('textarea, ms-prompt-input-wrapper textarea'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('ms-chat-turn-renderer')?.parentElement || document.body,
      messageNodeSelector: 'ms-chat-turn[role="presentation"][data-test-role="model"], ms-prompt-chunk',
      extractText: (n) => n.innerText.trim()
    },
    'chat.mistral.ai': {
      name: 'Mistral',
      input: () => document.querySelector('textarea, div[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[class*="assistant"], [data-role="assistant"]',
      extractText: (n) => n.innerText.trim()
    },
    'chat.deepseek.com': {
      name: 'DeepSeek',
      input: () => document.querySelector('textarea, div[contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[class*="response"], [class*="assistant"]',
      extractText: (n) => n.innerText.trim()
    },
    'you.com': {
      name: 'You.com',
      input: () => document.querySelector('textarea, [contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[data-testid*="assistant"], [class*="assistant"]',
      extractText: (n) => n.innerText.trim()
    },
    'copilot.microsoft.com': {
      name: 'Copilot',
      input: () => document.querySelector('textarea, [contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[data-content="ai-message"], [class*="response"]',
      extractText: (n) => n.innerText.trim()
    },
    'huggingface.co': {
      name: 'HF Chat',
      input: () => document.querySelector('textarea'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[class*="assistant"], [data-role="assistant"]',
      extractText: (n) => cleanText(n)
    },
    /* Sintra · AI buddy assistants · adapter inferred from common React-chat patterns */
    'app.sintra.ai': {
      name: 'Sintra',
      input: () => document.querySelector(
        'textarea[placeholder], textarea, ' +
        'div[contenteditable="true"][role="textbox"], div[contenteditable="true"], ' +
        '[data-testid*="input"] textarea, [data-testid*="message-input"]'
      ),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector(
        '[class*="chat-container"], [class*="messages"], [class*="conversation"], main'
      ) || document.body,
      messageNodeSelector:
        '[class*="message-assistant"], [class*="assistant-message"], ' +
        '[class*="buddy-message"], [class*="ai-message"], ' +
        '[data-role="assistant"], [data-author="assistant"], ' +
        '[class*="message"][class*="received"], [class*="bot-message"]',
      extractText: (n) => cleanText(n)
    },
    'sintra.ai': null,  // alias filled below
    'poe.com': {
      name: 'Poe',
      input: () => document.querySelector('textarea[class*="ChatMessageInput"], textarea'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('[class*="ChatMessagesView"], main') || document.body,
      messageNodeSelector: '[class*="Message_botMessageBubble"], [data-complete="true"]',
      extractText: (n) => cleanText(n)
    },
    'character.ai': {
      name: 'Character.AI',
      input: () => document.querySelector('textarea, [contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main, [class*="chat"]') || document.body,
      messageNodeSelector: '[class*="character"], [class*="msg-row"]:not([class*="user"])',
      extractText: (n) => cleanText(n)
    },
    'meta.ai': {
      name: 'Meta AI',
      input: () => document.querySelector('textarea, [contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[data-author="assistant"], [class*="ai-message"]',
      extractText: (n) => cleanText(n)
    },
    'kagi.com': {
      name: 'Kagi',
      input: () => document.querySelector('textarea, [contenteditable="true"]'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: '[class*="answer"], [class*="response"]',
      extractText: (n) => cleanText(n)
    },
    /* hitthe.link · path-routed · /vei/ = Web TUI */
    'hitthe.link': {
      name: 'AGY',
      pathMatch: /^\/vei\//,
      input: () => document.querySelector('#fb-text'),
      submit: () => {
        const btn = document.querySelector('#fb-send');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return pressEnter(document.querySelector('#fb-text'));
      },
      messageContainer: () => document.querySelector('#transcript') || document.body,
      messageNodeSelector: '.xen-reply',
      extractText: (n) => n.innerText.trim()
    }
  };
  ADAPTERS['chat.openai.com'] = ADAPTERS['chatgpt.com'];

  function pickAdapter() {
    const host = location.hostname.replace(/^www\./, '');
    const a = ADAPTERS[host];
    if (a) {
      if (a.pathMatch && !a.pathMatch.test(location.pathname)) return genericAdapter();
      return a;
    }
    return genericAdapter();
  }

  function genericAdapter() {
    return {
      name: location.hostname,
      input: () => document.querySelector('div[contenteditable="true"], textarea'),
      submit: () => clickSendNear(findInput()) || pressEnter(findInput()),
      messageContainer: () => document.querySelector('main') || document.body,
      messageNodeSelector: null,  // signal: use heuristic last-text-node tracking
      extractText: (n) => n.innerText.trim()
    };
  }

  const adapter = pickAdapter();
  function findInput() { return adapter.input(); }

  /* ─── TEXT EXTRACTION · strip sr-only labels + UI chrome ──── */
  function cleanText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    // Remove screen-reader labels, hidden chrome, action buttons, code-copy controls
    clone.querySelectorAll(
      '.sr-only, [aria-hidden="true"], [class*="visually-hidden"], [class*="sr-only"], ' +
      'button, [role="button"], [class*="copy-button"], [class*="code-header"], ' +
      '[class*="action-buttons"], [class*="message-header"], [class*="response-container-header"]'
    ).forEach(n => n.remove());
    let txt = clone.innerText.trim();
    // Strip leading attribution preambles like "Gemini said", "Claude said", "ChatGPT said"
    txt = txt.replace(/^(Gemini|Claude|ChatGPT|GPT-?\d+|Assistant|Copilot|Mistral|Grok|Perplexity)\s+said\s*[:\.]?\s*/i, '');
    return txt;
  }

  /* ─── INPUT INJECTION ─────────────────────────────────────── */
  function typeIntoInput(el, text) {
    if (!el) return false;
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
                  || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.isContentEditable) {
      // ProseMirror / Lexical / contenteditable
      el.innerHTML = '';
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return true;
    }
    return false;
  }

  function pressEnter(el) {
    if (!el) return false;
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    });
    el.dispatchEvent(ev);
    return !ev.defaultPrevented;
  }

  function clickSendNear(el) {
    if (!el) return false;
    // Look for nearby button with send-y aria/text
    const candidates = [];
    const form = el.closest('form') || el.parentElement?.parentElement || document.body;
    form.querySelectorAll('button').forEach(b => {
      const label = (b.getAttribute('aria-label') || b.title || b.innerText || '').toLowerCase();
      if (/^send|submit|^ask|prompt-submit|send-button|send message/.test(label)) candidates.push(b);
      else if (b.querySelector('svg') && !b.disabled && b.offsetParent) candidates.push(b); // icon-only buttons
    });
    const btn = candidates.find(b => !b.disabled) || candidates[0];
    if (btn) { btn.click(); return true; }
    return false;
  }

  /* ─── BACKGROUND POST · tui.xlrd.org/tui ──────────────────── */
  function pipeToTUI(payload) {
    const tag = payload.kind === 'user' ? '[VOICE]' : '[ASSISTANT]';
    const body = `${tag} ${adapter.name} :: ${payload.text}`;
    chrome.runtime.sendMessage({ type: 'tui-inject', text: body }).catch(() => {
      // Fallback direct fetch if background not responsive
      fetch(`${INJECT_URL}?q=${encodeURIComponent(body)}`, { mode: 'cors' }).catch(() => {});
    });
  }

  /* ─── TTS · Ava via ava.xlrd.org Worker relay ──────────────
     The Worker handles Microsoft's Sec-MS-GEC handshake server-side
     (browsers can't set custom WS headers).  Browser side just fetches
     the resulting MP3 blob and plays it via <audio>.
     No fallback per feedback_ava_only canon · silence if relay is offline. */
  let isSpeaking = false;
  let currentAudio = null;
  /* Local-first · localhost edge-tts proxy primary (qi's Windows · IP-unblocked) ·
     ava.xlrd.org Worker as fallback (works when local server is off · MS may 403) */
  const AVA_LOCAL_URL = 'http://localhost:7723/';
  const AVA_RELAY_URL = 'https://ava.xlrd.org/';
  const AVA_VOICE = 'en-US-AvaMultilingualNeural';

  async function avaSynthesize(text) {
    const qs = `?text=${encodeURIComponent(text)}&voice=${AVA_VOICE}`;
    /* Race · local first, fall to relay if local refuses */
    for (const base of [AVA_LOCAL_URL, AVA_RELAY_URL]) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(base + qs, { signal: ctrl.signal });
        if (!res.ok) { clearTimeout(t); continue; }
        const blob = await res.blob();
        clearTimeout(t);
        if (blob.size < 200) continue;
        return URL.createObjectURL(blob);
      } catch (e) {
        clearTimeout(t);
        continue;
      }
    }
    throw new Error('all Ava endpoints unreachable');
  }

  /* Speak via Ava · pauses SR while audio plays · resumes on end */
  function speak(text) {
    return new Promise(async resolve => {
      if (!text) { resolve(); return; }
      if (text.length > 1500) text = text.slice(0, 1500) + '…';
      isSpeaking = true;
      pauseSR();
      updatePanel();
      try {
        const url = await avaSynthesize(text);
        if (currentAudio) { try { currentAudio.pause(); } catch(_){} }
        currentAudio = new Audio(url);
        currentAudio.volume = 1.0;
        const done = () => {
          if (url) URL.revokeObjectURL(url);
          currentAudio = null;
          isSpeaking = false;
          resumeSR();
          updatePanel();
          resolve();
        };
        currentAudio.onended = done;
        currentAudio.onerror = done;
        await currentAudio.play().catch(done);
      } catch (e) {
        /* Ava relay offline · silence per canon · no fallback */
        console.warn('[AGY VENOM] Ava relay offline:', e.message);
        setStatus('ava relay offline · silence');
        isSpeaking = false;
        resumeSR();
        updatePanel();
        resolve();
      }
    });
  }

  /* Barge-in · cancel TTS if user starts talking mid-reply */
  function cancelSpeak() {
    if (currentAudio) { try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(_){} }
    isSpeaking = false;
  }

  /* ─── BARGE-IN VAD · WebAudio amplitude watcher · runs while Ava speaks ─── */
  let bargeStream = null, bargeCtx = null, bargeAnalyser = null, bargeRAF = null;
  const BARGE_THRESHOLD = 28;   /* RMS · tune if too sensitive/insensitive */

  async function startBargeWatcher() {
    if (bargeAnalyser) return;
    try {
      bargeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,     /* critical · cancel Ava's own playback */
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      bargeCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = bargeCtx.createMediaStreamSource(bargeStream);
      bargeAnalyser = bargeCtx.createAnalyser();
      bargeAnalyser.fftSize = 256;
      bargeAnalyser.smoothingTimeConstant = 0.4;
      source.connect(bargeAnalyser);
      tickBarge();
    } catch (e) {
      console.warn('[AGY VENOM] barge watcher could not start:', e.message);
    }
  }

  function tickBarge() {
    if (!bargeAnalyser) return;
    const buf = new Uint8Array(bargeAnalyser.frequencyBinCount);
    bargeAnalyser.getByteFrequencyData(buf);
    /* Focus on speech band · skip very-low frequencies that are usually rumble */
    const startBin = Math.floor(buf.length * 0.12);
    let sum = 0;
    for (let i = startBin; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / (buf.length - startBin));
    if (isSpeaking && rms > BARGE_THRESHOLD) {
      cancelSpeak();
      setStatus('barge-in · interrupted Ava');
      /* Resume SR immediately for the interrupting utterance */
      resumeSR();
    }
    bargeRAF = requestAnimationFrame(tickBarge);
  }

  function stopBargeWatcher() {
    if (bargeRAF) cancelAnimationFrame(bargeRAF);
    if (bargeStream) bargeStream.getTracks().forEach(t => t.stop());
    if (bargeCtx) bargeCtx.close().catch(()=>{});
    bargeStream = bargeCtx = bargeAnalyser = bargeRAF = null;
  }

  /* ─── RESPONSE OBSERVER ───────────────────────────────────── */
  let lastAssistantText = '';
  let stableTimer = null;
  let currentAssistantText = '';
  let observer = null;

  function startResponseObserver() {
    const root = adapter.messageContainer() || document.body;
    if (!root) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const txt = readLatestAssistant();
      if (!txt || txt === currentAssistantText) return;
      currentAssistantText = txt;
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => {
        if (currentAssistantText && currentAssistantText !== lastAssistantText) {
          const final = currentAssistantText;
          lastAssistantText = final;
          onAssistantReply(final);
        }
      }, RESPONSE_STABLE_MS);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  /* Common preamble labels sites render before the actual response · skip these */
  const LABEL_ONLY_REGEX = /^(Gemini|Claude|ChatGPT|GPT-?\d+|Assistant|Copilot|Mistral|Grok|Perplexity|AI Studio|DeepSeek|You\.com|HF Chat)\s+said\s*[:\.]?\s*$/i;

  function readLatestAssistant() {
    let text = '';
    if (adapter.messageNodeSelector) {
      const nodes = document.querySelectorAll(adapter.messageNodeSelector);
      const last = nodes[nodes.length - 1];
      if (!last) return '';
      text = adapter.extractText(last);
    } else {
      // Generic heuristic: largest recently-added text block under main
      const main = adapter.messageContainer();
      const blocks = main ? main.querySelectorAll('div, article, section') : [];
      let candidate = '';
      for (let i = blocks.length - 1; i >= Math.max(0, blocks.length - 30); i--) {
        const t = (blocks[i].innerText || '').trim();
        if (t.length > candidate.length && t.length < 4000) candidate = t;
      }
      text = candidate;
    }
    /* Safety net · skip empty, too-short, or label-only captures
       (e.g. Gemini's <h2 class="sr-only">Gemini said</h2> bleeding through) */
    if (!text || text.length < 12) return '';
    if (LABEL_ONLY_REGEX.test(text)) return '';
    return text;
  }

  function onAssistantReply(text) {
    pipeToTUI({ kind: 'assistant', text });
    speak(text);
    setStatus('assistant · spoke ' + text.slice(0, 32) + '…');
  }

  /* ─── SPEECH RECOGNITION ──────────────────────────────────── */
  let recognition = null;
  let isListening = false;
  let srRestartTimer = null;
  let stallWatchdog = null;
  let lastFinalSent = '';
  let lastFinalAt = 0;

  function pauseSR() { if (recognition && isListening) { try { recognition.stop(); } catch(_){} } }
  function resumeSR() {
    if (!isListening || isSpeaking) return;
    if (srRestartTimer) clearTimeout(srRestartTimer);
    srRestartTimer = setTimeout(() => {
      if (recognition && isListening && !isSpeaking) { try { recognition.start(); } catch(_){} }
    }, SR_RESTART_DELAY);
  }

  function startSR() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus('SR unsupported'); return false; }

    recognition = new SR();
    /* continuous=true on desktop · false on iOS/Safari · accumulate across breath pauses */
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    recognition.continuous = !isSafari;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    let finalAccumulator = '';
    let silenceTimer = null;
    const SILENCE_MS = 1500;  /* wait this long after last final before shipping */

    function flushFinal() {
      silenceTimer = null;
      if (!finalAccumulator.trim()) return;
      const t = finalAccumulator.trim();
      finalAccumulator = '';
      const now = Date.now();
      if (t === lastFinalSent && now - lastFinalAt < 2000) return;
      lastFinalSent = t; lastFinalAt = now;
      handleVoiceInput(t);
    }

    recognition.onresult = (event) => {
      let finals = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finals += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      /* Barge-in · cancel Ava if user starts speaking mid-reply */
      if (isSpeaking && (finals.trim() || interim.trim())) {
        cancelSpeak();
        setStatus('barge-in · interrupted Ava');
      }
      if (finals.trim()) {
        finalAccumulator = (finalAccumulator + ' ' + finals).replace(/\s+/g, ' ').trim();
        setStatus('accumulating · ' + finalAccumulator.slice(-60));
        /* Reset silence timer · only ship after qi truly stops talking */
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(flushFinal, SILENCE_MS);
      }
      if (interim) setStatus('hearing · ' + interim.slice(-50));
    };

    /* Removed onspeechend auto-flush · the silence-timer drives the flush
       so qi's natural breath pauses no longer chop the utterance into partials */

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        isListening = false;
        setStatus('mic blocked · grant in site permissions');
        updatePanel();
        return;
      }
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (isListening && !isSpeaking) resumeSR();
    };

    recognition.onend = () => {
      if (isListening && !isSpeaking) resumeSR();
      else if (!isListening) updatePanel();
    };

    try {
      recognition.start();
      isListening = true;
      setStatus('listening · ' + adapter.name);
      if (stallWatchdog) clearTimeout(stallWatchdog);
      stallWatchdog = setTimeout(() => {
        if (isListening) { try { recognition.stop(); } catch(_){} }
      }, STALL_MS);
      updatePanel();
      return true;
    } catch (e) { return false; }
  }

  function stopSR() {
    isListening = false;
    if (srRestartTimer) clearTimeout(srRestartTimer);
    if (stallWatchdog) clearTimeout(stallWatchdog);
    if (recognition) { try { recognition.stop(); } catch(_){} }
    setStatus('idle');
    updatePanel();
  }

  function toggleSR() { isListening ? stopSR() : startSR(); }

  /* ─── VOICE COMMAND PARSER · browser control intents ──────── */
  const SITE_ALIASES = {
    'chat g p t': 'https://chatgpt.com', 'chatgpt': 'https://chatgpt.com', 'gpt': 'https://chatgpt.com',
    'claude': 'https://claude.ai', 'anthropic': 'https://claude.ai',
    'gemini': 'https://gemini.google.com', 'google ai': 'https://gemini.google.com',
    'perplexity': 'https://www.perplexity.ai', 'pplx': 'https://www.perplexity.ai',
    'grok': 'https://grok.com',
    'mistral': 'https://chat.mistral.ai',
    'deep seek': 'https://chat.deepseek.com', 'deepseek': 'https://chat.deepseek.com',
    'copilot': 'https://copilot.microsoft.com',
    'meta ai': 'https://meta.ai', 'meta': 'https://meta.ai',
    'sintra': 'https://app.sintra.ai',
    'poe': 'https://poe.com',
    'kagi': 'https://kagi.com',
    'character ai': 'https://character.ai',
    'hugging face': 'https://huggingface.co/chat',
    'vei': 'https://hitthe.link/agy/veinom/', 'web tui': 'https://hitthe.link/agy/veinom/', 'tui': 'https://hitthe.link/agy/veinom/',
    'm b': 'https://hitthe.link/mb/', 'agyvenom': 'https://hitthe.link/agyvenom/'
  };

  /* Find any clickable element matching label text (case-insensitive substring) */
  function findClickable(label) {
    const t = label.toLowerCase().trim();
    const candidates = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], ' +
      'input[type="submit"], input[type="button"], [onclick], [tabindex]:not([tabindex="-1"])'
    );
    let best = null, bestScore = 0;
    for (const el of candidates) {
      if (!el.offsetParent && el.tagName !== 'A') continue;  /* skip invisible */
      const labels = [
        el.innerText, el.value, el.getAttribute('aria-label'), el.title,
        el.getAttribute('data-label'), el.getAttribute('alt')
      ].filter(Boolean).map(s => s.toLowerCase().trim());
      for (const lab of labels) {
        if (lab === t) return el;  /* exact wins immediately */
        if (lab.includes(t) || t.includes(lab)) {
          const score = Math.min(lab.length, t.length) / Math.max(lab.length, t.length);
          if (score > bestScore) { bestScore = score; best = el; }
        }
      }
    }
    return bestScore > 0.3 ? best : null;
  }

  /* Find any input/textarea/contenteditable matching a label hint */
  function findFieldByLabel(label) {
    const t = label.toLowerCase().trim();
    const fields = document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]');
    for (const f of fields) {
      const candidates = [
        f.getAttribute('aria-label'), f.placeholder, f.name, f.id, f.title,
        f.getAttribute('data-label')
      ].filter(Boolean).map(s => s.toLowerCase());
      // Also check linked <label for=id>
      if (f.id) {
        const labelEl = document.querySelector(`label[for="${f.id}"]`);
        if (labelEl) candidates.push(labelEl.innerText.toLowerCase());
      }
      // Wrap: parent label
      const wrap = f.closest('label');
      if (wrap) candidates.push(wrap.innerText.toLowerCase());
      for (const c of candidates) if (c.includes(t) || t.includes(c)) return f;
    }
    return null;
  }

  /* Highlight + scroll to text on page · returns first match */
  function findOnPage(text) {
    const t = text.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(t)) {
        const parent = node.parentElement;
        if (parent && parent.offsetParent) {
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prev = parent.style.backgroundColor;
          parent.style.transition = 'background-color .4s';
          parent.style.backgroundColor = 'rgba(0,255,136,.45)';
          setTimeout(() => { parent.style.backgroundColor = prev; }, 2200);
          return true;
        }
      }
    }
    return false;
  }

  function tryVoiceCommand(text) {
    const t = text.toLowerCase().trim().replace(/[.!?,]+$/, '');
    let m;

    /* ─── NAVIGATION ─── */
    /* open <site> · navigate to <site> · go to <site> */
    if ((m = t.match(/^(?:open|navigate to|go to|launch|visit|pull up|load)\s+(.+)$/))) {
      const target = m[1].trim();
      const url = SITE_ALIASES[target] || (target.includes('.') ? 'https://' + target : null);
      if (url) { chrome.runtime.sendMessage({ type: 'tab-create', url }); setStatus('opened · ' + url); return true; }
    }
    /* search for <query> · google <query> */
    if ((m = t.match(/^(?:search|google|look up|find on web)\s+(?:for\s+)?(.+)$/))) {
      const q = m[1].trim();
      chrome.runtime.sendMessage({ type: 'tab-create', url: 'https://www.google.com/search?q=' + encodeURIComponent(q) });
      setStatus('searching · ' + q);
      return true;
    }

    /* ─── TAB MANAGEMENT ─── */
    /* fuzzy `tab` accepts mishearings · "tabo", "taboo", "tabs", "tabe" */
    if (/^(close|kill)\s+(this\s+)?tab\w{0,3}$/.test(t)) { chrome.runtime.sendMessage({ type: 'tab-close' }); setStatus('closing tab'); return true; }
    if (/^(open\s+)?new\s+tab\w{0,3}$/.test(t)) { chrome.runtime.sendMessage({ type: 'tab-create', url: 'about:blank' }); setStatus('new tab'); return true; }
    if (/^next\s+tab\w{0,3}$/.test(t)) { chrome.runtime.sendMessage({ type: 'tab-shift', delta: 1 }); return true; }
    if (/^(previous|prev|last)\s+tab\w{0,3}$/.test(t)) { chrome.runtime.sendMessage({ type: 'tab-shift', delta: -1 }); return true; }
    if ((m = t.match(/^(?:switch|go|jump)\s+to\s+(?:the\s+)?(.+?)(?:\s+tab)?$/))) {
      chrome.runtime.sendMessage({ type: 'tab-switch', match: m[1].trim() });
      setStatus('switching · ' + m[1]);
      return true;
    }
    if (/^list tabs$/.test(t)) { chrome.runtime.sendMessage({ type: 'tab-list' }); return true; }

    /* ─── PAGE CONTROL ─── */
    if (/^(refresh|reload)(\s+(this\s+)?(page|tab))?$/.test(t)) { location.reload(); return true; }
    if (/^go\s+back$/.test(t)) { history.back(); setStatus('back'); return true; }
    if (/^go\s+forward$/.test(t)) { history.forward(); setStatus('forward'); return true; }
    if (/^scroll\s+down$/.test(t)) { window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }); return true; }
    if (/^scroll\s+up$/.test(t))   { window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); return true; }
    if (/^scroll\s+to\s+top$/.test(t))    { window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
    if (/^scroll\s+to\s+bottom$/.test(t)) { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return true; }
    if ((m = t.match(/^(?:find|search\s+page\s+for|locate|jump to)\s+(.+)$/))) {
      const ok = findOnPage(m[1].trim());
      setStatus(ok ? 'found · ' + m[1] : 'not found');
      return true;
    }

    /* ─── DOM INTERACTION ─── */
    /* click <label> · press <label> · tap <label> */
    if ((m = t.match(/^(?:click|press|tap|hit|select)\s+(?:on\s+|the\s+)?(.+?)(?:\s+button)?$/))) {
      const el = findClickable(m[1].trim());
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.click(), 250);
        setStatus('clicked · ' + m[1]);
        return true;
      }
      setStatus('no element matching · ' + m[1]);
      return true;  /* command was understood · just didn't find target */
    }

    /* type <text> in <field> · fill <field> with <value> */
    if ((m = t.match(/^(?:type|enter|fill|put)\s+(.+?)\s+(?:in|into|in the|into the)\s+(.+?)(?:\s+field|\s+box|\s+input)?$/))) {
      const value = m[1].trim();
      const fieldName = m[2].trim();
      const field = findFieldByLabel(fieldName);
      if (field) {
        typeIntoInput(field, value);
        setStatus(`typed "${value}" in ${fieldName}`);
        return true;
      }
      setStatus('no field matching · ' + fieldName);
      return true;
    }
    /* clear <field> */
    if ((m = t.match(/^clear\s+(?:the\s+)?(.+?)(?:\s+field)?$/))) {
      const f = findFieldByLabel(m[1].trim());
      if (f) { typeIntoInput(f, ''); setStatus('cleared'); return true; }
    }
    /* submit · submit form · press enter */
    if (/^(submit|submit form|press enter|hit enter)$/.test(t)) {
      const a = document.activeElement;
      if (a) pressEnter(a);
      else if (findInput()) pressEnter(findInput());
      return true;
    }

    /* ─── CLIPBOARD ─── */
    if ((m = t.match(/^copy\s+(.+)$/))) {
      navigator.clipboard.writeText(m[1].trim()).then(() => setStatus('copied'));
      return true;
    }
    if (/^paste$/.test(t)) {
      navigator.clipboard.readText().then(text => {
        const a = document.activeElement;
        if (a) typeIntoInput(a, text);
      });
      return true;
    }
    if (/^select all$/.test(t)) { document.execCommand('selectAll'); return true; }

    /* ─── AGY VENOM CONTROL ─── */
    if (/^(agyvenom\s+)?(stop|off|mute|sleep)(\s+listening)?$/.test(t)) { stopSR(); return true; }
    if (/^(stop\s+speaking|shut\s+up|mute\s+(speaker|voice)|quiet|silence)$/.test(t)) { cancelSpeak(); setStatus('muted'); return true; }
    if (/^(agyvenom\s+)?(go to sleep|sleep mode)$/.test(t)) { stopSR(); return true; }

    return false;
  }

  function handleVoiceInput(text) {
    /* Try browser-control commands first · only inject to chat if no command matched */
    if (tryVoiceCommand(text)) {
      pipeToTUI({ kind: 'user', text: '[CMD] ' + text });
      return;
    }
    setStatus('inject · ' + text.slice(0, 50));
    pipeToTUI({ kind: 'user', text });
    const input = findInput();
    if (!input) { setStatus('no input field found on this page'); return; }
    if (typeIntoInput(input, text)) {
      setTimeout(() => adapter.submit(), 120);
    }
  }

  /* ─── FLOATING PANEL ──────────────────────────────────────── */
  let panel, panelStatus, panelBtn, panelDot;
  function injectPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = '__agyvenom_panel';
    panel.innerHTML = `
      <style>
        #__agyvenom_panel {
          position: fixed; bottom: 18px; right: 18px; z-index: 2147483646;
          font-family: 'Inter', system-ui, sans-serif;
          background: linear-gradient(145deg, rgba(10,31,18,.85), rgba(8,24,14,.92));
          color: #F0EAD6;
          padding: 12px 14px 12px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,215,0,.32);
          box-shadow: 0 12px 36px rgba(0,0,0,.55), 0 0 0 1px rgba(255,215,0,.12), 0 0 24px rgba(0,255,136,.18);
          backdrop-filter: blur(18px) saturate(1.3);
          -webkit-backdrop-filter: blur(18px) saturate(1.3);
          display: flex; align-items: center; gap: 10px;
          font-size: 12px;
          min-width: 240px; max-width: 360px;
          user-select: none;
        }
        #__agyvenom_panel .vn-dot {
          width: 12px; height: 12px; border-radius: 50%;
          background: #6B8B72;
          flex-shrink: 0;
          transition: all .2s;
          position: relative;
        }
        #__agyvenom_panel.live .vn-dot {
          background: #FFD700;
          box-shadow: 0 0 12px #FFD700;
          animation: vn-pulse 1.5s ease-in-out infinite;
        }
        #__agyvenom_panel.speaking .vn-dot {
          background: #FFA500;   /* AMBER · OUTPUT direction */
          box-shadow: 0 0 16px #FFA500;
          animation: vn-pulse 0.9s ease-in-out infinite;
        }
        #__agyvenom_panel.thinking .vn-dot {
          background: #FFE65F;
          box-shadow: 0 0 14px #FFE65F;
          animation: vn-pulse 0.6s ease-in-out infinite;
        }
        #__agyvenom_panel .vn-dir {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: .18em; text-transform: uppercase;
          color: #6B8B72;
          opacity: .8;
        }
        #__agyvenom_panel.live .vn-dir { color: #FFD700; }
        #__agyvenom_panel.speaking .vn-dir { color: #FFA500; }
        #__agyvenom_panel.thinking .vn-dir { color: #FFE65F; }
        @keyframes vn-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(1.25); }
        }
        #__agyvenom_panel .vn-brand {
          font-family: 'Inter', sans-serif; font-weight: 600;
          font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          color: #FFD700;
        }
        #__agyvenom_panel .vn-status {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; color: #A8C0A4; opacity: .85;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          max-width: 200px;
        }
        #__agyvenom_panel button {
          background: rgba(255,215,0,.10);
          border: 1px solid rgba(255,215,0,.32);
          color: #FFD700;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; font-weight: 500;
          letter-spacing: .16em; text-transform: uppercase;
          padding: 6px 12px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all .15s;
        }
        #__agyvenom_panel button:hover { background: rgba(255,215,0,.22); }
        #__agyvenom_panel .vn-col { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      </style>
      <div class="vn-dot"></div>
      <div class="vn-col">
        <div class="vn-brand">AGY VENOM · ${adapter.name}</div>
        <div class="vn-dir">— idle —</div>
        <div class="vn-status">click start</div>
      </div>
      <button>Start</button>
    `;
    document.documentElement.appendChild(panel);
    panelStatus = panel.querySelector('.vn-status');
    panelBtn = panel.querySelector('button');
    panelDot = panel.querySelector('.vn-dot');
    panelBtn.addEventListener('click', toggleSR);

    // Drag to reposition
    let drag = null;
    panel.addEventListener('mousedown', e => {
      if (e.target === panelBtn) return;
      drag = { x: e.clientX, y: e.clientY, r: panel.getBoundingClientRect() };
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = (drag.r.left + dx) + 'px';
      panel.style.top = (drag.r.top + dy) + 'px';
    });
    window.addEventListener('mouseup', () => drag = null);
  }

  function setStatus(s) {
    if (panelStatus) panelStatus.textContent = s;
    /* Direction indicator follows state · INPUT ↔ OUTPUT ↔ IDLE */
    if (panel) {
      const dir = panel.querySelector('.vn-dir');
      if (dir) {
        if (isSpeaking) dir.textContent = '◀ OUTPUT · ava reading';
        else if (isListening) {
          if (s.startsWith('inject')) dir.textContent = '▶ INPUT · sent · awaiting reply';
          else if (s.startsWith('accumulating')) dir.textContent = '▶ INPUT · capturing speech';
          else if (s.startsWith('hearing')) dir.textContent = '▶ INPUT · live transcript';
          else if (s.startsWith('barge')) dir.textContent = '▶ INPUT · interrupted ava';
          else dir.textContent = '▶ INPUT · listening for you';
        } else {
          dir.textContent = '— idle —';
        }
      }
    }
  }
  function updatePanel() {
    if (!panel) return;
    panel.classList.toggle('live', isListening && !isSpeaking);
    panel.classList.toggle('speaking', isSpeaking);
    panelBtn.textContent = isListening ? 'Stop' : 'Start';
    /* Refresh direction label on state changes */
    setStatus(panelStatus?.textContent || (isListening ? 'listening' : 'idle'));
  }

  /* ─── HOTKEY · Alt+V toggles · changed from plain V to avoid AHK conflicts ─── */
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.key && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      toggleSR();
    }
  });

  /* ─── GLASS THEME · AGY palette enforced on any chat site ───── */
  function injectGlassTheme() {
    if (document.getElementById('__agyvenom_glass__')) return;
    const style = document.createElement('style');
    style.id = '__agyvenom_glass__';
    style.textContent = `
      /* ===== AGY canon palette applied universally ===== */
      :root {
        --vn-bg: #0A0A0A !important;
        --vn-bg-deep: #050505;
        --vn-bg-elev: rgba(20, 60, 35, .25);
        --vn-bg-input: rgba(20, 60, 35, .45);
        --vn-fg: #F0EAD6;
        --vn-fg-dim: #A8C0A4;
        --vn-fg-mute: #6B8B72;
        --vn-accent: #FFD700;
        --vn-accent-glow: rgba(255,215,0,.35);
        --vn-line: rgba(176,255,200,.18);
        --vn-line-strong: rgba(176,255,200,.32);
      }
      html, body {
        background: linear-gradient(165deg, #0A0A0A 0%, #050505 100%) !important;
        color: #F0EAD6 !important;
        font-family: 'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif !important;
      }
      /* Override common backgrounds */
      body *:not(button):not(svg):not(svg *):not(img):not(video) {
        background-color: transparent !important;
      }
      /* Re-paint common surfaces with glass */
      main, aside, nav, header, footer,
      [class*="conversation"], [class*="chat-window"], [class*="sidebar"],
      [class*="thread"], [class*="container"]:not(button):not(svg) {
        background: transparent !important;
      }
      /* Glass bubbles for any message-like container */
      [class*="message"]:not(svg):not(img),
      [class*="bubble"]:not(svg):not(img),
      [class*="response"]:not(svg):not(img),
      [class*="reply"]:not(svg):not(img),
      [data-message-author-role],
      message-content, model-response, ms-chat-turn,
      .font-claude-message, .markdown,
      .prose {
        background: linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.03)) !important;
        border: 1px solid rgba(0,255,136,.18) !important;
        border-radius: 18px !important;
        backdrop-filter: blur(18px) saturate(1.3) !important;
        -webkit-backdrop-filter: blur(18px) saturate(1.3) !important;
        color: #F0EAD6 !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 8px 24px rgba(0,0,0,.32) !important;
        margin: 8px 0 !important;
        padding: 14px 18px !important;
      }
      /* Assistant bubbles get emerald tint */
      [data-message-author-role="assistant"],
      [class*="assistant"]:not(svg):not(img),
      .font-claude-message,
      model-response,
      .model-response-text {
        background: linear-gradient(145deg, rgba(0,255,136,.14), rgba(0,255,136,.03)) !important;
        border-color: rgba(255,215,0,.32) !important;
      }
      /* User bubbles get cream tint */
      [data-message-author-role="user"],
      [class*="user"]:not(button):not(svg):not(img) {
        background: linear-gradient(145deg, rgba(240,234,214,.10), rgba(240,234,214,.02)) !important;
      }
      /* Inputs · glass field with emerald focus */
      textarea, input[type="text"], input[type="search"], [contenteditable="true"] {
        background: rgba(20, 60, 35, .45) !important;
        color: #F0EAD6 !important;
        border: 1px solid rgba(176, 255, 200, .22) !important;
        border-radius: 14px !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }
      textarea:focus, [contenteditable="true"]:focus, input:focus {
        border-color: #FFD700 !important;
        box-shadow: 0 0 0 3px rgba(255,215,0,.22) !important;
        outline: none !important;
      }
      ::placeholder { color: #6B8B72 !important; opacity: .8 !important; }
      /* Buttons · pill + emerald accent */
      button {
        color: #F0EAD6 !important;
        border-radius: 9999px !important;
      }
      button[class*="send"], button[aria-label*="send" i], button[type="submit"],
      button[data-testid*="send"] {
        background: rgba(0,255,136,.18) !important;
        border: 1px solid rgba(0,255,136,.45) !important;
        color: #FFD700 !important;
        box-shadow: 0 0 12px rgba(255,215,0,.28) !important;
      }
      /* Text · headings + body */
      h1, h2, h3, h4, h5, h6 { color: #F0EAD6 !important; }
      p, span, div, li, code, td, th { color: inherit; }
      a { color: #FFD700 !important; }
      a:hover { color: #FFE65F !important; }
      /* Code blocks · darker glass */
      pre, code {
        background: rgba(3, 10, 6, .65) !important;
        color: #F0EAD6 !important;
        border: 1px solid rgba(0,255,136,.18) !important;
        border-radius: 12px !important;
      }
      /* Scrollbars */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent !important; }
      ::-webkit-scrollbar-thumb { background: rgba(255,235,176,.22) !important; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(0,255,136,.45) !important; }
      /* Logos · drop emerald tint, retain shape */
      img[alt*="logo" i], img[src*="logo" i],
      svg[class*="logo" i], svg[aria-label*="logo" i],
      [class*="-logo"]:not(input):not(textarea),
      [class*="brand-logo"], [class*="site-logo"] {
        filter: brightness(1.4) hue-rotate(85deg) saturate(2.2) drop-shadow(0 0 8px rgba(0,255,136,.45)) !important;
        opacity: .85 !important;
      }
      /* Modal/overlay glass */
      [role="dialog"], [class*="modal"], [class*="dialog"], [class*="popover"], [class*="dropdown"] {
        background: linear-gradient(145deg, rgba(10, 31, 18, .92), rgba(8, 24, 14, .96)) !important;
        border: 1px solid rgba(255,215,0,.28) !important;
        backdrop-filter: blur(22px) saturate(1.4) !important;
        -webkit-backdrop-filter: blur(22px) saturate(1.4) !important;
        color: #F0EAD6 !important;
      }
      /* Stop the page's body click-spam from breaking glass via wash gradient layer */
    `;
    document.documentElement.appendChild(style);
  }

  /* ─── BOOT ───────────────────────────────────────────────── */
  function boot() {
    injectGlassTheme();
    injectPanel();
    startResponseObserver();
    /* Barge-in watcher · runs once SR has mic permission */
    setTimeout(startBargeWatcher, 2500);
    // Auto-start with chrome.storage gated preference
    chrome.storage.local.get(['agyvenom_autostart'], (v) => {
      if (v.agyvenom_autostart !== false) {
        // Try; will fail without user gesture · panel button gives them the gesture
        const ok = startSR();
        if (!ok) setStatus('click Start to grant mic');
      }
    });
  }

  // Some chat pages mount content after load · wait a beat for the input to exist
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 600);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  }

  /* ─── MESSAGE BUS · popup ↔ content ───────────────────────── */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'agyvenom-toggle') { toggleSR(); sendResponse({ listening: isListening }); }
    if (msg?.type === 'agyvenom-state')  { sendResponse({ listening: isListening, adapter: adapter.name }); }
    return true;
  });
})();
