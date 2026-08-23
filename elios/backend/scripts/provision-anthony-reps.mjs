/**
 * EliOS — provision Anthony's 4 reps (2026-06-14) with a SHARED password.
 * =========================================================================
 * Anthony (via 909-638-1580) asked for FOUR rep logins, "all the same
 * password, just different usernames": Sergio, Armando, Michael, Richard.
 *
 * This is SURGICAL and SAFE vs the full-roster provision-logins.mjs:
 *   - Touches ONLY these 4 (subscribers). Never the masters (anthony/gerald
 *     keep their existing passwords — falcon27 etc. are NOT reset).
 *   - If an email already resolves to a master, it is SKIPPED (guard).
 *   - Idempotent: existing rep -> password reset to the shared pw; new -> created.
 *   - email_confirm=true so they sign in immediately (no mail needed).
 *   - role='subscriber' stamped in user_metadata -> handle_new_user() trigger
 *     creates the buyers row RLS-scoped (they see ONLY assigned leads).
 *
 * SECRETS COME FROM ENV ONLY — nothing sensitive is committed:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELIOS_REP_PASSWORD
 *
 * Run (service-role is a Cloudflare Worker secret by design; paste it at runtime):
 *   cd elios/backend && npm install   # once (@supabase/supabase-js)
 *   SUPABASE_URL=https://jftakowpjkbcqpvtgwgq.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   ELIOS_REP_PASSWORD='<shared password>' \
 *   node scripts/provision-anthony-reps.mjs [--dry-run]
 *
 * Then apply role/RLS via supabase-schema.sql if not already (it is, portal live).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REP_PASSWORD = process.env.ELIOS_REP_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE || !REP_PASSWORD) {
  console.error(
    'Missing env. Need all three (service-role is Worker-only by design — paste at runtime):\n' +
    '  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELIOS_REP_PASSWORD'
  );
  process.exit(1);
}

const DOMAIN = 'trackingtogether.com';
const REPS = ['Sergio', 'Armando', 'Michael', 'Richard'].map((n) => ({
  full_name: n,
  username: n.toLowerCase(),
  email: `${n.toLowerCase()}@${DOMAIN}`,
  role: 'subscriber',
}));

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
  console.log(`EliOS — Anthony reps provisioner${DRY_RUN ? ' (DRY RUN)' : ''} -> ${SUPABASE_URL}`);
  const results = [];
  for (const u of REPS) {
    try {
      const meta = { full_name: u.full_name, username: u.username, role: 'subscriber', must_change_password: false };
      const existing = await findUserByEmail(u.email);

      if (existing && existing.user_metadata?.role === 'master') {
        results.push({ ...u, action: 'SKIP (is master — left untouched)' });
        continue;
      }
      if (DRY_RUN) {
        results.push({ ...u, action: existing ? 'would reset pw' : 'would create' });
        continue;
      }
      if (existing) {
        const { error } = await db.auth.admin.updateUserById(existing.id, {
          password: REP_PASSWORD,
          email_confirm: true,
          user_metadata: { ...existing.user_metadata, ...meta },
        });
        if (error) throw new Error(error.message);
        results.push({ ...u, action: 'reset-pw (existing)' });
      } else {
        const { error } = await db.auth.admin.createUser({
          email: u.email,
          password: REP_PASSWORD,
          email_confirm: true,
          user_metadata: meta,
        });
        if (error) throw new Error(error.message);
        results.push({ ...u, action: 'created' });
      }
    } catch (e) {
      results.push({ ...u, action: 'ERROR', error: e.message });
    }
  }

  console.log('\n=== Result (login = username @ ' + DOMAIN + ', shared password from env) ===');
  for (const r of results) {
    console.log(`  ${r.username.padEnd(9)} ${r.email.padEnd(34)} ${r.action}${r.error ? ' — ' + r.error : ''}`);
  }
  const ok = results.filter((r) => ['created', 'reset-pw (existing)'].includes(r.action)).length;
  console.log(`\n${ok}/${REPS.length} provisioned as subscribers (RLS-isolated). Masters untouched.`);
  console.log('They sign in at the portal with their USERNAME + the shared password; RLS shows each only assigned leads.');
  if (results.some((r) => r.action === 'ERROR')) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
