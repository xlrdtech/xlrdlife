/* ===================================================================
   EliOS Buyer Portal - PUBLIC runtime config
   -------------------------------------------------------------------
   SAFE-BY-DESIGN PUBLIC KEYS ONLY. Do NOT put any secret here.
   This file ships to the browser. The following keys are public and
   safe to expose (they are protected by Supabase RLS by design):

     - Supabase anon / publishable key  (RLS is the security boundary)
     - Stripe publishable key (pk_live_... or pk_test_...)

   NEVER place here:
     - Supabase service_role key            -> Cloudflare Worker secret
     - Stripe secret key (sk_live_...)        -> Cloudflare Worker secret
     - Stripe webhook signing secret          -> Cloudflare Worker secret
     - Google OAuth client SECRET             -> Supabase Auth provider config
   =================================================================== */

window.ELIOS_CONFIG = {
  // ---- Supabase (the LIVE auth + leads path) ----------------------
  // Auth + leads now run directly against Supabase from the browser via
  // supabase-js. The old Windows/omnimind api.xlrd.org backend is retired.
  //
  //   * Auth:   supabase.auth.signInWithPassword({ email, password })
  //             email = <username>@trackingtogether.com
  //             role  = session.user.user_metadata.role  ('master' | 'subscriber')
  //   * Subscriber leads:  supabase.from('my_leads').select()   (RLS-scoped)
  //   * Master lead pool:  supabase.from('all_leads').select()  (is_master gated)
  //   * Master roster:     supabase.from('buyers').select().eq('role','subscriber')
  //   * Master assign:     supabase.rpc('assign_leads',{ p_subscriber, p_lead_ids })
  //
  // The anon/publishable key is SAFE in the browser; Row-Level Security is
  // the boundary. NEVER put the service_role key here.
  SUPABASE_URL:      "https://jftakowpjkbcqpvtgwgq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdGFrb3dwamtiY3FwdnRnd2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDQ3MzEsImV4cCI6MjA5Njg4MDczMX0.Qm16B5Nv8Q92CinLw2k4r00FXV0IlOWk-JlZnGvwcjk",

  // ---- Login email domain (username -> email mapping) -------------
  // Users sign in with a short username; we map it to the Supabase Auth
  // identity by appending this domain.
  EMAIL_DOMAIN: "trackingtogether.com",

  // ---- Stripe (publishable key only; pricing page only) -----------
  // Live keys for the Tracking Together Stripe account (acct_1Tf7SR...).
  STRIPE_PUBLISHABLE_KEY: "pk_live_51Tf7SRQjGRHpyWQNxe1WSnE9FhiPiiKwgbMSAHcANccgLCNgoKXLZ0lM0MQUrQskPkhgAd83jToXDY0ta0MmpsN800LhWKc8Ow",
  STRIPE_PRICE_PLAN_A: "price_1TiQO1QjGRHpyWQNlJHWN3Cl", // 30 leads / mo / $100
  STRIPE_PRICE_PLAN_B: "price_1TiQO2QjGRHpyWQNWcFnG0Tf", // 15 leads / mo / $40
  // Billing API = Supabase Edge Functions (functions/v1/{stripe-checkout,stripe-webhook}).
  WORKER_API_BASE: "https://jftakowpjkbcqpvtgwgq.supabase.co/functions/v1",

  // ---- Plan catalog (display only; quota is enforced server-side) --
  PLANS: {
    plan_a: { name: "Plan A", price: 100, leads: 30, interval: "month" },
    plan_b: { name: "Plan B", price: 40,  leads: 15, interval: "month" }
  },

  // ---- Routes (GitHub Pages static paths) -------------------------
  ROUTES: {
    login:     "/elios/index.html",
    dashboard: "/elios/dashboard.html",
    admin:     "/elios/admin.html",
    pricing:   "/elios/pricing.html"
  }
};
