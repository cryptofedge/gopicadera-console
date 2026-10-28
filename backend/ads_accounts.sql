-- ============================================================================
-- Ads: whose developer app connects, and which ad account and Facebook Page
-- are Go Picadera's.
--
-- Run after ads_sync.sql and ads_create.sql. Safe to run more than once.
--
-- 1. ads_apps. The owner creates each platform's developer app herself and
--    saves its id and secret in Canales. Nothing has to be set in the Supabase
--    dashboard; the Edge Functions' env vars (META_APP_ID, ...) still win when
--    someone sets them, as an override.
--
-- 2. The account choice. Whoever connects may reach more than Go Picadera's ad
--    accounts with their login: their own, and possibly other businesses'. The
--    connect step therefore only records what the login can reach
--    (integrations.details.ad_accounts, details.pages). Nothing is synced,
--    launched or paused until an owner picks Go Picadera's account, and on Meta
--    its Page, in Canales: integrations.store_id and details.page_id, with
--    details.chosen_at marking that a person made the choice. A login that
--    sees a single account gets no automatic choice either: a trial connect
--    before the owner's invitation would otherwise lock onto the connector's
--    own account.
-- ============================================================================

-- --------------------------------------------------------------- ads_apps ---
create table if not exists ads_apps (
  provider        integration_provider primary key
                  check (provider in ('meta_ads', 'tiktok_ads', 'google_ads')),
  -- Meta App ID, TikTok App ID, or Google OAuth Client ID.
  app_id          text,
  -- Never readable from a browser; see the grants below.
  app_secret      text,
  -- Meta only: a "Facebook Login for Business" configuration, used instead of a scope list.
  login_config_id text,
  has_secret      boolean generated always as (app_secret is not null) stored,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles on delete set null
);

insert into ads_apps (provider) values ('meta_ads'), ('tiktok_ads'), ('google_ads')
on conflict (provider) do nothing;

alter table ads_apps enable row level security;

drop policy if exists "owner reads ads apps" on ads_apps;
create policy "owner reads ads apps" on ads_apps for select using (is_owner());

-- Same pattern as integrations in security_hardening.sql: name what a browser
-- may read, so the secret (and any column added later) stays out. No write
-- privilege at all: the only way in is set_ads_app() below. The Edge Functions
-- read the secret with the service role.
revoke all on ads_apps from anon, authenticated;
grant select (provider, app_id, login_config_id, has_secret, updated_at, updated_by)
  on ads_apps to authenticated;

-- Saves a platform's app. A blank secret keeps the stored one, so a typo in the
-- id can be fixed without retyping the secret. A different app id means the
-- tokens saved so far belong to another app, so that platform is disconnected
-- (integrations_clear_on_disconnect in security_hardening.sql drops the tokens
-- and details) and has to be connected again.
create or replace function set_ads_app(
  p_provider        integration_provider,
  p_app_id          text,
  p_app_secret      text default null,
  p_login_config_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id text;
  new_id text := nullif(trim(coalesce(p_app_id, '')), '');
  secret text := nullif(trim(coalesce(p_app_secret, '')), '');
  cfg    text := nullif(trim(coalesce(p_login_config_id, '')), '');
begin
  if not is_owner() then
    raise exception 'Solo una cuenta de dueno puede guardar la app.' using errcode = 'insufficient_privilege';
  end if;
  if p_provider not in ('meta_ads', 'tiktok_ads', 'google_ads') then
    raise exception 'set_ads_app: % no es una plataforma de anuncios', p_provider using errcode = 'invalid_parameter_value';
  end if;
  if new_id is null then
    raise exception 'Falta el ID de la app.' using errcode = 'check_violation';
  end if;
  if p_provider in ('meta_ads', 'tiktok_ads') and new_id !~ '^[0-9]+$' then
    raise exception 'El App ID son solo numeros. Copialo tal cual de la pagina de la app.' using errcode = 'check_violation';
  end if;
  if p_provider = 'google_ads' and new_id !~ '^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$' then
    raise exception 'El Client ID de Google termina en .apps.googleusercontent.com.' using errcode = 'check_violation';
  end if;
  if p_provider <> 'meta_ads' then
    cfg := null;
  elsif cfg is not null and cfg !~ '^[0-9]+$' then
    raise exception 'El ID de configuracion de Meta son solo numeros.' using errcode = 'check_violation';
  end if;

  select app_id into old_id from ads_apps where provider = p_provider for update;

  insert into ads_apps (provider, app_id, app_secret, login_config_id, updated_at, updated_by)
  values (p_provider, new_id, secret, cfg, now(), auth.uid())
  on conflict (provider) do update
     set app_id          = excluded.app_id,
         app_secret      = coalesce(excluded.app_secret, ads_apps.app_secret),
         login_config_id = excluded.login_config_id,
         updated_at      = now(),
         updated_by      = auth.uid();

  if old_id is not null and old_id is distinct from new_id then
    update integrations
       set status        = 'disconnected',
           client_secret = null,
           store_id      = null,
           last_error    = null,
           updated_at    = now(),
           updated_by    = auth.uid()
     where provider = p_provider;
  end if;
end;
$$;

revoke all on function set_ads_app(integration_provider, text, text, text) from public, anon;
grant execute on function set_ads_app(integration_provider, text, text, text) to authenticated;

-- ------------------------------------------------------- the account choice ---
-- Before this file the callbacks stored every reachable account in store_id,
-- comma-joined. None of those was chosen by anyone, so they go. A choice made
-- through choose_ads_account carries details.chosen_at and is left alone, which
-- is what makes this safe to run again.
update integrations
   set store_id = null
 where kind = 'ads'
   and store_id is not null
   and coalesce(details ->> 'chosen_at', '') = '';

-- An owner picks Go Picadera's ad account, and on Meta the Page the ads speak
-- as, from the lists the connection recorded. Imports from any other account
-- leave Promocion; campaigns written here (origin 'console') are never deleted.
create or replace function choose_ads_account(
  p_provider   integration_provider,
  p_account_id text,
  p_page_id    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur  integrations%rowtype;
  acct text := nullif(trim(coalesce(p_account_id, '')), '');
  page text := nullif(trim(coalesce(p_page_id, '')), '');
begin
  if not is_owner() then
    raise exception 'Solo una cuenta de dueno puede elegir la cuenta publicitaria.' using errcode = 'insufficient_privilege';
  end if;

  select * into cur from integrations where provider = p_provider and kind = 'ads' for update;
  if not found then
    raise exception 'choose_ads_account: % no es una plataforma de anuncios', p_provider using errcode = 'invalid_parameter_value';
  end if;
  if cur.status not in ('connected', 'error') then
    raise exception 'Primero conecta esta plataforma en Canales.' using errcode = 'check_violation';
  end if;
  if acct is null
     or not jsonb_path_exists(cur.details, '$.ad_accounts[*] ? (@.id == $id)', jsonb_build_object('id', acct)) then
    raise exception 'Esa cuenta publicitaria no esta entre las que ve esta conexion.' using errcode = 'check_violation';
  end if;
  if p_provider = 'meta_ads' then
    if page is null then
      raise exception 'Elige tambien la Pagina de Facebook con la que salen los anuncios.' using errcode = 'check_violation';
    end if;
    if not jsonb_path_exists(cur.details, '$.pages[*] ? (@.id == $id)', jsonb_build_object('id', page)) then
      raise exception 'Esa Pagina no esta entre las que ve esta conexion.' using errcode = 'check_violation';
    end if;
  end if;

  -- The worker's flag (ads_sync.sql): nothing written here is an owner moving
  -- a campaign, so none of it may queue a job.
  perform set_config('gp.ads_worker', 'on', true);

  if cur.store_id is distinct from acct then
    delete from campaigns
     where provider = p_provider
       and origin = 'platform'
       and account_id is distinct from acct;
  end if;

  update integrations
     set store_id   = acct,
         details    = details
                      || jsonb_build_object('chosen_at', now())
                      || case when p_provider = 'meta_ads' then jsonb_build_object('page_id', page) else '{}'::jsonb end,
         -- The worker's "choose an account" note no longer applies; anything
         -- else it recorded stays until its next run says otherwise.
         last_error = case when last_error like 'Elige la cuenta publicitaria%' then null else last_error end,
         updated_at = now(),
         updated_by = auth.uid()
   where provider = p_provider;

  -- Let the worker pick the new account up now rather than at the next
  -- quarter hour. wake_ads_worker() lives in ads_schedule.sql, which may not be
  -- applied (and is not, in the local test database); a failure here must not
  -- undo the owner's choice.
  if to_regprocedure('public.wake_ads_worker()') is not null then
    begin
      perform public.wake_ads_worker();
    exception when others then
      raise warning 'choose_ads_account: could not wake the ads worker: %', sqlerrm;
    end;
  end if;
end;
$$;

revoke all on function choose_ads_account(integration_provider, text, text) from public, anon;
grant execute on function choose_ads_account(integration_provider, text, text) to authenticated;
