-- ============================================================================
-- What a browser may write to orders, loyalty codes and integrations.
--
-- Run after schema.sql, integrations.sql, stripe_payments.sql and ads_oauth.sql.
-- Safe to run more than once.
--
-- The holes this closes, all of them reachable with nothing more than the anon
-- key that ships inside the storefront and the console:
--
--   * `orders_public_insert` / `items_public_insert` check nothing, so anyone
--     could insert an order already marked paid, done, or `price_verified` --
--     the flag begin_card_checkout trusts to mean "priced by the server" -- and
--     then pay a few cents for it. Or add items to somebody's paid order.
--   * `orders_staff_update` covers every column, so a staff session could
--     rewrite a total or mark an order paid. `codes_staff_spend` likewise let
--     staff un-spend a loyalty code and use it again.
--   * The owner policy on `integrations` returned every column to the owner's
--     browser, access tokens and the TikTok refresh token included.
--
-- Same approach as guard_product_writes in schema.sql: RLS decides which rows,
-- a trigger decides which columns. Rejected writes surface in the console as an
-- error from Postgres, never as a silent success.
-- ============================================================================

-- ------------------------------------------------------------ who is asking ---
-- A request from a browser runs as `anon` or `authenticated`. The bot and the
-- Edge Functions run as `service_role`, and the SECURITY DEFINER functions
-- (place_card_order, apply_stripe_event, redeem_code, the stamping triggers) run
-- as their owner. Only the browser is guarded: the server-side paths are
-- already narrow, and they are where "paid" and "verified" legitimately get set.
--
-- This only means something when called from SECURITY INVOKER code -- inside a
-- definer function current_user is the function's owner, which is the point.
-- The guard functions below are invoker for that reason.
create or replace function is_client_request() returns boolean
  language sql stable set search_path = public as $$
  select current_user in ('anon', 'authenticated');
$$;

-- ------------------------------------------------------------------ orders ---
create or replace function guard_order_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not is_client_request() or is_owner() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A browser creates a ticket that is new, unpaid and unverified; whatever
    -- the server or the kitchen decides later is reset rather than refused. The
    -- WhatsApp bot writes orders with this same public key (see
    -- whatsapp_orders.sql), and a refused insert there is a lost order.
    -- jsonb_populate_record skips keys the table does not have, so this works
    -- before stripe_payments.sql too.
    new := jsonb_populate_record(new, jsonb_build_object(
      'status',            'new',
      'payment',           'unpaid',
      'paid_at',           null,
      'notified_at',       null,
      'done_at',           null,
      -- Deduplicates platform webhooks, so a forged one could block the real
      -- DoorDash or Uber order from ever arriving.
      'external_id',       null,
      -- Stamped by stamp_taker / stamp_handler, never taken from the client.
      'taken_by',          null,
      'taken_by_name',     null,
      'handled_by',        null,
      'handled_by_name',   null,
      'price_verified',    false,
      'stripe_session_id', null,
      'checkout_attempts', 0
    ));
    return new;
  end if;

  -- Staff move a ticket along the board and change nothing else. Comparing the
  -- whole row, as guard_product_writes does, means a column added later is
  -- locked down by default.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception
      'Solo el dueno puede cambiar esto. El personal solo puede mover el pedido.'
      using errcode = 'check_violation';
  end if;

  -- A closed ticket stays closed. Done has already taken its stock off the
  -- shelf (deplete_on_done), and reopening it would take it off a second time.
  if old.status in ('done', 'cancelled') and new.status is distinct from old.status then
    raise exception
      'Este pedido ya esta cerrado. Solo el dueno puede reabrirlo.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Named to sort first. Postgres fires BEFORE row triggers in name order, and
-- this one has to see exactly what the client sent -- before
-- orders_stamp_taker, orders_stamp_handler and trg_deplete_on_done add theirs.
drop trigger if exists orders_00_guard_writes on orders;
create trigger orders_00_guard_writes
  before insert or update on orders
  for each row execute function guard_order_writes();

-- ------------------------------------------------------------- order items ---
-- A browser may add a line only while its order is still being placed: new,
-- unpaid, unverified, and minutes old. Security definer because anon cannot
-- read orders; it answers yes or no about an id the caller already holds.
create or replace function order_open_for_items(p_order_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders o
     where o.id = p_order_id
       and o.status = 'new'
       and o.payment = 'unpaid'
       and not coalesce((to_jsonb(o) ->> 'price_verified')::boolean, false)
       and o.created_at > now() - interval '10 minutes'
  );
$$;

create or replace function guard_order_item_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not is_client_request() or is_owner() then
    return new;
  end if;

  if not order_open_for_items(new.order_id) then
    raise exception
      'Este pedido ya no admite cambios.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Insert only: outside the owner, nobody has an update or delete policy here.
drop trigger if exists order_items_00_guard_writes on order_items;
create trigger order_items_00_guard_writes
  before insert on order_items
  for each row execute function guard_order_item_writes();

-- ----------------------------------------------------------- loyalty codes ---
-- Staff spend a code. They never un-spend one, or change what it is worth.
create or replace function guard_loyalty_code_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not is_client_request() or is_owner() then
    return new;
  end if;

  if old.redeemed_at is not null then
    raise exception
      'Este codigo ya se uso.'
      using errcode = 'check_violation';
  end if;

  if (to_jsonb(new) - 'redeemed_at' - 'redeemed_by')
     is distinct from
     (to_jsonb(old) - 'redeemed_at' - 'redeemed_by') then
    raise exception
      'El personal solo puede canjear el codigo.'
      using errcode = 'check_violation';
  end if;

  -- When and by whom come from the server, the same as redeem_code().
  if new.redeemed_at is not null then
    new.redeemed_at := now();
    new.redeemed_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists loyalty_codes_00_guard_writes on loyalty_codes;
create trigger loyalty_codes_00_guard_writes
  before update on loyalty_codes
  for each row execute function guard_loyalty_code_writes();

-- ------------------------------------------- credentials stay in the database ---
-- RLS gates rows, not columns, so "owner reads integrations" handed the owner's
-- browser every column -- tokens included. The Canales page never displays
-- them, but anything running in that page, or anyone holding an owner session,
-- could read them. Column grants close that for everyone at once: owner and
-- staff are the same database role (`authenticated`), and no browser needs a
-- token's value. The Edge Functions and the bot use service_role.
--
-- The grant names what is readable rather than what is hidden, so a column
-- added later stays unreadable until someone decides otherwise. That includes
-- `refresh_token`, added by ads_oauth.sql.

-- What the Canales page reads instead of the secret itself.
alter table integrations
  add column if not exists has_secret boolean
  generated always as (client_secret is not null) stored;

-- Revoking the table privilege also drops any column grants, so a re-run starts
-- clean and lands on exactly this list.
revoke select on integrations from anon, authenticated;
grant select (provider, kind, status, store_id, client_id, has_secret, details,
              last_order_at, last_error, auto_accept, updated_at, updated_by)
  on integrations to authenticated;

-- A disconnected channel holds no credentials. Done here rather than trusting
-- the console to send every column: the console's Desconectar cleared
-- client_secret and left TikTok's refresh token behind.
create or replace function clear_integration_credentials()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'disconnected' then
    -- details describe the old login (its Pages, its expiry), so they go too.
    new := jsonb_populate_record(new, '{"client_secret": null, "refresh_token": null, "details": {}}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists integrations_clear_on_disconnect on integrations;
create trigger integrations_clear_on_disconnect
  before update on integrations
  for each row execute function clear_integration_credentials();

-- ------------------------------------------------------------- self-check ---
-- The guards rely on firing before any other BEFORE trigger. The live database
-- may hold triggers this repo does not know about, so say so if one sorts
-- ahead of them. (trg_assign_order_code from whatsapp_orders.sql sorts after,
-- and only fills in a missing code.)
do $$
declare
  t record;
begin
  for t in
    select c.relname, g.tgname
      from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
     where c.relname in ('orders', 'order_items', 'loyalty_codes')
       and not g.tgisinternal
       and (g.tgtype & 2) <> 0                          -- BEFORE
       and g.tgname::text collate "C" < (c.relname || '_00_guard_writes') collate "C"
  loop
    raise warning 'BEFORE trigger % on % fires ahead of %_00_guard_writes; if it changes columns, staff writes may be refused',
      t.tgname, t.relname, t.relname;
  end loop;
end;
$$;
