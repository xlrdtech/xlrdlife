# THIS TREE SHIPS. THE OTHERS DO NOT.

`/Volumes/M4/sync_/exedus/dev_/xen/.xen-state/xos-trackc-wt`
→ `github.com/xlrdtech/hitthe.link` → `hitthe.link`

## Why this file exists

2026-08-15 04:30. Fifty-three agents across four workflows were told, by canon
and by the XEN MAP, that the repo was `.deploy/hitthe.link`. It is not, and has
not been for some time. Every one of them measured correctly against the wrong
tree, and qi's verdict on the night was **"nothing gets fixed."**

He was right, and the mechanism was not difficulty. It was this:

| tree | `vvsvei/index.html` | note |
|---|---|---|
| **`.xen-state/xos-trackc-wt`** | **274,570** | ← edited tonight, **ships** |
| `.deploy/hitthe.link` | 176,259 | canon pointed here; 87KB behind |
| `.xen-state/ship-wt` | 213,700 | stale |
| `.deploy/hitthe-day-wt` | 162,443 | stale, Aug 1 |
| `.xen-state/hitthe-receipts-wt` | 125,848 | stale, Jun 11 |
| `_edrive-recovery/2026-07-16/hitthe.link` | 156,837 | recovery copy |
| served by `hitthe.link` at the time | 263,896 | matched **none** of them |

Seven trees carry this repo. Five hold a different version of that one file.
Work landed in a tree, stopped there, and from qi's side that is indistinguishable
from never having been done. 10,674 bytes of his own 02:01 and 02:19 directives —
already built, already correct — sat uncommitted on disk for hours.

## Before you edit anything under this repo

```sh
git -C <dir> remote -v                                  # must be xlrdtech/hitthe.link
test -f <dir>/SHIPS-FROM.md                             # must exist — only this tree has it
git -C <dir> fetch && git -C <dir> rev-list --left-right --count origin/main...HEAD
```

`git fetch` FIRST, always. A tree once read `0 0` while 28 commits behind, and an
edit from it would have reverted qi's own commit.

## Before you claim anything shipped

A push is not a deploy. `git push` succeeding means GitHub has the commit; the
edge serves the old bytes until Cloudflare rebuilds. The only proof is:

```sh
curl -so /tmp/live.html https://hitthe.link/vvsvei/ && stat -f %z /tmp/live.html
```

matching the bytes on disk. Not a 200. Not the push exit code — and never
`git push | tail`, which reports *tail's* status and once printed "pushed" on a
rejected push.

## Sacred, in this file's scope

`.dock.dock-swipe` and its children (`-handle`, `-sheen`, `-edge-light`, `-hit`,
`-vei-host`) are read-only forever. Copy their values; never edit the rule.
No iframes. No `env(safe-area-inset-*)`-gated layout change without a screenshot
from qi's own handset — every browser available here resolves those to 0, so a
clean local measurement is the *absence* of the condition, not evidence.
