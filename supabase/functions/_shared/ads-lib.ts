// Pure helpers for the ad platforms: URLs, status and money conversions, error classification. Same split
// as oauth-lib.ts and stripe-lib.ts -- no Deno globals, no network -- so it runs unchanged under Node's tests.
import { META_GRAPH_VERSION, GOOGLE_ADS_API_VERSION } from "./oauth-lib.ts";

export type Provider = "meta_ads" | "tiktok_ads" | "google_ads";
export type CampaignStatus = "active" | "paused" | "ended";
export type StatusAction = "pause" | "resume" | "end";

export const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
export const GOOGLE_ADS_API = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

/** One campaign as the console stores it, whichever platform it came from. Money is in dollars. */
export interface PlatformCampaign {
  campaign_id: string;
  account_id: string;
  name: string | null;
  status: CampaignStatus;
  platform_status: string | null;
  daily_budget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  starts_at: string | null;
  ends_at: string | null;
}

// ------------------------------------------------------------------------------------- errors ---
// What the worker does about a failure depends only on its kind:
//   auth       the connection is dead -- mark it "Con problema", the owner reconnects
//   transient  rate limit or platform hiccup -- leave the job for the next run
//   config     something only Fellito can fix (a missing developer token, a missing Page)
//   platform   the platform refused this particular request -- record why, stop retrying
export type AdsErrorKind = "auth" | "transient" | "config" | "platform";

export class AdsError extends Error {
  kind: AdsErrorKind;
  constructor(kind: AdsErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money2 = (n: number): number => Math.round(n * 100) / 100;

// ----------------------------------------------------------------------------------------- Meta ---
const META_PURCHASE_ACTIONS = new Set(["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"]);

export function metaStatus(effective: string | undefined, configured: string | undefined): CampaignStatus {
  const s = (effective || configured || "").toUpperCase();
  if (s === "ARCHIVED" || s === "DELETED") return "ended";
  if (s.includes("PAUSED")) return "paused";
  return "active"; // ACTIVE, IN_PROCESS, WITH_ISSUES -- the raw value is kept in platform_status
}

export function metaStatusValue(action: StatusAction): string {
  return action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "ARCHIVED";
}

export function metaCampaignsUrl(token: string, accountId: string): string {
  const u = new URL(`${META_GRAPH}/act_${accountId}/campaigns`);
  u.searchParams.set("access_token", token);
  u.searchParams.set("fields", "id,name,status,effective_status,daily_budget,start_time,stop_time");
  // Archived campaigns only come back when asked for by status.
  u.searchParams.set("effective_status", JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]));
  u.searchParams.set("limit", "200");
  return u.toString();
}

export function metaInsightsUrl(token: string, accountId: string): string {
  const u = new URL(`${META_GRAPH}/act_${accountId}/insights`);
  u.searchParams.set("access_token", token);
  u.searchParams.set("level", "campaign");
  u.searchParams.set("date_preset", "maximum");
  u.searchParams.set("fields", "campaign_id,spend,impressions,clicks,inline_link_clicks,actions");
  u.searchParams.set("limit", "500");
  return u.toString();
}

export interface MetaCampaignRow { id?: string; name?: string; status?: string; effective_status?: string; daily_budget?: string; start_time?: string; stop_time?: string }
export interface MetaInsightRow { campaign_id?: string; spend?: string; impressions?: string; clicks?: string; inline_link_clicks?: string; actions?: { action_type?: string; value?: string }[] }

export function metaToCampaigns(accountId: string, campaigns: MetaCampaignRow[], insights: MetaInsightRow[]): PlatformCampaign[] {
  const byId = new Map(insights.filter((i) => i.campaign_id).map((i) => [String(i.campaign_id), i]));
  return campaigns.filter((c) => c.id).map((c) => {
    const ins = byId.get(String(c.id));
    const orders = (ins?.actions || [])
      .filter((a) => META_PURCHASE_ACTIONS.has(String(a.action_type)))
      .reduce((t, a) => t + num(a.value), 0);
    return {
      campaign_id: String(c.id),
      account_id: accountId,
      name: c.name ?? null,
      status: metaStatus(c.effective_status, c.status),
      platform_status: c.effective_status || c.status || null,
      // Meta keeps budgets in cents.
      daily_budget: c.daily_budget ? money2(num(c.daily_budget) / 100) : null,
      spend: money2(num(ins?.spend)),
      impressions: num(ins?.impressions),
      clicks: num(ins?.inline_link_clicks ?? ins?.clicks),
      orders: Math.round(orders),
      starts_at: c.start_time || null,
      ends_at: c.stop_time || null,
    };
  });
}

/** Meta answers errors as { error: { code, message } }, sometimes with HTTP 200 on batch-like calls. */
export function metaError(body: unknown, status: number): AdsError | null {
  const e = (body as { error?: { code?: number; message?: string; error_subcode?: number } } | null)?.error;
  if (!e && status < 400) return null;
  const code = Number(e?.code);
  const msg = e?.message || `HTTP ${status}`;
  if (code === 190 || code === 102) return new AdsError("auth", `Meta pide reconectar: ${msg}`);
  if (code === 10 || (code >= 200 && code < 300)) return new AdsError("auth", `Meta no dio permiso: ${msg}`);
  if ([4, 17, 32, 613, 80000, 80004].includes(code) || status >= 500) return new AdsError("transient", `Meta: ${msg}`);
  return new AdsError("platform", `Meta: ${msg}`);
}

// --------------------------------------------------------------------------------------- TikTok ---
export function tiktokStatus(operation: string | undefined, secondary: string | undefined): CampaignStatus {
  if (String(secondary || "").includes("DELETE")) return "ended";
  return String(operation).toUpperCase() === "ENABLE" ? "active" : "paused";
}

export function tiktokStatusValue(action: StatusAction): string {
  return action === "pause" ? "DISABLE" : action === "resume" ? "ENABLE" : "DELETE";
}

// TikTok's GET endpoints take array and object parameters as JSON strings.
export function tiktokCampaignsUrl(advertiserId: string, page: number): string {
  const u = new URL(`${TIKTOK_API}/campaign/get/`);
  u.searchParams.set("advertiser_id", advertiserId);
  u.searchParams.set("page", String(page));
  u.searchParams.set("page_size", "100");
  u.searchParams.set("fields", JSON.stringify(["campaign_id", "campaign_name", "operation_status", "secondary_status", "budget", "budget_mode"]));
  return u.toString();
}

export function tiktokReportUrl(advertiserId: string, page: number): string {
  const u = new URL(`${TIKTOK_API}/report/integrated/get/`);
  u.searchParams.set("advertiser_id", advertiserId);
  u.searchParams.set("report_type", "BASIC");
  u.searchParams.set("data_level", "AUCTION_CAMPAIGN");
  u.searchParams.set("dimensions", JSON.stringify(["campaign_id"]));
  u.searchParams.set("metrics", JSON.stringify(["spend", "impressions", "clicks", "conversion"]));
  u.searchParams.set("query_lifetime", "true");
  u.searchParams.set("page", String(page));
  u.searchParams.set("page_size", "1000");
  return u.toString();
}

export interface TiktokCampaignRow { campaign_id?: string | number; campaign_name?: string; operation_status?: string; secondary_status?: string; budget?: number | string; budget_mode?: string }
export interface TiktokReportRow { dimensions?: { campaign_id?: string | number }; metrics?: { spend?: string; impressions?: string; clicks?: string; conversion?: string } }

export function tiktokToCampaigns(advertiserId: string, campaigns: TiktokCampaignRow[], report: TiktokReportRow[]): PlatformCampaign[] {
  const byId = new Map(report.filter((r) => r.dimensions?.campaign_id != null).map((r) => [String(r.dimensions!.campaign_id), r.metrics || {}]));
  return campaigns.filter((c) => c.campaign_id != null).map((c) => {
    const m = byId.get(String(c.campaign_id)) || {};
    return {
      campaign_id: String(c.campaign_id),
      account_id: advertiserId,
      name: c.campaign_name ?? null,
      status: tiktokStatus(c.operation_status, c.secondary_status),
      platform_status: c.secondary_status || c.operation_status || null,
      // TikTok keeps budgets in dollars; only a daily budget is a daily budget.
      daily_budget: c.budget_mode === "BUDGET_MODE_DAY" ? money2(num(c.budget)) : null,
      spend: money2(num(m.spend)),
      impressions: num(m.impressions),
      clicks: num(m.clicks),
      orders: Math.round(num(m.conversion)),
      starts_at: null,
      ends_at: null,
    };
  });
}

/** TikTok answers HTTP 200 with { code, message }; anything but code 0 is a failure. */
export function tiktokError(body: unknown, status: number): AdsError | null {
  const b = body as { code?: number; message?: string } | null;
  if (status < 400 && b && b.code === 0) return null;
  const msg = b?.message || `HTTP ${status}`;
  if (b?.code === 40100 || status === 429 || status >= 500) return new AdsError("transient", `TikTok: ${msg}`);
  if (/access[ _-]?token|unauthori[sz]ed|authoriz|permission/i.test(msg)) return new AdsError("auth", `TikTok pide reconectar: ${msg}`);
  return new AdsError("platform", `TikTok: ${msg}`);
}

// --------------------------------------------------------------------------------------- Google ---
export function googleStatus(s: string | undefined): CampaignStatus {
  const v = String(s || "").toUpperCase();
  return v === "ENABLED" ? "active" : v === "REMOVED" ? "ended" : "paused";
}

// No date segment: lifetime totals. Removed campaigns are left out -- they cannot come back.
export const GOOGLE_CAMPAIGNS_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, " +
  "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions " +
  "FROM campaign WHERE campaign.status != 'REMOVED'";

export interface GoogleSearchRow {
  campaign?: { id?: string; name?: string; status?: string };
  campaignBudget?: { amountMicros?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string };
}

export function googleToCampaigns(customerId: string, rows: GoogleSearchRow[]): PlatformCampaign[] {
  return rows.filter((r) => r.campaign?.id).map((r) => ({
    campaign_id: String(r.campaign!.id),
    account_id: customerId,
    name: r.campaign!.name ?? null,
    status: googleStatus(r.campaign!.status),
    platform_status: r.campaign!.status || null,
    // Google keeps money in micros (millionths of a dollar).
    daily_budget: r.campaignBudget?.amountMicros ? money2(num(r.campaignBudget.amountMicros) / 1e6) : null,
    spend: money2(num(r.metrics?.costMicros) / 1e6),
    impressions: num(r.metrics?.impressions),
    clicks: num(r.metrics?.clicks),
    orders: Math.round(num(r.metrics?.conversions)),
    starts_at: null,
    ends_at: null,
  }));
}

export function googleCampaignResource(customerId: string, campaignId: string): string {
  return `customers/${customerId}/campaigns/${campaignId}`;
}

export function googleStatusOperation(customerId: string, campaignId: string, action: StatusAction): Record<string, unknown> {
  const resourceName = googleCampaignResource(customerId, campaignId);
  if (action === "end") return { remove: resourceName };
  return { update: { resourceName, status: action === "pause" ? "PAUSED" : "ENABLED" }, updateMask: "status" };
}

/** Google errors: { error: { code, status, message, details: [{ errors: [{ errorCode, message }] }] } }. */
export function googleError(body: unknown, status: number): AdsError | null {
  if (status < 400) return null;
  const e = (body as { error?: { status?: string; message?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } } | null)?.error;
  const inner = e?.details?.flatMap((d) => d.errors || [])[0];
  const msg = inner?.message || e?.message || `HTTP ${status}`;
  const codes = JSON.stringify(inner?.errorCode || {});
  if (/DEVELOPER_TOKEN/.test(codes) || /developer token/i.test(msg)) return new AdsError("config", `Google Ads: ${msg}`);
  if (status === 401 || e?.status === "UNAUTHENTICATED") return new AdsError("auth", `Google Ads pide reconectar: ${msg}`);
  if (status === 403 || e?.status === "PERMISSION_DENIED") return new AdsError("auth", `Google Ads no dio permiso: ${msg}`);
  if (status === 429 || e?.status === "RESOURCE_EXHAUSTED" || /CONCURRENT_MODIFICATION/.test(codes) || status >= 500) {
    return new AdsError("transient", `Google Ads: ${msg}`);
  }
  return new AdsError("platform", `Google Ads: ${msg}`);
}

export function googleTokenRefreshBody(clientId: string, clientSecret: string, refreshToken: string): string {
  return new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }).toString();
}

// ======================================================================================== create ===
// What a launch needs, assembled by the worker from the campaign row and the ads_targeting setting.
export interface LaunchSpec {
  name: string;
  headline: string;
  body: string;
  dailyBudget: number;      // dollars
  startsAt: string | null;  // ISO; null = now
  endsAt: string | null;    // ISO; null = no end
  url: string;
  mediaUrl: string | null;  // image (Meta) or video (TikTok), public URL in the "ads" bucket
  lat: number;
  lng: number;
  radiusMi: number;
  google?: { headlines: string[]; descriptions: string[]; keywords: string[] };
  tiktokLocationIds?: string[];
}

// The smallest daily budget each platform accepts for this kind of ad.
export const MIN_DAILY_BUDGET: Record<Provider, number> = { meta_ads: 1, tiktok_ads: 20, google_ads: 1 };
export const TIKTOK_AD_TEXT_MAX = 100;

export function tiktokAdText(spec: Pick<LaunchSpec, "headline" | "body">): string {
  // TikTok ads have no headline field; the account name shows instead, so the headline leads the text.
  return [spec.headline.trim(), spec.body.trim()].filter(Boolean).join(". ");
}

/** Everything the owner can fix before anything is sent to a platform. Spanish, shown on the campaign. */
export function validateLaunch(provider: Provider, spec: LaunchSpec, nowMs: number): string | null {
  const name = { meta_ads: "Meta", tiktok_ads: "TikTok", google_ads: "Google" }[provider];
  if (!spec.name.trim()) return "Ponle un nombre a la campaña.";
  if (!/^https?:\/\/\S+\.\S+/.test(spec.url)) return "El enlace de destino no es una dirección web válida.";
  if (!(spec.dailyBudget >= MIN_DAILY_BUDGET[provider])) {
    return `${name} pide un presupuesto diario de al menos $${MIN_DAILY_BUDGET[provider]}.`;
  }
  if (!Number.isFinite(spec.lat) || !Number.isFinite(spec.lng)) return "Falta la ubicación del restaurante (Ajustes → Anuncios).";
  const end = spec.endsAt ? Date.parse(spec.endsAt) : null;
  const start = Math.max(spec.startsAt ? Date.parse(spec.startsAt) : nowMs, nowMs);
  if (end !== null && end <= nowMs) return "La fecha de fin ya pasó.";
  if (end !== null && end - start < 86400_000) return "Con presupuesto diario, la campaña tiene que durar más de un día.";

  if (provider === "meta_ads") {
    if (!spec.mediaUrl) return "Meta necesita una imagen para el anuncio.";
    if (!spec.headline.trim() || !spec.body.trim()) return "Escribe el titular y el texto del anuncio.";
    if (spec.radiusMi < 0.63 || spec.radiusMi > 50) return "Para Meta el radio tiene que estar entre 0.63 y 50 millas.";
  }
  if (provider === "tiktok_ads") {
    if (!spec.mediaUrl) return "TikTok necesita un video para el anuncio.";
    const text = tiktokAdText(spec);
    if (!text) return "Escribe el texto del anuncio.";
    if (text.length > TIKTOK_AD_TEXT_MAX) return `Para TikTok, titular y texto juntos deben tener ${TIKTOK_AD_TEXT_MAX} caracteres o menos (ahora ${text.length}).`;
    if (!spec.tiktokLocationIds?.length) return "Faltan las zonas de TikTok (Ajustes → Anuncios).";
  }
  if (provider === "google_ads") {
    const g = spec.google;
    const heads = (g?.headlines || []).map((h) => h.trim()).filter(Boolean);
    const descs = (g?.descriptions || []).map((d) => d.trim()).filter(Boolean);
    const kws = (g?.keywords || []).map((k) => k.trim()).filter(Boolean);
    if (heads.length < 3 || heads.length > 15) return "Google pide entre 3 y 15 titulares.";
    if (heads.some((h) => h.length > 30)) return "Cada titular de Google puede tener 30 caracteres como máximo.";
    if (descs.length < 2 || descs.length > 4) return "Google pide entre 2 y 4 descripciones.";
    if (descs.some((d) => d.length > 90)) return "Cada descripción de Google puede tener 90 caracteres como máximo.";
    if (kws.length < 1) return "Google necesita al menos una palabra clave.";
    if (kws.some((k) => k.length > 80)) return "Cada palabra clave puede tener 80 caracteres como máximo.";
  }
  return null;
}

// ------------------------------------------------------------------------------- Meta: create ---
export function metaObjectStorySpec(spec: LaunchSpec, pageId: string, instagramId: string | null, imageHash: string) {
  return {
    page_id: pageId,
    // Names the Instagram account so the same ad runs on Instagram; without it Meta uses the Page.
    ...(instagramId ? { instagram_user_id: instagramId } : {}),
    link_data: {
      image_hash: imageHash,
      link: spec.url,
      message: spec.body,
      name: spec.headline,
      call_to_action: { type: "LEARN_MORE", value: { link: spec.url } },
    },
  };
}

export function metaTargeting(spec: LaunchSpec) {
  return {
    geo_locations: {
      custom_locations: [{ latitude: spec.lat, longitude: spec.lng, radius: spec.radiusMi, distance_unit: "mile" }],
    },
    age_min: 18,
    // Must be stated explicitly since v23; 0 keeps the radius as drawn instead of letting Meta widen it.
    targeting_automation: { advantage_audience: 0 },
  };
}

/** Form fields for POST /act_{id}/adsets. Objects travel as JSON strings, which Graph accepts. */
export function metaAdsetParams(spec: LaunchSpec, campaignId: string, nowMs: number): Record<string, string> {
  const p: Record<string, string> = {
    name: `${spec.name} · conjunto`,
    campaign_id: campaignId,
    daily_budget: String(Math.round(spec.dailyBudget * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    targeting: JSON.stringify(metaTargeting(spec)),
    status: "ACTIVE", // runs only once its campaign is switched on, which is the last step
  };
  if (spec.startsAt && Date.parse(spec.startsAt) > nowMs) p.start_time = new Date(spec.startsAt).toISOString();
  if (spec.endsAt) p.end_time = new Date(spec.endsAt).toISOString();
  return p;
}

// ----------------------------------------------------------------------------- TikTok: create ---
/** TikTok wants "YYYY-MM-DD HH:MM:SS" in UTC. */
export function tiktokTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function tiktokAdgroupBody(advertiserId: string, campaignId: string, spec: LaunchSpec, nowMs: number) {
  // TikTok refuses a start time in the past; a few minutes ahead means "now".
  const start = Math.max(spec.startsAt ? Date.parse(spec.startsAt) : 0, nowMs + 10 * 60_000);
  return {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: `${spec.name} · grupo`,
    promotion_type: "WEBSITE",
    placement_type: "PLACEMENT_TYPE_NORMAL",
    placements: ["PLACEMENT_TIKTOK"],
    location_ids: spec.tiktokLocationIds || [],
    budget_mode: "BUDGET_MODE_DAY",
    budget: Math.round(spec.dailyBudget * 100) / 100, // TikTok keeps dollars
    schedule_type: spec.endsAt ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
    schedule_start_time: tiktokTime(start),
    ...(spec.endsAt ? { schedule_end_time: tiktokTime(Date.parse(spec.endsAt)) } : {}),
    optimization_goal: "CLICK",
    billing_event: "CPC",
    bid_type: "BID_TYPE_NO_BID",
    pacing: "PACING_MODE_SMOOTH",
    operation_status: "ENABLE",
  };
}

export interface TiktokIdentity { identity_id?: string; identity_type?: string; identity_authorized_bc_id?: string; display_name?: string }

/** Since January 2026 new campaigns must run as a real TikTok account; Custom Identity is gone. */
export function pickTiktokIdentity(list: TiktokIdentity[]): TiktokIdentity | null {
  return list.find((i) => i.identity_type === "TT_USER" && i.identity_id)
    || list.find((i) => i.identity_type === "BC_AUTH_TT" && i.identity_id)
    || null;
}

export function tiktokAdBody(advertiserId: string, adgroupId: string, spec: LaunchSpec, videoId: string, imageId: string, identity: TiktokIdentity) {
  return {
    advertiser_id: advertiserId,
    adgroup_id: adgroupId,
    creatives: [{
      ad_name: spec.name,
      ad_format: "SINGLE_VIDEO",
      video_id: videoId,
      image_ids: [imageId],
      identity_type: identity.identity_type,
      identity_id: identity.identity_id,
      ...(identity.identity_type === "BC_AUTH_TT" && identity.identity_authorized_bc_id
        ? { identity_authorized_bc_id: identity.identity_authorized_bc_id } : {}),
      ad_text: tiktokAdText(spec),
      call_to_action: "LEARN_MORE",
      landing_page_url: spec.url,
    }],
  };
}

// ----------------------------------------------------------------------------- Google: create ---
/** "yyyy-MM-dd HH:mm:ss" (the format that replaced start_date/end_date in v23), day precision. */
export function googleDateTime(iso: string, endOfDay: boolean): string {
  return `${iso.slice(0, 10)} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

/**
 * One atomic googleAds:mutate: budget, Search campaign (paused), radius around the restaurant, ad group,
 * keywords and a responsive search ad. Temporary negative ids tie the pieces together within the request.
 */
export function googleCreateOperations(customerId: string, spec: LaunchSpec, todayIso: string, uniq: string): Record<string, unknown>[] {
  const c = `customers/${customerId}`;
  const budget = `${c}/campaignBudgets/-1`;
  const campaign = `${c}/campaigns/-2`;
  const adGroup = `${c}/adGroups/-3`;
  const g = spec.google!;
  const startIso = spec.startsAt && spec.startsAt.slice(0, 10) > todayIso ? spec.startsAt : todayIso;
  return [
    { campaignBudgetOperation: { create: {
      resourceName: budget, name: `${spec.name} · presupuesto ${uniq}`,
      amountMicros: String(Math.round(spec.dailyBudget * 1e6)), deliveryMethod: "STANDARD", explicitlyShared: false,
    } } },
    { campaignOperation: { create: {
      resourceName: campaign, name: `${spec.name} ${uniq}`, status: "PAUSED",
      advertisingChannelType: "SEARCH", campaignBudget: budget,
      targetSpend: {}, // Maximize Clicks
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      startDateTime: googleDateTime(startIso, false),
      ...(spec.endsAt ? { endDateTime: googleDateTime(spec.endsAt, true) } : {}),
    } } },
    { campaignCriterionOperation: { create: {
      campaign,
      proximity: {
        geoPoint: { latitudeInMicroDegrees: Math.round(spec.lat * 1e6), longitudeInMicroDegrees: Math.round(spec.lng * 1e6) },
        radius: spec.radiusMi, radiusUnits: "MILES",
      },
    } } },
    { adGroupOperation: { create: { resourceName: adGroup, name: `${spec.name} · grupo`, campaign, type: "SEARCH_STANDARD", status: "ENABLED" } } },
    ...g.keywords.map((k) => k.trim()).filter(Boolean).map((text) => ({
      adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword: { text, matchType: "PHRASE" } } },
    })),
    { adGroupAdOperation: { create: { adGroup, status: "ENABLED", ad: {
      finalUrls: [spec.url],
      responsiveSearchAd: {
        headlines: g.headlines.map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
        descriptions: g.descriptions.map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
      },
    } } } },
  ];
}

/** The real campaign id out of a mutate response ("customers/1/campaigns/123" -> "123"). */
export function googleCreatedCampaignId(body: unknown): string | null {
  const results = (body as { mutateOperationResponses?: { campaignResult?: { resourceName?: string } }[] } | null)?.mutateOperationResponses || [];
  const rn = results.map((r) => r.campaignResult?.resourceName).find(Boolean);
  return rn ? rn.split("/").pop() || null : null;
}
