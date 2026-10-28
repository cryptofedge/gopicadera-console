# The ads worker

A Supabase Edge Function (`supabase/functions/ads-worker`, code in `_shared/ads-worker.ts`) that does what the
Promoción page asks for and keeps it up to date:

- **Runs the queue.** Pausing, resuming or ending a campaign in the console queues a row in `campaign_jobs`, and
  the worker carries it out on Meta, TikTok or Google. Before this existed nothing drained that queue, so
  "Publicar ahora" sat on "Publicando…" forever.
- **Syncs every 15 minutes.** It pulls each connected ad account's campaigns with lifetime spend, impressions,
  clicks and conversions. Campaigns made in each platform's own tools show up in Promoción too, marked
  "creada en Meta" (or TikTok / Google).
- **Watches the connections.**
  - Meta: a login that lapses within 10 days leaves a warning on Promoción and Canales.
  - Google: a revoked permission marks the connection "Con problema".
  - Neither is ever retried silently.

Creating ads from the console (the `launch` job) comes in the next part. Until then the worker answers a launch
with a message telling the owner to create the campaign in the platform's own ad manager, where it will be
picked up automatically.

## How it is woken

`backend/ads_schedule.sql` wakes it two ways:
- **Right after a job is queued:** an `AFTER INSERT` trigger on `campaign_jobs` calls `pg_net`. The request is
  sent after the transaction commits, so the worker sees the job.
- **Every 15 minutes:** `pg_cron`.

Each call carries the `x-ads-worker-secret` header. The function is deployed with `--no-verify-jwt`, because
the caller is the database, not a signed-in user, so that header is the only way in.

## What it may touch

It reads `integrations` with the service role. It writes only through four service-role functions in
`backend/ads_sync.sql`:

- `claim_campaign_jobs`
- `finish_campaign_job`
- `upsert_platform_campaigns`
- `set_integration_health`

None of them is callable from a browser. The worker's own status writes are flagged (`gp.ads_worker`), so they
never queue another job.

| When a platform says… | The worker… |
|---|---|
| the token is dead / permission revoked | marks the connection **Con problema** with a "reconecta" message, fails the job |
| rate limit, timeout, 5xx | leaves the job for the next run (up to 5 attempts) |
| something only Fellito can fix (missing developer token) | records it on the connection, fails the job |
| it refuses this particular request | fails the job, shows the reason on the campaign |

## Turn it on

All commands use project `kfuamhhfthfmavxppagb`.

1. **SQL:** run `backend/ads_sync.sql` in the SQL editor, after `ads_oauth.sql` and `security_hardening.sql`.
2. **Secrets** (Dashboard → Edge Functions → Secrets):
   - `ADS_WORKER_SECRET`: a fresh random value (`openssl rand -hex 32`).
   - `GOOGLE_ADS_DEVELOPER_TOKEN`: required for anything on Google beyond connecting. See GOOGLE_ADS.md.
   - `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: only if Google access goes through a manager account.
3. **Deploy:**
   ```bash
   npx supabase functions deploy ads-worker --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
   ```
4. **Vault + schedule.** In the SQL editor, store the two Vault secrets named at the top of `ads_schedule.sql`.
   The second one is the same value as `ADS_WORKER_SECRET`. Then run `backend/ads_schedule.sql`.
5. **Check it:**
   - Run the worker once by hand; it answers with a summary and never a token:
     ```bash
     curl -s -X POST https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/ads-worker -H "x-ads-worker-secret: $ADS_WORKER_SECRET"
     ```
     `"synced": {"meta_ads": N}` means the Meta campaigns are in Promoción, and `"problems"` lists anything to fix.
   - The schedule exists: `select jobname, schedule from cron.job where jobname = 'ads-worker';`
   - Recent wake-ups: `select status_code, created from net._http_response order by created desc limit 5;`
     These should be `200`.

## Numbers, and whose they are

- **Spend, impressions and clicks** are the platform's lifetime totals for each campaign.
- **"Pedidos"** is the platform's own attributed count: Meta purchases, TikTok conversions, Google conversions.
  It stays at 0 until a conversion is set up on that platform. These are the platform's numbers, not ours.
- **Units:** money arrives from Meta in cents, from TikTok in dollars and from Google in micros. All of it is
  stored in dollars.

## Tests

- `npm run test:functions`: every adapter call and the worker end to end, against a fake Meta, TikTok, Google
  and Supabase.
- `npm run test:sql`: claiming, retry and give-up, no self-feeding, imports that update instead of
  duplicating, and that the browser cannot call any worker function.
