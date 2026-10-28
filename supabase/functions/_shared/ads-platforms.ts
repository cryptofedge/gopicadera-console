// Talking to Meta, TikTok and Google Ads: list campaigns with lifetime numbers, and pause / resume / end
// one. Every network call goes through the injected fetch, so tests can stand in for each platform.
import {
  AdsError, META_GRAPH, TIKTOK_API, GOOGLE_ADS_API, GOOGLE_CAMPAIGNS_QUERY,
  metaCampaignsUrl, metaInsightsUrl, metaToCampaigns, metaError, metaStatusValue,
  tiktokCampaignsUrl, tiktokReportUrl, tiktokToCampaigns, tiktokError, tiktokStatusValue,
  googleToCampaigns, googleError, googleStatusOperation, googleTokenRefreshBody,
} from "./ads-lib.ts";
import type { MetaCampaignRow, MetaInsightRow, PlatformCampaign, StatusAction, TiktokCampaignRow, TiktokReportRow, GoogleSearchRow } from "./ads-lib.ts";
import { GOOGLE_TOKEN_URL } from "./oauth-lib.ts";

// More pages than a restaurant will ever have; a bound so a platform bug cannot loop forever.
const MAX_PAGES = 10;

/** A fetch that turns "the network failed" into a retryable error instead of an exception. */
async function send(fetchFn: typeof fetch, platform: string, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try { res = await fetchFn(url, init); } catch (e) {
    throw new AdsError("transient", `${platform} no responde: ${e instanceof Error ? e.message : e}`);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

// ----------------------------------------------------------------------------------------- Meta ---
async function metaPaged<T>(fetchFn: typeof fetch, firstUrl: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = firstUrl;
  for (let i = 0; next && i < MAX_PAGES; i++) {
    const { status, body } = await send(fetchFn, "Meta", next);
    const err = metaError(body, status);
    if (err) throw err;
    const b = body as { data?: T[]; paging?: { next?: string } };
    out.push(...(b.data || []));
    next = b.paging?.next;
  }
  return out;
}

export async function metaListCampaigns(fetchFn: typeof fetch, token: string, accountId: string): Promise<PlatformCampaign[]> {
  const campaigns = await metaPaged<MetaCampaignRow>(fetchFn, metaCampaignsUrl(token, accountId));
  const insights = await metaPaged<MetaInsightRow>(fetchFn, metaInsightsUrl(token, accountId));
  return metaToCampaigns(accountId, campaigns, insights);
}

export async function metaSetStatus(fetchFn: typeof fetch, token: string, campaignId: string, action: StatusAction): Promise<void> {
  const { status, body } = await send(fetchFn, "Meta", `${META_GRAPH}/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: metaStatusValue(action), access_token: token }).toString(),
  });
  const err = metaError(body, status);
  if (err) throw err;
}

// --------------------------------------------------------------------------------------- TikTok ---
async function tiktokCall<T>(fetchFn: typeof fetch, token: string, url: string, init?: RequestInit): Promise<T> {
  const headers = { "Access-Token": token, ...(init?.body ? { "Content-Type": "application/json" } : {}) };
  const { status, body } = await send(fetchFn, "TikTok", url, { ...init, headers });
  const err = tiktokError(body, status);
  if (err) throw err;
  return (body as { data: T }).data;
}

type TiktokPage<T> = { list?: T[]; page_info?: { total_page?: number } };

export async function tiktokListCampaigns(fetchFn: typeof fetch, token: string, advertiserId: string): Promise<PlatformCampaign[]> {
  const campaigns: TiktokCampaignRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tiktokCall<TiktokPage<TiktokCampaignRow>>(fetchFn, token, tiktokCampaignsUrl(advertiserId, page));
    campaigns.push(...(data.list || []));
    if (page >= Number(data.page_info?.total_page || 1)) break;
  }
  const report: TiktokReportRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tiktokCall<TiktokPage<TiktokReportRow>>(fetchFn, token, tiktokReportUrl(advertiserId, page));
    report.push(...(data.list || []));
    if (page >= Number(data.page_info?.total_page || 1)) break;
  }
  return tiktokToCampaigns(advertiserId, campaigns, report);
}

export async function tiktokSetStatus(fetchFn: typeof fetch, token: string, advertiserId: string, campaignId: string, action: StatusAction): Promise<void> {
  await tiktokCall(fetchFn, token, `${TIKTOK_API}/campaign/status/update/`, {
    method: "POST",
    body: JSON.stringify({ advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: tiktokStatusValue(action) }),
  });
}

// --------------------------------------------------------------------------------------- Google ---
export interface GoogleAuth { accessToken: string; developerToken: string; loginCustomerId: string }

/** Google's access token lasts an hour and is never stored; a fresh one is minted from the refresh token each run. */
export async function googleMintAccessToken(fetchFn: typeof fetch, clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  if (!clientId || !clientSecret) throw new AdsError("config", "Google Ads: faltan GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET");
  const { status, body } = await send(fetchFn, "Google", GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: googleTokenRefreshBody(clientId, clientSecret, refreshToken),
  });
  const b = body as { access_token?: string; error?: string; error_description?: string } | null;
  if (status < 400 && b?.access_token) return b.access_token;
  if (b?.error === "invalid_grant") throw new AdsError("auth", "Google Ads pide reconectar: el permiso guardado ya no sirve");
  if (status >= 500) throw new AdsError("transient", `Google: ${b?.error_description || `HTTP ${status}`}`);
  throw new AdsError("config", `Google: ${b?.error_description || b?.error || `HTTP ${status}`}`);
}

function googleHeaders(auth: GoogleAuth): Record<string, string> {
  if (!auth.developerToken) {
    throw new AdsError("config", "Google Ads: falta GOOGLE_ADS_DEVELOPER_TOKEN (cuenta de administrador, nivel Explorer o más)");
  }
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "developer-token": auth.developerToken,
    "Content-Type": "application/json",
  };
  if (auth.loginCustomerId) h["login-customer-id"] = auth.loginCustomerId;
  return h;
}

async function googlePost<T>(fetchFn: typeof fetch, auth: GoogleAuth, url: string, payload: unknown): Promise<T> {
  const { status, body } = await send(fetchFn, "Google", url, { method: "POST", headers: googleHeaders(auth), body: JSON.stringify(payload) });
  const err = googleError(body, status);
  if (err) throw err;
  return body as T;
}

export async function googleListCampaigns(fetchFn: typeof fetch, auth: GoogleAuth, customerId: string): Promise<PlatformCampaign[]> {
  const rows: GoogleSearchRow[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await googlePost<{ results?: GoogleSearchRow[]; nextPageToken?: string }>(
      fetchFn, auth, `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
      pageToken ? { query: GOOGLE_CAMPAIGNS_QUERY, pageToken } : { query: GOOGLE_CAMPAIGNS_QUERY },
    );
    rows.push(...(body.results || []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return googleToCampaigns(customerId, rows);
}

export async function googleSetStatus(fetchFn: typeof fetch, auth: GoogleAuth, customerId: string, campaignId: string, action: StatusAction): Promise<void> {
  await googlePost(fetchFn, auth, `${GOOGLE_ADS_API}/customers/${customerId}/campaigns:mutate`, {
    operations: [googleStatusOperation(customerId, campaignId, action)],
  });
}
