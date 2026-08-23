/* ============ hitthe.link — real launcher: Spotlight search + App Library ============
   Renders qi's real sites (sites.json) as an iOS home with:
   - Spotlight search (type to filter all 167 sites instantly)
   - App Library (all sites grouped into category folders, searchable)
   - dock with App Library button + pinned sites
   Tapping anything opens the real site in an in-OS window (iframe) w/ home indicator to return.
   Reads sites.json live so new sites auto-appear. */
(function(){
  let SITES=[];
  const $=(s,r=document)=>r.querySelector(s);
  const shortName=(t)=>{t=(t||'').split(/[—·|:]/)[0].trim();return t.length>20?t.slice(0,19)+'…':(t||'site');};
  const initials=(t)=>{const w=(t||'').replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);return(((w[0]||'?')[0]||'?')+((w[1]||'')[0]||'')).toUpperCase();};
  const PAL=['#2f8cff','#0fbf3f','#ff9f0a','#bf5af2','#ff453a','#64d2ff','#ffd60a','#ff7ab6','#5ac8fa','#30d158','#ff6482','#40c8e0'];
  const accent=(s)=>{let h=0;for(const c of(s||''))h=(h*31+c.charCodeAt(0))>>>0;return PAL[h%PAL.length];};

  function openSite(url,name){
    if(!window.Aura){location.href=url;return;}
    window.APPS['__site_open__']={name:name||'site',icon:'site',accent:'#0b1020',mount(body){
      body.classList.add('flush');
      const f=document.createElement('iframe');f.src=url;
      f.setAttribute('allow','clipboard-write; fullscreen; microphone; camera; autoplay; geolocation');
      f.style.cssText='width:100%;height:100%;border:0;background:#000;display:block';
      body.appendChild(f);}};
    window.Aura.open('__site_open__');
  }
  const cell=(s,big)=>`<button class="app-cell site-cell${big?' lib-cell':''}" data-url="${s.url}" data-name="${shortName(s.title).replace(/"/g,'&quot;')}" title="${(s.title||'').replace(/"/g,'&quot;')}">
      <span class="app-ico site-ico" style="--si:${accent(s.slug||s.url)}">${initials(s.title)}</span>
      <span class="app-name">${shortName(s.title)}</span></button>`;

  function buildHome(){
    const grid=$('#grid'); if(!grid) return;
    const byCat={}; SITES.forEach(s=>{const c=s.category||'Apps';(byCat[c]=byCat[c]||[]).push(s);});
    // search bar + categorized grid
    grid.innerHTML=`
      <div class="htl-search"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="htl-q" type="search" placeholder="Search ${SITES.length} apps" autocomplete="off" autocapitalize="off"/></div>
      <div id="htl-results" class="site-grid" hidden></div>
      <div id="htl-cats">${Object.keys(byCat).sort().map(cat=>`<div class="site-cat">${cat}</div><div class="site-grid">${byCat[cat].map(s=>cell(s)).join('')}</div>`).join('')}</div>`;
    wireSearch($('#htl-q'),$('#htl-results'),$('#htl-cats'));
  }

  function wireSearch(input,results,cats){
    if(!input) return;
    input.addEventListener('input',()=>{
      const q=input.value.trim().toLowerCase();
      if(!q){results.hidden=true;results.innerHTML='';if(cats)cats.hidden=false;return;}
      const hit=SITES.filter(s=>((s.title||'')+' '+(s.slug||'')+' '+(s.category||'')+' '+(s.desc||'')).toLowerCase().includes(q)).slice(0,60);
      results.innerHTML=hit.length?hit.map(s=>cell(s)).join(''):'<div class="site-cat">No matches</div>';
      results.hidden=false; if(cats)cats.hidden=true;
    });
  }

  function buildDock(){
    const dock=$('#dock'); if(!dock) return;
    const pinSlugs=['xen','xos','desk','dcz'];
    const pin=pinSlugs.map(sl=>SITES.find(s=>s.slug===sl)).filter(Boolean);
    while(pin.length<3 && SITES[pin.length]) pin.push(SITES[pin.length]);
    dock.innerHTML=pin.map(s=>cell(s)).join('')+
      `<button class="app-cell" id="htl-lib"><span class="app-ico lib-ico">${[0,1,2,3].map(()=>'<i></i>').join('')}</span><span class="app-name">Library</span></button>`;
    $('#htl-lib').addEventListener('click',(e)=>{e.stopPropagation();openLibrary();});
  }

  // iOS App Library: full-screen overlay, all sites in category folders + search
  function openLibrary(){
    let ov=$('#htl-library');
    if(!ov){ov=document.createElement('div');ov.id='htl-library';document.body.appendChild(ov);}
    const byCat={}; SITES.forEach(s=>{const c=s.category||'Apps';(byCat[c]=byCat[c]||[]).push(s);});
    ov.innerHTML=`
      <div class="lib-top">
        <div class="lib-title">App Library</div>
        <button class="lib-close" id="lib-x">Done</button>
      </div>
      <div class="htl-search lib-search"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="lib-q" type="search" placeholder="Search ${SITES.length} apps" autocomplete="off"/></div>
      <div id="lib-results" class="site-grid" hidden></div>
      <div id="lib-folders">${Object.keys(byCat).sort().map(cat=>`
        <div class="lib-folder">
          <div class="lib-fname">${cat} <span>${byCat[cat].length}</span></div>
          <div class="lib-fgrid">${byCat[cat].map(s=>cell(s,true)).join('')}</div>
        </div>`).join('')}</div>`;
    ov.classList.add('open');
    $('#lib-x').onclick=()=>ov.classList.remove('open');
    wireSearch($('#lib-q'),$('#lib-results'),$('#lib-folders'));
  }
  window.htlOpenLibrary=openLibrary;

  function boot(){
    fetch('sites.json',{cache:'no-store'}).then(r=>r.json()).then(d=>{
      SITES=(d.sites||[]).filter(s=>s&&s.url&&s.title);
      buildHome(); buildDock();
      const dots=$('#dots'); if(dots) dots.innerHTML='';
      // tap delegation (capture) for any site cell anywhere (home, results, library)
      document.addEventListener('click',(e)=>{const c=e.target.closest('.site-cell');if(!c)return;e.stopPropagation();openSite(c.dataset.url,c.dataset.name);},true);
    }).catch(()=>{const g=$('#grid');if(g)g.innerHTML='<div class="site-cat">Could not load sites.json</div>';});
  }

  const css=document.createElement('style');
  css.textContent=`
    #grid{display:block !important;padding-bottom:28px}
    .htl-search{display:flex;align-items:center;gap:8px;margin:6px 4px 16px;padding:11px 14px;border-radius:13px;
      background:rgba(255,255,255,.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:rgba(255,255,255,.7)}
    .htl-search input{flex:1;background:transparent;border:0;outline:0;color:#fff;font:400 16px -apple-system,system-ui,sans-serif}
    .htl-search input::placeholder{color:rgba(255,255,255,.5)}
    .site-cat{grid-column:1/-1;width:100%;font:600 12px/1 -apple-system,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);margin:18px 6px 10px}
    .site-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px 8px;margin-bottom:6px}
    @media(min-width:680px){.site-grid{grid-template-columns:repeat(6,1fr)}}
    .site-ico{display:flex;align-items:center;justify-content:center;font:700 22px/1 -apple-system,system-ui,sans-serif;color:#fff;
      background:linear-gradient(150deg,color-mix(in srgb,var(--si) 92%,#fff 8%),color-mix(in srgb,var(--si) 70%,#000 30%));
      box-shadow:0 6px 16px -6px var(--si),inset 0 1px 0 rgba(255,255,255,.35)}
    .lib-ico{display:grid !important;grid-template-columns:1fr 1fr;gap:3px;padding:9px;background:rgba(255,255,255,.14)}
    .lib-ico i{background:rgba(255,255,255,.65);border-radius:4px}
    /* App Library overlay */
    #htl-library{position:fixed;inset:0;z-index:80;background:rgba(8,10,20,.86);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
      transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.8,.2,1);overflow-y:auto;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 40px}
    #htl-library.open{transform:translateY(0)}
    .lib-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .lib-title{font:700 26px -apple-system,system-ui,sans-serif;color:#fff}
    .lib-close{all:unset;cursor:pointer;color:#2f8cff;font:600 16px -apple-system,system-ui,sans-serif;padding:6px 8px}
    .lib-folder{background:rgba(255,255,255,.07);border-radius:22px;padding:14px 14px 6px;margin-bottom:16px}
    .lib-fname{font:600 14px -apple-system,system-ui,sans-serif;color:#fff;margin:0 4px 12px;display:flex;align-items:center;gap:8px}
    .lib-fname span{color:rgba(255,255,255,.45);font-weight:400}
    .lib-fgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px 8px}
    @media(min-width:680px){.lib-fgrid{grid-template-columns:repeat(6,1fr)}}
  `;
  document.head.appendChild(css);
  if(document.readyState==='complete'||document.readyState==='interactive') setTimeout(boot,60);
  else document.addEventListener('DOMContentLoaded',boot);
})();
