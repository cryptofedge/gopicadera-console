-- ============================================================================
-- Wake the ads-worker Edge Function: right away when a campaign job is queued,
-- and every 15 minutes regardless (the backstop, and the metrics sync).
--
-- Run after ads_sync.sql, ads_create.sql and ads_accounts.sql, once the
-- ads-worker function is deployed. Safe to run more than once. Kept apart from
-- the other files because it needs Supabase-only pieces (pg_cron, pg_net,
-- Vault, pgcrypto) that the local test database does not have, so nothing the
-- tests rely on may live here.
--
-- Nobody copies a secret by hand. The first run stores two Vault secrets:
--   ads_worker_url     the project's URL
--   ads_worker_secret  64 random hex characters, made here and never shown
-- Every wake-up carries the second one in the x-ads-worker-secret header, and
-- the worker reads the same value back through ads_worker_secret() below. (An
-- ADS_WORKER_SECRET env var on the function still wins if someone sets one; it
-- would then have to match.) Without the secret, anyone who found the function
-- URL could make it run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
-- On Supabase pgcrypto already lives in the `extensions` schema; this is a no-op there.
create extension if not exists pgcrypto with schema extensions;

-- Created only when missing, so a re-run never changes a secret the schedule
-- and the worker already share.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ads_worker_url') then
    perform vault.create_secret('https://kfuamhhfthfmavxppagb.supabase.co', 'ads_worker_url');
  end if;
  if not exists (select 1 from vault.secrets where name = 'ads_worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ads_worker_secret');
  end if;
end $$;

-- How the worker learns the secret without anyone pasting it: it calls this
-- with the service-role key and keeps the answer for a few minutes. No browser
-- may call it.
create or replace function ads_worker_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ads_worker_secret' limit 1;
$$;

revoke all on function ads_worker_secret() from public, anon, authenticated;
grant execute on function ads_worker_secret() to service_role;

create or replace function wake_ads_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text;
  secret text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'ads_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ads_worker_secret';
  -- Not set up yet: say nothing and let the next scheduled run try again.
  if base is null or secret is null then return; end if;

  -- Queued by pg_net and sent after this transaction commits, so the worker sees
  -- the job that woke it, and a slow worker never holds up the console's write.
  perform net.http_post(
    url                  := rtrim(base, '/') || '/functions/v1/ads-worker',
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-ads-worker-secret', secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function wake_ads_worker() from public, anon, authenticated;

create or replace function wake_ads_worker_on_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wake_ads_worker();
  return null;
end;
$$;

drop trigger if exists campaign_jobs_wake_worker on campaign_jobs;
create trigger campaign_jobs_wake_worker
  after insert on campaign_jobs
  for each statement execute function wake_ads_worker_on_job();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ads-worker') then
    perform cron.unschedule('ads-worker');
  end if;
  perform cron.schedule('ads-worker', '*/15 * * * *', 'select public.wake_ads_worker()');
end $$;
