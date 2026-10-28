// The ads worker: drains campaign_jobs (launch / pause / resume / end / sync) and keeps the chosen ad account's
// campaigns and lifetime numbers in the campaigns table, on each connected platform.
//
// Woken by ads_schedule.sql -- right after a job is queued, and every 15 minutes -- or by hand with the
// x-ads-worker-secret header (the value is in Vault; see ADS_WORKER.md). It answers with a summary of what it
// did, never a token.
//
// It only ever touches the one ad account an owner chose in Canales (integrations.store_id), and on Meta the
// Page she chose (details.page_id). The login that connected may reach other businesses' accounts too.
import { json, safeEqual } from "./stripe-lib.ts";
import type { Env } from "./stripe-lib.ts";
import { rpc, RpcError } from "./handlers.ts";
import { AdsError, validateLaunch } from "./ads-lib.ts";
import type { CampaignStatus, LaunchSpec, PlatformCampaign, Provider, StatusAction } from "./ads-lib.ts";
import {
  metaListCampaigns, metaSetStatus, metaLaunch, metaAdAccounts, metaPages,
  tiktokListCampaigns, tiktokSetStatus, tiktokLaunch, tiktokAdvertisers,
  googleMintAccessToken, googleListCampaigns, googleSetStatus, googleLaunch, googleAccessibleAccounts,
} from "./ads-platforms.ts";
import type { AdAccount, GoogleAuth, LaunchResult, MetaPage, Sleep } from "./ads-platforms.ts";
import { loadAdsApps } from "./ads-apps.ts";
import type { AdsApp, AdsAppProvider } from "./ads-apps.ts";

export interface WorkerDeps {
  env: Env;
  fetch: typeof fetch;
  now?: () => number; // milliseconds
  sleep?: Sleep;      // tests pass a no-op; TikTok's video processing is polled with it
}

const NAMES: Record<Provider, string> = { meta_ads: "Meta", tiktok_ads: "TikTok", google_ads: "Google Ads" };
// Warn the owner this long before a Meta token lapses (it cannot be renewed without them).
const META_WARN_DAYS = 10;
// What the console shows until an owner picks Go Picadera's ad account. choose_ads_account clears a last_error
// that starts with it, so keep the wording in step with backend/ads_accounts.sql.
export const NO_ACCOUNT_CHOSEN = "Elige la cuenta publicitaria de Go Picadera en Canales";

function workerConfig(env: Env) {
  return {
    supabaseUrl: (env.SUPABASE_URL || "").replace(/\/$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    // Optional override. Normally the secret lives only in Vault, made by ads_schedule.sql.
    secret: env.ADS_WORKER_SECRET || "",
    // Optional since 2026-09-09; sent only when set.
    googleDeveloperToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    googleLoginCustomerId: (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, ""),
  };
}
type Config = ReturnType<typeof workerConfig>;

// ---- the shared secret -----------------------------------------------------------------------------------
// ads_schedule.sql stores a random secret in Vault and sends it on every wake-up; this reads the same value back
// through the service-role-only ads_worker_secret() function. Kept for a few minutes per function instance, and
// a failed read is kept just as long, so a flood of unauthenticated requests costs at most one database call
// per window.
const SECRET_TTL_MS = 5 * 60_000;
let secretCache: { value: string; until: number } | null = null;

/** For tests: start from an empty cache. */
export function forgetAdsWorkerSecret() {
  secretCache = null;
}

async function expectedSecret(c: Config, fetchFn: typeof fetch, nowMs: number): Promise<string> {
  if (c.secret) return c.secret;
  if (secretCache && nowMs < secretCache.until) return secretCache.value;
  let value = "";
  try {
    const v = await rpc(c, fetchFn, "ads_worker_secret", {});
    value = typeof v === "string" ? v : "";
  } catch (e) {
    // Never the value itself; there is none in an error anyway.
    console.error("could not read the worker secret from Vault:", e instanceof RpcError ? `HTTP ${e.status}` : "network error");
  }
  secretCache = { value, until: nowMs + SECRET_TTL_MS };
  return value;
}

// ---- connections -----------------------------------------------------------------------------------------
interface ConnectionDetails {
  token_expires_at?: string | null;
  // Every account and Page the login reaches, refreshed on every run.
  ad_accounts?: AdAccount[];
  pages?: MetaPage[];
  // The owner's choice (choose_ads_account): the Page the ads speak as, and when the account was picked.
  page_id?: string | null;
  chosen_at?: string | null;
}

interface IntegrationRow {
  provider: Provider;
  status: string;
  client_secret: string | null;
  store_id: string | null;
  details: ConnectionDetails | null;
  last_error: string | null;
}

/** A connection ready to use on its one chosen account, or the reason it is not. */
type Connection =
  | { ok: true; provider: Provider; account: string; token: string; google?: GoogleAuth; warning: string | null; details: ConnectionDetails }
  | { ok: false; provider: Provider; reason: string };

type Apps = Partial<Record<AdsAppProvider, AdsApp>>;

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
    `&select=provider,status,client_secret,store_id,details,last_error`;
  const r = await fetchFn(url, { headers: { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}` } });
  if (!r.ok) throw new Error(`could not read integrations: HTTP ${r.status}`);
  return await r.json() as IntegrationRow[];
}

// p_status null leaves the status alone; p_last_error null clears the note; p_details is merged into details.
async function health(
  c: Config, fetchFn: typeof fetch, provider: Provider, status: "connected" | "error" | null, lastError: string | null,
  details?: ConnectionDetails | null,
) {
  const args: Record<string, unknown> = { p_provider: provider, p_status: status, p_last_error: lastError };
  if (details) args.p_details = details;
  try {
    await rpc(c, fetchFn, "set_integration_health", args);
  } catch (e) { console.error("could not record integration health:", provider, e instanceof Error ? e.message : e); }
}

type Lists = Pick<ConnectionDetails, "ad_accounts" | "pages">;

/**
 * The accounts (and on Meta the Pages) the stored credential reaches right now, so an account granted after
 * connecting -- the owner's invitation accepted later -- shows up in Canales without reconnecting. Each list is
 * best-effort: a failed read keeps the stored one. Only a dead token, or Google refusing the whole Cloud
 * project, stops the run for this platform, the same as any other call would.
 */
async function refreshLists(
  fetchFn: typeof fetch, provider: Provider, token: string, google: GoogleAuth | undefined, apps: Apps, stored: ConnectionDetails,
): Promise<Lists> {
  const fresh: Lists = {};
  const read = async <T>(what: string, call: () => Promise<T>, fatal: boolean): Promise<T | null> => {
    try { return await call(); } catch (e) {
      if (fatal && e instanceof AdsError && (e.kind === "auth" || e.kind === "config")) throw e;
      console.error(`could not refresh ${NAMES[provider]} ${what}:`, e instanceof Error ? e.message : e);
      return null;
    }
  };
  if (provider === "meta_ads") {
    const accounts = await read("ad accounts", () => metaAdAccounts(fetchFn, token), true);
    if (accounts) fresh.ad_accounts = accounts;
    const pages = await read("Pages", () => metaPages(fetchFn, token), false);
    if (pages) fresh.pages = pages;
  } else if (provider === "google_ads" && google) {
    const accounts = await read("accounts", () => googleAccessibleAccounts(fetchFn, google, stored.ad_accounts || []), true);
    if (accounts) fresh.ad_accounts = accounts;
  } else if (provider === "tiktok_ads" && apps.tiktok_ads) {
    // TikTok lists advertisers only with the app's own id and secret.
    const app = apps.tiktok_ads;
    const accounts = await read("advertisers", () => tiktokAdvertisers(fetchFn, app.appId, app.appSecret, token), false);
    if (accounts) fresh.ad_accounts = accounts;
  }
  return fresh;
}

const accountsKey = (a: AdAccount[] | undefined) => JSON.stringify((a || []).map((x) => [x.id, x.name ?? null]));
const pagesKey = (p: MetaPage[] | undefined) =>
  JSON.stringify((p || []).map((x) => [x.id, x.name ?? null, x.instagram?.id ?? null, x.instagram?.username ?? null]));

/** Only what differs from what is stored, or null when nothing does. */
function changedLists(stored: ConnectionDetails, fresh: Lists): Lists | null {
  const out: Lists = {};
  if (fresh.ad_accounts && accountsKey(fresh.ad_accounts) !== accountsKey(stored.ad_accounts)) out.ad_accounts = fresh.ad_accounts;
  if (fresh.pages && pagesKey(fresh.pages) !== pagesKey(stored.pages)) out.pages = fresh.pages;
  return out.ad_accounts || out.pages ? out : null;
}

async function prepare(c: Config, fetchFn: typeof fetch, row: IntegrationRow, apps: Apps, nowMs: number): Promise<Connection> {
  const provider = row.provider;
  if (!row.client_secret) return { ok: false, provider, reason: `${NAMES[provider]} no tiene permiso guardado; conéctalo en Canales` };
  const stored: ConnectionDetails = row.details || {};

  try {
    let token = row.client_secret;
    let google: GoogleAuth | undefined;
    let warning: string | null = null;

    if (provider === "google_ads") {
      // For Google the stored credential is the refresh token; minting needs the app that issued it.
      const app = apps.google_ads;
      if (!app) throw new AdsError("config", "Google Ads: falta la app de Google (Client ID y Client Secret). Guárdala en Canales.");
      token = await googleMintAccessToken(fetchFn, app.appId, app.appSecret, row.client_secret);
      google = { accessToken: token, developerToken: c.googleDeveloperToken, loginCustomerId: c.googleLoginCustomerId };
    }

    const exp = stored.token_expires_at;
    if (provider === "meta_ads" && exp) {
      const left = Date.parse(exp) - nowMs;
      if (left <= 0) {
        const reason = `El permiso de Meta venció el ${ddmm(exp)}. Reconecta Meta en Canales.`;
        await health(c, fetchFn, provider, "error", reason);
        return { ok: false, provider, reason };
      }
      if (left < META_WARN_DAYS * 86400_000) warning = `Reconecta Meta antes del ${ddmm(exp)} o los anuncios dejarán de sincronizarse.`;
    }

    const fresh = await refreshLists(fetchFn, provider, token, google, apps, stored);
    const update = changedLists(stored, fresh);
    const details: ConnectionDetails = { ...stored, ...fresh };

    // Only an account an owner chose in Canales, and only while this login still reaches it. A comma list or a
    // store_id without chosen_at is what the old callback stored by itself, and is never used.
    const id = (row.store_id || "").trim();
    const chosen = id !== "" && !id.includes(",") && !!stored.chosen_at;
    if (!chosen || !(details.ad_accounts || []).some((a) => a.id === id)) {
      const reason = chosen ? `${NO_ACCOUNT_CHOSEN}: la que estaba elegida (${id}) ya no aparece en esta conexión.` : NO_ACCOUNT_CHOSEN;
      // Status unchanged; the lists go along so the owner has something to choose from.
      await health(c, fetchFn, provider, null, reason, update);
      return { ok: false, provider, reason };
    }
    // New lists, nothing else: the status and the note on the card stay as they are.
    if (update) await health(c, fetchFn, provider, null, row.last_error, update);

    return { ok: true, provider, account: id, token, google, warning, details };
  } catch (e) {
    const err = e instanceof AdsError ? e : new AdsError("transient", String(e));
    if (err.kind === "auth") await health(c, fetchFn, provider, "error", err.message);
    else if (err.kind === "config") await health(c, fetchFn, provider, null, err.message);
    return { ok: false, provider, reason: err.message };
  }
}

async function listCampaigns(fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>): Promise<PlatformCampaign[]> {
  if (conn.provider === "meta_ads") return metaListCampaigns(fetchFn, conn.token, conn.account);
  if (conn.provider === "tiktok_ads") return tiktokListCampaigns(fetchFn, conn.token, conn.account);
  return googleListCampaigns(fetchFn, conn.google!, conn.account);
}

async function setStatus(fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>, campaignId: string, action: StatusAction) {
  if (conn.provider === "meta_ads") return metaSetStatus(fetchFn, conn.token, campaignId, action);
  if (conn.provider === "tiktok_ads") return tiktokSetStatus(fetchFn, conn.token, conn.account, campaignId, action);
  return googleSetStatus(fetchFn, conn.google!, conn.account, campaignId, action);
}

const ACTION_STATUS: Record<StatusAction, CampaignStatus> = { pause: "paused", resume: "active", end: "ended" };

async function launch(
  fetchFn: typeof fetch, conn: Extract<Connection, { ok: true }>, spec: LaunchSpec, nowMs: number, sleep: Sleep,
): Promise<LaunchResult> {
  if (conn.provider === "meta_ads") {
    // The Page the owner chose in Canales, and the Instagram account linked to it, as this login sees it now.
    const pageId = conn.details.page_id;
    const page = pageId ? (conn.details.pages || []).find((p) => p.id === pageId) : undefined;
    if (!page) {
      throw new AdsError("config", "Meta: elige en Canales la Página de Facebook de Go Picadera con la que salen los anuncios.");
    }
    return metaLaunch(fetchFn, conn.token, conn.account, { id: page.id, instagramId: page.instagram?.id || null }, spec, nowMs);
  }
  if (conn.provider === "tiktok_ads") return tiktokLaunch(fetchFn, conn.token, conn.account, spec, nowMs, sleep);
  return googleLaunch(fetchFn, conn.google!, conn.account, spec, nowMs);
}

export async function handleAdsWorker(req: Request, deps: WorkerDeps): Promise<Response> {
  const c = workerConfig(deps.env);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!c.supabaseUrl || !c.serviceKey) return json({ error: "not_configured" }, 503);
  const nowMs = deps.now ? deps.now() : Date.now();
  // Before anything else: the secret is the only way in (the function runs with --no-verify-jwt).
  const expected = await expectedSecret(c, deps.fetch, nowMs);
  if (!expected) return json({ error: "not_configured" }, 503);
  if (!safeEqual(req.headers.get("x-ads-worker-secret") || "", expected)) return json({ error: "unauthorized" }, 401);

  const fetchFn = deps.fetch;
  const sleep: Sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let targeting: Promise<Targeting> | null = null;
  const summary: { jobs: { action: string; campaign: string; result: string }[]; synced: Record<string, number>; problems: string[] } =
    { jobs: [], synced: {}, problems: [] };

  // ---- connections -------------------------------------------------------------------------------
  const rows = await loadIntegrations(c, fetchFn);
  // Google mints its access token with its app; TikTok names advertisers with its app. Meta needs neither here.
  const needApps = rows.map((r) => r.provider).filter((p): p is AdsAppProvider => p === "google_ads" || p === "tiktok_ads");
  const apps: Apps = needApps.length ? await loadAdsApps(deps.env, fetchFn, needApps) : {};
  const connections = new Map<Provider, Connection>();
  for (const row of rows) {
    const conn = await prepare(c, fetchFn, row, apps, nowMs);
    connections.set(row.provider, conn);
    if (!conn.ok) summary.problems.push(conn.reason.startsWith(NAMES[row.provider]) ? conn.reason : `${NAMES[row.provider]}: ${conn.reason}`);
  }

  // A provider is synced at most once per run, whether a job asked for it or the schedule did.
  const syncedOnce = new Map<Provider, Promise<void>>();
  const syncProvider = (conn: Extract<Connection, { ok: true }>) => {
    if (!syncedOnce.has(conn.provider)) {
      syncedOnce.set(conn.provider, (async () => {
        const found = await listCampaigns(fetchFn, conn);
        await rpc(c, fetchFn, "upsert_platform_campaigns", { p_provider: conn.provider, p_rows: found });
        summary.synced[conn.provider] = found.length;
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
      // Never act on another account, whatever the campaign row says.
      if (camp.account_id && camp.account_id !== conn.account) {
        throw new AdsError("platform",
          `Esta campaña es de la cuenta publicitaria ${camp.account_id}, no de la que se eligió en Canales (${conn.account}). No se tocó.`);
      }

      if (job.action === "launch") {
        targeting ??= loadTargeting(c, fetchFn);
        const spec = launchSpec(camp, await targeting);
        // Everything the owner can fix is caught before a single call to the platform.
        const problem = validateLaunch(camp.provider, spec, nowMs);
        if (problem) throw new AdsError("platform", problem);
        const made = await launch(fetchFn, conn, spec, nowMs, sleep);
        await rpc(c, fetchFn, "finish_campaign_job", {
          p_job_id: job.job_id, p_ok: true,
          p_campaign: { status: "active", external_id: made.campaignId, platform_ids: made.ids, account_id: conn.account, platform_status: "ACTIVE" },
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
      if (!campaignId) throw new AdsError("platform", "Esta campaña no existe en la plataforma todavía");
      await setStatus(fetchFn, conn, campaignId, job.action);
      await rpc(c, fetchFn, "finish_campaign_job", {
        p_job_id: job.job_id, p_ok: true,
        p_campaign: { status: ACTION_STATUS[job.action], platform_ids: { campaign: campaignId }, account_id: conn.account },
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
