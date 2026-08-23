-- =====================================================================
-- EliOS — Buyer Portal schema (Supabase / Postgres)
-- Project suggestion: "elios-buyer-portal"  (NEW dedicated Supabase project)
-- =====================================================================
-- Source of truth for AUTH (Supabase Auth / GoTrue manages auth.users) and
-- ENTITLEMENT (subscriptions + lead_grants). Stripe is the billing source of
-- truth; the Cloudflare Worker mirrors Stripe state into here via service-role.
--
-- SECURITY MODEL
--   * RLS is ENABLED on every public table.
--   * A buyer can read ONLY their own profile, their own subscription, and
--     the leads that have been GRANTED to them (via lead_grants -> leads).
--   * Buyers can NEVER read the leads table directly (no SELECT policy for
--     `authenticated`); they only see granted leads through the
--     `my_leads` view, which is itself RLS-bounded by lead_grants.
--   * All writes to subscriptions / leads / lead_grants are service-role only
--     (the Worker). Clients have no write path to entitlement data.
--
-- Run order: paste the whole file into the Supabase SQL editor, OR
--   supabase db push   (if using the Supabase CLI with this as a migration)
-- Idempotent: safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. buyers  (1:1 profile with auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.buyers (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  company             text,
  stripe_customer_id  text unique,                 -- set on first checkout by the Worker
  created_at          timestamptz not null default now()
);

comment on table public.buyers is
  'Buyer profile, 1:1 with auth.users. Row auto-created by trigger on auth.users signup.';

-- ---------------------------------------------------------------------
-- 2. subscriptions  (mirrors Stripe; one active row per buyer expected)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  buyer_id                uuid not null references public.buyers(id) on delete cascade,
  stripe_subscription_id  text unique not null,
  stripe_price_id         text not null,                        -- maps to Plan A or Plan B
  plan                    text not null check (plan in ('plan_a','plan_b')),
  status                  text not null
                            check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  monthly_quota           int  not null,                        -- 30 for A, 15 for B (denormalized; adjustable)
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_buyer_id_idx on public.subscriptions(buyer_id);
create index if not exists subscriptions_status_idx    on public.subscriptions(status);

comment on table public.subscriptions is
  'Stripe subscription mirror. Written ONLY by the Worker (service-role) from Stripe webhooks. Entitlement = status in (active,trialing).';

-- ---------------------------------------------------------------------
-- 3. leads  (the 520 from Asana "Lead Master" / NotebookLM "Eli Leads")
-- ---------------------------------------------------------------------
-- Field names align to the live eliops/leads.json export shape:
--   {id, name, phone, service, event, status, rep, added, notes}
-- 'service'  -> project_type
-- 'status'   -> pipeline_stage (Asana stage / disposition)
-- We keep both a source_ref (the numeric id from leads.json) and asana_gid
-- (the Asana task GID) so sync is idempotent from either source.
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  asana_gid       text unique,                       -- Asana task GID (idempotent Asana sync)
  source_ref      text unique,                       -- numeric id from eliops/leads.json (idempotent JSON sync)
  name            text,
  phone           text,
  email           text,
  address         text,
  project_type    text,                              -- e.g. Kitchen, Roofing, Solar, Windows
  event           text,                              -- where the lead was captured (e.g. "Taste of Placentia")
  rep             text,                              -- originating rep, if any
  pipeline_stage  text,                              -- Asana stage / disposition (New, Follow Up, Attempted...)
  quality_score   int,
  notes           text,
  status          text not null default 'available'  -- available | granted | retired
                    check (status in ('available','granted','retired')),
  source          text not null default 'asana_lead_master',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists leads_status_idx       on public.leads(status);
create index if not exists leads_project_type_idx on public.leads(project_type);

comment on table public.leads is
  'Master lead inventory synced in from Asana Lead Master / leads.json. NOT buyer-owned. No RLS SELECT for authenticated — buyers reach leads only through lead_grants/my_leads.';

-- ---------------------------------------------------------------------
-- 4. lead_grants  (buyer <-> lead; THE per-month entitlement / access record)
-- ---------------------------------------------------------------------
create table if not exists public.lead_grants (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  lead_id         uuid not null references public.leads(id)  on delete cascade,
  subscription_id uuid references public.subscriptions(id)   on delete set null,
  grant_period    text not null,                     -- 'YYYY-MM' billing month the grant counts against
  granted_at      timestamptz not null default now(),
  unique (buyer_id, lead_id),                         -- a lead is granted to a buyer at most once
  unique (lead_id)                                    -- a lead is exclusive: granted to at most ONE buyer ever
);

create index if not exists lead_grants_buyer_id_idx on public.lead_grants(buyer_id);
create index if not exists lead_grants_period_idx   on public.lead_grants(buyer_id, grant_period);

comment on table public.lead_grants is
  'Access join: which buyer may read which lead, and which billing month it counted against. Written ONLY by the Worker grant allocator (service-role). The UNIQUE(lead_id) makes each lead exclusive to one buyer.';

-- ---------------------------------------------------------------------
-- 5. Trigger: auto-create buyers row on auth.users signup
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.buyers (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 7. ROW-LEVEL SECURITY
-- =====================================================================
alter table public.buyers        enable row level security;
alter table public.subscriptions enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_grants   enable row level security;

-- Force RLS even for the table owner (defense in depth; service-role bypasses RLS by design).
alter table public.buyers        force row level security;
alter table public.subscriptions force row level security;
alter table public.leads         force row level security;
alter table public.lead_grants   force row level security;

-- ---- buyers ----------------------------------------------------------
drop policy if exists buyers_select_own on public.buyers;
create policy buyers_select_own on public.buyers
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists buyers_update_own on public.buyers;
create policy buyers_update_own on public.buyers
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- NOTE: no INSERT/DELETE policy for authenticated. Insert happens via the
-- SECURITY DEFINER signup trigger; the service-role (Worker) bypasses RLS.

-- ---- subscriptions ---------------------------------------------------
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (buyer_id = (select auth.uid()));
-- NO insert/update/delete policy for authenticated => only service-role writes.

-- ---- leads -----------------------------------------------------------
-- INTENTIONALLY NO policy granting SELECT to `authenticated`.
-- Buyers cannot read public.leads directly. Service-role (Asana sync,
-- grant allocator) bypasses RLS, so it still has full access.

-- ---- lead_grants -----------------------------------------------------
drop policy if exists lead_grants_select_own on public.lead_grants;
create policy lead_grants_select_own on public.lead_grants
  for select to authenticated
  using (buyer_id = (select auth.uid()));
-- NO insert/update/delete policy for authenticated => only the allocator writes.

-- =====================================================================
-- 8. my_leads — the ONLY way a buyer reads lead detail
-- =====================================================================
-- A security_invoker view: it runs with the caller's privileges, so the
-- lead_grants RLS policy above scopes rows to the calling buyer. Because
-- the buyer has no SELECT on leads, the join is allowed only for leads
-- reachable through their own grants (security_invoker + RLS on the join).
-- Buyers query:  select * from my_leads;
drop view if exists public.my_leads cascade;
create view public.my_leads
with (security_invoker = true) as
select
  l.id,
  l.name,
  l.phone,
  l.email,
  l.address,
  l.project_type,
  l.event,
  l.pipeline_stage,
  l.quality_score,
  l.notes,
  g.grant_period,
  g.granted_at
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid());

comment on view public.my_leads is
  'Buyer-facing view of granted leads. security_invoker=true so lead_grants RLS scopes rows to auth.uid(). This is the only buyer path to lead PII.';

grant select on public.my_leads to authenticated;

-- =====================================================================
-- 9. Helper: current entitlement summary for the logged-in buyer
-- =====================================================================
-- Lets the portal show "X of N leads used this month" without exposing
-- the leads table. SECURITY INVOKER so RLS still applies.
create or replace function public.my_entitlement()
returns table (
  plan            text,
  status          text,
  monthly_quota   int,
  granted_this_period bigint,
  period_label    text,
  current_period_end timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with sub as (
    select * from public.subscriptions
    where buyer_id = (select auth.uid())
    order by (status in ('active','trialing')) desc, updated_at desc
    limit 1
  )
  select
    sub.plan,
    sub.status,
    sub.monthly_quota,
    (select count(*) from public.lead_grants g
       where g.buyer_id = (select auth.uid())
         and g.grant_period = to_char(now(),'YYYY-MM')),
    to_char(now(),'YYYY-MM'),
    sub.current_period_end
  from sub;
$$;

grant execute on function public.my_entitlement() to authenticated;

-- =====================================================================
-- 10. Plan reference (documentation; quota is denormalized onto subscriptions)
-- =====================================================================
--   plan_a : Stripe price STRIPE_PRICE_PLAN_A  -> $100/mo -> monthly_quota 30
--   plan_b : Stripe price STRIPE_PRICE_PLAN_B  -> $40/mo  -> monthly_quota 15
-- The Worker maps stripe_price_id -> (plan, monthly_quota) at webhook time.
-- =====================================================================


-- #####################################################################
-- #  MIGRATION 2026-06-12 — ROLE MODEL (MASTERS vs SUBSCRIBERS)
-- #####################################################################
-- Purpose (qi 2026-06-12): two tiers on top of the existing buyer portal.
--
--   MASTERS (role='master')  — admin/operators. May:
--       * SELECT ALL leads (via admin view all_leads + a leads SELECT policy)
--       * SELECT ALL buyers (the roster) and ALL lead_grants
--       * INSERT / DELETE lead_grants for ANY buyer (assign / revoke leads)
--       * call the assign_leads() RPC to hand leads to a subscriber
--     Roster: Anthony (Vasquez), Gerald.
--
--   SUBSCRIBERS (role='subscriber', the DEFAULT) — unchanged behavior. May:
--       * read ONLY their own buyers row, own subscription, own lead_grants
--       * see lead PII ONLY through my_leads (RLS-scoped to auth.uid())
--     Roster: Nancy, Michael Sell, Sergio, Richard, Rossalyn, Michael Krebbs.
--
-- This block is ADDITIVE and IDEMPOTENT (safe to re-run). It does NOT alter
-- the quota logic, the allocator, my_leads, my_entitlement, or any existing
-- subscriber policy. It only ADDS a role column, helper, master policies,
-- the assign_leads RPC, and the all_leads admin view.
--
-- Run order: paste AFTER the original schema above (or run standalone against
-- a DB that already has the original schema). No live secrets here.
-- #####################################################################

-- ---------------------------------------------------------------------
-- 11. buyers.role  — the tier flag
-- ---------------------------------------------------------------------
alter table public.buyers
  add column if not exists role text not null default 'subscriber';

-- Add the CHECK constraint idempotently (ADD CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'buyers_role_check'
      and conrelid = 'public.buyers'::regclass
  ) then
    alter table public.buyers
      add constraint buyers_role_check check (role in ('master','subscriber'));
  end if;
end $$;

create index if not exists buyers_role_idx on public.buyers(role);

comment on column public.buyers.role is
  'Authorization tier: master (admin: see ALL leads/buyers, assign grants, manage roster) or subscriber (RLS-scoped to own data). Default subscriber.';

-- ---------------------------------------------------------------------
-- 12. is_master()  — recursion-safe role check for use inside RLS
-- ---------------------------------------------------------------------
-- A master's RLS policy on buyers needs to read the caller's own role from
-- buyers. Doing that with a plain subquery inside a buyers policy would be
-- self-referential and recurse. So we read the role in a SECURITY DEFINER
-- helper that runs as the function owner and therefore bypasses RLS on
-- buyers for this single, narrow lookup. Returns true iff the current
-- authenticated user is a master.
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.buyers b
    where b.id = (select auth.uid())
      and b.role = 'master'
  );
$$;

revoke all on function public.is_master() from public, anon;
grant execute on function public.is_master() to authenticated;

comment on function public.is_master() is
  'True iff auth.uid() is a master. SECURITY DEFINER so it can read buyers.role without tripping buyers RLS recursion. Used as a guard in master policies and the assign_leads RPC.';

-- =====================================================================
-- 13. MASTER row-level security policies (additive; subscriber policies stand)
-- =====================================================================
-- Each master policy is OR-ed with the existing *_select_own subscriber
-- policies by Postgres (permissive policies are unioned). A subscriber gets
-- their own rows; a master additionally gets everyone's rows. Service-role
-- (the Worker) still bypasses RLS entirely.

-- ---- buyers: masters read the whole roster --------------------------
drop policy if exists buyers_select_master on public.buyers;
create policy buyers_select_master on public.buyers
  for select to authenticated
  using (public.is_master());

-- ---- leads: masters read the entire lead inventory ------------------
-- (Subscribers still have NO direct SELECT on leads — they use my_leads.)
drop policy if exists leads_select_master on public.leads;
create policy leads_select_master on public.leads
  for select to authenticated
  using (public.is_master());

-- ---- lead_grants: masters read ALL grants (full assignment board) ---
drop policy if exists lead_grants_select_master on public.lead_grants;
create policy lead_grants_select_master on public.lead_grants
  for select to authenticated
  using (public.is_master());

-- ---- lead_grants: masters may INSERT a grant for ANY buyer (assign) -
drop policy if exists lead_grants_insert_master on public.lead_grants;
create policy lead_grants_insert_master on public.lead_grants
  for insert to authenticated
  with check (public.is_master());

-- ---- lead_grants: masters may DELETE any grant (revoke / reassign) --
drop policy if exists lead_grants_delete_master on public.lead_grants;
create policy lead_grants_delete_master on public.lead_grants
  for delete to authenticated
  using (public.is_master());

-- ---------------------------------------------------------------------
-- 14. assign_leads(p_subscriber, p_lead_ids[])  — master-only RPC
-- ---------------------------------------------------------------------
-- Atomically hands a set of leads to one subscriber. SECURITY DEFINER so it
-- can flip leads.status and write lead_grants regardless of the caller's own
-- table privileges, BUT it self-guards: the FIRST thing it does is verify the
-- caller is a master (is_master()), raising otherwise. Not granted to anon.
--
-- Semantics:
--   * recipient must exist and be a 'subscriber' (masters are not lead buyers).
--   * each lead must currently be status='available'; rows that are already
--     granted/retired or already in lead_grants are SKIPPED (not errored), so
--     the call is partial-safe and idempotent. FOR UPDATE SKIP LOCKED keeps it
--     concurrency-safe alongside the monthly allocator.
--   * grant_period defaults to the current 'YYYY-MM' (counts toward quota).
--   * returns the lead_ids actually assigned this call.
create or replace function public.assign_leads(
  p_subscriber uuid,
  p_lead_ids   uuid[],
  p_period     text default to_char(now(),'YYYY-MM')
)
returns table (assigned_lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text;
  v_lead      uuid;
  v_locked    uuid;
begin
  -- 1) Authorization: master only.
  if not public.is_master() then
    raise exception 'assign_leads: forbidden (caller is not a master)'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  -- 2) Recipient must be an existing subscriber (never assign to a master).
  select role into v_role from public.buyers where id = p_subscriber;
  if v_role is null then
    raise exception 'assign_leads: subscriber % not found', p_subscriber
      using errcode = 'P0002';
  end if;
  if v_role <> 'subscriber' then
    raise exception 'assign_leads: recipient % is not a subscriber (role=%)', p_subscriber, v_role
      using errcode = '22023';
  end if;

  -- 3) Walk the requested leads; claim only the ones still available.
  foreach v_lead in array coalesce(p_lead_ids, '{}'::uuid[])
  loop
    select l.id into v_locked
      from public.leads l
      where l.id = v_lead
        and l.status = 'available'
      for update skip locked
      limit 1;

    continue when v_locked is null;  -- not available / locked / unknown -> skip

    update public.leads set status = 'granted' where id = v_locked;

    begin
      insert into public.lead_grants (buyer_id, lead_id, subscription_id, grant_period)
      values (
        p_subscriber,
        v_locked,
        -- best-effort link to the recipient's active subscription, if any
        (select s.id from public.subscriptions s
           where s.buyer_id = p_subscriber
             and s.status in ('active','trialing')
           order by s.updated_at desc
           limit 1),
        p_period
      );
      assigned_lead_id := v_locked;
      return next;
    exception when unique_violation then
      -- Already granted (race or pre-existing); release the status flip we did.
      update public.leads set status = 'available'
        where id = v_locked and status = 'granted';
    end;

    v_locked := null;
  end loop;
end;
$$;

-- Master-only at the SQL layer too: callable by authenticated (the body
-- re-checks is_master()), never by anon/public.
revoke all on function public.assign_leads(uuid, uuid[], text) from public, anon;
grant execute on function public.assign_leads(uuid, uuid[], text) to authenticated;

comment on function public.assign_leads(uuid, uuid[], text) is
  'Master-only RPC. Assigns available leads to a subscriber: guards is_master(), verifies recipient is a subscriber, flips leads.status->granted and writes lead_grants (skipping unavailable/duplicate leads). Concurrency-safe (FOR UPDATE SKIP LOCKED). Returns lead_ids actually assigned.';

-- =====================================================================
-- 15. all_leads — masters-only admin view of the FULL lead inventory
-- =====================================================================
-- security_invoker=true so the leads_select_master RLS policy (is_master())
-- is what actually gates rows: a master sees every lead; a subscriber sees
-- ZERO rows (no leads SELECT policy applies to them). Includes the current
-- assignment (which subscriber holds the lead) for the assignment board.
drop view if exists public.all_leads cascade;
create view public.all_leads
with (security_invoker = true) as
select
  l.id,
  l.asana_gid,
  l.source_ref,
  l.name,
  l.phone,
  l.email,
  l.address,
  l.project_type,
  l.event,
  l.rep,
  l.pipeline_stage,
  l.quality_score,
  l.notes,
  l.status,
  l.source,
  l.created_at,
  l.updated_at,
  g.buyer_id      as assigned_buyer_id,
  b.full_name     as assigned_buyer_name,
  b.email         as assigned_buyer_email,
  g.grant_period  as assigned_period,
  g.granted_at    as assigned_at
from public.leads l
left join public.lead_grants g on g.lead_id = l.id
left join public.buyers     b on b.id = g.buyer_id;

comment on view public.all_leads is
  'Masters-only admin view of EVERY lead plus its current assignee. security_invoker=true => leads_select_master RLS (is_master()) gates rows; subscribers see nothing. Service-role bypasses RLS as usual.';

grant select on public.all_leads to authenticated;

-- ---------------------------------------------------------------------
-- 16. handle_new_user — honor a role from signup metadata (additive)
-- ---------------------------------------------------------------------
-- Replaces the function body so a buyer provisioned with
-- raw_user_meta_data.role = 'master' is created as a master; everyone else
-- defaults to 'subscriber'. Idempotent (CREATE OR REPLACE). Existing rows are
-- unaffected; set masters explicitly via the seed in note 17.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.buyers (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when (new.raw_user_meta_data->>'role') = 'master' then 'master' else 'subscriber' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- 17. ROSTER SEED (run ONCE after the 8 users exist in auth.users)
-- =====================================================================
-- Roles are keyed off the buyer's email so this is safe to re-run. Replace
-- the example addresses with the real mailbox each person signs in with
-- (Supabase Auth identity). Anyone not listed here stays 'subscriber'.
--
--   -- MASTERS
--   update public.buyers set role = 'master'
--     where lower(email) in (
--       'anthony.vasquez@example.com',   -- Anthony Vasquez
--       'gerald@example.com'             -- Gerald
--     );
--
--   -- SUBSCRIBERS (explicit; also the default for new rows)
--   update public.buyers set role = 'subscriber'
--     where lower(email) in (
--       'nancy@example.com',             -- Nancy
--       'michael.sell@example.com',      -- Michael Sell
--       'sergio@example.com',            -- Sergio
--       'richard@example.com',           -- Richard
--       'rossalyn@example.com',          -- Rossalyn
--       'michael.krebbs@example.com'     -- Michael Krebbs
--     );
--
-- Verify:
--   select email, full_name, role from public.buyers order by role, email;
-- =====================================================================


-- #####################################################################
-- #  MIGRATION 2026-06-12b - BLOCK VALUE ($ per lead) - Anthony model
-- #####################################################################
-- Purpose (Anthony 2026-06-12 call): every lead IS a value-tagged BLOCK.
--   "every address connects to a value... $1000/2000/3000... it's got a
--    value, that's the block value."
-- The $ figure is derived from property worth + improvement potential
-- (e.g. paint $1000, roof $3000). A master SETS/edits each lead's block
-- value; subscribers see the worth of each block assigned to them plus
-- their total portfolio value.
--
-- This block is ADDITIVE and IDEMPOTENT (safe to re-run). It does NOT alter
-- quota logic, the allocator, assign_leads, the role model, or any existing
-- policy. It ADDS two columns to leads, exposes them on all_leads + my_leads,
-- and adds a master-only update policy so masters can set a lead's value.
-- No live secrets here.
-- #####################################################################

-- ---------------------------------------------------------------------
-- 18. leads.block_value + leads.value_basis  - the $ worth of the block
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists block_value numeric(12,2) not null default 0;

alter table public.leads
  add column if not exists value_basis text;

comment on column public.leads.block_value is
  'Anthony block-value model: the $ worth of this lead/block, derived from property worth + improvement potential (e.g. 1000/2000/3000). Set/edited by a master. Subscribers see the value of each block assigned to them.';

comment on column public.leads.value_basis is
  'Optional human-readable breakdown of how block_value was derived, e.g. "paint/$1000, roof/$3000". Free text, master-authored.';

create index if not exists leads_block_value_idx on public.leads(block_value);

-- ---------------------------------------------------------------------
-- 19. leads: masters may UPDATE a lead (set/edit block_value, value_basis)
-- ---------------------------------------------------------------------
-- Subscribers still have NO write path to leads. Service-role bypasses RLS.
-- This permissive UPDATE policy lets the master console write block_value /
-- value_basis straight through the anon client under the caller's master JWT.
drop policy if exists leads_update_master on public.leads;
create policy leads_update_master on public.leads
  for update to authenticated
  using (public.is_master())
  with check (public.is_master());

-- =====================================================================
-- 20. all_leads - re-expose with block_value + value_basis (additive)
-- =====================================================================
-- CREATE OR REPLACE keeps the same masters-only gating (security_invoker +
-- leads_select_master). Adds the two value columns so the admin pool can
-- show each block's $ and the running total assigned per subscriber.
drop view if exists public.all_leads cascade;
create view public.all_leads
with (security_invoker = true) as
select
  l.id,
  l.asana_gid,
  l.source_ref,
  l.name,
  l.phone,
  l.email,
  l.address,
  l.project_type,
  l.event,
  l.rep,
  l.pipeline_stage,
  l.quality_score,
  l.block_value,
  l.value_basis,
  l.notes,
  l.status,
  l.source,
  l.created_at,
  l.updated_at,
  g.buyer_id      as assigned_buyer_id,
  b.full_name     as assigned_buyer_name,
  b.email         as assigned_buyer_email,
  g.grant_period  as assigned_period,
  g.granted_at    as assigned_at
from public.leads l
left join public.lead_grants g on g.lead_id = l.id
left join public.buyers     b on b.id = g.buyer_id;

-- =====================================================================
-- 21. my_leads - re-expose with block_value + value_basis (additive)
-- =====================================================================
-- CREATE OR REPLACE keeps security_invoker=true so lead_grants RLS still
-- scopes rows to auth.uid(). Adds block_value/value_basis so a subscriber
-- sees the $ worth of each assigned block and can total their portfolio.
drop view if exists public.my_leads cascade;
create view public.my_leads
with (security_invoker = true) as
select
  l.id,
  l.name,
  l.phone,
  l.email,
  l.address,
  l.project_type,
  l.event,
  l.pipeline_stage,
  l.quality_score,
  l.block_value,
  l.value_basis,
  l.notes,
  g.grant_period,
  g.granted_at
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid());

-- Re-grant (CREATE OR REPLACE preserves grants, but this is safe + explicit).
grant select on public.all_leads to authenticated;
grant select on public.my_leads  to authenticated;
-- =====================================================================

-- ============================================================
-- FIX 2026-06-13: subscriber can read leads GRANTED to them.
-- Without this, my_leads (security_invoker view joining leads)
-- returned 0 for subscribers even with valid grants, because
-- subscribers had no SELECT policy on leads (only the raw-table
-- block). Masters keep leads_select_master (all). This grants a
-- subscriber read of ONLY leads present in their own lead_grants.
-- Verified live: master assigns -> subscriber sees exactly those.
-- ============================================================
drop policy if exists leads_select_granted on public.leads;
create policy leads_select_granted on public.leads
  for select to authenticated
  using (exists (
    select 1 from public.lead_grants g
    where g.lead_id = leads.id and g.buyer_id = auth.uid()
  ));
