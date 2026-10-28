# Connecting Meta (Facebook/Instagram) Ads

Status (2026-10-28): merged and deployed; the owner has not saved a Meta app in Canales yet, so the button waits for it.
Tests: `npm run test:functions` (fake Meta/Supabase) and `npm run test:sql`. Live check: `npm run check:connect`.

## How it works

1. Owner taps **Conectar con Meta** on the Integrations page. The console calls the `meta-oauth-start` function.
2. `meta-oauth-start` checks the caller is a real, active owner (same `profiles` RLS check every owner-only
   function in this project uses), then returns Meta's own consent-screen URL with a signed, 10-minute `state`
   parameter baked in. The browser is redirected there.
3. The owner logs into their own Meta Business account and approves. Meta redirects back to `meta-oauth-callback`.
4. `meta-oauth-callback` verifies the `state` signature and expiry **before anything else** — a forged or stale
   `state` gets bounced with no database write at all, not even a failure record. Only then does it exchange the
   code for a short-lived token, trade that for a long-lived one (~60 days instead of ~2 hours; if that second
   step fails, it keeps the short-lived token rather than failing the whole connection), list every ad account and
   Page the login reaches, with their names, and save all of it via `apply_oauth_connection`.
5. The owner lands back on the Integrations page with a banner saying it worked (or why it didn't).
6. On the Meta card she picks Go Picadera's ad account and the Page the ads speak as, and taps **Guardar**
   (`choose_ads_account`, `backend/ads_accounts.sql`). Until then nothing is synced or launched on Meta.

The token lives in the `integrations.client_secret` column, same as every other provider. No browser can read
it, the owner's included; `security_hardening.sql` grants the browser only the non-secret columns.

The callback records, in `integrations.details`, what the ads work needs later and the console shows: every ad
account the login reaches with its name (`ad_accounts`), the Pages it can advertise as with the Instagram
professional account linked to each (`pages`; an ad needs both to run on Facebook and Instagram), and when the
token expires (`debug_token`). It never picks an account or a Page, even when the login sees only one: a login
can reach other businesses' accounts too. `store_id` holds only the account the owner chose, and
`details.page_id` the Page; a reconnect keeps them while the new login still reaches them and drops them
otherwise. The ads worker reads both lists again on every run, so an account granted later shows up without
reconnecting (ADS_WORKER.md, "Which account it uses"). A long-lived user token lasts about 60 days
and cannot be renewed server-side, so the owner has to reconnect before then.

**Permissions asked for, once:** `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`,
`pages_manage_ads`, `business_management`, `instagram_basic`. All are asked for up front, so the create-ads work
never forces a reconnect. If the app uses a *Facebook Login for Business* configuration instead of a scope list,
put its id in the `META_LOGIN_CONFIG_ID` secret and the start function sends `config_id` instead.

**Who connects:** Llulisa, with her own Meta login and her own app. Meta's default **Limited access** tier (formerly
"standard") only works for people with a role on the app; she created it, so she is its admin. Anyone without a
role on the app would need App Review. Her login may also reach ad accounts and Pages that are not Go Picadera's,
which is why she picks the right ones after connecting.

Graph API version: `v26.0` (`META_GRAPH_VERSION` in `oauth-lib.ts`). v21.0's Marketing API sunset was 2025-09-09.

## Files

| File | What it is |
| --- | --- |
| `admin/backend/ads_oauth.sql` | `apply_oauth_connection` / `record_oauth_failure` — the only two ways a connection can change, both `service_role`-only |
| `admin/backend/ads_accounts.sql` | `ads_apps` + `set_ads_app` (the owner's app, saved from Canales) and `choose_ads_account` (her ad account and Page) |
| `admin/supabase/functions/meta-oauth-start/` | Builds the signed state + consent URL (owner-only, `verify_jwt` on) |
| `admin/supabase/functions/meta-oauth-callback/` | Meta's own redirect target (`--no-verify-jwt` — it carries no Supabase login, the signed state is what proves it's real) |
| `admin/supabase/functions/_shared/oauth-lib.ts` | State signing/verification + the Meta Graph API URL builders |
| `admin/src/app/(console)/integrations/page.tsx` | The Meta card + the redirect-back banner |
| `ops/stripe-functions.test.mjs` | Section 7 — the Meta connect-flow tests (shares the harness already built for Stripe) |

## Turn it on

Nobody pastes an app secret into WhatsApp or chat, and nothing goes in the Supabase dashboard. Llulisa copies it
from Meta's dashboard straight into the Meta card in Canales, where it is write-only.

1. **Merge [PR #2](https://github.com/cryptofedge/gopicadera-console/pull/2).** This pushes to `master`, which
   redeploys the console via GitHub Actions (same pipeline as every other console change).
2. **Apply the database migrations:** `backend/ads_oauth.sql`, and later in SETUP.md's apply order,
   `backend/ads_accounts.sql`. Both are safe to run again.
3. **Deploy the two functions:**
   ```bash
   supabase functions deploy meta-oauth-start --project-ref kfuamhhfthfmavxppagb
   supabase functions deploy meta-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
   Both safely answer `503 {"error":"not_configured"}` until step 5 saves the app — nothing can be clicked
   into a broken state in between.
4. **Llulisa creates the Meta app**, in her own Business Manager:
   - [business.facebook.com](https://business.facebook.com) → **Developer settings** → **Apps** → Create App →
     type **Business**.
   - Add the **Facebook Login for Business** product.
   - Under its settings, add this exact redirect URI (no trailing slash, must match exactly; the Meta card in
     Canales shows it with a copy button):
     `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/meta-oauth-callback`
   - Under **App Review → Permissions and Features**, confirm `ads_management` and `ads_read` show **standard
     access** (this is automatic — nothing to request or wait on for managing the business's own ad account).
   - Copy the **App ID** and **App Secret** from Settings → Basic.
5. **Save the app in Canales.** Meta card → **App de Meta**: App ID, App Secret, and the Configuration ID only if
   the app uses a *Facebook Login for Business* configuration. **Guardar.** The secret is never shown again; leave
   it blank later to keep it. Saving a different App ID disconnects Meta, because the old token belongs to the old
   app. The key that signs the redirect's `state` is derived from the service-role key, so there is no
   `OAUTH_STATE_SECRET` to create. (`META_APP_ID`/`META_APP_SECRET`/`META_LOGIN_CONFIG_ID` and
   `OAUTH_STATE_SECRET` env vars on the functions still win when someone sets them, as an override.)
6. **Try it.** **Conectar con Meta** (enabled once the app is saved). Approve on Meta's screen. Land back with
   the "Meta quedó conectado" banner and the card shows **Conectado**.
7. **Choose.** On the same card, pick Go Picadera's ad account and Page, and tap **Guardar**. `store_id` now holds
   that one account, and the ads worker starts syncing it.

## Known limits

- Standard access is rate-limited and nominally "for development" per Meta's docs — fine for one small
  restaurant managing its own account; would need Business Verification if this ever needs to touch someone
  else's ad account.
- The Graph API version is pinned (`oauth-lib.ts`, `META_GRAPH_VERSION`). Meta deprecates versions on a schedule;
  bump it deliberately, not by accident.
- If the long-lived token exchange or the ad-account lookup fails, the connection still succeeds (short-lived
  token, or no accounts listed until the ads worker's next run reads them) rather than blocking the owner — by
  design, both are best-effort. A failed
  short-lived exchange still only lasts a couple of hours before needing **Reintentar conexión**.
