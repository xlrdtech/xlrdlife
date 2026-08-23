-- ============================================================
-- 2026-06-13: IN-APP LEAD EDITING.
-- Masters may INSERT + UPDATE leads (add / edit in the console).
-- No hard DELETE (qi: leads are precious) -- "removal" is a soft
-- retire via leads.status = 'retired' (already a valid status),
-- hidden from the pool but fully recoverable.
-- Subscribers may update ONLY pipeline_stage + notes, and ONLY on
-- leads granted to them, via a SECURITY DEFINER RPC.
-- All additive; existing policies/views stand.
-- ============================================================

-- ---- masters: insert new leads -----------------------------
drop policy if exists leads_insert_master on public.leads;
create policy leads_insert_master on public.leads
  for insert to authenticated
  with check (public.is_master());

-- ---- masters: update any lead ------------------------------
drop policy if exists leads_update_master on public.leads;
create policy leads_update_master on public.leads
  for update to authenticated
  using (public.is_master())
  with check (public.is_master());

-- ---- subscribers: edit stage + notes on their OWN leads ----
create or replace function public.update_my_lead(p_lead_id uuid, p_stage text, p_notes text)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.leads;
begin
  if not exists (
    select 1 from public.lead_grants g
    where g.lead_id = p_lead_id and g.buyer_id = (select auth.uid())
  ) then
    raise exception 'update_my_lead: lead % is not granted to you', p_lead_id using errcode = '42501';
  end if;
  update public.leads set
    pipeline_stage = coalesce(p_stage, pipeline_stage),
    notes          = coalesce(p_notes, notes),
    updated_at     = now()
  where id = p_lead_id
  returning * into v_row;
  return v_row;
end
$$;
revoke all on function public.update_my_lead(uuid, text, text) from public, anon;
grant execute on function public.update_my_lead(uuid, text, text) to authenticated;
comment on function public.update_my_lead is
  'Subscriber-safe edit: updates ONLY pipeline_stage + notes, ONLY on a lead granted to the caller (else 42501). SECURITY DEFINER bypasses the table write-block while self-guarding on lead_grants.';

-- ---- add rep to my_leads so the subscriber rep filter has data ----
drop view if exists public.my_leads cascade;
create view public.my_leads
with (security_invoker = true) as
select
  l.id, l.name, l.phone, l.email, l.address, l.project_type, l.event, l.rep,
  l.pipeline_stage, l.quality_score, l.block_value, l.value_basis, l.notes,
  g.grant_period, g.granted_at
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid());
grant select on public.my_leads to authenticated;
