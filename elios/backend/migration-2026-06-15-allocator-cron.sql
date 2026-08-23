-- =====================================================================
-- Migration 2026-06-15 — SQL-side monthly allocator + pg_cron schedule
-- =====================================================================
-- Purpose: move the monthly lead-grant top-up off the Cloudflare-era JS
-- allocator (src/allocate-grants.js) and into the database, scheduled by
-- pg_cron so it runs even if no Worker is deployed. Logic mirrors the JS
-- allocator and the existing public.allocate_grants(text) function EXACTLY:
--   For each subscription with status='active', grant available leads up to
--   monthly_quota into lead_grants for that buyer (idempotent, never
--   double-grant, never exceed quota).
--
-- Guarantees (same as the JS path):
--   * idempotent     — re-running in the same month fills only the REMAINING
--                      quota (counts existing grants for the period first).
--   * never double-grant — claims each lead with FOR UPDATE SKIP LOCKED and
--                      flips leads.status available->granted; the
--                      lead_grants UNIQUE(lead_id) is the hard backstop.
--   * never exceed quota — stops at greatest(0, monthly_quota - already).
--
-- ADDITIVE + IDEMPOTENT + REVERSIBLE. Uses CREATE EXTENSION IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, and a guarded cron (re)schedule. Run as the
-- service-role / postgres owner in the Supabase SQL editor. No live secrets.
--
-- Reverse: see the unschedule note in the apply steps (cron.unschedule).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions (guarded; pg_cron + pg_net live in the `extensions` schema
--    on Supabase). pg_net is enabled for parity with HTTP-invoking jobs even
--    though this SQL-side allocator does not require it.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- ---------------------------------------------------------------------
-- 1. public.allocate_grants_monthly() — the cron entry point
-- ---------------------------------------------------------------------
-- Thin monthly wrapper over the same allocation logic. Targets the CURRENT
-- billing month (to_char(now(),'YYYY-MM')) and walks every subscription with
-- status='active'. SECURITY DEFINER so it can flip leads.status and write
-- lead_grants regardless of caller privileges; NOT granted to authenticated /
-- anon (only the cron owner / service-role invokes it).
create or replace function public.allocate_grants_monthly()
returns table (buyer_id uuid, plan text, quota int, granted_now int, total_period int, shortfall int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period   text := to_char(now(),'YYYY-MM');
  r_sub      record;
  v_need     int;
  v_have     int;
  v_granted  int;
  v_lead     uuid;
begin
  for r_sub in
    select s.id as sub_id, s.buyer_id, s.plan, s.monthly_quota
    from public.subscriptions s
    where s.status = 'active'
  loop
    -- How many already granted this period? (idempotency)
    select count(*) into v_have
      from public.lead_grants g
      where g.buyer_id = r_sub.buyer_id and g.grant_period = v_period;

    v_need := greatest(0, coalesce(r_sub.monthly_quota,0) - v_have);
    v_granted := 0;

    while v_granted < v_need loop
      -- Atomically claim the oldest available lead (no double-grant).
      select l.id into v_lead
        from public.leads l
        where l.status = 'available'
        order by l.created_at asc
        for update skip locked
        limit 1;

      exit when v_lead is null;  -- inventory exhausted

      update public.leads set status = 'granted' where id = v_lead;

      begin
        insert into public.lead_grants (buyer_id, lead_id, subscription_id, grant_period)
        values (r_sub.buyer_id, v_lead, r_sub.sub_id, v_period);
        v_granted := v_granted + 1;
      exception when unique_violation then
        -- Already granted (race / pre-existing); release the status flip.
        update public.leads set status = 'available' where id = v_lead and status = 'granted';
      end;

      v_lead := null;
    end loop;

    buyer_id := r_sub.buyer_id;
    plan := r_sub.plan;
    quota := r_sub.monthly_quota;
    granted_now := v_granted;
    total_period := v_have + v_granted;
    shortfall := greatest(0, v_need - v_granted);
    return next;
  end loop;
end;
$$;

revoke all on function public.allocate_grants_monthly() from public, anon, authenticated;

comment on function public.allocate_grants_monthly() is
  'Monthly cron entry point. For each subscription status=active, tops grants for the current YYYY-MM up to monthly_quota by claiming available leads (FOR UPDATE SKIP LOCKED) and writing lead_grants. Idempotent (counts existing first), never exceeds quota, never double-grants (UNIQUE(lead_id) backstop). SECURITY DEFINER; not granted to authenticated/anon.';

-- ---------------------------------------------------------------------
-- 2. Schedule it — 1st of every month at 08:00 UTC.
-- ---------------------------------------------------------------------
-- Guarded (re)schedule: unschedule any prior job of the same name first so
-- re-running this migration does not stack duplicate jobs, then schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'elios-monthly-grants') then
    perform cron.unschedule('elios-monthly-grants');
  end if;
  perform cron.schedule(
    'elios-monthly-grants',
    '0 8 1 * *',                          -- min hour day month dow => 08:00 UTC on the 1st
    $cron$ select public.allocate_grants_monthly(); $cron$
  );
end $$;

-- Verify after apply:
--   select jobid, jobname, schedule, command, active
--     from cron.job where jobname = 'elios-monthly-grants';
--   -- dry-run the allocation now (current month):
--   select * from public.allocate_grants_monthly();
-- =====================================================================
