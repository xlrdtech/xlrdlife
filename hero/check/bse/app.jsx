/* global React, ReactDOM */
const { useState, useEffect, useMemo } = React;

// --- Theme Presets ---
const THEMES = [
  { id: 'light', name: 'Classic Light', isDark: false, bg: 'bg-slate-50', card: 'bg-white', text: 'text-slate-900', border: 'border-slate-200', accent: 'bg-blue-600', accentText: 'text-white', accentBorder: 'border-blue-600', subtext: 'text-slate-500', headerBg: 'bg-slate-900', navBg: 'bg-white', chartFill: '#3B82F622', chartStroke: '#3B82F6', badgeBg: 'bg-slate-100 text-slate-400' },
  { id: 'dark', name: 'Slate Night', isDark: true, bg: 'bg-slate-950', card: 'bg-slate-900', text: 'text-slate-100', border: 'border-slate-800', accent: 'bg-amber-500', accentText: 'text-slate-950', accentBorder: 'border-amber-500', subtext: 'text-slate-400', headerBg: 'bg-slate-950', navBg: 'bg-slate-900', chartFill: '#F59E0B22', chartStroke: '#F59E0B', badgeBg: 'bg-slate-800 text-amber-400' },
  { id: 'emerald', name: 'Emerald Oasis', isDark: false, bg: 'bg-emerald-50/50', card: 'bg-white', text: 'text-emerald-950', border: 'border-emerald-100', accent: 'bg-emerald-600', accentText: 'text-white', accentBorder: 'border-emerald-600', subtext: 'text-emerald-700/60', headerBg: 'bg-emerald-950', navBg: 'bg-white', chartFill: '#10B98122', chartStroke: '#10B981', badgeBg: 'bg-emerald-100 text-emerald-600' },
  { id: 'cyberpunk', name: 'Neon Cyber', isDark: true, bg: 'bg-zinc-950', card: 'bg-zinc-900', text: 'text-zinc-100', border: 'border-zinc-800', accent: 'bg-pink-600', accentText: 'text-white', accentBorder: 'border-pink-600', subtext: 'text-zinc-400', headerBg: 'bg-zinc-950', navBg: 'bg-zinc-900', chartFill: '#EC489922', chartStroke: '#EC4899', badgeBg: 'bg-zinc-800 text-pink-400' },
  { id: 'sunset', name: 'Sunset Glow', isDark: false, bg: 'bg-orange-50/50', card: 'bg-white', text: 'text-orange-950', border: 'border-orange-100', accent: 'bg-orange-600', accentText: 'text-white', accentBorder: 'border-orange-600', subtext: 'text-orange-700/60', headerBg: 'bg-orange-950', navBg: 'bg-white', chartFill: '#F9731622', chartStroke: '#F97316', badgeBg: 'bg-orange-100 text-orange-600' },
  { id: 'royal', name: 'Royal Amethyst', isDark: true, bg: 'bg-violet-950', card: 'bg-violet-900/50', text: 'text-violet-100', border: 'border-violet-800/60', accent: 'bg-fuchsia-500', accentText: 'text-white', accentBorder: 'border-fuchsia-500', subtext: 'text-violet-300', headerBg: 'bg-violet-950', navBg: 'bg-violet-900', chartFill: '#D946EF22', chartStroke: '#D946EF', badgeBg: 'bg-violet-800 text-fuchsia-300' },
  { id: 'ocean', name: 'Deep Sea', isDark: true, bg: 'bg-cyan-950', card: 'bg-cyan-900/50', text: 'text-cyan-100', border: 'border-cyan-800/60', accent: 'bg-cyan-400', accentText: 'text-slate-950', accentBorder: 'border-cyan-400', subtext: 'text-cyan-300', headerBg: 'bg-cyan-950', navBg: 'bg-cyan-900', chartFill: '#22D3EE22', chartStroke: '#22D3EE', badgeBg: 'bg-cyan-800 text-cyan-300' }
];

const GoldLogo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gold" x1="2" y1="4" x2="22" y2="20">
        <stop offset="0" stopColor="#FCD34D" /><stop offset="0.5" stopColor="#D97706" /><stop offset="1" stopColor="#78350F" />
      </linearGradient>
    </defs>
    <path d="M20 6L9 17L4 12" stroke="url(#gold)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BrandLogo = ({ size = 32, textClass = "font-black tracking-tighter uppercase" }) => (
  <div className="flex items-center gap-2">
    <GoldLogo size={size} />
    <span className={textClass}>HERO</span>
  </div>
);

const Icon = ({ p, size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} dangerouslySetInnerHTML={{ __html: p }} />
);

const Pointer = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="black" stroke="white" strokeWidth="2">
    <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" />
  </svg>
);

const LevelUpCelebration = ({ missionName, onDone }) => (
  <div className="fixed inset-0 z-[10002] flex items-center justify-center p-6 bg-slate-900/80 animate-fade-in">
    <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full text-center shadow-2xl animate-bounce">
      <div className="mb-6 flex justify-center">
        <BrandLogo size={56} textClass="text-4xl font-black tracking-tighter uppercase text-slate-900" />
      </div>
      <h2 className="text-3xl font-black mb-2 italic text-slate-900">MISSION COMPLETE!</h2>
      <p className="text-slate-500 font-bold mb-8">You finished: <br /><span className="text-blue-600">{missionName}</span></p>
      <button onClick={onDone} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all">Keep Building</button>
    </div>
  </div>
);

const MissionChart = ({ rate, fill, stroke }) => (
  <div className="h-16 w-full relative bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
    <div className="absolute inset-0 flex items-center justify-center opacity-10 font-black text-2xl">{rate}%</div>
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full">
      <path d={`M 0 20 L 0 ${20 - (rate * 0.2)} L 100 ${20 - (rate * 0.2)} L 100 20 Z`} fill={fill} />
      <line x1="0" y1={20 - (rate * 0.2)} x2="100" y2={20 - (rate * 0.2)} stroke={stroke} strokeWidth="1" strokeDasharray="2 1" />
    </svg>
  </div>
);

const initialData = [
  { id: 'm1', name: "Mission 1: The Vision", tasks: [
    { id: 'm1t1', text: 'Pick a great name', group: 'Planning', completed: false, steps: ['Brainstorm 10 names', 'Check if domain is open'] },
    { id: 'm1t2', text: 'Write your goal', group: 'Planning', completed: false, steps: ['Write 1 sentence goal', 'Find 3 competitors'] }
  ]},
  { id: 'm2', name: "Mission 2: Legal Setup", tasks: [
    { id: 'm2t1', text: 'Pick LLC or Corp', group: 'Legal', completed: false, steps: ['Talk to an expert', 'Pick state of filing'] },
    { id: 'm2t2', text: 'File paperwork', group: 'Legal', completed: false, steps: ['Submit to state', 'Get formation documents'] }
  ]},
  { id: 'm3', name: "Mission 3: Taxes & ID", tasks: [
    { id: 'm3t1', text: 'Get a Tax ID (EIN)', group: 'Taxes', completed: false, steps: ['Apply on IRS website', 'Save your PDF letter'] },
    { id: 'm3t2', text: 'State Tax Setup', group: 'Taxes', completed: false, steps: ['Register with state', 'Get sales tax ID'] }
  ]},
  { id: 'm4', name: "Mission 4: Bank Account", tasks: [
    { id: 'm4t1', text: 'Open business bank', group: 'Money', completed: false, steps: ['Bring EIN to bank', 'Order debit card'] },
    { id: 'm4t2', text: 'Initial Deposit', group: 'Money', completed: false, steps: ['Move $100 in', 'Set up mobile app'] }
  ]},
  { id: 'm5', name: "Mission 5: Local Permits", tasks: [
    { id: 'm5t1', text: 'Business License', group: 'Legal', completed: false, steps: ['Check city rules', 'Pay license fee'] },
    { id: 'm5t2', text: 'Zoning Check', group: 'Planning', completed: false, steps: ['Confirm home office', 'Get permit if needed'] }
  ]},
  { id: 'm6', name: "Mission 6: Insurance", tasks: [
    { id: 'm6t1', text: 'Get Liability Plan', group: 'Safety', completed: false, steps: ['Get 3 quotes', 'Pick the best one'] },
    { id: 'm6t2', text: 'Secure accounts', group: 'Safety', completed: false, steps: ['Enable 2FA', 'Update passwords'] }
  ]},
  { id: 'm7', name: "Mission 7: Digital Brand", tasks: [
    { id: 'm7t1', text: 'Website Launch', group: 'Web', completed: false, steps: ['Build landing page', 'Add contact form'] },
    { id: 'm7t2', text: 'Social Media', group: 'Web', completed: false, steps: ['Claim @handle', 'Post first update'] }
  ]},
  { id: 'm8', name: "Mission 8: Official Launch", tasks: [
    { id: 'm8t1', text: 'Launch Marketing', group: 'Sales', completed: false, steps: ['Email your list', 'Tell your friends'] },
    { id: 'm8t2', text: 'First Sale!', group: 'Sales', completed: false, steps: ['Get first payment', 'Ship the product'] }
  ]}
];

function App() {
  const [view, setView] = useState('home');
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [xp, setXp] = useState(() => Number(localStorage.getItem('ch-empire-xp') || 0));
  const [themeIdx, setThemeIdx] = useState(() => Number(localStorage.getItem('ch-empire-theme') || 0));
  const [time, setTime] = useState(new Date());
  const [input, setInput] = useState("");
  const [tour, setTour] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const [tourStep, setTourStep] = useState(0);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const [missions, setMissions] = useState(() => {
    const saved = localStorage.getItem('ch-empire-missions');
    return saved ? JSON.parse(saved) : initialData;
  });

  const t = useMemo(() => THEMES[themeIdx] || THEMES[0], [themeIdx]);

  useEffect(() => {
    localStorage.setItem('ch-empire-missions', JSON.stringify(missions));
    localStorage.setItem('ch-empire-xp', xp);
    localStorage.setItem('ch-empire-theme', themeIdx);
    const timer = setInterval(() => setTime(new Date()), 1000);
    if (!localStorage.getItem('ch-empire-onboarded')) setTour(true);
    return () => clearInterval(timer);
  }, [missions, xp, themeIdx]);

  const toggleDarkLight = () => setThemeIdx(t.isDark ? 0 : 1);

  const randomizeTheme = () => {
    const targetDarkness = t.isDark;
    const eligibleThemes = THEMES.filter(theme => theme.isDark === targetDarkness);
    if (eligibleThemes.length <= 1) return;
    let nextTheme;
    do {
      nextTheme = eligibleThemes[Math.floor(Math.random() * eligibleThemes.length)];
    } while (nextTheme.id === t.id);
    setThemeIdx(THEMES.findIndex(theme => theme.id === nextTheme.id));
  };

  const level = Math.floor(xp / 100) + 1;
  const activeMission = useMemo(() => missions.find(m => m.id === activeMissionId), [missions, activeMissionId]);

  const toggleTask = (mId, tId) => {
    setMissions(prev => prev.map(m => {
      if (m.id === mId) {
        const wasDone = m.tasks.every(t => t.completed);
        const nextTasks = m.tasks.map(task => {
          if (task.id === tId) {
            const nextStatus = !task.completed;
            if (nextStatus) setXp(v => v + 10);
            return { ...task, completed: nextStatus };
          }
          return task;
        });
        const isNowDone = nextTasks.every(task => task.completed);
        if (!wasDone && isNowDone) setCelebrate(m.name);
        return { ...m, tasks: nextTasks };
      }
      return m;
    }));
  };

  const addBulkTasks = () => {
    if (!input.trim() || !activeMissionId) return;
    const lines = input.split('\n').filter(l => l.trim());
    setMissions(prev => prev.map(m => {
      if (m.id === activeMissionId) {
        const newTasks = lines.map(l => ({ id: crypto.randomUUID(), text: l.trim(), group: 'New Task', completed: false, steps: [] }));
        return { ...m, tasks: [...newTasks, ...m.tasks] };
      }
      return m;
    }));
    setXp(v => v + (lines.length * 5));
    setInput("");
  };

  const moveTask = (mId, idx, dir, e) => {
    e.stopPropagation();
    setMissions(prev => prev.map(m => {
      if (m.id === mId) {
        const next = [...m.tasks];
        if (dir === 'up' && idx > 0) [next[idx], next[idx-1]] = [next[idx-1], next[idx]];
        else if (dir === 'down' && idx < next.length-1) [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
        return { ...m, tasks: next };
      }
      return m;
    }));
  };

  const deleteTask = (mId, tId, e) => {
    e.stopPropagation();
    setMissions(prev => prev.map(m => m.id === mId ? { ...m, tasks: m.tasks.filter(task => task.id !== tId) } : m));
  };

  const steps = [
    { title: "Hello Hero!", msg: "This is your Business Empire. You have 8 missions to finish to win." },
    { title: "Missions", msg: "Each box is a full app mission. Tap one to start working on it.", target: 'mission-m1' },
    { title: "Progress", msg: "Finish all missions to build your company. Good luck!", target: 'main-stats' }
  ];

  useEffect(() => {
    if (tour) {
      const targetId = steps[tourStep].target;
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setCursor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
      }
    }
  }, [tourStep, tour]);

  const totalTasks = missions.flatMap(m => m.tasks).length;
  const totalCompleted = missions.flatMap(m => m.tasks).filter(task => task.completed).length;
  const empireRate = totalTasks === 0 ? 0 : Math.round((totalCompleted / totalTasks) * 100);

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col pb-20 select-none transition-colors duration-300`}>

      <div className={`${t.isDark ? 'bg-slate-950 text-slate-200' : 'bg-slate-900 text-white'} px-6 py-2.5 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] border-b border-white/10 transition-colors duration-300`}>
        <div className="flex items-center gap-4">
          <span className="text-amber-500 animate-pulse">● LIVE</span>
          <span>{time.toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-500">LEVEL {level}</span>
          <span className="text-amber-400">{xp % 100}/100 XP</span>
        </div>
      </div>

      <nav className={`${t.card} h-16 px-6 flex items-center justify-between sticky top-0 z-[100] border-b ${t.border} shadow-sm transition-colors duration-300`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setActiveMissionId(null); }}>
          <BrandLogo size={28} textClass="font-black text-2xl tracking-tighter uppercase leading-none" />
          <div className="hidden sm:flex h-4 w-px bg-slate-300 mx-2"></div>
          <span className="hidden sm:inline-block text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded">Business Starter Edition</span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex ${t.isDark ? 'bg-slate-800' : 'bg-slate-100'} p-1 rounded-xl transition-colors`}>
            {['home', 'stats', 'guide'].map(v => (
              <button key={v} onClick={() => { setView(v); setActiveMissionId(null); }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === v && !activeMissionId ? (t.isDark ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm') : (t.isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600')}`}>
                {v === 'home' ? 'Empire' : v}
              </button>
            ))}
          </div>

          <div className={`flex ${t.isDark ? 'bg-slate-800' : 'bg-slate-100'} p-1 rounded-xl transition-colors`}>
            <button onClick={toggleDarkLight} className={`p-1.5 rounded-lg text-[10px] font-black transition-all ${t.isDark ? 'text-slate-400 hover:bg-slate-900 hover:text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} title="Toggle Light/Dark">{t.isDark ? '☀️' : '🌙'}</button>
            <button onClick={randomizeTheme} className={`p-1.5 rounded-lg text-[10px] font-black transition-all ${t.isDark ? 'text-slate-400 hover:bg-slate-900 hover:text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} title="Randomize Theme">🎲</button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl w-full mx-auto p-6">

        {tour && (
          <div className="fixed inset-0 z-[10001] pointer-events-none">
            <div className="absolute inset-0 bg-slate-900/70"></div>
            <div className="fixed z-[10002]" style={{ left: cursor.x, top: cursor.y }}><Pointer /></div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm p-8 bg-white rounded-[2.5rem] shadow-2xl pointer-events-auto border border-slate-100">
              <h4 className="text-2xl font-black mb-1 text-slate-900">{steps[tourStep].title}</h4>
              <p className="text-sm text-slate-500 font-bold mb-8 leading-relaxed">{steps[tourStep].msg}</p>
              <button onClick={() => tourStep < steps.length - 1 ? setTourStep(tourStep + 1) : (setTour(false), localStorage.setItem('ch-empire-onboarded', 'true'))} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-600 shadow-xl transition-all">
                {tourStep === steps.length - 1 ? "Let's Go" : "Next"}
              </button>
            </div>
          </div>
        )}

        {celebrate && <LevelUpCelebration missionName={celebrate} onDone={() => setCelebrate(null)} />}

        {view === 'home' && !activeMissionId && (
          <div className="space-y-8 animate-in">
            <div id="main-stats" className="bg-slate-900 text-white rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl border border-slate-800">
              <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600 blur-[100px] opacity-20"></div>
              <div className="relative z-10 flex justify-between items-end mb-6">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Empire Health</p>
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase">{empireRate}% COMPLETE</h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-amber-500 uppercase mb-1">Overall XP: {xp}</p>
                  <p className="text-2xl font-black italic">RANK {level}</p>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full progress-fill transition-all duration-1000 ${t.accent}`} style={{ width: `${empireRate}%` }}></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {missions.map(m => {
                const mDone = m.tasks.filter(task => task.completed).length;
                const mTotal = m.tasks.length;
                const mRate = mTotal === 0 ? 0 : Math.round((mDone / mTotal) * 100);
                return (
                  <div key={m.id} id={`mission-${m.id}`} onClick={() => { setActiveMissionId(m.id); setView('mission'); }}
                    className={`${t.card} border ${t.border} p-6 rounded-[2rem] hover:border-blue-500 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className={`p-4 ${t.isDark ? 'bg-slate-800/80' : 'bg-slate-50'} rounded-2xl group-hover:bg-blue-50/50 transition-colors`}>
                        <GoldLogo size={24} />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</p>
                        <p className={`text-lg font-black ${t.isDark ? 'text-slate-100' : 'text-slate-900'}`}>{mRate}%</p>
                      </div>
                    </div>
                    <div>
                      <h3 className={`text-lg font-black ${t.isDark ? 'text-slate-200' : 'text-slate-900'} mb-4`}>{m.name}</h3>
                      <div className={`w-full ${t.isDark ? 'bg-slate-800' : 'bg-slate-100'} h-1.5 rounded-full overflow-hidden mb-2`}>
                        <div className={`h-full transition-all duration-700 ${t.accent}`} style={{ width: `${mRate}%` }}></div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mDone}/{mTotal} JOBS FINISHED</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'mission' && activeMission && (
          <div className="space-y-6 animate-in">
            <header className="flex items-center justify-between mb-8">
              <button onClick={() => { setView('home'); setActiveMissionId(null); }} className={`px-4 py-2 ${t.isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} rounded-xl text-xs font-bold transition-colors`}>← Back to Empire</button>
              <h2 className="text-2xl font-black italic">{activeMission.name}</h2>
              <div className="w-10"></div>
            </header>

            <div className={`${t.card} border ${t.border} p-6 rounded-[2rem] shadow-sm`}>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Mission Vitality Index</h4>
              <MissionChart rate={Math.round((activeMission.tasks.filter(task => task.completed).length / (activeMission.tasks.length || 1)) * 100)} fill={t.chartFill} stroke={t.chartStroke} />
            </div>

            <div className={`${t.card} border ${t.border} p-6 rounded-[2rem] shadow-sm`}>
              <div className="flex gap-4">
                <textarea className={`flex-grow ${t.isDark ? 'bg-slate-800 text-white' : 'bg-slate-50'} border ${t.border} rounded-xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none h-14 resize-none no-scrollbar`}
                  placeholder="Paste list or type new mission jobs..." value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addBulkTasks())} />
                <button onClick={addBulkTasks} className={`w-14 h-14 ${t.accent} ${t.accentText} rounded-xl flex items-center justify-center hover:opacity-90 transition-all shadow-xl active:scale-95`}>
                  <Icon p='<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' />
                </button>
              </div>
            </div>

            <div className={`${t.card} border ${t.border} rounded-[2rem] overflow-hidden shadow-sm`}>
              <div className="divide-y divide-slate-100">
                {activeMission.tasks.map((task, idx) => (
                  <div key={task.id}
                    onDoubleClick={() => {
                      const n = prompt("Change group name:");
                      if(n) setMissions(missions.map(m => m.id === activeMissionId ? {...m, tasks: m.tasks.map(task2 => task2.id === task.id ? {...task2, group: n} : task2)} : m));
                    }}
                    className={`group flex items-center gap-4 px-6 py-5 cursor-pointer transition-colors ${task.completed ? (t.isDark ? 'bg-slate-800/40 opacity-50' : 'bg-slate-50/50 opacity-60') : (t.isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50')}`}>
                    <div onClick={(e) => { e.stopPropagation(); toggleTask(activeMissionId, task.id); }}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${task.completed ? `${t.accent} ${t.accentBorder} shadow-lg` : (t.isDark ? 'bg-slate-850 border-slate-700' : 'bg-white border-slate-300')}`}>
                      {task.completed && <Icon p='<polyline points="20 6 9 17 4 12" />' size={14} className={t.isDark ? 'text-slate-900' : 'text-white'} />}
                    </div>
                    <div className="flex-grow min-w-0" onClick={() => toggleTask(activeMissionId, task.id)}>
                      <p className={`text-base font-bold truncate ${task.completed ? (t.isDark ? 'text-slate-600 line-through' : 'text-slate-300 line-through') : (t.isDark ? 'text-slate-100' : 'text-slate-800')}`}>{task.text}</p>
                      <span className={`text-[9px] font-black uppercase ${t.badgeBg} px-1.5 py-0.5 rounded tracking-tighter mt-1 inline-block`}>{task.group}</span>
                      {task.steps && !task.completed && (
                        <div className="mt-2 space-y-1">
                          {task.steps.map((s, i) => (
                            <div key={i} className={`flex items-center gap-2 text-[10px] font-bold ${t.isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              <div className={`w-1 h-1 rounded-full ${t.isDark ? 'bg-slate-600' : 'bg-slate-200'}`}></div>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={(e) => moveTask(activeMissionId, idx, 'up', e)} className="p-1.5 text-slate-300 hover:text-blue-600"><Icon p='<polyline points="18 15 12 9 6 15"/>' size={16} /></button>
                      <button onClick={(e) => moveTask(activeMissionId, idx, 'down', e)} className="p-1.5 text-slate-300 hover:text-blue-600"><Icon p='<polyline points="6 9 12 15 18 9"/>' size={16} /></button>
                      <button onClick={(e) => deleteTask(activeMissionId, task.id, e)} className="p-1.5 text-slate-300 hover:text-rose-500 ml-1"><Icon p='<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'stats' && (
          <div className="space-y-6 animate-in">
            <h2 className="text-2xl font-black italic mb-8">Empire Performance Audit</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: "Efficiency Index", v: `${empireRate}%`, c: "text-blue-600" },
                { l: "Mission Count", v: missions.length, c: t.isDark ? "text-slate-100" : "text-slate-900" },
                { l: "Level Status", v: level, c: "text-amber-500" },
                { l: "Total XP", v: xp, c: "text-emerald-600" }
              ].map((s, i) => (
                <div key={i} className={`${t.card} border ${t.border} p-6 rounded-2xl shadow-sm`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.l}</p>
                  <p className={`text-2xl font-black ${s.c}`}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className={`${t.card} border ${t.border} p-8 rounded-[2rem] shadow-sm`}>
              <h3 className="text-xs font-black uppercase text-slate-400 mb-8 tracking-widest">Growth Velocity (Last 10 Days)</h3>
              <div className="h-48 flex items-end gap-2">
                {[20, 45, 30, 70, 55, 90, 80, 100, 40, 65].map((h, i) => (
                  <div key={i} className={`flex-grow rounded-t-lg transition-all duration-1000 ${t.isDark ? 'bg-amber-500' : 'bg-slate-900'}`} style={{ height: `${h}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'guide' && (
          <div className="max-w-2xl mx-auto space-y-6 py-6 animate-in">
            <header className="text-center mb-10">
              <h2 className="text-3xl font-black italic tracking-tighter">OPERATIONS MANUAL</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Protocol Build 2026.02</p>
            </header>
            <div className={`${t.card} border ${t.border} p-8 rounded-[2rem] border-l-8 border-l-amber-500 shadow-sm`}>
              <h4 className="font-black text-xs uppercase text-amber-600 mb-6 tracking-widest">Control Matrix</h4>
              <div className="space-y-4 text-sm font-bold">
                <div className={`flex justify-between border-b ${t.isDark ? 'border-slate-800' : 'border-slate-50'} pb-2`}><span>Tap Checkbox</span><span className="text-blue-600">Finish Job (+10 XP)</span></div>
                <div className={`flex justify-between border-b ${t.isDark ? 'border-slate-800' : 'border-slate-50'} pb-2`}><span>Double Tap Text</span><span className="text-amber-600">Change Name</span></div>
                <div className={`flex justify-between border-b ${t.isDark ? 'border-slate-800' : 'border-slate-50'} pb-2`}><span>Arrow Buttons</span><span>Change Priority</span></div>
                <div className="flex justify-between"><span>Tap the X</span><span className="text-rose-600">Delete Permanently</span></div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className={`${t.card} border ${t.border} p-6 rounded-2xl shadow-sm`}>
                <h5 className="font-black text-[10px] uppercase mb-2">Empire Missions</h5>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">We pre-loaded the 8 missions required to build a company. Finish every sub-job in a mission to Level Up.</p>
              </div>
              <div className={`${t.card} border ${t.border} p-6 rounded-2xl shadow-sm`}>
                <h5 className="font-black text-[10px] uppercase mb-2">Bulk Pasting</h5>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">Paste list items from your phone notes or email into any mission's input box to quickly add your own custom goals.</p>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="py-12 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.6em]">
        Check Hero // Build Your Future
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
