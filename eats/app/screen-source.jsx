// screen-source.jsx — Where to buy

function SourceScreen({ gold }) {
  const [zip, setZip] = React.useState("30308");
  const [matchOnly, setMatchOnly] = React.useState(false);
  const [filter, setFilter] = React.useState("All");
  const types = ["All", "Co-op", "Farmer's Market", "Grocery", "Specialty"];
  const matchIds = new Set(SWAP_DB.flatMap((s) => s.carries));
  let list = SOURCES.slice().sort((a, b) => a.distance - b.distance);
  if (matchOnly) list = list.filter((s) => matchIds.has(s.id));
  if (filter !== "All") list = list.filter((s) => s.type === filter);

  return (
    <div className="ee-screen ee-source">
      {/* HEADER */}
      <header className="ee-app-hd">
        <div className="ee-mark">
          <span className="ee-mark-glyph"><Icon.pin size={14} /></span>
          <span>
            <div className="ee-mark-name">Sources</div>
            <div className="ee-mark-sub">Where to actually buy it</div>
          </span>
        </div>
        <button className="ee-icon-btn" aria-label="Filter by type" title="Filter by store type"
          onClick={() => document.querySelector(".ee-cat-scroll")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Icon.filter size={14} /></button>
      </header>

      {/* Search row */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)" }}>
        <div className="ee-search-row">
          <div className="ee-search">
            <Icon.search size={14} />
            <input
              type="text"
              value={zip}
              maxLength={6}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
            />
            <span className="ee-mono ee-tiny ee-muted">{list.length} found</span>
          </div>
          <button
            className={"ee-toggle " + (matchOnly ? "is-on" : "")}
            onClick={() => setMatchOnly(!matchOnly)}
          >
            <Icon.sparkle size={12} /> My swaps
          </button>
        </div>
      </section>

      {/* Map */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)" }}>
        <Card pad={0} gold={gold} className="ee-map-card">
          <SourceMap list={list} />
          <div className="ee-map-cap">
            <Kicker>ATL · {zip}</Kicker>
            <span className="ee-mono ee-tiny">{list.length} sources · &lt;3.5 mi</span>
          </div>
        </Card>
      </section>

      {/* Type filter */}
      <section className="ee-pad-x ee-cat-scroll-wrap" style={{ paddingTop: "var(--gap-2)" }}>
        <div className="ee-cat-scroll">
          {types.map((t) => (
            <button key={t} className={"ee-chip " + (filter === t ? "is-active" : "")} onClick={() => setFilter(t)}>
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* List */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)", paddingBottom: 120 }}>
        <div className="ee-source-list">
          {list.map((s, idx) => <SourceRow key={s.id} s={s} idx={idx + 1} />)}
        </div>
      </section>
    </div>
  );
}

function SourceMap({ list }) {
  return (
    <div className="ee-map">
      <svg viewBox="0 0 200 130" className="ee-map-svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="mp-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="var(--border)" strokeWidth="0.3"/>
          </pattern>
          <radialGradient id="mp-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="200" height="130" fill="url(#mp-grid)"/>
        {/* Stylized roads */}
        <path d="M 0 70 L 200 60" stroke="var(--border)" strokeWidth="2.5" strokeOpacity="0.6"/>
        <path d="M 0 70 L 200 60" stroke="var(--border)" strokeWidth="0.5"/>
        <path d="M 95 0 L 105 130" stroke="var(--border)" strokeWidth="2.5" strokeOpacity="0.6"/>
        <path d="M 0 35 L 200 45" stroke="var(--border)" strokeWidth="1.5" strokeOpacity="0.4"/>
        <path d="M 0 105 L 200 95" stroke="var(--border)" strokeWidth="1.5" strokeOpacity="0.4"/>
        <path d="M 45 0 L 55 130" stroke="var(--border)" strokeWidth="1.5" strokeOpacity="0.4"/>
        <path d="M 145 0 L 155 130" stroke="var(--border)" strokeWidth="1.5" strokeOpacity="0.4"/>

        {/* You marker (centered) */}
        <circle cx="100" cy="65" r="20" fill="url(#mp-glow)"/>
        <circle cx="100" cy="65" r="5" fill="var(--gold)"/>
        <circle cx="100" cy="65" r="2.5" fill="var(--bg)"/>

        {/* Source pins */}
        {list.map((s) => (
          <g key={s.id}>
            <circle cx={s.x * 2} cy={s.y * 1.3} r="6" fill="var(--primary)" opacity="0.15"/>
            <circle cx={s.x * 2} cy={s.y * 1.3} r="3" fill="var(--primary)"/>
          </g>
        ))}
      </svg>
      <div className="ee-map-you">
        <span className="ee-mono ee-tiny" style={{ color: "var(--gold)" }}>● YOU</span>
      </div>
    </div>
  );
}

function SourceRow({ s, idx }) {
  return (
    <Card className="ee-source-row">
      <div className="ee-source-top">
        <div className="ee-source-rank">
          <Kicker>{String(idx).padStart(2, "0")}</Kicker>
        </div>
        <div className="ee-source-meta">
          <div className="ee-source-name">{s.name}</div>
          <div className="ee-source-tags">
            <span>{s.type}</span>
            <span className="dot">·</span>
            <span className="ee-mono">{s.distance} mi</span>
            <span className="dot">·</span>
            <span className="ee-mono">{"$".repeat(s.price)}</span>
          </div>
        </div>
        <div className="ee-source-tr">
          <Kicker>TRANSP.</Kicker>
          <div className="ee-source-tr-num">{s.transparency}</div>
        </div>
      </div>
      <div className="ee-source-bar">
        <span style={{ width: `${s.transparency}%` }} />
      </div>
      <div className="ee-source-carries">
        <Kicker>CARRIES</Kicker>
        <div className="ee-source-carries-list">
          {s.carries.slice(0, 4).map((c) => (
            <span key={c} className="ee-tag">{c}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

Object.assign(window, { SourceScreen });
