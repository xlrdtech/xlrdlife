-- #####################################################################
-- #  MIGRATION 2026-07-01 — PROJECT-LEVEL IMAGE UPLOADS (invoices/logos)
-- #####################################################################
-- Purpose (Anthony/CTO-East call 2026-07-01): TrackingTogether needs
-- permanent image uploads tied to a LEAD/PROJECT record — invoices,
-- logos, etc. Distinct from any future per-user profile picture (no
-- profile-pic feature exists yet; this is its own table/bucket so the
-- two never collide if one is added later).
--
-- Mirrors the existing role model exactly:
--   MASTERS   — upload/view/delete images on ANY lead.
--   SUBSCRIBERS — upload/view images ONLY on leads granted to them
--                 (via lead_grants, same guard as update_my_lead()).
--                 No delete for subscribers (permanent record; masters
--                 own retraction, consistent with "data precious" /
--                 soft-delete-only policy already used on leads).
--
-- This block is ADDITIVE and IDEMPOTENT (safe to re-run).
-- #####################################################################

-- ---------------------------------------------------------------------
-- 1. lead_images — one row per uploaded file, permanent record
-- ---------------------------------------------------------------------
create table if not exists public.lead_images (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  uploaded_by   uuid not null references public.buyers(id) on delete set null,
  storage_path  text not null unique,          -- path inside the 'lead-images' bucket
  kind          text not null default 'other'  -- invoice | logo | other
                  check (kind in ('invoice','logo','other')),
  file_name     text,                          -- original filename, for display
  content_type  text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create index if not exists lead_images_lead_id_idx     on public.lead_images(lead_id);
create index if not exists lead_images_uploaded_by_idx on public.lead_images(uploaded_by);

comment on table public.lead_images is
  'Permanent project-level image uploads (invoices/logos) tied to a lead. Distinct from any per-user profile picture. No hard delete via the client — masters retract via a soft path if ever needed (data precious).';

-- ---------------------------------------------------------------------
-- 2. RLS — mirrors leads_select_master / leads_select_granted exactly
-- ---------------------------------------------------------------------
alter table public.lead_images enable row level security;
alter table public.lead_images force row level security;

-- Masters: read every image row.
drop policy if exists lead_images_select_master on public.lead_images;
create policy lead_images_select_master on public.lead_images
  for select to authenticated
  using (public.is_master());

-- Subscribers: read only images on leads granted to them.
drop policy if exists lead_images_select_granted on public.lead_images;
create policy lead_images_select_granted on public.lead_images
  for select to authenticated
  using (exists (
    select 1 from public.lead_grants g
    where g.lead_id = lead_images.lead_id and g.buyer_id = (select auth.uid())
  ));

-- Masters: insert a row for any lead.
drop policy if exists lead_images_insert_master on public.lead_images;
create policy lead_images_insert_master on public.lead_images
  for insert to authenticated
  with check (public.is_master());

-- Masters: delete (retract) any image row.
drop policy if exists lead_images_delete_master on public.lead_images;
create policy lead_images_delete_master on public.lead_images
  for delete to authenticated
  using (public.is_master());

-- NOTE: no direct INSERT policy for subscribers — they write ONLY through
-- the add_lead_image() RPC below (SECURITY DEFINER, self-guards on
-- lead_grants), same pattern as update_my_lead(). No subscriber DELETE at
-- all (permanent record).

-- ---------------------------------------------------------------------
-- 3. add_lead_image() — subscriber-safe insert RPC (mirrors update_my_lead)
-- ---------------------------------------------------------------------
-- Called AFTER the file itself is uploaded to Storage (client uploads to
-- the 'lead-images' bucket first, then calls this to register the row).
-- Guards: lead must be granted to the caller OR caller must be master.
create or replace function public.add_lead_image(
  p_lead_id      uuid,
  p_storage_path text,
  p_kind         text,
  p_file_name    text,
  p_content_type text,
  p_size_bytes   bigint
)
returns public.lead_images
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.lead_images;
begin
  if not public.is_master() and not exists (
    select 1 from public.lead_grants g
    where g.lead_id = p_lead_id and g.buyer_id = (select auth.uid())
  ) then
    raise exception 'add_lead_image: lead % is not granted to you', p_lead_id
      using errcode = '42501';
  end if;

  insert into public.lead_images (lead_id, uploaded_by, storage_path, kind, file_name, content_type, size_bytes)
  values (p_lead_id, (select auth.uid()), p_storage_path, coalesce(p_kind,'other'), p_file_name, p_content_type, p_size_bytes)
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.add_lead_image(uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.add_lead_image(uuid, text, text, text, text, bigint) to authenticated;

comment on function public.add_lead_image(uuid, text, text, text, text, bigint) is
  'Subscriber-safe image registration: guards on lead_grants (or is_master()), then inserts the lead_images row. Client must upload the file to Storage bucket lead-images FIRST, then call this with the resulting storage_path.';

-- ---------------------------------------------------------------------
-- 4. lead_images exposed on all_leads / my_leads as counts (lightweight)
-- ---------------------------------------------------------------------
-- Full image lists are fetched separately (select * from lead_images where
-- lead_id = ...; RLS scopes correctly). This just adds a count so the pool
-- table can show a paperclip badge without an extra round trip.
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
  g.granted_at    as assigned_at,
  (select count(*) from public.lead_images li where li.lead_id = l.id) as image_count
from public.leads l
left join public.lead_grants g on g.lead_id = l.id
left join public.buyers     b on b.id = g.buyer_id;

grant select on public.all_leads to authenticated;

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
  g.granted_at,
  (select count(*) from public.lead_images li where li.lead_id = l.id) as image_count
from public.lead_grants g
join public.leads l on l.id = g.lead_id
where g.buyer_id = (select auth.uid());

grant select on public.my_leads to authenticated;

-- =====================================================================
-- 5. STORAGE BUCKET — run this part in the Supabase dashboard/Management
--    API, not raw SQL (bucket creation is a Storage API call). Reference
--    only; the app-level provisioning script (provision-storage.mjs) does
--    this idempotently.
--
--    Bucket: 'lead-images', PRIVATE (not public — served via signed URLs).
--    Path convention: {lead_id}/{uuid}-{original_filename}
--
--    Storage RLS (Supabase Storage policies on storage.objects), applied
--    by provision-storage.mjs:
--      - authenticated users may INSERT into lead-images IF the first path
--        segment (lead_id) is a lead granted to them, or they are master.
--      - authenticated users may SELECT (read) under the same guard.
--      - no client DELETE policy (permanent; master-only via service-role
--        if ever needed).
-- =====================================================================
