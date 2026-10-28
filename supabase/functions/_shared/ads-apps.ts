// Each ad platform's developer app: the id and secret the OAuth functions and the ads worker present to Meta,
// TikTok and Google. The owner creates the apps herself and saves them in Canales (the ads_apps table,
// backend/ads_accounts.sql), so nothing has to be set in the Supabase dashboard. A function env var pair
// (META_APP_ID + META_APP_SECRET, ...) still wins when someone sets both, as an override.
import type { Env } from "./stripe-lib.ts";

export type AdsAppProvider = "meta_ads" | "tiktok_ads" | "google_ads";

export interface AdsApp {
  appId: string;
  appSecret: string;
  // Meta only: a "Facebook Login for Business" configuration, sent instead of a scope list.
  loginConfigId: string;
  source: "env" | "database";
}

const ENV_KEYS: Record<AdsAppProvider, [id: string, secret: string]> = {
  meta_ads: ["META_APP_ID", "META_APP_SECRET"],
  tiktok_ads: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"],
  google_ads: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"],
};

function fromEnv(env: Env, provider: AdsAppProvider): AdsApp | null {
  const [idKey, secretKey] = ENV_KEYS[provider];
  const appId = (env[idKey] || "").trim();
  const appSecret = (env[secretKey] || "").trim();
  if (!appId || !appSecret) return null;
  const loginConfigId = provider === "meta_ads" ? (env.META_LOGIN_CONFIG_ID || "").trim() : "";
  return { appId, appSecret, loginConfigId, source: "env" };
}

type AppRow = { provider?: string; app_id?: string | null; app_secret?: string | null; login_config_id?: string | null };

/**
 * The apps for these platforms: env first, then one service-role read of ads_apps for whatever env did not
 * cover. A platform missing from the answer has no usable app (no id, or no secret) -- callers say
 * not_configured. A failed read is logged and treated the same way; it never throws.
 */
export async function loadAdsApps(
  env: Env, fetchFn: typeof fetch, providers: AdsAppProvider[],
): Promise<Partial<Record<AdsAppProvider, AdsApp>>> {
  const apps: Partial<Record<AdsAppProvider, AdsApp>> = {};
  const missing: AdsAppProvider[] = [];
  for (const p of new Set(providers)) {
    const app = fromEnv(env, p);
    if (app) apps[p] = app;
    else missing.push(p);
  }

  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (missing.length === 0 || !url || !key) return apps;

  try {
    const r = await fetchFn(
      `${url}/rest/v1/ads_apps?select=provider,app_id,app_secret,login_config_id&provider=in.(${missing.join(",")})`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!r.ok) {
      console.error("could not read ads_apps:", `HTTP ${r.status}`);
      return apps;
    }
    const rows = await r.json().catch(() => []) as AppRow[];
    for (const row of Array.isArray(rows) ? rows : []) {
      const p = row.provider as AdsAppProvider;
      const appId = (row.app_id || "").trim();
      const appSecret = (row.app_secret || "").trim();
      if (!missing.includes(p) || !appId || !appSecret) continue;
      const loginConfigId = p === "meta_ads" ? (env.META_LOGIN_CONFIG_ID || row.login_config_id || "").trim() : "";
      apps[p] = { appId, appSecret, loginConfigId, source: "database" };
    }
  } catch (e) {
    console.error("could not read ads_apps:", e instanceof Error ? e.message : String(e));
  }
  return apps;
}

export async function loadAdsApp(env: Env, fetchFn: typeof fetch, provider: AdsAppProvider): Promise<AdsApp | null> {
  return (await loadAdsApps(env, fetchFn, [provider]))[provider] || null;
}
