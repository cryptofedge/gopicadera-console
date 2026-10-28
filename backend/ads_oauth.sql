-- Real OAuth connections for the ad platforms (Meta, TikTok, Google Ads), applied by the oauth-callback
-- Edge Functions after a successful token exchange. Safe to run more than once. Not part of
-- APPLY_ALL.sql, same reason as stripe_payments.sql: this is new surface, applied deliberately.
--
-- What `p_access_token` carries differs per platform, because it always lands in client_secret: Meta's
-- long-lived token and TikTok's access token are used directly; for google_ads it is the REFRESH token,
-- since Google's access token lasts only an hour and is minted from the refresh token whenever needed.
--
-- Why a function and not a plain update from the Edge Function: the callback runs with the service
-- role key and no owner session (Meta/TikTok's redirect carries no Supabase login), so writing
-- through a narrow, validated RPC -- rather than letting the function UPDATE the table directly over
-- REST -- keeps the "what can this key actually do" surface small and auditable, matching
-- apply_stripe_event in stripe_payments.sql.

-- TikTok's refresh token gets a column of its own. It used to be parked in client_id, which the
-- Canales page selects into the browser and Desconectar never cleared. security_hardening.sql
-- leaves this column out of the browser's grants, like client_secret.
alter table integrations add column if not exists refresh_token text;

-- Move a token stored by the old version of apply_oauth_connection. Only tiktok_ads ever wrote one.
update integrations
   set refresh_token = client_id,
       client_id     = null
 where provider = 'tiktok_ads'
   and refresh_token is null
   and client_id is not null;

-- What the ads work needs to know about a connection that is not a secret: for Meta, the Pages the
-- login can advertise as, the Instagram account linked to each, and when the token stops working.
-- Readable by the owner's browser (see security_hardening.sql), so the console can warn before expiry.
alter table integrations add column if not exists details jsonb not null default '{}'::jsonb;

-- Postgres treats a different argument count as a different, overloaded function even with a
-- default on the new one -- it will not just extend the original. Drop every earlier version first
-- so there is only ever one `apply_oauth_connection`, never two ambiguous overloads.
drop function if exists apply_oauth_connection(integration_provider, text, text);
drop function if exists apply_oauth_connection(integration_provider, text, text, text);

create or replace function apply_oauth_connection(
  p_provider integration_provider,
  p_access_token text,
  -- Every ad account the login reaches, comma-joined. A list to choose from, never the choice itself:
  -- the person who connects may reach other businesses' accounts too (see ads_accounts.sql).
  p_account_id text,
  -- Only kept if a platform sends one. TikTok's advertiser token is long-term and normally has none;
  -- Meta has nothing like it; Google's durable credential arrives as p_access_token.
  p_refresh_token text default null,
  -- Non-secret facts about the connection (ad_accounts, pages, token expiry); replaces whatever an
  -- earlier connection left, except the owner's choice, which is kept below while it is still valid.
  p_details jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev        integrations%rowtype;
  accessible  text[];
  kept_store  text;
  new_details jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if p_provider not in ('meta_ads', 'tiktok_ads', 'google_ads') then
    raise exception 'apply_oauth_connection: % does not use the OAuth path', p_provider;
  end if;
  if p_access_token is null or length(trim(p_access_token)) = 0 then
    raise exception 'apply_oauth_connection: empty access token';
  end if;

  select * into prev from integrations where provider = p_provider for update;
  if not found then
    raise exception 'apply_oauth_connection: no integrations row for %', p_provider;
  end if;

  accessible := array(
    select trim(x) from unnest(string_to_array(coalesce(p_account_id, ''), ',')) as x where trim(x) <> ''
  );

  -- store_id holds at most one id: the account an owner chose with choose_ads_account, which marks it
  -- with details.chosen_at. It survives a reconnect only while this login still reaches it. A store_id
  -- with no chosen_at was never chosen by anyone (the old callback stored every account), so it goes.
  if prev.store_id = any(accessible) and coalesce(prev.details ->> 'chosen_at', '') <> '' then
    kept_store  := prev.store_id;
    new_details := new_details || jsonb_build_object('chosen_at', prev.details -> 'chosen_at');
  end if;

  -- Same for the Facebook Page the ads speak as: kept only if this login still sees it.
  if coalesce(prev.details ->> 'page_id', '') <> ''
     and jsonb_path_exists(new_details, '$.pages[*] ? (@.id == $id)', jsonb_build_object('id', prev.details ->> 'page_id')) then
    new_details := new_details || jsonb_build_object('page_id', prev.details ->> 'page_id');
  end if;

  update integrations
     set client_secret = p_access_token,
         store_id      = kept_store,
         refresh_token = nullif(trim(coalesce(p_refresh_token, '')), ''),
         -- no OAuth provider has a client id of its own; clears anything left by the old version
         client_id     = null,
         details       = new_details,
         status        = 'connected',
         last_error    = null,
         updated_at    = now()
   where provider = p_provider;
end;
$$;

revoke all on function apply_oauth_connection(integration_provider, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function apply_oauth_connection(integration_provider, text, text, text, jsonb) to service_role;

-- A failed or abandoned OAuth attempt (denied consent, Meta/TikTok error, token exchange failure)
-- is recorded here too, so the card can show *why* without ever having written a token.
create or replace function record_oauth_failure(
  p_provider integration_provider,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_provider not in ('meta_ads', 'tiktok_ads', 'google_ads') then
    raise exception 'record_oauth_failure: % does not use the OAuth path', p_provider;
  end if;
  update integrations
     set status     = 'error',
         last_error = left(coalesce(p_reason, 'unknown error'), 300),
         updated_at = now()
   where provider = p_provider;
end;
$$;

revoke all on function record_oauth_failure(integration_provider, text) from public, anon, authenticated;
grant execute on function record_oauth_failure(integration_provider, text) to service_role;
