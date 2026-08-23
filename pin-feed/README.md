# pin-feed — infinite Pinterest topic-swipe gallery

Reusable template for a fullscreen, landscape, autoplay-capable image
slider that **continuously pulls fresh Pinterest pins** for a rotating
topic queue. Drop in any topic list and it'll churn an endless feed.

## What it does

- Spins a tiny Python HTTP server on `:8765`
- Background workers continuously scrape Pinterest pins for the current
  topic into `./imgs/`
- Auto-rotates to the next topic in `topics.txt` after `ROTATE_AT` pulls
- Frontend polls `manifest.json` every 5s and seamlessly appends new
  slides + thumbnails — no full-page reload, your scroll position holds
- UI lets you type a custom topic or hit ⏭ to skip ahead

## Hotkeys

| Key | Action |
|---|---|
| `←` / `→` / Space | swipe |
| `A` | toggle autoplay (3.5s) |
| `F` | real fullscreen |
| `N` | skip to next topic |

Touch-swipe works on mobile.

## Quick start

Requires the [`pinterest-mcp`](https://github.com/mks044/pinterest-mcp)
scraper installed somewhere with `mcp` + `pinterest-dl` in its venv.

```bash
git clone https://github.com/mks044/pinterest-mcp ~/pinterest-mcp
cd ~/pinterest-mcp
python3.13 -m venv venv
venv/bin/pip install -r requirements.txt
```

Then:

```bash
cd pin-feed
PIN_MCP_DIR=~/pinterest-mcp \
  ~/pinterest-mcp/venv/bin/python feed_server.py
```

Open `http://127.0.0.1:8765/`.

## Configure

Edit `topics.txt` (one per line) or override anything via env:

| Env | Default | Meaning |
|---|---|---|
| `PORT` | 8765 | HTTP port |
| `PER_CYCLE` | 25 | pins per worker pull |
| `INTERVAL` | 8 | seconds between pulls per worker |
| `N_WORKERS` | 3 | parallel scraping threads |
| `ROTATE_AT` | 75 | pins per topic before auto-rotate |
| `TOPIC_FILE` | `./topics.txt` | seed topics |
| `PIN_MCP_DIR` | `~/exedus/xen/mcp-servers/pinterest-mcp` | scraper location |

Tune up to "tire out" Pinterest, tune down to be polite.

## API

| Method | Path | Body | Effect |
|---|---|---|---|
| GET | `/manifest.json` | — | `{ count, images[], topic, topic_idx, topics_total }` |
| POST | `/topic` | `{ "topic": "X" }` | insert + jump to topic |
| POST | `/next` | — | advance one topic |

## Files

```
pin-feed/
├── feed_server.py   # HTTP server + worker pool
├── index.html       # fullscreen slider + live polling
├── topics.txt       # seed topic queue
├── imgs/            # downloaded pins (gitignored)
└── README.md
```

## Notes

- Generated `imgs/` and `manifest.json` are gitignored — only the
  template ships in the repo.
- `file://` blocks fetch in WebKit; always serve over HTTP.
- The scraper has no Pinterest API key requirement (uses
  `pinterest-dl`). If/when Pinterest tightens scraping, swap in a
  v5-API-based fetcher behind the same `pinterest_download(...)`
  signature and nothing else needs to change.
