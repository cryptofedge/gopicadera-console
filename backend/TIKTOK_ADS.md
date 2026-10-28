# Connecting TikTok Ads

Status (2026-10-28): merged and deployed; no app credentials exist yet. Same shape as [META_ADS.md](META_ADS.md)
— read that first. Tests: `npm run test:functions`. Live check: `npm run check:connect`.

## How it works

1. Owner taps **Conectar con TikTok** on the Integrations page. The console calls `tiktok-oauth-start`.
2. `tiktok-oauth-start` checks the caller is a real, active owner, then returns TikTok's own consent-screen
   URL with a signed, 10-minute `state` parameter (the same signing helper Meta uses — just a different
   provider name baked into the signed value, so a state meant for one can never be replayed against the other).
3. The owner logs into their own TikTok for Business account and approves. TikTok redirects back to
   `tiktok-oauth-callback` carrying `auth_code` (and, redundantly, `code` — either is accepted).
4. `tiktok-oauth-callback` verifies the `state` signature and expiry **before anything else** — same guarantee
   as Meta: a forged or stale `state` gets bounced with no database write at all. Only then does it exchange
   the code for an access token, and save it via `apply_oauth_connection`.
5. The owner lands back on the Integrations page with a banner saying it worked (or why it didn't).

## Token lifetime

TikTok documents the Marketing API's advertiser token (`/oauth2/access_token/`) as **long-term**: it does not
expire unless the authorization is revoked, and the response carries **no refresh token**. An earlier version of
this flow assumed a 24-hour token plus a refresh token, which belongs to TikTok's creator / Login Kit tokens, a
different product. That version refused every real connection for lacking a refresh token. The callback now
saves the access token and keeps a refresh token only if one is ever sent (in `integrations.refresh_token`, which
no browser can read and Desconectar clears).

If TikTok later rejects the token (revoked, or the advertiser removed the app), API calls return an auth error
and the owner reconnects.

**Who connects:** Fellito, once Llulisa has added him to her TikTok Business Center with access to the ad account.
For ads created later, her TikTok account must also be linked there with ad-delivery permission: since January
2026 every new campaign must run as a real TikTok account (Custom Identity is gone).

## Files

| File | What it is |
| --- | --- |
| `admin/backend/ads_oauth.sql` | Same two functions as Meta's; `apply_oauth_connection` gained a 4th optional `p_refresh_token` param |
| `admin/supabase/functions/tiktok-oauth-start/` | Builds the signed state + consent URL (owner-only, `verify_jwt` on) |
| `admin/supabase/functions/tiktok-oauth-callback/` | TikTok's own redirect target (`--no-verify-jwt`) |
| `admin/supabase/functions/_shared/oauth-lib.ts` | `tiktokAuthorizationUrl` / `tiktokTokenExchangeBody` / `TIKTOK_TOKEN_URL` |
| `admin/src/app/(console)/integrations/page.tsx` | The TikTok card + the shared redirect-back banner |
| `ops/stripe-functions.test.mjs` | Section 8 — the TikTok connect-flow tests |

## Turn it on

1. **Merge [PR #3](https://github.com/cryptofedge/gopicadera-console/pull/3).**
2. **Apply the database migration** (safe to re-run; it's the same file Meta's setup already applied, now
   carrying the 4th-parameter change):
   ```bash
   supabase db query --linked --project-ref kfuamhhfthfmavxppagb --file backend/ads_oauth.sql
   ```
3. **Deploy the two functions:**
   ```bash
   supabase functions deploy tiktok-oauth-start --project-ref kfuamhhfthfmavxppagb
   supabase functions deploy tiktok-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
   Both 503 `not_configured` until step 5 sets the secrets.
4. **Create the TikTok app** (in Llulisa's TikTok for Business account):
   - [business-api.tiktok.com](https://business-api.tiktok.com) (TikTok for Business Developer Portal) →
     register an app for the **Marketing API**.
   - Add this exact redirect URI / callback URL:
     `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/tiktok-oauth-callback`
   - Request the ad-management permissions the app needs (ads read/management for the restaurant's own
     advertiser account). Copy the **App ID** and **App Secret**.
   - TikTok's own review for a Marketing API app has taken a few business days in other people's experience —
     budget for that before promising Llulisa a date.
5. **Secrets** (reuses the same `OAUTH_STATE_SECRET` Meta's setup already created — do not generate a second one):
   ```bash
   supabase secrets set TIKTOK_APP_ID=XXXX TIKTOK_APP_SECRET=XXXX --project-ref kfuamhhfthfmavxppagb
   ```
6. **Try it.** Integrations page → TikTok card → **Conectar con TikTok**. Approve on TikTok's screen. Land
   back with the "TikTok quedó conectado" banner, card shows **Conectado**, `store_id` holds the real
   advertiser id(s).

## Known limits

- **No automatic token refresh yet** (see above) — the access token is only good for 24h after connecting.
  Build the refresh job before building anything that actually calls the TikTok Ads API with it.
- The token endpoint version is pinned (`oauth-lib.ts`, `TIKTOK_TOKEN_VERSION`). Bump it deliberately.
- If the owner reconnects and TikTok's response happens to omit `advertiser_ids`, the connection still
  succeeds with no `store_id` yet (same best-effort spirit as Meta) — only a missing `refresh_token` blocks
  the connection outright, because that one is load-bearing for the token to be worth anything past 24h.
