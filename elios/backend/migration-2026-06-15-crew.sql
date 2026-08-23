-- ============================================================================
-- migration-2026-06-15-crew.sql
-- Luminescent crew team view for /elios/ (secured mirror of the old /eliops/ panel)
--
-- Additive, idempotent, reversible. Run as the postgres/service role.
-- Project: jftakowpjkbcqpvtgwgq (Supabase Cloud)
--
-- What it does:
--   1. Adds buyers.crew text + leads.crew text (default null).
--   2. Backfills leads.crew='luminescent' WHERE lower(rep)='luminescent'.
--   3. Stamps the 4 crew members (buyers.crew='luminescent') by email.
--   4. Creates SECURITY INVOKER view crew_leads scoping leads to the caller's
--      crew (or all crews for masters).
--   5. Grants SELECT to authenticated.
--
-- Reversal block is at the bottom (commented).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns (idempotent)
-- ---------------------------------------------------------------------------
alter table public.buyers add column if not exists crew text default null;
alter table public.leads  add column if not exists crew text default null;

-- ---------------------------------------------------------------------------
-- 2) Backfill leads.crew from rep (idempotent — only fills where it differs)
-- ---------------------------------------------------------------------------
update public.leads
   set crew = 'luminescent'
 where lower(rep) = 'luminescent'
   and (crew is distinct from 'luminescent');

-- ---------------------------------------------------------------------------
-- 3) Stamp the 4 Luminescent crew members on buyers.crew, joined by email
--    via auth.users. buyers.id is the auth.users.id (uuid). This block is
--    self-contained and runs if the migration is applied with privileges to
--    read auth.users. If your apply path cannot read auth.users (e.g. running
--    through PostgREST as a limited role), skip this and run the orchestrator
--    step noted in apply_steps instead.
-- ---------------------------------------------------------------------------
update public.buyers b
   set crew = 'luminescent'
  from auth.users u
 where u.id = b.id
   and lower(u.email) in (
        'sergio@trackingtogether.com',
        'armando@trackingtogether.com',
        'michael@trackingtogether.com',
        'richard@trackingtogether.com'
   )
   and (b.crew is distinct from 'luminescent');

-- ---------------------------------------------------------------------------
-- 4) crew_leads view — SECURITY INVOKER so RLS on leads + the caller's auth
--    context are honored. Exposes the my_leads column set + rep.
--    A row is visible when:
--      - the caller is a crew member (buyers.crew not null) AND the lead's
--        crew matches the caller's crew, OR
--      - the caller is a master (is_master()).
-- ---------------------------------------------------------------------------
create or replace view public.crew_leads
with (security_invoker = true) as
select
    l.id,
    l.name,
    l.phone,
    l.address,
    l.project_type,
    l.event,
    l.rep,
    l.pipeline_stage,
    l.block_value,
    l.value_basis,
    l.disposition,
    l.status,
    l.notes,
    l.crew
  from public.leads l
 where public.is_master()
    or (
         l.crew is not null
         and l.crew = (
              select b.crew
                from public.buyers b
               where b.id = auth.uid()
                 and b.crew is not null
         )
       );

-- ---------------------------------------------------------------------------
-- 5) Grants. The view is SECURITY INVOKER, so the underlying leads RLS still
--    applies; crew scoping is enforced by the WHERE clause + auth.uid().
-- ---------------------------------------------------------------------------
grant select on public.crew_leads to authenticated;

-- ============================================================================
-- REVERSAL (run to undo this migration):
--
--   drop view if exists public.crew_leads;
--   alter table public.buyers drop column if exists crew;
--   alter table public.leads  drop column if exists crew;
--
-- (Backfilled data lives in the dropped columns, so the drop reverses it.)
-- ============================================================================

-- 2026-06-15 FIX: crew_leads is security_invoker, so crew members need a base-table
-- SELECT policy on leads (mirrors how subscribers see granted leads). Without this the
-- view returns 0 rows for crew members. Idempotent.
drop policy if exists leads_select_crew on public.leads;
create policy leads_select_crew on public.leads for select to authenticated
using (
  crew is not null
  and crew = (select b.crew from public.buyers b where b.id = (select auth.uid()))
);
