#!/usr/bin/env python3
"""Generate hitthe.link app store icons — PART 1 PNG + PART 2 SVG."""
from __future__ import annotations

import json
import os
import shutil
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

CAT_COLORS = {
    "Music & Studio": ("#9b3fe8", "#e8388a"),
    "Xen / Voice OS": ("#0fa86e", "#22d3a8"),
    "Business & L7S": ("#c8901a", "#e8c84a"),
    "Client Sites": ("#1a6ee8", "#38b2f8"),
    "Tools & Calculators": ("#e85a1a", "#f8a838"),
    "Builds & Apps": ("#3b5be8", "#7c8cff"),
}

SLUG_CATEGORY = {
    "mb": "Music & Studio",
    "diamond-cut": "Music & Studio",
    "VVS": "Music & Studio",
    "mbv4": "Music & Studio",
    "veinom": "Xen / Voice OS",
    "claudeos": "Xen / Voice OS",
    "xen-system-decision": "Xen / Voice OS",
    "xui": "Xen / Voice OS",
    "vvsvei": "Xen / Voice OS",
    "sel": "Business & L7S",
    "l7": "Business & L7S",
    "luckie": "Business & L7S",
    "pricing": "Business & L7S",
    "selfown": "Business & L7S",
    "menu": "Business & L7S",
    "offers": "Business & L7S",
    "trackingtogether": "Business & L7S",
    "autophone": "Business & L7S",
    "buzycred": "Business & L7S",
    "custom-er": "Business & L7S",
    "execpage": "Business & L7S",
    "l7shero": "Business & L7S",
    "selfexec": "Business & L7S",
    "xlrd-org": "Business & L7S",
    "PriceHero": "Business & L7S",
    "wcci": "Client Sites",
    "padre": "Client Sites",
    "wes": "Client Sites",
    "allendale": "Client Sites",
    "flcheats": "Client Sites",
    "222church": "Client Sites",
    "26thTemple": "Client Sites",
    "8922": "Client Sites",
    "dirtyhawks": "Client Sites",
    "rays": "Client Sites",
    "barnlights": "Client Sites",
    "calculators": "Tools & Calculators",
    "l7s": "Tools & Calculators",
    "abos": "Tools & Calculators",
    "cellbrowser-codex": "Builds & Apps",
    "links": "Builds & Apps",
    "overview": "Builds & Apps",
    "ju": "Builds & Apps",
    "swarm": "Builds & Apps",
    "aua": "Builds & Apps",
    "xlrd-tech": "Builds & Apps",
    "12step": "Builds & Apps",
}


def ensure_dir(slug: str) -> Path:
    d = ROOT / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_png(img: Image.Image, path: Path) -> None:
    img = img.convert("RGBA")
    img.resize((512, 512), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)
    print(f"  PNG {path.relative_to(ROOT)}")


def load_image(source: str | Path) -> Image.Image:
    if isinstance(source, Path) or (isinstance(source, str) and os.path.isfile(source)):
        return Image.open(source)
    with urllib.request.urlopen(source, timeout=30) as r:
        return Image.open(BytesIO(r.read()))


def center_crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return img.crop((left, top, left + s, top + s))


def part1_official_logos() -> None:
    print("=== PART 1: Official PNG logos ===")
    chain = ROOT / "icon.png"
    if not chain.is_file():
        raise SystemExit("Missing root icon.png for selscorp/pricing/xlrd-org fallback")

    # mb
    mb_srcs = [
        ROOT / "mb" / "assets" / "mb-logo.jpg",
        "https://hitthe.link/mb/assets/mb-logo.jpg",
    ]
    for src in mb_srcs:
        try:
            img = load_image(src)
            save_png(img, ensure_dir("mb") / "icon.png")
            break
        except Exception as e:
            print(f"  mb skip {src}: {e}")
    else:
        print("  mb FAILED")

    # sel — center crop square
    sel_srcs = [
        ROOT / "sel" / "_grok-gold-bezel.jpg",
        "https://hitthe.link/sel/_grok-gold-bezel.jpg",
    ]
    for src in sel_srcs:
        try:
            img = center_crop_square(load_image(src))
            save_png(img, ensure_dir("sel") / "icon.png")
            break
        except Exception as e:
            print(f"  sel skip {src}: {e}")

    # xlrd-org
    xlrd_srcs = [
        ROOT / "xlrd-org" / "assets" / "xlrd-og.png",
        "https://hitthe.link/xlrd-org/assets/xlrd-og.png",
        chain,
        "https://hitthe.link/icon.png",
    ]
    for src in xlrd_srcs:
        try:
            img = load_image(src)
            save_png(img, ensure_dir("xlrd-org") / "icon.png")
            break
        except Exception as e:
            print(f"  xlrd-org skip {src}: {e}")

    for slug in ("selscorp", "pricing"):
        dest = ensure_dir(slug) / "icon.png"
        shutil.copy2(chain, dest)
        print(f"  PNG {dest.relative_to(ROOT)} (chain copy)")


# Inner white icon markup per slug (512 viewBox, centered ~256)
ICON_INNER: dict[str, str] = {
    "diamond-cut": """
  <polygon points="256,100 340,200 300,380 212,380 172,200" fill="none" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>
  <line x1="256" y1="130" x2="256" y2="350" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
  <line x1="200" y1="220" x2="312" y2="220" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="18" fill="#fff" opacity=".9"/>""",
    "VVS": """
  <rect x="156" y="156" width="200" height="200" rx="28" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M196 256 L256 176 L316 256 L256 336 Z" fill="#fff" opacity=".95"/>
  <circle cx="256" cy="256" r="32" fill="none" stroke="#fff" stroke-width="6" opacity=".5"/>""",
    "mbv4": """
  <circle cx="256" cy="256" r="120" fill="none" stroke="#fff" stroke-width="10"/>
  <circle cx="256" cy="256" r="40" fill="#fff"/>
  <rect x="230" y="90" width="52" height="100" rx="26" fill="#fff" opacity=".85"/>
  <rect x="230" y="322" width="52" height="100" rx="26" fill="#fff" opacity=".85"/>""",
    "veinom": """
  <path d="M180 360 Q256 120 332 360" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/>
  <ellipse cx="256" cy="200" rx="70" ry="90" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M220 200 Q256 140 292 200" fill="none" stroke="#fff" stroke-width="8" opacity=".7"/>""",
    "claudeos": """
  <circle cx="256" cy="256" r="100" fill="none" stroke="#fff" stroke-width="10"/>
  <path d="M256 156 L256 256 L320 290" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="120" r="16" fill="#fff"/>
  <circle cx="360" cy="320" r="12" fill="#fff" opacity=".6"/>
  <circle cx="152" cy="320" r="12" fill="#fff" opacity=".6"/>""",
    "xen-system-decision": """
  <path d="M140 380 L256 140 L372 380 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
  <circle cx="256" cy="280" r="36" fill="#fff"/>
  <path d="M220 320 L256 240 L292 320" fill="none" stroke="#fff" stroke-width="8"/>""",
    "xui": """
  <rect x="140" y="160" width="232" height="192" rx="24" fill="none" stroke="#fff" stroke-width="12"/>
  <rect x="180" y="200" width="152" height="112" rx="12" fill="#fff" opacity=".25"/>
  <circle cx="256" cy="256" r="28" fill="#fff"/>
  <path d="M200 120 L312 120" stroke="#fff" stroke-width="8" stroke-linecap="round"/>""",
    "l7": """
  <path d="M160 380 L160 180 L220 180 L220 300 L292 180 L360 180 L280 380 Z" fill="#fff"/>
  <rect x="160" y="400" width="200" height="12" rx="6" fill="#fff" opacity=".5"/>""",
    "luckie": """
  <circle cx="180" cy="200" r="40" fill="#fff" opacity=".9"/>
  <circle cx="332" cy="200" r="40" fill="#fff" opacity=".9"/>
  <circle cx="256" cy="340" r="48" fill="#fff"/>
  <line x1="210" y1="220" x2="240" y2="310" stroke="#fff" stroke-width="8" opacity=".5"/>
  <line x1="302" y1="220" x2="272" y2="310" stroke="#fff" stroke-width="8" opacity=".5"/>""",
    "selfown": """
  <circle cx="256" cy="256" r="110" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M256 170 L256 340 M190 256 L322 256" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="36" fill="#fff"/>""",
    "menu": """
  <line x1="160" y1="200" x2="352" y2="200" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  <line x1="160" y1="256" x2="352" y2="256" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  <line x1="160" y1="312" x2="352" y2="312" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  <circle cx="130" cy="200" r="14" fill="#fff"/><circle cx="130" cy="256" r="14" fill="#fff"/><circle cx="130" cy="312" r="14" fill="#fff"/>""",
    "offers": """
  <rect x="180" y="140" width="152" height="240" rx="16" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M210 320 L256 200 L302 320" fill="#fff" opacity=".9"/>
  <line x1="210" y1="180" x2="302" y2="180" stroke="#fff" stroke-width="8"/>""",
    "trackingtogether": """
  <circle cx="200" cy="280" r="60" fill="none" stroke="#fff" stroke-width="10"/>
  <circle cx="312" cy="280" r="60" fill="none" stroke="#fff" stroke-width="10"/>
  <path d="M230 280 L282 280" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <path d="M256 160 L256 220" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <circle cx="256" cy="140" r="20" fill="#fff"/>""",
    "autophone": """
  <rect x="196" y="120" width="120" height="220" rx="28" fill="none" stroke="#fff" stroke-width="12"/>
  <circle cx="256" cy="300" r="18" fill="#fff"/>
  <path d="M220 160 Q256 140 292 160" fill="none" stroke="#fff" stroke-width="8"/>""",
    "buzycred": """
  <rect x="150" y="200" width="212" height="140" rx="20" fill="none" stroke="#fff" stroke-width="12"/>
  <rect x="180" y="170" width="152" height="40" rx="8" fill="#fff" opacity=".85"/>
  <line x1="190" y1="260" x2="322" y2="260" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
  <line x1="190" y1="300" x2="280" y2="300" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".7"/>""",
    "custom-er": """
  <path d="M256 120 L360 200 L320 380 L192 380 L152 200 Z" fill="none" stroke="#fff" stroke-width="12"/>
  <line x1="256" y1="200" x2="256" y2="320" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  <line x1="220" y1="260" x2="292" y2="260" stroke="#fff" stroke-width="14" stroke-linecap="round"/>""",
    "execpage": """
  <rect x="160" y="140" width="192" height="240" rx="12" fill="none" stroke="#fff" stroke-width="12"/>
  <line x1="190" y1="190" x2="322" y2="190" stroke="#fff" stroke-width="8"/>
  <line x1="190" y1="240" x2="300" y2="240" stroke="#fff" stroke-width="8" opacity=".7"/>
  <line x1="190" y1="290" x2="280" y2="290" stroke="#fff" stroke-width="8" opacity=".5"/>
  <circle cx="380" cy="160" r="28" fill="#fff"/>""",
    "l7shero": """
  <path d="M256 100 L320 380 L192 380 Z" fill="#fff" opacity=".95"/>
  <circle cx="256" cy="220" r="50" fill="none" stroke="#fff" stroke-width="8" opacity=".4"/>""",
    "selfexec": """
  <rect x="140" y="180" width="232" height="160" rx="20" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M180 300 L256 220 L332 300" fill="none" stroke="#fff" stroke-width="10"/>
  <circle cx="256" cy="200" r="24" fill="#fff"/>""",
    "PriceHero": """
  <line x1="160" y1="360" x2="160" y2="160" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <line x1="160" y1="360" x2="360" y2="360" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <path d="M200 300 L260 200 L320 280 L380 160" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>""",
    "wcci": """
  <path d="M256 120 C180 120 140 200 140 280 C140 360 256 400 256 400 C256 400 372 360 372 280 C372 200 332 120 256 120 Z" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M220 280 Q256 320 292 280" fill="none" stroke="#fff" stroke-width="8"/>""",
    "padre": """
  <rect x="180" y="160" width="152" height="200" rx="16" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M210 360 L302 360 L256 400 Z" fill="#fff" opacity=".9"/>
  <circle cx="256" cy="240" r="40" fill="#fff" opacity=".35"/>""",
    "wes": """
  <rect x="160" y="150" width="192" height="220" rx="16" fill="none" stroke="#fff" stroke-width="12"/>
  <line x1="190" y1="200" x2="322" y2="200" stroke="#fff" stroke-width="8"/>
  <line x1="190" y1="250" x2="300" y2="250" stroke="#fff" stroke-width="8" opacity=".7"/>
  <circle cx="256" cy="320" r="24" fill="#fff"/>""",
    "allendale": """
  <ellipse cx="256" cy="300" rx="120" ry="50" fill="none" stroke="#fff" stroke-width="10"/>
  <path d="M180 300 Q256 120 332 300" fill="none" stroke="#fff" stroke-width="12"/>
  <circle cx="220" cy="200" r="20" fill="#fff"/><circle cx="292" cy="200" r="20" fill="#fff"/>""",
    "flcheats": """
  <rect x="140" y="160" width="80" height="200" rx="8" fill="#fff" opacity=".9"/>
  <rect x="240" y="140" width="80" height="220" rx="8" fill="#fff"/>
  <rect x="340" y="180" width="60" height="180" rx="8" fill="#fff" opacity=".7"/>
  <circle cx="180" cy="140" r="16" fill="#fff"/><circle cx="280" cy="120" r="16" fill="#fff"/>""",
    "222church": """
  <path d="M220 380 L220 200 L256 140 L292 200 L292 380 Z" fill="none" stroke="#fff" stroke-width="12"/>
  <line x1="200" y1="220" x2="312" y2="220" stroke="#fff" stroke-width="10"/>
  <circle cx="256" cy="260" r="28" fill="#fff" opacity=".4"/>""",
    "26thTemple": """
  <rect x="170" y="160" width="172" height="220" rx="12" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M200 200 H312 M200 260 H312 M200 320 H280" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
  <path d="M340 160 L380 200 L340 240" fill="none" stroke="#fff" stroke-width="8"/>""",
    "8922": """
  <text x="256" y="300" text-anchor="middle" font-size="140" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">9</text>
  <circle cx="256" cy="256" r="130" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="20 12"/>""",
    "dirtyhawks": """
  <circle cx="256" cy="256" r="100" fill="none" stroke="#fff" stroke-width="12"/>
  <circle cx="256" cy="256" r="24" fill="#fff"/>
  <line x1="256" y1="120" x2="256" y2="80" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <line x1="256" y1="392" x2="256" y2="352" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <line x1="120" y1="256" x2="80" y2="256" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <line x1="392" y1="256" x2="352" y2="256" stroke="#fff" stroke-width="10" stroke-linecap="round"/>""",
    "rays": """
  <path d="M160 360 L256 140 L352 360 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
  <circle cx="256" cy="280" r="50" fill="#fff" opacity=".35"/>
  <line x1="256" y1="200" x2="256" y2="320" stroke="#fff" stroke-width="8"/>""",
    "barnlights": """
  <path d="M140 280 L256 160 L372 280 L340 380 L172 380 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
  <circle cx="200" cy="240" r="22" fill="#fff" opacity=".8"/>
  <circle cx="312" cy="240" r="22" fill="#fff" opacity=".8"/>""",
    "calculators": """
  <rect x="150" y="140" width="212" height="260" rx="24" fill="none" stroke="#fff" stroke-width="12"/>
  <rect x="180" y="170" width="152" height="60" rx="8" fill="#fff" opacity=".3"/>
  <circle cx="210" cy="280" r="22" fill="#fff"/><circle cx="256" cy="280" r="22" fill="#fff"/>
  <circle cx="302" cy="280" r="22" fill="#fff"/><circle cx="210" cy="340" r="22" fill="#fff" opacity=".7"/>
  <circle cx="256" cy="340" r="22" fill="#fff" opacity=".7"/><circle cx="302" cy="340" r="22" fill="#fff" opacity=".7"/>""",
    "l7s": """
  <line x1="140" y1="360" x2="140" y2="180" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <line x1="140" y1="360" x2="380" y2="360" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <path d="M180 320 L240 220 L300 300 L360 200" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>""",
    "abos": """
  <circle cx="256" cy="256" r="100" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M256 180 L290 256 L256 332 L222 256 Z" fill="#fff"/>
  <circle cx="256" cy="256" r="28" fill="none" stroke="#fff" stroke-width="6"/>""",
    "cellbrowser-codex": """
  <rect x="120" y="180" width="100" height="140" rx="12" fill="none" stroke="#fff" stroke-width="10"/>
  <rect x="206" y="160" width="100" height="160" rx="12" fill="none" stroke="#fff" stroke-width="10"/>
  <rect x="292" y="200" width="100" height="120" rx="12" fill="none" stroke="#fff" stroke-width="10"/>
  <line x1="220" y1="220" x2="220" y2="280" stroke="#fff" stroke-width="6"/>""",
    "links": """
  <path d="M200 280 C160 280 160 220 200 220 L230 220 C250 220 256 200 256 180 C256 200 262 220 282 220 L312 220 C352 220 352 280 312 280 L282 280 C262 280 256 300 256 320 C256 300 250 280 230 280 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <circle cx="256" cy="250" r="20" fill="#fff"/>""",
    "overview": """
  <rect x="160" y="160" width="80" height="80" rx="8" fill="#fff" opacity=".9"/>
  <rect x="272" y="160" width="80" height="80" rx="8" fill="#fff" opacity=".7"/>
  <rect x="160" y="272" width="80" height="80" rx="8" fill="#fff" opacity=".7"/>
  <rect x="272" y="272" width="80" height="80" rx="8" fill="#fff"/>""",
    "ju": """
  <circle cx="200" cy="280" r="50" fill="none" stroke="#fff" stroke-width="10"/>
  <path d="M250 280 Q300 200 360 200" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <polygon points="360,180 400,200 360,220" fill="#fff"/>""",
    "swarm": """
  <circle cx="200" cy="220" r="36" fill="#fff" opacity=".85"/>
  <circle cx="312" cy="220" r="36" fill="#fff" opacity=".85"/>
  <circle cx="256" cy="300" r="36" fill="#fff" opacity=".85"/>
  <circle cx="180" cy="320" r="28" fill="#fff" opacity=".6"/>
  <circle cx="332" cy="320" r="28" fill="#fff" opacity=".6"/>
  <line x1="220" y1="240" x2="292" y2="280" stroke="#fff" stroke-width="4" opacity=".5"/>""",
    "aua": """
  <path d="M160 280 C160 220 220 180 280 200 C340 220 360 280 320 320 C280 360 200 340 160 280 Z" fill="none" stroke="#fff" stroke-width="12"/>
  <path d="M220 280 L256 240 L292 280 L256 320 Z" fill="#fff" opacity=".85"/>""",
    "xlrd-tech": """
  <path d="M200 380 L200 200 L256 140 L312 200 L312 380 Z" fill="none" stroke="#fff" stroke-width="12"/>
  <circle cx="256" cy="260" r="50" fill="#fff" opacity=".25"/>
  <path d="M230 260 L256 220 L282 260" fill="#fff"/>""",
    "12step": """
  <circle cx="256" cy="256" r="120" fill="none" stroke="#fff" stroke-width="10"/>
  <text x="256" y="290" text-anchor="middle" font-size="100" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">12</text>""",
    "xen-system-decision": """
  <path d="M140 380 L256 140 L372 380 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
  <circle cx="256" cy="280" r="36" fill="#fff"/>
  <path d="M220 320 L256 240 L292 320" fill="none" stroke="#fff" stroke-width="8"/>""",
}


def make_svg(slug: str, inner: str) -> str:
    cat = SLUG_CATEGORY.get(slug, "Builds & Apps")
    c1, c2 = CAT_COLORS[cat]
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
{inner}
</svg>
'''


def has_icon(slug: str) -> bool:
    d = ROOT / slug
    return (d / "icon.png").is_file() or (d / "icon.svg").is_file()


def part2_svg_icons() -> None:
    print("=== PART 2: SVG icons ===")
    skip = {"vvsvei"}  # already has PNG
    created = 0
    for slug, inner in ICON_INNER.items():
        if slug in skip or has_icon(slug):
            print(f"  skip {slug} (has icon)")
            continue
        path = ensure_dir(slug) / "icon.svg"
        path.write_text(make_svg(slug, inner.strip()), encoding="utf-8")
        print(f"  SVG {path.relative_to(ROOT)}")
        created += 1
    print(f"  Created {created} SVG icons")


def main() -> None:
    os.chdir(ROOT)
    part1_official_logos()
    part2_svg_icons()
    print("Done.")


if __name__ == "__main__":
    main()