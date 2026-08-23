/* ============ Aura OS — original icon set ============
   Each icon: rounded gradient tile (60x60, rx 13.5) + white glyph.
   Original designs — not derived from any vendor's icon artwork. */
(function(){
  const G = {
    clock:      { grad:['#2b2d33','#0e0f12'], glyph:'<circle cx="30" cy="30" r="17" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M30 19.5V30l7 4.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="30" cy="13.4" r="1.6" fill="#fff"/><circle cx="30" cy="46.6" r="1.6" fill="#fff"/>' },
    calc:       { grad:['#3a3d44','#17181c'], glyph:'<rect x="17" y="14" width="26" height="32" rx="5" fill="none" stroke="#fff" stroke-width="2.2"/><rect x="21" y="18.5" width="18" height="7" rx="2" fill="#ff9f0a"/><g fill="#fff"><circle cx="23.5" cy="32" r="1.9"/><circle cx="30" cy="32" r="1.9"/><circle cx="36.5" cy="32" r="1.9"/><circle cx="23.5" cy="39.5" r="1.9"/><circle cx="30" cy="39.5" r="1.9"/></g><rect x="34.6" y="37.6" width="3.8" height="3.8" rx="1.9" fill="#ff9f0a"/>' },
    weather:    { grad:['#3aa0ff','#0a64c8'], glyph:'<circle cx="24" cy="24" r="7" fill="#ffd66b"/><path d="M40 41a7 7 0 0 0-1.2-13.9 10 10 0 0 0-19 3.2A7.5 7.5 0 0 0 21 45h18a4 4 0 0 0 .9-7.9Z" fill="#fff"/>' },
    calendar:   { grad:['#fdfdfd','#e9e9ef'], glyph:'<rect x="14" y="16" width="32" height="30" rx="6" fill="#fff"/><rect x="14" y="16" width="32" height="9" rx="6" fill="#ff453a"/><text x="30" y="42" font-size="17" font-weight="700" text-anchor="middle" fill="#1c1c1e" font-family="-apple-system,system-ui,sans-serif">3</text>' },
    notes:      { grad:['#ffe27a','#f7b500'], glyph:'<rect x="16" y="14" width="28" height="32" rx="5" fill="#fff"/><g stroke="#caa200" stroke-width="2.2" stroke-linecap="round"><path d="M22 23h16"/><path d="M22 29h16"/><path d="M22 35h10"/></g>' },
    reminders:  { grad:['#fff','#f1f1f4'], glyph:'<circle cx="22" cy="22" r="6" fill="none" stroke="#ff375f" stroke-width="2.4"/><circle cx="22" cy="36" r="6" fill="none" stroke="#ff9f0a" stroke-width="2.4"/><path d="M33 22h11M33 36h11" stroke="#c7c7cc" stroke-width="2.4" stroke-linecap="round"/>' },
    photos:     { grad:['#ffffff','#eef0f3'], glyph:'<g><circle cx="30" cy="18.5" r="5" fill="#fbb03b"/><circle cx="41" cy="26" r="5" fill="#7ad06d"/><circle cx="41.5" cy="38" r="5" fill="#4aa3ff"/><circle cx="30" cy="44" r="5" fill="#a06bff"/><circle cx="18.5" cy="38" r="5" fill="#ff5fae"/><circle cx="18" cy="26" r="5" fill="#ff6b5e"/></g>' },
    settings:   { grad:['#a9b0bd','#5b6473'], glyph:'<path fill="#fff" d="M30 13l3 1.2 2.6-1.9 2.4 2.4-1.9 2.6L37.8 23l3.1 1 .1 3.4-3 1.2-.2 3.2 2.2 2.7-2.1 2.6-3.2-.9-2.3 2.3L30 47l-2.4-4.8-3.2.9-2.1-2.6 2.2-2.7-.2-3.2-3-1.2.1-3.4 3.1-1 1.3-3.1-1.9-2.6 2.4-2.4 2.6 1.9z"/><circle cx="30" cy="30" r="6.2" fill="#5b6473"/>' },
    music:      { grad:['#fc5c7d','#9a3bd6'], glyph:'<path fill="#fff" d="M41 15.5l-15 3.2v17a6 6 0 1 0 3 5.2V25l9-1.9v9.1a6 6 0 1 0 3 5.2V15.5z"/>' },
    messages:   { grad:['#5df97a','#0fbf3f'], glyph:'<path fill="#fff" d="M30 16c8.3 0 15 5.6 15 12.4 0 6.9-6.7 12.5-15 12.5-1.7 0-3.4-.2-4.9-.7l-6.1 2.3 1.8-5.2C24 38 21 33.7 21 28.4 21 21.6 27 16 30 16z" transform="translate(-0.5)"/>' },
    browser:    { grad:['#4ad6ff','#1f63f0'], glyph:'<circle cx="30" cy="30" r="16" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M37 23l-9 5-5 9 9-5z" fill="#fff"/><path d="M30 30l-2-2" stroke="#1f63f0" stroke-width="1.6"/>' },
    camera:     { grad:['#d7dadf','#8b8f97'], glyph:'<rect x="14" y="20" width="32" height="22" rx="6" fill="#2b2d31"/><path d="M24 20l2-3h8l2 3" fill="none" stroke="#2b2d31" stroke-width="3"/><circle cx="30" cy="31" r="7" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="40" cy="25" r="1.8" fill="#ffd66b"/>' },
    phone:      { grad:['#5df97a','#08bb34'], glyph:'<path fill="#fff" d="M22 17c1.4-.4 2.9.3 3.5 1.6l1.6 3.4c.5 1 .3 2.3-.5 3.1l-1.6 1.6c1.2 2.7 3.4 4.9 6.1 6.1l1.6-1.6c.8-.8 2-1 3.1-.5l3.4 1.6c1.3.6 2 2.1 1.6 3.5l-.8 3c-.4 1.4-1.7 2.3-3.1 2.1C26.9 43.4 16.6 33.1 15.9 21.9c-.1-1.4.8-2.7 2.1-3.1l4-1.8z"/>' },
    mail:       { grad:['#34c2ff','#1f7bf0'], glyph:'<rect x="15" y="20" width="30" height="20" rx="4" fill="#fff"/><path d="M16 22l14 10 14-10" fill="none" stroke="#1f7bf0" stroke-width="2.4"/>' },
    maps:       { grad:['#7ee07f','#3aa0ff'], glyph:'<path d="M16 22l9-3 10 3 9-3v19l-9 3-10-3-9 3z" fill="#fff" opacity=".9"/><path d="M25 19v19M35 22v19" stroke="#3aa0ff" stroke-width="1.6"/><path d="M30 24a4 4 0 0 1 4 4c0 3-4 7-4 7s-4-4-4-7a4 4 0 0 1 4-4z" fill="#ff453a"/>' },
    health:     { grad:['#fff','#f1f1f4'], glyph:'<path fill="#ff2d55" d="M30 43s-11-7-11-15a6.4 6.4 0 0 1 11-4 6.4 6.4 0 0 1 11 4c0 8-11 15-11 15z"/>' },
    appstore:   { grad:['#19c2fb','#1f70f3'], glyph:'<path fill="#fff" d="M30 16l3.5 6-7 12h7l3 5H20.5l-2.5 4.3 3-5.3h-4l9-15.6L30 16zm6.5 12l2.5 4.3h-5z"/>' },
    files:      { grad:['#5ec8ff','#2f86e8'], glyph:'<path d="M16 22a3 3 0 0 1 3-3h7l3 4h9a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z" fill="#fff"/>' }
  };

  function render(id){
    const d = G[id] || G.notes;
    const gid = 'g_'+id+'_'+Math.random().toString(36).slice(2,7);
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${d.grad[0]}"/><stop offset="1" stop-color="${d.grad[1]}"/>
      </linearGradient></defs>
      <rect x="0" y="0" width="60" height="60" rx="13.5" fill="url(#${gid})"/>
      ${d.glyph}
    </svg>`;
  }
  window.ICONS = { render, list:Object.keys(G) };
})();
