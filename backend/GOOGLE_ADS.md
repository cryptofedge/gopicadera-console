# Connecting Google Ads

Status (2026-10-07): code written and tested (`node ops/stripe-functions.test.mjs`, 204 checks), built clean from
`origin/master`. Until it is merged, deployed, and Google credentials exist, there is nothing for anyone to click.
Same shape as [META_ADS.md](META_ADS.md) and [TIKTOK_ADS.md](TIKTOK_ADS.md); read Meta's first.

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

## What is different from Meta and TikTok

- **The credential kept is the refresh token**, stored in `integrations.client_secret`. Google's access token lasts one
  hour and is never stored; whatever eventually calls the Ads API mints a fresh one from the refresh token
  (`POST https://oauth2.googleapis.com/token`, `grant_type=refresh_token`). So, unlike TikTok, no background refresh job
  is needed just to keep the connection alive.
- **A response with no refresh token is a failed connection**, not a degraded one: it would be useless within the hour.
  The banner tells the owner to remove the app at myaccount.google.com/permissions and connect again.
- **The account lookup is best-effort**, like Meta's. After the exchange the function calls
  `customers:listAccessibleCustomers` and stores the customer ids (comma-joined, without the `customers/` prefix) in
  `store_id`. If that call is refused, the connection is still saved with no account id. Accounts reachable only through
  a manager account may not be listed (Google's docs say the call returns directly accessible customers).
- **The developer token is optional.** Google moved Ads API access levels from the developer token onto the Google Cloud
  project in September 2026 and its docs do not say whether the `developer-token` header is still read. The function sends
  it only if `GOOGLE_ADS_DEVELOPER_TOKEN` is set, and nothing depends on it.
- The API version is pinned (`oauth-lib.ts`, `GOOGLE_ADS_API_VERSION = "v25"`, current in October 2026; 25.1 and 25.2
  are additive minor releases). Google retires old versions on a schedule, so bump it deliberately.

## Files

| File | What it is |
| --- | --- |
| `admin/backend/ads_oauth.sql` | The same two functions as Meta/TikTok, now also accepting `google_ads` |
| `admin/supabase/functions/google-ads-oauth-start/` | Builds the signed state + consent URL (owner-only, `verify_jwt` on) |
| `admin/supabase/functions/google-ads-oauth-callback/` | Google's redirect target (`--no-verify-jwt`) |
| `admin/supabase/functions/_shared/oauth-lib.ts` | `googleAuthorizationUrl` / `googleTokenExchangeBody` and the pinned URLs |
| `admin/src/app/(console)/integrations/page.tsx` | The Google Ads card and the shared redirect-back banner |
| `ops/stripe-functions.test.mjs` | Section 9 (Google flow) and the browser-preflight check in section 10 |

## Turn it on

1. **Merge the pull request.** The console redeploys by itself (GitHub Actions).
2. **Apply the database change** (safe to re-run):
   ```bash
   supabase db query --linked --project-ref kfuamhhfthfmavxppagb --file backend/ads_oauth.sql
   ```
3. **Deploy the two functions** (merging does NOT deploy these):
   ```bash
   supabase functions deploy google-ads-oauth-start --project-ref kfuamhhfthfmavxppagb
   supabase functions deploy google-ads-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
   Both answer `503 not_configured` until step 5, so nothing can break in between. Then run
   `supabase functions list` and confirm all four connection functions plus Stripe's are `ACTIVE`.
4. **Google side** (the Google account that owns the restaurant's Google Ads account; this cannot be done for her):
   1. In [Google Cloud Console](https://console.cloud.google.com), create a project (for example `go-picadera-ads`) and
      enable the **Google Ads API**. Enabling it grants *Test* access automatically (test accounts only).
   2. **OAuth consent screen:** user type External, add your support email, and add the scope
      `https://www.googleapis.com/auth/adwords`. **Publish the app ("In production").** While the status is *Testing*,
      Google expires refresh tokens after 7 days. Publishing does not fix a token issued earlier, so connect (again)
      after publishing. Because the Ads scope is sensitive, an unverified app shows a "Google hasn't verified this app"
      screen (Advanced, then continue); confirm Google's current verification rules when you get there.
   3. **Credentials → Create OAuth client ID → Web application.** Add this exact redirect URI:
      `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/google-ads-oauth-callback`
      Copy the **Client ID** and **Client secret**.
   4. **Access level for the project:** Google Ads API → Overview → *Upgrade access level*. *Explorer* allows production
      accounts at up to 2,880 operations a day and Google may grant it automatically after you apply; *Basic* needs brand
      verification; *Standard* is a manual audit (about 10 business days). Without at least Explorer the connection still
      works, but the account lookup and any production API call are refused, so `store_id` stays empty.
   5. If Google still shows you a **developer token** (Google Ads API Center on a manager account), copy it. If not, skip it.
5. **Secrets** (reuses the `OAUTH_STATE_SECRET` that Meta's setup created; if that was never set, set it once with a fresh
   random value):
   ```bash
   supabase secrets set GOOGLE_ADS_CLIENT_ID=XXXX GOOGLE_ADS_CLIENT_SECRET=XXXX --project-ref kfuamhhfthfmavxppagb
   supabase secrets set GOOGLE_ADS_DEVELOPER_TOKEN=XXXX --project-ref kfuamhhfthfmavxppagb   # only if you have one
   ```
6. **Try it.** Integrations → Google Ads → **Conectar con Google Ads**. Approve on Google's screen. You land back with
   "Google Ads quedó conectado", the card shows **Conectado**, and `store_id` holds the customer id(s) if the access level
   allowed the lookup.

## Known limits

- Nothing in the console reads these credentials yet: connecting stores them and that is all. A feature that creates ads or
  reads spend still has to be built, and it must mint access tokens from the stored refresh token.
- A refresh token stops working if the owner revokes the app, changes the relevant Google permissions, or the consent screen
  is still in *Testing*. The card shows **Con problema** only when a connection attempt fails; it does not yet check an
  existing token. Reconnecting (**Reintentar conexión**) replaces it.
- Google's access-level and developer-token rules changed in September 2026 and were described inconsistently across its own
  pages and third-party coverage when this was written. Treat step 4 as "verify on Google's live pages", not as gospel.
