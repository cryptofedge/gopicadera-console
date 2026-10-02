# Connecting TikTok Ads

Status (2026-10-02): code written and tested (`node ops/stripe-functions.test.mjs` — 165 checks), built clean
from `origin/master`, and sitting in [PR #3](https://github.com/cryptofedge/gopicadera-console/pull/3). Not
merged, not deployed, no app credentials exist yet. Same shape as [META_ADS.md](META_ADS.md) — read that first
if this is the first of the two you're looking at.

## How it works

1. Owner taps **Conectar con TikTok** on the Integrations page. The console calls `tiktok-oauth-start`.
2. `tiktok-oauth-start` checks the caller is a real, active owner, then returns TikTok's own consent-screen
   URL with a signed, 10-minute `state` parameter (the same signing helper Meta uses — just a different
   provider name baked into the signed value, so a state meant for one can never be replayed against the other).
3. The owner logs into their own TikTok for Business account and approves. TikTok redirects back to
   `tiktok-oauth-callback` carrying `auth_code` (and, redundantly, `code` — either is accepted).
4. `tiktok-oauth-callback` verifies the `state` signature and expiry **before anything else** — same guarantee
   as Meta: a forged or stale `state` gets bounced with no database write at all. Only then does it exchange
   the code for an access token and a **refresh token** in one call, and save both via `apply_oauth_connection`.
5. The owner lands back on the Integrations page with a banner saying it worked (or why it didn't).

## The one thing that's genuinely different from Meta: token lifetime

TikTok's access token expires **every 24 hours**. The only way to get a new one without the owner
re-approving is the `refresh_token` the exchange also returns — so if TikTok's response is ever missing it,
this console treats the whole connection as **failed**, not "connected but degraded," because a connection
with no refresh token would quietly stop working the next day with no way to notice or recover.

**This console does not yet refresh that token automatically.** There is no background job that calls TikTok
again before the 24 hours are up. That is fine for what exists today — connecting and storing credentials,
nothing reads them yet — but it means "Conectado" on the card reflects "the last connection attempt
succeeded," not "the access token is valid right now." Before any feature is built that actually calls the
TikTok Ads API with this token (posting ads, reading spend, etc.), a refresh job needs to exist first, or
every call will start failing with an expired token within a day of connecting.

The refresh token is stored in `integrations.client_id` — there is no dedicated column for it, and that
column is otherwise unused by any OAuth provider's connection (the manual-paste form that writes to it is
hidden for them).

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
