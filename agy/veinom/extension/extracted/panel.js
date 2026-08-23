const $ = id => document.getElementById(id);

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function refresh() {
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    const state = await chrome.tabs.sendMessage(tab.id, { type: 'agyvenom-state' });
    if (state) {
      $('adapterName').textContent = state.adapter || '—';
      $('dot').classList.toggle('live', !!state.listening);
      $('toggleBtn').textContent = state.listening ? 'Stop' : 'Start';
      $('status').textContent = state.listening
        ? `Listening on ${state.adapter} · speak naturally`
        : `Idle on ${state.adapter} · click Start`;
    }
  } catch (e) {
    $('status').textContent = 'Not on a supported chat page. Visit ChatGPT, Claude, Perplexity, Grok, Gemini, etc.';
    $('adapterName').textContent = '— offline —';
  }
}

$('toggleBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'agyvenom-toggle' });
    setTimeout(refresh, 200);
  } catch (e) { $('status').textContent = 'Cannot reach content script on this tab.'; }
});

$('reloadBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab?.id) chrome.tabs.reload(tab.id);
});

chrome.storage.local.get(['agyvenom_autostart'], v => {
  $('autostart').checked = v.agyvenom_autostart !== false;
});
$('autostart').addEventListener('change', e => {
  chrome.storage.local.set({ agyvenom_autostart: e.target.checked });
});

refresh();
