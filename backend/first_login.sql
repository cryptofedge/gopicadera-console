-- =====================================================================
--  Force a password change on first sign-in.
--
--  Accounts are handed out with a temporary password, which means for a
--  short window somebody other than the owner knows it. This flag is what
--  closes that window: the console will not let an account do anything
--  until the person has set a password of their own.
-- =====================================================================

alter table profiles
  add column if not exists must_change_password boolean not null default false;

-- Clearing the flag is deliberately a function rather than an update policy.
--
-- Granting `update` on profiles so a user can clear one boolean would also let
-- a staff account edit its own `role` and `active` columns -- RLS gates rows,
-- not columns, so a policy permitting "your own row" permits the whole row.
-- Same trap as the products table.
--
-- This touches exactly one column on exactly the caller's own row, and cannot
-- be pointed at anyone else: the id comes from auth.uid(), never from an
-- argument.
create or replace function clear_password_change_flag()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  update profiles
     set must_change_password = false
   where id = auth.uid();
end;
$$;

revoke all on function clear_password_change_flag() from public;
grant execute on function clear_password_change_flag() to authenticated;
