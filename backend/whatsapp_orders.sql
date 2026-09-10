-- ============================================================================
-- WhatsApp → website order handoff
--
-- The bot takes an order conversationally, on the same number customers
-- already text. This closes the loop: it writes the order to the same
-- database the console reads (via the same public, insert-only key the
-- storefront already uses -- `orders_public_insert` / `items_public_insert`
-- in schema.sql), then a link sends the customer to the website to review
-- and pay for that one order.
--
-- Two real gaps stood in the way, and this fixes both:
--   1. `orders.code` is `not null` with nothing that ever generates one.
--   2. There is deliberately no way for a customer to read an order back --
--      not even their own. That was correct as far as it went (nobody
--      should be able to browse the table), but it also means nobody could
--      ever land on a page and see "here is your order."
--
-- Run after schema.sql and integrations.sql.
-- ============================================================================

-- ---------------------------------------------------------------- order codes ----
-- Every writer needs a code -- web, bot, phone, walk-in -- and none of them
-- has ever had a way to make one. A sequence, not a random string: staff read
-- these off a board, and "GP-1043" has to mean something at a glance the way
-- a UUID never would.
create sequence if not exists order_code_seq start 1000;

create or replace function assign_order_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'GP-' || nextval('order_code_seq')::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_order_code on orders;
create trigger trg_assign_order_code
  before insert on orders
  for each row execute function assign_order_code();

-- ---------------------------------------------------------------- reading your own order ----
-- Deliberately NOT a select policy on `orders`. A policy would let anyone who
-- guesses or increments a code read that row, and "GP-1043" is a plain
-- sequence -- trivial to walk in either direction. This function requires the
-- code AND the exact phone number the order was placed under. Only the bot
-- (which already holds both) and the one customer it told the code to will
-- ever hold that pair together. Same rule the bot already applies everywhere
-- else tonight: identity is the number, never a claim made in a message.
--
-- Returns jsonb built by hand, not `select *` -- so a column added to orders
-- later (taken_by, external_id, loyalty_code, ...) is invisible here by
-- default instead of leaking the moment someone adds one.
create or replace function get_order_by_code(p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'code',          o.code,
    'status',        o.status,
    'mode',          o.mode,
    'payment',       o.payment,
    'customer_name', o.customer_name,
    'subtotal',      o.subtotal,
    'tax',           o.tax,
    'total',         o.total,
    'note',          o.note,
    'created_at',    o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',       oi.name,
        'qty',        oi.qty,
        'unit_price', oi.unit_price,
        'options',    oi.options
      ) order by oi.id)
      from order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into result
  from orders o
  where o.code = p_code
    and o.phone = p_phone;

  return result;  -- null on any mismatch. The response never distinguishes
                   -- "wrong code" from "wrong phone" from "no such order", so
                   -- neither half can be brute-forced independently of the
                   -- other.
end;
$$;

-- Security-definer functions run as their owner regardless of the caller's
-- own row permissions, so this grant -- not a table grant -- is what opens
-- the door, and it opens only this one door.
grant execute on function get_order_by_code(text, text) to anon, authenticated;
