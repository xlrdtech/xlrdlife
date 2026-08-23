/**
 * EliOS — provision the 'lead-images' Storage bucket + RLS policies (2026-07-01).
 * =========================================================================
 * Creates a PRIVATE bucket for project-level image uploads (invoices/logos),
 * distinct from any future profile-picture feature. Files are served via
 * short-lived signed URLs, never a public bucket.
 *
 * Path convention: {lead_id}/{uuid}-{original_filename}
 * The lead_id as the first path segment is what the Storage RLS policies
 * key off of — this is the ONLY thing that makes per-lead access work.
 *
 * Run:
 *   SUPABASE_URL=https://jftakowpjkbcqpvtgwgq.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/provision-storage.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'lead-images';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureBucket() {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const existing = (buckets || []).find((b) => b.name === BUCKET);
  if (existing) {
    console.log(`bucket '${BUCKET}' already exists (public=${existing.public})`);
    return;
  }
  const { error: createErr } = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '15MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  });
  if (createErr) throw new Error(`createBucket: ${createErr.message}`);
  console.log(`bucket '${BUCKET}' created (private, 15MB limit, image+pdf only)`);
}

// Storage policies live on storage.objects — no generic SQL-exec RPC exists
// on this project, so this just prints the SQL for the Management API /
// SQL editor to run once (see run-storage-policies.py in this same dir).
function storagePolicySQL() {
  return `
    drop policy if exists lead_images_storage_select on storage.objects;
    create policy lead_images_storage_select on storage.objects
      for select to authenticated
      using (
        bucket_id = '${BUCKET}'
        and (
          public.is_master()
          or exists (
            select 1 from public.lead_grants g
            where g.buyer_id = (select auth.uid())
              and g.lead_id::text = (storage.foldername(name))[1]
          )
        )
      );

    drop policy if exists lead_images_storage_insert on storage.objects;
    create policy lead_images_storage_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = '${BUCKET}'
        and (
          public.is_master()
          or exists (
            select 1 from public.lead_grants g
            where g.buyer_id = (select auth.uid())
              and g.lead_id::text = (storage.foldername(name))[1]
          )
        )
      );

    drop policy if exists lead_images_storage_delete on storage.objects;
    create policy lead_images_storage_delete on storage.objects
      for delete to authenticated
      using (bucket_id = '${BUCKET}' and public.is_master());
  `;
}

async function main() {
  console.log(`EliOS — Storage provisioner -> ${SUPABASE_URL}`);
  await ensureBucket();
  console.log('\nBucket ready. Storage RLS policies still need to run once via the Management API (see apply-storage-policies.py in this dir).');
}

main().catch((e) => { console.error(e); process.exit(1); });
