/* ============ Aura OS — core engine ============ */
(function(){
  const os = document.getElementById('os');
  const $ = (s,r=document)=>r.querySelector(s);

  /* ---- persistent store ---- */
  const store = {
    get(k,d){ try{ const v=localStorage.getItem('aura:'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
    set(k,v){ try{ localStorage.setItem('aura:'+k,JSON.stringify(v)); }catch(e){} }
  };

  /* ---- layout ---- */
  const GRID = ['clock','calc','weather','calendar','notes','reminders','photos','settings'];
  const DOCK = ['messages','browser','music','camera'];

  /* ---- clocks ---- */
  function fmtTime(d){ let h=d.getHours()%12||12, m=String(d.getMinutes()).padStart(2,'0'); return `${h}:${m}`; }
  function fmtDate(d){ return d.toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'}); }
  function tickClocks(){
    const d=new Date();
    $('#sb-time').textContent=fmtTime(d);
    $('#lock-time').textContent=fmtTime(d);
    $('#lock-date').textContent=fmtDate(d);
  }
  tickClocks(); setInterval(tickClocks, 1000);

  /* ---- lock screen notifications ---- */
  $('#lock-notes').innerHTML = [
  ].map(([ic,c,app,title,text,t])=>`
    <div class="lock-note" data-app="${ic}">
      <span class="ln-ic" style="background:${c}">${miniGlyph(ic)}</span>
      <div class="ln-body"><div class="ln-title">${title}<span>${t}</span></div><div class="ln-text">${text}</div></div>
    </div>`).join('');
  function miniGlyph(ic){
    if(ic==='messages') return '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 4c4.5 0 8 2.9 8 6.5S16.5 17 12 17c-.9 0-1.8-.1-2.6-.4L5 18l1-3.1A6.7 6.7 0 0 1 4 10.5C4 6.9 7.5 4 12 4z"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="#fff"><rect x="4" y="6" width="16" height="15" rx="3"/><rect x="4" y="6" width="16" height="5" rx="2" fill="#fff" opacity=".6"/></svg>';
  }

  /* ===================== Home build ===================== */
  function appCell(id){
    const a=window.APPS[id]; if(!a) return '';
    return `<button class="app-cell" data-app="${id}">
      <span class="app-ico">${window.ICONS.render(a.icon)}</span>
      <span class="app-name">${a.name}</span></button>`;
  }
  $('#grid').innerHTML = GRID.map(appCell).join('');
  $('#dock').innerHTML = DOCK.map(appCell).join('');
  $('#dots').innerHTML = '<i class="on"></i><i></i>';

  /* widgets */
  const today=new Date();
  $('#widgets').innerHTML = `
    <button class="widget w-cal w-flex" data-app="calendar">
      <div class="wc-dow">${today.toLocaleDateString('en-US',{weekday:'long'}).toUpperCase()}</div>
      <div class="wc-day">${today.getDate()}</div>
      <div class="wc-ev"><div class="wc-t">${today.toLocaleDateString('en-US',{month:'long', day:'numeric', year:'numeric'})}</div></div>
    </button>`;

  /* ===================== Mode control ===================== */
  function setMode(m){ os.dataset.mode=m; }
  setMode('lock');

  /* ===================== App open / close ===================== */
  let currentCleanup=null;
  const appLayer=$('#app-layer');

  function openApp(id, originEl){
    const a=window.APPS[id]; if(!a) return;
    closeControlCenter();
    const win=document.createElement('section');
    win.className='app-window';
    win.dataset.screenLabel=a.name;
    if(originEl){
      const r=originEl.getBoundingClientRect();
      win.style.setProperty('--ox',((r.left+r.width/2)/window.innerWidth*100)+'%');
      win.style.setProperty('--oy',((r.top+r.height/2)/window.innerHeight*100)+'%');
    }
    const body=document.createElement('div'); body.className='app-body';
    win.appendChild(body);
    appLayer.appendChild(win);
    setMode('app');
    try{ currentCleanup = a.mount(body, win) || null; }catch(e){ console.error('app mount error',e); }
  }

  function closeApp(){
    const win=appLayer.querySelector('.app-window:last-child');
    if(!win){ setMode('home'); return; }
    if(currentCleanup){ try{ currentCleanup(); }catch(e){} currentCleanup=null; }
    win.classList.add('closing');
    setMode('home');
    win.addEventListener('animationend', ()=>win.remove(), {once:true});
    setTimeout(()=>{ if(win.parentNode) win.remove(); }, 420);
  }

  window.Aura = { store, open:openApp, close:closeApp, syncStatus };

  /* delegate app launches */
  document.addEventListener('click',(e)=>{
    const cell=e.target.closest('[data-app]');
    if(!cell) return;
    // lock-note tap should unlock first
    if(cell.classList.contains('lock-note')){ unlock(()=>openApp(cell.dataset.app)); return; }
    if(os.dataset.mode==='home'){ openApp(cell.dataset.app, cell.querySelector('.app-ico')||cell); }
  });

  /* ===================== Home indicator (close app / home) ===================== */
  const hi=$('#home-indicator');
  hi.addEventListener('click',()=>{ if(os.dataset.mode==='app') closeApp(); });

  /* swipe up on bottom to go home from app */
  vDrag(hi, {
    onEnd:(dy)=>{ if(os.dataset.mode==='app' && dy < -30) closeApp(); }
  });

  /* ===================== Lock screen unlock ===================== */
  const lock=$('#lockscreen');
  function unlock(after){
    setMode('home');
    lock.style.transform=''; lock.style.opacity='';
    if(after) setTimeout(after, 260);
  }
  function lockDevice(){ closeApp(); closeControlCenter(); setMode('lock'); lock.style.transform=''; lock.style.opacity=''; }

  let lockDrag=0;
  vDrag(lock, {
    enabled:()=> os.dataset.mode==='lock',
    onMove:(dy)=>{ lockDrag=dy; if(dy<0){ lock.style.transition='none'; lock.style.transform=`translateY(${dy}px)`; lock.style.opacity=String(Math.max(0.2,1+dy/400)); } },
    onEnd:(dy)=>{ lock.style.transition=''; if(dy<-70){ unlock(); } else { lock.style.transform=''; lock.style.opacity=''; } }
  });
  // tap hint / grip also unlocks
  $('.lock-hint').addEventListener('click',()=>unlock());
  $('#lock-cam').addEventListener('click',(e)=>{ e.stopPropagation(); unlock(()=>openApp('camera')); });
  $('#lock-flash').addEventListener('click',(e)=>{ e.stopPropagation(); e.currentTarget.classList.toggle('flash-on'); });

  /* ===================== Control Center ===================== */
  const cc=$('#control-center');
  buildCC();
  function openControlCenter(){ if(os.dataset.mode==='lock') return; os.dataset.cc='open'; }
  function closeControlCenter(){ os.dataset.cc=''; }
  $('#cc-scrim').addEventListener('click', closeControlCenter);
  // pull down from top-right grab zone
  vDrag($('#cc-grab'), {
    onMove:(dy)=>{ if(dy>4) openControlCenter(); },
    onEnd:(dy)=>{ if(dy>30) openControlCenter(); }
  });
  $('#cc-grab').addEventListener('click', openControlCenter);
  // swipe up to close CC
  vDrag(cc, { onEnd:(dy)=>{ if(dy<-30) closeControlCenter(); } });

  function buildCC(){
    const t=store.get('toggles',{wifi:true,bluetooth:true,airplane:false,cellular:true,darkmode:true,lowpower:false});
    cc.innerHTML = `
      <div class="cc-tile cc-conn">
        <div class="cc-mini"><button class="cc-btn ${t.airplane?'on':''}" data-tg="airplane" style="--on:#ff9f0a">${cg('plane')}</button><span class="cc-lbl">Airplane</span></div>
        <div class="cc-mini"><button class="cc-btn ${t.cellular?'on':''}" data-tg="cellular" style="--on:#3ad15b">${cg('cell')}</button><span class="cc-lbl">Cellular</span></div>
        <div class="cc-mini"><button class="cc-btn ${t.wifi?'on':''}" data-tg="wifi" style="--on:#2f8cff">${cg('wifi')}</button><span class="cc-lbl">Wi-Fi</span></div>
        <div class="cc-mini"><button class="cc-btn ${t.bluetooth?'on':''}" data-tg="bluetooth" style="--on:#2f8cff">${cg('bt')}</button><span class="cc-lbl">Bluetooth</span></div>
      </div>
      <div class="cc-tile cc-music" data-app="music">
        <span class="ccm-art"></span><div><div class="ccm-t">Neon Horizon</div><div class="ccm-s">The Synthwave Collective</div></div>
      </div>
      <div class="cc-tile cc-tiles4">
        <button class="cc-btn cc-toggle ${t.darkmode?'on':''}" data-tg="darkmode" style="--on:#5b6473; width:100%; border-radius:14px">${cg('moon')}</button>
        <button class="cc-btn cc-toggle ${t.lowpower?'on':''}" data-tg="lowpower" style="--on:#ffd60a; width:100%; border-radius:14px">${cg('batt')}</button>
        <button class="cc-btn cc-toggle" id="cc-lock" style="width:100%; border-radius:14px">${cg('lock')}</button>
        <button class="cc-btn cc-toggle" data-app="camera" style="width:100%; border-radius:14px">${cg('cam')}</button>
      </div>
      <div class="cc-tile cc-slider" data-slider="bright"><div class="ccs-fill" style="height:70%"></div><div class="ccs-ic">${cg('sun')}</div></div>
      <div class="cc-tile cc-slider" data-slider="vol"><div class="ccs-fill" style="height:55%"></div><div class="ccs-ic">${cg('spk')}</div></div>`;
    cc.querySelectorAll('[data-tg]').forEach(b=> b.addEventListener('click',(e)=>{ e.stopPropagation();
      const k=b.dataset.tg; t[k]=!t[k]; b.classList.toggle('on'); store.set('toggles',t); syncStatus(); }));
    cc.querySelector('#cc-lock').addEventListener('click',(e)=>{ e.stopPropagation(); lockDevice(); });
    cc.querySelectorAll('[data-app]').forEach(b=> b.addEventListener('click',(e)=>{ e.stopPropagation(); closeControlCenter(); setTimeout(()=>openApp(b.dataset.app),120); }));
    // sliders
    cc.querySelectorAll('.cc-slider').forEach(s=>{
      const fill=s.querySelector('.ccs-fill');
      const set=(clientY)=>{ const r=s.getBoundingClientRect(); let p=1-(clientY-r.top)/r.height; p=Math.max(0.04,Math.min(1,p)); fill.style.height=(p*100)+'%'; };
      let dragging=false;
      s.addEventListener('pointerdown',(e)=>{ e.stopPropagation(); dragging=true; s.setPointerCapture(e.pointerId); set(e.clientY); });
      s.addEventListener('pointermove',(e)=>{ if(dragging) set(e.clientY); });
      s.addEventListener('pointerup',()=>dragging=false);
    });
  }
  syncStatus();
  function syncStatus(){
    const t=store.get('toggles',{});
    const wifi=$('#sb-wifi'), sig=$('.sb-signal');
    if(t.airplane){ wifi.style.display='none'; sig.style.opacity='.3'; }
    else { wifi.style.display = t.wifi===false?'none':''; sig.style.opacity='1'; }
    if(t.lowpower) $('#sb-batt-fill').style.background='#ffd60a'; else $('#sb-batt-fill').style.background='#fff';
  }

  /* ===================== keyboard (desktop preview convenience) ===================== */
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'){ if(os.dataset.cc==='open') closeControlCenter(); else if(os.dataset.mode==='app') closeApp(); else if(os.dataset.mode==='home') lockDevice(); }
    if(e.key==='Enter' && os.dataset.mode==='lock') unlock();
  });

  /* ===================== vertical drag helper ===================== */
  function vDrag(elm, {enabled, onMove, onEnd}={}){
    let startY=null, id=null;
    elm.addEventListener('pointerdown',(e)=>{
      if(enabled && !enabled()) return;
      startY=e.clientY; id=e.pointerId;
      try{ elm.setPointerCapture(id); }catch(_){}
    });
    elm.addEventListener('pointermove',(e)=>{ if(startY==null) return; onMove&&onMove(e.clientY-startY); });
    const end=(e)=>{ if(startY==null) return; const dy=e.clientY-startY; startY=null; onEnd&&onEnd(dy); };
    elm.addEventListener('pointerup',end);
    elm.addEventListener('pointercancel',end);
  }

  /* ---- control-center glyphs ---- */
  function cg(k){
    const P={
      plane:'M21 16v-2l-8-5V4a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-3.5L21 16z',
      cell:'M4 16h2v3H4zM8 13h2v6H8zM12 10h2v9h-2zM16 6h2v13h-2z',
      wifi:'M12 18.5l2.3-2.9a3 3 0 0 0-4.6 0L12 18.5zm0-5.7a6.2 6.2 0 0 1 4.9 2.3l1.8-2.3a9.3 9.3 0 0 0-13.4 0l1.8 2.3A6.2 6.2 0 0 1 12 12.8zM12 7a12.3 12.3 0 0 0-9.6 4.5L4.2 14a9.3 9.3 0 0 1 15.6 0l1.8-2.5A12.3 12.3 0 0 0 12 7z',
      bt:null,
      moon:'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
      batt:'M5 8h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm15 2v4h1v-4zM7 10l-1 4h3l-1 3 4-5H9l1-2z',
      lock:'M7 10V8a5 5 0 0 1 10 0v2h1v10H6V10h1zm2 0h6V8a3 3 0 0 0-6 0v2z',
      cam:'M9 4l-1.2 1.6H5A2 2 0 0 0 3 7.6V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7.6a2 2 0 0 0-2-2h-2.8L15 4H9Zm3 5.2a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z',
      sun:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2',
      spk:'M4 9v6h4l5 5V4L8 9H4zm12 .5a4 4 0 0 1 0 5l1.4 1.4a6 6 0 0 0 0-7.8L16 9.5z'
    };
    if(k==='bt') return '<svg viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8 7l8 5-4 3v-9l4 3-8 5"/></svg>';
    if(k==='sun') return '<svg viewBox="0 0 24 24"><path fill="none" stroke="#0b1020" stroke-width="2" stroke-linecap="round" d="'+P.sun+'"/></svg>';
    return `<svg viewBox="0 0 24 24"><path d="${P[k]}"/></svg>`;
  }
})();
