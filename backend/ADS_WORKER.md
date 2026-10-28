# The ads worker

A Supabase Edge Function (`supabase/functions/ads-worker`, code in `_shared/ads-worker.ts`) that does what the
Promoción page asks for and keeps it up to date:

- **Runs the queue.** Pausing, resuming or ending a campaign in the console queues a row in `campaign_jobs`, and
  the worker carries it out on Meta, TikTok or Google. Before this existed nothing drained that queue, so
  "Publicar ahora" sat on "Publicando…" forever.
- **Syncs every 15 minutes.** On each connected platform it pulls the chosen ad account's campaigns with lifetime
  spend, impressions, clicks and conversions. Campaigns made in each platform's own tools show up in Promoción
  too, marked "creada en Meta" (or TikTok / Google).
- **Watches the connections.**
  - Meta: a login that lapses within 10 days leaves a warning on Promoción and Canales.
  - Google: a revoked permission marks the connection "Con problema".
  - Neither is ever retried silently.

- **Creates ads.** "Publicar" on a draft queues a `launch`. The worker first checks everything the owner can fix
  (budget minimums, an image or video, Google's text lengths, the TikTok zones), before a single call goes to the
  platform. It then builds the ad, as described below.

## Which account it uses

The login that connects a platform may reach more than Go Picadera's ad accounts and Pages: the connector's own,
and possibly other businesses'. So the worker only ever works on the **one account an owner chose in Canales**,
and on Meta the **Page she chose** (`backend/ads_accounts.sql`, `choose_ads_account`):

- The connect step records every account and Page the login reaches, with names, in `integrations.details`
  (`ad_accounts`, `pages`). It never chooses one, even when the login sees only one.
- `store_id` holds the chosen account; `details.page_id` the chosen Page; `details.chosen_at` marks that a person
  chose them. A comma list or a `store_id` without `chosen_at` (what the old callback stored) is never used.
- **No choice yet:** nothing is synced, launched, paused or ended on that platform. Its jobs fail with, and the
  connection shows, "Elige la cuenta publicitaria de Go Picadera en Canales". The status is left as it is.
- **Every run** reads the lists again with the stored credential, so an account granted later (the owner accepting
  an invitation, say) shows up in Canales without reconnecting. If the chosen account is no longer among them, the
  worker stops for that platform and says so.
- **A job on a campaign from another account** fails and touches nothing on the platform.
- **Meta launches** speak as the chosen Page, with the Instagram account linked to it as the login sees it now. No
  Page chosen means a "elige la Página en Canales" error before any call to Meta.
- Choosing a different account removes the imported campaigns of every other account from Promoción. Campaigns
  written in the console are never deleted.

## How a launch is built

The campaign is created **switched off**, its pieces switched on beneath it, and the campaign is switched on as
the very last step. Nothing can spend unless every step succeeded, and a failure removes whatever was already
made.

| Platform | What it makes, in order | Needs |
|---|---|---|
| **Meta** (Facebook + Instagram) | 1. image upload<br>2. creative naming the Page and its Instagram account<br>3. `OUTCOME_TRAFFIC` campaign, paused<br>4. ad set: daily budget, radius around the restaurant, link clicks<br>5. ad<br>6. campaign on | an image; the Page chosen in Canales (and for Instagram, the Page's linked Instagram account) |
| **TikTok** | 1. checks a real TikTok account is linked (since Jan 2026 no Custom Identity)<br>2. video by URL<br>3. its cover image<br>4. `TRAFFIC` campaign, disabled<br>5. ad group: daily budget of at least $20, TikTok zones<br>6. ad<br>7. campaign on | a video; the business's TikTok account linked in Business Center; TikTok zone ids in Ajustes |
| **Google** | one all-or-nothing request: budget, Search campaign (paused, Maximize Clicks), radius, ad group, phrase-match keywords, responsive search ad. Dry-run with `validateOnly` first, then for real, then switched on. | 3–15 headlines of ≤30 characters, 2–4 descriptions of ≤90, keywords; the Google Cloud project that owns the OAuth client at Explorer access or higher (no developer token since 2026-09-09); billing set up in Google Ads |

Rollback differs per platform:
- **Meta:** deletes the ad, ad set, campaign, creative and image, newest first.
- **TikTok:** deletes the campaign, which takes its ad group and ad with it.
- **Google:** creation is atomic, so a refused batch leaves nothing behind. If switching on fails afterwards, the
  worker removes the campaign.

Targeting comes from **Ajustes → Anuncios** (setting `ads_targeting`): the restaurant's coordinates, a default
radius of 3 mi, and the destination URL. The coordinates default to 4820 4th Ave as OpenStreetMap geocodes it. The
TikTok zones are filled in once from TikTok Ads Manager. Images and videos are uploaded to the public `ads`
Storage bucket, where only an owner may write (`backend/ads_create.sql`).

## How it is woken

`backend/ads_schedule.sql` wakes it two ways:
- **Right after a job is queued:** an `AFTER INSERT` trigger on `campaign_jobs` calls `pg_net`. The request is
  sent after the transaction commits, so the worker sees the job.
- **Every 15 minutes:** `pg_cron`.
- Choosing an account in Canales also wakes it, so the chosen account's campaigns arrive right away.

Each call carries the `x-ads-worker-secret` header. The function is deployed with `--no-verify-jwt`, because
the caller is the database, not a signed-in user, so that header is the only way in.

Nobody copies that secret. The first run of `ads_schedule.sql` makes it: 32 random bytes, hex-encoded, stored in
Vault as `ads_worker_secret` (with `ads_worker_url`, the project's URL), and created only if missing, so a re-run
never changes it. The worker reads the same value back through `ads_worker_secret()`, a function only the service
role may call, and keeps it for five minutes. A failed read is kept just as long, so a stranger hammering the URL
costs at most one database call per five minutes. With no secret in Vault and no env var, the worker answers
`503 not_configured`; a wrong secret gets `401` before any other work.

An `ADS_WORKER_SECRET` env var on the function still wins if someone sets one. It is not needed, and if set it
has to match the Vault value or every wake-up is refused.

## What it may touch

It reads `integrations` and `ads_apps` (each platform's app id and secret, saved by the owner in Canales) with
the service role, and the worker secret through `ads_worker_secret()`. It writes only through four service-role
functions in `backend/ads_sync.sql`:

- `claim_campaign_jobs`
- `finish_campaign_job`
- `upsert_platform_campaigns`
- `set_integration_health`

None of them is callable from a browser. The worker's own status writes are flagged (`gp.ads_worker`), so they
never queue another job. The refreshed account and Page lists go through `set_integration_health`, which leaves
the status and the note on the card as they were.

| When a platform says… | The worker… |
|---|---|
| the token is dead / permission revoked | marks the connection **Con problema** with a "reconecta" message, fails the job |
| rate limit, timeout, 5xx | leaves the job for the next run (up to 5 attempts) |
| something setup has to fix (no account chosen, Google's Cloud project without Explorer access, the app missing from Canales) | records it on the connection without changing its status, fails the job |
| it refuses this particular request | fails the job, shows the reason on the campaign |

## Turn it on

All commands use project `kfuamhhfthfmavxppagb`. Nothing goes in Dashboard → Edge Functions → Secrets.

1. **SQL**, in the SQL editor, after `ads_oauth.sql` and `security_hardening.sql`: `backend/ads_sync.sql`, then
   `backend/ads_create.sql`, then `backend/ads_accounts.sql`.
2. **Deploy:**
   ```bash
   npx supabase functions deploy ads-worker --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
3. **Schedule:** run `backend/ads_schedule.sql` in the SQL editor. It creates its own Vault secrets.
4. **Canales:** the owner saves each platform's app, connects, and chooses Go Picadera's ad account (and on Meta,
   the Page). Until then the worker runs but leaves that platform alone.
5. **Check it**, in the SQL editor:
   - Wake it once: `select public.wake_ads_worker();` A few seconds later,
     `select status_code, content from net._http_response order by created desc limit 1;` shows `200` and the
     summary, never a token: `"synced": {"meta_ads": N}` means the Meta campaigns are in Promoción, and
     `"problems"` lists anything to fix.
   - The schedule exists: `select jobname, schedule from cron.job where jobname = 'ads-worker';`
   - Recent wake-ups: `select status_code, created from net._http_response order by created desc limit 5;`
     These should be `200`. A `401` means an `ADS_WORKER_SECRET` env var was set that does not match Vault; a
     `503` means `ads_schedule.sql` has not run.

**Optional overrides** (function env vars, never needed in the normal setup):
- `ADS_WORKER_SECRET`: see "How it is woken".
- `META_APP_ID`/`META_APP_SECRET`, `TIKTOK_APP_ID`/`TIKTOK_APP_SECRET`, `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET`:
  win over the app saved in Canales when both halves of a pair are set.
- `GOOGLE_ADS_DEVELOPER_TOKEN`: Google sunset developer tokens on 2026-09-09; one that is sent is ignored. Sent only
  when set.
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: only when access to the restaurant's account goes through a manager account.

## Numbers, and whose they are

- **Spend, impressions and clicks** are the platform's lifetime totals for each campaign.
- **"Pedidos"** is the platform's own attributed count: Meta purchases, TikTok conversions, Google conversions.
  It stays at 0 until a conversion is set up on that platform. These are the platform's numbers, not ours.
- **Units:** money arrives from Meta in cents, from TikTok in dollars and from Google in micros. All of it is
  stored in dollars.

## Tests

- `npm run test:functions`: every adapter call and the worker end to end, against a fake Meta, TikTok, Google
  and Supabase. This covers each launch sequence, each rollback, and the validation that runs before any call;
  the account choice (nothing done without one, only the chosen account synced, the chosen Page used, jobs on
  other accounts refused, lists refreshed); and the secret (env, Vault, the five-minute cache, 503, 401).
- **The first real launch on each platform** is the one thing tests cannot cover. Do it on purpose: a small
  budget, check every piece in that platform's own manager, then end it from the console.
- `npm run test:sql`: claiming, retry and give-up, no self-feeding, imports that update instead of
  duplicating, that the browser cannot call any worker function, and `choose_ads_account` / `set_ads_app`
  (owner only, lists checked, other accounts' imports removed, reconnects keep only a still-valid choice).
- `ads_schedule.sql` (Vault, `pg_cron`, `pg_net`) is not in the local test database; check it by hand as above.
