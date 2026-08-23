// screen-stats.jsx — Dashboard

function StatsScreen({ gold, scans }) {
  const series = SCORE_HISTORY;
  const avg = Math.round(series.reduce((a, b) => a + b, 0) / series.length);
  const last7 = series.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const prev7 = series.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const delta = Math.round(last7 - prev7);
  const up = delta >= 0;

  const [grocery, setGrocery] = React.useState([]);
  const [copied, setCopied] = React.useState(false);
  const addAll = (items) => setGrocery((g) => [...new Set([...g, ...items])]);
  const removeItem = (item) => setGrocery((g) => g.filter((x) => x !== item));
  const copy = async () => {
    try { await navigator.clipboard.writeText(grocery.map((g) => `• ${g}`).join("\n")); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ee-screen ee-stats">
      {/* HEADER */}
      <header className="ee-app-hd">
        <div className="ee-mark">
          <span className="ee-mark-glyph"><Icon.stats size={14} /></span>
          <span>
            <div className="ee-mark-name">Stats</div>
            <div className="ee-mark-sub">{scans} scans · 14d window</div>
          </span>
        </div>
        <button className="ee-icon-btn" aria-label="Export stats" title="Copy 14-day stats summary"
          onClick={() => {
            try {
              const stored = JSON.parse(localStorage.getItem("ee.scans") || "[]");
              const avg = stored.length ? Math.round(stored.reduce((a, s) => a + (s.score || 0), 0) / stored.length) : 0;
              const summary = `Electric EATS - 14-day stats\nScans: ${stored.length}\nAvg clean score: ${avg}/100\nLast scan: ${stored[0]?.name || "n/a"} (${stored[0]?.score || 0})\nhitthe.link/e`;
              navigator.clipboard.writeText(summary);
              alert("Stats summary copied to clipboard.");
            } catch (e) { alert("Could not copy stats."); }
          }}><Icon.filter size={14} /></button>
      </header>

      {/* HERO */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)" }}>
        <Kicker>Avg clean score · 14 days</Kicker>
        <div className="ee-stats-hero">
          <div className="ee-stats-num"><ScoreBadge score={avg} size="xl" /></div>
          <div className="ee-stats-delta">
            <Delta value={delta} />
            <span className="ee-muted ee-tiny">vs prior 7d</span>
          </div>
        </div>
      </section>

      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-2)" }}>
        <Card gold={gold} className="ee-stats-spark-card">
          <div className="ee-stats-spark-hd">
            <Kicker>Trend</Kicker>
            <div className="ee-stats-spark-legend">
              <span className="ee-mono ee-tiny ee-muted">MON 5/2</span>
              <span className="ee-mono ee-tiny ee-muted">TODAY</span>
            </div>
          </div>
          <Sparkline data={series} height={84} />
          <div className="ee-stats-spark-bar">
            {series.map((v, i) => (
              <span key={i} style={{
                height: 22 * (v / 100),
                background: v >= 70 ? "var(--primary)" : v >= 50 ? "var(--flag-yellow)" : "var(--flag-red)",
                opacity: 0.85
              }} />
            ))}
          </div>
        </Card>
      </section>

      {/* NUTRIENTS */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <div className="ee-sec-hd">
          <div><Kicker>From your labs</Kicker><h3 className="ee-h3">Nutrient panel</h3></div>
          <Kicker>Updated 5/12</Kicker>
        </div>
        <div className="ee-nutrient-grid">
          {NUTRIENTS.map((n) => <NutrientChip key={n.name} n={n} />)}
        </div>
      </section>

      {/* MEAL PLAN */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)" }}>
        <div className="ee-sec-hd">
          <div><Kicker gold>Best EATS</Kicker><h3 className="ee-h3">Today's plan</h3></div>
          <Kicker>${MEAL_PLANS.reduce((a, b) => a + b.cost, 0).toFixed(2)} total</Kicker>
        </div>
        <div className="ee-meals">
          {MEAL_PLANS.map((m) => <MealCard key={m.slot} m={m} onAdd={() => addAll(m.ingredients)} added={m.ingredients.every((i) => grocery.includes(i))} />)}
        </div>
      </section>

      {/* GROCERY */}
      <section className="ee-pad-x" style={{ paddingTop: "var(--gap-3)", paddingBottom: 120 }}>
        <div className="ee-sec-hd">
          <div><Kicker>Grocery</Kicker><h3 className="ee-h3">Shopping list</h3></div>
          {grocery.length > 0 && (
            <button className="ee-link" onClick={copy}>
              {copied ? <><Icon.check size={11} /> Copied</> : <><Icon.copy size={11} /> Copy</>}
            </button>
          )}
        </div>
        <Card>
          {grocery.length === 0 ? (
            <div className="ee-empty">
              <Icon.cart size={18} />
              <div>Add ingredients from a meal above to build your list.</div>
            </div>
          ) : (
            <ul className="ee-grocery">
              {grocery.map((g, i) => (
                <li key={g}>
                  <button className="ee-check" aria-label="Remove" onClick={() => removeItem(g)}><Icon.check size={11} /></button>
                  <span>{g}</span>
                  <span className="ee-mono ee-tiny ee-muted">{i % 3 === 0 ? "produce" : i % 3 === 1 ? "bulk" : "pantry"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function NutrientChip({ n }) {
  const ratio = parseFloat(n.value) / parseFloat(n.target);
  const tone = n.status === "good" ? "good" : n.status === "low" ? "low" : "high";
  return (
    <div className={"ee-nut tone-" + tone}>
      <div className="ee-nut-hd">
        <span className="ee-nut-name">{n.name}</span>
        <span className="ee-nut-stat">{n.status}</span>
      </div>
      <div className="ee-nut-vals">
        <span className="ee-mono">{n.value}</span>
        <span className="ee-tiny ee-muted">/ {n.target}</span>
      </div>
      <div className="ee-nut-bar">
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        <i style={{ left: "100%" }} />
      </div>
    </div>
  );
}

function MealCard({ m, onAdd, added }) {
  return (
    <Card className="ee-meal" pad={14}>
      <div className="ee-meal-hd">
        <div>
          <Kicker>{m.slot} · {m.time}</Kicker>
          <div className="ee-meal-name">{m.name}</div>
        </div>
        <div className="ee-meal-cost">
          <Kicker>COST</Kicker>
          <div className="ee-meal-cost-num">${m.cost.toFixed(2)}</div>
        </div>
      </div>
      <div className="ee-meal-tags">
        {m.nutrients.map((n) => <span key={n} className="ee-tag ee-tag-primary">{n}</span>)}
      </div>
      <div className="ee-meal-ings">
        <Kicker>INGREDIENTS</Kicker>
        <div className="ee-meal-ings-list">{m.ingredients.map((ing) => <span key={ing} className="ee-tag">{ing}</span>)}</div>
      </div>
      <button className={"ee-btn ee-btn-block " + (added ? "ee-btn-success" : "ee-btn-ghost")} style={{ marginTop: 10 }} onClick={onAdd}>
        {added ? <><Icon.check size={13} /> Added to grocery</> : <><Icon.plus size={13} /> Add to grocery</>}
      </button>
    </Card>
  );
}

Object.assign(window, { StatsScreen });
