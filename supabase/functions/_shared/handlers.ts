// The two request handlers, written against injected dependencies (env, fetch, clock) so they can be
// tested end to end without Deno, a network, or a real Stripe account.
import { buildCheckoutParams, corsHeaders, json, toFormBody, verifyStripeSignature } from "./stripe-lib.ts";
import type { CheckoutOrder, Env } from "./stripe-lib.ts";

export interface Deps {
  env: Env;
  fetch: typeof fetch;
  now?: () => number; // milliseconds
}

const DEFAULT_ORIGINS = "https://gopicadera.com,https://www.gopicadera.com,https://cryptofedge.github.io";
const DEFAULT_ADMIN_ORIGINS = "https://admin.gopicadera.com,https://cryptofedge.github.io";

// Only these events change an order. Everything else is acknowledged and dropped.
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
]);

function config(env: Env) {
  return {
    supabaseUrl: (env.SUPABASE_URL || "").replace(/\/$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    stripeKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    siteUrl: (env.SITE_URL || "https://gopicadera.com").replace(/\/$/, ""),
    origins: (env.SITE_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean),
    // While Stripe is being built in test mode, a live key is refused unless someone sets this on purpose.
    allowLive: env.ALLOW_LIVE === "1",
    // Supabase auto-injects these three into every Edge Function; never set as a secret by hand.
    anonKey: env.SUPABASE_ANON_KEY || "",
    adminOrigins: (env.ADMIN_ORIGINS || DEFAULT_ADMIN_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean),
  };
}

class RpcError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function rpc(c: ReturnType<typeof config>, fetchFn: typeof fetch, fn: string, args: Record<string, unknown>) {
  const r = await fetchFn(`${c.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* plain text */ }
  if (!r.ok) {
    const msg = typeof body === "object" && body && "message" in body ? String((body as { message: unknown }).message) : String(text).slice(0, 200);
    throw new RpcError(r.status, msg);
  }
  return body;
}

function orderProblem(e: unknown, cors: Record<string, string>): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not found/.test(msg)) return json({ error: "order_not_found" }, 404, cors);
  if (/too many attempts/.test(msg)) return json({ error: "too_many_attempts" }, 429, cors);
  if (/checkout:/.test(msg)) return json({ error: "order_not_payable", detail: msg.replace(/^checkout:\s*/, "") }, 409, cors);
  console.error("checkout rpc failed:", msg);
  return json({ error: "server_error" }, 500, cors);
}

// POST { code: "GP-1044" } -> { url, mode }. The browser only ever names an order; it never sends an amount.
export async function handleCreateCheckout(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin, c.origins);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);
  if (!c.stripeKey || !c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503, cors);
  const live = /^(sk|rk)_live_/.test(c.stripeKey);
  if (live && !c.allowLive) return json({ error: "live_mode_disabled" }, 503, cors);

  let body: { code?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400, cors); }
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^GP-\d{1,9}$/.test(code)) return json({ error: "bad_code" }, 400, cors);

  let order: CheckoutOrder;
  try { order = (await rpc(c, deps.fetch, "begin_card_checkout", { p_code: code })) as CheckoutOrder; } catch (e) { return orderProblem(e, cors); }

  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  let params;
  try { params = buildCheckoutParams(order, c.siteUrl, nowSec); } catch (e) {
    console.error("refusing to build a session:", e instanceof Error ? e.message : e);
    return json({ error: "order_not_payable", detail: "amounts do not add up" }, 409, cors);
  }

  const res = await deps.fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `gp-checkout-${code}-${order.attempt}`,
    },
    body: toFormBody(params),
  });
  let session: { id?: string; url?: string; error?: { message?: string; type?: string } } = {};
  try { session = await res.json(); } catch { /* not json */ }
  if (!res.ok || !session.id || !session.url) {
    console.error("stripe refused the session:", res.status, session.error?.type, session.error?.message);
    return json({ error: "stripe_error" }, 502, cors);
  }

  try { await rpc(c, deps.fetch, "attach_checkout_session", { p_code: code, p_session_id: session.id }); } catch (e) {
    console.error("could not record the session:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
  return json({ url: session.url, mode: live ? "live" : "test" }, 200, cors);
}

// Stripe calls this after a payment. Verified by signature, applied once per event id.
export async function handleStripeWebhook(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!c.webhookSecret || !c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);

  const raw = await req.text(); // the signature covers the exact bytes, so read the raw text first
  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature"), c.webhookSecret, nowSec))) {
    return json({ error: "bad_signature" }, 400);
  }

  let event: { id?: string; type?: string; livemode?: boolean; data?: { object?: unknown } };
  try { event = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  if (!event.id || !event.type) return json({ error: "bad_event" }, 400);
  if (event.livemode && !c.allowLive) return json({ error: "live_mode_disabled" }, 400);
  if (!HANDLED_EVENTS.has(event.type)) return json({ received: true, outcome: "ignored" });

  try {
    const outcome = await rpc(c, deps.fetch, "apply_stripe_event", { p_event_id: event.id, p_type: event.type, p_object: event.data?.object ?? {} });
    return json({ received: true, outcome });
  } catch (e) {
    // a non-2xx makes Stripe retry, which is what we want when the database is briefly unavailable
    console.error("could not apply the event:", event.id, e instanceof Error ? e.message : e);
    return json({ error: "apply_failed" }, 500);
  }
}

// Does the caller's own profile say role=owner and active? A direct PostgREST read (not a security-definer
// RPC), forwarding the caller's own JWT with the anon apikey, so ordinary Row Level Security decides what
// comes back — the same self-read policy every other owner-only page in the console relies on.
async function callerIsOwner(c: ReturnType<typeof config>, fetchFn: typeof fetch, authHeader: string): Promise<boolean> {
  const r = await fetchFn(
    `${c.supabaseUrl}/rest/v1/profiles?select=role,active&role=eq.owner&active=eq.true&limit=1`,
    { headers: { apikey: c.anonKey, Authorization: authHeader } },
  );
  if (!r.ok) return false;
  let rows: unknown;
  try { rows = await r.json(); } catch { return false; }
  return Array.isArray(rows) && rows.length > 0;
}

// Has admin/backend/stripe_payments.sql been applied? price_cart is revoked from everyone but service_role,
// so this call can only be made from here, and passing an empty cart makes it raise its own controlled
// error immediately -- cheap, no side effects, and proof the function exists and runs.
async function priceCartExists(c: ReturnType<typeof config>, fetchFn: typeof fetch): Promise<boolean> {
  try {
    await rpc(c, fetchFn, "price_cart", { p_items: [] });
    return true; // price_cart always raises on an empty cart, so reaching here would itself be a surprise
  } catch (e) {
    if (e instanceof RpcError) {
      if (/could not find the function|PGRST202|does not exist/i.test(e.message)) return false; // migration not applied
      if (/the cart is empty/i.test(e.message)) return true; // its own controlled error -- proof it exists and ran
      throw e; // some OTHER database problem (permission, connection...) -- do not guess either way, let the caller 500
    }
    throw e; // a real network/parse failure is not "not applied" either
  }
}

type StripeKeyMode = "test" | "live" | "unknown";
type StripeConfigStatus = "not_configured" | "partial" | StripeKeyMode;

// Read-only Stripe setup status for the console's Integrations page (GET/POST, owner-only). Never returns a
// secret value -- only whether one is set, and for the key, which mode it looks like from its prefix.
export async function handleStripeStatus(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin, c.adminOrigins);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);
  if (!c.supabaseUrl || !c.serviceKey || !c.anonKey) return json({ error: "not_configured" }, 503, cors);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) return json({ error: "unauthorized" }, 401, cors);

  try {
    if (!(await callerIsOwner(c, deps.fetch, authHeader))) return json({ error: "forbidden" }, 403, cors);

    const databaseApplied = await priceCartExists(c, deps.fetch);
    const keysConfigured = !!c.stripeKey;
    const keyMode: StripeKeyMode | null = !keysConfigured ? null
      : /^(sk|rk)_live_/.test(c.stripeKey) ? "live"
      : /^(sk|rk)_test_/.test(c.stripeKey) ? "test"
      : "unknown";
    const webhookConfigured = !!c.webhookSecret;

    const missing: string[] = [];
    if (!databaseApplied) missing.push("database");
    if (!keysConfigured) missing.push("stripe_key");
    if (!webhookConfigured) missing.push("webhook");

    const status: StripeConfigStatus = missing.length === 0 ? (keyMode as StripeKeyMode)
      : missing.length === 3 ? "not_configured"
      : "partial";

    return json({ status, databaseApplied, keysConfigured, keyMode, webhookConfigured, liveAllowed: c.allowLive, missing }, 200, cors);
  } catch (e) {
    console.error("stripe-status failed:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
}
