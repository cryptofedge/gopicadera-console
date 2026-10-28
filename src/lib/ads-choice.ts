/**
 * Which ad account (and on Meta, which Facebook Page) is Go Picadera's.
 *
 * Whoever connects an ad platform may reach other businesses' accounts and Pages with the same login, so the
 * connection only records what it can reach (`details.ad_accounts`, `details.pages`) and an owner picks
 * Go Picadera's in Canales (`choose_ads_account`, backend/ads_accounts.sql). Nothing is synced, launched or
 * paused until then. Same rule as the ads worker: a single id, marked as chosen, that the login still reaches.
 */
// The note the ads worker leaves on a connection with no account chosen (NO_ACCOUNT_CHOSEN in ads-worker.ts).
export const NO_ACCOUNT_CHOSEN = "Elige la cuenta publicitaria de Go Picadera en Canales";

export type AdAccount = { id: string; name: string | null };
export type AdPage = { id: string; name: string | null; instagram: { id: string; username: string | null } | null };

export type AdsDetails = {
  ad_accounts?: AdAccount[];
  pages?: AdPage[];
  page_id?: string | null;
  chosen_at?: string | null;
  token_expires_at?: string | null;
};

export function chosenAdAccount(storeId: string | null | undefined, details: AdsDetails | null | undefined): AdAccount | null {
  const id = (storeId || "").trim();
  if (!id || id.includes(",") || !details?.chosen_at) return null;
  return (details.ad_accounts || []).find((a) => a.id === id) ?? null;
}

export function chosenPage(details: AdsDetails | null | undefined): AdPage | null {
  const id = details?.page_id;
  return id ? (details?.pages || []).find((p) => p.id === id) ?? null : null;
}

export const accountLabel = (a: AdAccount) => (a.name ? `${a.name} · ${a.id}` : a.id);
export const pageLabel = (p: AdPage) =>
  `${p.name ?? p.id}${p.instagram ? ` · Instagram ${p.instagram.username ? "@" + p.instagram.username : "vinculado"}` : ""}`;
