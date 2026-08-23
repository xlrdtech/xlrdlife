// screen-home.jsx — Home dashboard (overhauled)

function HomeScreen({ onScan, onTab, gold }) {
  // Live scans from localStorage, fallback to seed
  const [scans, setScans] = React.useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ee.scans") || "[]");
      return stored.length > 0 ? stored : RECENT_SCANS;
    } catch (e) { return RECENT_SCANS; }
  });

  React.useEffect(() => {
    const onScanSaved = () => {
      try {
        const stored = JSON.parse(localStorage.getItem("ee.scans") || "[]");
        if (stored.length > 0) setScans(stored);
      } catch (e) {}
    };
    window.addEventListener("ee:scan-saved", onScanSaved);
    return () => window.removeEventListener("ee:scan-saved", onScanSaved);
  }, []);

  const todayScore = scans.length > 0
    ? Math.round(scans.slice(0, 3).reduce((a, s) => a + s.score, 0) / Math.min(3, scans.length))
    : 0;
  const last7 = SCORE_HISTORY.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const prev7 = SCORE_HISTORY.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const delta = Math.round(last7 - prev7);

  const topGap = NUTRIENTS.filter((n) => n.status === "low").slice(0, 2);
  const featuredSwap = SWAP_DB[0]; // Cheez-It → Mary's Gone

  return (
    <div className="ee-screen ee-home">
      {/* HEADER */}
      <header className="ee-app-hd">
        <div className="ee-app-hd-l">
          <div className="ee-mark">
            <span className="ee-mark-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                <path d="M4 12c0-4.4 3.6-8 8-8 2.4 0 4.5 1.1 6 2.7l-9.3 5.4 9.3 5.4A8 8 0 0 1 4 12z"
                      fill="currentColor"/>
              </svg>
            </span>
            <span>
              <div className="ee-mark-name">E.A.T.S.</div>
              <div className="ee-mark-sub">Electric · ATL</div>
            </span>
          </div>
        </div>
        <button className="ee-icon-btn" aria-label="Profile" title="Electric EATS team"
          onClick={() => alert("Electric EATS — built by East Allen (SelfExec), Luckie Goggins (L7S Inc), Adonis Durden (Golden 33). hitthe.link/e")}>
          <span className="ee-avatar">AD</span>
        </button>
      </header>

      {/* GREETING */}
      <section className="ee-pad-x" style={{ paddingTop: "calc(var(--gap-2) * 1)" }}>
        <Kicker>FRI · MAY 15 · 6:32 PM</Kicker>
        <h1 className="ee-h1">
          Evening, Adonis.<br />
          <span className="ee-grad-text">Your week's trending up.</span>
        </h1>
      </section>

      {/* HERO — Today's Clean Score */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <Card pad={0} gold={gold} className="ee-hero-card">
          <div className="ee-hero-bg" aria-hidden="true" />
          <div className="ee-hero-grid">
            <div className="ee-hero-meta">
              <Kicker>Today's clean score</Kicker>
              <div className="ee-hero-num">
                <ScoreBadge score={todayScore} size="xl" />
              </div>
              <div className="ee-hero-row">
                <Delta value={delta} />
                <span className="ee-muted">vs last week</span>
              </div>
            </div>
            <div className="ee-hero-ring">
              <ScoreRing score={todayScore} size={120} stroke={7} />
              <div className="ee-hero-ring-cap">
                <Kicker style={{ fontSize: 9 }}>14-DAY AVG</Kicker>
                <div className="ee-hero-ring-num">
                  {Math.round(SCORE_HISTORY.reduce((a, b) => a + b, 0) / SCORE_HISTORY.length)}
                </div>
              </div>
            </div>
          </div>
          <div className="ee-hero-spark">
            <Sparkline data={SCORE_HISTORY} height={48} />
          </div>
        </Card>
      </section>

      {/* PRIMARY ACTION */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <button className="ee-cta" onClick={onScan}>
          <span className="ee-cta-orb" aria-hidden="true">
            <span className="ee-cta-pulse" />
            <Icon.scan size={22} />
          </span>
          <span className="ee-cta-body">
            <span className="ee-cta-title">Decode a label</span>
            <span className="ee-cta-sub">Camera or paste · &lt;60s</span>
          </span>
          <Icon.arrow size={16} />
        </button>
      </section>

      {/* NUTRIENT GAPS */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <div className="ee-sec-hd">
          <div>
            <Kicker>From your labs</Kicker>
            <h3 className="ee-h3">Watch list</h3>
          </div>
          <button className="ee-link" onClick={() => onTab("stats")}>All gaps →</button>
        </div>
        <div className="ee-watchlist">
          {topGap.map((n) => (
            <div key={n.name} className="ee-watch">
              <div className="ee-watch-bar">
                <span style={{ width: `${(parseFloat(n.value) / parseFloat(n.target)) * 100}%` }} />
              </div>
              <div className="ee-watch-row">
                <span className="ee-watch-name"><FlagDot flag="red" /> {n.name}</span>
                <span className="ee-mono ee-muted">{n.value} <span className="ee-tiny">/ {n.target}</span></span>
              </div>
              <div className="ee-watch-tag">Low — boost with iron-rich greens & lentils.</div>
            </div>
          )).slice(0, 1)}
        </div>
      </section>

      {/* RECENT SCANS */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <div className="ee-sec-hd">
          <div>
            <Kicker>Recent</Kicker>
            <h3 className="ee-h3">Decoded this week</h3>
          </div>
          <Kicker>{scans.length} · 7D</Kicker>
        </div>
        <div className="ee-recent">
          {scans.slice(0, 4).map((s, i) => <RecentRow key={i} s={s} />)}
        </div>
      </section>

      {/* TONIGHT'S SUGGESTION */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <div className="ee-sec-hd">
          <div>
            <Kicker gold>For tonight</Kicker>
            <h3 className="ee-h3">A swap worth making</h3>
          </div>
        </div>
        <Card gold={gold} className="ee-swap-feat" onClick={() => onTab("swap")}>
          <div className="ee-swap-feat-row">
            <div className="ee-swap-feat-side ee-swap-from">
              <Kicker>From</Kicker>
              <div className="ee-swap-feat-brand">{featuredSwap.fromBrand}</div>
              <div className="ee-swap-feat-name">{featuredSwap.fromName}</div>
              <ScoreBadge score={featuredSwap.fromScore} size="md" />
            </div>
            <div className="ee-swap-arrow"><Icon.arrow size={18} /></div>
            <div className="ee-swap-feat-side ee-swap-to">
              <Kicker gold>To</Kicker>
              <div className="ee-swap-feat-brand">{featuredSwap.toBrand}</div>
              <div className="ee-swap-feat-name">{featuredSwap.toName}</div>
              <ScoreBadge score={featuredSwap.toScore} size="md" />
            </div>
          </div>
          <div className="ee-swap-feat-delta">
            <Icon.upArrow size={11} /> +{featuredSwap.toScore - featuredSwap.fromScore} clean score
          </div>
          <div className="ee-swap-feat-cta">
            See 3 reasons & where to buy <Icon.arrow size={12} />
          </div>
        </Card>
      </section>

      {/* CATEGORIES */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)", paddingBottom: 120 }}>
        <div className="ee-sec-hd">
          <div>
            <Kicker>Browse</Kicker>
            <h3 className="ee-h3">Categories</h3>
          </div>
        </div>
        <div className="ee-cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c} className="ee-cat" onClick={() => onTab("swap", c)}>
              <span className="ee-cat-glyph">{CAT_GLYPH[c]}</span>
              <span className="ee-cat-name">{c}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const CAT_GLYPH = {
  Snacks: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h18l-2 12H5L3 8z"/><path d="M3 8l3-5h12l3 5"/>
    </svg>
  ),
  Cereals: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16l-2 13H6L4 7z"/><path d="M8 12c1.5 0 2-1 2-2M14 12c1.5 0 2-1 2-2M11 16c1.5 0 2-1 2-2"/>
    </svg>
  ),
  Dairy: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h8v3l2 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9l2-4V3z"/>
    </svg>
  ),
  Beverages: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10l-1 16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 4z"/><path d="M7 9h10"/>
    </svg>
  ),
  Frozen: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M5 7l14 10M5 17l14-10"/><path d="M12 7l2-2M12 7l-2-2M12 17l2 2M12 17l-2 2"/>
    </svg>
  ),
  Sauces: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2h4v4h2v3H8V6h2V2z"/><path d="M7 9h10l-1 13H8L7 9z"/>
    </svg>
  ),
};

function RecentRow({ s }) {
  return (
    <div className="ee-row">
      <div className="ee-row-l">
        <div className={"ee-row-thumb tone-" + s.flag}>
          <FlagDot flag={s.flag} size={8} />
        </div>
        <div className="ee-row-body">
          <div className="ee-row-brand">{s.brand}</div>
          <div className="ee-row-name">{s.name}</div>
          <div className="ee-row-when">{s.when}</div>
        </div>
      </div>
      <div className="ee-row-r">
        <ScoreBadge score={s.score} size="md" />
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen });
