# EliOS Buyer Portal — Backend

Gated, per-buyer OAuth portal for Anthony Vasquez's lead-resale model. Reps/contractors
pay (Stripe) for monthly access to qualified home-improvement leads. Each buyer logs in
with their **own** Google OAuth / email account (not a shared link) and can read **only**
the leads granted to them.

Stack (all proven primitives, zero hand-rolled crypto):

| Layer | Tech | Role |
|---|---|---|
| Auth + DB + RLS | **Supabase** (project `elios-buyer-portal`) | Google OAuth + magic-link, JWT sessions, Postgres, Row-Level Security. Single source of truth for identity + entitlement. |
| Billing | **Stripe Billing** (Checkout + Customer Portal) | Plan A `$100/30 leads`, Plan B `$40/15 leads`. Billing source of truth. |
| Server glue | **One Cloudflare Worker** | Only place secrets live. Stripe webhook receiver, checkout/portal session creators, monthly grant allocator (cron). |
| Front | static page on GitHub Pages | `tools.trackingtogether.com` (+ `/pay`). Holds only the Supabase anon key + Stripe `pk_live` (both safe to be public). |

Entitlement chain: Stripe subscription `status (active/trialing)` → `plan` → `monthly_quota` → rows in `lead_grants`, enforced by RLS.

---

## Files

```
backend/
  supabase-schema.sql      # tables + RLS + signup trigger + my_leads view + my_entitlement()
  allocate-grants.sql      # OPTIONAL pure-Postgres allocator (pg_cron alternative to the JS one)
  src/
    worker.js              # Cloudflare Worker: webhook + checkout + portal + allocate + scheduled()
    allocate-grants.js     # monthly lead-grant allocator (imported by worker + run-allocate)
  scripts/
    sync-leads.mjs         # Lead Master -> public.leads (JSON export default, or --source=asana)
    run-allocate.mjs       # operator: run the allocator on-demand
  wrangler.toml.template   # copy -> wrangler.toml, fill account_id; secrets via `wrangler secret put`
  package.json             # stripe + @supabase/supabase-js + wrangler
  .env.example             # every secret/credential prereq (copy -> .env, never commit)
  .gitignore
```

## Data model (RLS-enforced)

- `buyers` — 1:1 with `auth.users`; auto-created by signup trigger. Buyer reads/updates only own row.
- `subscriptions` — Stripe mirror. Buyer **reads** own; writes are service-role only (the Worker).
- `leads` — the 520 from Asana Lead Master / `eliops/leads.json`. **No buyer SELECT policy** — buyers never touch this table directly.
- `lead_grants` — buyer↔lead access record + billing month. `UNIQUE(lead_id)` makes a lead exclusive to one buyer; written only by the allocator.
- `my_leads` (view, `security_invoker`) — the **only** buyer path to lead PII; RLS-scoped via `lead_grants`.
- `my_entitlement()` — "X of N leads this month" without exposing `leads`.

## Deploy (staging first, no live secrets in repo)

1. **Supabase**: create project `elios-buyer-portal` → SQL editor → paste `supabase-schema.sql`. Enable Google provider (Auth > Providers) with `GOOGLE_OAUTH_CLIENT_ID/SECRET`; redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
2. **Stripe**: create the two recurring Prices → note `price_...` ids. (Use `sk_test_`/test prices while staging.)
3. **Worker**:
   ```
   cd backend && npm install
   cp wrangler.toml.template wrangler.toml   # fill account_id
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put STRIPE_PRICE_PLAN_A
   wrangler secret put STRIPE_PRICE_PLAN_B
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put CRON_SECRET
   wrangler secret put ALLOWED_ORIGIN
   wrangler deploy
   ```
4. **Stripe webhook**: Dashboard > Webhooks > add endpoint `https://<worker-host>/api/stripe-webhook`, events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Copy signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.
5. **Seed leads**: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync:leads`
6. **Frontend**: static page calls `supabase-js` (anon key) for login + `select * from my_leads`; "Subscribe" → `POST /api/create-checkout-session` (Bearer Supabase JWT) → redirect to returned Stripe URL; "Manage" → `POST /api/create-portal-session`.

## Endpoints

| Method/Path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness |
| `POST /api/stripe-webhook` | Stripe signature | mirror subscription → Supabase |
| `POST /api/create-checkout-session` | Supabase JWT (Bearer) | `{plan:"plan_a"|"plan_b"}` → `{url}` |
| `POST /api/create-portal-session` | Supabase JWT (Bearer) | → `{url}` (cancel/upgrade/card) |
| `POST /api/allocate-grants` | `X-Cron-Secret` | top up grants to quota now |
| (cron `0 8 1 * *`) | — | `scheduled()` runs the allocator monthly |

## Security rails honored

- Proven auth only: Supabase GoTrue + Stripe. No hand-rolled sessions/JWT/password hashing.
- No live secret in the repo. `.env.example` + `wrangler.toml.template` are templates; real values go to Worker Secrets / local `.env` (git-ignored).
- `pk_live` and the Supabase anon key are the **only** values exposed to the static front — both public-safe by design.
- Service-role key lives **only** in the Worker (and operator scripts run locally).
