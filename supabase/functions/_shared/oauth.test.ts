// The ad-platform connect flow, end to end, with a fake fetch standing in for Meta, TikTok, Google
// and Supabase's REST API. Runs under Node's built-in test runner: `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleMetaOAuthStart, handleMetaOAuthCallback,
  handleTiktokOAuthStart, handleTiktokOAuthCallback,
  handleGoogleAdsOAuthStart, handleGoogleAdsOAuthCallback,
} from "./handlers.ts";
import type { Deps } from "./handlers.ts";
import { signState, verifyState, META_GRAPH_VERSION, GOOGLE_ADS_API_VERSION } from "./oauth-lib.ts";

const SUPA = "https://proj.supabase.co";
const ADMIN = "https://admin.example";
const NOW_MS = Date.UTC(2026, 9, 28, 12, 0, 0);
const NOW_SEC = Math.floor(NOW_MS / 1000);

const ENV: Record<string, string> = {
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_ANON_KEY: "anon-key",
  OAUTH_STATE_SECRET: "state-secret",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  TIKTOK_APP_ID: "tt-app",
  TIKTOK_APP_SECRET: "tt-secret",
  GOOGLE_ADS_CLIENT_ID: "g-client",
  GOOGLE_ADS_CLIENT_SECRET: "g-secret",
  ADMIN_URL: ADMIN,
};

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
type Route = [match: (url: string) => boolean, reply: (call: Call) => Response];

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const err = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A fetch that answers from a route table and records every call, so a test can assert both what was
// asked of each platform and -- just as important -- that nothing was asked at all.
function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const call: Call = { url, method: init?.method || "GET", headers, body: typeof init?.body === "string" ? init.body : "" };
    calls.push(call);
    const route = routes.find(([m]) => m(url));
    if (!route) throw new Error(`unexpected fetch: ${call.method} ${url}`);
    return route[1](call);
  }) as typeof fetch;
  return { fn, calls };
}

const deps = (fetchFn: typeof fetch, env: Record<string, string> = ENV): Deps => ({ env, fetch: fetchFn, now: () => NOW_MS });
const rpcCalls = (calls: Call[], name: string) =>
  calls.filter((c) => c.url === `${SUPA}/rest/v1/rpc/${name}`).map((c) => JSON.parse(c.body));
const location = (res: Response) => new URL(res.headers.get("location") || "");
const ownerRoute = (isOwner = true): Route => [(u) => u.startsWith(`${SUPA}/rest/v1/profiles`), () => ok(isOwner ? [{ role: "owner", active: true }] : [])];
const rpcRoute: Route = [(u) => u.startsWith(`${SUPA}/rest/v1/rpc/`), () => ok(null)];

const PROVIDERS = [
  {
    name: "meta", provider: "meta_ads", appEnv: "META_APP_ID",
    start: handleMetaOAuthStart, callback: handleMetaOAuthCallback, callbackPath: "meta-oauth-callback",
    errorParams: { error: "access_denied", error_description: "The user denied" },
  },
  {
    name: "tiktok", provider: "tiktok_ads", appEnv: "TIKTOK_APP_ID",
    start: handleTiktokOAuthStart, callback: handleTiktokOAuthCallback, callbackPath: "tiktok-oauth-callback",
    errorParams: { error: "access_denied" },
  },
  {
    name: "google", provider: "google_ads", appEnv: "GOOGLE_ADS_CLIENT_ID",
    start: handleGoogleAdsOAuthStart, callback: handleGoogleAdsOAuthCallback, callbackPath: "google-ads-oauth-callback",
    errorParams: { error: "access_denied" },
  },
] as const;

const callbackUrl = (path: string, params: Record<string, string>) => {
  const u = new URL(`${SUPA}/functions/v1/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};
const startRequest = (method = "POST", auth = "Bearer user-jwt") =>
  new Request(`${SUPA}/functions/v1/x`, { method, headers: { origin: "https://admin.gopicadera.com", ...(auth ? { authorization: auth } : {}) } });

for (const p of PROVIDERS) {
  // ---- start ------------------------------------------------------------------------------------
  test(`${p.name} start: answers the browser preflight`, async () => {
    const f = fakeFetch([]);
    const res = await p.start(startRequest("OPTIONS"), deps(f.fn));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://admin.gopicadera.com");
  });

  test(`${p.name} start: refuses a request with no login`, async () => {
    const res = await p.start(startRequest("POST", ""), deps(fakeFetch([]).fn));
    assert.equal(res.status, 401);
  });

  test(`${p.name} start: refuses a signed-in user who is not an owner`, async () => {
    const res = await p.start(startRequest(), deps(fakeFetch([ownerRoute(false)]).fn));
    assert.equal(res.status, 403);
  });

  test(`${p.name} start: says not_configured until the app id is set`, async () => {
    const env = { ...ENV, [p.appEnv]: "" };
    const res = await p.start(startRequest(), deps(fakeFetch([ownerRoute()]).fn, env));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "not_configured" });
  });

  test(`${p.name} start: hands an owner a consent URL with a state only this provider accepts`, async () => {
    const res = await p.start(startRequest(), deps(fakeFetch([ownerRoute()]).fn));
    assert.equal(res.status, 200);
    const { url } = await res.json() as { url: string };
    const u = new URL(url);
    assert.equal(u.searchParams.get("redirect_uri"), `${SUPA}/functions/v1/${p.callbackPath}`);
    const state = u.searchParams.get("state");
    assert.deepEqual(await verifyState(ENV.OAUTH_STATE_SECRET, p.provider, state, NOW_SEC), { ok: true });
    const other = p.provider === "meta_ads" ? "tiktok_ads" : "meta_ads";
    assert.equal((await verifyState(ENV.OAUTH_STATE_SECRET, other, state, NOW_SEC)).ok, false);
  });

  // ---- callback: the cases that must never touch the database ------------------------------------
  test(`${p.name} callback: a bare GET answers 503 until the state secret exists (what check-connect reads)`, async () => {
    const f = fakeFetch([]);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, {})), deps(f.fn, { ...ENV, OAUTH_STATE_SECRET: "" }));
    assert.equal(res.status, 503);
    assert.equal(f.calls.length, 0);
  });

  test(`${p.name} callback: a bare GET once configured bounces to the console and writes nothing`, async () => {
    const f = fakeFetch([]);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, {})), deps(f.fn));
    assert.equal(res.status, 302);
    assert.equal(location(res).origin + location(res).pathname, `${ADMIN}/integrations/`);
    assert.equal(location(res).searchParams.get("status"), "error");
    assert.equal(f.calls.length, 0);
  });

  for (const [label, makeState] of [
    ["forged", async () => (await signState("wrong-secret", p.provider, NOW_SEC))],
    ["expired", async () => (await signState(ENV.OAUTH_STATE_SECRET, p.provider, NOW_SEC - 3600))],
    ["meant for another provider", async () => (await signState(ENV.OAUTH_STATE_SECRET, p.provider === "google_ads" ? "meta_ads" : "google_ads", NOW_SEC))],
  ] as const) {
    test(`${p.name} callback: a state that is ${label} is refused without any write`, async () => {
      const f = fakeFetch([]);
      const res = await p.callback(new Request(callbackUrl(p.callbackPath, { state: await makeState(), code: "c" })), deps(f.fn));
      assert.equal(res.status, 302);
      assert.equal(location(res).searchParams.get("status"), "error");
      assert.equal(f.calls.length, 0);
    });
  }

  test(`${p.name} callback: a refusal on the platform's screen is recorded as a failure`, async () => {
    const f = fakeFetch([rpcRoute]);
    const state = await signState(ENV.OAUTH_STATE_SECRET, p.provider, NOW_SEC);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, { state, ...p.errorParams })), deps(f.fn));
    assert.equal(location(res).searchParams.get("status"), "error");
    const failures = rpcCalls(f.calls, "record_oauth_failure");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].p_provider, p.provider);
    assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  });
}

// ---- Meta ---------------------------------------------------------------------------------------
const META_ROUTES = (over: Partial<Record<string, Route[1]>> = {}): Route[] => [
  [(u) => u.includes("/oauth/access_token") && u.includes("grant_type=fb_exchange_token"), over.long || (() => ok({ access_token: "long-token" }))],
  [(u) => u.includes("/oauth/access_token"), over.short || (() => ok({ access_token: "short-token" }))],
  [(u) => u.includes("/me/adaccounts"), over.accounts || (() => ok({ data: [{ account_id: "111" }, { account_id: "222" }] }))],
  [(u) => u.includes("/me/accounts"), over.pages || (() => ok({ data: [{ id: "page-1", name: "Go Picadera", instagram_business_account: { id: "ig-1", username: "gopicadera" } }] }))],
  [(u) => u.includes("/debug_token"), over.debug || (() => ok({ data: { expires_at: NOW_SEC + 60 * 86400, scopes: ["ads_management", "pages_manage_ads"] } }))],
  rpcRoute,
];
const metaCallback = async (routes: Route[]) => {
  const f = fakeFetch(routes);
  const state = await signState(ENV.OAUTH_STATE_SECRET, "meta_ads", NOW_SEC);
  const res = await handleMetaOAuthCallback(new Request(callbackUrl("meta-oauth-callback", { state, code: "the-code" })), deps(f.fn));
  return { res, f };
};

test("meta start: asks once for every permission the ads work needs, on the pinned Graph version", async () => {
  const res = await handleMetaOAuthStart(startRequest(), deps(fakeFetch([ownerRoute()]).fn));
  const u = new URL((await res.json() as { url: string }).url);
  assert.equal(u.pathname, `/${META_GRAPH_VERSION}/dialog/oauth`);
  assert.equal(META_GRAPH_VERSION, "v26.0");
  const scopes = (u.searchParams.get("scope") || "").split(",");
  for (const s of ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "business_management", "instagram_basic"]) {
    assert.ok(scopes.includes(s), `scope ${s} missing`);
  }
  assert.equal(u.searchParams.get("config_id"), null);
});

test("meta start: uses a Login-for-Business configuration instead of a scope list when one is set", async () => {
  const res = await handleMetaOAuthStart(startRequest(), deps(fakeFetch([ownerRoute()]).fn, { ...ENV, META_LOGIN_CONFIG_ID: "cfg-9" }));
  const u = new URL((await res.json() as { url: string }).url);
  assert.equal(u.searchParams.get("config_id"), "cfg-9");
  assert.equal(u.searchParams.get("scope"), null);
});

test("meta callback: saves the long-lived token, every ad account, the Page, its Instagram and the expiry", async () => {
  const { res, f } = await metaCallback(META_ROUTES());
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_provider, "meta_ads");
  assert.equal(saved.p_access_token, "long-token");
  assert.equal(saved.p_account_id, "111,222");
  assert.deepEqual(saved.p_details.pages, [{ id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } }]);
  assert.equal(saved.p_details.token_expires_at, new Date((NOW_SEC + 60 * 86400) * 1000).toISOString());
  // The app secret only ever travels to Meta, never to the database.
  assert.ok(!JSON.stringify(saved).includes("meta-secret"));
});

test("meta callback: keeps the short-lived token if the long-lived exchange fails", async () => {
  const { res, f } = await metaCallback(META_ROUTES({ long: () => err(400, { error: { message: "nope" } }) }));
  assert.equal(location(res).searchParams.get("status"), "connected");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection")[0].p_access_token, "short-token");
});

test("meta callback: a token that never expires is recorded as such", async () => {
  const { f } = await metaCallback(META_ROUTES({ debug: () => ok({ data: { expires_at: 0, scopes: [] } }) }));
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection")[0].p_details.token_expires_at, null);
});

test("meta callback: failing Page and expiry lookups do not undo a good connection", async () => {
  const { res, f } = await metaCallback(META_ROUTES({
    pages: () => err(403, { error: { message: "missing permission" } }),
    debug: () => { throw new Error("network down"); },
  }));
  assert.equal(location(res).searchParams.get("status"), "connected");
  assert.deepEqual(rpcCalls(f.calls, "apply_oauth_connection")[0].p_details, {});
});

test("meta callback: a failed code exchange is recorded and nothing is saved", async () => {
  const { res, f } = await metaCallback(META_ROUTES({ short: () => err(400, { error: { message: "Invalid verification code" } }) }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  assert.match(rpcCalls(f.calls, "record_oauth_failure")[0].p_reason, /Invalid verification code/);
});

// ---- TikTok -------------------------------------------------------------------------------------
const tiktokCallback = async (tokenReply: Route[1]) => {
  const f = fakeFetch([[(u) => u.includes("business-api.tiktok.com"), tokenReply], rpcRoute]);
  const state = await signState(ENV.OAUTH_STATE_SECRET, "tiktok_ads", NOW_SEC);
  const res = await handleTiktokOAuthCallback(new Request(callbackUrl("tiktok-oauth-callback", { state, auth_code: "ac" })), deps(f.fn));
  return { res, f };
};

test("tiktok callback: connects with TikTok's long-term token, which carries no refresh token", async () => {
  const { res, f } = await tiktokCallback(() => ok({ code: 0, message: "OK", data: { access_token: "tt-token", advertiser_ids: ["7001", 7002] } }));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_access_token, "tt-token");
  assert.equal(saved.p_account_id, "7001,7002");
  assert.equal(saved.p_refresh_token, null);
  const exchange = f.calls.find((c) => c.url.includes("oauth2/access_token"));
  assert.deepEqual(JSON.parse(exchange!.body), { app_id: "tt-app", secret: "tt-secret", auth_code: "ac" });
});

test("tiktok callback: keeps a refresh token if TikTok ever sends one", async () => {
  const { f } = await tiktokCallback(() => ok({ code: 0, data: { access_token: "tt-token", advertiser_ids: [], refresh_token: "tt-refresh" } }));
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection")[0].p_refresh_token, "tt-refresh");
});

test("tiktok callback: an error code inside an HTTP 200 is a failure", async () => {
  const { res, f } = await tiktokCallback(() => ok({ code: 40001, message: "auth_code expired", data: {} }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  assert.match(rpcCalls(f.calls, "record_oauth_failure")[0].p_reason, /auth_code expired/);
});

// ---- Google -------------------------------------------------------------------------------------
const googleCallback = async (tokenReply: Route[1], env = ENV) => {
  const f = fakeFetch([
    [(u) => u === "https://oauth2.googleapis.com/token", tokenReply],
    [(u) => u.includes("customers:listAccessibleCustomers"), () => ok({ resourceNames: ["customers/1234567890", "customers/2222222222"] })],
    rpcRoute,
  ]);
  const state = await signState(ENV.OAUTH_STATE_SECRET, "google_ads", NOW_SEC);
  const res = await handleGoogleAdsOAuthCallback(new Request(callbackUrl("google-ads-oauth-callback", { state, code: "gc" })), deps(f.fn, env));
  return { res, f };
};

test("google callback: keeps the refresh token as the credential and lists the customer ids", async () => {
  const { res, f } = await googleCallback(() => ok({ access_token: "g-access", refresh_token: "g-refresh" }), { ...ENV, GOOGLE_ADS_DEVELOPER_TOKEN: "dev-tok" });
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_access_token, "g-refresh");
  assert.equal(saved.p_account_id, "1234567890,2222222222");
  const list = f.calls.find((c) => c.url.includes("listAccessibleCustomers"))!;
  assert.ok(list.url.includes(`/${GOOGLE_ADS_API_VERSION}/`));
  assert.equal(GOOGLE_ADS_API_VERSION, "v26");
  assert.equal(list.headers["developer-token"], "dev-tok");
  assert.equal(list.headers.authorization, "Bearer g-access");
});

test("google callback: no refresh token means a failed connection, not a degraded one", async () => {
  const { res, f } = await googleCallback(() => ok({ access_token: "g-access" }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
});
