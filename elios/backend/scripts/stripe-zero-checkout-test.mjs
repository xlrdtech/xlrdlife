/**
 * Stripe $0 end-to-end checkout test helper
 * =========================================
 * Creates a 100%-off promotion code (on a reusable coupon, created if missing)
 * so you can drive a REAL subscriber through the live checkout flow at $0 and
 * verify the full chain wires up: subscriptions row + buyers.stripe_customer_id
 * + the customer portal. The Stripe Checkout function already sets
 * allow_promotion_codes: true (supabase/functions/stripe-checkout/index.ts),
 * so the promo code surfaces on the hosted checkout page automatically.
 *
 * Import-safe: this module is SIDE-EFFECT FREE on import. It only talks to
 * Stripe when run deliberately with the --apply flag:
 *   STRIPE_TT_SECRET=sk_live_... node scripts/stripe-zero-checkout-test.mjs --apply
 *
 * Without --apply it prints the manual test plan and exits (no Stripe calls):
 *   node scripts/stripe-zero-checkout-test.mjs
 *
 * Operator-only. Uses STRIPE_TT_SECRET (the Tracking Together Stripe secret),
 * never bundled into the Worker or any client.
 *
 * The `stripe` package is imported LAZILY inside apply() so importing this
 * module (e.g. for ensureCoupon/createZeroPromo in tests) costs nothing and a
 * plain dry run works even before `npm install`.
 */

// 100%-off forever coupon config. Reused across runs (lookup by id), created
// once if absent. forever => the discount persists for the life of the sub,
// keeping the recurring charge at $0 for the duration of the test account.
const COUPON_ID = 'ELIOS_TEST_100OFF';
const COUPON_NAME = 'EliOS test — 100% off (zero-dollar checkout)';

/**
 * Ensure the 100%-off coupon exists; return it. Idempotent: retrieves the
 * existing coupon by id, creates it only if missing.
 */
export async function ensureCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(COUPON_ID);
  } catch (e) {
    if (e?.code !== 'resource_missing' && e?.statusCode !== 404) throw e;
    return await stripe.coupons.create({
      id: COUPON_ID,
      name: COUPON_NAME,
      percent_off: 100,
      duration: 'forever',
    });
  }
}

/**
 * Create a fresh 100%-off promotion code on the coupon. A unique human code is
 * generated per run so you always have a clean, unredeemed code to type in.
 * Returns the created promotion_code object.
 */
export async function createZeroPromo(stripe) {
  const coupon = await ensureCoupon(stripe);
  const code = `ELIOSZERO${Date.now().toString(36).toUpperCase()}`;
  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    active: true,
    max_redemptions: 1,
    metadata: { purpose: 'elios-zero-dollar-e2e-test' },
  });
  return promo;
}

const MANUAL_STEPS = `
Manual $0 end-to-end checkout test
==================================
Prereqs: the promo code printed above (run with --apply to create one), and a
real subscriber login in Supabase Auth (role='subscriber').

1. LOG IN as a subscriber at the portal (tools.trackingtogether.com) — NOT a
   master. Masters are not lead buyers and do not check out.
2. OPEN the pricing page: /elios/pricing.html and start checkout for a plan
   (plan_a or plan_b). This calls the stripe-checkout function, which lazily
   creates a Stripe customer and sets buyers.stripe_customer_id.
3. APPLY the promo code on the hosted Stripe Checkout page (the "Add promotion
   code" field is enabled via allow_promotion_codes: true). Confirm the total
   shows $0.00, then complete checkout.
4. CONFIRM the wiring:
   a. subscriptions row — a new public.subscriptions row exists for the buyer
      with status='active' (or 'trialing'), correct plan + monthly_quota.
        select buyer_id, plan, status, monthly_quota
          from public.subscriptions order by created_at desc limit 5;
   b. buyers.stripe_customer_id — populated for that subscriber.
        select id, email, stripe_customer_id from public.buyers
          where stripe_customer_id is not null order by created_at desc limit 5;
   c. portal — back in the app, open the customer portal (action: "portal" on
      stripe-checkout). It should load the Stripe Billing portal for that
      customer (manage/cancel the subscription).
5. CLEAN UP (optional): cancel the test subscription from the portal; the promo
   code (max_redemptions: 1) is now spent — re-run with --apply for a new one.

Note: the webhook (supabase/functions/stripe-webhook) is what mirrors Stripe
into public.subscriptions, so it must be deployed + its endpoint secret set for
step 4a to populate.
`;

async function apply() {
  const secret = process.env.STRIPE_TT_SECRET;
  if (!secret) {
    console.error('Set STRIPE_TT_SECRET (Tracking Together Stripe secret) to run with --apply.');
    process.exit(1);
  }
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

  const promo = await createZeroPromo(stripe);
  console.log('Created 100%-off coupon + promotion code.');
  console.log(`  coupon:     ${COUPON_ID} (100% off, forever)`);
  console.log(`  promo code: ${promo.code}   <-- type THIS into Stripe Checkout`);
  console.log(`  promo id:   ${promo.id}`);
  console.log(MANUAL_STEPS);
}

// Run only when invoked directly with --apply. Import stays side-effect free.
const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  if (process.argv.includes('--apply')) {
    apply().catch((e) => { console.error(e); process.exit(1); });
  } else {
    console.log('Dry run (no Stripe calls). Pass --apply to create the $0 promo code.');
    console.log(MANUAL_STEPS);
  }
}
