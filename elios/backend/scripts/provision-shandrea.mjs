/**
 * EliOS — provision Shandrea (2026-07-01), new corporate fundraising partner, SUBSCRIBER tier.
 * =========================================================================
 * Initially provisioned as master (2026-07-01), corrected by qi same day to
 * subscriber — same tier as the sales reps (RLS-scoped to assigned leads only,
 * no admin/roster/assign powers). Login: shandrea@trackingtogether.com /
 * TheFuture2026$ (per Xen-delivered transcript).
 *
 * Idempotent: existing -> password reset + role stamped subscriber; new -> created.
 *
 * Run:
 *   cd elios/backend && npm install   # once
 *   SUPABASE_URL=https://jftakowpjkbcqpvtgwgq.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   ELIOS_SHANDREA_PASSWORD='TheFuture2026$' \
 *   node scripts/provision-shandrea.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.ELIOS_SHANDREA_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE || !PASSWORD) {
  console.error(
    'Missing env. Need all three:\n' +
    '  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELIOS_SHANDREA_PASSWORD'
  );
  process.exit(1);
}

const DOMAIN = 'trackingtogether.com';
const USER = { full_name: 'Shandrea', username: 'shandrea', email: `shandrea@${DOMAIN}`, role: 'subscriber' };

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (!data.users || data.users.length < 1000) return null;
    page += 1;
  }
}

async function main() {
  console.log(`EliOS — Shandrea provisioner${DRY_RUN ? ' (DRY RUN)' : ''} -> ${SUPABASE_URL}`);
  const meta = { full_name: USER.full_name, username: USER.username, role: 'subscriber', must_change_password: false };
  const existing = await findUserByEmail(USER.email);

  if (DRY_RUN) {
    console.log(existing ? 'would reset pw + confirm subscriber role' : 'would create as subscriber');
    return;
  }

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, ...meta },
    });
    if (error) throw new Error(error.message);
    console.log(`shandrea@${DOMAIN} — reset-pw + role confirmed subscriber (existing)`);
  } else {
    const { error } = await db.auth.admin.createUser({
      email: USER.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) throw new Error(error.message);
    console.log(`shandrea@${DOMAIN} — created as subscriber`);
  }
  console.log('Sign in at the portal with username shandrea + the password. RLS-scoped to assigned leads only, same as the sales reps.');
}

main().catch((e) => { console.error(e); process.exit(1); });
