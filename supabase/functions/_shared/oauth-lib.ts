// Pure helpers for the ad-platform OAuth Edge Functions. Same split as stripe-lib.ts: no Deno
// globals, no network, so the exact same file runs under Deno and under the Node test harness.
import { hmacSha256Hex, safeEqual } from "./stripe-lib.ts";

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string): Uint8Array => new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
const toB64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * The callback for an OAuth connect is a plain top-level browser redirect from Meta/TikTok -- it
 * carries no Supabase login, the same reason the Stripe webhook can't require one. This signed,
 * short-lived "state" value is what proves the callback belongs to a flow an authenticated owner
 * actually started, rather than letting anyone who finds the callback URL plant a token.
 *
 * Shape: "<provider>.<nonceB64url>.<expiresAtSec>.<hmacHex>" over "provider.nonce.expiresAtSec",
 * the same construction Stripe's own webhook signature uses (timestamp + HMAC, checked with a
 * constant-time comparison) -- just signing our own payload instead of relaying Stripe's.
 */
export async function signState(secret: string, provider: string, nowSec: number, ttlSec = 600): Promise<string> {
  const nonce = toB64url(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = nowSec + ttlSec;
  const payload = `${provider}.${nonce}.${expiresAt}`;
  const mac = await hmacSha256Hex(secret, payload);
  return `${payload}.${mac}`;
}

export async function verifyState(secret: string, provider: string, state: string | null, nowSec: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!state) return { ok: false, reason: "missing state" };
  const parts = state.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed state" };
  const [stProvider, nonce, expStr, mac] = parts;
  if (stProvider !== provider) return { ok: false, reason: "state is for a different provider" };
  if (!/^\d{1,20}$/.test(expStr)) return { ok: false, reason: "malformed expiry" };
  const payload = `${stProvider}.${nonce}.${expStr}`;
  const expected = await hmacSha256Hex(secret, payload);
  if (!safeEqual(mac, expected)) return { ok: false, reason: "bad signature" };
  if (nowSec > Number(expStr)) return { ok: false, reason: "expired" };
  return { ok: true };
}

// ---------------------------------------------------------- Meta (Facebook Marketing API) ----
// Graph API version pinned on purpose: Meta deprecates versions on a schedule, and an
// unpinned "latest" call would change behaviour out from under this integration with no warning.
export const META_GRAPH_VERSION = "v21.0";
export const META_SCOPES = "ads_management,ads_read";

export function metaAuthorizationUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", META_SCOPES);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

export function metaCodeExchangeUrl(appId: string, appSecret: string, redirectUri: string, code: string): string {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  return u.toString();
}

export function metaLongLivedExchangeUrl(appId: string, appSecret: string, shortLivedToken: string): string {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("fb_exchange_token", shortLivedToken);
  return u.toString();
}

export function metaAdAccountsUrl(accessToken: string): string {
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`);
  u.searchParams.set("access_token", accessToken);
  u.searchParams.set("fields", "account_id,name");
  return u.toString();
}

// ---------------------------------------------------------- TikTok (Business/Marketing API) ----
// TikTok's token endpoint is versioned the same way Meta's Graph API is; pinned for the same reason.
export const TIKTOK_TOKEN_VERSION = "v1.3";
export const TIKTOK_TOKEN_URL = `https://business-api.tiktok.com/open_api/${TIKTOK_TOKEN_VERSION}/oauth2/access_token/`;

export function tiktokAuthorizationUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL("https://business-api.tiktok.com/portal/auth");
  u.searchParams.set("app_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

// Unlike Meta's query-string GET, TikTok's token exchange is a POST with a JSON body -- this
// returns the body, not a URL, so the caller can set the right method/headers.
export function tiktokTokenExchangeBody(appId: string, appSecret: string, authCode: string): Record<string, string> {
  return { app_id: appId, secret: appSecret, auth_code: authCode };
}

// ---------------------------------------------------------- Google Ads ----
// The Ads API is versioned in the URL and Google retires old versions on a schedule, so this is pinned
// on purpose (v25 was current in October 2026; minor releases such as 25.1 are additive under it).
export const GOOGLE_ADS_API_VERSION = "v25";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ACCESSIBLE_CUSTOMERS_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

export function googleAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_ADS_SCOPE);
  // Both are needed to be handed a refresh token: Google omits it on a repeat consent unless it is forced,
  // and the refresh token is the only durable credential (the access token lasts one hour).
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

// Google's token endpoint wants a form-encoded POST (Meta used a query string, TikTok used JSON).
export function googleTokenExchangeBody(clientId: string, clientSecret: string, redirectUri: string, code: string): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  }).toString();
}
