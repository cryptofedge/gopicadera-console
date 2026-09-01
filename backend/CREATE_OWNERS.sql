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

-- One function does both halves of first sign-in: set the display name and
-- clear the flag. It is a function rather than an update policy because
-- granting `update` on profiles would also let a staff account edit its own
-- `role` and `active` -- RLS gates rows, not columns, so "your own row" means
-- the whole row. This writes two columns on auth.uid()'s own row and cannot be
-- aimed at anybody else; role and active stay untouchable through it.
--
-- The login username stays the email address. Changing that in Supabase sends
-- a confirmation link to the NEW address, so a typo at first sign-in locks the
-- account out -- not something to hand someone on day one.
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


-- ---------------------------------------------------------------------
-- 2. Make the two accounts owners, and require a password change.
--
--    Matched by email so nobody has to copy user ids around. If an email
--    below has no account yet, that line simply does nothing -- create the
--    user first, then re-run.
--
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
 where lower(u.email) = lower('Richardautogroup19@gmail.com')
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
