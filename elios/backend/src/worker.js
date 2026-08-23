/**
 * EliOS Buyer Portal — Cloudflare Worker (the only place secrets live)
 * ====================================================================
 * Responsibilities:
 *   POST /api/stripe-webhook          Stripe -> verify sig -> mirror sub into Supabase
 *   POST /api/create-checkout-session (Supabase JWT) -> Stripe Checkout URL
 *   POST /api/create-portal-session   (Supabase JWT) -> Stripe Customer Portal URL
 *   POST /api/allocate-grants         (cron OR CRON_SECRET) -> fill lead_grants up to quota
 *   GET  /health                      liveness
 *
 * Also wired to scheduled() so a Cron Trigger runs the monthly allocator
 * with no inbound request (see wrangler.toml.template [triggers]).
 *
 * Secrets (wrangler secret put ... ; see .env.example):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *   STRIPE_PRICE_PLAN_A, STRIPE_PRICE_PLAN_B,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   CRON_SECRET, ALLOWED_ORIGIN
 *
 * Proven libs only:
 *   stripe (official) — used in fetch-client mode for Workers
 *   @supabase/supabase-js — service-role client (RLS bypass) for entitlement writes
 *
 * NOTE: This file holds NO secret literals. Everything comes from env bindings.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { allocateAllGrants } from './allocate-grants.js';

// price_id -> entitlement mapping. Quotas adjustable; mirror onto subscriptions.
function planFromPrice(env, priceId) {
  if (priceId && priceId === env.STRIPE_PRICE_PLAN_A) return { plan: 'plan_a', monthly_quota: 30 };
  if (priceId && priceId === env.STRIPE_PRICE_PLAN_B) return { plan: 'plan_b', monthly_quota: 15 };
  return null; // unknown price — do not guess entitlement
}

function stripeClient(env) {
  // httpClient: Stripe.createFetchHttpClient() makes the SDK Workers-compatible.
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function admin(env) {
  // Service-role client: bypasses RLS. ONLY lives here in the Worker.
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  });
}

// Verify the Supabase access token (JWT) and return the authenticated user.
async function requireBuyer(request, env) {
  const authz = request.headers.get('Authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return { error: json({ error: 'missing bearer token' }, 401, env) };

  // Ask Supabase Auth to validate the token (proven path; no hand-rolled JWT verify).
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { error: json({ error: 'invalid session' }, 401, env) };
  return { user: data.user };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, service: 'elios-buyer-portal', ts: Date.now() }, 200, env);
    }

    try {
      if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
        return await handleStripeWebhook(request, env);
      }
      if (url.pathname === '/api/create-checkout-session' && request.method === 'POST') {
        return await handleCreateCheckout(request, env);
      }
      if (url.pathname === '/api/create-portal-session' && request.method === 'POST') {
        return await handleCreatePortal(request, env);
      }
      if (url.pathname === '/api/allocate-grants' && request.method === 'POST') {
        return await handleAllocateGrants(request, env);
      }
    } catch (err) {
      return json({ error: 'internal error', detail: String(err?.message || err) }, 500, env);
    }

    return json({ error: 'not found', path: url.pathname }, 404, env);
  },

  // Cron Trigger entrypoint — runs the allocator with no inbound HTTP request.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(allocateAllGrants(env).then(
      (r) => console.log('allocate-grants cron done', JSON.stringify(r)),
      (e) => console.error('allocate-grants cron failed', e),
    ));
  },
};

// ---------------------------------------------------------------------
// 1. Stripe webhook — verify signature, mirror subscription into Supabase
// ---------------------------------------------------------------------
async function handleStripeWebhook(request, env) {
  const stripe = stripeClient(env);
  const sig = request.headers.get('stripe-signature');
  const raw = await request.text();

  let event;
  try {
    // Async variant is required in Workers (WebCrypto). Verifies HMAC sig.
    event = await stripe.webhooks.constructEventAsync(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const db = admin(env);

  switch (event.type) {
    case 'checkout.session.completed': {
      // First successful checkout: bind stripe_customer_id to the buyer.
      const s = event.data.object;
      const buyerId = s.client_reference_id || s.metadata?.buyer_id;
      const customerId = s.customer;
      if (buyerId && customerId) {
        await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', buyerId);
      }
      // The subscription itself is mirrored by the subscription.* events below.
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await upsertSubscription(db, env, stripe, sub);
      break;
    }

    case 'invoice.payment_failed': {
      // Reflect dunning state quickly (status will also arrive via subscription.updated).
      const inv = event.data.object;
      if (inv.subscription) {
        await db.from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', inv.subscription);
      }
      break;
    }

    default:
      // Ignore unhandled event types (return 200 so Stripe stops retrying).
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// Map a Stripe Subscription object -> subscriptions row (service-role write).
async function upsertSubscription(db, env, stripe, sub) {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const mapped = planFromPrice(env, priceId);
  if (!mapped) {
    console.warn('unknown price on subscription', sub.id, priceId);
  }

  // Resolve buyer by stripe_customer_id (set at checkout.session.completed).
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  let buyerId = sub.metadata?.buyer_id || null;
  if (!buyerId && customerId) {
    const { data: buyer } = await db
      .from('buyers').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    buyerId = buyer?.id || null;
  }
  if (!buyerId) {
    console.error('cannot resolve buyer for subscription', sub.id, 'customer', customerId);
    return; // 200 still returned to Stripe; nothing to mirror without a buyer
  }

  const row = {
    buyer_id: buyerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId || '',
    plan: mapped?.plan || 'plan_b',
    status: event_status(sub),
    monthly_quota: mapped?.monthly_quota ?? 0,
    current_period_start: tsOrNull(sub.current_period_start),
    current_period_end: tsOrNull(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  // Idempotent upsert keyed on the unique stripe_subscription_id.
  const { error } = await db
    .from('subscriptions')
    .upsert(row, { onConflict: 'stripe_subscription_id' });
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);
}

function event_status(sub) {
  // 'customer.subscription.deleted' arrives with status 'canceled'.
  return sub.status; // active|trialing|past_due|canceled|unpaid|incomplete|...
}
function tsOrNull(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

// ---------------------------------------------------------------------
// 2. Create Checkout Session (authenticated buyer -> hosted Stripe Checkout)
// ---------------------------------------------------------------------
async function handleCreateCheckout(request, env) {
  const auth = await requireBuyer(request, env);
  if (auth.error) return auth.error;
  const user = auth.user;

  const { plan } = await request.json().catch(() => ({}));
  const priceId = plan === 'plan_a' ? env.STRIPE_PRICE_PLAN_A
                : plan === 'plan_b' ? env.STRIPE_PRICE_PLAN_B
                : null;
  if (!priceId) return json({ error: 'invalid plan (use plan_a | plan_b)' }, 400, env);

  const stripe = stripeClient(env);
  const db = admin(env);

  // Reuse an existing Stripe customer if we already have one for this buyer.
  const { data: buyer } = await db
    .from('buyers').select('stripe_customer_id, email').eq('id', user.id).maybeSingle();

  let customerId = buyer?.stripe_customer_id || undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { buyer_id: user.id },
    });
    customerId = customer.id;
    await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const origin = env.ALLOWED_ORIGIN || 'https://tools.trackingtogether.com';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { buyer_id: user.id } },
    success_url: `${origin}/eliops/?checkout=success`,
    cancel_url: `${origin}/pay/?checkout=cancel`,
    allow_promotion_codes: true,
  });

  return json({ url: session.url }, 200, env);
}

// ---------------------------------------------------------------------
// 3. Create Customer Portal Session (cancel / upgrade / card change)
// ---------------------------------------------------------------------
async function handleCreatePortal(request, env) {
  const auth = await requireBuyer(request, env);
  if (auth.error) return auth.error;
  const user = auth.user;

  const db = admin(env);
  const { data: buyer } = await db
    .from('buyers').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  if (!buyer?.stripe_customer_id) {
    return json({ error: 'no stripe customer for this buyer yet' }, 400, env);
  }

  const stripe = stripeClient(env);
  const origin = env.ALLOWED_ORIGIN || 'https://tools.trackingtogether.com';
  const portal = await stripe.billingPortal.sessions.create({
    customer: buyer.stripe_customer_id,
    return_url: `${origin}/eliops/`,
  });

  return json({ url: portal.url }, 200, env);
}

// ---------------------------------------------------------------------
// 4. Allocate grants (HTTP-triggered variant; cron uses scheduled())
// ---------------------------------------------------------------------
async function handleAllocateGrants(request, env) {
  // Protect with a shared secret so only the cron / operator can trigger it.
  const provided = request.headers.get('X-Cron-Secret');
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
    return json({ error: 'forbidden' }, 403, env);
  }
  const result = await allocateAllGrants(env);
  return json(result, 200, env);
}

export { planFromPrice }; // exported for tests
