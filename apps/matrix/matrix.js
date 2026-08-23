/* ════════════════════════════════════════════════════════════════════════
   XEN MATRIX — client engine (vanilla, no build step, no deps)

   Two data backends behind ONE UI:
     • MatrixClient  -> raw Matrix client-server API v3 @ matrix.beeper.com
                        (PRIMARY; works from a public browser — CORS verified)
     • BeeperClient  -> Beeper Desktop local REST API @ localhost:23373/v1
                        (FALLBACK; localhost only)

   Security: token lives ONLY in localStorage("xenmx.session"). Never embedded,
   never uploaded anywhere but the homeserver / local API the user chose.
   ════════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const SS = 'xenmx.session';

const app   = $('#app');
const stat  = $('#login-status');
const connDot = $('#conn-dot');

/* ─────────────────── tiny helpers ─────────────────── */
const esc = (s) => (s ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = (ts) => { if(!ts) return ''; const d=new Date(ts);
  return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); };
const fmtRel = (ts) => { if(!ts) return ''; const d=new Date(ts), n=new Date();
  const day = (a)=> a.toDateString();
  if(day(d)===day(n)) return fmtTime(ts);
  const y=new Date(n); y.setDate(n.getDate()-1);
  if(day(d)===day(y)) return 'Yesterday';
  if(n - d < 6*864e5) return d.toLocaleDateString([], {weekday:'short'});
  return d.toLocaleDateString([], {month:'numeric', day:'numeric'}); };
const dayKey = (ts) => new Date(ts).toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
const initials = (name) => (name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '#';
const setStatus = (msg, cls='') => { stat.textContent = msg; stat.className = 'login-status' + (cls?' '+cls:''); };

/* network badge per bridge */
const NET = {
  whatsapp:'🟢', telegram:'✈', signal:'🔒', instagram:'📸', facebook:'f',
  messenger:'f', discord:'🎮', slack:'#', imessage:'', sms:'💬', gmessages:'💬',
  googlechat:'G', linkedin:'in', twitter:'𝕏', x:'𝕏', googlevoice:'☎', gvoice:'☎',
  beeper:'✺', matrix:'◆'
};
function netOf(s){ // derive a bridge key from a room/account string or matrix id
  s = (s||'').toLowerCase();
  for(const k of Object.keys(NET)) if(s.includes(k)) return k;
  if(s.includes('whats')) return 'whatsapp';
  if(s.includes('insta')) return 'instagram';
  if(s.includes('fb')||s.includes('face')||s.includes('messenger')) return 'facebook';
  if(s.includes('tg')) return 'telegram';
  if(s.includes('gvoice')||s.includes('google voice')) return 'googlevoice';
  return 'beeper';
}

/* ════════════════════════════════════════════════════════════════════════
   BACKEND A — raw Matrix client-server API
   ════════════════════════════════════════════════════════════════════════ */
class MatrixClient {
  constructor({ baseUrl, token }) {
    this.base = baseUrl.replace(/\/+$/,'');
    this.token = token;
    this.txn = Date.now();
    this.nextBatch = null;
    this.rooms = new Map();      // roomId -> room model
    this.stop = false;
    this.userId = null;
    this.onRooms = () => {};
    this.onRoomUpdate = () => {};
    this.onState = () => {};
  }
  url(p){ return this.base + '/_matrix/client' + p; }
  async req(method, path, { body, query } = {}) {
    let u = this.url(path);
    if (query) u += '?' + new URLSearchParams(query);
    const r = await fetch(u, {
      method,
      headers: { 'Authorization':'Bearer '+this.token,
                 ...(body ? {'Content-Type':'application/json'} : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) {
      let e; try { e = await r.json(); } catch { e = {}; }
      const err = new Error(e.error || ('HTTP '+r.status));
      err.code = e.errcode; err.status = r.status; throw err;
    }
    return r.status === 204 ? {} : r.json();
  }
  async whoami(){ const d = await this.req('GET','/v3/account/whoami');
    this.userId = d.user_id; return d.user_id; }

  mxc(uri, w=64, h=64){ // mxc:// -> thumbnail http url (token via query for <img>)
    if(!uri || !uri.startsWith('mxc://')) return '';
    const id = uri.slice(6);
    return `${this.base}/_matrix/client/v1/media/thumbnail/${id}` +
           `?width=${w}&height=${h}&method=crop`;
  }

  async start() {
    this.onState('sync');
    await this.whoami();
    // initial sync — lazy members, modest message cap
    const filter = encodeURIComponent(JSON.stringify({
      room:{ timeline:{ limit:20 }, state:{ lazy_load_members:true } }
    }));
    let first = true;
    while (!this.stop) {
      try {
        const q = { timeout: first ? 0 : 30000, filter };
        if (this.nextBatch) q.since = this.nextBatch;
        const data = await this.req('GET','/v3/sync',{ query:q });
        this.nextBatch = data.next_batch;
        this.applySync(data, first);
        if (first) { first = false; this.onRooms([...this.rooms.values()]); }
        this.onState('live');
      } catch (e) {
        if (this.stop) break;
        if (e.status === 401) { this.onState('dead', e); break; }
        this.onState('sync');               // transient — back off then retry
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
  destroy(){ this.stop = true; }

  applySync(data, first) {
    const j = data.rooms?.join || {};
    for (const [rid, rd] of Object.entries(j)) {
      let room = this.rooms.get(rid);
      if (!room) { room = { id:rid, name:rid, avatar:'', members:{},
                            events:[], unread:0, last:0, preview:'', net:'beeper' };
                   this.rooms.set(rid, room); }
      // state -> name / avatar / members
      for (const ev of (rd.state?.events || [])) this.absorbState(room, ev);
      // timeline
      for (const ev of (rd.timeline?.events || [])) {
        if (ev.type === 'm.room.member' || ev.type?.startsWith('m.room.')) this.absorbState(room, ev);
        if (ev.type === 'm.room.message') this.absorbMessage(room, ev);
      }
      const uc = rd.unread_notifications?.notification_count;
      if (typeof uc === 'number') room.unread = uc;
      if (!room.name || room.name === rid) room.name = this.deriveName(room, rid);
      room.net = netOf(room.name + ' ' + rid);
      if (!first) this.onRoomUpdate(room);
    }
    // leaves
    for (const rid of Object.keys(data.rooms?.leave || {})) this.rooms.delete(rid);
  }
  absorbState(room, ev) {
    if (ev.type === 'm.room.name')   room.name = ev.content?.name || room.name;
    if (ev.type === 'm.room.avatar') room.avatar = ev.content?.url || room.avatar;
    if (ev.type === 'm.room.member' && ev.content) {
      room.members[ev.state_key] = {
        name: ev.content.displayname || ev.state_key,
        avatar: ev.content.avatar_url || ''
      };
    }
  }
  absorbMessage(room, ev) {
    if (room.events.some(e => e.id === ev.event_id)) return;
    const c = ev.content || {};
    const m = {
      id: ev.event_id, sender: ev.sender, ts: ev.origin_server_ts,
      body: c.body || '', msgtype: c.msgtype || 'm.text',
      url: c.url ? this.mxc(c.url, 480, 480) : '',
      mine: ev.sender === this.userId
    };
    room.events.push(m);
    room.events.sort((a,b)=>a.ts-b.ts);
    if (room.events.length > 200) room.events = room.events.slice(-200);
    room.last = m.ts;
    room.preview = (m.mine ? 'You: ' : '') +
      (m.msgtype === 'm.image' ? '📷 Photo' :
       m.msgtype === 'm.video' ? '🎬 Video' :
       m.msgtype === 'm.audio' ? '🎙 Audio' :
       m.msgtype === 'm.file'  ? '📎 File'  : m.body);
  }
  deriveName(room, rid) {
    const others = Object.entries(room.members)
      .filter(([id]) => id !== this.userId)
      .map(([,m]) => m.name);
    room.isGroup = others.length > 1;
    if (others.length === 1) return others[0];
    if (others.length > 1)  return others.slice(0,3).join(', ');
    return rid;
  }
  senderName(room, id){ return room.members[id]?.name || (id||'').split(':')[0].replace('@',''); }
  senderAvatar(room, id){ const u = room.members[id]?.avatar; return u ? this.mxc(u,64,64) : ''; }

  async loadOlder(/*room*/){ /* initial 20 is enough for v1; pagination is a future add */ }

  async send(room, text) {
    const txnId = 'xenmx' + (this.txn++);
    return this.req('PUT', `/v3/rooms/${encodeURIComponent(room.id)}/send/m.room.message/${txnId}`,
      { body: { msgtype:'m.text', body:text } });
  }
  async markRead(room){
    const last = room.events[room.events.length-1];
    if(!last) return;
    try{ await this.req('POST',
      `/v3/rooms/${encodeURIComponent(room.id)}/read_markers`,
      { body:{ 'm.fully_read':last.id, 'm.read':last.id } }); }catch{}
    room.unread = 0;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   BACKEND B — Beeper Desktop local REST API (localhost:23373/v1)
   Mirrors the MatrixClient surface so the UI is identical.
   ════════════════════════════════════════════════════════════════════════ */
class BeeperClient {
  constructor({ baseUrl, token }) {
    this.base = baseUrl.replace(/\/+$/,'') + '/v1';
    this.token = token || '';
    this.rooms = new Map();
    this.stop = false;
    this.userId = 'me';
    this.onRooms = () => {}; this.onRoomUpdate = () => {}; this.onState = () => {};
  }
  async req(method, path, { body, query } = {}) {
    let u = this.base + path;
    if (query) u += '?' + new URLSearchParams(query);
    const h = {};
    if (this.token) h['Authorization'] = 'Bearer ' + this.token;
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch(u, { method, headers:h, body: body?JSON.stringify(body):undefined });
    if (!r.ok) { const err=new Error('HTTP '+r.status); err.status=r.status; throw err; }
    return r.status === 204 ? {} : r.json();
  }
  async start() {
    this.onState('sync');
    try { await this.refreshChats(); this.onRooms([...this.rooms.values()]); this.onState('live'); }
    catch (e) { this.onState('dead', e); return; }
    // poll for new chats / messages every 5s (simple, robust)
    while (!this.stop) {
      await new Promise(r=>setTimeout(r,5000));
      if (this.stop) break;
      try { await this.refreshChats(); this.onState('live'); }
      catch { this.onState('sync'); }
    }
  }
  destroy(){ this.stop = true; }

  // The Beeper Desktop API exposes search-chats / list-messages / send-message.
  // We hit the documented REST equivalents under /v1.
  async refreshChats() {
    let list = [];
    try {
      const d = await this.req('GET','/chats', { query:{ limit:100, type:'all' } });
      list = d.items || d.chats || d || [];
    } catch {
      const d = await this.req('GET','/search-chats', { query:{ query:'', limit:100 } });
      list = d.items || d || [];
    }
    for (const c of list) {
      const rid = c.id || c.chatID || c.guid;
      if (!rid) continue;
      let room = this.rooms.get(rid);
      if (!room) { room = { id:rid, events:[], _msgLoaded:false }; this.rooms.set(rid, room); }
      room.name    = c.title || c.name || c.displayName || rid;
      room.avatar  = c.imageURL || c.avatar || '';
      room.unread  = c.unreadCount ?? c.unread ?? 0;
      room.last    = new Date(c.lastActivity || c.timestamp || c.updatedAt || 0).getTime() || room.last || 0;
      room.preview = (c.lastMessage?.text) || c.preview || c.subtitle || room.preview || '';
      room.net     = netOf((c.network||c.accountID||c.service||'') + ' ' + room.name);
      room.isGroup = (c.type === 'group') || (c.isGroup === true) ||
                     ((c.participants?.length ?? c.memberCount ?? 0) > 2);
      this.onRoomUpdate(room);
    }
  }
  async openRoom(room) {
    const d = await this.req('GET','/messages', { query:{ chatID:room.id, limit:50 } })
              .catch(()=>this.req('GET','/list-messages',{ query:{ chatID:room.id, limit:50 } }));
    const items = d.items || d.messages || d || [];
    room.events = items.map(m => ({
      id: m.id || m.guid, sender: m.senderID || m.sender || '',
      ts: new Date(m.timestamp || m.date || 0).getTime(),
      body: m.text || m.body || '', msgtype: m.attachments?.length ? 'm.image':'m.text',
      url: m.attachments?.[0]?.srcURL || '',
      mine: !!(m.isSender || m.fromMe || m.mine),
      senderName: m.senderName || m.sender || ''
    })).sort((a,b)=>a.ts-b.ts);
    room._msgLoaded = true;
    return room;
  }
  senderName(room, id, ev){ return ev?.senderName || (id||'').split(/[:@]/).pop() || 'Them'; }
  senderAvatar(){ return ''; }
  async loadOlder(){}
  async send(room, text) {
    return this.req('POST','/messages', { body:{ chatID:room.id, text } })
      .catch(()=>this.req('POST','/send-message',{ body:{ chatID:room.id, text } }));
  }
  async markRead(room){ room.unread = 0;
    try{ await this.req('POST','/chats/'+encodeURIComponent(room.id)+'/read',{}); }catch{} }
}

/* ════════════════════════════════════════════════════════════════════════
   UI CONTROLLER
   ════════════════════════════════════════════════════════════════════════ */
let client = null;
let activeRoom = null;
let netFilter = 'all';
let textFilter = '';

const roomsList = $('#rooms-list');
const timeline  = $('#timeline');
const composer  = $('#composer');
const msgInput  = $('#msg-input');
const mainEl    = $('#main');

function setConn(state){
  connDot.className = 'dot-conn ' +
    (state==='live'?'live':state==='sync'?'sync':state==='dead'?'dead':'');
}

/* ---------- room list rendering ---------- */
function sortedRooms(){
  let r = [...client.rooms.values()].filter(x => x.last || x.preview);
  if (netFilter !== 'all') r = r.filter(x => x.net === netFilter);
  if (textFilter) r = r.filter(x => (x.name||'').toLowerCase().includes(textFilter));
  return r.sort((a,b) => (b.last||0) - (a.last||0));
}
function avatarHTML(room){
  const img = room.avatar
    ? (room.avatar.startsWith('mxc://') ? client.mxc(room.avatar,92,92) : room.avatar)
    : '';
  const badge = NET[room.net] || '';
  return `<div class="avatar">${img?`<img src="${esc(img)}" alt="" onerror="this.remove()">`:esc(initials(room.name))}`
       + (badge?`<span class="net-badge">${badge}</span>`:'') + `</div>`;
}
function renderRooms(){
  const rows = sortedRooms();
  if (!rows.length){
    roomsList.innerHTML = `<div class="rooms-empty">No chats yet.<br>Syncing your bridges…</div>`;
    return;
  }
  roomsList.innerHTML = rows.map(room => `
    <div class="room ${room.unread?'unread':''} ${activeRoom&&activeRoom.id===room.id?'active':''}"
         role="listitem" data-id="${esc(room.id)}">
      ${avatarHTML(room)}
      <div class="room-mid">
        <div class="room-top">
          <span class="room-name">${esc(room.name)}</span>
          <span class="room-time">${fmtRel(room.last)}</span>
        </div>
        <div class="room-top">
          <span class="room-prev">${esc((room.preview||'').slice(0,80))}</span>
          ${room.unread?`<span class="badge">${room.unread>99?'99+':room.unread}</span>`:''}
        </div>
      </div>
    </div>`).join('');
  $$('.room', roomsList).forEach(el =>
    el.onclick = () => openRoom(client.rooms.get(el.dataset.id)));
  renderChips();
}
function renderChips(){
  const chips = $('#bridge-chips');
  const present = new Set([...client.rooms.values()].map(r=>r.net));
  const order = ['all','imessage','sms','whatsapp','telegram','instagram','facebook',
                 'discord','slack','googlevoice','signal'].filter(n => n==='all' || present.has(n));
  chips.innerHTML = order.map(n =>
    `<button class="chip ${netFilter===n?'on':''}" data-net="${n}">${n==='all'?'All':n[0].toUpperCase()+n.slice(1)}</button>`
  ).join('');
  $$('.chip', chips).forEach(c => c.onclick = () => {
    netFilter = c.dataset.net; renderRooms();
  });
}

/* ---------- conversation rendering ---------- */
async function openRoom(room){
  if (!room) return;
  activeRoom = room;
  mainEl.dataset.open = 'convo';
  composer.hidden = false;
  $('#empty-convo')?.remove();

  // header
  const sub = (NET[room.net]?NET[room.net]+' ':'') + (room.net||'');
  $('#convo-id').innerHTML = `${avatarHTML(room)}
    <div class="meta"><div class="nm">${esc(room.name)}</div>
    <div class="sub">${esc(sub)}</div></div>`;

  // load full history for local backend (matrix already has timeline from sync)
  if (client.openRoom && !room._msgLoaded){
    timeline.innerHTML = `<div class="empty-convo"><div class="empty-glyph">✺</div><p>Loading…</p></div>`;
    try { await client.openRoom(room); } catch {}
  }
  renderTimeline(true);
  client.markRead(room).then(()=>renderRooms());
  renderRooms();
  setTimeout(()=>msgInput.focus(), 50);
}
function renderTimeline(scroll){
  if (!activeRoom){ return; }
  const evs = activeRoom.events || [];
  if (!evs.length){
    timeline.innerHTML = `<div class="empty-convo"><div class="empty-glyph">✺</div><p>No messages yet</p></div>`;
    return;
  }
  let html = '', lastDay = '';
  for (const m of evs){
    const dk = dayKey(m.ts);
    if (dk !== lastDay){ html += `<div class="day-sep">${esc(dk)}</div>`; lastDay = dk; }
    const who = m.mine ? 'me' : 'them';
    const showSender = !m.mine && activeRoom.isGroup === true; // sender name only in groups
    const senderNm = m.mine ? '' : (client.senderName(activeRoom, m.sender, m));
    const stat = m.mine ? `<span class="stat">${m.pending?'…':m.failed?'⚠':'✓'}</span>` : '';
    let bubble;
    if (m.msgtype==='m.image' && m.url)
      bubble = `<div class="bubble media"><img src="${esc(m.url)}" alt="${esc(m.body)}" loading="lazy" onerror="this.parentNode.textContent='📷 '+this.alt"></div>`;
    else if (['m.video','m.audio','m.file'].includes(m.msgtype))
      bubble = `<div class="bubble att">${m.msgtype==='m.video'?'🎬':m.msgtype==='m.audio'?'🎙':'📎'} ${esc(m.body||'attachment')}</div>`;
    else
      bubble = `<div class="bubble">${esc(m.body)}</div>`;
    html += `<div class="msg ${who} ${m.pending?'pending':''} ${m.failed?'failed':''}">
      ${(showSender&&senderNm)?`<span class="sender">${esc(senderNm)}</span>`:''}
      ${bubble}
      <span class="ts">${fmtTime(m.ts)}${stat}</span>
    </div>`;
  }
  timeline.innerHTML = html;
  if (scroll) timeline.scrollTop = timeline.scrollHeight;
  else if (timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 160)
    timeline.scrollTop = timeline.scrollHeight;
}

/* ---------- send ---------- */
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !activeRoom) return;
  msgInput.value = '';
  const optimistic = { id:'tmp'+Date.now(), sender:client.userId, ts:Date.now(),
                       body:text, msgtype:'m.text', mine:true, pending:true };
  activeRoom.events.push(optimistic);
  activeRoom.last = optimistic.ts; activeRoom.preview = 'You: ' + text;
  renderTimeline(true); renderRooms();
  try {
    const res = await client.send(activeRoom, text);
    optimistic.pending = false;
    if (res && res.event_id) optimistic.id = res.event_id;
  } catch (err) {
    optimistic.pending = false; optimistic.failed = true;
  }
  renderTimeline(false);
});

/* ---------- live updates from backend ---------- */
function wireClient(){
  client.onState = (s) => setConn(s);
  client.onRooms = () => renderRooms();
  client.onRoomUpdate = (room) => {
    // throttle re-render
    clearTimeout(wireClient._t);
    wireClient._t = setTimeout(()=>{
      renderRooms();
      if (activeRoom && room.id === activeRoom.id) renderTimeline(false);
    }, 120);
  };
}

/* ---------- nav / chrome ---------- */
$('#btn-back').onclick = () => { mainEl.dataset.open = 'rooms'; activeRoom = null; renderRooms(); };
$('#room-filter').addEventListener('input', (e)=>{ textFilter = e.target.value.toLowerCase().trim(); renderRooms(); });
$('#btn-logout').onclick = () => {
  if (!confirm('Sign out and forget the saved token on this device?')) return;
  localStorage.removeItem(SS);
  if (client) client.destroy();
  location.reload();
};

/* ════════════════════════════════════════════════════════════════════════
   LOGIN FLOW
   ════════════════════════════════════════════════════════════════════════ */
const formHS = $('#form-homeserver');
const formLocal = $('#form-local');
$$('.mode-btn').forEach(b => b.onclick = () => {
  $$('.mode-btn').forEach(x=>{ x.classList.toggle('is-on', x===b); x.setAttribute('aria-selected', x===b); });
  const local = b.dataset.mode === 'local';
  formHS.hidden = local; formLocal.hidden = !local; setStatus('');
});
$('#btn-reveal').onclick = () => {
  const i = $('#in-token'); const show = i.type==='password';
  i.type = show?'text':'password'; $('#btn-reveal').textContent = show?'hide':'show';
};

async function boot(session){
  app.dataset.view = 'main';
  client = session.mode === 'local'
    ? new BeeperClient({ baseUrl: session.baseUrl, token: session.token })
    : new MatrixClient({ baseUrl: session.baseUrl, token: session.token });
  wireClient();
  setConn('sync');
  client.start().catch(err => {
    setConn('dead');
    alert('Connection lost: ' + (err?.message||err) +
          '\n\nIf this is a CORS "Failed to fetch", try Beeper Desktop mode, ' +
          'or point the homeserver at a same-origin proxy. See the README.');
  });
}

formHS.addEventListener('submit', async (e) => {
  e.preventDefault();
  const baseUrl = $('#in-hs').value.trim() || 'https://matrix.beeper.com';
  const token = $('#in-token').value.trim();
  if (!token) return setStatus('Paste your access token first.', 'err');
  setStatus('Connecting…', 'work');
  const test = new MatrixClient({ baseUrl, token });
  try {
    await test.whoami();
    const session = { mode:'homeserver', baseUrl, token };
    localStorage.setItem(SS, JSON.stringify(session));
    setStatus('Connected ✓', 'ok');
    test.destroy();
    boot(session);
  } catch (err) {
    if (err.status === 401 || err.code === 'M_UNKNOWN_TOKEN')
      setStatus('That token was rejected by the homeserver.', 'err');
    else if (err.message === 'Failed to fetch')
      setStatus('Network/CORS blocked. Check the URL, or use Beeper Desktop mode.', 'err');
    else setStatus('Error: ' + err.message, 'err');
  }
});

formLocal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const baseUrl = $('#in-local-url').value.trim() || 'http://localhost:23373';
  const token = $('#in-local-token').value.trim();
  setStatus('Probing Beeper Desktop…', 'work');
  try {
    const r = await fetch(baseUrl.replace(/\/+$/,'') + '/v1/info').catch(()=>null);
    if (!r || !r.ok) throw new Error('Beeper Desktop API not reachable at ' + baseUrl);
    const session = { mode:'local', baseUrl, token };
    localStorage.setItem(SS, JSON.stringify(session));
    setStatus('Beeper Desktop found ✓', 'ok');
    boot(session);
  } catch (err) {
    setStatus(err.message + ' — is Beeper Desktop running?', 'err');
  }
});

/* ---------- auto-resume saved session ---------- */
(function init(){
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SS) || 'null'); } catch {}
  if (session && session.token !== undefined && (session.mode==='local' || session.token)) {
    boot(session);
  } else {
    app.dataset.view = 'login';
  }
})();

})();
