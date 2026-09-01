-- =====================================================================
--  Owner accounts for Llulisa and Richard.
--
--  RUN THIS *AFTER* creating the two users in the Supabase dashboard
--  (Authentication -> Users -> Add user). This script does not create
--  logins -- it grants the accounts owner rights and marks them as
--  needing a real password.
--
--  Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The first-login gate.
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists must_change_password boolean not null default false;

-- Clearing the flag is a function, not an update policy. Granting `update` on
-- profiles so someone could clear one boolean would also let a staff account
-- edit its own `role` and `active` -- RLS gates rows, not columns, so "your own
-- row" means the whole row. This touches one column on auth.uid()'s own row and
-- cannot be aimed at anybody else.
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


-- ---------------------------------------------------------------------
-- 2. Make the two accounts owners, and require a password change.
--
--    Matched by email so nobody has to copy user ids around. If an email
--    below has no account yet, that line simply does nothing -- create the
--    user first, then re-run.
--
--    >>> REPLACE Richard's email before running. <<<
-- ---------------------------------------------------------------------
insert into profiles (id, full_name, role, active, must_change_password)
select u.id, 'Llulisa', 'owner', true, true
  from auth.users u
 where lower(u.email) = lower('Llulizag@gmail.com')
on conflict (id) do update
  set full_name            = excluded.full_name,
      role                 = 'owner',
      active               = true,
      must_change_password = true;

insert into profiles (id, full_name, role, active, must_change_password)
select u.id, 'Richard', 'owner', true, true
  from auth.users u
 where lower(u.email) = lower('RICHARD-EMAIL-HERE@example.com')
on conflict (id) do update
  set full_name            = excluded.full_name,
      role                 = 'owner',
      active               = true,
      must_change_password = true;


-- ---------------------------------------------------------------------
-- 3. Check what landed. Both rows should say owner / true / true.
-- ---------------------------------------------------------------------
select u.email,
       p.full_name,
       p.role,
       p.active,
       p.must_change_password
  from profiles p
  join auth.users u on u.id = p.id
 order by u.email;
