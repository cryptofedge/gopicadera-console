// Is the ad-platform connect flow set up on the live project? `npm run check:connect`
//
// Read-only. It sends a bare GET to each OAuth callback, which never writes anything: with no signed
// state the callback just bounces to the console (see supabase/functions/_shared/oauth.test.ts).
//
//   302  the function is deployed and OAUTH_STATE_SECRET is set
//   503  deployed, but OAUTH_STATE_SECRET is missing
//   404  the function is not deployed
//
// A 302 cannot prove the platform's own app id and secret are right -- only a real connect can. That is
// the last step before anyone tells the owner: connect once from the console and see "quedó conectado".

const BASE = (process.env.SUPABASE_URL || "https://kfuamhhfthfmavxppagb.supabase.co").replace(/\/$/, "");

const CALLBACKS = [
  ["Meta (Facebook + Instagram)", "meta-oauth-callback"],
  ["TikTok", "tiktok-oauth-callback"],
  ["Google Ads", "google-ads-oauth-callback"],
];

const MEANING = {
  302: "ready (deployed, state secret set)",
  503: "secrets missing: set OAUTH_STATE_SECRET (and this platform's app id/secret) in Supabase",
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

console.log(`\n${ready}/${CALLBACKS.length} ready.${ready === CALLBACKS.length ? " Next: connect once from the console (Canales) and look for \"quedó conectado\"." : ""}`);
process.exit(ready === CALLBACKS.length ? 0 : 1);
