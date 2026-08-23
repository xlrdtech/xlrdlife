# EliOS Buyer Portal

Gated, per-buyer OAuth portal for Anthony Vasquez's lead-resale model. Reps and
contractors pay (Stripe) for monthly access to qualified home-improvement leads.
Each buyer logs in with their **own** Google OAuth / email account (not a shared
link) and can read **only** the leads granted to them.

Live URL: **https://hitthe.link/elios/** (production alias: `tools.trackingtogether.com`,
with `/pay` -> the pricing/checkout view).

---

## Chosen stack (one line)

**Supabase-core, Cloudflare-edge, GitHub-Pages-front:** Supabase Auth + Postgres/RLS
(identity + entitlement), Stripe Billing (Checkout + Customer Portal), one Cloudflare
Worker holding the only secrets (webhook + session creators + monthly grant allocator),
and a static front on GitHub Pages. Zero hand-rolled crypto.

---

## Architecture

```
                 Google OAuth / email
                         |
                         v
   Browser  ---->  Supabase Auth (GoTrue)  ----issues JWT session
 (static page)            |
   |  |  |                v
   |  |  |        Postgres + Row-Level Security
   |  |  |        buyers / subscriptions / leads / lead_grants
   |  |  |        my_leads (view) + my_entitlement() (rpc)
   |  |  |                ^
   |  |  |                | service-role writes ONLY from the Worker
   |  |  +----RLS reads---+
   |  |       (anon key; my_leads view is the only path to lead PII)
   |  |
   |  +--- POST /api/create-checkout-session (Bearer JWT) --+
   |  +--- POST /api/create-portal-session   (Bearer JWT) --+
   |                                                         v
   |                                          Cloudflare Worker (the glue)
   |                                          - Stripe webhook receiver (sig-verified)
   |                                          - checkout/portal session creators
   |                                          - monthly grant allocator (cron 0 8 1 * *)
   |                                          - holds sk_live + service_role + webhook secret
   |                                                         |
   +--- redirect to Stripe-hosted -------------------------> Stripe Billing
        Checkout / Customer Portal                          (subscription source of truth)
                                                                   |
                                          webhook -> Worker -> Supabase subscriptions mirror
```

**Entitlement chain:** Stripe subscription `status (active/trialing)` -> `plan` ->
`monthly_quota` -> rows in `lead_grants`, enforced by RLS. Stripe is the billing
source of truth; Supabase mirrors entitlement; the front never sees a secret.

### Security boundary

- Proven auth only: Supabase GoTrue + Stripe. No hand-rolled sessions, JWTs, or password hashing.
- RLS is the data security boundary. Buyers have **no** direct SELECT on `public.leads`;
  the only path to lead PII is the `my_leads` view (`security_invoker`, scoped by `lead_grants`).
- The static front holds only the Supabase **anon** key + Stripe **pk_live** (both public-safe).
- Service-role key, Stripe `sk_live`, and the webhook signing secret live **only** as
  Cloudflare Worker Secrets. The Google OAuth client secret lives **only** in Supabase Auth config.

---

## Repository layout

```
elios/
  index.html        Login. Google OAuth + email password + magic link (Supabase / GoTrue).
  dashboard.html    Gated dashboard. Session-guarded. Monthly allotment vs quota, pipeline,
                    subscription status, lead list (tap-to-call / tap-to-text), Manage billing.
  pricing.html      The /pay view. Plan A (30 / $100, featured) + Plan B (15 / $40) -> Stripe Checkout.
  config.js         PUBLIC runtime config. Anon/publishable keys + price IDs + Worker base. PLACEHOLDERS.
  brand.css         Obsidian / metallic-iridescent brand (Fraunces + JetBrains Mono, gold gradient, glass).
  README.md         Frontend-specific notes.
  README-ELIOS.md   This file (whole-system architecture + deploy + prereqs).
  backend/          Built separately. Supabase schema, Cloudflare Worker, allocator, lead sync.
    supabase-schema.sql      tables + RLS + signup trigger + my_leads view + my_entitlement()
    src/worker.js            webhook + checkout + portal + allocate + scheduled()
    src/allocate-grants.js   monthly lead-grant allocator
    scripts/sync-leads.mjs   Lead Master -> public.leads
    scripts/run-allocate.mjs operator: run the allocator on-demand
    wrangler.toml.template   copy -> wrangler.toml; secrets via `wrangler secret put`
    .env.example             every secret/credential prereq (copy -> .env, never commit)
```

---

## Backend contract (what the front depends on)

Worker endpoints, authed by the Supabase JWT in `Authorization: Bearer <token>`:

| Method / Path | Auth | Purpose |
|---|---|---|
| `POST /api/create-checkout-session` | Supabase JWT (Bearer) | body `{ plan: "plan_a" \| "plan_b" }` -> `{ url }` |
| `POST /api/create-portal-session`   | Supabase JWT (Bearer) | -> `{ url }` (cancel / upgrade / card change) |
| `POST /api/stripe-webhook`          | Stripe signature      | mirror subscription -> Supabase |
| `POST /api/allocate-grants`         | `X-Cron-Secret`       | top up grants to quota now |
| cron `0 8 1 * *`                    | (scheduled)           | monthly grant allocator |

The Worker derives the Stripe price and success/cancel URLs server-side from its env,
so only `plan` in the checkout request body is load-bearing.

Dashboard reads (anon key, RLS-scoped): `buyers` (id = auth.uid()), `subscriptions`
(buyer_id = auth.uid()), and the `my_leads` view (only path to lead PII).

---

## Deploy (staging first, no live secrets in the repo)

1. **Supabase** — create project `elios-buyer-portal`. SQL editor -> paste
   `backend/supabase-schema.sql`. Auth > Providers: enable Email (password + magic link)
   and Google (paste the Google OAuth client id + secret). Auth > URL Configuration >
   Redirect URLs: add `https://tools.trackingtogether.com/elios/dashboard.html` and the
   GitHub Pages origin `https://hitthe.link/elios/dashboard.html`.
2. **Google Cloud** — OAuth consent screen + OAuth client (Web). Authorized redirect URI
   is the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Stripe** — create two recurring Prices (Plan A $100 / 30 leads, Plan B $40 / 15 leads);
   note the `price_...` ids. Use `sk_test_` + test prices while staging.
4. **Worker**:
   ```
   cd elios/backend && npm install
   cp wrangler.toml.template wrangler.toml   # fill account_id
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put STRIPE_PRICE_PLAN_A
   wrangler secret put STRIPE_PRICE_PLAN_B
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put CRON_SECRET
   wrangler secret put ALLOWED_ORIGIN          # https://tools.trackingtogether.com
   wrangler deploy
   ```
5. **Stripe webhook** — Dashboard > Webhooks > add endpoint `https://<worker-host>/api/stripe-webhook`,
   events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
   `invoice.payment_failed`. Copy the signing secret -> `wrangler secret put STRIPE_WEBHOOK_SECRET`.
6. **Seed leads** — `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync:leads`.
7. **Frontend** — fill `elios/config.js` with the six PUBLIC values (below), commit, push.
   GitHub Pages serves it at `https://hitthe.link/elios/` (and `tools.trackingtogether.com`)
   within ~2-3 minutes. The page renders demo data until `config.js` is filled.
8. **DNS** — point `tools.trackingtogether.com` at GitHub Pages (CNAME -> `xlrdtech.github.io`,
   or the apex/A records per the existing hitthe.link Pages setup) and add the host to the
   Pages custom-domain / `CNAME` file. Flip to `pk_live_` + live prices once verified on staging.

---

## PREREQS checklist — exactly what qi / Anthony must provide

Hand these over and the portal goes live. The six PUBLIC values go into `elios/config.js`;
the secrets go to the Worker / Supabase (never the repo).

### A. Stripe (billing source of truth)
- [ ] **Stripe account** in live mode, business verified for payouts.
- [ ] **`pk_live_...`** publishable key  -> `config.js` `STRIPE_PUBLISHABLE_KEY` (PUBLIC)
- [ ] **`sk_live_...`** secret key        -> Worker Secret `STRIPE_SECRET_KEY` (SECRET)
- [ ] **Price id Plan A** ($100 / 30 leads / month, recurring) -> `config.js` + Worker `STRIPE_PRICE_PLAN_A`
- [ ] **Price id Plan B** ($40 / 15 leads / month, recurring)  -> `config.js` + Worker `STRIPE_PRICE_PLAN_B`
- [ ] **Webhook signing secret** (after adding the endpoint) -> Worker Secret `STRIPE_WEBHOOK_SECRET` (SECRET)

### B. Google OAuth (the "Continue with Google" login)
- [ ] **Google Cloud project** with the OAuth consent screen published.
- [ ] **OAuth client id** (Web application) -> Supabase Auth > Providers > Google
- [ ] **OAuth client secret**               -> Supabase Auth > Providers > Google (SECRET, server side)
- [ ] Authorized redirect URI set to the Supabase callback `https://<ref>.supabase.co/auth/v1/callback`

### C. Supabase (auth + DB + RLS)
- [ ] **New project** named `elios-buyer-portal` (dedicated, not shared).
- [ ] **Project URL** -> `config.js` `SUPABASE_URL` + Worker `SUPABASE_URL` (PUBLIC url)
- [ ] **anon / publishable key** -> `config.js` `SUPABASE_ANON_KEY` (PUBLIC, RLS-protected)
- [ ] **service_role key** -> Worker Secret `SUPABASE_SERVICE_ROLE_KEY` (SECRET, Worker only)
- [ ] `backend/supabase-schema.sql` run in the SQL editor; Email + Google providers enabled; redirect URLs added.

### D. Cloudflare Worker (the glue / only secret-holder)
- [ ] **Cloudflare account id** -> `wrangler.toml`
- [ ] Deployed Worker base URL -> `config.js` `WORKER_API_BASE`
- [ ] `CRON_SECRET` + `ALLOWED_ORIGIN` set as Worker Secrets.

### E. DNS / hosting
- [ ] **`tools.trackingtogether.com`** pointed at GitHub Pages (CNAME -> `xlrdtech.github.io`)
      and registered as the Pages custom domain (CNAME file / Pages settings).
- [ ] Confirm `https://hitthe.link/elios/` returns 200 (it does after this push; the GitHub
      Pages deploy takes ~2-3 minutes).

### The six PUBLIC values for `elios/config.js` (safe to commit)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_PLAN_A`,
`STRIPE_PRICE_PLAN_B`, `WORKER_API_BASE`.

### Secrets that must NEVER touch the repo
Supabase `service_role` key, Stripe `sk_live`, Stripe webhook signing secret
(-> Cloudflare Worker Secrets); Google OAuth client secret (-> Supabase Auth config).

---

## Known follow-up

- The backend Worker's Checkout `success_url` was flagged mid-build as pointing at a
  truncated path; confirm it resolves to `https://tools.trackingtogether.com/elios/dashboard.html`
  (and `cancel_url` to `.../pricing.html`) before the live flip.

No em-dashes. No live secrets committed.
