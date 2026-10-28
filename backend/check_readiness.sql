-- ============================================================================
-- Is the database ready for the ad-platform connections? READ-ONLY.
--
-- Paste into the Supabase SQL editor. Every row of the first result should say
-- "ok". The second result shows each ad connection's state -- never a token.
-- Run after ads_oauth.sql and security_hardening.sql (see SETUP.md).
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
)
select item, case when passed then 'ok' else 'MISSING' end as result
  from checks;

select provider,
       status,
       has_secret                              as has_token,
       store_id is not null                    as has_ad_account,
       jsonb_array_length(coalesce(details -> 'pages', '[]'::jsonb)) as pages,
       details ->> 'token_expires_at'          as token_expires_at,
       last_error
  from integrations
 where kind = 'ads'
 order by provider;
