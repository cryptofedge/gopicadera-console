// The ads worker and its platform adapters, against fake Meta / TikTok / Google / Supabase. `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdsError, metaToCampaigns, metaError, tiktokToCampaigns, tiktokError, googleToCampaigns, googleError,
  googleStatusOperation, metaStatus, tiktokStatus, googleStatus,
} from "./ads-lib.ts";
import { metaListCampaigns, metaSetStatus, tiktokListCampaigns, tiktokSetStatus, googleMintAccessToken, googleListCampaigns, googleSetStatus } from "./ads-platforms.ts";
import { handleAdsWorker } from "./ads-worker.ts";

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

test("google adapter: a revoked refresh token is an auth error, a missing developer token a config error", async () => {
  const revoked = fakeFetch([[() => true, () => ok({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)]]);
  await assert.rejects(googleMintAccessToken(revoked.fn, "cid", "cs", "r"), (e: unknown) => e instanceof AdsError && e.kind === "auth");
  const none = fakeFetch([]);
  await assert.rejects(googleSetStatus(none.fn, { accessToken: "a", developerToken: "", loginCustomerId: "" }, "1", "2", "pause"),
    (e: unknown) => e instanceof AdsError && e.kind === "config");
  assert.equal(none.calls.length, 0);
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

function workerWorld(opts: { integrations: unknown[]; jobs?: unknown[]; extra?: Route[] }) {
  return fakeFetch([
    [has(`${SUPA}/rest/v1/integrations`), () => ok(opts.integrations)],
    [has(`${SUPA}/rest/v1/rpc/claim_campaign_jobs`), () => ok(opts.jobs || [])],
    [has(`${SUPA}/rest/v1/rpc/upsert_platform_campaigns`), (c) => ok(JSON.parse(c.body).p_rows.length)],
    [has(`${SUPA}/rest/v1/rpc/`), () => ok(null)],
    ...(opts.extra || []),
  ]);
}

const META_CONN = { provider: "meta_ads", status: "connected", client_secret: "meta-tok", store_id: "111", details: { token_expires_at: new Date(NOW + 40 * 86400_000).toISOString() } };
const GOOGLE_CONN = { provider: "google_ads", status: "connected", client_secret: "g-refresh", store_id: "1234567890", details: {} };
const campaign = (over: Record<string, unknown>) => ({ id: "cp-1", provider: "meta_ads", name: "Mofongo", status: "paused", external_id: "c1", account_id: "111", platform_ids: { campaign: "c1" }, ...over });

const META_PLATFORM: Route[] = [
  [(c) => c.method === "POST" && c.url === "https://graph.facebook.com/v26.0/c1", () => ok({ success: true })],
  [has("/act_111/campaigns"), () => ok({ data: [{ id: "c1", name: "Mofongo", effective_status: "PAUSED" }] })],
  [has("/act_111/insights"), () => ok({ data: [{ campaign_id: "c1", spend: "12.5" }] })],
];

test("worker: refuses anything but a POST carrying the shared secret", async () => {
  assert.equal((await handleAdsWorker(workerReq("worker-secret", "GET"), { env: ENV, fetch: fakeFetch([]).fn })).status, 405);
  assert.equal((await handleAdsWorker(workerReq("wrong"), { env: ENV, fetch: fakeFetch([]).fn })).status, 401);
  assert.equal((await handleAdsWorker(workerReq(), { env: { ...ENV, ADS_WORKER_SECRET: "" }, fetch: fakeFetch([]).fn })).status, 503);
});

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
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.deepEqual(h, { p_provider: "meta_ads", p_status: "connected", p_last_error: null });
  // The answer is a summary for a human, and never carries a token.
  const body = await res.json() as { synced: Record<string, number> };
  assert.equal(body.synced.meta_ads, 1);
  assert.ok(!JSON.stringify(body).includes("meta-tok"));
});

test("worker: a launch is refused for now with a message the owner can act on, and not retried", async () => {
  const f = workerWorld({ integrations: [META_CONN], jobs: [{ job_id: "j2", action: "launch", attempts: 1, campaign: campaign({ status: "publishing", external_id: null, platform_ids: {} }) }], extra: META_PLATFORM });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.equal(done.p_retry, false);
  assert.match(done.p_error, /administrador de anuncios/);
});

test("worker: a Meta token close to expiry keeps working but leaves a warning for the console", async () => {
  const soon = { ...META_CONN, details: { token_expires_at: new Date(NOW + 5 * 86400_000).toISOString() } };
  const f = workerWorld({ integrations: [soon], extra: META_PLATFORM });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [h] = rpcBodies(f.calls, "set_integration_health");
  assert.equal(h.p_status, "connected");
  assert.match(h.p_last_error, /Reconecta Meta antes del 02\/11/);
});

test("worker: an expired Meta token marks the connection broken and nothing is sent to Meta", async () => {
  const expired = { ...META_CONN, details: { token_expires_at: new Date(NOW - 86400_000).toISOString() } };
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

test("worker: a rate limit leaves the job for the next run", async () => {
  const f = workerWorld({
    integrations: [{ provider: "tiktok_ads", status: "connected", client_secret: "tt-tok", store_id: "7001", details: {} }],
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
