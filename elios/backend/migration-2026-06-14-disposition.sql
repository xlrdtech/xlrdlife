-- =====================================================================
-- Migration 2026-06-14 — lead DISPOSITION (traffic-light touch states)
-- =====================================================================
-- Anthony's color model (qi/Anthony 2026-06-14, RingCentral call):
--   'sold'  -> GREEN  (deal closed)
--   'visit' -> BLUE   ("go to the house")
--   'stop'  -> RED    (STOP -- do not proceed)
-- Set by a MASTER when they "touch an account" (mirrors block_value exactly:
-- master-set, subscriber-visible). Subscribers stay READ-ONLY on leads; they
-- SEE the color of each assigned block via my_leads. Additive + idempotent;
-- safe to re-run. No new write path for subscribers; masters already have
-- leads_update_master (is_master()) which covers updating disposition.

-- 1) Column + check + index --------------------------------------------------
alter table public.leads
  add column if not exists disposition text;

do $$ begin
  alter table public.leads
    add constraint leads_disposition_check
    check (disposition is null or disposition in ('sold','visit','stop'));
exception when duplicate_object then null; end $$;

comment on column public.leads.disposition is
  'Traffic-light touch state (Anthony 2026-06-14): sold=GREEN | visit=BLUE (go to the house) | stop=RED (STOP). Master-set via leads_update_master; subscriber-visible via my_leads/all_leads.';

create index if not exists leads_disposition_idx on public.leads(disposition);

-- 2) all_leads (masters) -- re-expose WITH disposition (mirrors schema sec.20)
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
  l.disposition,
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

-- 3) my_leads (subscribers) -- re-expose WITH disposition (mirrors schema sec.21)
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
  l.disposition,
  l.notes,
  g.grant_period,
  g.granted_at
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid());

grant select on public.all_leads to authenticated;
grant select on public.my_leads  to authenticated;

-- 4) Master UPDATE path already exists (leads_update_master / is_master()),
--    so a master can set disposition on any lead. Subscribers stay read-only.

-- Verify after apply:
--   select id, name, disposition from public.all_leads limit 5;   -- as master
--   \d+ public.leads                                              -- column + check
