#!/bin/bash
# Regenerate /shang/index.html from every <slug>/manifest.json present.
# Called by xen-shang-tsung after each absorb. Idempotent.
# Manifests marked {"test": true} are excluded from the gallery (self-test stubs).
set -euo pipefail
DIR="/Users/qi/Desktop/hitthe.link/shang"
cd "$DIR"

cards=""
count=0
kinds=""
while IFS= read -r -d '' M; do
  is_test=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('1' if d.get('test') else '0')" "$M" 2>/dev/null || echo "0")
  [ "$is_test" = "1" ] && continue
  slug=$(basename "$(dirname "$M")")
  source_url=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('source_url',''))" "$M" 2>/dev/null || echo "")
  fetched=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print((d.get('fetched_at','') or '')[:10])" "$M" 2>/dev/null || echo "")
  assets=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('asset_count',0))" "$M" 2>/dev/null || echo "0")
  engine=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('engine',''))" "$M" 2>/dev/null || echo "")
  kind=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('kind','source'))" "$M" 2>/dev/null || echo "source")
  note=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('note',''))" "$M" 2>/dev/null || echo "")
  host=$(python3 -c "import json,sys;from urllib.parse import urlparse; print(urlparse(json.load(open(sys.argv[1])).get('source_url','')).netloc)" "$M" 2>/dev/null || echo "")
  kinds+="$kind"$'\n'
  cards+=$'\n'"<a class=\"card\" data-kind=\"${kind}\" href=\"./${slug}/\"><div class=\"top\"><span class=\"slug\">${slug}</span><span class=\"badge k-${kind}\">${kind}</span></div><div class=\"host\">${host}</div><div class=\"note\">${note}</div><div class=\"meta\"><span>${fetched}</span><span>·</span><span>${assets} files</span><span>·</span><span>${engine}</span></div></a>"
  count=$((count+1))
done < <(find . -mindepth 2 -maxdepth 2 -name manifest.json -print0 | sort -z)

# distinct kind list for the filter bar
kindlist=$(printf "%s" "$kinds" | sed '/^$/d' | sort -u | tr '\n' ' ')
filters='<button class="f active" data-f="all">all</button>'
for k in $kindlist; do
  filters+="<button class=\"f\" data-f=\"${k}\">${k}</button>"
done

cat > "$DIR/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shang Tsung PGS · Absorbed Sources</title>
<meta name="description" content="The absorb daemon: clone + study external sites, strip trackers, host live for repurposing. The double-BPGS soul-steal pattern.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E👁️%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Cormorant+Garamond:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#0a0a0e;--red:#cc1f2c;--gold:#d4af37;--paper:#fbf9f4;--ash:#6b6b6b;--line:rgba(255,255,255,.08)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:radial-gradient(1200px 700px at 50% -10%,#241018 0%,#0a0a0e 60%);color:var(--paper);font-family:"Cormorant Garamond",Georgia,serif;min-height:100vh;padding:40px 20px}
  a{color:inherit}
  header{max-width:980px;margin:0 auto 28px;text-align:center}
  .crest{font-size:52px;margin-bottom:6px;filter:drop-shadow(0 0 18px rgba(204,31,44,.55))}
  h1{font-family:"Cinzel",Georgia,serif;font-size:clamp(28px,5vw,44px);letter-spacing:.12em;background:linear-gradient(90deg,var(--red),var(--gold) 60%,var(--paper));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:10px}
  .sub{color:#b8b0a4;font-style:italic;font-size:16px;max-width:640px;margin:0 auto;line-height:1.55}
  .count{margin-top:14px;font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--gold);letter-spacing:.22em;text-transform:uppercase}
  /* explainer */
  .what{max-width:980px;margin:0 auto 26px;background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
  .what h2{font-family:"Cinzel",serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
  .what p{font-size:16px;line-height:1.6;color:#cfc8bc;margin-bottom:10px}
  .what p:last-child{margin-bottom:0}
  .what b{color:var(--paper)}
  .what code{font-family:"JetBrains Mono",monospace;font-size:12px;background:rgba(255,255,255,.06);padding:2px 7px;border-radius:5px;color:var(--gold)}
  .pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
  .pillar{border-left:2px solid var(--red);padding:4px 0 4px 14px}
  .pillar .pt{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
  .pillar .pd{font-size:14.5px;line-height:1.5;color:#bdb6aa}
  /* filter bar */
  .bar{max-width:980px;margin:0 auto 18px;display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
  .f{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.04);border:1px solid var(--line);color:#cfc8bc;padding:6px 14px;border-radius:999px;cursor:pointer;transition:all .18s}
  .f:hover{border-color:var(--gold);color:var(--paper)}
  .f.active{background:linear-gradient(90deg,var(--red),var(--gold));color:#1a0a0e;border-color:transparent;font-weight:500}
  /* gallery — auto-fill keeps the last row left-packed; no orphan-center hack needed */
  main{max-width:980px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
  .card{display:flex;flex-direction:column;padding:18px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--paper);transition:all .2s;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),var(--gold))}
  .card:hover{background:rgba(212,175,55,.08);border-color:var(--gold);transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,.4)}
  .card.hide{display:none}
  .top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .slug{font-family:"Cinzel",serif;font-size:15px;letter-spacing:.04em;color:var(--gold);font-weight:700}
  .badge{font-family:"JetBrains Mono",monospace;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;padding:3px 7px;border-radius:999px;border:1px solid var(--line);color:#cfc8bc;white-space:nowrap}
  .k-interactive{color:#7fd1ff;border-color:rgba(127,209,255,.4)}
  .k-editorial{color:#e7b6ff;border-color:rgba(231,182,255,.4)}
  .k-calculator{color:#9ff0c4;border-color:rgba(159,240,196,.4)}
  .k-staging{color:#ffd28a;border-color:rgba(255,210,138,.4)}
  .k-doc{color:#c9c2b6;border-color:rgba(201,194,182,.4)}
  .k-video{color:#ff9aa2;border-color:rgba(255,154,162,.4)}
  .host{font-family:"JetBrains Mono",monospace;font-size:11px;color:#9a9488;margin-bottom:10px;word-break:break-all}
  .note{font-size:15px;line-height:1.5;color:#cfc8bc;flex:1;margin-bottom:12px}
  .meta{font-family:"JetBrains Mono",monospace;font-size:9px;color:var(--ash);letter-spacing:.1em;text-transform:uppercase;display:flex;flex-wrap:wrap;gap:6px}
  .empty{grid-column:1/-1;text-align:center;padding:60px 20px;color:#666;font-style:italic}
  footer{max-width:980px;margin:48px auto 0;text-align:center;color:#666;font-size:12px;border-top:1px solid var(--line);padding-top:22px;line-height:1.7}
  footer code{background:rgba(255,255,255,.05);padding:2px 8px;border-radius:4px;color:var(--gold);font-size:11px}
  footer em{display:block;font-style:italic;margin-top:10px;color:#555}
</style>
</head>
<body>
<header>
  <div class="crest">👁️</div>
  <h1>SHANG TSUNG PGS</h1>
  <p class="sub">Soul-stealer of source code. External sites cloned, studied, tracker-stripped, and hosted live for repurposing.</p>
  <div class="count">${count} ABSORBED · "YOUR SOUL IS MINE"</div>
</header>

<section class="what">
  <h2>What Shang Tsung is</h2>
  <p><b>Absorb</b> = clone + study an external site. The daemon pulls the page and its assets, strips trackers (analytics, pixels, session replay), preserves original attribution, and re-hosts it live under <code>/shang/&lt;slug&gt;/</code> so the technique can be dissected and repurposed — motion, layout, funnel, compute.</p>
  <p>The name is the pattern: in Mortal Kombat, <b>Shang Tsung absorbs souls</b> to wield their powers. Here the "soul" is the source. The deeper move is the <b>double-BPGS</b> — two parallel goal-swarms (<b>Shang</b> + <b>Tsung</b>) run against the same target, then their outputs are <b>absorbed</b> into one: dedupe, best-of, merge. Two souls in, one brain out — never two competing minds.</p>
  <div class="pillars">
    <div class="pillar"><div class="pt">1 · Clone</div><div class="pd">Pull HTML + assets via wget/chromium. Mirror the live surface.</div></div>
    <div class="pillar"><div class="pt">2 · Strip</div><div class="pd">Remove trackers. Keep attribution. Write a manifest.</div></div>
    <div class="pillar"><div class="pt">3 · Study</div><div class="pd">Dissect the technique. Two swarms, two lenses.</div></div>
    <div class="pillar"><div class="pt">4 · Absorb</div><div class="pd">Merge the two swarm outputs into one repurposable result.</div></div>
  </div>
</section>

<div class="bar">
  ${filters}
</div>

<main>
HTML

if [ "$count" -eq 0 ]; then
  echo '<div class="empty">No souls absorbed yet. Run <code>xen-shang-tsung &lt;url&gt;</code> to begin.</div>' >> "$DIR/index.html"
else
  echo "$cards" >> "$DIR/index.html"
fi

cat >> "$DIR/index.html" <<'HTML'
</main>
<footer>
  Invoke · <code>xen-shang-tsung &lt;url&gt; [slug] [--js]</code><br>
  Goal · <code>TXB-1</code> · canon 2026-05-22 · /goal Shang Tsung PGS<br>
  <em>Trackers stripped on absorb · attribution preserved via footer banner + manifest.json · rollback via git revert</em>
</footer>
<script>
  var bar=document.querySelector('.bar'),cards=[].slice.call(document.querySelectorAll('.card'));
  bar&&bar.addEventListener('click',function(e){
    var b=e.target.closest('.f'); if(!b) return;
    document.querySelectorAll('.f').forEach(function(x){x.classList.remove('active')});
    b.classList.add('active');
    var f=b.dataset.f;
    cards.forEach(function(c){c.classList.toggle('hide', f!=='all' && c.dataset.kind!==f)});
  });
</script>
</body>
</html>
HTML

echo "[shang-tsung] index rebuilt: $count source(s)"
