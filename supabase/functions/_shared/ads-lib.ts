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
