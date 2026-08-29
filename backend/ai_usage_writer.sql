-- =====================================================================
--  Let the bot report its own spend, without giving it the keys to
--  everything else.
--
--  The obvious route is the service_role key. It is the wrong one here:
--  service_role bypasses every policy in this database, and the process
--  that would hold it reads untrusted WhatsApp messages from strangers
--  all day. One prompt injection and that key reads every order and
--  every customer.
--
--  So the bot gets one function that can do exactly one thing: overwrite
--  this month's usage figure. If the bot is compromised, the worst
--  available outcome is a wrong number on a dashboard.
-- =====================================================================

-- The figure is an estimate: Anthropic's usage and cost endpoints need an
-- admin key, and the bot holds a normal API key -- verified, they return
-- 403 permission_error. This is the bot pricing its own token counts, so
-- the column says so and the console labels it.
alter table ai_usage add column if not exists estimated boolean not null default true;

-- ---------------------------------------------------------------------
-- Where the shared token lives.
--
-- NOT in `settings`: that table is `for select using (true)` so the
-- storefront can read opening hours, which means anyone holding the
-- publishable key can read all of it. A token there would be public.
--
-- This table has RLS on and deliberately no policies at all, plus the
-- grants revoked. Nothing reaches it through the API. The function below
-- is `security definer`, so it can still read it.
-- ---------------------------------------------------------------------
create table if not exists bot_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table bot_secrets enable row level security;
revoke all on bot_secrets from anon, authenticated;

-- Generated in the database so it never passes through anyone's chat log
-- or terminal history. Read it once, when wiring the bot.
insert into bot_secrets (key, value)
values ('usage_write_token',
        replace(gen_random_uuid()::text, '-', '') ||
        replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- The one thing the bot may do.
-- ---------------------------------------------------------------------
create or replace function record_ai_usage(
  p_token    text,
  p_spend    numeric,
  p_messages int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
begin
  select value into expected from bot_secrets where key = 'usage_write_token';

  -- Constant-time-ish compare is overkill for a value that is not guessable
  -- in a lifetime; a plain mismatch is enough, and it must fail closed if the
  -- row is missing rather than accepting anything.
  if expected is null or p_token is distinct from expected then
    raise exception 'invalid usage token'
      using errcode = 'insufficient_privilege';
  end if;

  if p_spend < 0 or p_messages < 0 then
    raise exception 'usage cannot be negative';
  end if;

  insert into ai_usage (period_start, spend_usd, messages, estimated)
  values (date_trunc('month', now())::date, p_spend, p_messages, true)
  on conflict (period_start) do update
    set spend_usd  = excluded.spend_usd,
        messages   = excluded.messages,
        estimated  = true,
        updated_at = now();
end;
$$;

-- The function may be called with the publishable key; the token is what
-- authorises it, not the key. It cannot read anything back.
revoke all on function record_ai_usage(text, numeric, int) from public;
grant execute on function record_ai_usage(text, numeric, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Open the current month so the console has a row to show and a ceiling
-- to edit, instead of rendering zeros that look like a broken panel.
-- ---------------------------------------------------------------------
insert into ai_usage (period_start, spend_usd, budget_usd, messages, estimated)
values (date_trunc('month', now())::date, 0, 25, 0, true)
on conflict (period_start) do nothing;
