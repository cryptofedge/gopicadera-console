// The ads worker and its platform adapters, against fake Meta / TikTok / Google / Supabase. `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdsError, metaToCampaigns, metaError, tiktokToCampaigns, tiktokError, googleToCampaigns, googleError,
  googleStatusOperation, metaStatus, tiktokStatus, googleStatus, validateLaunch, GOOGLE_PROJECT_ACCESS_MESSAGE,
} from "./ads-lib.ts";
import type { LaunchSpec } from "./ads-lib.ts";
import {
  metaListCampaigns, metaSetStatus, tiktokListCampaigns, tiktokSetStatus, googleMintAccessToken, googleListCampaigns, googleSetStatus,
  metaLaunch, tiktokLaunch, googleLaunch, metaAdAccounts, metaPages, tiktokAdvertisers, googleAccessibleAccounts,
} from "./ads-platforms.ts";
import { handleAdsWorker, forgetAdsWorkerSecret, NO_ACCOUNT_CHOSEN } from "./ads-worker.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
type Route = [match: (call: Call) => boolean, reply: (call: Call) => Response | Promise<Response>];
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method || "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : "",
    };
    calls.push(call);
    const route = routes.find(([m]) => m(call));
    if (!route) throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    return route[1](call);
  }) as typeof fetch;
  return { fn, calls };
}
const has = (s: string) => (c: Call) => c.url.includes(s);

// ---------------------------------------------------------------------------------- conversions ---
test("meta: cents become dollars, insights join by campaign, purchases count as orders, archived is ended", () => {
  const rows = metaToCampaigns("111", [
    { id: "c1", name: "Mofongo", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1500", start_time: "2026-10-01T00:00:00-0400" },
    { id: "c2", name: "Old", status: "ARCHIVED", effective_status: "ARCHIVED" },
  ], [
    { campaign_id: "c1", spend: "42.17", impressions: "9000", clicks: "300", inline_link_clicks: "250",
      actions: [{ action_type: "link_click", value: "250" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "7" }] },
  ]);
  assert.deepEqual(rows[0], {
    campaign_id: "c1", account_id: "111", name: "Mofongo", status: "active", platform_status: "ACTIVE",
    daily_budget: 15, spend: 42.17, impressions: 9000, clicks: 250, orders: 7,
    starts_at: "2026-10-01T00:00:00-0400", ends_at: null,
  });
  assert.equal(rows[1].status, "ended");
  assert.equal(rows[1].spend, 0);
  assert.equal(metaStatus("CAMPAIGN_PAUSED", "ACTIVE"), "paused");
});

test("tiktok: dollars stay dollars, only a daily budget is a daily budget, deleted is ended", () => {
  const rows = tiktokToCampaigns("7001", [
    { campaign_id: 9001, campaign_name: "Yaroa", operation_status: "ENABLE", secondary_status: "CAMPAIGN_STATUS_ENABLE", budget: 25, budget_mode: "BUDGET_MODE_DAY" },
    { campaign_id: "9002", campaign_name: "Gone", operation_status: "DISABLE", secondary_status: "CAMPAIGN_STATUS_DELETE", budget: 0, budget_mode: "BUDGET_MODE_INFINITE" },
  ], [{ dimensions: { campaign_id: "9001" }, metrics: { spend: "18.5", impressions: "1200", clicks: "33", conversion: "2" } }]);
  assert.equal(rows[0].daily_budget, 25);
  assert.equal(rows[0].spend, 18.5);
  assert.equal(rows[0].orders, 2);
  assert.equal(rows[0].status, "active");
  assert.equal(rows[1].status, "ended");
  assert.equal(rows[1].daily_budget, null);
  assert.equal(tiktokStatus("DISABLE", "CAMPAIGN_STATUS_DISABLE"), "paused");
});

test("google: micros become dollars, conversions round, statuses map", () => {
  const rows = googleToCampaigns("1234567890", [{
    campaign: { id: "555", name: "Chimi search", status: "ENABLED" },
    campaignBudget: { amountMicros: "20000000" },
    metrics: { costMicros: "12345678", impressions: "800", clicks: "40", conversions: 3.6 },
  }]);
  assert.equal(rows[0].daily_budget, 20);
  assert.equal(rows[0].spend, 12.35);
  assert.equal(rows[0].orders, 4);
  assert.equal(googleStatus("PAUSED"), "paused");
  assert.equal(googleStatus("REMOVED"), "ended");
  assert.deepEqual(googleStatusOperation("1", "2", "end"), { remove: "customers/1/campaigns/2" });
  assert.deepEqual(googleStatusOperation("1", "2", "pause"), { update: { resourceName: "customers/1/campaigns/2", status: "PAUSED" }, updateMask: "status" });
});

test("errors are classified by what the worker should do about them", () => {
  assert.equal(metaError({ error: { code: 190, message: "Session expired" } }, 400)?.kind, "auth");
  assert.equal(metaError({ error: { code: 17, message: "User request limit reached" } }, 400)?.kind, "transient");
  assert.equal(metaError({ error: { code: 100, message: "Invalid parameter" } }, 400)?.kind, "platform");
  assert.equal(metaError({ data: [] }, 200), null);
  assert.equal(tiktokError({ code: 0, data: {} }, 200), null);
  assert.equal(tiktokError({ code: 40100, message: "Too many requests" }, 200)?.kind, "transient");
  assert.equal(tiktokError({ code: 40105, message: "Access token is invalid" }, 200)?.kind, "auth");
  assert.equal(tiktokError({ code: 40002, message: "Budget too low" }, 200)?.kind, "platform");
  const devTok = { error: { status: "PERMISSION_DENIED", message: "x", details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "The developer token is only approved for test accounts." }] }] } };
  assert.equal(googleError(devTok, 403)?.kind, "config");
  assert.equal(googleError({ error: { status: "UNAUTHENTICATED", message: "x" } }, 401)?.kind, "auth");
  assert.equal(googleError({ error: { status: "RESOURCE_EXHAUSTED", message: "x" } }, 429)?.kind, "transient");
  assert.equal(googleError({}, 200), null);
});

// ------------------------------------------------------------------------------------ adapters ---
test("meta adapter: follows paging, then reads lifetime insights", async () => {
  const f = fakeFetch([
    [(c) => c.url.includes("/campaigns") && c.url.includes("after=p2"), () => ok({ data: [{ id: "c2", name: "B", effective_status: "PAUSED" }] })],
    [has("/act_111/campaigns"), () => ok({ data: [{ id: "c1", name: "A", effective_status: "ACTIVE" }], paging: { next: "https://graph.facebook.com/v26.0/act_111/campaigns?after=p2" } })],
    [has("/act_111/insights"), () => ok({ data: [{ campaign_id: "c2", spend: "3.5" }] })],
  ]);
  const rows = await metaListCampaigns(f.fn, "tok", "111");
  assert.deepEqual(rows.map((r) => [r.campaign_id, r.status, r.spend]), [["c1", "active", 0], ["c2", "paused", 3.5]]);
  const first = new URL(f.calls[0].url);
  assert.equal(first.pathname, "/v26.0/act_111/campaigns");
  assert.ok(JSON.parse(first.searchParams.get("effective_status")!).includes("ARCHIVED"));
  assert.equal(new URL(f.calls[2].url).searchParams.get("date_preset"), "maximum");
});

test("meta adapter: pause posts status=PAUSED, end archives", async () => {
  const f = fakeFetch([[has("graph.facebook.com"), () => ok({ success: true })]]);
  await metaSetStatus(f.fn, "tok", "c1", "pause");
  await metaSetStatus(f.fn, "tok", "c1", "end");
  assert.equal(f.calls[0].url, "https://graph.facebook.com/v26.0/c1");
  assert.equal(new URLSearchParams(f.calls[0].body).get("status"), "PAUSED");
  assert.equal(new URLSearchParams(f.calls[1].body).get("status"), "ARCHIVED");
});

test("meta adapter: a dead token surfaces as an auth error", async () => {
  const f = fakeFetch([[has("graph.facebook.com"), () => ok({ error: { code: 190, message: "Error validating access token" } }, 400)]]);
  await assert.rejects(metaListCampaigns(f.fn, "tok", "111"), (e: unknown) => e instanceof AdsError && e.kind === "auth");
});

test("a network failure is retryable, not fatal", async () => {
  const f = fakeFetch([[() => true, () => { throw new TypeError("fetch failed"); }]]);
  await assert.rejects(metaSetStatus(f.fn, "tok", "c1", "pause"), (e: unknown) => e instanceof AdsError && e.kind === "transient");
});

test("tiktok adapter: Access-Token header, every page, lifetime report", async () => {
  const f = fakeFetch([
    [(c) => c.url.includes("/campaign/get/") && c.url.includes("page=1"), () => ok({ code: 0, data: { list: [{ campaign_id: "1", operation_status: "ENABLE" }], page_info: { total_page: 2 } } })],
    [(c) => c.url.includes("/campaign/get/") && c.url.includes("page=2"), () => ok({ code: 0, data: { list: [{ campaign_id: "2", operation_status: "DISABLE" }], page_info: { total_page: 2 } } })],
    [has("/report/integrated/get/"), () => ok({ code: 0, data: { list: [{ dimensions: { campaign_id: "2" }, metrics: { spend: "9" } }], page_info: { total_page: 1 } } })],
  ]);
  const rows = await tiktokListCampaigns(f.fn, "tt-tok", "7001");
  assert.deepEqual(rows.map((r) => [r.campaign_id, r.status, r.spend]), [["1", "active", 0], ["2", "paused", 9]]);
  assert.ok(f.calls.every((c) => c.headers["access-token"] === "tt-tok"));
  assert.equal(new URL(f.calls[2].url).searchParams.get("query_lifetime"), "true");
});

test("tiktok adapter: status update names the advertiser and the campaign", async () => {
  const f = fakeFetch([[has("/campaign/status/update/"), () => ok({ code: 0, data: {} })]]);
  await tiktokSetStatus(f.fn, "tt-tok", "7001", "9001", "end");
  assert.deepEqual(JSON.parse(f.calls[0].body), { advertiser_id: "7001", campaign_ids: ["9001"], operation_status: "DELETE" });
});

test("google adapter: mints a token, sends the developer token, pages through results", async () => {
  const f = fakeFetch([
    [has("oauth2.googleapis.com/token"), () => ok({ access_token: "g-access", expires_in: 3599 })],
    [(c) => c.url.includes("googleAds:search") && c.body.includes("pageToken"), () => ok({ results: [{ campaign: { id: "2", status: "PAUSED" } }] })],
    [has("googleAds:search"), () => ok({ results: [{ campaign: { id: "1", status: "ENABLED" } }], nextPageToken: "n2" })],
  ]);
  const accessToken = await googleMintAccessToken(f.fn, "cid", "csecret", "refresh-1");
  assert.equal(new URLSearchParams(f.calls[0].body).get("grant_type"), "refresh_token");
  const auth = { accessToken, developerToken: "dev-tok", loginCustomerId: "9998887777" };
  const rows = await googleListCampaigns(f.fn, auth, "1234567890");
  assert.deepEqual(rows.map((r) => [r.campaign_id, r.status]), [["1", "active"], ["2", "paused"]]);
  const search = f.calls[1];
  assert.equal(search.url, "https://googleads.googleapis.com/v26/customers/1234567890/googleAds:search");
  assert.equal(search.headers["developer-token"], "dev-tok");
  assert.equal(search.headers["login-customer-id"], "9998887777");
  assert.equal(search.headers.authorization, "Bearer g-access");
});

test("google adapter: a revoked refresh token is an auth error", async () => {
  const revoked = fakeFetch([[() => true, () => ok({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)]]);
  await assert.rejects(googleMintAccessToken(revoked.fn, "cid", "cs", "r"), (e: unknown) => e instanceof AdsError && e.kind === "auth");
});

test("google adapter: no developer token (sunset 2026-09-09) is fine -- the header is simply not sent", async () => {
  const f = fakeFetch([[has("campaigns:mutate"), () => ok({ results: [{}] })]]);
  await googleSetStatus(f.fn, { accessToken: "a", developerToken: "", loginCustomerId: "" }, "1", "2", "pause");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].headers["developer-token"], undefined);
  assert.equal(f.calls[0].headers.authorization, "Bearer a");
});

test("google errors: a Cloud project without Explorer access is a config error with the fix in Spanish", () => {
  const body = (code: string, message: string) => ({ error: { status: "PERMISSION_DENIED", message: "The caller does not have permission",
    details: [{ errors: [{ errorCode: { authorizationError: code }, message }] }] } });
  const notApproved = googleError(body("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION", "The Google Cloud project is not approved for production access."), 403);
  assert.equal(notApproved?.kind, "config");
  assert.equal(notApproved?.message, GOOGLE_PROJECT_ACCESS_MESSAGE);
  assert.match(GOOGLE_PROJECT_ACCESS_MESSAGE, /^El proyecto de Google Cloud aún no tiene acceso Explorer/);
  // Google's known issue after 2026-09-09: a generic AUTHORIZATION_ERROR that is plainly about the project.
  const upgraded = googleError(body("AUTHORIZATION_ERROR", "The Cloud project's access level does not allow this request."), 403);
  assert.deepEqual([upgraded?.kind, upgraded?.message], ["config", GOOGLE_PROJECT_ACCESS_MESSAGE]);
  // Any other AUTHORIZATION_ERROR keeps its old meaning: the login lost permission, reconnect.
  const other = googleError(body("AUTHORIZATION_ERROR", "Authorization of the user failed."), 403);
  assert.equal(other?.kind, "auth");
  assert.equal(googleError(body("USER_PERMISSION_DENIED", "User doesn't have permission to access customer."), 403)?.kind, "auth");
});

test("account lists: Meta accounts and Pages with names, TikTok advertisers, Google customers with names", async () => {
  const f = fakeFetch([
    [has("/me/adaccounts"), () => ok({ data: [{ account_id: "111", id: "act_111", name: "Go Picadera" }, { account_id: 222 }] })],
    [has("/me/accounts"), () => ok({ data: [{ id: "page-1", name: "Go Picadera", instagram_business_account: { id: "ig-1", username: "gopicadera" } }, { id: "page-2" }] })],
    [has("/oauth2/advertiser/get/"), () => ok({ code: 0, data: { list: [{ advertiser_id: 7001, advertiser_name: "Go Picadera" }] } })],
    [has("listAccessibleCustomers"), () => ok({ resourceNames: ["customers/1234567890", "customers/2222222222"] })],
    [has("/customers/2222222222/googleAds:search"), () => ok({ results: [{ customer: { descriptiveName: "Nueva" } }] })],
  ]);
  assert.deepEqual(await metaAdAccounts(f.fn, "tok"), [{ id: "111", name: "Go Picadera" }, { id: "222", name: null }]);
  assert.deepEqual(await metaPages(f.fn, "tok"), [
    { id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } },
    { id: "page-2", name: null, instagram: null },
  ]);
  assert.deepEqual(await tiktokAdvertisers(f.fn, "app", "sec", "tt"), [{ id: "7001", name: "Go Picadera" }]);
  // A name already known is not looked up again.
  const google = await googleAccessibleAccounts(f.fn, { accessToken: "a", developerToken: "" }, [{ id: "1234567890", name: "Go Picadera" }]);
  assert.deepEqual(google, [{ id: "1234567890", name: "Go Picadera" }, { id: "2222222222", name: "Nueva" }]);
  assert.equal(f.calls.filter((c) => c.url.includes("googleAds:search")).length, 1);
});

// -------------------------------------------------------------------------------------- worker ---
const SUPA = "https://proj.supabase.co";
const NOW = Date.UTC(2026, 9, 28, 12);
const ENV = {
  SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: "service-key", ADS_WORKER_SECRET: "worker-secret",
  GOOGLE_ADS_CLIENT_ID: "cid", GOOGLE_ADS_CLIENT_SECRET: "csecret", GOOGLE_ADS_DEVELOPER_TOKEN: "dev-tok",
};
const workerReq = (secret = "worker-secret", method = "POST") =>
  new Request(`${SUPA}/functions/v1/ads-worker`, { method, headers: { "x-ads-worker-secret": secret } });
const rpcBodies = (calls: Call[], fn: string) => calls.filter((c) => c.url === `${SUPA}/rest/v1/rpc/${fn}`).map((c) => JSON.parse(c.body));

// Everything the login behind META_CONN reaches: Go Picadera's account and the connector's own, and two Pages,
// the first of them not Go Picadera's -- so a worker that took "the first" of either would be caught.
const META_ACCOUNTS = [{ id: "111", name: "Go Picadera" }, { id: "222", name: "Cuenta de Fellito" }];
const META_PAGES = [
  { id: "page-0", name: "Pruebas de Fellito", instagram: null },
  { id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } },
];
// Meta's answer to the two lists the worker reads again on every run, in Graph's own shape.
const metaLists = (accounts: { id: string; name: string | null }[] = META_ACCOUNTS, pages: typeof META_PAGES = META_PAGES): Route[] => [
  [has("/me/adaccounts"), () => ok({ data: accounts.map((a) => ({ account_id: a.id, name: a.name })) })],
  [has("/me/accounts"), () => ok({ data: pages.map((p) => ({ id: p.id, name: p.name, ...(p.instagram ? { instagram_business_account: p.instagram } : {}) })) })],
];

function workerWorld(opts: { integrations: unknown[]; jobs?: unknown[]; extra?: Route[]; lists?: Route[]; apps?: unknown[]; vault?: unknown }) {
  return fakeFetch([
    [has(`${SUPA}/rest/v1/integrations`), () => ok(opts.integrations)],
    [has(`${SUPA}/rest/v1/ads_apps`), () => ok(opts.apps || [])],
    [has(`${SUPA}/rest/v1/rpc/ads_worker_secret`), () => ok(opts.vault ?? null)],
    [has(`${SUPA}/rest/v1/rpc/claim_campaign_jobs`), () => ok(opts.jobs || [])],
    [has(`${SUPA}/rest/v1/rpc/upsert_platform_campaigns`), (c) => ok(JSON.parse(c.body).p_rows.length)],
    [has(`${SUPA}/rest/v1/rpc/`), () => ok(null)],
    ...(opts.lists || metaLists()),
    ...(opts.extra || []),
  ]);
}

const CHOSEN_AT = "2026-10-20T15:00:00.000Z";
const META_CONN = {
  provider: "meta_ads", status: "connected", client_secret: "meta-tok", store_id: "111", last_error: null,
  details: {
    token_expires_at: new Date(NOW + 40 * 86400_000).toISOString(),
    ad_accounts: META_ACCOUNTS, pages: META_PAGES, page_id: "page-1", chosen_at: CHOSEN_AT,
  },
};
const TARGETING = { lat: 40.6473819, lng: -74.0121613, radius_mi: 3, destination_url: "https://gopicadera.com", tiktok_location_ids: ["5128581"] };
const GOOGLE_CONN = {
  provider: "google_ads", status: "connected", client_secret: "g-refresh", store_id: "1234567890", last_error: null,
  details: { ad_accounts: [{ id: "1234567890", name: "Go Picadera" }], chosen_at: CHOSEN_AT },
};
const TIKTOK_CONN = {
  provider: "tiktok_ads", status: "connected", client_secret: "tt-tok", store_id: "7001", last_error: null,
  details: { ad_accounts: [{ id: "7001", name: "Go Picadera" }], chosen_at: CHOSEN_AT },
};
const campaign = (over: Record<string, unknown>) => ({ id: "cp-1", provider: "meta_ads", name: "Mofongo", status: "paused", external_id: "c1", account_id: "111", platform_ids: { campaign: "c1" }, ...over });

const META_PLATFORM: Route[] = [
  [(c) => c.method === "POST" && c.url === "https://graph.facebook.com/v26.0/c1", () => ok({ success: true })],
  [has("/act_111/campaigns"), () => ok({ data: [{ id: "c1", name: "Mofongo", effective_status: "PAUSED" }] })],
  [has("/act_111/insights"), () => ok({ data: [{ campaign_id: "c1", spend: "12.5" }] })],
];
const GOOGLE_PLATFORM: Route[] = [
  [has("oauth2.googleapis.com/token"), () => ok({ access_token: "g-access", expires_in: 3599 })],
  [has("customers:listAccessibleCustomers"), () => ok({ resourceNames: ["customers/1234567890"] })],
  [has("/customers/1234567890/googleAds:search"), () => ok({ results: [{ campaign: { id: "555", name: "Chimi", status: "ENABLED" } }] })],
];

test("worker: refuses anything but a POST carrying the shared secret", async () => {
  assert.equal((await handleAdsWorker(workerReq("worker-secret", "GET"), { env: ENV, fetch: fakeFetch([]).fn })).status, 405);
  const f = fakeFetch([]);
  assert.equal((await handleAdsWorker(workerReq("wrong"), { env: ENV, fetch: f.fn })).status, 401);
  assert.equal(f.calls.length, 0, "an env secret needs no database call to refuse");
});

// ---- the secret, from Vault ----------------------------------------------------------------------
const NO_ENV_SECRET = { ...ENV, ADS_WORKER_SECRET: "" };
const secretReads = (calls: Call[]) => calls.filter((c) => c.url === `${SUPA}/rest/v1/rpc/ads_worker_secret`);

test("worker secret: an ADS_WORKER_SECRET env var is used as is, and Vault is never asked", async () => {
  forgetAdsWorkerSecret();
  const f = workerWorld({ integrations: [], vault: "vault-secret" });
  assert.equal((await handleAdsWorker(workerReq("worker-secret"), { env: ENV, fetch: f.fn, now: () => NOW })).status, 200);
  assert.equal((await handleAdsWorker(workerReq("vault-secret"), { env: ENV, fetch: f.fn, now: () => NOW })).status, 401);
  assert.equal(secretReads(f.calls).length, 0);
});

test("worker secret: without the env var it comes from Vault through the service key, and is kept for five minutes", async () => {
  forgetAdsWorkerSecret();
  const f = workerWorld({ integrations: [], vault: "vault-secret" });
  const run = (at: number) => handleAdsWorker(workerReq("vault-secret"), { env: NO_ENV_SECRET, fetch: f.fn, now: () => at });
  assert.equal((await run(NOW)).status, 200);
  const [read] = secretReads(f.calls);
  assert.equal(read.method, "POST");
  assert.equal(read.headers.authorization, "Bearer service-key");
  assert.equal(read.headers.apikey, "service-key");
  assert.equal((await run(NOW + 4 * 60_000)).status, 200);
  assert.equal(secretReads(f.calls).length, 1, "cached");
  assert.equal((await run(NOW + 6 * 60_000)).status, 200);
  assert.equal(secretReads(f.calls).length, 2, "read again once the five minutes are up");
  forgetAdsWorkerSecret();
});

test("worker secret: a wrong secret is 401 before any other work, and a flood of them costs one database call", async () => {
  forgetAdsWorkerSecret();
  const f = workerWorld({ integrations: [META_CONN], vault: "vault-secret" });
  for (let i = 0; i < 5; i++) {
    const res = await handleAdsWorker(workerReq("guess-" + i), { env: NO_ENV_SECRET, fetch: f.fn, now: () => NOW + i * 1000 });
    assert.equal(res.status, 401);
    assert.ok(!JSON.stringify(await res.json()).includes("vault-secret"));
  }
  assert.equal(f.calls.length, 1, "only the one Vault read: no integrations, no jobs, no platform");
  forgetAdsWorkerSecret();
});

test("worker secret: with neither the env var nor a Vault secret it answers 503 not_configured", async () => {
  forgetAdsWorkerSecret();
  const empty = workerWorld({ integrations: [], vault: null });
  for (let i = 0; i < 3; i++) {
    const res = await handleAdsWorker(workerReq("anything"), { env: NO_ENV_SECRET, fetch: empty.fn, now: () => NOW });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "not_configured" });
  }
  assert.equal(secretReads(empty.calls).length, 1, "a missing secret is remembered too, so it cannot be hammered");

  forgetAdsWorkerSecret();
  const broken = fakeFetch([[() => true, () => ok({ message: "permission denied for function ads_worker_secret" }, 403)]]);
  assert.equal((await handleAdsWorker(workerReq("anything"), { env: NO_ENV_SECRET, fetch: broken.fn, now: () => NOW })).status, 503);

  forgetAdsWorkerSecret();
  const none = fakeFetch([]);
  assert.equal((await handleAdsWorker(workerReq("anything"), { env: { ...NO_ENV_SECRET, SUPABASE_SERVICE_ROLE_KEY: "" }, fetch: none.fn })).status, 503);
  assert.equal(none.calls.length, 0);
  forgetAdsWorkerSecret();
});

// ---- connections and jobs ------------------------------------------------------------------------
test("worker: a queued pause reaches Meta, the job closes with the new status, then the account is synced", async () => {
  const f = workerWorld({
    integrations: [META_CONN],
    jobs: [{ job_id: "j1", action: "pause", attempts: 1, campaign: campaign({}) }],
    extra: META_PLATFORM,
  });
  const res = await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(res.status, 200);
  const pause = f.calls.find((c) => c.method === "POST" && c.url.endsWith("/v26.0/c1"))!;
  assert.equal(new URLSearchParams(pause.body).get("status"), "PAUSED");
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.deepEqual(done, { p_job_id: "j1", p_ok: true, p_campaign: { status: "paused", platform_ids: { campaign: "c1" }, account_id: "111" } });
  const [upsert] = rpcBodies(f.calls, "upsert_platform_campaigns");
  assert.equal(upsert.p_provider, "meta_ads");
  assert.equal(upsert.p_rows[0].spend, 12.5);
  // The lists came back the same, so the only health write is the sync's.
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual(h, { p_provider: "meta_ads", p_status: "connected", p_last_error: null });
  // The answer is a summary for a human, and never carries a token.
  const body = await res.json() as { synced: Record<string, number> };
  assert.equal(body.synced.meta_ads, 1);
  assert.ok(!JSON.stringify(body).includes("meta-tok"));
});

test("worker: with no account chosen nothing is synced or launched, the console is told, and the lists are refreshed", async () => {
  const unchosen = { ...META_CONN, store_id: null, details: { token_expires_at: META_CONN.details.token_expires_at } };
  const draft = campaign({ status: "publishing", external_id: null, platform_ids: {}, account_id: null, headline: "h", body: "b", daily_budget: 5, media_url: "https://x/1.jpg" });
  const f = workerWorld({
    integrations: [unchosen],
    jobs: [{ job_id: "j20", action: "launch", attempts: 1, campaign: draft }, { job_id: "j21", action: "sync", attempts: 1, campaign: campaign({}) }],
  });
  const res = await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(f.calls.filter((c) => c.url.includes("/act_")).length, 0, "no ad account was touched");
  assert.equal(rpcBodies(f.calls, "upsert_platform_campaigns").length, 0);
  const done = rpcBodies(f.calls, "finish_campaign_job");
  assert.deepEqual(done.map((d) => [d.p_ok, d.p_error, d.p_retry]), [[false, NO_ACCOUNT_CHOSEN, false], [false, NO_ACCOUNT_CHOSEN, false]]);
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.equal(h.p_status, null, "status unchanged");
  assert.equal(h.p_last_error, "Elige la cuenta publicitaria de Go Picadera en Canales");
  assert.deepEqual(h.p_details, { ad_accounts: META_ACCOUNTS, pages: META_PAGES }, "what the owner chooses from");
  assert.ok((await res.json() as { problems: string[] }).problems.includes(`Meta: ${NO_ACCOUNT_CHOSEN}`));
});

test("worker: a comma list or an id nobody chose (what the old callback stored) is not a choice", async () => {
  for (const [store_id, chosen_at] of [["111,222", CHOSEN_AT], ["111", undefined]] as const) {
    const legacy = { ...META_CONN, store_id, details: { ...META_CONN.details, chosen_at } };
    const f = workerWorld({ integrations: [legacy] });
    await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
    assert.equal(f.calls.filter((c) => c.url.includes("/act_")).length, 0, store_id);
    assert.equal(rpcBodies(f.calls, "set_integration_health")[0].p_last_error, NO_ACCOUNT_CHOSEN);
  }
});

test("worker: only the chosen account is synced, though the login reaches others", async () => {
  const f = workerWorld({ integrations: [META_CONN], extra: [...META_PLATFORM, [has("/act_222/"), () => ok({ data: [{ id: "x9" }] })]] });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.ok(f.calls.some((c) => c.url.includes("/act_111/campaigns")));
  assert.equal(f.calls.filter((c) => c.url.includes("/act_222/")).length, 0);
  const [upsert] = rpcBodies(f.calls, "upsert_platform_campaigns");
  assert.deepEqual(upsert.p_rows.map((r: { account_id: string }) => r.account_id), ["111"]);
});

test("worker: an account granted later appears in the lists without touching the status or the note", async () => {
  const warned = { ...META_CONN, last_error: "Reconecta Meta antes del 02/11 o los anuncios dejarán de sincronizarse." };
  const later = [...META_ACCOUNTS, { id: "333", name: "Nueva" }];
  const f = workerWorld({ integrations: [warned], lists: metaLists(later), extra: META_PLATFORM });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [lists] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual(lists, { p_provider: "meta_ads", p_status: null, p_last_error: warned.last_error, p_details: { ad_accounts: later } });
  assert.equal(rpcBodies(f.calls, "upsert_platform_campaigns").length, 1, "and the chosen account is still synced");
});

test("worker: a chosen account the login no longer reaches stops the work and says so", async () => {
  const f = workerWorld({ integrations: [META_CONN], lists: metaLists([META_ACCOUNTS[1]]), extra: META_PLATFORM });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(f.calls.filter((c) => c.url.includes("/act_")).length, 0);
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.ok(h.p_last_error.startsWith(NO_ACCOUNT_CHOSEN), h.p_last_error);
  assert.match(h.p_last_error, /111/);
  assert.equal(h.p_status, null);
});

test("worker: a job on a campaign from another account is refused and nothing is sent", async () => {
  const foreign = campaign({ id: "cp-9", account_id: "222", platform_ids: { campaign: "c9" }, external_id: "c9", status: "paused" });
  const f = workerWorld({
    integrations: [META_CONN],
    jobs: [{ job_id: "j30", action: "pause", attempts: 1, campaign: foreign }, { job_id: "j31", action: "sync", attempts: 1, campaign: foreign }],
    extra: META_PLATFORM,
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(f.calls.filter((c) => c.method === "POST" && c.url.includes("facebook.com")).length, 0);
  const done = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.length, 2);
  for (const d of done) {
    assert.deepEqual([d.p_ok, d.p_retry], [false, false]);
    assert.match(d.p_error, /cuenta publicitaria 222, no de la que se eligió en Canales \(111\)/);
  }
});

test("worker: a launch the owner still has to fix is refused before anything reaches the platform", async () => {
  const draft = campaign({ status: "publishing", external_id: null, platform_ids: {}, headline: "Mofongo", body: "Hoy", daily_budget: 10, media_url: null });
  const f = workerWorld({
    integrations: [META_CONN], jobs: [{ job_id: "j2", action: "launch", attempts: 1, campaign: draft }],
    extra: [[has(`${SUPA}/rest/v1/settings`), () => ok([{ value: TARGETING }])], ...META_PLATFORM],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.equal(done.p_retry, false);
  assert.match(done.p_error, /imagen/);
  assert.equal(f.calls.filter((c) => c.method === "POST" && c.url.includes("facebook.com")).length, 0);
});

test("worker: a Meta token close to expiry keeps working but leaves a warning for the console", async () => {
  const soon = { ...META_CONN, details: { ...META_CONN.details, token_expires_at: new Date(NOW + 5 * 86400_000).toISOString() } };
  const f = workerWorld({ integrations: [soon], extra: META_PLATFORM });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.equal(h.p_status, "connected");
  assert.match(h.p_last_error, /Reconecta Meta antes del 02\/11/);
});

test("worker: an expired Meta token marks the connection broken and nothing is sent to Meta", async () => {
  const expired = { ...META_CONN, details: { ...META_CONN.details, token_expires_at: new Date(NOW - 86400_000).toISOString() } };
  const f = workerWorld({ integrations: [expired], jobs: [{ job_id: "j3", action: "pause", attempts: 1, campaign: campaign({}) }] });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(f.calls.filter((c) => c.url.includes("facebook.com")).length, 0);
  assert.equal(rpcBodies(f.calls, "set_integration_health")[0].p_status, "error");
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.match(done.p_error, /venció/);
});

test("worker: a revoked Google permission is recorded and its jobs fail with the reason", async () => {
  const f = workerWorld({
    integrations: [GOOGLE_CONN],
    jobs: [{ job_id: "j4", action: "sync", attempts: 1, campaign: campaign({ provider: "google_ads", account_id: "1234567890" }) }],
    extra: [[has("oauth2.googleapis.com/token"), () => ok({ error: "invalid_grant" }, 400)]],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual([h.p_provider, h.p_status], ["google_ads", "error"]);
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.match(done.p_error, /reconectar/);
  assert.equal(f.calls.filter((c) => c.url.includes("googleads.googleapis.com")).length, 0);
});

test("worker: Google works with no developer token, and with the client the owner saved in Canales", async () => {
  const env = { ...ENV, GOOGLE_ADS_DEVELOPER_TOKEN: "", GOOGLE_ADS_CLIENT_ID: "", GOOGLE_ADS_CLIENT_SECRET: "" };
  const f = workerWorld({
    integrations: [GOOGLE_CONN], lists: [], extra: GOOGLE_PLATFORM,
    apps: [{ provider: "google_ads", app_id: "1234-abc.apps.googleusercontent.com", app_secret: "db-g-secret", login_config_id: null }],
  });
  const res = await handleAdsWorker(workerReq(), { env, fetch: f.fn, now: () => NOW });
  assert.equal((await res.json() as { synced: Record<string, number> }).synced.google_ads, 1);
  const mint = new URLSearchParams(f.calls.find((c) => c.url.includes("oauth2.googleapis.com/token"))!.body);
  assert.deepEqual([mint.get("client_id"), mint.get("client_secret")], ["1234-abc.apps.googleusercontent.com", "db-g-secret"]);
  const google = f.calls.filter((c) => c.url.includes("googleads.googleapis.com"));
  assert.ok(google.length >= 2);
  assert.ok(google.every((c) => !("developer-token" in c.headers)));
  assert.equal(rpcBodies(f.calls, "set_integration_health").at(-1).p_status, "connected");
});

test("worker: Google with no app anywhere, or a Cloud project without API access, is a note for Fellito, not a broken connection", async () => {
  const noApp = workerWorld({ integrations: [GOOGLE_CONN], lists: [] });
  await handleAdsWorker(workerReq(), { env: { ...ENV, GOOGLE_ADS_CLIENT_ID: "" }, fetch: noApp.fn, now: () => NOW });
  let [h] = rpcBodies(noApp.calls, "set_integration_health");
  assert.equal(h.p_status, null);
  assert.match(h.p_last_error, /falta la app de Google/);

  const notApproved = { error: { status: "PERMISSION_DENIED", message: "x", details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }, message: "not approved" }] }] } };
  const f = workerWorld({
    integrations: [GOOGLE_CONN], lists: [],
    extra: [[has("oauth2.googleapis.com/token"), () => ok({ access_token: "g-access" })], [has("googleads.googleapis.com"), () => ok(notApproved, 403)]],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  [h] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual([h.p_status, h.p_last_error], [null, GOOGLE_PROJECT_ACCESS_MESSAGE]);
});

test("worker: TikTok's advertisers are read again with the app the owner saved", async () => {
  const f = workerWorld({
    integrations: [TIKTOK_CONN], lists: [],
    apps: [{ provider: "tiktok_ads", app_id: "7300", app_secret: "db-tt-secret", login_config_id: null }],
    extra: [
      [has("/oauth2/advertiser/get/"), () => ok({ code: 0, data: { list: [{ advertiser_id: "7001", advertiser_name: "Go Picadera" }, { advertiser_id: "7002", advertiser_name: "Nueva" }] } })],
      [has("business-api.tiktok.com"), () => ok({ code: 0, data: { list: [], page_info: { total_page: 1 } } })],
    ],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const read = new URL(f.calls.find((c) => c.url.includes("/oauth2/advertiser/get/"))!.url);
  assert.deepEqual([read.searchParams.get("app_id"), read.searchParams.get("secret")], ["7300", "db-tt-secret"]);
  const [lists] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual(lists.p_details, { ad_accounts: [{ id: "7001", name: "Go Picadera" }, { id: "7002", name: "Nueva" }] });
  assert.ok(f.calls.some((c) => c.url.includes("/campaign/get/") && c.url.includes("advertiser_id=7001")));
  assert.equal(f.calls.filter((c) => c.url.includes("advertiser_id=7002")).length, 0);
});

test("worker: a rate limit leaves the job for the next run", async () => {
  const f = workerWorld({
    integrations: [TIKTOK_CONN], lists: [],
    jobs: [{ job_id: "j5", action: "resume", attempts: 1, campaign: campaign({ provider: "tiktok_ads", account_id: "7001", platform_ids: { campaign: "9001" }, external_id: "9001" }) }],
    extra: [[has("business-api.tiktok.com"), () => ok({ code: 40100, message: "Too many requests" })]],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.deepEqual([done.p_ok, done.p_retry], [false, true]);
});

test("worker: a sync job and the scheduled sync share one round trip per platform", async () => {
  const f = workerWorld({
    integrations: [META_CONN],
    jobs: [
      { job_id: "j6", action: "sync", attempts: 1, campaign: campaign({}) },
      { job_id: "j7", action: "sync", attempts: 1, campaign: campaign({ id: "cp-2" }) },
    ],
    extra: META_PLATFORM,
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  assert.equal(f.calls.filter((c) => c.url.includes("/act_111/campaigns")).length, 1);
  assert.equal(rpcBodies(f.calls, "upsert_platform_campaigns").length, 1);
  assert.equal(rpcBodies(f.calls, "finish_campaign_job").filter((b) => b.p_ok).length, 2);
});

test("worker: a job for a platform that is not connected says so instead of hanging", async () => {
  const f = workerWorld({ integrations: [], jobs: [{ job_id: "j8", action: "pause", attempts: 1, campaign: campaign({ provider: "tiktok_ads" }) }] });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.match(done.p_error, /Conecta TikTok/);
});

// ====================================================================================== creating ===
const SPEC: LaunchSpec = {
  name: "Mofongo fin de semana", headline: "Mofongo con pernil", body: "Hecho al momento en la 4ta Avenida.",
  dailyBudget: 15, startsAt: null, endsAt: new Date(NOW + 7 * 86400_000).toISOString(),
  url: "https://gopicadera.com", mediaUrl: "https://proj.supabase.co/storage/v1/object/public/ads/meta/1.jpg",
  lat: 40.6473819, lng: -74.0121613, radiusMi: 3,
  google: {
    headlines: ["Mofongo en Sunset Park", "Comida dominicana", "Pide por WhatsApp"],
    descriptions: ["Mofongo con pernil hecho al momento.", "Abierto hasta las 11pm."],
    keywords: ["mofongo brooklyn", "comida dominicana sunset park"],
  },
  tiktokLocationIds: ["5128581"],
};
const noSleep = async () => {};

test("validation: each platform's minimums are checked before anything is sent", () => {
  assert.equal(validateLaunch("meta_ads", SPEC, NOW), null);
  assert.equal(validateLaunch("google_ads", SPEC, NOW), null);
  assert.match(validateLaunch("meta_ads", { ...SPEC, mediaUrl: null }, NOW)!, /imagen/);
  assert.match(validateLaunch("meta_ads", { ...SPEC, radiusMi: 0.3 }, NOW)!, /0.63/);
  assert.match(validateLaunch("tiktok_ads", SPEC, NOW)!, /al menos \$20/);
  assert.equal(validateLaunch("tiktok_ads", { ...SPEC, dailyBudget: 20 }, NOW), null);
  assert.match(validateLaunch("tiktok_ads", { ...SPEC, dailyBudget: 20, body: "x".repeat(90) }, NOW)!, /100 caracteres/);
  assert.match(validateLaunch("tiktok_ads", { ...SPEC, dailyBudget: 20, tiktokLocationIds: [] }, NOW)!, /zonas de TikTok/);
  assert.match(validateLaunch("google_ads", { ...SPEC, google: { ...SPEC.google!, headlines: ["a", "b"] } }, NOW)!, /3 y 15 titulares/);
  assert.match(validateLaunch("google_ads", { ...SPEC, google: { ...SPEC.google!, headlines: ["a", "b", "x".repeat(31)] } }, NOW)!, /30 caracteres/);
  assert.match(validateLaunch("meta_ads", { ...SPEC, endsAt: new Date(NOW + 3600_000).toISOString() }, NOW)!, /más de un día/);
  assert.match(validateLaunch("meta_ads", { ...SPEC, lat: NaN }, NOW)!, /ubicación/);
});

// A fake Meta that hands out ids in order and can be told to refuse one step.
function fakeMeta(failAt?: string) {
  let n = 0;
  return fakeFetch([
    [(c) => c.method === "GET" && c.url.includes("/storage/"), () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]))],
    [(c) => c.method === "DELETE", () => ok({ success: true })],
    [(c) => c.url.includes("/adimages"), () => ok({ images: { bytes: { hash: "img-hash", url: "https://x" } } })],
    [(c) => !!failAt && c.url.endsWith(`/act_111/${failAt}`), () => ok({ error: { code: 100, message: `Invalid parameter in ${failAt}` } }, 400)],
    [(c) => /\/act_111\/(adcreatives|campaigns|adsets|ads)$/.test(c.url), (c) => ok({ id: `${c.url.split("/").pop()}-${++n}` })],
    [(c) => c.method === "POST" && /\/v26\.0\/campaigns-\d+$/.test(c.url), () => ok({ success: true })],
  ]);
}

test("meta launch: image, creative with Page + Instagram, paused campaign, ad set in the radius, ad, then switch on", async () => {
  const f = fakeMeta();
  const made = await metaLaunch(f.fn, "tok", "111", { id: "page-1", instagramId: "ig-1" }, SPEC, NOW);
  const posts = f.calls.filter((c) => c.method === "POST");
  const form = (i: number) => Object.fromEntries(new URLSearchParams(posts[i].body));
  assert.deepEqual(posts.map((c) => c.url.replace("https://graph.facebook.com/v26.0/", "")),
    ["act_111/adimages", "act_111/adcreatives", "act_111/campaigns", "act_111/adsets", "act_111/ads", made.campaignId]);
  assert.equal(form(0).bytes, "/9j/AQID"); // the image bytes, base64
  const story = JSON.parse(form(1).object_story_spec);
  assert.deepEqual([story.page_id, story.instagram_user_id, story.link_data.image_hash, story.link_data.name], ["page-1", "ig-1", "img-hash", "Mofongo con pernil"]);
  assert.deepEqual([form(2).objective, form(2).status, form(2).special_ad_categories], ["OUTCOME_TRAFFIC", "PAUSED", "[]"]);
  assert.equal(form(3).daily_budget, "1500"); // cents
  const geo = JSON.parse(form(3).targeting).geo_locations.custom_locations[0];
  assert.deepEqual([geo.latitude, geo.longitude, geo.radius, geo.distance_unit], [40.6473819, -74.0121613, 3, "mile"]);
  assert.equal(JSON.parse(form(3).targeting).targeting_automation.advantage_audience, 0);
  assert.equal(JSON.parse(form(4).creative).creative_id, made.ids.creative);
  assert.equal(form(5).status, "ACTIVE"); // switched on only at the very end
  assert.deepEqual(Object.keys(made.ids).sort(), ["ad", "adset", "campaign", "creative", "image_hash"]);
});

test("meta launch: a refusal halfway removes everything already made, newest first", async () => {
  const f = fakeMeta("ads");
  await assert.rejects(metaLaunch(f.fn, "tok", "111", { id: "page-1", instagramId: null }, SPEC, NOW), /Invalid parameter in ads/);
  const deleted = f.calls.filter((c) => c.method === "DELETE").map((c) => new URL(c.url).pathname.split("/").pop());
  assert.deepEqual(deleted, ["adsets-3", "campaigns-2", "adcreatives-1", "adimages"]);
  assert.equal(f.calls.filter((c) => c.method === "POST" && /campaigns-\d+$/.test(c.url)).length, 0, "never switched on");
});

test("tiktok launch: without a linked TikTok account nothing is created", async () => {
  const f = fakeFetch([[has("/identity/get/"), () => ok({ code: 0, data: { identity_list: [{ identity_id: "x", identity_type: "CUSTOMIZED_USER" }] } })]]);
  await assert.rejects(tiktokLaunch(f.fn, "tt", "7001", { ...SPEC, dailyBudget: 20 }, NOW, noSleep),
    (e: unknown) => e instanceof AdsError && e.kind === "config" && /Business Center/.test(e.message));
  assert.equal(f.calls.length, 1);
});

test("tiktok launch: video by URL, waits for its cover, disabled campaign, ad group, ad as the account, then on", async () => {
  let infoCalls = 0;
  const f = fakeFetch([
    [has("/identity/get/"), () => ok({ code: 0, data: { identity_list: [{ identity_id: "tt-user-1", identity_type: "TT_USER" }] } })],
    [has("/file/video/ad/upload/"), () => ok({ code: 0, data: [{ video_id: "v-1" }] })],
    [has("/file/video/ad/info/"), () => ok({ code: 0, data: { list: [++infoCalls < 2 ? {} : { video_cover_url: "https://cover" }] } })],
    [has("/file/image/ad/upload/"), () => ok({ code: 0, data: { image_id: "img-1" } })],
    [has("/campaign/create/"), () => ok({ code: 0, data: { campaign_id: 555 } })],
    [has("/adgroup/create/"), () => ok({ code: 0, data: { adgroup_id: 666 } })],
    [has("/ad/create/"), () => ok({ code: 0, data: { ad_ids: [777] } })],
    [has("/campaign/status/update/"), () => ok({ code: 0, data: {} })],
  ]);
  const made = await tiktokLaunch(f.fn, "tt", "7001", { ...SPEC, dailyBudget: 20 }, NOW, noSleep);
  assert.deepEqual(made, { campaignId: "555", ids: { video: "v-1", cover_image: "img-1", campaign: "555", adgroup: "666", ad: "777" } });
  const body = (path: string) => JSON.parse(f.calls.find((c) => c.url.includes(path))!.body);
  assert.equal(body("/file/video/ad/upload/").upload_type, "UPLOAD_BY_URL");
  assert.equal(body("/campaign/create/").operation_status, "DISABLE");
  const group = body("/adgroup/create/");
  assert.deepEqual([group.budget, group.budget_mode, group.location_ids[0], group.schedule_type], [20, "BUDGET_MODE_DAY", "5128581", "SCHEDULE_START_END"]);
  const creative = body("/ad/create/").creatives[0];
  assert.deepEqual([creative.identity_id, creative.video_id, creative.image_ids[0]], ["tt-user-1", "v-1", "img-1"]);
  assert.equal(creative.ad_text, "Mofongo con pernil. Hecho al momento en la 4ta Avenida.");
  assert.equal(body("/campaign/status/update/").operation_status, "ENABLE");
  assert.equal(infoCalls, 2, "polled until the cover existed");
});

test("tiktok launch: a refused ad group deletes the campaign it belonged to", async () => {
  const f = fakeFetch([
    [has("/identity/get/"), () => ok({ code: 0, data: { identity_list: [{ identity_id: "u", identity_type: "TT_USER" }] } })],
    [has("/file/video/ad/upload/"), () => ok({ code: 0, data: { video_id: "v-1" } })],
    [has("/file/video/ad/info/"), () => ok({ code: 0, data: { list: [{ video_cover_url: "https://cover" }] } })],
    [has("/file/image/ad/upload/"), () => ok({ code: 0, data: { image_id: "img-1" } })],
    [has("/campaign/create/"), () => ok({ code: 0, data: { campaign_id: "555" } })],
    [has("/adgroup/create/"), () => ok({ code: 40002, message: "Budget is lower than the minimum" })],
    [has("/campaign/status/update/"), () => ok({ code: 0, data: {} })],
  ]);
  await assert.rejects(tiktokLaunch(f.fn, "tt", "7001", { ...SPEC, dailyBudget: 20 }, NOW, noSleep), /Budget is lower/);
  const status = f.calls.filter((c) => c.url.includes("/campaign/status/update/")).map((c) => JSON.parse(c.body).operation_status);
  assert.deepEqual(status, ["DELETE"]);
});

test("google launch: dry run, then the same atomic batch for real, then switch on", async () => {
  const f = fakeFetch([
    [(c) => c.url.endsWith("googleAds:mutate") && JSON.parse(c.body).validateOnly, () => ok({})],
    [has("googleAds:mutate"), () => ok({ mutateOperationResponses: [{ campaignBudgetResult: { resourceName: "customers/1/campaignBudgets/9" } }, { campaignResult: { resourceName: "customers/1234567890/campaigns/4242" } }] })],
    [has("campaigns:mutate"), () => ok({ results: [{}] })],
  ]);
  const auth = { accessToken: "a", developerToken: "d", loginCustomerId: "" };
  const made = await googleLaunch(f.fn, auth, "1234567890", SPEC, NOW);
  assert.deepEqual(made, { campaignId: "4242", ids: { campaign: "4242" } });
  const [dry, real] = f.calls.filter((c) => c.url.endsWith("googleAds:mutate")).map((c) => JSON.parse(c.body));
  assert.equal(dry.validateOnly, true);
  assert.deepEqual(dry.mutateOperations, real.mutateOperations);
  const ops = real.mutateOperations;
  const campaignOp = ops[1].campaignOperation.create;
  assert.deepEqual([campaignOp.status, campaignOp.advertisingChannelType, campaignOp.containsEuPoliticalAdvertising],
    ["PAUSED", "SEARCH", "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"]);
  assert.equal(ops[0].campaignBudgetOperation.create.amountMicros, "15000000");
  assert.equal(ops[2].campaignCriterionOperation.create.proximity.geoPoint.latitudeInMicroDegrees, 40647382);
  const keywords = ops.filter((o: Record<string, unknown>) => o.adGroupCriterionOperation).map((o: { adGroupCriterionOperation: { create: { keyword: { text: string } } } }) => o.adGroupCriterionOperation.create.keyword.text);
  assert.deepEqual(keywords, ["mofongo brooklyn", "comida dominicana sunset park"]);
  const rsa = ops.at(-1).adGroupAdOperation.create.ad.responsiveSearchAd;
  assert.equal(rsa.headlines.length, 3);
  const enable = JSON.parse(f.calls.find((c) => c.url.endsWith("campaigns:mutate"))!.body);
  assert.equal(enable.operations[0].update.status, "ENABLED");
});

test("google launch: a refused batch creates nothing and switches nothing on", async () => {
  const refused = { error: { status: "INVALID_ARGUMENT", message: "x", details: [{ errors: [{ errorCode: { policyFindingError: "POLICY_FINDING" }, message: "Headline violates policy" }] }] } };
  const f = fakeFetch([[has("googleAds:mutate"), () => ok(refused, 400)]]);
  await assert.rejects(googleLaunch(f.fn, { accessToken: "a", developerToken: "d", loginCustomerId: "" }, "1", SPEC, NOW), /Headline violates policy/);
  assert.equal(f.calls.length, 1, "stopped at the dry run");
});

const launchWorld = (conn: unknown, draft: unknown, lists?: Route[]) => {
  const meta = fakeMeta();
  return workerWorld({
    integrations: [conn], jobs: [{ job_id: "j9", action: "launch", attempts: 1, campaign: draft }], lists,
    extra: [
      [has(`${SUPA}/rest/v1/settings`), () => ok([{ value: TARGETING }])],
      [(c) => c.url.includes("/act_111/campaigns?") || c.url.includes("/act_111/insights"), () => ok({ data: [] })],
      [(c) => c.url.includes("facebook.com") || c.url.includes("/storage/"), (c) => (meta.fn as (u: string, i: RequestInit) => Promise<Response>)(c.url, { method: c.method, body: c.body })],
    ],
  });
};
const metaDraft = (over: Record<string, unknown> = {}) => campaign({
  status: "publishing", external_id: null, platform_ids: {}, account_id: null,
  name: SPEC.name, headline: SPEC.headline, body: SPEC.body, daily_budget: "15.00", ends_at: SPEC.endsAt, media_url: SPEC.mediaUrl, ...over,
});

test("worker: a Meta launch end to end, on the chosen account as the chosen Page, records the campaign as active with every id", async () => {
  const f = launchWorld(META_CONN, metaDraft());
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW, sleep: noSleep });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, true, JSON.stringify(done));
  assert.equal(done.p_campaign.status, "active");
  assert.equal(done.p_campaign.account_id, "111");
  assert.match(done.p_campaign.external_id, /^campaigns-\d+$/);
  assert.deepEqual(Object.keys(done.p_campaign.platform_ids).sort(), ["ad", "adset", "campaign", "creative", "image_hash"]);
  // page-1 is the chosen Page and the second in the list; its Instagram account goes with it.
  const creative = f.calls.find((c) => c.url.endsWith("/act_111/adcreatives"))!;
  const story = JSON.parse(new URLSearchParams(creative.body).get("object_story_spec")!);
  assert.deepEqual([story.page_id, story.instagram_user_id], ["page-1", "ig-1"]);
  assert.ok(f.calls.filter((c) => c.method === "POST" && c.url.includes("/act_")).every((c) => c.url.includes("/act_111/")));
});

test("worker: a Meta launch with no Page chosen, or one the login no longer sees, asks for the Page in Canales", async () => {
  const noPage = { ...META_CONN, details: { ...META_CONN.details, page_id: undefined } };
  for (const [conn, lists] of [[noPage, undefined], [META_CONN, metaLists(META_ACCOUNTS, [META_PAGES[0]])]] as const) {
    const f = launchWorld(conn, metaDraft(), lists);
    await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW, sleep: noSleep });
    const [done] = rpcBodies(f.calls, "finish_campaign_job");
    assert.equal(done.p_ok, false);
    assert.match(done.p_error, /elige en Canales la Página de Facebook de Go Picadera/);
    assert.equal(f.calls.filter((c) => c.method === "POST" && c.url.includes("facebook.com")).length, 0);
  }
});
