// Talking to Meta, TikTok and Google Ads: list campaigns with lifetime numbers, and pause / resume / end
// one. Every network call goes through the injected fetch, so tests can stand in for each platform.
import {
  AdsError, META_GRAPH, TIKTOK_API, GOOGLE_ADS_API, GOOGLE_CAMPAIGNS_QUERY, GOOGLE_CUSTOMER_NAME_QUERY,
  metaCampaignsUrl, metaInsightsUrl, metaToCampaigns, metaError, metaStatusValue,
  metaObjectStorySpec, metaAdsetParams,
  tiktokCampaignsUrl, tiktokReportUrl, tiktokToCampaigns, tiktokError, tiktokStatusValue,
  tiktokAdgroupBody, tiktokAdBody, pickTiktokIdentity,
  googleToCampaigns, googleError, googleStatusOperation, googleTokenRefreshBody,
  googleCreateOperations, googleCreatedCampaignId,
} from "./ads-lib.ts";
import type {
  GoogleSearchRow, LaunchSpec, MetaCampaignRow, MetaInsightRow, PlatformCampaign, StatusAction,
  TiktokCampaignRow, TiktokIdentity, TiktokReportRow,
} from "./ads-lib.ts";
import { GOOGLE_ACCESSIBLE_CUSTOMERS_URL, GOOGLE_TOKEN_URL, metaAdAccountsUrl, metaPagesUrl } from "./oauth-lib.ts";

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

// ------------------------------------------------------------- what a login can reach ---
// The ad accounts and Pages a login reaches, with names, recorded when a platform is connected and read again on
// every worker run (integrations.details.ad_accounts / .pages), so the owner can pick Go Picadera's in Canales.
export interface AdAccount { id: string; name: string | null }
export interface MetaPage { id: string; name: string | null; instagram: { id: string; username: string | null } | null }

export async function metaAdAccounts(fetchFn: typeof fetch, token: string): Promise<AdAccount[]> {
  const rows = await metaPaged<{ account_id?: string | number; name?: string }>(fetchFn, metaAdAccountsUrl(token));
  return rows.filter((a) => a.account_id != null && String(a.account_id) !== "").map((a) => ({ id: String(a.account_id), name: a.name ?? null }));
}

/** The Pages a login can advertise as, each with the Instagram professional account linked to it. */
export async function metaPages(fetchFn: typeof fetch, token: string): Promise<MetaPage[]> {
  type Row = { id?: string | number; name?: string; instagram_business_account?: { id?: string | number; username?: string } };
  const rows = await metaPaged<Row>(fetchFn, metaPagesUrl(token));
  return rows.filter((p) => p.id != null && String(p.id) !== "").map((p) => ({
    id: String(p.id),
    name: p.name ?? null,
    instagram: p.instagram_business_account?.id != null
      ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username ?? null }
      : null,
  }));
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

/** The advertisers this app's authorization reaches, with names. TikTok wants the app's own id and secret here. */
export async function tiktokAdvertisers(fetchFn: typeof fetch, appId: string, appSecret: string, token: string): Promise<AdAccount[]> {
  const u = new URL(`${TIKTOK_API}/oauth2/advertiser/get/`);
  u.searchParams.set("app_id", appId);
  u.searchParams.set("secret", appSecret);
  const data = await tiktokCall<{ list?: { advertiser_id?: string | number; advertiser_name?: string }[] }>(fetchFn, token, u.toString());
  return (data?.list || []).filter((a) => a.advertiser_id != null).map((a) => ({ id: String(a.advertiser_id), name: a.advertiser_name ?? null }));
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

// Developer tokens were sunset on 2026-09-09: access now comes from the Google Cloud project that owns the OAuth
// client, and a token that is sent is ignored. It is sent only when one is set.
function googleHeaders(auth: GoogleAuth): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };
  if (auth.developerToken) h["developer-token"] = auth.developerToken;
  if (auth.loginCustomerId) h["login-customer-id"] = auth.loginCustomerId;
  return h;
}

async function googlePost<T>(fetchFn: typeof fetch, auth: GoogleAuth, url: string, payload: unknown): Promise<T> {
  const { status, body } = await send(fetchFn, "Google", url, { method: "POST", headers: googleHeaders(auth), body: JSON.stringify(payload) });
  const err = googleError(body, status);
  if (err) throw err;
  return body as T;
}

// More than one restaurant's worth; a bound on the extra calls a login with many accounts costs.
export const GOOGLE_NAME_LOOKUPS = 20;

async function googleCustomerName(fetchFn: typeof fetch, auth: GoogleAuth, customerId: string): Promise<string | null> {
  const body = await googlePost<{ results?: { customer?: { descriptiveName?: string } }[] }>(
    fetchFn, auth, `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`, { query: GOOGLE_CUSTOMER_NAME_QUERY },
  );
  return body.results?.[0]?.customer?.descriptiveName || null;
}

/**
 * The customer ids this login reaches directly (listAccessibleCustomers), each with its name. Names are
 * best-effort: one lookup per account whose name is not already known, at most GOOGLE_NAME_LOOKUPS, and a
 * failed lookup leaves the name null. Only the list itself can fail.
 */
export async function googleAccessibleAccounts(
  fetchFn: typeof fetch, auth: Pick<GoogleAuth, "accessToken" | "developerToken">, known: AdAccount[] = [],
): Promise<AdAccount[]> {
  // Directly accessible accounts need no login-customer-id, and naming a manager there would be wrong for them.
  const direct: GoogleAuth = { accessToken: auth.accessToken, developerToken: auth.developerToken, loginCustomerId: "" };
  const headers = googleHeaders(direct);
  delete headers["Content-Type"];
  const { status, body } = await send(fetchFn, "Google", GOOGLE_ACCESSIBLE_CUSTOMERS_URL, { headers });
  const err = googleError(body, status);
  if (err) throw err;
  const ids = [...new Set(((body as { resourceNames?: string[] } | null)?.resourceNames || [])
    .map((r) => String(r).replace(/^customers\//, "")).filter(Boolean))];

  const knownNames = new Map(known.filter((a) => a.name).map((a) => [a.id, a.name as string]));
  const toLookUp = ids.filter((id) => !knownNames.has(id)).slice(0, GOOGLE_NAME_LOOKUPS);
  const found = await Promise.all(toLookUp.map((id) => googleCustomerName(fetchFn, direct, id).catch(() => null)));
  toLookUp.forEach((id, i) => { if (found[i]) knownNames.set(id, found[i]!); });
  return ids.map((id) => ({ id, name: knownNames.get(id) ?? null }));
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

// ======================================================================================== launch ===
// Every launch builds the campaign switched OFF, its pieces switched on beneath it, and flips the
// campaign on as the very last step -- so nothing can spend unless every step succeeded. If a step
// fails, whatever was already made is removed before the error goes back to the worker.
export interface LaunchResult { campaignId: string; ids: Record<string, string> }
export type Sleep = (ms: number) => Promise<void>;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fetchMedia(fetchFn: typeof fetch, url: string): Promise<Uint8Array> {
  let res: Response;
  try { res = await fetchFn(url); } catch (e) {
    throw new AdsError("transient", `No se pudo leer la imagen del anuncio: ${e instanceof Error ? e.message : e}`);
  }
  if (!res.ok) throw new AdsError("platform", `No se pudo leer la imagen del anuncio (HTTP ${res.status}). Súbela de nuevo.`);
  return new Uint8Array(await res.arrayBuffer());
}

// ------------------------------------------------------------------------------- Meta: launch ---
async function metaPost(fetchFn: typeof fetch, token: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const { status, body } = await send(fetchFn, "Meta", `${META_GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }).toString(),
  });
  const err = metaError(body, status);
  if (err) throw err;
  return (body || {}) as Record<string, unknown>;
}

async function metaRollback(fetchFn: typeof fetch, token: string, accountId: string, ids: Record<string, string>) {
  const steps: string[] = [];
  for (const key of ["ad", "adset", "campaign", "creative"]) if (ids[key]) steps.push(`${META_GRAPH}/${ids[key]}?access_token=${encodeURIComponent(token)}`);
  if (ids.image_hash) {
    steps.push(`${META_GRAPH}/act_${accountId}/adimages?hash=${encodeURIComponent(ids.image_hash)}&access_token=${encodeURIComponent(token)}`);
  }
  for (const url of steps) {
    try { await fetchFn(url, { method: "DELETE" }); } catch { /* best effort: an orphan here never spends */ }
  }
}

export async function metaLaunch(
  fetchFn: typeof fetch, token: string, accountId: string,
  page: { id: string; instagramId: string | null }, spec: LaunchSpec, nowMs: number,
): Promise<LaunchResult> {
  const ids: Record<string, string> = {};
  try {
    const bytes = await fetchMedia(fetchFn, spec.mediaUrl!);
    const img = await metaPost(fetchFn, token, `act_${accountId}/adimages`, { bytes: toBase64(bytes) });
    const uploaded = Object.values((img.images || {}) as Record<string, { hash?: string }>)[0];
    if (!uploaded?.hash) throw new AdsError("platform", "Meta no devolvió la imagen subida");
    ids.image_hash = uploaded.hash;

    const creative = await metaPost(fetchFn, token, `act_${accountId}/adcreatives`, {
      name: `${spec.name} · creativo`,
      object_story_spec: JSON.stringify(metaObjectStorySpec(spec, page.id, page.instagramId, uploaded.hash)),
    });
    ids.creative = String(creative.id);

    const campaign = await metaPost(fetchFn, token, `act_${accountId}/campaigns`, {
      name: spec.name,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: "[]",
      is_adset_budget_sharing_enabled: "false",
    });
    ids.campaign = String(campaign.id);

    const adset = await metaPost(fetchFn, token, `act_${accountId}/adsets`, metaAdsetParams(spec, ids.campaign, nowMs));
    ids.adset = String(adset.id);

    const ad = await metaPost(fetchFn, token, `act_${accountId}/ads`, {
      name: spec.name,
      adset_id: ids.adset,
      creative: JSON.stringify({ creative_id: ids.creative }),
      status: "ACTIVE",
    });
    ids.ad = String(ad.id);

    await metaPost(fetchFn, token, ids.campaign, { status: "ACTIVE" });
    return { campaignId: ids.campaign, ids };
  } catch (e) {
    await metaRollback(fetchFn, token, accountId, ids);
    throw e;
  }
}

// ----------------------------------------------------------------------------- TikTok: launch ---
// Upload responses come back as an object or a one-item list depending on the endpoint; take either.
function firstField(data: unknown, key: string): string | null {
  const d = data as Record<string, unknown> | Record<string, unknown>[] | null;
  const row = Array.isArray(d) ? d[0] : d && Array.isArray(d.list) ? (d.list as Record<string, unknown>[])[0] : d;
  const v = row?.[key];
  return v == null ? null : String(v);
}

export async function tiktokLaunch(
  fetchFn: typeof fetch, token: string, advertiserId: string, spec: LaunchSpec, nowMs: number, sleep: Sleep,
): Promise<LaunchResult> {
  // The identity is checked before anything is made: without a linked TikTok account there is nothing to undo.
  const idData = await tiktokCall<{ identity_list?: TiktokIdentity[] }>(fetchFn, token, `${TIKTOK_API}/identity/get/?advertiser_id=${encodeURIComponent(advertiserId)}`);
  const identity = pickTiktokIdentity(idData?.identity_list || []);
  if (!identity) {
    throw new AdsError("config", "TikTok: vincula la cuenta de TikTok del negocio en Business Center, con permiso para anuncios.");
  }

  const ids: Record<string, string> = {};
  const post = <T>(path: string, payload: unknown) =>
    tiktokCall<T>(fetchFn, token, `${TIKTOK_API}${path}`, { method: "POST", body: JSON.stringify(payload) });
  try {
    const up = await post<unknown>("/file/video/ad/upload/", {
      advertiser_id: advertiserId, upload_type: "UPLOAD_BY_URL", video_url: spec.mediaUrl, file_name: `${spec.name}-${nowMs}`,
    });
    const videoId = firstField(up, "video_id");
    if (!videoId) throw new AdsError("platform", "TikTok no devolvió el video subido");
    ids.video = videoId;

    // TikTok needs a moment to process an upload before it has a cover frame.
    let cover: string | null = null;
    for (let i = 0; i < 6 && !cover; i++) {
      if (i > 0) await sleep(3000);
      const info = await tiktokCall<unknown>(fetchFn, token,
        `${TIKTOK_API}/file/video/ad/info/?advertiser_id=${encodeURIComponent(advertiserId)}&video_ids=${encodeURIComponent(JSON.stringify([videoId]))}`);
      cover = firstField(info, "video_cover_url") || firstField(info, "poster_url");
    }
    if (!cover) throw new AdsError("transient", "TikTok sigue procesando el video");
    const image = await post<unknown>("/file/image/ad/upload/", { advertiser_id: advertiserId, upload_type: "UPLOAD_BY_URL", image_url: cover });
    const imageId = firstField(image, "image_id");
    if (!imageId) throw new AdsError("platform", "TikTok no devolvió la portada del video");
    ids.cover_image = imageId;

    const camp = await post<{ campaign_id?: string | number }>("/campaign/create/", {
      advertiser_id: advertiserId, campaign_name: spec.name, objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_INFINITE", operation_status: "DISABLE",
    });
    if (camp?.campaign_id == null) throw new AdsError("platform", "TikTok no devolvió la campaña creada");
    ids.campaign = String(camp.campaign_id);

    const group = await post<{ adgroup_id?: string | number }>("/adgroup/create/", tiktokAdgroupBody(advertiserId, ids.campaign, spec, nowMs));
    if (group?.adgroup_id == null) throw new AdsError("platform", "TikTok no devolvió el grupo de anuncios");
    ids.adgroup = String(group.adgroup_id);

    const ad = await post<{ ad_ids?: (string | number)[] }>("/ad/create/", tiktokAdBody(advertiserId, ids.adgroup, spec, videoId, imageId, identity));
    if (ad?.ad_ids?.[0] != null) ids.ad = String(ad.ad_ids[0]);

    await tiktokSetStatus(fetchFn, token, advertiserId, ids.campaign, "resume");
    return { campaignId: ids.campaign, ids };
  } catch (e) {
    // Deleting the campaign takes its ad groups and ads with it.
    if (ids.campaign) await tiktokSetStatus(fetchFn, token, advertiserId, ids.campaign, "end").catch(() => {});
    throw e;
  }
}

// ----------------------------------------------------------------------------- Google: launch ---
/** Today's date where the restaurant is; Google refuses a start date before today in the account's zone. */
export function newYorkDate(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowMs));
}

export async function googleLaunch(fetchFn: typeof fetch, auth: GoogleAuth, customerId: string, spec: LaunchSpec, nowMs: number): Promise<LaunchResult> {
  const ops = googleCreateOperations(customerId, spec, newYorkDate(nowMs), String(nowMs).slice(-6));
  const url = `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:mutate`;
  // A dry run first: Google checks every piece without creating anything, so a mistake costs nothing.
  await googlePost(fetchFn, auth, url, { mutateOperations: ops, validateOnly: true });
  // All or nothing: if any piece is refused, none of them exist.
  const created = await googlePost(fetchFn, auth, url, { mutateOperations: ops });
  const campaignId = googleCreatedCampaignId(created);
  if (!campaignId) throw new AdsError("platform", "Google no devolvió la campaña creada");
  try {
    await googleSetStatus(fetchFn, auth, customerId, campaignId, "resume");
  } catch (e) {
    await googleSetStatus(fetchFn, auth, customerId, campaignId, "end").catch(() => {});
    throw e;
  }
  return { campaignId, ids: { campaign: campaignId } };
}
