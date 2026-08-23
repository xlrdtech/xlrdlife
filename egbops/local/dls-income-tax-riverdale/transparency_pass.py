"""
Border-flood transparency pass.
Flood-fills the near-white background starting from the image border inward,
turning it transparent while preserving the interior emblem (including any
white that is *enclosed* by colored strokes). Guarantees corner alpha == 0.
"""
import sys
from collections import deque
from PIL import Image

SRC = r"E:\hitthe.link\egbops\local\dls-income-tax-riverdale\assets\logo_raw.png"
DST = r"E:\hitthe.link\egbops\local\dls-income-tax-riverdale\assets\logo.png"

# how close to white a pixel must be (per-channel max distance) to count as background
THRESH = 38

im = Image.open(SRC).convert("RGBA")
w, h = im.size
px = im.load()

def is_bg(r, g, b):
    return (255 - r) <= THRESH and (255 - g) <= THRESH and (255 - b) <= THRESH

visited = bytearray(w * h)
q = deque()

# seed from all border pixels that are background
for x in range(w):
    for y in (0, h - 1):
        i = y * w + x
        if not visited[i]:
            r, g, b, a = px[x, y]
            if is_bg(r, g, b):
                visited[i] = 1
                q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        i = y * w + x
        if not visited[i]:
            r, g, b, a = px[x, y]
            if is_bg(r, g, b):
                visited[i] = 1
                q.append((x, y))

# flood fill (4-connectivity)
cleared = 0
while q:
    x, y = q.popleft()
    px[x, y] = (255, 255, 255, 0)
    cleared += 1
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            ni = ny * w + nx
            if not visited[ni]:
                r, g, b, a = px[nx, ny]
                if is_bg(r, g, b):
                    visited[ni] = 1
                    q.append((nx, ny))

# feather the alpha edge by 1px for anti-aliasing: soften pixels adjacent to transparent
# (lightweight: lower alpha on near-white pixels that touch a transparent neighbor)
edge_soft = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if is_bg(r, g, b):
            # near-white but enclosed -> check if it borders transparency
            touches = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    touches = True
                    break
            if touches:
                px[x, y] = (r, g, b, 120)
                edge_soft += 1

# crop to non-transparent bbox + small margin so the emblem is tight and centered
bbox = im.getbbox()
if bbox:
    margin = max(6, int(min(w, h) * 0.03))
    l, t, rr, bb = bbox
    l = max(0, l - margin); t = max(0, t - margin)
    rr = min(w, rr + margin); bb = min(h, bb + margin)
    im = im.crop((l, t, rr, bb))

im.save(DST)

# verify all four corners are fully transparent
cw, ch = im.size
cpx = im.load()
corners = [cpx[0, 0], cpx[cw - 1, 0], cpx[0, ch - 1], cpx[cw - 1, ch - 1]]
print(f"cleared={cleared} edge_soft={edge_soft} out_size={im.size}")
print("corner_alphas=", [c[3] for c in corners])
assert all(c[3] == 0 for c in corners), "FAIL: a corner is not fully transparent"
print("OK: true backgroundless PNG, all corners alpha=0")
