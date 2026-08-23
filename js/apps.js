/* ============ Aura OS — Applications ============
   Each app: { name, icon, accent, mount(body, win) -> optional cleanup() } */
(function(){
  const APPS = {};
  const el = (html)=>{ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };
  const pad = (n)=> String(n).padStart(2,'0');
  const store = ()=> window.Aura.store;

  /* ---------------- Clock ---------------- */
  APPS.clock = { name:'Clock', icon:'clock', accent:'#0e0f12',
    mount(body){
      body.classList.add('flush');
      body.innerHTML = `
        <div class="clk-wrap">
          <div class="clk-face">
            <div class="clk-hand h-hr" id="h-hr"></div>
            <div class="clk-hand h-min" id="h-min"></div>
            <div class="clk-hand h-sec" id="h-sec"></div>
            <div class="clk-cap"></div>
            ${Array.from({length:12},(_,i)=>`<span class="clk-tick" style="transform:rotate(${i*30}deg) translateY(-126px)"></span>`).join('')}
          </div>
          <div class="clk-digital" id="clk-digital">9:41:00</div>
          <div class="clk-sub" id="clk-sub">Local time</div>
          <div class="clk-world">
            ${[['Cupertino',0],['London',8],['Tokyo',16],['Sydney',17]].map(([c,off])=>`
              <div class="clk-row"><span>${c}</span><b data-off="${off}">--:--</b></div>`).join('')}
          </div>
        </div>`;
      const style = el(`<style>
        .clk-wrap{ display:flex; flex-direction:column; align-items:center; padding:calc(var(--sb-h) + 60px) 24px 0; }
        .clk-face{ width:272px; height:272px; border-radius:50%; position:relative;
          background:radial-gradient(circle at 50% 40%,#1c1d22,#0a0b0d); border:1px solid rgba(255,255,255,.08);
          box-shadow:inset 0 0 40px rgba(0,0,0,.6),0 20px 50px -20px #000; }
        .clk-tick{ position:absolute; top:50%; left:50%; width:3px; height:11px; background:rgba(255,255,255,.5); border-radius:2px; margin:-5px 0 0 -1.5px; transform-origin:50% 0; }
        .clk-hand{ position:absolute; left:50%; bottom:50%; transform-origin:50% 100%; border-radius:6px; }
        .h-hr{ width:7px; height:74px; margin-left:-3.5px; background:#fff; }
        .h-min{ width:5px; height:104px; margin-left:-2.5px; background:#fff; }
        .h-sec{ width:2.5px; height:116px; margin-left:-1.25px; background:#ff453a; }
        .clk-cap{ position:absolute; top:50%; left:50%; width:14px; height:14px; margin:-7px; border-radius:50%; background:#ff453a; border:3px solid #0a0b0d; }
        .clk-digital{ font-size:54px; font-weight:300; letter-spacing:1px; margin-top:30px; font-variant-numeric:tabular-nums; }
        .clk-sub{ opacity:.5; font-size:14px; }
        .clk-world{ width:100%; margin-top:34px; }
        .clk-row{ display:flex; justify-content:space-between; padding:15px 4px; border-top:.5px solid rgba(255,255,255,.1); font-size:17px; }
        .clk-row b{ font-weight:400; opacity:.85; font-variant-numeric:tabular-nums; }
      </style>`);
      body.appendChild(style);
      const hr=body.querySelector('#h-hr'), mn=body.querySelector('#h-min'), sc=body.querySelector('#h-sec');
      const dig=body.querySelector('#clk-digital'), worlds=[...body.querySelectorAll('[data-off]')];
      function tick(){
        const d=new Date();
        const s=d.getSeconds(), m=d.getMinutes(), h=d.getHours();
        sc.style.transform=`rotate(${s*6}deg)`;
        mn.style.transform=`rotate(${m*6+s*0.1}deg)`;
        hr.style.transform=`rotate(${(h%12)*30+m*0.5}deg)`;
        dig.textContent=`${(h%12)||12}:${pad(m)}:${pad(s)}`;
        worlds.forEach(w=>{ const off=+w.dataset.off; const wd=new Date(d.getTime()+ (off-(-d.getTimezoneOffset()/60))*3600000);
          let H=wd.getHours()%12||12; w.textContent=`${H}:${pad(wd.getMinutes())} ${wd.getHours()<12?'AM':'PM'}`; });
      }
      tick(); const id=setInterval(tick,1000);
      return ()=>clearInterval(id);
    }};

  /* ---------------- Calculator ---------------- */
  APPS.calc = { name:'Calculator', icon:'calc', accent:'#000',
    mount(body){
      body.classList.add('flush');
      body.innerHTML = `
        <div class="calc">
          <div class="calc-out" id="calc-out">0</div>
          <div class="calc-grid">
            <button class="ck fn" data-k="C">AC</button>
            <button class="ck fn" data-k="±">+/−</button>
            <button class="ck fn" data-k="%">%</button>
            <button class="ck op" data-k="÷">÷</button>
            <button class="ck" data-k="7">7</button><button class="ck" data-k="8">8</button><button class="ck" data-k="9">9</button>
            <button class="ck op" data-k="×">×</button>
            <button class="ck" data-k="4">4</button><button class="ck" data-k="5">5</button><button class="ck" data-k="6">6</button>
            <button class="ck op" data-k="−">−</button>
            <button class="ck" data-k="1">1</button><button class="ck" data-k="2">2</button><button class="ck" data-k="3">3</button>
            <button class="ck op" data-k="+">+</button>
            <button class="ck zero" data-k="0">0</button><button class="ck" data-k=".">.</button>
            <button class="ck op eq" data-k="=">=</button>
          </div>
        </div>`;
      body.appendChild(el(`<style>
        .calc{ display:flex; flex-direction:column; height:100%; padding:0 16px calc(var(--safe-b) + 16px); }
        .calc-out{ flex:1; display:flex; align-items:flex-end; justify-content:flex-end; font-size:84px; font-weight:300;
          padding:0 12px 14px; overflow:hidden; line-height:1; }
        .calc-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:13px; }
        .ck{ height:80px; border-radius:50%; font-size:33px; background:#333; color:#fff; transition:filter .1s; }
        .ck:active{ filter:brightness(1.4); }
        .ck.fn{ background:#a5a5a5; color:#000; font-size:27px; }
        .ck.op{ background:#ff9f0a; font-size:38px; }
        .ck.op.on{ background:#fff; color:#ff9f0a; }
        .ck.zero{ grid-column:span 2; border-radius:40px; text-align:left; padding-left:30px; }
      </style>`));
      const out=body.querySelector('#calc-out');
      let cur='0', prev=null, op=null, fresh=true;
      const fmt=(n)=>{ if(!isFinite(n)) return 'Error'; let s=parseFloat(n.toPrecision(12)).toString(); return s.length>9?(+n).toExponential(4):s; };
      const calc=(a,b,o)=>({'+':a+b,'−':a-b,'×':a*b,'÷':b===0?NaN:a/b}[o]);
      function render(){ out.textContent=cur; }
      body.querySelector('.calc-grid').addEventListener('click',e=>{
        const b=e.target.closest('.ck'); if(!b) return; const k=b.dataset.k;
        body.querySelectorAll('.op').forEach(o=>o.classList.remove('on'));
        if(/[0-9]/.test(k)){ cur=(fresh||cur==='0')?k:cur+k; fresh=false; }
        else if(k==='.'){ if(fresh){ cur='0.'; fresh=false; } else if(!cur.includes('.')) cur+='.'; }
        else if(k==='C'){ cur='0'; prev=null; op=null; fresh=true; }
        else if(k==='±'){ cur=(parseFloat(cur)* -1).toString(); }
        else if(k==='%'){ cur=(parseFloat(cur)/100).toString(); }
        else if(['+','−','×','÷'].includes(k)){
          if(op&&!fresh){ prev=calc(prev,parseFloat(cur),op); cur=fmt(prev); } else prev=parseFloat(cur);
          op=k; fresh=true; b.classList.add('on');
        } else if(k==='='){ if(op!=null){ cur=fmt(calc(prev,parseFloat(cur),op)); op=null; prev=null; fresh=true; } }
        render();
      });
      render();
    }};

  /* ---------------- Weather ---------------- */
  APPS.weather = { name:'Weather', icon:'weather', accent:'#1f5fb0',
    mount(body){
      body.classList.add('flush');
      const hours=['Now','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM'];
      const temps=[72,73,73,72,70,68,66,64,62];
      const days=[['Today',64,73],['Wed',61,75],['Thu',60,71],['Fri',58,69],['Sat',62,76],['Sun',63,78],['Mon',59,70]];
      body.innerHTML = `
        <div class="wx">
          <div class="wx-hero">
            <div class="wx-city">Cupertino</div>
            <div class="wx-temp">72°</div>
            <div class="wx-cond">Mostly Sunny</div>
            <div class="wx-hl">H:75°  L:60°</div>
          </div>
          <div class="wx-card">
            <div class="wx-card-h">Sunny conditions will continue all day. Wind gusts up to 10 mph.</div>
            <div class="wx-hours">
              ${hours.map((h,i)=>`<div class="wx-hr"><span>${h}</span><div class="wx-emoji">${i>5?'🌤️':'☀️'}</div><b>${temps[i]}°</b></div>`).join('')}
            </div>
          </div>
          <div class="wx-card">
            <div class="wx-label">7-DAY FORECAST</div>
            ${days.map(([d,l,hi])=>`
              <div class="wx-day"><span class="wx-dn">${d}</span><span class="wx-de">☀️</span>
                <span class="wx-lo">${l}°</span>
                <div class="wx-bar"><i style="left:${(l-55)/30*100}%;right:${100-(hi-55)/30*100}%"></i></div>
                <span class="wx-hi">${hi}°</span></div>`).join('')}
          </div>
        </div>`;
      body.appendChild(el(`<style>
        .app-window.wx-win{ background:linear-gradient(180deg,#3a82d6,#16467e 60%,#0e2f59); }
        .wx{ padding:calc(var(--sb-h) + 36px) 18px calc(var(--safe-b) + 24px); }
        .wx-hero{ text-align:center; }
        .wx-city{ font-size:32px; font-weight:500; }
        .wx-temp{ font-size:92px; font-weight:200; line-height:1; margin-left:14px; }
        .wx-cond{ font-size:18px; opacity:.95; } .wx-hl{ font-size:18px; }
        .wx-card{ margin-top:18px; background:rgba(255,255,255,.16); border:.5px solid rgba(255,255,255,.2);
          border-radius:18px; padding:14px; backdrop-filter:blur(10px); }
        .wx-card-h{ font-size:14px; opacity:.92; padding-bottom:12px; border-bottom:.5px solid rgba(255,255,255,.2); }
        .wx-hours{ display:flex; justify-content:space-between; padding-top:12px; }
        .wx-hr{ display:flex; flex-direction:column; align-items:center; gap:8px; font-size:15px; }
        .wx-hr .wx-emoji{ font-size:22px; } .wx-hr b{ font-weight:600; }
        .wx-label{ font-size:12px; opacity:.7; padding-bottom:8px; letter-spacing:.5px; }
        .wx-day{ display:flex; align-items:center; gap:12px; padding:9px 0; border-top:.5px solid rgba(255,255,255,.16); }
        .wx-dn{ width:50px; font-size:17px; } .wx-de{ font-size:20px; }
        .wx-lo,.wx-hi{ width:34px; font-size:17px; text-align:center; } .wx-lo{ opacity:.6; }
        .wx-bar{ flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,.25); position:relative; }
        .wx-bar i{ position:absolute; top:0; bottom:0; border-radius:3px; background:linear-gradient(90deg,#7ec8ff,#ffd66b); }
      </style>`));
      body.closest('.app-window').classList.add('wx-win');
    }};

  /* ---------------- Calendar ---------------- */
  APPS.calendar = { name:'Calendar', icon:'calendar', accent:'#16182a',
    mount(body){
      const now=new Date(); const y=now.getFullYear(), m=now.getMonth();
      const monthName=now.toLocaleString('en-US',{month:'long'});
      const first=new Date(y,m,1).getDay(); const dim=new Date(y,m+1,0).getDate();
      const today=now.getDate();
      const events={ [today]:[['Portfolio work session','10:00','#5b8cff'],['Design review','14:30','#ff9f43']], [today+2]:[['Dentist','09:00','#ff6b6b']] };
      let cells=''; for(let i=0;i<first;i++) cells+='<div></div>';
      for(let d=1; d<=dim; d++){ const ev=events[d]; cells+=`<div class="cal-cell${d===today?' today':''}" data-d="${d}"><span>${d}</span>${ev?'<i></i>':''}</div>`; }
      body.innerHTML = `
        <div class="app-head"><div class="app-title">${monthName}</div><div class="app-sub">${y}</div></div>
        <div class="cal-grid-head">${['S','M','T','W','T','F','S'].map(d=>`<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <div class="section-label">Upcoming</div>
        <div class="cal-events" id="cal-events"></div>`;
      body.appendChild(el(`<style>
        .cal-grid-head{ display:grid; grid-template-columns:repeat(7,1fr); padding:0 16px 6px; }
        .cal-grid-head span{ text-align:center; font-size:12px; opacity:.5; }
        .cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:2px 0; padding:0 12px; }
        .cal-cell{ aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; font-size:17px; border-radius:50%; }
        .cal-cell span{ width:38px; height:38px; display:grid; place-items:center; border-radius:50%; }
        .cal-cell.today span{ background:#ff453a; font-weight:700; }
        .cal-cell i{ width:5px; height:5px; border-radius:50%; background:#5b8cff; }
        .cal-events{ margin:0 16px; display:flex; flex-direction:column; gap:10px; }
        .cal-ev{ display:flex; gap:12px; align-items:center; background:rgba(255,255,255,.07); border-radius:14px; padding:13px; }
        .cal-ev .bar{ width:4px; align-self:stretch; border-radius:3px; } .cal-ev .ce-t{ font-size:16px; } .cal-ev .ce-s{ font-size:13px; opacity:.55; }
      </style>`));
      const evWrap=body.querySelector('#cal-events');
      const flat=[]; Object.keys(events).forEach(d=> events[d].forEach(e=> flat.push([d,...e])));
      evWrap.innerHTML = flat.map(([d,t,time,c])=>`
        <div class="cal-ev"><span class="bar" style="background:${c}"></span>
          <div><div class="ce-t">${t}</div><div class="ce-s">${monthName} ${d} · ${time}</div></div></div>`).join('');
    }};

  /* ---------------- Notes ---------------- */
  APPS.notes = { name:'Notes', icon:'notes', accent:'#16182a',
    mount(body){
      const s=store();
      let notes=s.get('notes',[{id:1,title:'Welcome to Aura',text:'Tap a note to edit. Changes save automatically. Add a new note with the + button.',ts:Date.now()}]);
      function save(){ s.set('notes',notes); }
      function list(){
        body.classList.remove('flush');
        body.innerHTML=`<div class="app-head"><div class="row spread"><div class="app-title">Notes</div>
          <button class="nt-add" id="nt-add">${plus()}</button></div></div>
          <div class="nt-list">${notes.length?notes.map(n=>`
            <button class="nt-item" data-id="${n.id}">
              <div class="nt-t">${esc(n.title)||'New Note'}</div>
              <div class="nt-s"><b>${new Date(n.ts).toLocaleDateString()}</b> ${esc((n.text||'').slice(0,40))||'No additional text'}</div>
            </button>`).join(''):'<div class="nt-empty">No notes yet</div>'}</div>`;
        body.querySelector('#nt-add').onclick=()=>{ const n={id:Date.now(),title:'',text:'',ts:Date.now()}; notes.unshift(n); save(); edit(n.id); };
        body.querySelectorAll('.nt-item').forEach(b=> b.onclick=()=>edit(+b.dataset.id));
      }
      function edit(id){
        const n=notes.find(x=>x.id===id); if(!n) return list();
        body.innerHTML=`<div class="app-head"><button class="nt-back" id="nt-back">‹ Notes</button></div>
          <div class="nt-edit">
            <input class="nt-title-in" id="nt-title" placeholder="Title" value="${esc(n.title)}"/>
            <textarea class="nt-text-in" id="nt-text" placeholder="Start writing…">${esc(n.text)}</textarea>
          </div>`;
        const ti=body.querySelector('#nt-title'), tx=body.querySelector('#nt-text');
        const upd=()=>{ n.title=ti.value; n.text=tx.value; n.ts=Date.now(); save(); };
        ti.oninput=upd; tx.oninput=upd;
        body.querySelector('#nt-back').onclick=()=>{ notes=notes.filter(x=>x.title||x.text); save(); list(); };
      }
      body.appendChild(el(`<style>
        .nt-add{ width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,.12); display:grid; place-items:center; }
        .nt-add svg{ width:20px; height:20px; fill:#ffd60a; }
        .nt-list{ margin:8px 16px; background:rgba(255,255,255,.06); border-radius:16px; overflow:hidden; }
        .nt-item{ display:block; width:100%; text-align:left; padding:13px 15px; border-bottom:.5px solid rgba(255,255,255,.08); }
        .nt-item:last-child{ border-bottom:0; }
        .nt-t{ font-size:17px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .nt-s{ font-size:13px; opacity:.55; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .nt-s b{ color:rgba(255,255,255,.75); font-weight:400; }
        .nt-empty{ text-align:center; opacity:.4; padding:60px 0; }
        .nt-back{ color:#ffd60a; font-size:17px; }
        .nt-edit{ padding:6px 20px; }
        .nt-title-in{ width:100%; background:none; border:0; color:#fff; font-size:26px; font-weight:700; outline:none; padding:6px 0; }
        .nt-text-in{ width:100%; min-height:50vh; background:none; border:0; color:#fff; font-size:17px; line-height:1.5; outline:none; resize:none; margin-top:6px; font-family:inherit; }
      </style>`));
      list();
    }};

  /* ---------------- Reminders ---------------- */
  APPS.reminders = { name:'Reminders', icon:'reminders', accent:'#16182a',
    mount(body){
      const s=store();
      let items=s.get('reminders',[{id:1,t:'Buy groceries',done:false},{id:2,t:'Call the bank',done:true},{id:3,t:'Finish the PWA build',done:false}]);
      const save=()=>s.set('reminders',items);
      function render(){
        body.innerHTML=`<div class="app-head"><div class="app-title" style="color:#ff9f0a">Reminders</div>
          <div class="app-sub">${items.filter(i=>!i.done).length} remaining</div></div>
          <div class="rm-list">
            ${items.map(i=>`<div class="rm-item" data-id="${i.id}">
              <button class="rm-check ${i.done?'on':''}" data-act="toggle">${i.done?check():''}</button>
              <span class="rm-t ${i.done?'done':''}">${esc(i.t)}</span>
              <button class="rm-del" data-act="del">${x()}</button></div>`).join('')}
          </div>
          <form class="rm-add" id="rm-add"><span class="rm-plus">${plus()}</span>
            <input id="rm-in" placeholder="New Reminder" autocomplete="off"/></form>`;
        body.querySelectorAll('.rm-item').forEach(row=>{
          row.querySelector('[data-act="toggle"]').onclick=()=>{ const it=items.find(i=>i.id==row.dataset.id); it.done=!it.done; save(); render(); };
          row.querySelector('[data-act="del"]').onclick=()=>{ items=items.filter(i=>i.id!=row.dataset.id); save(); render(); };
        });
        const form=body.querySelector('#rm-add'), inp=body.querySelector('#rm-in');
        form.onsubmit=(e)=>{ e.preventDefault(); const v=inp.value.trim(); if(!v) return; items.push({id:Date.now(),t:v,done:false}); save(); render(); body.querySelector('#rm-in').focus(); };
      }
      body.appendChild(el(`<style>
        .rm-list{ margin:4px 18px; }
        .rm-item{ display:flex; align-items:center; gap:13px; padding:12px 0; border-bottom:.5px solid rgba(255,255,255,.1); }
        .rm-check{ width:24px; height:24px; border-radius:50%; border:2px solid rgba(255,255,255,.4); flex:none; display:grid; place-items:center; }
        .rm-check.on{ background:#ff9f0a; border-color:#ff9f0a; } .rm-check svg{ width:13px; height:13px; fill:#fff; }
        .rm-t{ flex:1; font-size:17px; } .rm-t.done{ opacity:.4; text-decoration:line-through; }
        .rm-del{ opacity:.3; } .rm-del svg{ width:16px; height:16px; fill:#fff; }
        .rm-add{ display:flex; align-items:center; gap:13px; margin:6px 18px; padding:12px 0; }
        .rm-plus svg{ width:22px; height:22px; fill:#ff9f0a; }
        .rm-add input{ flex:1; background:none; border:0; color:#fff; font-size:17px; outline:none; }
      </style>`));
      render();
    }};

  /* ---------------- Photos ---------------- */
  APPS.photos = { name:'Photos', icon:'photos', accent:'#16182a',
    mount(body){
      const grads=['#ff9a9e,#fad0c4','#a18cd1,#fbc2eb','#84fab0,#8fd3f4','#ffecd2,#fcb69f','#a1c4fd,#c2e9fb','#fbc2eb,#a6c1ee','#fdcbf1,#e6dee9','#ff6e7f,#bfe9ff','#e0c3fc,#8ec5fc','#f093fb,#f5576c','#4facfe,#00f2fe','#43e97b,#38f9d7','#fa709a,#fee140','#30cfd0,#330867','#5ee7df,#b490ca'];
      body.innerHTML=`<div class="app-head solid"><div class="app-title">Photos</div><div class="app-sub">${grads.length} items · Recents</div></div>
        <div class="ph-grid">${grads.map((g,i)=>`<button class="ph-cell" style="background:linear-gradient(135deg,${g})" data-i="${i}"></button>`).join('')}</div>
        <div class="ph-view" id="ph-view" hidden></div>`;
      body.appendChild(el(`<style>
        .ph-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:2px; padding:0 2px; }
        .ph-cell{ aspect-ratio:1; }
        .ph-view{ position:absolute; inset:0; background:#000; z-index:9; display:flex; align-items:center; justify-content:center;
          padding:calc(var(--sb-h) + 50px) 0 calc(var(--safe-b) + 20px); animation:appOpen .3s var(--ease); }
        .ph-view .ph-big{ width:90%; aspect-ratio:1; border-radius:14px; }
        .ph-view .ph-x{ position:absolute; top:calc(var(--sb-h) + 12px); right:18px; width:36px; height:36px; border-radius:50%;
          background:rgba(255,255,255,.15); display:grid; place-items:center; }
        .ph-view .ph-x svg{ width:18px; height:18px; fill:#fff; }
      </style>`));
      const view=body.querySelector('#ph-view');
      body.querySelectorAll('.ph-cell').forEach(c=> c.onclick=()=>{
        view.hidden=false; view.innerHTML=`<button class="ph-x">${x()}</button><div class="ph-big" style="background:linear-gradient(135deg,${grads[c.dataset.i]})"></div>`;
        view.querySelector('.ph-x').onclick=()=>{ view.hidden=true; };
      });
    }};

  /* ---------------- Settings ---------------- */
  APPS.settings = { name:'Settings', icon:'settings', accent:'#16182a',
    mount(body){
      const s=store();
      const toggles=s.get('toggles',{wifi:true,bluetooth:true,airplane:false,cellular:true,darkmode:true,lowpower:false});
      const tg=(key,label,sub,color)=>`
        <div class="li"><span class="li-ic" style="background:${color}">${settingsGlyph(key)}</span>
          <div class="li-main"><div class="li-t">${label}</div>${sub?`<div class="li-s">${sub}</div>`:''}</div>
          <button class="sw ${toggles[key]?'on':''}" data-tg="${key}"></button></div>`;
      const nav=(label,val,color)=>`<div class="li"><span class="li-ic" style="background:${color}">${settingsGlyph(label)}</span>
          <div class="li-main"><div class="li-t">${label}</div></div><span class="li-val">${val||''}</span><span class="chev">›</span></div>`;
      body.innerHTML=`<div class="app-head"><div class="app-title">Settings</div></div>
        <div class="set-profile"><div class="set-av">A</div><div><div class="set-name">Aura User</div><div class="set-sub">Apple ID, iCloud & more</div></div></div>
        <div class="list" style="margin-top:18px">
          ${tg('airplane','Airplane Mode','','#ff9f0a')}
          ${tg('wifi','Wi-Fi','Aura-5G','#1f8bff')}
          ${tg('bluetooth','Bluetooth','On','#1f8bff')}
          ${tg('cellular','Cellular','','#3ad15b')}
        </div>
        <div class="list" style="margin-top:18px">
          ${nav('Notifications','','#ff3b30')}
          ${nav('Sounds & Haptics','','#ff2d55')}
          ${tg('darkmode','Dark Appearance','','#5b6473')}
          ${tg('lowpower','Low Power Mode','','#ffd60a')}
        </div>
        <div class="list" style="margin-top:18px">
          ${nav('Battery','78%','#3ad15b')}
          ${nav('Storage','41.2 GB','#8e8e93')}
          ${nav('About','Aura 1.0','#8e8e93')}
        </div>`;
      body.appendChild(el(`<style>
        .set-profile{ display:flex; align-items:center; gap:14px; margin:8px 16px 0; background:rgba(255,255,255,.07);
          border-radius:18px; padding:14px; }
        .set-av{ width:54px; height:54px; border-radius:50%; background:linear-gradient(135deg,#6b8cff,#a06bff); display:grid; place-items:center; font-size:24px; font-weight:600; }
        .set-name{ font-size:20px; font-weight:600; } .set-sub{ font-size:13px; opacity:.55; }
      </style>`));
      body.querySelectorAll('[data-tg]').forEach(b=> b.onclick=()=>{ const k=b.dataset.tg; toggles[k]=!toggles[k]; b.classList.toggle('on'); s.set('toggles',toggles); window.Aura.syncStatus&&window.Aura.syncStatus(); });
    }};

  /* ---------------- Music ---------------- */
  APPS.music = { name:'Music', icon:'music', accent:'#2a0d33',
    mount(body){
      body.classList.add('flush');
      const dur=214; let pos=s2(store().get('musicPos',42)); let playing=false; let raf=null, last=0;
      function s2(n){ return Math.min(n,dur); }
      body.innerHTML=`
        <div class="mu">
          <div class="mu-art"></div>
          <div class="mu-meta"><div class="mu-title">Neon Horizon</div><div class="mu-artist">The Synthwave Collective</div></div>
          <div class="mu-seek"><div class="mu-bar"><i id="mu-fill"></i><b id="mu-knob"></b></div>
            <div class="mu-times"><span id="mu-cur">0:42</span><span id="mu-rem">-2:52</span></div></div>
          <div class="mu-controls">
            <button id="mu-prev">${tri('prev')}</button>
            <button id="mu-play" class="mu-play">${tri('play')}</button>
            <button id="mu-next">${tri('next')}</button>
          </div>
          <div class="mu-vol"><span>${spk()}</span><div class="mu-bar sm"><i style="width:65%"></i></div><span>${spk(1)}</span></div>
        </div>`;
      body.appendChild(el(`<style>
        .mu{ padding:calc(var(--sb-h) + 40px) 30px 0; display:flex; flex-direction:column; align-items:center; }
        .app-window.mu-win{ background:linear-gradient(180deg,#5a2a7a,#2a0d33 70%,#160718); }
        .mu-art{ width:78%; aspect-ratio:1; border-radius:14px; background:linear-gradient(135deg,#ff5fae,#7a5cff 60%,#1f9bff);
          box-shadow:0 30px 60px -20px rgba(0,0,0,.7); position:relative; overflow:hidden; }
        .mu-art::after{ content:""; position:absolute; inset:0; background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.35),transparent 55%); }
        .mu-meta{ width:100%; margin-top:30px; }
        .mu-title{ font-size:24px; font-weight:700; } .mu-artist{ font-size:20px; opacity:.6; }
        .mu-seek{ width:100%; margin-top:24px; }
        .mu-bar{ height:7px; border-radius:4px; background:rgba(255,255,255,.2); position:relative; }
        .mu-bar i{ position:absolute; left:0; top:0; bottom:0; border-radius:4px; background:#fff; }
        .mu-bar b{ position:absolute; top:50%; width:13px; height:13px; border-radius:50%; background:#fff; transform:translate(-50%,-50%); }
        .mu-bar.sm{ flex:1; height:5px; } .mu-bar.sm i{ background:rgba(255,255,255,.7); }
        .mu-times{ display:flex; justify-content:space-between; font-size:12px; opacity:.6; margin-top:8px; font-variant-numeric:tabular-nums; }
        .mu-controls{ display:flex; align-items:center; gap:36px; margin-top:18px; }
        .mu-controls svg{ fill:#fff; } .mu-controls button:active{ transform:scale(.9); }
        .mu-play svg{ width:60px; height:60px; }
        .mu-vol{ display:flex; align-items:center; gap:12px; width:100%; margin-top:30px; }
        .mu-vol svg{ fill:rgba(255,255,255,.6); width:18px; height:18px; }
      </style>`));
      body.closest('.app-window').classList.add('mu-win');
      const fill=body.querySelector('#mu-fill'), knob=body.querySelector('#mu-knob'),
            cur=body.querySelector('#mu-cur'), rem=body.querySelector('#mu-rem'),
            playBtn=body.querySelector('#mu-play');
      const fmt=(t)=>`${Math.floor(t/60)}:${pad(Math.floor(t%60))}`;
      function paint(){ const p=pos/dur*100; fill.style.width=p+'%'; knob.style.left=p+'%'; cur.textContent=fmt(pos); rem.textContent='-'+fmt(dur-pos); }
      function loop(ts){ if(!last) last=ts; const dt=(ts-last)/1000; last=ts; if(playing){ pos=s2(pos+dt); if(pos>=dur){ pos=0; } paint(); } raf=requestAnimationFrame(loop); }
      playBtn.onclick=()=>{ playing=!playing; playBtn.innerHTML=tri(playing?'pause':'play'); };
      const bar=body.querySelector('.mu-seek .mu-bar');
      bar.onclick=(e)=>{ const r=bar.getBoundingClientRect(); pos=s2((e.clientX-r.left)/r.width*dur); paint(); };
      body.querySelector('#mu-next').onclick=()=>{ pos=0; paint(); };
      body.querySelector('#mu-prev').onclick=()=>{ pos=0; paint(); };
      paint(); raf=requestAnimationFrame(loop);
      return ()=>{ cancelAnimationFrame(raf); store().set('musicPos',Math.round(pos)); };
    }};

  /* ---------------- Messages ---------------- */
  APPS.messages = { name:'Messages', icon:'messages', accent:'#0c0d10',
    mount(body){
      const chats=[
        {n:'Maya Chen',c:'#ff6b6b',last:'Sounds perfect — see you then!',t:'9:32 AM',thread:[['in','Hey! Are we still on for coffee?'],['out','Absolutely. 10:30 at the usual spot?'],['in','Sounds perfect — see you then!']]},
        {n:'Design Team',c:'#5b8cff',last:'Liam: shipped the new build 🚀',t:'8:14 AM',thread:[['in','Liam: shipped the new build 🚀'],['out','Amazing work everyone'],['in','Ana: reviewing now']]},
        {n:'Dad',c:'#3ad15b',last:'Call me when you get a chance',t:'Yesterday',thread:[['in','Call me when you get a chance']]},
        {n:'Aura',c:'#a06bff',last:'Your weekly summary is ready',t:'Monday',thread:[['in','Your weekly summary is ready']]},
      ];
      function listView(){
        body.classList.remove('flush');
        body.innerHTML=`<div class="app-head"><div class="app-title">Messages</div></div>
          <div class="ms-search">${search()}<span>Search</span></div>
          <div class="ms-list">${chats.map((c,i)=>`
            <button class="ms-item" data-i="${i}"><span class="ms-av" style="background:${c.c}">${c.n[0]}</span>
              <div class="ms-mid"><div class="ms-n">${c.n}</div><div class="ms-l">${c.last}</div></div>
              <div class="ms-r"><span>${c.t}</span><span class="chev">›</span></div></button>`).join('')}</div>`;
        body.querySelectorAll('.ms-item').forEach(b=> b.onclick=()=>thread(+b.dataset.i));
      }
      function thread(i){
        const c=chats[i];
        body.innerHTML=`<div class="app-head solid"><button class="ms-back" id="ms-back">‹</button>
          <div class="ms-thread-h"><span class="ms-av sm" style="background:${c.c}">${c.n[0]}</span><b>${c.n}</b></div></div>
          <div class="ms-bubbles">${c.thread.map(([d,t])=>`<div class="ms-bub ${d}">${t}</div>`).join('')}</div>
          <form class="ms-compose" id="ms-form"><input id="ms-in" placeholder="Message" autocomplete="off"/><button>${arrowUp()}</button></form>`;
        body.querySelector('#ms-back').onclick=listView;
        const form=body.querySelector('#ms-form'), inp=body.querySelector('#ms-in'), bubbles=body.querySelector('.ms-bubbles');
        form.onsubmit=(e)=>{ e.preventDefault(); const v=inp.value.trim(); if(!v) return; c.thread.push(['out',esc(v)]); c.last=v;
          bubbles.insertAdjacentHTML('beforeend',`<div class="ms-bub out">${esc(v)}</div>`); inp.value=''; bubbles.scrollTop=bubbles.scrollHeight; };
      }
      body.appendChild(el(`<style>
        .ms-search{ display:flex; align-items:center; gap:8px; margin:0 16px 8px; background:rgba(255,255,255,.1); border-radius:11px; padding:9px 12px; opacity:.6; }
        .ms-search svg{ width:16px; height:16px; fill:#fff; }
        .ms-list{ margin:0 0 0 16px; }
        .ms-item{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:11px 16px 11px 0; border-bottom:.5px solid rgba(255,255,255,.08); }
        .ms-av{ width:50px; height:50px; border-radius:50%; display:grid; place-items:center; font-size:20px; font-weight:600; flex:none; }
        .ms-av.sm{ width:30px; height:30px; font-size:13px; }
        .ms-mid{ flex:1; min-width:0; } .ms-n{ font-size:17px; font-weight:600; } .ms-l{ font-size:14px; opacity:.55; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ms-r{ display:flex; flex-direction:column; align-items:flex-end; font-size:13px; opacity:.45; gap:2px; }
        .ms-back{ font-size:30px; color:#5b8cff; line-height:1; }
        .ms-thread-h{ display:flex; align-items:center; gap:8px; } .ms-thread-h b{ font-size:16px; }
        .app-head.solid{ display:flex; align-items:center; gap:10px; }
        .ms-bubbles{ padding:10px 16px 0; display:flex; flex-direction:column; gap:8px; }
        .ms-bub{ max-width:74%; padding:9px 14px; border-radius:19px; font-size:16px; line-height:1.3; }
        .ms-bub.in{ align-self:flex-start; background:#26262b; border-bottom-left-radius:5px; }
        .ms-bub.out{ align-self:flex-end; background:linear-gradient(#2f8cff,#1f6fe8); border-bottom-right-radius:5px; }
        .ms-compose{ position:sticky; bottom:0; display:flex; gap:8px; padding:10px 16px calc(var(--safe-b) + 10px); background:var(--bg); }
        .ms-compose input{ flex:1; background:rgba(255,255,255,.08); border:.5px solid rgba(255,255,255,.15); border-radius:18px; padding:9px 14px; color:#fff; font-size:16px; outline:none; }
        .ms-compose button{ width:34px; height:34px; border-radius:50%; background:#2f8cff; display:grid; place-items:center; flex:none; }
        .ms-compose svg{ width:18px; height:18px; fill:#fff; }
      </style>`));
      listView();
    }};

  /* ---------------- Browser ---------------- */
  APPS.browser = { name:'Aura', icon:'browser', accent:'#0c0d10',
    mount(body){
      const faves=[['Mail','mail','#1f7bf0'],['Maps','maps','#3aa0ff'],['Photos','photos','#ff5fae'],['Music','music','#fc5c7d'],['Calendar','calendar','#ff453a'],['Notes','notes','#f7b500'],['Weather','weather','#1f5fb0'],['Files','files','#2f86e8']];
      body.innerHTML=`<div class="br">
          <div class="br-bar"><span>${lock()}</span><input id="br-url" value="aura://start" /><span>${reload()}</span></div>
          <div class="br-hero"><div class="br-logo">${window.ICONS.render('browser')}</div><div class="br-h1">Aura</div>
            <form class="br-search" id="br-form"><span>${search()}</span><input id="br-q" placeholder="Search or enter address" autocomplete="off"/></form></div>
          <div class="section-label">Favorites</div>
          <div class="br-faves">${faves.map(([n,ic,c])=>`<button class="br-fav" data-app="${ic}"><span class="br-fic">${window.ICONS.render(ic)}</span><span>${n}</span></button>`).join('')}</div>
        </div>`;
      body.appendChild(el(`<style>
        .br{ padding:calc(var(--sb-h) + 12px) 0 0; }
        .br-bar{ display:flex; align-items:center; gap:8px; margin:0 16px; background:rgba(255,255,255,.1); border-radius:12px; padding:8px 12px; }
        .br-bar input{ flex:1; background:none; border:0; color:#fff; text-align:center; font-size:15px; outline:none; }
        .br-bar svg{ width:15px; height:15px; fill:rgba(255,255,255,.6); }
        .br-hero{ text-align:center; padding:40px 24px 10px; }
        .br-logo{ width:64px; height:64px; margin:0 auto 14px; } .br-logo svg{ width:64px; height:64px; }
        .br-h1{ font-size:30px; font-weight:700; margin-bottom:18px; }
        .br-search{ display:flex; align-items:center; gap:9px; background:rgba(255,255,255,.1); border:.5px solid rgba(255,255,255,.15); border-radius:14px; padding:12px 16px; }
        .br-search svg{ width:18px; height:18px; fill:rgba(255,255,255,.6); }
        .br-search input{ flex:1; background:none; border:0; color:#fff; font-size:16px; outline:none; }
        .br-faves{ display:grid; grid-template-columns:repeat(4,1fr); gap:18px 8px; padding:6px 16px; }
        .br-fav{ display:flex; flex-direction:column; align-items:center; gap:7px; font-size:12px; }
        .br-fic{ width:54px; height:54px; } .br-fic svg{ width:54px; height:54px; }
      </style>`));
      body.querySelectorAll('.br-fav').forEach(b=> b.onclick=()=>{ const a=b.dataset.app; if(window.APPS[a]) window.Aura.open(a); });
      body.querySelector('#br-form').onsubmit=(e)=>{ e.preventDefault(); const q=body.querySelector('#br-q').value.trim(); if(q) body.querySelector('#br-url').value='search: '+q; };
    }};

  /* ---------------- Camera ---------------- */
  APPS.camera = { name:'Camera', icon:'camera', accent:'#000',
    mount(body){
      body.classList.add('flush');
      const win=body.closest('.app-window'); win.style.background='#000';
      body.innerHTML=`<div class="cam">
          <div class="cam-view"><div class="cam-grid"></div><div class="cam-focus" id="cam-focus"></div>
            <div class="cam-flash" id="cam-flash"></div></div>
          <div class="cam-modes"><span>VIDEO</span><span class="on">PHOTO</span><span>PORTRAIT</span></div>
          <div class="cam-bottom">
            <button class="cam-thumb" id="cam-thumb"></button>
            <button class="cam-shutter" id="cam-shutter"><i></i></button>
            <button class="cam-flip">${reload()}</button>
          </div>
        </div>`;
      body.appendChild(el(`<style>
        .cam{ height:100%; display:flex; flex-direction:column; background:#000; }
        .cam-view{ flex:1; position:relative; margin:calc(var(--sb-h) + 8px) 0 0; overflow:hidden;
          background:linear-gradient(160deg,#2a3a4a,#0c1218 70%); }
        .cam-view::after{ content:""; position:absolute; inset:0; background:
          radial-gradient(40% 30% at 30% 28%, rgba(120,160,200,.4),transparent),
          radial-gradient(50% 40% at 75% 75%, rgba(60,90,120,.5),transparent); }
        .cam-grid{ position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px); background-size:33.33% 33.33%; }
        .cam-focus{ position:absolute; width:74px; height:74px; border:1.5px solid #ffd60a; border-radius:6px; opacity:0; transform:translate(-50%,-50%); }
        .cam-flash{ position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; }
        .cam-modes{ display:flex; justify-content:center; gap:28px; padding:16px 0 10px; font-size:13px; font-weight:600; letter-spacing:.5px; color:rgba(255,255,255,.5); }
        .cam-modes .on{ color:#ffd60a; }
        .cam-bottom{ display:flex; align-items:center; justify-content:space-between; padding:6px 34px calc(var(--safe-b) + 20px); }
        .cam-thumb{ width:46px; height:46px; border-radius:9px; background:linear-gradient(135deg,#84fab0,#8fd3f4); border:1px solid rgba(255,255,255,.3); }
        .cam-shutter{ width:74px; height:74px; border-radius:50%; border:4px solid #fff; display:grid; place-items:center; }
        .cam-shutter i{ width:60px; height:60px; border-radius:50%; background:#fff; transition:transform .1s; }
        .cam-shutter:active i{ transform:scale(.88); }
        .cam-flip{ width:46px; height:46px; border-radius:50%; background:rgba(255,255,255,.2); display:grid; place-items:center; }
        .cam-flip svg{ width:22px; height:22px; fill:#fff; }
      </style>`));
      const flash=body.querySelector('#cam-flash'), thumb=body.querySelector('#cam-thumb'), focus=body.querySelector('#cam-focus');
      const grads=['#ff9a9e,#fad0c4','#a18cd1,#fbc2eb','#84fab0,#8fd3f4','#4facfe,#00f2fe'];
      body.querySelector('#cam-shutter').onclick=()=>{ flash.style.transition='none'; flash.style.opacity='.9';
        requestAnimationFrame(()=>{ flash.style.transition='opacity .4s'; flash.style.opacity='0'; });
        const g=grads[Math.floor(Math.random()*grads.length)]; thumb.style.background=`linear-gradient(135deg,${g})`; };
      body.querySelector('.cam-view').onclick=(e)=>{ const r=e.currentTarget.getBoundingClientRect();
        focus.style.left=(e.clientX-r.left)+'px'; focus.style.top=(e.clientY-r.top)+'px'; focus.style.transition='none'; focus.style.opacity='1'; focus.style.transform='translate(-50%,-50%) scale(1.3)';
        requestAnimationFrame(()=>{ focus.style.transition='all .4s'; focus.style.transform='translate(-50%,-50%) scale(1)'; setTimeout(()=>focus.style.opacity='0',700); }); };
    }};

  /* ---------- small inline glyphs ---------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function plus(){ return '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>'; }
  function check(){ return '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>'; }
  function x(){ return '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'; }
  function search(){ return '<svg viewBox="0 0 24 24"><path d="M10 4a6 6 0 1 0 3.5 10.9l5.3 5.3 1.4-1.4-5.3-5.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>'; }
  function arrowUp(){ return '<svg viewBox="0 0 24 24"><path d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z"/></svg>'; }
  function lock(){ return '<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v10H6V10h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>'; }
  function reload(){ return '<svg viewBox="0 0 24 24"><path d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"/></svg>'; }
  function spk(big){ return big? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4zm12 .5a4 4 0 0 1 0 5l1.4 1.4a6 6 0 0 0 0-7.8L16 9.5z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4z"/></svg>'; }
  function tri(type){
    if(type==='play') return '<svg viewBox="0 0 24 24" width="54" height="54"><path d="M8 5v14l11-7z"/></svg>';
    if(type==='pause') return '<svg viewBox="0 0 24 24" width="54" height="54"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
    if(type==='next') return '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M6 5v14l9-7zM16 5h2.5v14H16z"/></svg>';
    if(type==='prev') return '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M18 5v14l-9-7zM8 5H5.5v14H8z"/></svg>';
    return '';
  }
  function settingsGlyph(k){
    const m={ 'Wi-Fi':'wifi', airplane:'plane', wifi:'wifi', bluetooth:'bt', cellular:'cell', darkmode:'moon', lowpower:'batt',
      'Notifications':'bell','Sounds & Haptics':'spk','Battery':'batt','Storage':'box','About':'info' };
    const g=m[k]||'box';
    const P={ wifi:'M12 18.5l2.3-2.9a3 3 0 0 0-4.6 0L12 18.5zm0-5.7a6.2 6.2 0 0 1 4.9 2.3l1.8-2.3a9.3 9.3 0 0 0-13.4 0l1.8 2.3A6.2 6.2 0 0 1 12 12.8zM12 7a12.3 12.3 0 0 0-9.6 4.5L4.2 14a9.3 9.3 0 0 1 15.6 0l1.8-2.5A12.3 12.3 0 0 0 12 7z',
      plane:'M21 16v-2l-8-5V4a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-3.5L21 16z',
      bt:'M8 7l8 5-4 3v-9l4 3-8 5',
      cell:'M4 16h2v3H4zM8 13h2v6H8zM12 10h2v9h-2zM16 6h2v13h-2z',
      moon:'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
      batt:'M5 8h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm15 2v4h1v-4z',
      bell:'M12 3a5 5 0 0 0-5 5c0 4-2 5-2 7h14c0-2-2-3-2-7a5 5 0 0 0-5-5zm0 18a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 21z',
      spk:'M4 9v6h4l5 5V4L8 9H4zm12 .5a4 4 0 0 1 0 5l1.4 1.4a6 6 0 0 0 0-7.8L16 9.5z',
      box:'M4 7l8-4 8 4v10l-8 4-8-4V7zm8-1.8L6.5 8 12 10.8 17.5 8 12 5.2z',
      info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 13h-2v-5h2v5zm0-7h-2V7h2v2z' };
    const flip = (g==='bt'); // bt drawn as stroke
    if(flip) return `<svg viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="2" d="${P.bt}"/></svg>`;
    return `<svg viewBox="0 0 24 24"><path d="${P[g]}"/></svg>`;
  }

  window.APPS = APPS;
})();
