#!/usr/bin/env python3
"""XEN RSS builder. Sources:
  (1) xen/live.json by_capability[].recent[]  -> XEN's own event firehose
  (2) rss/sources.json feeds[]                 -> any external RSS/Atom feed (server-side fetch, no CORS)
Outputs: rss/feed.json (merged), rss/feed.xml (RSS 2.0 aggregate), rss/external.json (external only).
Injects NEW items into omnimind /api/omni/event (no-auth) -> /events SSE -> XOS notification center.
Run via launchd com.xen.rss-builder (StartInterval)."""
import json, os, html, datetime, urllib.request, email.utils
import xml.etree.ElementTree as ET
ROOT="/Volumes/M4/sync_/exedus/dev_/xen/.deploy/hitthe.link"
LIVE=os.path.join(ROOT,"xen/live.json")
SRC=os.path.join(ROOT,"rss/sources.json")
OUTX=os.path.join(ROOT,"rss/feed.xml")
OUTJ=os.path.join(ROOT,"rss/feed.json")
OUTE=os.path.join(ROOT,"rss/external.json")
SEEN=os.path.join(ROOT,"rss/.seen.json")
SITE="https://hitthe.link"
OMNI=os.environ.get("OMNI_EVENT_URL","http://127.0.0.1:4441/api/omni/event")
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def iso(dt):
    try: return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception: return ""
def parse_ts(s):
    s=(s or "").strip()
    if not s: return iso(datetime.datetime.now(datetime.timezone.utc))
    try: return iso(email.utils.parsedate_to_datetime(s))      # RFC822 (RSS pubDate)
    except Exception: pass
    try: return iso(datetime.datetime.fromisoformat(s.replace("Z","+00:00")))  # ISO (Atom)
    except Exception: return iso(datetime.datetime.now(datetime.timezone.utc))
def strip_html(s):
    import re
    return re.sub(r"<[^>]+>","",s or "").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">").replace("&#39;","'").replace("&quot;",'"').strip()
def rfc822(ts):
    try: return datetime.datetime.fromisoformat(ts.replace("Z","+00:00")).strftime("%a, %d %b %Y %H:%M:%S +0000")
    except Exception: return datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")

def flatten_live(d):
    items=[]
    for cap in d.get("by_capability",[]):
        for r in cap.get("recent",[]):
            items.append({"ts":r.get("ts",""),"text":r.get("text","") or "","cat":cap.get("tag","event"),
                          "catName":cap.get("name",cap.get("tag","Event")),"persona":r.get("persona","XEN"),"proof":r.get("proof"),"ext":False})
    return items

def fetch_external():
    out=[]
    if not os.path.exists(SRC): return out
    try: feeds=json.load(open(SRC,encoding="utf-8")).get("feeds",[])
    except Exception: return out
    for f in feeds:
        url=f.get("url"); name=f.get("name") or url; cat=f.get("category") or "feed"
        if not url: continue
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*"})
            data=urllib.request.urlopen(req,timeout=12).read()
            root=ET.fromstring(data)
        except Exception as e:
            print("  feed FAIL %s: %s"%(name,str(e)[:60])); continue
        n=0
        for it in root.iter():
            tag=it.tag.split('}')[-1]
            if tag=="item":  # RSS 2.0
                title=it.findtext("title") or ""; link=it.findtext("link") or ""
                desc=it.findtext("description") or ""; pub=it.findtext("pubDate") or ""
            elif tag=="entry":  # Atom
                A="{http://www.w3.org/2005/Atom}"
                title=it.findtext(A+"title") or ""
                le=it.find(A+"link"); link=(le.get("href") if le is not None else "") or ""
                desc=it.findtext(A+"summary") or it.findtext(A+"content") or ""
                pub=it.findtext(A+"updated") or it.findtext(A+"published") or ""
            else: continue
            title=strip_html(title)
            if not title: continue
            out.append({"ts":parse_ts(pub),"text":title,"cat":cat,"catName":name,"persona":name,"proof":(link or None),"ext":True})
            n+=1
            if n>=20: break
    out.sort(key=lambda x:x["ts"],reverse=True)
    return out

d=json.load(open(LIVE,encoding="utf-8"))
xen=flatten_live(d)
ext=fetch_external()
allitems=sorted(xen+ext,key=lambda x:x["ts"],reverse=True)
updated=iso(datetime.datetime.now(datetime.timezone.utc))

json.dump({"title":"XEN — Notification Center","home":SITE+"/rss/","updated":updated,"count":len(allitems),"items":allitems[:400]},open(OUTJ,"w",encoding="utf-8"))
json.dump({"updated":updated,"count":len(ext),"items":ext[:200]},open(OUTE,"w",encoding="utf-8"))

def cd(s): return "<![CDATA["+(s or "")+"]]>"
parts=['<?xml version="1.0" encoding="UTF-8"?>','<rss version="2.0"><channel>',
 '<title>XEN · Notification Center</title>','<link>%s/rss/</link>'%SITE,
 '<description>XEN firehose + subscribed feeds.</description>',
 '<lastBuildDate>%s</lastBuildDate>'%rfc822(updated),'<generator>xen-rss</generator>']
for i in allitems[:200]:
    guid=html.escape((i["ts"]+"|"+i["text"])[:120])
    parts.append("<item><title>%s</title><description>%s</description><category>%s</category><pubDate>%s</pubDate><guid isPermaLink=\"false\">%s</guid><link>%s</link></item>"%(
        cd(i["catName"]+": "+i["text"][:90]), cd(i["text"]), html.escape(i["catName"]), rfc822(i["ts"]), guid, html.escape(i.get("proof") or (SITE+"/rss/"))))
parts.append("</channel></rss>")
open(OUTX,"w",encoding="utf-8").write("\n".join(parts))

# inject NEW items -> omni -> SSE -> XOS
seen=set()
if os.path.exists(SEEN):
    try: seen=set(json.load(open(SEEN)))
    except: pass
key=lambda i:(i["ts"]+i["text"])[:80]
new=[i for i in allitems if key(i) not in seen]
sent=0
for i in reversed(new[:40]):
    payload={"event":"omni:rss","source":"rss","src":"rss","kind":"rss","from":"XEN RSS","sender":i["catName"],"name":i["catName"],
             "text":i["text"],"body":i["text"],"preview":("["+i["catName"]+"] "+i["text"])[:140],"category":i["cat"],"persona":i["persona"],"ts":i["ts"],"url":i.get("proof")}
    try:
        urllib.request.urlopen(urllib.request.Request(OMNI,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"},method="POST"),timeout=4); sent+=1
    except Exception: pass
for i in allitems: seen.add(key(i))
json.dump(sorted(list(seen))[-3000:],open(SEEN,"w"))
print("xen:%d ext:%d total:%d | injected->omni:%d/%d"%(len(xen),len(ext),len(allitems),sent,len(new)))
