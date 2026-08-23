// EliOS — Stripe checkout + customer-portal (Supabase Edge Function, Deno)
// =====================================================================
// Ports the Cloudflare Worker checkout/portal handlers to Supabase Edge.
// Routes (POST, by `action` in JSON body):
//   { action: "checkout", plan: "plan_a" | "plan_b" }  -> hosted Stripe Checkout URL
//   { action: "portal" }                                -> Stripe Customer Portal URL
// Auth: caller must send Authorization: Bearer <supabase access token>.
// Deployed with verify_jwt=false; we verify the token manually so we can
// return clean JSON errors (mirrors the Worker's requireBuyer()).
//
// Secrets (set via Management API / `supabase secrets set`):
//   STRIPE_SECRET_KEY, STRIPE_PRICE_PLAN_A, STRIPE_PRICE_PLAN_B,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://tools.trackingtogether.com";
const PRICE_A = Deno.env.get("STRIPE_PRICE_PLAN_A") || "";
const PRICE_B = Deno.env.get("STRIPE_PRICE_PLAN_B") || "";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

async function requireUser(req: Request) {
  const authz = req.headers.get("Authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { err: json({ error: "missing bearer token" }, 401) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { err: json({ error: "invalid session" }, 401) };
  return { user: data.user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const { user, err } = await requireUser(req);
  if (err) return err;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = body.action || "checkout";

  // Resolve / lazily create the Stripe customer for this buyer.
  const { data: buyer } = await admin
    .from("buyers").select("stripe_customer_id, email").eq("id", user.id).maybeSingle();
  let customerId = buyer?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { buyer_id: user.id },
    });
    customerId = customer.id;
    await admin.from("buyers").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  if (action === "portal") {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${ALLOWED_ORIGIN}/eliops/`,
    });
    return json({ url: portal.url });
  }

  // action === "checkout"
  const plan = body.plan;
  const priceId = plan === "plan_a" ? PRICE_A : plan === "plan_b" ? PRICE_B : null;
  if (!priceId) return json({ error: "invalid plan (use plan_a | plan_b)" }, 400);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { buyer_id: user.id } },
    success_url: `${ALLOWED_ORIGIN}/eliops/?checkout=success`,
    cancel_url: `${ALLOWED_ORIGIN}/elios/pricing.html?checkout=cancel`,
    allow_promotion_codes: true,
  });
  return json({ url: session.url });
});
