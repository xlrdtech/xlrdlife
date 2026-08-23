-- ============================================================
-- 2026-06-13: FIX soft-retire leak (audit HIGH). A retired lead
-- must disappear from the subscriber side too. Previously my_leads,
-- leads_select_granted, and update_my_lead ignored status, so a
-- retired-but-still-granted lead stayed visible + editable to the
-- subscriber while the master saw it as gone.
-- ============================================================

-- my_leads: exclude retired
drop view if exists public.my_leads cascade;
create view public.my_leads
with (security_invoker = true) as
select
  l.id, l.name, l.phone, l.email, l.address, l.project_type, l.event, l.rep,
  l.pipeline_stage, l.quality_score, l.block_value, l.value_basis, l.notes,
  g.grant_period, g.granted_at
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid())
  and l.status <> 'retired';
grant select on public.my_leads to authenticated;

-- subscriber SELECT policy: a granted lead is only readable while not retired
drop policy if exists leads_select_granted on public.leads;
create policy leads_select_granted on public.leads
  for select to authenticated
  using (
    status <> 'retired' and exists (
      select 1 from public.lead_grants g
      where g.lead_id = leads.id and g.buyer_id = auth.uid()
    )
  );

-- update_my_lead: refuse to edit a retired lead (join leads, check status)
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
    join public.leads l on l.id = g.lead_id
    where g.lead_id = p_lead_id
      and g.buyer_id = (select auth.uid())
      and l.status <> 'retired'
  ) then
    raise exception 'update_my_lead: lead % is not available to you', p_lead_id using errcode = '42501';
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
