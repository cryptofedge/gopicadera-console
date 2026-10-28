// The ads worker and its platform adapters, against fake Meta / TikTok / Google / Supabase. `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdsError, metaToCampaigns, metaError, tiktokToCampaigns, tiktokError, googleToCampaigns, googleError,
  googleStatusOperation, metaStatus, tiktokStatus, googleStatus, validateLaunch,
} from "./ads-lib.ts";
import type { LaunchSpec } from "./ads-lib.ts";
import {
  metaListCampaigns, metaSetStatus, tiktokListCampaigns, tiktokSetStatus, googleMintAccessToken, googleListCampaigns, googleSetStatus,
  metaLaunch, tiktokLaunch, googleLaunch,
} from "./ads-platforms.ts";
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

const META_CONN = {
  provider: "meta_ads", status: "connected", client_secret: "meta-tok", store_id: "111",
  details: {
    token_expires_at: new Date(NOW + 40 * 86400_000).toISOString(),
    pages: [{ id: "page-1", name: "Go Picadera", instagram: { id: "ig-1" } }],
  },
};
const TARGETING = { lat: 40.6473819, lng: -74.0121613, radius_mi: 3, destination_url: "https://gopicadera.com", tiktok_location_ids: ["5128581"] };
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

test("worker: a Meta launch end to end records the campaign as active with every id", async () => {
  const draft = campaign({
    status: "publishing", external_id: null, platform_ids: {}, account_id: "111",
    name: SPEC.name, headline: SPEC.headline, body: SPEC.body, daily_budget: "15.00", ends_at: SPEC.endsAt, media_url: SPEC.mediaUrl,
  });
  const meta = fakeMeta();
  const f = workerWorld({
    integrations: [META_CONN], jobs: [{ job_id: "j9", action: "launch", attempts: 1, campaign: draft }],
    extra: [
      [has(`${SUPA}/rest/v1/settings`), () => ok([{ value: TARGETING }])],
      [(c) => c.url.includes("/act_111/campaigns?") || c.url.includes("/act_111/insights"), () => ok({ data: [] })],
      [(c) => c.url.includes("facebook.com") || c.url.includes("/storage/"), (c) => (meta.fn as (u: string, i: RequestInit) => Promise<Response>)(c.url, { method: c.method, body: c.body })],
    ],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW, sleep: noSleep });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, true, JSON.stringify(done));
  assert.equal(done.p_campaign.status, "active");
  assert.match(done.p_campaign.external_id, /^campaigns-\d+$/);
  assert.deepEqual(Object.keys(done.p_campaign.platform_ids).sort(), ["ad", "adset", "campaign", "creative", "image_hash"]);
});

test("worker: a Meta connection that sees no Page explains how to fix it", async () => {
  const noPage = { ...META_CONN, details: { token_expires_at: META_CONN.details.token_expires_at } };
  const draft = campaign({ status: "publishing", external_id: null, platform_ids: {}, headline: "h", body: "b", daily_budget: 5, media_url: SPEC.mediaUrl });
  const f = workerWorld({
    integrations: [noPage], jobs: [{ job_id: "j10", action: "launch", attempts: 1, campaign: draft }],
    extra: [[has(`${SUPA}/rest/v1/settings`), () => ok([{ value: TARGETING }])], ...META_PLATFORM],
  });
  await handleAdsWorker(workerReq(), { env: ENV, fetch: f.fn, now: () => NOW });
  const [done] = rpcBodies(f.calls, "finish_campaign_job");
  assert.equal(done.p_ok, false);
  assert.match(done.p_error, /ninguna Página/);
});
