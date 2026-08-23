# Diamond Cutz — domain connect (PREPARED, DO NOT ACTIVATE until balance paid)

Per canon ([[dcz-client-delivery-process]]): the domain connects ONLY after the
client is satisfied AND the $111 balance is paid. This file is the ready-to-flip
checklist — nothing here is live yet. No `CNAME` file has been committed (committing
one would activate GitHub Pages custom-domain serving), and no DNS records are set.

Domains owned (Spaceship, purchased 2026-06-17): `diamondcutzstudios.com`, `dmndctz.com`.
Site lives at: https://hitthe.link/dcz/

## Decision: pick ONE when it's time to connect

### Option A — Spaceship URL forwarding (simplest, keeps the /dcz/ path)
1. Spaceship → diamondcutzstudios.com → Forwarding → Forward to `https://hitthe.link/dcz/` (301, with path/query off).
2. Repeat for `dmndctz.com`.
3. Done. No repo change. Reversible instantly.

### Option B — Apex on GitHub Pages (cleanest URL, apex serves the site directly)
1. Create/point an apex GH-Pages site (or move /dcz to its own repo with Pages on).
2. Add the 4 GitHub Pages apex A-records at Spaceship DNS:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   plus `www` CNAME → `<user>.github.io`.
3. Commit a `CNAME` file containing `diamondcutzstudios.com`  ← THIS is the activation switch. Do NOT add it until paid.
4. Enable "Enforce HTTPS" in repo Pages settings after cert provisions.

## On-site readiness (already done, within power)
- [x] Social icons + links live on /dcz/
- [x] Social bios drafted → /dcz/bios/
- [x] Structured data (MusicGroup / LocalBusiness / Event) added
- [x] Old /stal-lyon/ placeholder redirected to /dcz/ (no more public {{tokens}})
- [x] Domain shown on-site as "launching" text, not a dead clickable link
- [ ] Balance $111 collected  ← gate
- [ ] Client says they're satisfied  ← gate
- [ ] THEN: run Option A or B above
