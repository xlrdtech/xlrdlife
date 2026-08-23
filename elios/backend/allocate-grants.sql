-- =====================================================================
-- EliOS — monthly grant allocator as a Postgres function (ALTERNATIVE)
-- =====================================================================
-- Pure-DB version of the allocator. Use this instead of (or in addition to)
-- the JS allocator if you prefer to schedule with Supabase pg_cron and keep
-- the logic in the database. The row-level locking (FOR UPDATE SKIP LOCKED)
-- makes concurrent runs safe and avoids double-granting a lead.
--
-- Run as the service-role / postgres owner. Buyers cannot call this
-- (it is SECURITY DEFINER and not granted to `authenticated`).
--
-- Schedule example (requires the pg_cron extension, enabled from the
-- Supabase Dashboard > Database > Extensions):
--   select cron.schedule('elios-monthly-grants', '0 8 1 * *',
--     $$ select public.allocate_grants(); $$);
-- =====================================================================

create or replace function public.allocate_grants(p_period text default to_char(now(),'YYYY-MM'))
returns table (buyer_id uuid, plan text, quota int, granted_now int, total_period int, shortfall int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_sub      record;
  v_need     int;
  v_have     int;
  v_granted  int;
  v_lead     uuid;
begin
  for r_sub in
    select s.id as sub_id, s.buyer_id, s.plan, s.monthly_quota
    from public.subscriptions s
    where s.status in ('active','trialing')
  loop
    select count(*) into v_have
      from public.lead_grants g
      where g.buyer_id = r_sub.buyer_id and g.grant_period = p_period;

    v_need := greatest(0, coalesce(r_sub.monthly_quota,0) - v_have);
    v_granted := 0;

    while v_granted < v_need loop
      -- Atomically claim the oldest available lead.
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
        values (r_sub.buyer_id, v_lead, r_sub.sub_id, p_period);
        v_granted := v_granted + 1;
      exception when unique_violation then
        -- Already granted somewhere; release and continue.
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

revoke all on function public.allocate_grants(text) from public, anon, authenticated;
