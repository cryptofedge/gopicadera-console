-- ============================================================================
-- Wake the ads-worker Edge Function: right away when a campaign job is queued,
-- and every 15 minutes regardless (the backstop, and the metrics sync).
--
-- Run after ads_sync.sql, once the ads-worker function is deployed. Safe to run
-- more than once. Kept apart from ads_sync.sql because it needs Supabase-only
-- pieces (pg_cron, pg_net, Vault) that the local test database does not have.
--
-- BEFORE RUNNING, store two Vault secrets once (SQL editor):
--
--   select vault.create_secret('https://kfuamhhfthfmavxppagb.supabase.co', 'ads_worker_url');
--   select vault.create_secret('<the same value as the ADS_WORKER_SECRET function secret>', 'ads_worker_secret');
--
-- The secret is what the worker checks on every call; without it anyone who
-- found the function URL could make it run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

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
