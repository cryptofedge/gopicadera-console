-- =====================================================================
--  First sign-in: set a real password and a display name.
--
--  Accounts are handed out with a temporary password, which means for a
--  short window somebody other than the owner knows it. This flag is what
--  closes that window: the console will not let an account do anything
--  until the person has set a password of their own.
-- =====================================================================

alter table profiles
  add column if not exists must_change_password boolean not null default false;

-- One function does both halves of first sign-in, deliberately.
--
-- Granting `update` on profiles so a user could set their own name would also
-- let a staff account edit its own `role` and `active` columns -- RLS gates
-- rows, not columns, so a policy for "your own row" is a policy for the whole
-- row. Same trap the products table had.
--
-- This writes two columns on exactly the caller's own row. The id comes from
-- auth.uid(), never from an argument, so it cannot be aimed at anyone else, and
-- `role` and `active` are untouchable through it.
create or replace function complete_first_login(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  clean := btrim(coalesce(p_full_name, ''));

  if length(clean) < 2 then
    raise exception 'name too short';
  end if;
  if length(clean) > 60 then
    raise exception 'name too long';
  end if;

  update profiles
     set full_name            = clean,
         must_change_password = false
   where id = auth.uid();
end;
$$;

revoke all on function complete_first_login(text) from public;
grant execute on function complete_first_login(text) to authenticated;
