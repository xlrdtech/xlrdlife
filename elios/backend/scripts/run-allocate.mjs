/**
 * Local / operator runner for the grant allocator.
 * Lets you fill grants on-demand (e.g. right after a new signup) without the cron.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/run-allocate.mjs
 *
 * Runs with the service-role key — operator-only, never bundled into the Worker.
 */
import { allocateAllGrants } from '../src/allocate-grants.js';

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

allocateAllGrants(env)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => { console.error(e); process.exit(1); });
