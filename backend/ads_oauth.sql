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

-- Postgres treats a different argument count as a different, overloaded function even with a
-- default on the new one -- it will not just extend the original. Drop the original 3-arg version
-- first so there is only ever one `apply_oauth_connection`, never two ambiguous overloads.
drop function if exists apply_oauth_connection(integration_provider, text, text);

create or replace function apply_oauth_connection(
  p_provider integration_provider,
  p_access_token text,
  p_account_id text,
  -- TikTok's access token expires every 24h and needs this to get a new one; Meta has nothing
  -- like it (its long-lived token is used directly), so this stays null for meta_ads. There is no
  -- dedicated column for it -- client_id is never used by any OAuth provider's own form (that
  -- form is hidden for them), so it is repurposed here rather than adding a migration for one value.
  p_refresh_token text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_provider not in ('meta_ads', 'tiktok_ads', 'google_ads') then
    raise exception 'apply_oauth_connection: % does not use the OAuth path', p_provider;
  end if;
  if p_access_token is null or length(trim(p_access_token)) = 0 then
    raise exception 'apply_oauth_connection: empty access token';
  end if;

  update integrations
     set client_secret = p_access_token,
         -- one or more platform account ids, comma-joined; nothing presumes there is exactly one
         store_id      = nullif(trim(coalesce(p_account_id, '')), ''),
         client_id     = nullif(trim(coalesce(p_refresh_token, '')), ''),
         status        = 'connected',
         last_error    = null,
         updated_at    = now()
   where provider = p_provider;

  if not found then
    raise exception 'apply_oauth_connection: no integrations row for %', p_provider;
  end if;
end;
$$;

revoke all on function apply_oauth_connection(integration_provider, text, text, text) from public, anon, authenticated;
grant execute on function apply_oauth_connection(integration_provider, text, text, text) to service_role;

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
