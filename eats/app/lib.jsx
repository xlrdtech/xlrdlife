// lib.jsx — shared atoms and tiny helpers for Electric EATS

// ─── icons (inline SVG — no external deps) ─────────────────────────
const Icon = {
  scan: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/>
      <path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/>
      <path d="M4 12h16"/>
    </svg>
  ),
  swap: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 4l3 3-3 3"/><path d="M20 7H8"/>
      <path d="M7 20l-3-3 3-3"/><path d="M4 17h12"/>
    </svg>
  ),
  pin: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  ),
  stats: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>
    </svg>
  ),
  arrow: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
    </svg>
  ),
  plus: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  close: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 6l12 12M6 18L18 6"/>
    </svg>
  ),
  check: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 13l4 4L19 7"/>
    </svg>
  ),
  search: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
    </svg>
  ),
  sparkle: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3l1.8 4.5L18 9.3l-4.2 1.8L12 15.6l-1.8-4.5L6 9.3l4.2-1.8L12 3z"/>
      <path d="M19 16l.9 1.6L21.5 18l-1.6.9L19 21l-.9-2.1L16.5 18l1.6-.4z"/>
    </svg>
  ),
  bolt: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" {...p}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor"/>
    </svg>
  ),
  alert: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
    </svg>
  ),
  copy: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 12} height={p.size || 12} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  filter: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18M6 12h12M10 19h4"/>
    </svg>
  ),
  upArrow: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 17l10-10M9 7h8v8"/>
    </svg>
  ),
  downArrow: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 7l10 10M17 9v8H9"/>
    </svg>
  ),
  cart: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/>
      <path d="M2 3h2.5l2.5 13h12l2.5-9H6"/>
    </svg>
  ),
  flame: (p = {}) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none"
         stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}>
      <path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 1 5 4 5 8a8 8 0 1 1-16 0c0-4 4-6 4-9 0-2 2-3 4-3z" fill="currentColor"/>
    </svg>
  ),
};

// ─── flag dot ─────────────────────────────────────────────────
function FlagDot({ flag, size = 9 }) {
  const color = flag === "red" ? "var(--flag-red)" : flag === "yellow" ? "var(--flag-yellow)" : "var(--flag-green)";
  return <span className="ee-dot" style={{ background: color, width: size, height: size }} />;
}

// ─── label/eyebrow kicker ─────────────────────────────────────
function Kicker({ children, gold = false, style }) {
  return (
    <span className="ee-kicker" style={{ ...(gold ? { color: "var(--gold)" } : null), ...style }}>
      {children}
    </span>
  );
}

// ─── score badge (number + delta) ─────────────────────────────
function ScoreBadge({ score, size = "lg" }) {
  // Color band: red <50, amber 50-69, green 70+
  const tone = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";
  const color =
    tone === "green" ? "var(--flag-green)" :
    tone === "yellow" ? "var(--flag-yellow)" : "var(--flag-red)";
  const fs = size === "xl" ? 84 : size === "lg" ? 56 : size === "md" ? 36 : 22;
  return (
    <span className="ee-score" style={{ color, fontSize: fs }}>
      {score}
      <span className="ee-score-sub">/100</span>
    </span>
  );
}

// ─── radial score ring (for hero) ─────────────────────────────
function ScoreRing({ score, size = 160, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const tone = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";
  const color =
    tone === "green" ? "var(--primary)" :
    tone === "yellow" ? "var(--flag-yellow)" : "var(--flag-red)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke="var(--track)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke={color} strokeWidth={stroke}
              strokeDasharray={c} strokeDashoffset={off}
              strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`}
              style={{ transition: "stroke-dashoffset .8s cubic-bezier(.3,.7,.2,1)" }} />
    </svg>
  );
}

// ─── sparkline ─────────────────────────────────────────────────
function Sparkline({ data, height = 56, area = true, animate = true }) {
  const w = 320, h = height, p = 4;
  const min = Math.min(...data) - 5, max = Math.max(...data) + 5;
  const range = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = p + (i * (w - p * 2)) / (data.length - 1);
    const y = h - p - ((v - min) / range) * (h - p * 2);
    return [x, y];
  });
  const path = "M " + pts.map((q) => q.join(",")).join(" L ");
  const areaPath = `${path} L ${w - p},${h - p} L ${p},${h - p} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ee-spark" preserveAspectRatio="none"
         style={{ width: "100%", height }}>
      <defs>
        <linearGradient id="sl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill="url(#sl)" />}
      <path d={path} fill="none" stroke="var(--primary-glow)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={animate ? { strokeDasharray: 800, strokeDashoffset: 0, animation: "ee-draw 1.4s ease-out" } : null} />
      {pts.slice(-1).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6" fill="var(--primary)" opacity="0.15" />
          <circle cx={x} cy={y} r="3" fill="var(--primary)" />
        </g>
      ))}
    </svg>
  );
}

// ─── pill / chip / hairline divider ────────────────────────────
function Pill({ children, tone = "default", icon, onClick, active }) {
  const cls = "ee-pill ee-pill-" + tone + (active ? " is-active" : "");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={!onClick && !active}>
      {icon ? <span className="ee-pill-icon">{icon}</span> : null}
      {children}
    </button>
  );
}

function Hairline({ gold }) {
  return <div className={"ee-hairline " + (gold ? "gold" : "")} />;
}

// ─── card shell ────────────────────────────────────────────────
function Card({ children, pad = 16, style, className = "", onClick, gold = false }) {
  return (
    <div className={"ee-card " + className + (gold ? " ee-card-gold" : "")}
         style={{ padding: pad, ...style }} onClick={onClick}>
      {children}
    </div>
  );
}

// ─── number with delta arrow ───────────────────────────────────
function Delta({ value }) {
  const up = value >= 0;
  return (
    <span className={"ee-delta " + (up ? "up" : "down")}>
      {up ? <Icon.upArrow size={11} /> : <Icon.downArrow size={11} />}
      {up ? "+" : ""}{value}
    </span>
  );
}

Object.assign(window, {
  Icon, FlagDot, Kicker, ScoreBadge, ScoreRing, Sparkline, Pill, Hairline, Card, Delta,
});
