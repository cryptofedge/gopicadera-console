// The ad-platform connect flow, end to end, with a fake fetch standing in for Meta, TikTok, Google
// and Supabase's REST API. Runs under Node's built-in test runner: `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleMetaOAuthStart, handleMetaOAuthCallback,
  handleTiktokOAuthStart, handleTiktokOAuthCallback,
  handleGoogleAdsOAuthStart, handleGoogleAdsOAuthCallback,
  oauthStateKey,
} from "./handlers.ts";
import type { Deps } from "./handlers.ts";
import { signState, verifyState, META_GRAPH_VERSION, GOOGLE_ADS_API_VERSION } from "./oauth-lib.ts";
import { hmacSha256Hex } from "./stripe-lib.ts";
import { loadAdsApps } from "./ads-apps.ts";

const SUPA = "https://proj.supabase.co";
const ADMIN = "https://admin.example";
const NOW_MS = Date.UTC(2026, 9, 28, 12, 0, 0);
const NOW_SEC = Math.floor(NOW_MS / 1000);

// No OAUTH_STATE_SECRET: the normal setup, where the state key is derived from the service-role key.
// The app ids and secrets are the env override; the ads_apps path has tests of its own below.
const ENV: Record<string, string> = {
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_ANON_KEY: "anon-key",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  TIKTOK_APP_ID: "tt-app",
  TIKTOK_APP_SECRET: "tt-secret",
  GOOGLE_ADS_CLIENT_ID: "g-client",
  GOOGLE_ADS_CLIENT_SECRET: "g-secret",
  ADMIN_URL: ADMIN,
};
// What every function derives when OAUTH_STATE_SECRET is not set: HMAC-SHA256(service key, label).
const STATE_KEY = await hmacSha256Hex("service-key", "gopicadera-oauth-state-v1");

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
// The ads_apps table as the service role reads it.
const appsRoute = (rows: unknown[]): Route => [(u) => u.startsWith(`${SUPA}/rest/v1/ads_apps`), () => ok(rows)];
const appsReads = (calls: Call[]) => calls.filter((c) => c.url.startsWith(`${SUPA}/rest/v1/ads_apps`));
const withoutEnv = (...keys: string[]) => Object.fromEntries(Object.entries(ENV).filter(([k]) => !keys.includes(k)));

const PROVIDERS = [
  {
    name: "meta", provider: "meta_ads", appEnv: "META_APP_ID", secretEnv: "META_APP_SECRET",
    start: handleMetaOAuthStart, callback: handleMetaOAuthCallback, callbackPath: "meta-oauth-callback",
    errorParams: { error: "access_denied", error_description: "The user denied" },
    dbApp: { provider: "meta_ads", app_id: "1234567890", app_secret: "db-meta-secret", login_config_id: null },
  },
  {
    name: "tiktok", provider: "tiktok_ads", appEnv: "TIKTOK_APP_ID", secretEnv: "TIKTOK_APP_SECRET",
    start: handleTiktokOAuthStart, callback: handleTiktokOAuthCallback, callbackPath: "tiktok-oauth-callback",
    errorParams: { error: "access_denied" },
    dbApp: { provider: "tiktok_ads", app_id: "7300000000000000001", app_secret: "db-tt-secret", login_config_id: null },
  },
  {
    name: "google", provider: "google_ads", appEnv: "GOOGLE_ADS_CLIENT_ID", secretEnv: "GOOGLE_ADS_CLIENT_SECRET",
    start: handleGoogleAdsOAuthStart, callback: handleGoogleAdsOAuthCallback, callbackPath: "google-ads-oauth-callback",
    errorParams: { error: "access_denied" },
    dbApp: { provider: "google_ads", app_id: "1234-abc.apps.googleusercontent.com", app_secret: "db-g-secret", login_config_id: null },
  },
] as const;

const callbackUrl = (path: string, params: Record<string, string>) => {
  const u = new URL(`${SUPA}/functions/v1/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};
const startRequest = (method = "POST", auth = "Bearer user-jwt") =>
  new Request(`${SUPA}/functions/v1/x`, { method, headers: { origin: "https://admin.gopicadera.com", ...(auth ? { authorization: auth } : {}) } });
// The client id the platform's consent URL names (Meta: client_id, TikTok: app_id, Google: client_id).
const consentAppId = (url: string) => new URL(url).searchParams.get("client_id") ?? new URL(url).searchParams.get("app_id");

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

  test(`${p.name} start: says not_configured until the app id and secret are saved somewhere`, async () => {
    for (const missing of [p.appEnv, p.secretEnv]) {
      const f = fakeFetch([ownerRoute(), appsRoute([])]);
      const res = await p.start(startRequest(), deps(f.fn, withoutEnv(missing)));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "not_configured" });
      assert.equal(appsReads(f.calls).length, 1, "looked for the owner's app once");
    }
  });

  test(`${p.name} start: hands an owner a consent URL with a state only this provider accepts`, async () => {
    const res = await p.start(startRequest(), deps(fakeFetch([ownerRoute()]).fn));
    assert.equal(res.status, 200);
    const { url } = await res.json() as { url: string };
    const u = new URL(url);
    assert.equal(u.searchParams.get("redirect_uri"), `${SUPA}/functions/v1/${p.callbackPath}`);
    const state = u.searchParams.get("state");
    assert.deepEqual(await verifyState(STATE_KEY, p.provider, state, NOW_SEC), { ok: true });
    const other = p.provider === "meta_ads" ? "tiktok_ads" : "meta_ads";
    assert.equal((await verifyState(STATE_KEY, other, state, NOW_SEC)).ok, false);
  });

  // ---- where the app comes from -----------------------------------------------------------------
  test(`${p.name} start: env app id and secret win over the owner's saved app, without reading it`, async () => {
    const f = fakeFetch([ownerRoute(), appsRoute([p.dbApp])]);
    const res = await p.start(startRequest(), deps(f.fn));
    assert.equal(consentAppId((await res.json() as { url: string }).url), ENV[p.appEnv]);
    assert.equal(appsReads(f.calls).length, 0);
  });

  test(`${p.name} start: without env vars it uses the app the owner saved in Canales`, async () => {
    const f = fakeFetch([ownerRoute(), appsRoute([p.dbApp])]);
    const res = await p.start(startRequest(), deps(f.fn, withoutEnv(p.appEnv, p.secretEnv)));
    assert.equal(res.status, 200);
    assert.equal(consentAppId((await res.json() as { url: string }).url), p.dbApp.app_id);
    const [read] = appsReads(f.calls);
    assert.equal(read.headers.authorization, "Bearer service-key", "read with the service role");
    assert.match(read.url, /select=provider,app_id,app_secret,login_config_id/);
    assert.ok(read.url.includes(`provider=in.(${p.provider})`));
  });

  test(`${p.name} start: a saved app id with no secret is not an app`, async () => {
    const f = fakeFetch([ownerRoute(), appsRoute([{ ...p.dbApp, app_secret: null }])]);
    const res = await p.start(startRequest(), deps(f.fn, withoutEnv(p.appEnv, p.secretEnv)));
    assert.equal(res.status, 503);
  });

  // ---- callback: the cases that must never touch the database ------------------------------------
  test(`${p.name} callback: a bare GET answers 503 until the owner saves the app (what check-connect reads)`, async () => {
    const f = fakeFetch([appsRoute([])]);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, {})), deps(f.fn, withoutEnv(p.appEnv, p.secretEnv)));
    assert.equal(res.status, 503);
    assert.deepEqual(f.calls.map((c) => c.method), ["GET"], "one read of ads_apps, nothing written");
  });

  test(`${p.name} callback: 503 with no service key, whatever else is set`, async () => {
    const f = fakeFetch([]);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, {})), deps(f.fn, withoutEnv("SUPABASE_SERVICE_ROLE_KEY")));
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

  test(`${p.name} callback: a bare GET with the owner's saved app also bounces`, async () => {
    const f = fakeFetch([appsRoute([p.dbApp])]);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, {})), deps(f.fn, withoutEnv(p.appEnv, p.secretEnv)));
    assert.equal(res.status, 302);
    assert.equal(appsReads(f.calls).length, 1);
  });

  for (const [label, makeState] of [
    ["forged", async () => (await signState("wrong-secret", p.provider, NOW_SEC))],
    ["signed with a key derived from another project's service key",
      async () => (await signState(await hmacSha256Hex("other-service-key", "gopicadera-oauth-state-v1"), p.provider, NOW_SEC))],
    ["expired", async () => (await signState(STATE_KEY, p.provider, NOW_SEC - 3600))],
    ["meant for another provider", async () => (await signState(STATE_KEY, p.provider === "google_ads" ? "meta_ads" : "google_ads", NOW_SEC))],
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
    const state = await signState(STATE_KEY, p.provider, NOW_SEC);
    const res = await p.callback(new Request(callbackUrl(p.callbackPath, { state, ...p.errorParams })), deps(f.fn));
    assert.equal(location(res).searchParams.get("status"), "error");
    const failures = rpcCalls(f.calls, "record_oauth_failure");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].p_provider, p.provider);
    assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  });
}

// ---- the state key ------------------------------------------------------------------------------
test("state key: derived from the service-role key when OAUTH_STATE_SECRET is not set", async () => {
  assert.equal(await oauthStateKey(ENV), STATE_KEY);
  assert.equal(STATE_KEY.length, 64);
  assert.notEqual(STATE_KEY, ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.notEqual(await oauthStateKey({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: "other-service-key" }), STATE_KEY);
  assert.equal(await oauthStateKey(withoutEnv("SUPABASE_SERVICE_ROLE_KEY")), "");
});

test("state key: a state signed with the derived key gets past the check (here, to the denied-consent record)", async () => {
  const f = fakeFetch([rpcRoute]);
  const state = await signState(STATE_KEY, "meta_ads", NOW_SEC);
  await handleMetaOAuthCallback(new Request(callbackUrl("meta-oauth-callback", { state, error: "access_denied" })), deps(f.fn));
  assert.equal(rpcCalls(f.calls, "record_oauth_failure").length, 1);
});

test("state key: an explicit OAUTH_STATE_SECRET takes precedence over the derived key", async () => {
  const env = { ...ENV, OAUTH_STATE_SECRET: "explicit-secret" };
  assert.equal(await oauthStateKey(env), "explicit-secret");

  const start = await handleTiktokOAuthStart(startRequest(), deps(fakeFetch([ownerRoute()]).fn, env));
  const state = new URL((await start.json() as { url: string }).url).searchParams.get("state");
  assert.equal((await verifyState("explicit-secret", "tiktok_ads", state, NOW_SEC)).ok, true);
  assert.equal((await verifyState(STATE_KEY, "tiktok_ads", state, NOW_SEC)).ok, false);

  const derived = fakeFetch([]);
  await handleTiktokOAuthCallback(new Request(callbackUrl("tiktok-oauth-callback", {
    state: await signState(STATE_KEY, "tiktok_ads", NOW_SEC), error: "access_denied",
  })), deps(derived.fn, env));
  assert.equal(derived.calls.length, 0, "the derived key is refused while an explicit one is set");

  const explicit = fakeFetch([rpcRoute]);
  await handleTiktokOAuthCallback(new Request(callbackUrl("tiktok-oauth-callback", {
    state: await signState("explicit-secret", "tiktok_ads", NOW_SEC), error: "access_denied",
  })), deps(explicit.fn, env));
  assert.equal(rpcCalls(explicit.calls, "record_oauth_failure").length, 1);
});

// ---- the app loader -----------------------------------------------------------------------------
test("apps: env pairs win, one read covers the rest, and a half-filled env pair does not count", async () => {
  const f = fakeFetch([appsRoute([
    { provider: "tiktok_ads", app_id: " 7300 ", app_secret: "db-tt", login_config_id: null },
    { provider: "google_ads", app_id: "g.apps.googleusercontent.com", app_secret: null, login_config_id: null },
  ])]);
  const env = { ...withoutEnv("TIKTOK_APP_ID", "TIKTOK_APP_SECRET", "GOOGLE_ADS_CLIENT_SECRET"), META_LOGIN_CONFIG_ID: "42" };
  const apps = await loadAdsApps(env, f.fn, ["meta_ads", "tiktok_ads", "google_ads"]);
  assert.deepEqual(apps.meta_ads, { appId: "meta-app", appSecret: "meta-secret", loginConfigId: "42", source: "env" });
  assert.deepEqual(apps.tiktok_ads, { appId: "7300", appSecret: "db-tt", loginConfigId: "", source: "database" });
  assert.equal(apps.google_ads, undefined, "a saved id without a secret, and an env id without its secret");
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].url.includes("provider=in.(tiktok_ads,google_ads)"));
});

test("apps: a failed read is the same as no app, never an exception", async () => {
  const down = fakeFetch([[(u) => u.includes("/ads_apps"), () => err(404, { message: "relation \"ads_apps\" does not exist" })]]);
  assert.deepEqual(await loadAdsApps(withoutEnv("META_APP_ID"), down.fn, ["meta_ads"]), {});
  const offline = fakeFetch([[() => true, () => { throw new TypeError("fetch failed"); }]]);
  assert.deepEqual(await loadAdsApps(withoutEnv("META_APP_ID"), offline.fn, ["meta_ads"]), {});
});

// ---- Meta ---------------------------------------------------------------------------------------
const META_ROUTES = (over: Partial<Record<string, Route[1]>> = {}): Route[] => [
  [(u) => u.includes("/oauth/access_token") && u.includes("grant_type=fb_exchange_token"), over.long || (() => ok({ access_token: "long-token" }))],
  [(u) => u.includes("/oauth/access_token"), over.short || (() => ok({ access_token: "short-token" }))],
  [(u) => u.includes("/me/adaccounts"), over.accounts || (() => ok({ data: [{ account_id: "111", name: "Go Picadera" }, { account_id: "222", name: "Cuenta de Fellito" }] }))],
  [(u) => u.includes("/me/accounts"), over.pages || (() => ok({ data: [{ id: "page-1", name: "Go Picadera", instagram_business_account: { id: "ig-1", username: "gopicadera" } }] }))],
  [(u) => u.includes("/debug_token"), over.debug || (() => ok({ data: { expires_at: NOW_SEC + 60 * 86400, scopes: ["ads_management", "pages_manage_ads"] } }))],
  appsRoute([PROVIDERS[0].dbApp]),
  rpcRoute,
];
const metaCallback = async (routes: Route[], env = ENV) => {
  const f = fakeFetch(routes);
  const state = await signState(STATE_KEY, "meta_ads", NOW_SEC);
  const res = await handleMetaOAuthCallback(new Request(callbackUrl("meta-oauth-callback", { state, code: "the-code" })), deps(f.fn, env));
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

test("meta start: the configuration id saved with the owner's app is used too", async () => {
  const f = fakeFetch([ownerRoute(), appsRoute([{ ...PROVIDERS[0].dbApp, login_config_id: "777" }])]);
  const res = await handleMetaOAuthStart(startRequest(), deps(f.fn, withoutEnv("META_APP_ID", "META_APP_SECRET")));
  assert.equal(new URL((await res.json() as { url: string }).url).searchParams.get("config_id"), "777");
});

test("meta callback: saves the long-lived token, every reachable ad account and Page with names, and the expiry -- and chooses none", async () => {
  const { res, f } = await metaCallback(META_ROUTES());
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_provider, "meta_ads");
  assert.equal(saved.p_access_token, "long-token");
  assert.deepEqual(saved.p_details.ad_accounts, [{ id: "111", name: "Go Picadera" }, { id: "222", name: "Cuenta de Fellito" }]);
  assert.deepEqual(saved.p_details.pages, [{ id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } }]);
  assert.equal(saved.p_details.token_expires_at, new Date((NOW_SEC + 60 * 86400) * 1000).toISOString());
  // Only the list of what the login reaches: the database never stores it as the choice, and nothing here
  // names a store_id or a Page to use.
  assert.equal(saved.p_account_id, "111,222");
  assert.ok(!("store_id" in saved) && !("page_id" in saved.p_details) && !("chosen_at" in saved.p_details));
  // The app secret only ever travels to Meta, never to the database.
  assert.ok(!JSON.stringify(saved).includes("meta-secret"));
  const accounts = new URL(f.calls.find((c) => c.url.includes("/me/adaccounts"))!.url);
  assert.equal(accounts.searchParams.get("fields"), "account_id,name");
});

test("meta callback: follows Meta's paging through a long list of ad accounts", async () => {
  const { f } = await metaCallback(META_ROUTES({
    accounts: (c) => c.url.includes("after=p2")
      ? ok({ data: [{ account_id: "333", name: "Tercera" }] })
      : ok({ data: [{ account_id: "111", name: "Go Picadera" }], paging: { next: "https://graph.facebook.com/v26.0/me/adaccounts?after=p2" } }),
  }));
  assert.deepEqual(rpcCalls(f.calls, "apply_oauth_connection")[0].p_details.ad_accounts.map((a: { id: string }) => a.id), ["111", "333"]);
});

test("meta callback: works the same with the app the owner saved in Canales", async () => {
  const { res, f } = await metaCallback(META_ROUTES(), withoutEnv("META_APP_ID", "META_APP_SECRET"));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const exchange = new URL(f.calls.find((c) => c.url.includes("/oauth/access_token"))!.url);
  assert.deepEqual([exchange.searchParams.get("client_id"), exchange.searchParams.get("client_secret")], ["1234567890", "db-meta-secret"]);
  assert.ok(!JSON.stringify(rpcCalls(f.calls, "apply_oauth_connection")).includes("db-meta-secret"));
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

test("meta callback: failing Page, account and expiry lookups do not undo a good connection", async () => {
  const { res, f } = await metaCallback(META_ROUTES({
    pages: () => err(403, { error: { message: "missing permission" } }),
    accounts: () => err(500, { error: { message: "try later" } }),
    debug: () => { throw new Error("network down"); },
  }));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.deepEqual(saved.p_details, {});
  assert.equal(saved.p_account_id, "");
});

test("meta callback: a failed code exchange is recorded and nothing is saved", async () => {
  const { res, f } = await metaCallback(META_ROUTES({ short: () => err(400, { error: { message: "Invalid verification code" } }) }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  assert.match(rpcCalls(f.calls, "record_oauth_failure")[0].p_reason, /Invalid verification code/);
});

// ---- TikTok -------------------------------------------------------------------------------------
const tiktokCallback = async (tokenReply: Route[1], advertisersReply: Route[1] = () => ok({
  code: 0, data: { list: [{ advertiser_id: "7001", advertiser_name: "Go Picadera" }, { advertiser_id: 7002, advertiser_name: "Otra" }] },
}), env = ENV) => {
  const f = fakeFetch([
    [(u) => u.includes("/oauth2/advertiser/get/"), advertisersReply],
    [(u) => u.includes("business-api.tiktok.com"), tokenReply],
    appsRoute([PROVIDERS[1].dbApp]),
    rpcRoute,
  ]);
  const state = await signState(STATE_KEY, "tiktok_ads", NOW_SEC);
  const res = await handleTiktokOAuthCallback(new Request(callbackUrl("tiktok-oauth-callback", { state, auth_code: "ac" })), deps(f.fn, env));
  return { res, f };
};

test("tiktok callback: connects with TikTok's long-term token, which carries no refresh token", async () => {
  const { res, f } = await tiktokCallback(() => ok({ code: 0, message: "OK", data: { access_token: "tt-token", advertiser_ids: ["7001", 7002] } }));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_access_token, "tt-token");
  assert.equal(saved.p_refresh_token, null);
  const exchange = f.calls.find((c) => c.url.includes("oauth2/access_token"));
  assert.deepEqual(JSON.parse(exchange!.body), { app_id: "tt-app", secret: "tt-secret", auth_code: "ac" });
});

test("tiktok callback: records the advertisers from the token with their names, and chooses none", async () => {
  const { f } = await tiktokCallback(() => ok({ code: 0, data: { access_token: "tt-token", advertiser_ids: ["7001", 7002] } }));
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.deepEqual(saved.p_details, { ad_accounts: [{ id: "7001", name: "Go Picadera" }, { id: "7002", name: "Otra" }] });
  assert.equal(saved.p_account_id, "7001,7002");
  assert.ok(!("store_id" in saved));
  const names = new URL(f.calls.find((c) => c.url.includes("/oauth2/advertiser/get/"))!.url);
  assert.deepEqual([names.searchParams.get("app_id"), names.searchParams.get("secret")], ["tt-app", "tt-secret"]);
  assert.equal(f.calls.find((c) => c.url.includes("/oauth2/advertiser/get/"))!.headers["access-token"], "tt-token");
});

test("tiktok callback: without names the advertisers are still recorded", async () => {
  const { res, f } = await tiktokCallback(
    () => ok({ code: 0, data: { access_token: "tt-token", advertiser_ids: ["7001"] } }),
    () => ok({ code: 40001, message: "app_id or secret is invalid" }),
  );
  assert.equal(location(res).searchParams.get("status"), "connected");
  assert.deepEqual(rpcCalls(f.calls, "apply_oauth_connection")[0].p_details, { ad_accounts: [{ id: "7001", name: null }] });
});

test("tiktok callback: keeps a refresh token if TikTok ever sends one", async () => {
  const { f } = await tiktokCallback(() => ok({ code: 0, data: { access_token: "tt-token", advertiser_ids: [], refresh_token: "tt-refresh" } }));
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection")[0].p_refresh_token, "tt-refresh");
  assert.equal(f.calls.filter((c) => c.url.includes("/oauth2/advertiser/get/")).length, 0, "no advertisers, no name lookup");
});

test("tiktok callback: works the same with the app the owner saved in Canales", async () => {
  const { f } = await tiktokCallback(() => ok({ code: 0, data: { access_token: "tt-token", advertiser_ids: ["7001"] } }), undefined,
    withoutEnv("TIKTOK_APP_ID", "TIKTOK_APP_SECRET"));
  const exchange = f.calls.find((c) => c.url.includes("oauth2/access_token"));
  assert.deepEqual(JSON.parse(exchange!.body), { app_id: "7300000000000000001", secret: "db-tt-secret", auth_code: "ac" });
});

test("tiktok callback: an error code inside an HTTP 200 is a failure", async () => {
  const { res, f } = await tiktokCallback(() => ok({ code: 40001, message: "auth_code expired", data: {} }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
  assert.match(rpcCalls(f.calls, "record_oauth_failure")[0].p_reason, /auth_code expired/);
});

// ---- Google -------------------------------------------------------------------------------------
const GOOGLE_NAMES: Record<string, string> = { "1234567890": "Go Picadera", "2222222222": "Cuenta de Fellito" };
const googleCallback = async (tokenReply: Route[1], env = ENV, opts: { ids?: string[]; search?: Route[1] } = {}) => {
  const ids = opts.ids || ["1234567890", "2222222222"];
  const f = fakeFetch([
    [(u) => u === "https://oauth2.googleapis.com/token", tokenReply],
    [(u) => u.includes("customers:listAccessibleCustomers"), () => ok({ resourceNames: ids.map((id) => `customers/${id}`) })],
    [(u) => u.includes("/googleAds:search"), opts.search || ((c) => {
      const id = c.url.match(/customers\/(\d+)\//)![1];
      return GOOGLE_NAMES[id] ? ok({ results: [{ customer: { descriptiveName: GOOGLE_NAMES[id] } }] }) : err(403, { error: { status: "PERMISSION_DENIED", message: "no" } });
    })],
    appsRoute([PROVIDERS[2].dbApp]),
    rpcRoute,
  ]);
  const state = await signState(STATE_KEY, "google_ads", NOW_SEC);
  const res = await handleGoogleAdsOAuthCallback(new Request(callbackUrl("google-ads-oauth-callback", { state, code: "gc" })), deps(f.fn, env));
  return { res, f };
};

test("google callback: keeps the refresh token as the credential and lists the customer ids with names, choosing none", async () => {
  const { res, f } = await googleCallback(() => ok({ access_token: "g-access", refresh_token: "g-refresh" }), { ...ENV, GOOGLE_ADS_DEVELOPER_TOKEN: "dev-tok" });
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.equal(saved.p_access_token, "g-refresh");
  assert.equal(saved.p_account_id, "1234567890,2222222222");
  assert.deepEqual(saved.p_details, { ad_accounts: [{ id: "1234567890", name: "Go Picadera" }, { id: "2222222222", name: "Cuenta de Fellito" }] });
  assert.ok(!("store_id" in saved));
  const list = f.calls.find((c) => c.url.includes("listAccessibleCustomers"))!;
  assert.ok(list.url.includes(`/${GOOGLE_ADS_API_VERSION}/`));
  assert.equal(GOOGLE_ADS_API_VERSION, "v26");
  assert.equal(list.headers["developer-token"], "dev-tok");
  assert.equal(list.headers.authorization, "Bearer g-access");
  const search = f.calls.find((c) => c.url.includes("/customers/1234567890/googleAds:search"))!;
  assert.equal(JSON.parse(search.body).query, "SELECT customer.descriptive_name FROM customer");
  assert.equal(search.headers["login-customer-id"], undefined);
});

test("google callback: with no developer token (sunset 2026-09-09) the names are still fetched and no token header is sent", async () => {
  const { f } = await googleCallback(() => ok({ access_token: "g-access", refresh_token: "g-refresh" }));
  assert.deepEqual(rpcCalls(f.calls, "apply_oauth_connection")[0].p_details.ad_accounts.map((a: { name: string }) => a.name), ["Go Picadera", "Cuenta de Fellito"]);
  const google = f.calls.filter((c) => c.url.includes("googleads.googleapis.com"));
  assert.equal(google.length, 3);
  assert.ok(google.every((c) => !("developer-token" in c.headers)));
});

test("google callback: a name that cannot be read is null, and at most 20 names are looked up", async () => {
  const ids = Array.from({ length: 25 }, (_, i) => String(3000000000 + i));
  const { f } = await googleCallback(() => ok({ access_token: "g-access", refresh_token: "g-refresh" }), ENV, { ids });
  const saved = rpcCalls(f.calls, "apply_oauth_connection")[0];
  assert.equal(saved.p_details.ad_accounts.length, 25);
  assert.ok(saved.p_details.ad_accounts.every((a: { name: string | null }) => a.name === null));
  assert.equal(f.calls.filter((c) => c.url.includes("googleAds:search")).length, 20);
});

test("google callback: a Cloud project without API access still connects, with no accounts yet", async () => {
  const notApproved = { error: { status: "PERMISSION_DENIED", message: "x", details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }, message: "not approved" }] }] } };
  const f = fakeFetch([
    [(u) => u === "https://oauth2.googleapis.com/token", () => ok({ access_token: "g-access", refresh_token: "g-refresh" })],
    [(u) => u.includes("customers:listAccessibleCustomers"), () => err(403, notApproved)],
    rpcRoute,
  ]);
  const state = await signState(STATE_KEY, "google_ads", NOW_SEC);
  const res = await handleGoogleAdsOAuthCallback(new Request(callbackUrl("google-ads-oauth-callback", { state, code: "gc" })), deps(f.fn));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const [saved] = rpcCalls(f.calls, "apply_oauth_connection");
  assert.deepEqual([saved.p_account_id, saved.p_details], ["", {}]);
});

test("google callback: works the same with the app the owner saved in Canales", async () => {
  const { res, f } = await googleCallback(() => ok({ access_token: "g-access", refresh_token: "g-refresh" }), withoutEnv("GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"));
  assert.equal(location(res).searchParams.get("status"), "connected");
  const exchange = new URLSearchParams(f.calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!.body);
  assert.deepEqual([exchange.get("client_id"), exchange.get("client_secret")], ["1234-abc.apps.googleusercontent.com", "db-g-secret"]);
});

test("google callback: no refresh token means a failed connection, not a degraded one", async () => {
  const { res, f } = await googleCallback(() => ok({ access_token: "g-access" }));
  assert.equal(location(res).searchParams.get("status"), "error");
  assert.equal(rpcCalls(f.calls, "apply_oauth_connection").length, 0);
});
