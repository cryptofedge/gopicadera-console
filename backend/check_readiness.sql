-- ============================================================================
-- Is the database ready for the ad-platform connections? READ-ONLY.
--
-- Paste into the Supabase SQL editor. Every row of the first result should say
-- "ok". The second result shows each ad connection's state -- never a token.
-- Run after ads_oauth.sql, security_hardening.sql, ads_sync.sql and
-- ads_accounts.sql (see SETUP.md).
-- The worker's schedule (ads_schedule.sql) is checked at the end of ADS_WORKER.md.
-- ============================================================================

with col(name) as (
  select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'integrations'
),
checks(item, passed) as (
  select 'integrations.refresh_token column exists',  exists (select 1 from col where name = 'refresh_token')
  union all
  select 'integrations.has_secret column exists',     exists (select 1 from col where name = 'has_secret')
  union all
  select 'integrations.details column exists',        exists (select 1 from col where name = 'details')
  union all
  select 'apply_oauth_connection takes p_details',
         exists (select 1 from pg_proc where proname = 'apply_oauth_connection'
                   and pg_get_function_identity_arguments(oid) like '%p_details jsonb%')
  union all
  select 'exactly one apply_oauth_connection',        (select count(*) = 1 from pg_proc where proname = 'apply_oauth_connection')
  union all
  select 'orders guard trigger',                      exists (select 1 from pg_trigger where tgname = 'orders_00_guard_writes')
  union all
  select 'order_items guard trigger',                 exists (select 1 from pg_trigger where tgname = 'order_items_00_guard_writes')
  union all
  select 'loyalty_codes guard trigger',               exists (select 1 from pg_trigger where tgname = 'loyalty_codes_00_guard_writes')
  union all
  select 'disconnect clears credentials',             exists (select 1 from pg_trigger where tgname = 'integrations_clear_on_disconnect')
  union all
  select 'browser cannot read client_secret',
         not has_column_privilege('authenticated', 'public.integrations', 'client_secret', 'SELECT')
  union all
  select 'browser cannot read refresh_token',
         case when exists (select 1 from col where name = 'refresh_token')
              then not has_column_privilege('authenticated', 'public.integrations', 'refresh_token', 'SELECT')
              else false end
  union all
  select 'browser can read details',
         case when exists (select 1 from col where name = 'details')
              then has_column_privilege('authenticated', 'public.integrations', 'details', 'SELECT')
              else false end
  union all
  select 'Meta, TikTok and Google rows exist',
         (select count(*) = 3 from integrations where provider in ('meta_ads', 'tiktok_ads', 'google_ads'))
  -- ads_sync.sql: what the ads worker reads and writes
  union all
  select 'campaigns.platform_ids column exists',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'campaigns' and column_name = 'platform_ids')
  union all
  select 'ads worker functions exist',
         (select count(distinct proname) = 4 from pg_proc
           where proname in ('claim_campaign_jobs', 'finish_campaign_job', 'upsert_platform_campaigns', 'set_integration_health'))
  union all
  select 'queue trigger ignores the worker''s own writes',
         exists (select 1 from pg_proc where proname = 'queue_campaign_job' and prosrc like '%gp.ads_worker%')
  union all
  select 'browser cannot call the ads worker functions',
         case when exists (select 1 from pg_proc where proname = 'claim_campaign_jobs')
              then not has_function_privilege('authenticated', 'claim_campaign_jobs(int)', 'EXECUTE')
              else false end
  -- ads_accounts.sql: the owner's own apps, and the ad account she chose
  union all
  select 'ads_apps table exists',                     to_regclass('public.ads_apps') is not null
  union all
  select 'browser cannot read ads_apps.app_secret',
         case when to_regclass('public.ads_apps') is not null
              then not has_column_privilege('authenticated', 'public.ads_apps', 'app_secret', 'SELECT')
              else false end
  union all
  select 'owners can save an ad app (set_ads_app), visitors cannot',
         case when to_regprocedure('set_ads_app(integration_provider,text,text,text)') is not null
              then has_function_privilege('authenticated', 'set_ads_app(integration_provider,text,text,text)', 'EXECUTE')
               and not has_function_privilege('anon', 'set_ads_app(integration_provider,text,text,text)', 'EXECUTE')
              else false end
  union all
  select 'owners can choose the ad account (choose_ads_account), visitors cannot',
         case when to_regprocedure('choose_ads_account(integration_provider,text,text)') is not null
              then has_function_privilege('authenticated', 'choose_ads_account(integration_provider,text,text)', 'EXECUTE')
               and not has_function_privilege('anon', 'choose_ads_account(integration_provider,text,text)', 'EXECUTE')
              else false end
  union all
  select 'reconnecting keeps only an account an owner chose',
         exists (select 1 from pg_proc where proname = 'apply_oauth_connection' and prosrc like '%chosen_at%')
  union all
  select 'no connected ad account in use that nobody chose',
         not exists (select 1 from integrations
                      where kind = 'ads' and status <> 'disconnected' and store_id is not null
                        and coalesce(details ->> 'chosen_at', '') = '')
)
select item, case when passed then 'ok' else 'MISSING' end as result
  from checks;

select provider,
       status,
       has_secret                              as has_token,
       jsonb_array_length(coalesce(details -> 'ad_accounts', '[]'::jsonb)) as ad_accounts,
       store_id                                as chosen_account,
       jsonb_array_length(coalesce(details -> 'pages', '[]'::jsonb)) as pages,
       details ->> 'page_id'                   as chosen_page,
       details ->> 'token_expires_at'          as token_expires_at,
       last_error
  from integrations
 where kind = 'ads'
 order by provider;
