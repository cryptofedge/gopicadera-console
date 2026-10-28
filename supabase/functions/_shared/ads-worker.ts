// The ads worker: drains campaign_jobs (launch / pause / resume / end / sync) and keeps every
// connected ad account's campaigns and lifetime numbers in the campaigns table.
//
// Woken by ads_schedule.sql -- right after a job is queued, and every 15 minutes -- or by hand:
//   curl -X POST https://<project>.supabase.co/functions/v1/ads-worker -H "x-ads-worker-secret: $ADS_WORKER_SECRET"
// It answers with a summary of what it did, never a token.
import { json, safeEqual } from "./stripe-lib.ts";
import type { Env } from "./stripe-lib.ts";
import { rpc } from "./handlers.ts";
import { AdsError, validateLaunch } from "./ads-lib.ts";
import type { CampaignStatus, LaunchSpec, PlatformCampaign, Provider, StatusAction } from "./ads-lib.ts";
import {
  metaListCampaigns, metaSetStatus, metaLaunch,
  tiktokListCampaigns, tiktokSetStatus, tiktokLaunch,
  googleMintAccessToken, googleListCampaigns, googleSetStatus, googleLaunch,
} from "./ads-platforms.ts";
import type { GoogleAuth, LaunchResult, Sleep } from "./ads-platforms.ts";

export interface WorkerDeps {
  env: Env;
  fetch: typeof fetch;
  now?: () => number; // milliseconds
  sleep?: Sleep;      // tests pass a no-op; TikTok's video processing is polled with it
}

const NAMES: Record<Provider, string> = { meta_ads: "Meta", tiktok_ads: "TikTok", google_ads: "Google Ads" };
// Warn the owner this long before a Meta token lapses (it cannot be renewed without them).
const META_WARN_DAYS = 10;

function workerConfig(env: Env) {
  return {
    supabaseUrl: (env.SUPABASE_URL || "").replace(/\/$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    secret: env.ADS_WORKER_SECRET || "",
    googleClientId: env.GOOGLE_ADS_CLIENT_ID || "",
    googleClientSecret: env.GOOGLE_ADS_CLIENT_SECRET || "",
    googleDeveloperToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    googleLoginCustomerId: (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, ""),
  };
}
type Config = ReturnType<typeof workerConfig>;

interface ConnectionDetails {
  token_expires_at?: string | null;
  pages?: { id: string; name: string | null; instagram: { id: string } | null }[];
}

interface IntegrationRow {
  provider: Provider;
  status: string;
  client_secret: string | null;
  store_id: string | null;
  details: ConnectionDetails | null;
}

/** A connection ready to use, or the reason it is not. */
type Connection =
  | { ok: true; provider: Provider; accounts: string[]; token: string; google?: GoogleAuth; warning: string | null; details: ConnectionDetails }
  | { ok: false; provider: Provider; reason: string };

export interface CampaignRow {
  id: string;
  provider: Provider;
  name: string;
  status: string;
  external_id: string | null;
  account_id: string | null;
  platform_ids: Record<string, string> | null;
  headline?: string | null;
  body?: string | null;
  daily_budget?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  destination_url?: string | null;
  media_url?: string | null;
  radius_mi?: number | string | null;
  google_assets?: { headlines?: string[]; descriptions?: string[]; keywords?: string[] } | null;
}

/** The ads_targeting setting, edited in Ajustes. */
interface Targeting {
  lat?: number;
  lng?: number;
  radius_mi?: number;
  destination_url?: string;
  tiktok_location_ids?: (string | number)[];
}

async function loadTargeting(c: Config, fetchFn: typeof fetch): Promise<Targeting> {
  const r = await fetchFn(`${c.supabaseUrl}/rest/v1/settings?key=eq.ads_targeting&select=value`, {
    headers: { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}` },
  });
  if (!r.ok) return {};
  const rows = await r.json().catch(() => []) as { value?: Targeting }[];
  return rows[0]?.value || {};
}

export function launchSpec(camp: CampaignRow, t: Targeting): LaunchSpec {
  return {
    name: camp.name || "",
    headline: camp.headline || "",
    body: camp.body || "",
    dailyBudget: Number(camp.daily_budget || 0),
    startsAt: camp.starts_at || null,
    endsAt: camp.ends_at || null,
    url: camp.destination_url || t.destination_url || "https://gopicadera.com",
    mediaUrl: camp.media_url || null,
    lat: Number(t.lat),
    lng: Number(t.lng),
    radiusMi: Number(camp.radius_mi || t.radius_mi || 3),
    google: {
      headlines: camp.google_assets?.headlines || [],
      descriptions: camp.google_assets?.descriptions || [],
      keywords: camp.google_assets?.keywords || [],
    },
    tiktokLocationIds: (t.tiktok_location_ids || []).map(String),
  };
}

interface Job { job_id: string; action: "launch" | "pause" | "resume" | "end" | "sync"; attempts: number; campaign: CampaignRow }

const ddmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

async function loadIntegrations(c: Config, fetchFn: typeof fetch): Promise<IntegrationRow[]> {
  const url = `${c.supabaseUrl}/rest/v1/integrations?kind=eq.ads&status=in.(connected,error)` +
    `&select=provider,status,client_secret,store_id,details`;
  const r = await fetchFn(url, { headers: { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}` } });
  if (!r.ok) throw new Error(`could not read integrations: HTTP ${r.status}`);
  return await r.json() as IntegrationRow[];
}

async function health(c: Config, fetchFn: typeof fetch, provider: Provider, status: "connected" | "error" | null, lastError: string | null) {
  try {
    await rpc(c, fetchFn, "set_integration_health", { p_provider: provider, p_status: status, p_last_error: lastError });
  } catch (e) { console.error("could not record integration health:", provider, e instanceof Error ? e.message : e); }
}

async function prepare(c: Config, fetchFn: typeof fetch, row: IntegrationRow, nowMs: number): Promise<Connection> {
  const provider = row.provider;
  const accounts = (row.store_id || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!row.client_secret) return { ok: false, provider, reason: `${NAMES[provider]} no tiene permiso guardado; conéctalo en Canales` };
  if (accounts.length === 0) return { ok: false, provider, reason: `${NAMES[provider]} está conectado pero sin cuenta de anuncios` };

  try {
    if (provider === "google_ads") {
      // For Google the stored credential is the refresh token.
      const accessToken = await googleMintAccessToken(fetchFn, c.googleClientId, c.googleClientSecret, row.client_secret);
      const google = { accessToken, developerToken: c.googleDeveloperToken, loginCustomerId: c.googleLoginCustomerId };
      return { ok: true, provider, accounts, token: accessToken, google, warning: null, details: row.details || {} };
    }

    let warning: string | null = null;
    const exp = row.details?.token_expires_at;
    if (provider === "meta_ads" && exp) {
      const left = Date.parse(exp) - nowMs;
      if (left <= 0) {
        const reason = `El permiso de Meta venció el ${ddmm(exp)}. Reconecta Meta en Canales.`;
        await health(c, fetchFn, provider, "error", reason);
        return { ok: false, provider, reason };
      }
      if (left < META_WARN_DAYS * 86400_000) warning = `Reconecta Meta antes del ${ddmm(exp)} o los anuncios dejarán de sincronizarse.`;
    }
    return { ok: true, provider, accounts, token: row.client_secret, warning, details: row.details || {} };
  } catch (e) {
    const err = e instanceof AdsError ? e : new AdsError("transient", String(e));
    if (err.kind === "auth") await health(c, fetchFn, provider, "error", err.message);
    else if (err.kind === "config") await health(c, fetchFn, provider, null, err.message);
    return { ok: false, provider, reason: err.message };
  }
}

async function listCampaigns(fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>, account: string): Promise<PlatformCampaign[]> {
  if (conn.provider === "meta_ads") return metaListCampaigns(fetchFn, conn.token, account);
  if (conn.provider === "tiktok_ads") return tiktokListCampaigns(fetchFn, conn.token, account);
  return googleListCampaigns(fetchFn, conn.google!, account);
}

async function setStatus(fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>, account: string, campaignId: string, action: StatusAction) {
  if (conn.provider === "meta_ads") return metaSetStatus(fetchFn, conn.token, campaignId, action);
  if (conn.provider === "tiktok_ads") return tiktokSetStatus(fetchFn, conn.token, account, campaignId, action);
  return googleSetStatus(fetchFn, conn.google!, account, campaignId, action);
}

const ACTION_STATUS: Record<StatusAction, CampaignStatus> = { pause: "paused", resume: "active", end: "ended" };

async function launch(
  fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>, account: string, spec: LaunchSpec, nowMs: number, sleep: Sleep,
): Promise<LaunchResult> {
  if (conn.provider === "meta_ads") {
    // The Page the ad speaks as, and the Instagram account linked to it, both recorded when Meta was connected.
    const page = conn.details.pages?.[0];
    if (!page?.id) {
      throw new AdsError("config", "Meta: esta conexión no ve ninguna Página. Reconecta Meta con una cuenta que administre la Página del restaurante.");
    }
    return metaLaunch(fetchFn, conn.token, account, { id: page.id, instagramId: page.instagram?.id || null }, spec, nowMs);
  }
  if (conn.provider === "tiktok_ads") return tiktokLaunch(fetchFn, conn.token, account, spec, nowMs, sleep);
  return googleLaunch(fetchFn, conn.google!, account, spec, nowMs);
}

export async function handleAdsWorker(req: Request, deps: WorkerDeps): Promise<Response> {
  const c = workerConfig(deps.env);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!c.secret || !c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);
  if (!safeEqual(req.headers.get("x-ads-worker-secret") || "", c.secret)) return json({ error: "unauthorized" }, 401);

  const nowMs = deps.now ? deps.now() : Date.now();
  const fetchFn = deps.fetch;
  const sleep: Sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let targeting: Promise<Targeting> | null = null;
  const summary: { jobs: { action: string; campaign: string; result: string }[]; synced: Record<string, number>; problems: string[] } =
    { jobs: [], synced: {}, problems: [] };

  // ---- connections -------------------------------------------------------------------------------
  const connections = new Map<Provider, Connection>();
  for (const row of await loadIntegrations(c, fetchFn)) {
    const conn = await prepare(c, fetchFn, row, nowMs);
    connections.set(row.provider, conn);
    if (!conn.ok) summary.problems.push(conn.reason);
  }

  // A provider is synced at most once per run, whether a job asked for it or the schedule did.
  const syncedOnce = new Map<Provider, Promise<void>>();
  const syncProvider = (conn: Extract<Connection, { ok: true }>) => {
    if (!syncedOnce.has(conn.provider)) {
      syncedOnce.set(conn.provider, (async () => {
        const rows: PlatformCampaign[] = [];
        for (const account of conn.accounts) rows.push(...await listCampaigns(fetchFn, conn, account));
        await rpc(c, fetchFn, "upsert_platform_campaigns", { p_provider: conn.provider, p_rows: rows });
        summary.synced[conn.provider] = rows.length;
        // A successful round trip proves the connection works: clear an old error, keep a pending warning.
        await health(c, fetchFn, conn.provider, "connected", conn.warning);
      })());
    }
    return syncedOnce.get(conn.provider)!;
  };

  const fail = async (job: Job, err: AdsError | Error) => {
    const kind = err instanceof AdsError ? err.kind : "transient";
    if (kind === "auth") await health(c, fetchFn, job.campaign.provider, "error", err.message);
    await rpc(c, fetchFn, "finish_campaign_job", { p_job_id: job.job_id, p_ok: false, p_error: err.message, p_retry: kind === "transient" });
    summary.jobs.push({ action: job.action, campaign: job.campaign.name, result: `${kind}: ${err.message}` });
  };

  // ---- queued jobs -------------------------------------------------------------------------------
  const jobs = (await rpc(c, fetchFn, "claim_campaign_jobs", { p_limit: 10 })) as Job[];
  for (const job of jobs || []) {
    const camp = job.campaign;
    const conn = connections.get(camp.provider);
    try {
      if (!conn || !conn.ok) {
        throw new AdsError("config", conn ? conn.reason : `Conecta ${NAMES[camp.provider]} en Canales primero`);
      }

      if (job.action === "launch") {
        targeting ??= loadTargeting(c, fetchFn);
        const spec = launchSpec(camp, await targeting);
        // Everything the owner can fix is caught before a single call to the platform.
        const problem = validateLaunch(camp.provider, spec, nowMs);
        if (problem) throw new AdsError("platform", problem);
        const account = camp.account_id || conn.accounts[0];
        const made = await launch(fetchFn, conn, account, spec, nowMs, sleep);
        await rpc(c, fetchFn, "finish_campaign_job", {
          p_job_id: job.job_id, p_ok: true,
          p_campaign: { status: "active", external_id: made.campaignId, platform_ids: made.ids, account_id: account, platform_status: "ACTIVE" },
        });
        summary.jobs.push({ action: job.action, campaign: camp.name, result: "ok" });
        continue;
      }

      if (job.action === "sync") {
        await syncProvider(conn);
        await rpc(c, fetchFn, "finish_campaign_job", { p_job_id: job.job_id, p_ok: true });
        summary.jobs.push({ action: job.action, campaign: camp.name, result: "ok" });
        continue;
      }

      const campaignId = camp.platform_ids?.campaign || camp.external_id;
      const account = camp.account_id || conn.accounts[0];
      if (!campaignId) throw new AdsError("platform", "Esta campaña no existe en la plataforma todavía");
      await setStatus(fetchFn, conn, account, campaignId, job.action);
      await rpc(c, fetchFn, "finish_campaign_job", {
        p_job_id: job.job_id, p_ok: true,
        p_campaign: { status: ACTION_STATUS[job.action], platform_ids: { campaign: campaignId }, account_id: account },
      });
      summary.jobs.push({ action: job.action, campaign: camp.name, result: "ok" });
    } catch (e) {
      await fail(job, e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ---- scheduled sync ----------------------------------------------------------------------------
  for (const conn of connections.values()) {
    if (!conn.ok) continue;
    try { await syncProvider(conn); } catch (e) {
      const err = e instanceof AdsError ? e : new AdsError("transient", e instanceof Error ? e.message : String(e));
      if (err.kind === "auth") await health(c, fetchFn, conn.provider, "error", err.message);
      else if (err.kind === "config") await health(c, fetchFn, conn.provider, null, err.message);
      summary.problems.push(err.message);
    }
  }

  return json({ ok: true, ...summary });
}
