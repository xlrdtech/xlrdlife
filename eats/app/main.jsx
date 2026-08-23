// main.jsx — Electric EATS root: iOS frame + tab routing + Tweaks panel

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "primary": ["#10b981", "#67e8a3", "#0a3a23"],
  "density": "regular",
  "typeface": "Fraunces",
  "background": "radial",
  "gold": true
}/*EDITMODE-END*/;

// Map primary palette → OKLCH (the original token format). Each chip:
// [base, glow, deep-bg-tint]
const PRIMARY_THEMES = {
  // electric green — matches the existing brand
  "#10b981": { base: "oklch(0.72 0.19 145)", glow: "oklch(0.82 0.22 140)", track: "oklch(0.22 0.03 145)" },
  // lime
  "#a3e635": { base: "oklch(0.84 0.20 125)", glow: "oklch(0.90 0.22 122)", track: "oklch(0.22 0.04 125)" },
  // mint
  "#2dd4bf": { base: "oklch(0.78 0.13 175)", glow: "oklch(0.86 0.15 175)", track: "oklch(0.22 0.03 175)" },
  // amber-gold (alt)
  "#f59e0b": { base: "oklch(0.78 0.16 75)",  glow: "oklch(0.86 0.18 75)",  track: "oklch(0.22 0.04 75)" },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState("home");
  const [scanOpen, setScanOpen] = React.useState(false);
  const [category, setCategory] = React.useState("Snacks");
  const [scans, setScans] = React.useState(RECENT_SCANS.length);

  // CSS variables driven by tweaks.
  const primaryHex = Array.isArray(t.primary) ? t.primary[0] : t.primary;
  const theme = PRIMARY_THEMES[primaryHex] || PRIMARY_THEMES["#10b981"];
  const dark = !!t.dark;
  const densityScale = { compact: 0.85, regular: 1, airy: 1.18 }[t.density] || 1;
  const fontMap = {
    "Fraunces":         '"Fraunces", Georgia, serif',
    "Instrument":       '"Instrument Serif", "Fraunces", Georgia, serif',
    "EB Garamond":      '"EB Garamond", Georgia, serif',
    "DM Serif Display": '"DM Serif Display", Georgia, serif',
  };

  const goSwap = (cat) => {
    if (cat) setCategory(cat);
    setTab("swap");
  };

  const onSaveScan = (entry) => {
    setScans((n) => n + 1);
    setTab("stats");
  };

  // Tab→screen
  const screen = (() => {
    if (tab === "home")   return <HomeScreen onScan={() => setScanOpen(true)} onTab={(t, p) => t === "swap" ? goSwap(p) : setTab(t)} gold={t.gold} />;
    if (tab === "swap")   return <SwapScreen category={category} setCategory={setCategory} gold={t.gold} />;
    if (tab === "source") return <SourceScreen gold={t.gold} />;
    if (tab === "stats")  return <StatsScreen gold={t.gold} scans={scans} />;
    return null;
  })();

  return (
    <div className={"ee-root" + (dark ? " is-dark" : " is-light") + " bg-" + t.background + (t.gold ? " is-gold" : "")}
         style={{
           "--primary": theme.base,
           "--primary-glow": theme.glow,
           "--track": theme.track,
           "--density": densityScale,
           "--font-serif": fontMap[t.typeface] || fontMap.Fraunces,
         }}>
      {/* Full-page app shell (no iOS chrome) */}
      <div className="ee-app-shell ee-app-shell-fullpage">
        <div className="ee-scroll" key={tab}>
          {screen}
        </div>
        <TabBar tab={tab} onTab={setTab} onScan={() => setScanOpen(true)} />
        <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} onSave={onSaveScan} />
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
          <TweakColor
            label="Primary hue"
            value={t.primary}
            options={[
              ["#10b981", "#67e8a3", "#0a3a23"], // electric green (default)
              ["#a3e635", "#d9f99d", "#1a2810"], // lime
              ["#2dd4bf", "#99f6e4", "#0c2e2b"], // mint
              ["#f59e0b", "#fcd34d", "#2a1f08"], // alt amber-gold
            ]}
            onChange={(v) => setTweak('primary', v)}
          />
          <TweakToggle label="Gold hairline" value={t.gold} onChange={(v) => setTweak('gold', v)} />
        </TweakSection>

        <TweakSection label="Typography">
          <TweakSelect
            label="Display face"
            value={t.typeface}
            options={["Fraunces", "Instrument", "EB Garamond", "DM Serif Display"]}
            onChange={(v) => setTweak('typeface', v)}
          />
        </TweakSection>

        <TweakSection label="Layout">
          <TweakRadio
            label="Density"
            value={t.density}
            options={["compact", "regular", "airy"]}
            onChange={(v) => setTweak('density', v)}
          />
          <TweakRadio
            label="Background"
            value={t.background}
            options={["flat", "radial", "noise"]}
            onChange={(v) => setTweak('background', v)}
          />
        </TweakSection>

        <TweakSection label="Navigation">
          <TweakSelect
            label="Open screen"
            value={tab}
            options={[
              { value: "home", label: "Home / Scan" },
              { value: "swap", label: "Swaps" },
              { value: "source", label: "Sources" },
              { value: "stats", label: "Stats" },
            ]}
            onChange={(v) => setTab(v)}
          />
          <TweakButton label={scanOpen ? "Close scan sheet" : "Open scan sheet"} onClick={() => setScanOpen(!scanOpen)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function tabTitle(tab) {
  return { home: "Home — Decode anything", swap: "Swap — Same craving, cleaner score",
           source: "Source — Where to actually buy it", stats: "Stats — Your clean-eating trend" }[tab] || "";
}

function TabBar({ tab, onTab, onScan }) {
  return (
    <nav className="ee-tabs" data-screen-label="Tab bar">
      <div className="ee-tabs-inner">
        <TabBtn id="home"   icon={<Icon.scan  size={17} />} label="Home"    tab={tab} onTab={onTab} />
        <TabBtn id="swap"   icon={<Icon.swap  size={17} />} label="Swap"    tab={tab} onTab={onTab} />
        <button className="ee-tab-fab" onClick={onScan} aria-label="Scan a label">
          <span className="ee-tab-fab-pulse" />
          <Icon.bolt size={18} />
        </button>
        <TabBtn id="source" icon={<Icon.pin   size={17} />} label="Source"  tab={tab} onTab={onTab} />
        <TabBtn id="stats"  icon={<Icon.stats size={17} />} label="Stats"   tab={tab} onTab={onTab} />
      </div>
    </nav>
  );
}

function TabBtn({ id, icon, label, tab, onTab }) {
  const active = tab === id;
  return (
    <button className={"ee-tab " + (active ? "is-active" : "")} onClick={() => onTab(id)}>
      <span className="ee-tab-icon">{icon}</span>
      <span className="ee-tab-label">{label}</span>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
