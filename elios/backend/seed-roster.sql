-- =====================================================================
-- EliOS - ROSTER SEED + two-tier role model (Supabase / Postgres)
-- Project: the dedicated "elios-buyer-portal" Supabase project
-- =====================================================================
-- EliOS ROLE MODEL (qi 2026-06-12): two tiers.
--
--   MASTERS (admin): see ALL leads, ASSIGN leads to subscribers, manage roster.
--     -> Anthony (Vasquez), Gerald.
--   SUBSCRIBERS: log in, see ONLY the leads assigned to them (RLS-scoped).
--     -> Nancy, Michael Sell, Sergio, Richard, Rossalyn, Michael Krebbs.
--
--   8 users total: 2 masters + 6 subscribers.
--
-- WHAT THIS FILE DOES (run AFTER supabase-schema.sql):
--   1. Adds buyers.role ('master' | 'subscriber', default 'subscriber').
--   2. Adds an is_master() helper + master-tier RLS policies so a master can
--      SELECT every lead, every grant, every buyer (subscribers stay scoped).
--   3. Adds assign_lead() / unassign_lead() RPCs - the ONLY buyer-callable path
--      that writes lead_grants. Restricted to masters; honors the existing
--      UNIQUE(lead_id) so a lead is exclusive to one subscriber.
--   4. Adds a roster_seed(email -> role) table + makes the signup trigger apply
--      the pending role on first login, so the seed works whether you run it
--      BEFORE or AFTER the users exist.
--   5. Upserts the 8 roster entries by EMAIL and applies the role to any buyer
--      row that already exists.
--
-- *** qi: replace the 8 <..._email> placeholders below with the real
--     addresses each user logs in with (Supabase invite address OR Google
--     OAuth email - they must match exactly). NO live secrets in this file. ***
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS / ON CONFLICT). Run as service-role / postgres owner in the SQL editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. buyers.role - the tier flag
-- ---------------------------------------------------------------------
alter table public.buyers
  add column if not exists role text not null default 'subscriber';

-- Enforce the allowed values (add the check only once).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'buyers_role_check'
  ) then
    alter table public.buyers
      add constraint buyers_role_check check (role in ('master','subscriber'));
  end if;
end$$;

create index if not exists buyers_role_idx on public.buyers(role);

comment on column public.buyers.role is
  'EliOS tier: master (admin: sees all leads, assigns leads, manages roster) | subscriber (sees only assigned leads, RLS-scoped). Default subscriber so a stray signup is never auto-admin.';

-- ---------------------------------------------------------------------
-- 2. is_master() - SECURITY DEFINER so the policy check itself does not
--    need a SELECT policy on buyers (avoids RLS recursion).
-- ---------------------------------------------------------------------
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.buyers b
    where b.id = (select auth.uid()) and b.role = 'master'
  );
$$;

revoke all on function public.is_master() from public, anon;
grant execute on function public.is_master() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Master-tier RLS policies (additive to the subscriber policies in
--    supabase-schema.sql; Postgres OR-combines policies of the same command).
-- ---------------------------------------------------------------------

-- buyers: a master can read the whole roster (subscribers still read only self).
drop policy if exists buyers_select_master on public.buyers;
create policy buyers_select_master on public.buyers
  for select to authenticated
  using (public.is_master());

-- leads: subscribers have NO direct lead SELECT (unchanged). A master may read
-- the entire lead inventory so the admin UI can list/assign every lead.
drop policy if exists leads_select_master on public.leads;
create policy leads_select_master on public.leads
  for select to authenticated
  using (public.is_master());

-- lead_grants: a master can see ALL grants (who has what); subscribers see
-- only their own (the *_select_own policy from the base schema).
drop policy if exists lead_grants_select_master on public.lead_grants;
create policy lead_grants_select_master on public.lead_grants
  for select to authenticated
  using (public.is_master());

-- subscriptions: a master can see all subscriptions (billing/usage overview).
drop policy if exists subscriptions_select_master on public.subscriptions;
create policy subscriptions_select_master on public.subscriptions
  for select to authenticated
  using (public.is_master());

-- NOTE: We deliberately do NOT add an authenticated INSERT/UPDATE policy on
-- lead_grants even for masters. Assignment goes through assign_lead() below,
-- a SECURITY DEFINER function, so we keep one audited, validated write path
-- (preserves the UNIQUE(lead_id) exclusivity guarantee and re-checks role).

-- ---------------------------------------------------------------------
-- 4. assign_lead() / unassign_lead() - master-only entitlement writes
-- ---------------------------------------------------------------------
-- A master assigns a specific lead to a specific subscriber. Honors the
-- exclusivity invariant: a lead belongs to at most one buyer ever. Marks the
-- lead 'granted'. grant_period defaults to the current YYYY-MM.
create or replace function public.assign_lead(
  p_lead_id   uuid,
  p_buyer_id  uuid,
  p_period    text default to_char(now(),'YYYY-MM')
)
returns public.lead_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant   public.lead_grants;
  v_sub_id  uuid;
begin
  -- Only a master may assign.
  if not public.is_master() then
    raise exception 'forbidden: only a master may assign leads' using errcode = '42501';
  end if;

  -- Target must exist and be a buyer (any tier can receive a lead, but the
  -- intended use is master -> subscriber).
  if not exists (select 1 from public.buyers where id = p_buyer_id) then
    raise exception 'unknown buyer %', p_buyer_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'unknown lead %', p_lead_id using errcode = 'P0002';
  end if;

  -- Attach the buyer's active subscription if there is one (for usage accounting).
  select s.id into v_sub_id
    from public.subscriptions s
    where s.buyer_id = p_buyer_id
    order by (s.status in ('active','trialing')) desc, s.updated_at desc
    limit 1;

  -- Claim the lead (UNIQUE(lead_id) enforces single-owner; surface a clean error).
  begin
    insert into public.lead_grants (buyer_id, lead_id, subscription_id, grant_period)
    values (p_buyer_id, p_lead_id, v_sub_id, p_period)
    returning * into v_grant;
  exception when unique_violation then
    raise exception 'lead % is already assigned', p_lead_id using errcode = '23505';
  end;

  update public.leads set status = 'granted' where id = p_lead_id;
  return v_grant;
end;
$$;

revoke all on function public.assign_lead(uuid, uuid, text) from public, anon;
grant execute on function public.assign_lead(uuid, uuid, text) to authenticated;

comment on function public.assign_lead(uuid, uuid, text) is
  'Master-only: assign one lead to one subscriber (writes lead_grants, marks lead granted). Re-checks is_master() server-side; UNIQUE(lead_id) keeps leads exclusive.';

-- Reverse an assignment: returns the lead to the available pool.
create or replace function public.unassign_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_master() then
    raise exception 'forbidden: only a master may unassign leads' using errcode = '42501';
  end if;
  delete from public.lead_grants where lead_id = p_lead_id;
  update public.leads set status = 'available' where id = p_lead_id and status = 'granted';
end;
$$;

revoke all on function public.unassign_lead(uuid) from public, anon;
grant execute on function public.unassign_lead(uuid) to authenticated;

comment on function public.unassign_lead(uuid) is
  'Master-only: release a lead back to the available pool (deletes the grant, resets lead status).';

-- ---------------------------------------------------------------------
-- 5. roster_seed - pending email->role map, applied by the signup trigger
-- ---------------------------------------------------------------------
-- This lets the seed run BEFORE the users exist: we record the intended role
-- by lowercased email; when the user first signs in (Supabase invite accepted
-- OR Google OAuth), the handle_new_user trigger reads this table and stamps
-- the role onto the new buyers row. If the user ALREADY exists, section 6
-- updates their buyers.role directly too.
create table if not exists public.roster_seed (
  email       text primary key,            -- lowercased login email
  role        text not null check (role in ('master','subscriber')),
  full_name   text,
  created_at  timestamptz not null default now()
);

comment on table public.roster_seed is
  'Intended email->role roster. Source of truth for provisioning. Consumed by handle_new_user on first login; also applied to existing buyers by this seed. Service-role only (no RLS policy for authenticated).';

alter table public.roster_seed enable row level security;
alter table public.roster_seed force row level security;
-- No authenticated policy => only service-role / SECURITY DEFINER may read/write.

-- Recreate the signup trigger so it also applies the pending role + full_name.
-- (Supersedes the version in supabase-schema.sql; keeps the same buyers insert.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_seed  public.roster_seed;
begin
  select * into v_seed from public.roster_seed where email = v_email;

  insert into public.buyers (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      v_seed.full_name
    ),
    coalesce(v_seed.role, 'subscriber')      -- default subscriber if not on the roster
  )
  on conflict (id) do update
    set role = coalesce(v_seed.role, public.buyers.role);  -- re-stamp role if reseeded
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. THE ROSTER - qi replaces the 8 placeholders, then runs this file.
-- ---------------------------------------------------------------------
-- Emails are stored lowercased to match handle_new_user's lookup.
-- Single upsert into roster_seed (pending), then a sync onto any existing
-- buyers row so re-running after users exist takes effect immediately.

with roster(full_name, role, email) as (
  values
    -- MASTERS (admin)
    ('Anthony Vasquez', 'master',     lower('<anthony_email>')),
    ('Gerald',          'master',     lower('<gerald_email>')),
    -- SUBSCRIBERS
    ('Nancy',           'subscriber', lower('<nancy_email>')),
    ('Michael Sell',    'subscriber', lower('<michael_sell_email>')),
    ('Sergio',          'subscriber', lower('<sergio_email>')),
    ('Richard',         'subscriber', lower('<richard_email>')),
    ('Rossalyn',        'subscriber', lower('<rossalyn_email>')),
    ('Michael Krebbs',  'subscriber', lower('<michael_krebbs_email>'))
)
-- 6a. record/refresh the intended roles (pending map)
, upsert_seed as (
  insert into public.roster_seed (email, role, full_name)
  select email, role, full_name from roster
  on conflict (email) do update
    set role = excluded.role, full_name = excluded.full_name
  returning email
)
-- 6b. apply to buyers that already signed up (match by lowercased email)
update public.buyers b
   set role = r.role,
       full_name = coalesce(b.full_name, r.full_name)
  from roster r
 where lower(b.email) = r.email;

-- ---------------------------------------------------------------------
-- 7. Verify (optional) - run these SELECTs after seeding to eyeball state.
-- ---------------------------------------------------------------------
--   select email, role, full_name from public.roster_seed order by role desc, email;
--   select email, role, full_name from public.buyers      order by role desc, email;  -- only rows for users who have logged in
--
-- Expect: exactly 2 master rows (Anthony, Gerald) and 6 subscriber rows in
-- roster_seed once placeholders are filled. buyers will show roles for whoever
-- has signed in so far; the rest get stamped on their first login.
-- =====================================================================
