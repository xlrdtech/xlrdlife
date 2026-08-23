/**
 * Monthly lead-grant allocator
 * ============================
 * For each buyer with an ACTIVE/TRIALING subscription, top their grants for the
 * current billing month (YYYY-MM) up to monthly_quota by assigning leads that
 * are still 'available' from the Lead Master. Each assigned lead is marked
 * 'granted' so it is never double-sold (the lead_grants UNIQUE(lead_id) is the
 * hard guarantee; this is the fast path).
 *
 * Idempotent: re-running in the same month only fills the REMAINING quota.
 * Safe to run on a cron (1st of month) and/or on-demand after a new signup.
 *
 * Imported by src/worker.js. Uses the service-role Supabase client (RLS bypass).
 */
import { createClient } from '@supabase/supabase-js';

function admin(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function currentPeriod(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Allocate for ALL active buyers. Returns a per-buyer summary.
 */
export async function allocateAllGrants(env) {
  const db = admin(env);
  const period = currentPeriod();

  // Active entitlements only.
  const { data: subs, error: subErr } = await db
    .from('subscriptions')
    .select('id, buyer_id, plan, monthly_quota, status')
    .in('status', ['active', 'trialing']);
  if (subErr) throw new Error(`load subscriptions: ${subErr.message}`);

  const results = [];
  for (const sub of subs || []) {
    results.push(await allocateForBuyer(db, sub, period));
  }
  return { period, buyers: results.length, results };
}

/**
 * Top up one buyer to quota for the period. Assigns leads one-at-a-time using
 * an atomic conditional update (status available->granted) so two concurrent
 * runs can never grant the same lead twice.
 */
export async function allocateForBuyer(db, sub, period) {
  // How many already granted this period?
  const { count: alreadyGranted, error: cntErr } = await db
    .from('lead_grants')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', sub.buyer_id)
    .eq('grant_period', period);
  if (cntErr) throw new Error(`count grants: ${cntErr.message}`);

  const need = Math.max(0, (sub.monthly_quota || 0) - (alreadyGranted || 0));
  if (need === 0) {
    return { buyer_id: sub.buyer_id, plan: sub.plan, quota: sub.monthly_quota, granted_now: 0, total_period: alreadyGranted || 0 };
  }

  let grantedNow = 0;
  // Pull a candidate batch a bit larger than `need` to absorb race losses.
  const batch = Math.min(need * 2 + 5, 200);

  while (grantedNow < need) {
    const { data: candidates, error: candErr } = await db
      .from('leads')
      .select('id')
      .eq('status', 'available')
      .order('created_at', { ascending: true })
      .limit(batch);
    if (candErr) throw new Error(`load candidates: ${candErr.message}`);
    if (!candidates || candidates.length === 0) break; // inventory exhausted

    for (const lead of candidates) {
      if (grantedNow >= need) break;

      // Atomic claim: only succeeds if the lead is STILL available.
      const { data: claimed, error: claimErr } = await db
        .from('leads')
        .update({ status: 'granted' })
        .eq('id', lead.id)
        .eq('status', 'available')   // optimistic guard
        .select('id');
      if (claimErr) throw new Error(`claim lead: ${claimErr.message}`);
      if (!claimed || claimed.length === 0) continue; // lost the race; try next

      const { error: grantErr } = await db.from('lead_grants').insert({
        buyer_id: sub.buyer_id,
        lead_id: lead.id,
        subscription_id: sub.id,
        grant_period: period,
      });
      if (grantErr) {
        // Unique violation (already granted) — release the lead claim and continue.
        await db.from('leads').update({ status: 'available' }).eq('id', lead.id).eq('status', 'granted');
        if (!/duplicate|unique/i.test(grantErr.message)) throw new Error(`insert grant: ${grantErr.message}`);
        continue;
      }
      grantedNow += 1;
    }
  }

  return {
    buyer_id: sub.buyer_id,
    plan: sub.plan,
    quota: sub.monthly_quota,
    granted_now: grantedNow,
    total_period: (alreadyGranted || 0) + grantedNow,
    shortfall: Math.max(0, need - grantedNow), // >0 means Lead Master ran dry
  };
}
