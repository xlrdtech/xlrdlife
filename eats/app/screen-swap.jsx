// screen-swap.jsx — Healthier swaps

function SwapScreen({ category, setCategory, gold }) {
  const swaps = SWAP_DB.filter((s) => s.category === category);
  const [expandedIdx, setExpandedIdx] = React.useState(0);

  return (
    <div className="ee-screen ee-swap">
      {/* HEADER */}
      <header className="ee-app-hd">
        <div className="ee-mark">
          <span className="ee-mark-glyph"><Icon.swap size={14} /></span>
          <span>
            <div className="ee-mark-name">Swaps</div>
            <div className="ee-mark-sub">Same craving · cleaner score</div>
          </span>
        </div>
        <button className="ee-icon-btn" aria-label="Filter categories" title="Browse all categories"
          onClick={() => document.querySelector(".ee-cat-scroll")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Icon.filter size={14} /></button>
      </header>

      {/* CATEGORY FILTER (scrollable) */}
      <section className="ee-pad-x ee-cat-scroll-wrap">
        <div className="ee-cat-scroll">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={"ee-chip " + (category === c ? "is-active" : "")}
              onClick={() => { setCategory(c); setExpandedIdx(0); }}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Title */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)" }}>
        <Kicker>{swaps.length} matches</Kicker>
        <h2 className="ee-h2">
          {category} that <span className="ee-grad-text">work harder</span>.
        </h2>
        <p className="ee-lede">AI-matched alternatives ranked by clean score, ingredient quality, and local availability.</p>
      </section>

      {/* SWAP CARDS */}
      <section className="ee-pad-x ee-swap-list" style={{ paddingTop: "var(--gap-3)", paddingBottom: 120 }}>
        {swaps.map((s, i) => (
          <SwapCard key={s.fromBrand + s.toBrand} s={s} expanded={expandedIdx === i} onToggle={() => setExpandedIdx(expandedIdx === i ? -1 : i)} gold={gold} />
        ))}
        {swaps.length === 0 && (
          <Card><div className="ee-muted" style={{ textAlign: "center", padding: 20 }}>No swaps for {category} yet. Try Snacks or Cereals.</div></Card>
        )}
      </section>
    </div>
  );
}

function SwapCard({ s, expanded, onToggle, gold }) {
  const delta = s.toScore - s.fromScore;
  const stores = SOURCES.filter((src) => s.carries.includes(src.id)).slice(0, 3);
  return (
    <Card pad={0} gold={gold && expanded} className={"ee-swap-card " + (expanded ? "is-open" : "")}>
      {/* Header row */}
      <button className="ee-swap-card-hd" onClick={onToggle}>
        <div className="ee-swap-row">
          <div className="ee-swap-side">
            <Kicker>{s.fromBrand}</Kicker>
            <div className="ee-swap-name">{s.fromName}</div>
            <div className="ee-swap-score from">
              <span className="ee-mono ee-tiny ee-muted">SCORE</span>
              <span className="ee-num-red">{s.fromScore}</span>
            </div>
          </div>
          <div className="ee-swap-arrow-vert">
            <span className="ee-swap-delta-pill">
              <Icon.upArrow size={9} /> +{delta}
            </span>
            <Icon.arrow size={16} />
          </div>
          <div className="ee-swap-side ee-swap-side-right">
            <Kicker gold>{s.toBrand}</Kicker>
            <div className="ee-swap-name">{s.toName}</div>
            <div className="ee-swap-score to">
              <span className="ee-mono ee-tiny ee-muted">SCORE</span>
              <span className="ee-num-green">{s.toScore}</span>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="ee-swap-card-bd">
          <Hairline gold={gold} />

          {/* Why */}
          <div className="ee-swap-why">
            <Kicker>Why it's better</Kicker>
            <ul>
              {s.reasons.map((r) => (
                <li key={r}>
                  <span className="ee-bullet"><Icon.check size={10} /></span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Nutrition compare */}
          <div className="ee-nutri-grid">
            <NutriCompare label="Sodium" from={s.nutrition.sodium[0]} to={s.nutrition.sodium[1]} unit="mg" />
            <NutriCompare label="Sugar"  from={s.nutrition.sugar[0]}  to={s.nutrition.sugar[1]}  unit="g" />
            <NutriCompare label="Fiber"  from={s.nutrition.fiber[0]}  to={s.nutrition.fiber[1]}  unit="g" higherBetter />
          </div>

          {/* Where */}
          <div className="ee-swap-where">
            <Kicker>Available near you</Kicker>
            <div className="ee-store-row">
              {stores.map((st) => (
                <div key={st.id} className="ee-store-pill">
                  <span className="ee-store-pill-name">{st.short}</span>
                  <span className="ee-mono ee-tiny ee-muted">{st.distance}mi</span>
                </div>
              ))}
            </div>
          </div>

          <button className="ee-btn ee-btn-primary ee-btn-block" style={{ marginTop: 14 }}
            onClick={() => {
              try {
                const list = JSON.parse(localStorage.getItem("ee.grocery") || "[]");
                if (!list.includes(swap.toName)) {
                  list.push(swap.toName);
                  localStorage.setItem("ee.grocery", JSON.stringify(list));
                }
                window.dispatchEvent(new CustomEvent("ee:grocery-added", { detail: swap.toName }));
                alert("Added " + swap.toName + " to grocery list.");
              } catch (e) {}
            }}>
            <Icon.cart size={14} /> Add to grocery
          </button>
        </div>
      )}
    </Card>
  );
}

function NutriCompare({ label, from, to, unit, higherBetter }) {
  const better = higherBetter ? to >= from : to <= from;
  const max = Math.max(from, to, 1);
  return (
    <div className="ee-nutri">
      <div className="ee-nutri-lbl">{label}</div>
      <div className="ee-nutri-from">
        <span className="ee-mono ee-tiny ee-muted">FROM</span>
        <span className="ee-mono">{from}{unit}</span>
      </div>
      <div className="ee-nutri-bar">
        <span style={{ width: `${(from / max) * 100}%` }} className="from" />
        <span style={{ width: `${(to / max) * 100}%` }} className={better ? "to good" : "to bad"} />
      </div>
      <div className="ee-nutri-to">
        <span className="ee-mono ee-tiny ee-muted">TO</span>
        <span className={"ee-mono " + (better ? "ee-num-green" : "ee-num-red")}>{to}{unit}</span>
      </div>
    </div>
  );
}

Object.assign(window, { SwapScreen });
