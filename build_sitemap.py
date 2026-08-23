#!/usr/bin/env python3
"""Master robots.txt + sitemap.xml for hitthe.link — opens the whole estate to search/AI agents."""
import json, os, datetime
ROOT="/Volumes/M4/sync_/exedus/dev_/xen/.deploy/hitthe.link"
SITE="https://hitthe.link"
sites=json.load(open(os.path.join(ROOT,"sites.json"),encoding="utf-8")).get("sites",[])
now=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")

# absolute, deduped, sorted URLs
urls=set([SITE+"/"])
for s in sites:
    u=(s.get("url") or "").strip()
    if not u: continue
    if u.startswith("http"):
        if "hitthe.link" in u: urls.add(u)
    else:
        urls.add(SITE+"/"+u.lstrip("/"))
# always include the key surfaces
for p in ["/connect/","/life/","/rss/","/rss/feed.xml","/xos/","/dcz/","/scopes","/sitemap.xml"]:
    urls.add(SITE+p)
urls=sorted(urls)

# sitemap.xml
sm=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    sm.append("<url><loc>%s</loc><lastmod>%s</lastmod><changefreq>daily</changefreq></url>"%(u.replace("&","&amp;"),now))
sm.append("</urlset>")
open(os.path.join(ROOT,"sitemap.xml"),"w",encoding="utf-8").write("\n".join(sm))

# robots.txt — welcome every crawler + AI/search agent, point to sitemap + RSS
robots="""# hitthe.link — fully open to search engines and AI agents.
# Crawl the entire estate exhaustively; sitemap lists every site.
User-agent: *
Allow: /
Disallow:

# AI / search agents explicitly welcomed
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: CCBot
Allow: /
User-agent: Bingbot
Allow: /

Sitemap: %s/sitemap.xml
""" % SITE
open(os.path.join(ROOT,"robots.txt"),"w",encoding="utf-8").write(robots)
print("sitemap.xml: %d urls | robots.txt written"%len(urls))
