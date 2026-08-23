#!/usr/bin/env python3
"""
Infinite Pinterest topic-swipe feed server.

Spins up a tiny HTTP server that:
- Serves index.html as a fullscreen landscape image-slider gallery.
- Runs N background workers continuously pulling Pinterest pins for the
  current topic into ./imgs/ via the bundled pinterest-mcp scraper.
- Auto-rotates through a topic queue; you can also POST a custom topic
  or skip the current one from the UI.

Endpoints:
  GET  /                    — index.html
  GET  /imgs/<file>         — pulled pins
  GET  /manifest.json       — { count, images[], topic, topic_idx, topics_total }
  POST /topic { topic:"X" } — insert + jump to topic
  POST /next                — advance to next topic in the queue

Env vars (all optional):
  PORT       (default 8765)
  PER_CYCLE  (default 25)   pins per worker pull
  INTERVAL   (default 8)    seconds between pulls per worker
  N_WORKERS  (default 3)    parallel pulling threads
  TOPIC_FILE (default ./topics.txt) one topic per line; falls back to baked seeds
  ROTATE_AT  (default 75)   pins per topic before auto-rotate
  PIN_MCP_PYTHON (default: detect) python with pinterest-dl + mcp installed
  PIN_MCP_DIR    (default: detect) dir containing pinterest-mcp/server.py
"""
import json, os, sys, threading, time, random, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT     = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR = os.path.join(ROOT, 'imgs')
os.makedirs(IMGS_DIR, exist_ok=True)

PORT      = int(os.environ.get('PORT', 8765))
PER_CYCLE = int(os.environ.get('PER_CYCLE', 25))
INTERVAL  = int(os.environ.get('INTERVAL', 8))
N_WORKERS = int(os.environ.get('N_WORKERS', 3))
ROTATE_AT = int(os.environ.get('ROTATE_AT', 75))
TOPIC_FILE = os.environ.get('TOPIC_FILE', os.path.join(ROOT, 'topics.txt'))

# Locate pinterest-mcp scraper (override via env if needed)
PIN_MCP_DIR = os.environ.get('PIN_MCP_DIR') or os.path.expanduser('~/exedus/xen/mcp-servers/pinterest-mcp')
sys.path.insert(0, PIN_MCP_DIR)
os.chdir(PIN_MCP_DIR)
from server import pinterest_download   # type: ignore
os.chdir(ROOT)

DEFAULT_TOPICS = [
  "minimalist living room aesthetic",
  "scandinavian bedroom inspiration",
  "japandi interior design",
  "dark academia office",
  "art deco bathroom",
  "mid century modern dining room",
  "outdoor patio garden ideas",
  "library home office bookshelves",
  "luxury walk in closet design",
  "moody primary bedroom",
  "boho coastal kitchen",
  "moroccan tile shower",
  "industrial loft apartment",
  "cottagecore garden",
  "tropical brutalism architecture",
  "warm minimalist living room",
  "vintage french country kitchen",
  "modern farmhouse exterior",
]

def load_topics():
  if os.path.exists(TOPIC_FILE):
    with open(TOPIC_FILE) as f:
      lines = [ln.strip() for ln in f if ln.strip() and not ln.strip().startswith('#')]
    if lines: return lines
  return DEFAULT_TOPICS[:]

state_lock = threading.Lock()
state = { 'topic_idx': 0, 'topics': load_topics(), 'pulled': 0 }
random.shuffle(state['topics'])

def current_topic():
  with state_lock:
    if not state['topics']: return None
    return state['topics'][state['topic_idx'] % len(state['topics'])]

def advance_topic():
  with state_lock:
    state['topic_idx'] += 1
    state['pulled'] = 0
  print(f"[topic→] {current_topic()}")

def set_topic(new_topic):
  with state_lock:
    state['topics'].insert(state['topic_idx']+1, new_topic)
    state['topic_idx'] += 1
    state['pulled'] = 0
  print(f"[topic=] {new_topic}")

def worker(wid):
  while True:
    t = current_topic()
    if not t:
      time.sleep(2); continue
    try:
      pinterest_download(t, output_dir=IMGS_DIR, limit=PER_CYCLE,
                         min_width=900, min_height=600)
      with state_lock:
        state['pulled'] += PER_CYCLE
      print(f"[w{wid}] +{PER_CYCLE} '{t}' (cum={state['pulled']})")
      with state_lock:
        if state['pulled'] >= ROTATE_AT:
          state['topic_idx'] += 1
          state['pulled'] = 0
    except Exception as e:
      print(f"[w{wid}] err: {e}")
    time.sleep(INTERVAL)

def manifest():
  files = sorted(f for f in os.listdir(IMGS_DIR)
                 if f.lower().endswith(('.jpg','.jpeg','.png','.webp')))
  return {
    'count': len(files),
    'images': [f'imgs/{f}' for f in files],
    'topic': current_topic(),
    'topic_idx': state['topic_idx'],
    'topics_total': len(state['topics']),
  }

class H(SimpleHTTPRequestHandler):
  def log_message(self, fmt, *args): pass
  def do_GET(self):
    if self.path.startswith('/manifest.json'):
      body = json.dumps(manifest()).encode()
      self.send_response(200)
      self.send_header('Content-Type','application/json')
      self.send_header('Cache-Control','no-store')
      self.end_headers(); self.wfile.write(body); return
    return super().do_GET()
  def do_POST(self):
    ln = int(self.headers.get('Content-Length','0'))
    raw = self.rfile.read(ln) if ln else b''
    try: data = json.loads(raw.decode() or '{}')
    except: data = {}
    if self.path == '/topic':
      t = (data.get('topic') or '').strip()
      if t: set_topic(t); return self._json({'ok':True,'topic':t})
      return self._json({'ok':False,'err':'no topic'})
    if self.path == '/next':
      advance_topic(); return self._json({'ok':True,'topic':current_topic()})
    self.send_response(404); self.end_headers()
  def _json(self, obj):
    body = json.dumps(obj).encode()
    self.send_response(200)
    self.send_header('Content-Type','application/json')
    self.end_headers(); self.wfile.write(body)

if __name__ == '__main__':
  os.chdir(ROOT)
  for i in range(N_WORKERS):
    threading.Thread(target=worker, args=(i,), daemon=True).start()
  srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
  print(f"[srv] http://127.0.0.1:{PORT}/  topic='{current_topic()}'  "
        f"workers={N_WORKERS} batch={PER_CYCLE} every={INTERVAL}s")
  srv.serve_forever()
