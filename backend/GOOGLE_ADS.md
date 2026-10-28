# Connecting Google Ads

Status (2026-10-28): merged and deployed; the owner has not saved a Google app in Canales yet. Same shape as [META_ADS.md](META_ADS.md)
and [TIKTOK_ADS.md](TIKTOK_ADS.md); read Meta's first. Tests: `npm run test:functions`. Live check: `npm run check:connect`.

## How it works

1. Owner taps **Conectar con Google Ads** on the Integrations page. The console calls `google-ads-oauth-start`.
2. It checks the caller is a real, active owner, then returns Google's consent-screen URL with a signed 10-minute
   `state` (the same helper Meta and TikTok use, with `google_ads` baked in so a state for one provider can never be
   replayed against another). The URL asks for the Ads scope, `access_type=offline` and `prompt=consent` — both are
   needed or Google will not hand over a refresh token on a repeat connection.
3. The owner signs in to their own Google account and approves. Google redirects to `google-ads-oauth-callback`.
4. `google-ads-oauth-callback` verifies the `state` **before anything else** (a forged or stale one is bounced with no
   database write at all), then exchanges the code (a form-encoded POST), and saves the connection via
   `apply_oauth_connection`.
5. The owner lands back on the Integrations page with a banner saying it worked, or why not.
6. On the Google Ads card she picks Go Picadera's account and taps **Guardar** (`choose_ads_account`). Until then
   nothing is synced or launched on Google.

## What is different from Meta and TikTok

- **The credential kept is the refresh token**, stored in `integrations.client_secret`. Google's access token lasts one
  hour and is never stored; whatever eventually calls the Ads API mints a fresh one from the refresh token
  (`POST https://oauth2.googleapis.com/token`, `grant_type=refresh_token`). So, unlike TikTok, no background refresh job
  is needed just to keep the connection alive.
- **A response with no refresh token is a failed connection**, not a degraded one: it would be useless within the hour.
  The banner tells the owner to remove the app at myaccount.google.com/permissions and connect again.
- **The account lookup is best-effort**, like Meta's. After the exchange the function calls
  `customers:listAccessibleCustomers` and records every customer id the login reaches, with its name
  (`SELECT customer.descriptive_name FROM customer`, at most 20 lookups, a failed one leaves the name empty), in
  `details.ad_accounts`. It never picks one: `store_id` holds only the account the owner chooses on the card. If the
  lookup is refused, the connection is still saved with no accounts, and the ads worker fills them in on a later run.
  Accounts reachable only through a manager account may not be listed (Google's docs say the call returns directly
  accessible customers).
- **No developer token and no manager account.** Google sunset developer tokens on 2026-09-09: new users need neither
  a token nor a manager account, and a token that is sent is "optional and ignored". API access now belongs to the
  **Google Cloud project that owns the OAuth client**, at Test, Explorer, Basic or Standard level. Test cannot touch
  real accounts: Google answers `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`, which the card shows as "El proyecto de
  Google Cloud aún no tiene acceso Explorer a la API de Google Ads". Google also lists a known issue: a project upgraded
  after 2026-09-09 may get `AUTHORIZATION_ERROR` until its fix rolls out. `GOOGLE_ADS_DEVELOPER_TOKEN` is still sent if
  someone sets it, and nothing depends on it. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (10 digits) only matters when access to
  the restaurant's account goes through a manager account.
- **Who connects:** Llulisa, with her own Google account, through her own Google Cloud project that hosts the OAuth
  client. Her login may reach other Google Ads accounts too, which is why she picks Go Picadera's after connecting.
- The API version is pinned (`oauth-lib.ts`, `GOOGLE_ADS_API_VERSION = "v26"`, released 2026-10-14). Google retires
  old versions on a schedule, so bump it deliberately.

## Files

| File | What it is |
| --- | --- |
| `admin/backend/ads_oauth.sql` | The same two functions as Meta/TikTok, now also accepting `google_ads` |
| `admin/backend/ads_accounts.sql` | `ads_apps` + `set_ads_app` (her OAuth client, saved from Canales) and `choose_ads_account` |
| `admin/supabase/functions/google-ads-oauth-start/` | Builds the signed state + consent URL (owner-only, `verify_jwt` on) |
| `admin/supabase/functions/google-ads-oauth-callback/` | Google's redirect target (`--no-verify-jwt`) |
| `admin/supabase/functions/_shared/oauth-lib.ts` | `googleAuthorizationUrl` / `googleTokenExchangeBody` and the pinned URLs |
| `admin/src/app/(console)/integrations/page.tsx` | The Google Ads card and the shared redirect-back banner |
| `ops/stripe-functions.test.mjs` | Section 9 (Google flow) and the browser-preflight check in section 10 |

## Turn it on

1. **Merge the pull request.** The console redeploys by itself (GitHub Actions).
2. **Apply the database changes** (safe to re-run): `backend/ads_oauth.sql`, and later in SETUP.md's apply order,
   `backend/ads_accounts.sql`.
3. **Deploy the two functions** (merging does NOT deploy these):
   ```bash
   supabase functions deploy google-ads-oauth-start --project-ref kfuamhhfthfmavxppagb
   supabase functions deploy google-ads-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
   Both answer `503 not_configured` until step 5 saves the client, so nothing can break in between. Then run
   `supabase functions list` and confirm all four connection functions plus Stripe's are `ACTIVE`.
4. **Google side**, by Llulisa with the Google account that owns the restaurant's Google Ads account:
   1. In [Google Cloud Console](https://console.cloud.google.com), create a project (for example `go-picadera-ads`) and
      enable the **Google Ads API** in it. This is the project that will own the OAuth client. Enabling the API grants
      *Test* access automatically (test accounts only).
   2. **OAuth consent screen:** user type External, add your support email, and add the scope
      `https://www.googleapis.com/auth/adwords`. **Publish the app ("In production").** While the status is *Testing*,
      Google expires refresh tokens after 7 days. Publishing does not fix a token issued earlier, so connect (again)
      after publishing. Because the Ads scope is sensitive, an unverified app shows a "Google hasn't verified this app"
      screen (Advanced, then continue); confirm Google's current verification rules when you get there.
   3. **Credentials → Create OAuth client ID → Web application.** Add this exact redirect URI (the Google Ads card in
      Canales shows it with a copy button):
      `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/google-ads-oauth-callback`
      Copy the **Client ID** and **Client secret**.
   4. **Apply for Explorer access** on the same project: Google Ads API → its **Overview** page in Cloud Console →
      apply for *Explorer*. Explorer allows production accounts at up to 2,880 operations a day and Google may grant it
      automatically; *Basic* and *Standard* are reviewed. Google may require **billing on the Cloud project** before it
      approves. Until then the connection still works, but the account lookup and every production call are refused,
      and the card says the project still lacks Explorer access.
   5. No developer token, no manager account.
5. **Save the client in Canales.** Google Ads card → **App de Google**: Client ID and Client Secret, **Guardar**. The
   secret is never shown again; leave it blank later to keep it. Saving a different Client ID disconnects Google
   Ads, because the old refresh token belongs to the old client. Nothing goes in the Supabase dashboard; the
   `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET` env vars still win if someone sets them, as an override.
6. **Try it.** **Conectar con Google Ads** (enabled once the client is saved). Approve on Google's screen. You land back
   with "Google Ads quedó conectado" and the card shows **Conectado**.
7. **Choose.** On the same card, pick Go Picadera's account and tap **Guardar**. If the list is empty, the project's
   Explorer access is not through yet; the ads worker reads the list again every 15 minutes.

## Known limits

- The ads worker (ADS_WORKER.md) mints an access token from the stored refresh token on every run, with the same client.
- A refresh token stops working if the owner revokes the app, changes the relevant Google permissions, or the consent screen
  is still in *Testing*. The ads worker then marks the card **Con problema**; reconnecting (**Reintentar conexión**)
  replaces the token.
- Google's access rules changed on 2026-09-09 (developer tokens sunset, access levels on the Cloud project). This file
  follows Google's pages as updated on 2026-10-28 (developers.google.com/google-ads/api/docs/first-call/dev-token and
  .../api-policy/access-levels); verify there if something does not match.
