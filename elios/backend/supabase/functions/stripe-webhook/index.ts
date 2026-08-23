// EliOS — Stripe webhook (Supabase Edge Function, Deno)
// =====================================================================
// Verifies the Stripe signature, then mirrors subscription state into the
// public.subscriptions table (and binds stripe_customer_id on first checkout).
// Deploy with verify_jwt=false — Stripe authenticates via stripe-signature,
// not a Supabase JWT.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//          STRIPE_PRICE_PLAN_A, STRIPE_PRICE_PLAN_B,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const PRICE_A = Deno.env.get("STRIPE_PRICE_PLAN_A") || "";
const PRICE_B = Deno.env.get("STRIPE_PRICE_PLAN_B") || "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function planFromPrice(priceId: string | undefined) {
  if (priceId && priceId === PRICE_A) return { plan: "plan_a", monthly_quota: 30 };
  if (priceId && priceId === PRICE_B) return { plan: "plan_b", monthly_quota: 15 };
  return null;
}
const tsOrNull = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);

async function upsertSubscription(sub: Stripe.Subscription) {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const mapped = planFromPrice(priceId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  let buyerId = (sub.metadata?.buyer_id as string) || null;
  if (!buyerId && customerId) {
    const { data: buyer } = await db.from("buyers").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    buyerId = buyer?.id || null;
  }
  if (!buyerId) { console.error("cannot resolve buyer for sub", sub.id, "customer", customerId); return; }

  const row = {
    buyer_id: buyerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId || "",
    plan: mapped?.plan || "plan_b",
    status: sub.status,
    monthly_quota: mapped?.monthly_quota ?? 0,
    current_period_start: tsOrNull(sub.current_period_start),
    current_period_end: tsOrNull(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const buyerId = s.client_reference_id || (s.metadata?.buyer_id as string);
        const customerId = s.customer as string;
        if (buyerId && customerId) {
          await db.from("buyers").update({ stripe_customer_id: customerId }).eq("id", buyerId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          await db.from("subscriptions").update({ status: "past_due" })
            .eq("stripe_subscription_id", inv.subscription as string);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("webhook handler error", event.type, err);
    return new Response(JSON.stringify({ error: String((err as Error).message) }), { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
