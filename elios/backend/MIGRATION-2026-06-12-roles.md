# Migration 2026-06-12 — Role model (masters vs subscribers)

Adds a two-tier authorization model on top of the existing EliOS buyer portal.
The change lives in `supabase-schema.sql` (section 11 onward), is additive, and
is idempotent (safe to re-run). No live secrets are introduced.

## What changed

1. `buyers.role text not null default 'subscriber'` with
   `check (role in ('master','subscriber'))` plus a `buyers_role_idx` index.
2. `is_master()` — a `security definer`, `stable` SQL function that returns true
   iff `auth.uid()` is a master. It reads `buyers.role` while bypassing RLS so a
   master policy on `buyers` does not recurse into itself.
3. New MASTER RLS policies (additive; the original subscriber `*_select_own`
   policies are untouched and union with these):
   - `buyers_select_master` — masters SELECT all buyers (the roster).
   - `leads_select_master` — masters SELECT all leads (subscribers still have
     no direct SELECT on `leads`; they keep using `my_leads`).
   - `lead_grants_select_master` — masters SELECT all grants.
   - `lead_grants_insert_master` — masters INSERT a grant for ANY buyer.
   - `lead_grants_delete_master` — masters DELETE any grant (revoke/reassign).
4. `assign_leads(p_subscriber uuid, p_lead_ids uuid[], p_period text)` — a
   `security definer` RPC that self-guards with `is_master()`, verifies the
   recipient is a `subscriber`, flips `leads.status` to `granted`, and writes
   `lead_grants`. Skips leads that are not `available` or already granted, uses
   `for update skip locked` for concurrency safety, and returns the lead ids it
   actually assigned. Granted to `authenticated`, revoked from `anon`/`public`.
5. `all_leads` — a `security_invoker` admin view of every lead plus its current
   assignee. Gated by `leads_select_master`, so masters see all rows and
   subscribers see none.
6. `handle_new_user()` updated to set `role='master'` when
   `raw_user_meta_data.role = 'master'`, else `subscriber`. Existing rows
   unaffected.
7. Roster seed (section 17, commented) keyed by email — set the masters
   (Anthony Vasquez, Gerald) explicitly; everyone else defaults to subscriber.

## What did NOT change

- Quota logic: `subscriptions.monthly_quota`, `allocate_grants()` (and the JS
  allocator), `my_entitlement()`, and `my_leads` are all unchanged.
- Subscriber behavior: a subscriber still reads only their own buyers row, own
  subscription, own grants, and lead PII only through `my_leads`.
- Lead exclusivity: `unique(lead_id)` on `lead_grants` still makes each lead
  belong to at most one buyer; `assign_leads` respects it (skip-on-conflict).
- Service-role (the Worker) still bypasses RLS for sync/allocation.

## How to apply

1. Paste the full `supabase-schema.sql` into the Supabase SQL editor (or
   `supabase db push`). The role block can also be run standalone against a DB
   that already has the original schema.
2. After the 8 users exist in `auth.users`, run the section-17 seed with the
   real sign-in emails to promote Anthony and Gerald to `master`.
3. Verify: `select email, full_name, role from public.buyers order by role, email;`

## Roster (qi 2026-06-12)

- Masters: Anthony (Vasquez), Gerald.
- Subscribers: Nancy, Michael Sell, Sergio, Richard, Rossalyn, Michael Krebbs.
- 8 users total.

## Calling assign_leads from the client (authenticated master)

```js
const { data, error } = await supabase.rpc('assign_leads', {
  p_subscriber: '<subscriber-uuid>',
  p_lead_ids: ['<lead-uuid-1>', '<lead-uuid-2>'],
  // p_period optional; defaults to current YYYY-MM
});
// data => [{ assigned_lead_id }, ...] for leads actually assigned this call
```
