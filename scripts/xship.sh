#!/bin/bash
# xship.sh — one-call ship that wins the race against the xen-receipts bot.
# Usage: bash scripts/xship.sh "<commit message>" [path ...]
#   - stages given paths (or all staged changes if none given)
#   - commits, then fetch→rebase→push with retry loop (XLRDTECH token)
#   - stashes the perennial calculators/assets/logo.png working-tree change so rebase stays clean
# Exit 0 only on a real "HEAD -> main" push.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
MSG="${1:?commit message required}"; shift || true
PUSH_URL="https://x-access-token:${GITHUB_TOKEN_XLRDTECH}@github.com/xlrdtech/hitthe.link.git"

if [ "$#" -gt 0 ]; then git add "$@"; fi
if git diff --cached --quiet; then echo "xship: nothing staged"; exit 1; fi
git commit -q -m "$MSG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || { echo "xship: commit failed"; exit 1; }

git stash push -q -- calculators/assets/logo.png 2>/dev/null
ok=0
for try in 1 2 3 4 5 6; do
  git fetch "$PUSH_URL" main -q
  git rebase FETCH_HEAD -q >/dev/null 2>&1 || git rebase --abort 2>/dev/null
  if git push "$PUSH_URL" HEAD:main 2>&1 | grep -q "HEAD -> main"; then ok=1; echo "xship: PUSHED (try $try)"; break; fi
  sleep 3
done
git stash pop -q 2>/dev/null
[ "$ok" = "1" ] || { echo "xship: PUSH FAILED after 6 tries"; exit 1; }

# optional live-verify: xship.sh "msg" path -- VERIFY <url> <marker>
exit 0
