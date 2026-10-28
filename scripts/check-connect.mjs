// Is the ad-platform connect flow set up on the live project? `npm run check:connect`
//
// Read-only. It sends a bare GET to each OAuth callback, which never writes anything: with no signed
// state the callback just bounces to the console (see supabase/functions/_shared/oauth.test.ts).
//
//   302  deployed, and the owner has saved this platform's app (its id and secret) in Canales
//   503  deployed, but the owner has not saved the app in Canales yet
//   404  the function is not deployed
//
// Nothing has to be set in the Supabase dashboard: the app id and secret come from Canales (the ads_apps
// table), and the key that signs the OAuth state is derived from the service-role key Supabase injects.
// A 302 cannot prove the app id and secret are right -- only a real connect can. That is the last step:
// connect once from Canales, see "quedó conectado", then choose Go Picadera's ad account on the card.

const BASE = (process.env.SUPABASE_URL || "https://kfuamhhfthfmavxppagb.supabase.co").replace(/\/$/, "");

const CALLBACKS = [
  ["Meta (Facebook + Instagram)", "meta-oauth-callback"],
  ["TikTok", "tiktok-oauth-callback"],
  ["Google Ads", "google-ads-oauth-callback"],
];

const MEANING = {
  302: "ready (deployed, app saved in Canales)",
  503: "the owner has not saved this platform's app (id and secret) in Canales yet",
  404: "function not deployed",
};

let ready = 0;
for (const [name, fn] of CALLBACKS) {
  let status;
  try {
    const res = await fetch(`${BASE}/functions/v1/${fn}`, { redirect: "manual" });
    status = res.status;
  } catch (e) {
    status = `network error (${e instanceof Error ? e.message : e})`;
  }
  if (status === 302) ready++;
  console.log(`${status === 302 ? "OK  " : "--  "} ${name.padEnd(28)} ${status}  ${MEANING[status] ?? "unexpected answer"}`);
}

console.log(`\n${ready}/${CALLBACKS.length} ready.${ready === CALLBACKS.length ? " Next: connect once from the console (Canales), look for \"quedó conectado\", and choose the ad account." : ""}`);
process.exit(ready === CALLBACKS.length ? 0 : 1);
