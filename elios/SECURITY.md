# EliOS / Tracking Together Portal — SOC 2 Readiness Starter

This is a factual snapshot of the security posture of the EliOS buyer portal
(Tracking Together) as it actually stands today, plus the concrete path to a
SOC 2 attestation. It is a working document, not an attestation. Scope is the
gated `/elios/` portal, its Supabase backend, and its Stripe billing.

Last reviewed: 2026-06-15.

## System overview

- Frontend: static HTML/CSS/JS at `/elios/`, served from GitHub Pages
  (hitthe.link infra), reached at `tools.trackingtogether.com`.
- Auth + data: Supabase (project `jftakowpjkbcqpvtgwgq`). Supabase Auth
  (GoTrue) for identity; Postgres with Row-Level Security as the access
  boundary; supabase-js called directly from the browser with the anon key.
- Billing: Stripe (Tracking Together account). Checkout and webhook handling
  run as Supabase Edge Functions (`functions/v1/stripe-checkout`,
  `functions/v1/stripe-webhook`).
- DNS / edge: Cloudflare in front of `trackingtogether.com`.

Data of record is lead PII (name, contact, project type, disposition,
pipeline stage, notes) for roughly 520 leads, plus buyer accounts and
subscription state.

## Trust boundary

The browser is treated as untrusted. Nothing the browser holds is a secret:

- Public, by design, shipped to the browser in `config.js`:
  - Supabase anon / publishable key (RLS is the security boundary, not this key).
  - Stripe publishable key (`pk_live_...`).
  - Stripe Price IDs, plan catalog (display only).
- Server-side only, never in the repo or the browser:
  - Supabase `service_role` key (Supabase secrets).
  - Stripe secret key (`sk_live_...`) and webhook signing secret
    (Supabase Edge Function secrets).
  - Google OAuth client secret (Supabase Auth provider config).

The enforcement boundary is the Postgres RLS policies and the Edge Function
secrets, both of which sit server-side at Supabase. A compromised or hostile
browser can only do what the authenticated user's role and RLS already allow.

## Controls in place today

- Authentication: Supabase Auth (GoTrue). Email + password and magic link;
  Google OAuth available. Sessions are JWT-based and session-guarded on the
  gated pages.
- Authorization: Row-Level Security on Postgres. Subscribers read only their
  assigned leads via the `my_leads` view (RLS-scoped to `auth.uid()`); crew
  scope via `crew_leads`; masters gated by `is_master()` for the `all_leads`
  pool and the `assign_leads` RPC. Lead edits go through the
  `update_my_lead(p_lead_id, p_stage, p_notes)` RPC, not direct table writes.
  Subscribers have no direct SELECT on `public.leads`.
- Data residency: all lead PII lives server-side in Supabase Postgres. The
  static site ships no lead data; there is no public `leads.json`.
- Secrets management: secrets live in Supabase / Edge Function secrets, never
  in the repo. `config.js` carries public keys only. No live secret is
  committed.
- Transport: HTTPS end to end (GitHub Pages, Cloudflare, Supabase, Stripe).
- Payments: card data never touches our systems; handled by Stripe Checkout
  and the Stripe Customer Portal. We hold only the publishable key client-side.
- Backups: Supabase managed Postgres backups; the 520-lead set is additionally
  backed up out-of-band (triple-backed).
- Change management (informal today): all frontend changes are version
  controlled in git and deployed via GitHub Pages.

## Already-closed gap

The legacy `/eliops/` path is retired and redirects to the gated `/elios/`
portal. The old path shipped client-side credentials and a public `leads.json`;
both are gone. Lead PII is now reachable only through authenticated,
RLS-scoped Supabase queries.

## Subprocessors

| Subprocessor | Role | Data handled |
| --- | --- | --- |
| Supabase | Auth, Postgres database, RLS, Edge Functions | Lead PII, buyer accounts, sessions |
| Stripe | Subscription billing and payments | Buyer billing identity, card data (held by Stripe, not us) |
| GitHub (Pages) | Static frontend hosting | Public static assets only (no PII) |
| Cloudflare | DNS and edge for trackingtogether.com | Network metadata only |

## Next steps (gap list to address)

1. Enforce MFA for all privileged accounts: master/admin logins, the Supabase
   dashboard, the Stripe dashboard, GitHub, and Cloudflare.
2. Audit logging and access reviews: enable and retain Supabase auth/database
   logs; schedule a quarterly review of who holds master vs subscriber vs
   admin access, and of Supabase/Stripe/GitHub/Cloudflare account membership.
3. Data-retention and deletion policy: document how long lead PII is kept, how
   a deletion request is honored, and the offboarding flow when a subscriber
   leaves (revoke access, reassign or purge their lead grants).
4. Incident-response plan: define severity levels, an on-call owner, a
   notification path, and a written runbook for a credential leak, an RLS
   regression, or a Stripe/Supabase outage.
5. Change management: require pull-request review before deploy, keep the
   deploy trail in git, and document the rollback procedure for GitHub Pages.
6. Vendor management: maintain this subprocessor list, record each vendor's
   own SOC 2 / security posture, and review it on renewal.
7. Encryption posture: confirm at-rest encryption on Supabase and document key
   handling; reconfirm HTTPS-only across all four subprocessors.
8. Least privilege: audit Supabase service_role usage so it is confined to
   Edge Functions; confirm no broad-grant policies bypass RLS.

## Path: Type I to Type II

1. Pick the Trust Services Criteria in scope. Start with Security (Common
   Criteria); add Availability and Confidentiality as the buyer base grows.
2. Adopt a compliance automation platform (Vanta or Drata). Connect Supabase,
   Stripe, GitHub, and Cloudflare so control evidence is collected
   continuously.
3. Close the gap list above and let the platform mark each control as met.
4. Type I: an auditor attests the controls are designed correctly at a point in
   time. Targetable once the gap list is closed and evidence is wired up.
5. Type II: the same controls are shown to operate effectively over an
   observation window (commonly 3 to 12 months). Keep the automated evidence
   running through that window, then schedule the Type II audit.

No em-dashes. No live secrets in this document or the repo.
