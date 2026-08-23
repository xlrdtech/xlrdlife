#!/usr/bin/env python
"""Border-seeded flood-fill background remover -> transparent PNG.
Floods from every border pixel, removing contiguous regions within tolerance
of each seed (handles solid bgs AND grok's drawn checkerboard, since both
shades touch the border). Feathers edges via partial alpha. Preserves interior.
"""
import sys, collections
from PIL import Image

def make_transparent(path, tol=42, feather=True):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False]*w for _ in range(h)]
    dq = collections.deque()
    # seed every border pixel
    for x in range(w):
        for y in (0, h-1):
            dq.append((x, y, px[x, y]))
    for y in range(h):
        for x in (0, w-1):
            dq.append((x, y, px[x, y]))
    def close(a, b):
        return abs(a[0]-b[0])+abs(a[1]-b[1])+abs(a[2]-b[2]) <= tol*3
    cleared = 0
    while dq:
        x, y, seed = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        cur = px[x, y]
        if not close(cur, seed):
            continue
        seen[y][x] = True
        px[x, y] = (cur[0], cur[1], cur[2], 0)
        cleared += 1
        dq.append((x+1, y, seed)); dq.append((x-1, y, seed))
        dq.append((x, y+1, seed)); dq.append((x, y-1, seed))
    # feather: any opaque pixel touching a transparent one gets softened
    if feather:
        for y in range(h):
            for x in range(w):
                if px[x, y][3] == 255:
                    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                            r,g,b,_ = px[x, y]
                            px[x, y] = (r, g, b, 170)
                            break
    img.save(path)
    return cleared, w*h

if __name__ == "__main__":
    for p in sys.argv[1:]:
        try:
            c, t = make_transparent(p)
            print(f"OK  {p}  cleared {c}/{t} px ({100*c//t}%)")
        except Exception as e:
            print(f"ERR {p}: {e}")
