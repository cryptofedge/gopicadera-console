// The request handlers, written against injected dependencies (env, fetch, clock) so they can be
// tested end to end without Deno, a network, or a real Stripe/Meta account.
import { buildCheckoutParams, corsHeaders, hmacSha256Hex, json, toFormBody, verifyStripeSignature } from "./stripe-lib.ts";
import type { CheckoutOrder, Env } from "./stripe-lib.ts";
import {
  metaAuthorizationUrl, metaCodeExchangeUrl, metaDebugTokenUrl, metaLongLivedExchangeUrl,
  signState, verifyState,
  tiktokAuthorizationUrl, tiktokTokenExchangeBody, TIKTOK_TOKEN_URL,
  googleAuthorizationUrl, googleTokenExchangeBody, GOOGLE_TOKEN_URL,
} from "./oauth-lib.ts";
import { googleAccessibleAccounts, metaAdAccounts, metaPages, tiktokAdvertisers } from "./ads-platforms.ts";
import type { AdAccount, MetaPage } from "./ads-platforms.ts";
import { loadAdsApp } from "./ads-apps.ts";
import type { AdsApp } from "./ads-apps.ts";

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
    adminUrl: (env.ADMIN_URL || "https://admin.gopicadera.com").replace(/\/$/, ""),
    // Optional override for the key that signs the short-lived OAuth "state" parameter (see oauthStateKey).
    oauthStateSecret: env.OAUTH_STATE_SECRET || "",
    // Each platform's app id and secret come from loadAdsApp (ads-apps.ts): the owner saves them in Canales,
    // and the META_APP_ID / TIKTOK_APP_ID / GOOGLE_ADS_CLIENT_ID env pairs override when set.
    // Optional. Developer tokens were sunset on 2026-09-09 (access belongs to the Cloud project now) and one
    // that is sent is ignored, so it is sent only when set and nothing depends on it.
    googleDeveloperToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
  };
}

// What the derived state key is an HMAC of. Changing it invalidates every state in flight (10 minutes' worth).
const OAUTH_STATE_KEY_LABEL = "gopicadera-oauth-state-v1";

/**
 * The key that signs the OAuth "state" parameter. OAUTH_STATE_SECRET wins when someone sets it; otherwise it
 * is derived from the service-role key Supabase injects into every function, so nobody has to create or paste
 * one. An HMAC rather than the key itself: the state's signature never exposes anything about the service key,
 * and the derived key is distinct from the Stripe webhook secret, so a leak of one never forges the other.
 * Empty only when neither is available.
 */
export async function oauthStateKey(env: Env): Promise<string> {
  const c = config(env);
  if (c.oauthStateSecret) return c.oauthStateSecret;
  if (!c.serviceKey) return "";
  return hmacSha256Hex(c.serviceKey, OAUTH_STATE_KEY_LABEL);
}

export class RpcError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Calls a database function with the service role. Exported for ads-worker.ts, which writes through the
// same narrow service-role functions.
export async function rpc(c: { supabaseUrl: string; serviceKey: string }, fetchFn: typeof fetch, fn: string, args: Record<string, unknown>) {
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

// The non-secret facts about a Meta connection that the ads work needs later: which Page an ad speaks as,
// the Instagram account linked to it, and when the token stops working. Best-effort, like the ad-account
// lookup -- each part that fails is left out rather than undoing a good connection.
// The Pages are a list to choose from, like the ad accounts: the owner picks the one the ads speak as in Canales
// (choose_ads_account in backend/ads_accounts.sql), because this login may administer other businesses' Pages too.
type MetaDetails = {
  pages?: MetaPage[];
  ad_accounts?: AdAccount[];
  token_expires_at?: string | null;
  scopes?: string[];
};

async function metaConnectionDetails(app: AdsApp, fetchFn: typeof fetch, accessToken: string): Promise<MetaDetails> {
  const details: MetaDetails = {};
  try {
    details.pages = await metaPages(fetchFn, accessToken);
  } catch (e) { console.error("could not list Pages (connection still saved):", e instanceof Error ? e.message : e); }

  try {
    const r = await fetchFn(metaDebugTokenUrl(app.appId, app.appSecret, accessToken));
    const body: { data?: { expires_at?: number; scopes?: string[] } } = await r.json().catch(() => ({}));
    if (r.ok && body.data) {
      // 0 means the token does not expire.
      const exp = Number(body.data.expires_at || 0);
      details.token_expires_at = exp > 0 ? new Date(exp * 1000).toISOString() : null;
      if (Array.isArray(body.data.scopes)) details.scopes = body.data.scopes.map(String);
    }
  } catch (e) { console.error("could not read the token's expiry (connection still saved):", e instanceof Error ? e.message : e); }

  return details;
}

// ------------------------------------------------------------------------ Meta ads OAuth -----
// Start: owner-only (same callerIsOwner check as stripe-status). Returns {url} for the BROWSER to
// navigate to itself -- a redirect issued from here would need to carry the owner's auth header,
// which a plain top-level navigation cannot send. Same reason create-checkout returns a url
// instead of a 302.
export async function handleMetaOAuthStart(req: Request, deps: Deps): Promise<Response> {
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
    const app = await loadAdsApp(deps.env, deps.fetch, "meta_ads");
    const stateKey = await oauthStateKey(deps.env);
    if (!app || !stateKey) return json({ error: "not_configured" }, 503, cors);

    const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
    const state = await signState(stateKey, "meta_ads", nowSec);
    const redirectUri = `${c.supabaseUrl}/functions/v1/meta-oauth-callback`;
    return json({ url: metaAuthorizationUrl(app.appId, redirectUri, state, app.loginConfigId) }, 200, cors);
  } catch (e) {
    console.error("meta-oauth-start failed:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
}

// Callback: Meta's own top-level redirect after the owner approves or denies. No Supabase login
// reaches here (same reason the Stripe webhook has none) -- the signed state parameter is what
// proves this belongs to a flow an authenticated owner actually started, checked before anything
// is written, so a forged or expired state cannot trigger so much as a failure write. The only
// thing before it is reading which app to use, so a bare GET can answer 503 while the owner has
// not saved the app yet (what `npm run check:connect` reads).
export async function handleMetaOAuthCallback(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);
  const app = await loadAdsApp(deps.env, deps.fetch, "meta_ads");
  const stateKey = await oauthStateKey(deps.env);
  if (!app || !stateKey) return json({ error: "not_configured" }, 503);

  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const u = new URL(req.url);
  const backToConsole = (q: Record<string, string>) => {
    const dest = new URL(`${c.adminUrl}/integrations/`);
    for (const [k, v] of Object.entries(q)) dest.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const fail = async (reason: string) => {
    try { await rpc(c, deps.fetch, "record_oauth_failure", { p_provider: "meta_ads", p_reason: reason }); }
    catch (e) { console.error("could not record the oauth failure:", e instanceof Error ? e.message : e); }
    return backToConsole({ oauth: "meta", status: "error", reason: reason.slice(0, 200) });
  };

  const state = u.searchParams.get("state");
  const check = await verifyState(stateKey, "meta_ads", state, nowSec);
  if (!check.ok) return backToConsole({ oauth: "meta", status: "error", reason: check.reason }); // state itself unproven: do not even record a failure

  const metaError = u.searchParams.get("error");
  if (metaError) return fail(u.searchParams.get("error_description") || metaError);

  const code = u.searchParams.get("code");
  if (!code) return fail("no_code");

  try {
    const redirectUri = `${c.supabaseUrl}/functions/v1/meta-oauth-callback`;
    const shortRes = await deps.fetch(metaCodeExchangeUrl(app.appId, app.appSecret, redirectUri, code));
    const shortBody: { access_token?: string; error?: { message?: string } } = await shortRes.json().catch(() => ({}));
    if (!shortRes.ok || !shortBody.access_token) return fail(shortBody.error?.message || "token exchange failed");

    // The long-lived exchange is a nice-to-have (weeks instead of ~2h of access); do not fail the
    // whole connection just because it did not go through.
    let accessToken = shortBody.access_token;
    try {
      const longRes = await deps.fetch(metaLongLivedExchangeUrl(app.appId, app.appSecret, accessToken));
      const longBody: { access_token?: string } = await longRes.json().catch(() => ({}));
      if (longRes.ok && longBody.access_token) accessToken = longBody.access_token;
    } catch (e) { console.error("long-lived token exchange failed, keeping the short-lived one:", e instanceof Error ? e.message : e); }

    const details = await metaConnectionDetails(app, deps.fetch, accessToken);
    try {
      details.ad_accounts = await metaAdAccounts(deps.fetch, accessToken);
    } catch (e) { console.error("could not list ad accounts (connection still saved):", e instanceof Error ? e.message : e); }

    // p_account_id is every account this login reaches, for the database to check a kept choice against; it is
    // never stored as the choice (see apply_oauth_connection). The ads worker fills the lists in later if a
    // lookup here failed.
    await rpc(c, deps.fetch, "apply_oauth_connection", {
      p_provider: "meta_ads", p_access_token: accessToken,
      p_account_id: (details.ad_accounts || []).map((a) => a.id).join(","), p_details: details,
    });
    return backToConsole({ oauth: "meta", status: "connected" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export async function handleTiktokOAuthStart(req: Request, deps: Deps): Promise<Response> {
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
    const app = await loadAdsApp(deps.env, deps.fetch, "tiktok_ads");
    const stateKey = await oauthStateKey(deps.env);
    if (!app || !stateKey) return json({ error: "not_configured" }, 503, cors);

    const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
    const state = await signState(stateKey, "tiktok_ads", nowSec);
    const redirectUri = `${c.supabaseUrl}/functions/v1/tiktok-oauth-callback`;
    return json({ url: tiktokAuthorizationUrl(app.appId, redirectUri, state) }, 200, cors);
  } catch (e) {
    console.error("tiktok-oauth-start failed:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
}

// Callback: TikTok's own top-level redirect after the owner approves or denies. Same shape as
// Meta's -- no Supabase login reaches here, the signed state is what proves it is real, checked
// before anything is written so a forged or expired state cannot trigger so much as a failure write.
export async function handleTiktokOAuthCallback(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);
  const app = await loadAdsApp(deps.env, deps.fetch, "tiktok_ads");
  const stateKey = await oauthStateKey(deps.env);
  if (!app || !stateKey) return json({ error: "not_configured" }, 503);

  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const u = new URL(req.url);
  const backToConsole = (q: Record<string, string>) => {
    const dest = new URL(`${c.adminUrl}/integrations/`);
    for (const [k, v] of Object.entries(q)) dest.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const fail = async (reason: string) => {
    try { await rpc(c, deps.fetch, "record_oauth_failure", { p_provider: "tiktok_ads", p_reason: reason }); }
    catch (e) { console.error("could not record the oauth failure:", e instanceof Error ? e.message : e); }
    return backToConsole({ oauth: "tiktok", status: "error", reason: reason.slice(0, 200) });
  };

  const state = u.searchParams.get("state");
  const check = await verifyState(stateKey, "tiktok_ads", state, nowSec);
  if (!check.ok) return backToConsole({ oauth: "tiktok", status: "error", reason: check.reason }); // state itself unproven: do not even record a failure

  const tiktokError = u.searchParams.get("error") || u.searchParams.get("error_description");
  if (tiktokError) return fail(tiktokError);

  // TikTok's redirect carries both `auth_code` and a redundant `code` with the same value.
  const authCode = u.searchParams.get("auth_code") || u.searchParams.get("code");
  if (!authCode) return fail("no_code");

  try {
    const tokenRes = await deps.fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tiktokTokenExchangeBody(app.appId, app.appSecret, authCode)),
    });
    const tokenBody: { code?: number; message?: string; data?: { access_token?: string; advertiser_ids?: unknown[]; refresh_token?: string } } =
      await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || tokenBody.code !== 0 || !tokenBody.data?.access_token) {
      return fail(tokenBody.message || "token exchange failed");
    }

    // TikTok documents this as a long-term advertiser token: it does not expire unless revoked, and the
    // response carries no refresh_token. (The 24-hour token plus refresh_token belongs to TikTok's creator
    // and Login Kit tokens, a different product.) Keep a refresh_token only if one is ever sent.
    const refreshToken = tokenBody.data.refresh_token || null;

    // Every advertiser the authorization reaches. A list to choose from, never the choice (see Meta's callback).
    const ids = [...new Set((tokenBody.data.advertiser_ids || []).map((a) => String(a)).filter(Boolean))];
    // Names are best-effort: the connection is just as good without them.
    const names = new Map<string, string | null>();
    if (ids.length > 0) {
      try {
        for (const a of await tiktokAdvertisers(deps.fetch, app.appId, app.appSecret, tokenBody.data.access_token)) names.set(a.id, a.name);
      } catch (e) { console.error("could not read advertiser names (connection still saved):", e instanceof Error ? e.message : e); }
    }

    await rpc(c, deps.fetch, "apply_oauth_connection", {
      p_provider: "tiktok_ads",
      p_access_token: tokenBody.data.access_token,
      p_account_id: ids.join(","),
      p_refresh_token: refreshToken,
      p_details: { ad_accounts: ids.map((id) => ({ id, name: names.get(id) ?? null })) },
    });
    return backToConsole({ oauth: "tiktok", status: "connected" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export async function handleGoogleAdsOAuthStart(req: Request, deps: Deps): Promise<Response> {
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
    const app = await loadAdsApp(deps.env, deps.fetch, "google_ads");
    const stateKey = await oauthStateKey(deps.env);
    if (!app || !stateKey) return json({ error: "not_configured" }, 503, cors);

    const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
    const state = await signState(stateKey, "google_ads", nowSec);
    const redirectUri = `${c.supabaseUrl}/functions/v1/google-ads-oauth-callback`;
    return json({ url: googleAuthorizationUrl(app.appId, redirectUri, state) }, 200, cors);
  } catch (e) {
    console.error("google-ads-oauth-start failed:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
}

// Callback: Google's own top-level redirect after the owner approves or denies. Same guarantees as Meta's
// and TikTok's -- no Supabase login reaches here, the signed state is what proves it is real, checked
// before anything is written so a forged or expired state cannot trigger so much as a failure write.
export async function handleGoogleAdsOAuthCallback(req: Request, deps: Deps): Promise<Response> {
  const c = config(deps.env);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);
  const app = await loadAdsApp(deps.env, deps.fetch, "google_ads");
  const stateKey = await oauthStateKey(deps.env);
  if (!app || !stateKey) return json({ error: "not_configured" }, 503);

  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const u = new URL(req.url);
  const backToConsole = (q: Record<string, string>) => {
    const dest = new URL(`${c.adminUrl}/integrations/`);
    for (const [k, v] of Object.entries(q)) dest.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const fail = async (reason: string) => {
    try { await rpc(c, deps.fetch, "record_oauth_failure", { p_provider: "google_ads", p_reason: reason }); }
    catch (e) { console.error("could not record the oauth failure:", e instanceof Error ? e.message : e); }
    return backToConsole({ oauth: "google", status: "error", reason: reason.slice(0, 200) });
  };

  const state = u.searchParams.get("state");
  const check = await verifyState(stateKey, "google_ads", state, nowSec);
  if (!check.ok) return backToConsole({ oauth: "google", status: "error", reason: check.reason }); // state itself unproven: do not even record a failure

  const googleError = u.searchParams.get("error");
  if (googleError) return fail(u.searchParams.get("error_description") || googleError);

  const code = u.searchParams.get("code");
  if (!code) return fail("no_code");

  try {
    const redirectUri = `${c.supabaseUrl}/functions/v1/google-ads-oauth-callback`;
    const tokenRes = await deps.fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: googleTokenExchangeBody(app.appId, app.appSecret, redirectUri, code),
    });
    const tokenBody: { access_token?: string; refresh_token?: string; error?: string; error_description?: string } =
      await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenBody.access_token) {
      return fail(tokenBody.error_description || tokenBody.error || "token exchange failed");
    }

    // The refresh token is the only durable credential (the access token lasts an hour and is never stored),
    // so a response without one is a failed connection, not a degraded one -- it would be dead by the next hour.
    const refreshToken = tokenBody.refresh_token;
    if (!refreshToken) return fail("Google no entrego el permiso de renovacion. Quita esta app en myaccount.google.com/permissions y vuelve a conectar.");

    // Best-effort, like Meta's ad-account lookup: a Cloud project without API access yet makes this call fail
    // for reasons the owner cannot fix from here, and that must not undo a perfectly good connection. The
    // ads worker reads the list again on every run, so it fills in once access is granted.
    let adAccounts: AdAccount[] | null = null;
    try {
      adAccounts = await googleAccessibleAccounts(deps.fetch, { accessToken: tokenBody.access_token, developerToken: c.googleDeveloperToken });
    } catch (e) { console.error("could not list Google Ads accounts (connection still saved):", e instanceof Error ? e.message : e); }

    // p_access_token is the column's name for "the credential to keep"; for Google that is the refresh token.
    // p_account_id lists every reachable account, never the choice (see Meta's callback).
    await rpc(c, deps.fetch, "apply_oauth_connection", {
      p_provider: "google_ads", p_access_token: refreshToken,
      p_account_id: (adAccounts || []).map((a) => a.id).join(","),
      p_details: adAccounts ? { ad_accounts: adAccounts } : {},
    });
    return backToConsole({ oauth: "google", status: "connected" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
