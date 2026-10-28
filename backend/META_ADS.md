# Connecting Meta (Facebook/Instagram) Ads

Status (2026-10-28): merged and deployed; no app credentials exist yet, so the button answers `not_configured`.
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
   step fails, it keeps the short-lived token rather than failing the whole connection), list the restaurant's own
   ad account(s), and save all of it via `apply_oauth_connection`.
5. The owner lands back on the Integrations page with a banner saying it worked (or why it didn't).

The token lives in the `integrations.client_secret` column, same as every other provider. No browser can read
it, the owner's included; `security_hardening.sql` grants the browser only the non-secret columns. The restaurant's
own ad account id(s) (comma-joined if there is more than one) land in `store_id`.

The callback also records, in `integrations.details`, what the ads work needs later and the console may show:
the Pages this login can advertise as, the Instagram professional account linked to each (an ad needs both to run
on Facebook and Instagram), and when the token expires (`debug_token`). A long-lived user token lasts about 60 days
and cannot be renewed server-side, so the owner has to reconnect before then.

**Permissions asked for, once:** `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`,
`pages_manage_ads`, `business_management`, `instagram_basic`. All are asked for up front, so the create-ads work
never forces a reconnect. If the app uses a *Facebook Login for Business* configuration instead of a scope list,
put its id in the `META_LOGIN_CONFIG_ID` secret and the start function sends `config_id` instead.

**Who connects:** Meta's default **Limited access** tier (formerly "standard") only works for people with a role on
the app. So the app sits in Go Picadera's business portfolio, Fellito is an app admin, and Fellito taps Conectar.
Llulisa only invites him as an admin of her business portfolio, and his login reaches her Page, ad account and
Instagram through that. Anyone else connecting would need App Review.

Graph API version: `v26.0` (`META_GRAPH_VERSION` in `oauth-lib.ts`). v21.0's Marketing API sunset was 2025-09-09.

## Files

| File | What it is |
| --- | --- |
| `admin/backend/ads_oauth.sql` | `apply_oauth_connection` / `record_oauth_failure` — the only two ways a connection can change, both `service_role`-only |
| `admin/supabase/functions/meta-oauth-start/` | Builds the signed state + consent URL (owner-only, `verify_jwt` on) |
| `admin/supabase/functions/meta-oauth-callback/` | Meta's own redirect target (`--no-verify-jwt` — it carries no Supabase login, the signed state is what proves it's real) |
| `admin/supabase/functions/_shared/oauth-lib.ts` | State signing/verification + the Meta Graph API URL builders |
| `admin/src/app/(console)/integrations/page.tsx` | The Meta card + the redirect-back banner |
| `ops/stripe-functions.test.mjs` | Section 7 — the Meta connect-flow tests (shares the harness already built for Stripe) |

## Turn it on

Nobody pastes an app secret into WhatsApp or chat. It goes straight from Meta's dashboard into the Supabase
secrets command below.

1. **Merge [PR #2](https://github.com/cryptofedge/gopicadera-console/pull/2).** This pushes to `master`, which
   redeploys the console via GitHub Actions (same pipeline as every other console change).
2. **Apply the database migration:**
   ```bash
   supabase db query --linked --project-ref kfuamhhfthfmavxppagb --file backend/ads_oauth.sql
   ```
   Safe to run again if ever in doubt — both functions are `create or replace`.
3. **Deploy the two functions:**
   ```bash
   supabase functions deploy meta-oauth-start --project-ref kfuamhhfthfmavxppagb
   supabase functions deploy meta-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
   Both safely answer `503 {"error":"not_configured"}` until step 5 sets the secrets — nothing can be clicked
   into a broken state in between.
4. **Create the Meta app** (Llulisa's Business Manager — this has to be her business, not Fellito's):
   - [business.facebook.com](https://business.facebook.com) → **Developer settings** → **Apps** → Create App →
     type **Business**.
   - Add the **Facebook Login for Business** product.
   - Under its settings, add this exact redirect URI (no trailing slash, must match exactly):
     `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/meta-oauth-callback`
   - Under **App Review → Permissions and Features**, confirm `ads_management` and `ads_read` show **standard
     access** (this is automatic — nothing to request or wait on for managing the business's own ad account).
   - Copy the **App ID** and **App Secret** from Settings → Basic.
5. **Secrets.** Also generate a fresh random string for `OAUTH_STATE_SECRET` — it must be different from
   `STRIPE_WEBHOOK_SECRET`, and nobody needs to remember it (it only signs a short-lived redirect parameter):
   ```bash
   supabase secrets set META_APP_ID=XXXX META_APP_SECRET=XXXX OAUTH_STATE_SECRET="$(openssl rand -hex 32)" --project-ref kfuamhhfthfmavxppagb
   ```
6. **Try it.** Integrations page → Meta card → **Conectar con Meta**. Approve on Meta's screen. Land back with
   the "Meta quedó conectado" banner, card shows **Conectado**, and `store_id` holds the real ad account id.

## Known limits

- Standard access is rate-limited and nominally "for development" per Meta's docs — fine for one small
  restaurant managing its own account; would need Business Verification if this ever needs to touch someone
  else's ad account.
- The Graph API version is pinned (`oauth-lib.ts`, `META_GRAPH_VERSION`). Meta deprecates versions on a schedule;
  bump it deliberately, not by accident.
- If the long-lived token exchange or the ad-account lookup fails, the connection still succeeds (short-lived
  token or no `store_id` yet) rather than blocking the owner — by design, both are best-effort. A failed
  short-lived exchange still only lasts a couple of hours before needing **Reintentar conexión**.
