-- ============================================================================
-- Ads: what the ads-worker Edge Function reads and writes.
--
-- Run after integrations.sql, ads_oauth.sql and security_hardening.sql; then
-- ads_schedule.sql to wake the worker. Safe to run more than once.
--
-- The console has always recorded intent -- an owner moves a campaign, a
-- trigger queues a row in campaign_jobs -- but nothing ever drained that queue,
-- so "Publicar ahora" sat on "Publicando…" forever. The worker drains it now,
-- and every 15 minutes it also pulls each connected ad account's campaigns and
-- lifetime numbers, so a campaign made in Meta/TikTok/Google's own tools shows
-- up here too.
--
-- The worker writes only through the service-role functions below, the same
-- narrow-door pattern as apply_oauth_connection: the key it holds can claim and
-- finish jobs and record what a platform reported, and nothing else here.
-- ============================================================================

-- ------------------------------------------------------------------ columns ---
alter table campaigns
  -- 'platform' rows were found in an ad account rather than drafted here.
  add column if not exists origin          text not null default 'console',
  add column if not exists account_id      text,
  -- Every id the platform gave us: campaign, and for ads made here the ad set /
  -- ad group, ad, creative and media too -- what pausing, ending and rolling
  -- back a half-made campaign need.
  add column if not exists platform_ids    jsonb not null default '{}'::jsonb,
  -- The platform's own word for the state, shown when it does not map cleanly.
  add column if not exists platform_status text,
  add column if not exists destination_url text,
  add column if not exists media_url       text,
  add column if not exists google_assets   jsonb,
  add column if not exists radius_mi       numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_origin_check') then
    alter table campaigns add constraint campaigns_origin_check check (origin in ('console', 'platform'));
  end if;
end $$;

-- One row per platform campaign, so a re-sync updates instead of duplicating.
create unique index if not exists campaigns_platform_campaign_key
  on campaigns (provider, (platform_ids ->> 'campaign'))
  where platform_ids ? 'campaign';

alter table campaign_jobs add column if not exists claimed_at timestamptz;

-- ------------------------------------------------------- the queue trigger ---
-- Redefined from integrations.sql with two changes:
--   * a status the worker itself writes back (paused because the platform says
--     so, active once a launch finishes) must not queue another job, or the
--     worker would feed itself forever. Its writes run with gp.ads_worker set.
--   * re-activating something already on the platform is a resume, never a
--     second launch.
create or replace function queue_campaign_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act campaign_action;
begin
  if coalesce(current_setting('gp.ads_worker', true), '') = 'on' then return new; end if;
  if new.status is not distinct from old.status then return new; end if;

  act := case new.status
    when 'publishing' then 'launch'
    when 'paused'     then 'pause'
    when 'active'     then case when new.external_id is not null then 'resume' else 'launch' end
    when 'ended'      then 'end'
    else null
  end;

  if act is null then return new; end if;

  -- Nothing to pause or end on the platform if it was never published.
  if act in ('pause', 'resume', 'end') and new.external_id is null then
    return new;
  end if;

  insert into campaign_jobs (campaign_id, action, requested_by)
  values (new.id, act, auth.uid());

  return new;
end;
$$;

-- ------------------------------------------------- worker-only functions ---

-- Up to p_limit unfinished jobs, each with its campaign. A job stays claimed for
-- 10 minutes; if the worker dies mid-job it becomes claimable again, and after 5
-- attempts finish_campaign_job gives up on it. SKIP LOCKED lets a cron run and a
-- trigger-woken run overlap without taking the same job twice.
create or replace function claim_campaign_jobs(p_limit int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed jsonb;
begin
  with picked as (
    select j.id
      from campaign_jobs j
     where j.done_at is null
       and (j.claimed_at is null or j.claimed_at < now() - interval '10 minutes')
     order by j.created_at
     limit greatest(p_limit, 1)
     for update skip locked
  ),
  taken as (
    update campaign_jobs j
       set claimed_at = now(),
           attempts   = j.attempts + 1
      from picked
     where j.id = picked.id
    returning j.id, j.action, j.attempts, j.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'job_id',   t.id,
           'action',   t.action,
           'attempts', t.attempts,
           'campaign', to_jsonb(c)) order by c.created_at), '[]'::jsonb)
    into claimed
    from taken t
    join campaigns c on c.id = t.campaign_id;

  return claimed;
end;
$$;

-- Close a job. p_retry leaves it open for another attempt (a rate limit, a
-- platform hiccup); otherwise it is done, failed or not. p_campaign carries what
-- the platform now says about the campaign; only the columns listed below can be
-- written through it.
create or replace function finish_campaign_job(
  p_job_id   uuid,
  p_ok       boolean,
  p_error    text default null,
  p_campaign jsonb default null,
  p_retry    boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j campaign_jobs%rowtype;
  give_up boolean;
begin
  perform set_config('gp.ads_worker', 'on', true);

  select * into j from campaign_jobs where id = p_job_id for update;
  if not found then raise exception 'finish_campaign_job: no job %', p_job_id; end if;

  give_up := not p_ok and (not p_retry or j.attempts >= 5);

  update campaign_jobs
     set done_at    = case when p_ok or give_up then now() else null end,
         claimed_at = case when p_ok or give_up then claimed_at else null end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_job_id;

  if p_campaign is not null or give_up then
    update campaigns c
       set status          = case when give_up and j.action = 'launch' then 'failed'::campaign_status
                                  else coalesce((p_campaign ->> 'status')::campaign_status, c.status) end,
           external_id     = coalesce(p_campaign ->> 'external_id', c.external_id),
           platform_ids    = c.platform_ids || coalesce(p_campaign -> 'platform_ids', '{}'::jsonb),
           account_id      = coalesce(p_campaign ->> 'account_id', c.account_id),
           platform_status = coalesce(p_campaign ->> 'platform_status', c.platform_status),
           last_error      = case when give_up then left(p_error, 500)
                                  when p_ok then null
                                  else c.last_error end,
           synced_at       = case when p_ok then now() else c.synced_at end
     where c.id = j.campaign_id;
  end if;
end;
$$;

-- What an ad account reports: one row per platform campaign. Updates the
-- numbers and state of campaigns already here and adds the ones that are not.
-- Rows: [{ campaign_id, account_id, name, status, platform_status, daily_budget,
--          spend, impressions, clicks, orders, starts_at, ends_at }]
create or replace function upsert_platform_campaigns(p_provider integration_provider, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
  existing campaigns%rowtype;
begin
  perform set_config('gp.ads_worker', 'on', true);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    continue when coalesce(r ->> 'campaign_id', '') = '';

    select * into existing
      from campaigns
     where provider = p_provider and platform_ids ->> 'campaign' = r ->> 'campaign_id'
     for update;

    if found then
      update campaigns
         set -- A launch or a failure belongs to the console until the worker
             -- finishes it; a sync must not paper over either.
             status          = case when existing.status in ('publishing', 'failed') then existing.status
                                    else coalesce((r ->> 'status')::campaign_status, existing.status) end,
             platform_status = coalesce(r ->> 'platform_status', existing.platform_status),
             -- Names typed here win; a platform-only campaign follows the platform.
             name            = case when existing.origin = 'platform' then coalesce(r ->> 'name', existing.name) else existing.name end,
             daily_budget    = coalesce((r ->> 'daily_budget')::numeric, existing.daily_budget),
             spend           = coalesce((r ->> 'spend')::numeric, existing.spend),
             impressions     = coalesce((r ->> 'impressions')::numeric::int, existing.impressions),
             clicks          = coalesce((r ->> 'clicks')::numeric::int, existing.clicks),
             orders          = coalesce((r ->> 'orders')::numeric::int, existing.orders),
             starts_at       = coalesce((r ->> 'starts_at')::timestamptz, existing.starts_at),
             ends_at         = coalesce((r ->> 'ends_at')::timestamptz, existing.ends_at),
             synced_at       = now()
       where id = existing.id;
    else
      insert into campaigns (provider, name, status, origin, account_id, platform_ids, external_id,
                             platform_status, daily_budget, spend, impressions, clicks, orders,
                             starts_at, ends_at, synced_at)
      values (p_provider,
              coalesce(nullif(r ->> 'name', ''), 'Campaña ' || (r ->> 'campaign_id')),
              coalesce((r ->> 'status')::campaign_status, 'paused'),
              'platform',
              r ->> 'account_id',
              jsonb_build_object('campaign', r ->> 'campaign_id'),
              r ->> 'campaign_id',
              r ->> 'platform_status',
              coalesce((r ->> 'daily_budget')::numeric, 0),
              coalesce((r ->> 'spend')::numeric, 0),
              coalesce((r ->> 'impressions')::numeric::int, 0),
              coalesce((r ->> 'clicks')::numeric::int, 0),
              coalesce((r ->> 'orders')::numeric::int, 0),
              (r ->> 'starts_at')::timestamptz,
              (r ->> 'ends_at')::timestamptz,
              now());
    end if;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- What the worker learned about a connection while using it: a token Meta says
-- is about to lapse, a Google refresh token that stopped working. p_status null
-- leaves the status alone; p_last_error null clears the warning.
create or replace function set_integration_health(
  p_provider   integration_provider,
  p_status     integration_status default null,
  p_last_error text default null,
  p_details    jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update integrations
     set status     = coalesce(p_status, status),
         last_error = left(p_last_error, 300),
         details    = details || coalesce(p_details, '{}'::jsonb),
         updated_at = now()
   where provider = p_provider
     and status <> 'disconnected';
end;
$$;

revoke all on function claim_campaign_jobs(int)                                            from public, anon, authenticated;
revoke all on function finish_campaign_job(uuid, boolean, text, jsonb, boolean)             from public, anon, authenticated;
revoke all on function upsert_platform_campaigns(integration_provider, jsonb)               from public, anon, authenticated;
revoke all on function set_integration_health(integration_provider, integration_status, text, jsonb) from public, anon, authenticated;
grant execute on function claim_campaign_jobs(int)                                          to service_role;
grant execute on function finish_campaign_job(uuid, boolean, text, jsonb, boolean)           to service_role;
grant execute on function upsert_platform_campaigns(integration_provider, jsonb)             to service_role;
grant execute on function set_integration_health(integration_provider, integration_status, text, jsonb) to service_role;
