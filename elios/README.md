# EliOS Buyer Portal — frontend

Static portal for Anthony Vasquez's lead-resale model. Served from GitHub Pages
(hitthe.link infra) at `tools.trackingtogether.com`, `/pay` staged to `pricing.html`.

Stack (per chosen design): Supabase Auth + Postgres/RLS, Stripe Billing, one
Cloudflare Worker for secrets/webhooks. This folder is the FRONTEND only.

## Files
- `index.html`      Login. Google OAuth + email password + magic link (Supabase Auth / GoTrue).
- `dashboard.html`  Gated. Session-guarded. Shows monthly lead allotment + pipeline + quota + subscription status. Reads via RLS-scoped Supabase queries. Demo data renders until keys are filled.
- `pricing.html`    The `/pay` view. Two plans, routes to Stripe Checkout via the Worker (authed). Manage/cancel via Stripe Customer Portal from the dashboard.
- `config.js`       PUBLIC runtime config. Anon/publishable keys only. PLACEHOLDERS to fill.
- `brand.css`       Obsidian / metallic-iridescent brand (Fraunces + JetBrains Mono, gold gradient, glass).

## Credential prerequisites (PLACEHOLDERED — fill in config.js)
All of these are PUBLIC and safe in the static file:
- `SUPABASE_URL`             Supabase project URL (project: elios-buyer-portal). Settings > API.
- `SUPABASE_ANON_KEY`        Supabase anon / publishable key. RLS is the security boundary.
- `STRIPE_PUBLISHABLE_KEY`   Stripe `pk_live_...`.
- `STRIPE_PRICE_PLAN_A`      Stripe Price id for 30 leads / $100 / month.
- `STRIPE_PRICE_PLAN_B`      Stripe Price id for 15 leads / $40 / month.
- `WORKER_API_BASE`          Cloudflare Worker base URL (e.g. https://elios-api.<acct>.workers.dev).

## SECRETS that must NOT live here (Worker/Supabase config only)
- Supabase `service_role` key      -> Cloudflare Worker Secret
- Stripe secret key `sk_live_...`   -> Cloudflare Worker Secret
- Stripe webhook signing secret     -> Cloudflare Worker Secret
- Google OAuth client SECRET        -> Supabase Auth > Providers > Google (server side)

## Backend contract this frontend expects (lives in ./backend, built separately)
Supabase tables/RLS per the data model: `buyers`, `subscriptions`, `leads`, `lead_grants`,
plus the `my_leads` view and `my_entitlement()` RPC (see backend/supabase-schema.sql).
- Dashboard reads:
  - `buyers`        (RLS: id = auth.uid())
  - `subscriptions` (RLS: buyer_id = auth.uid())
  - `my_leads`      VIEW (security_invoker; the ONLY buyer path to lead PII —
    buyers have NO direct SELECT on `public.leads`, so reads must go through this view).
- Worker endpoints (authed by Supabase JWT in `Authorization: Bearer <token>`):
  - `POST /api/create-checkout-session`  body `{ plan: "plan_a" | "plan_b" }` -> `{ url }`
  - `POST /api/create-portal-session`    -> `{ url }`
  Note: the Worker derives the Stripe price + success/cancel URLs server-side from
  its env, so only `plan` in the request body is load-bearing.

## Auth provider setup (one-time, outside this repo)
- Supabase Auth: enable Email (password + magic link) and Google provider.
  Add redirect URL `https://tools.trackingtogether.com/elios/dashboard.html`
  (and the GitHub Pages origin) to Auth > URL Configuration > Redirect URLs.
- Google Cloud OAuth consent + client: authorized redirect URI is the Supabase
  callback `https://<project>.supabase.co/auth/v1/callback`.

No em-dashes used. No live secrets committed.
