-- ============================================================================
-- Atomic order write -- fixes a real bug in the live storefront
--
-- `logOrder()` in redesign/index.html inserts a row into `orders` with
-- `Prefer: return=representation` so it can read back the new row's `id` and
-- use it on the `order_items` insert that follows. But there is deliberately
-- no anonymous SELECT policy on `orders` (see whatsapp_orders.sql) -- and
-- Postgres enforces that against RETURNING too, not just plain SELECT. The
-- result: every anon insert asking for its row back is refused outright, the
-- fetch chain rejects, and the whole thing lands in a `console.warn` nobody
-- is watching. Confirmed live: the same insert with `return=minimal` succeeds
-- (201), with `return=representation` it 403s. Every real order placed on the
-- approved storefront has likely been silently failing to save since the real
-- Supabase keys went live.
--
-- Fix: one security-definer function that writes the order and its items in
-- a single transaction and hands back only the generated code -- nothing
-- reads through anon's own permissions, so the RLS/RETURNING trap never
-- applies. Every writer (web, bot, phone, walk-in) should call this instead
-- of inserting into `orders`/`order_items` directly. It also removes the
-- storefront's ad hoc `"GP-" + Date.now()` code in favor of the one real
-- sequence from whatsapp_orders.sql, so every channel shares one numbering.
--
-- Run after whatsapp_orders.sql.
-- ============================================================================

create or replace function place_order(
  p_source        order_source,
  p_customer_name text,
  p_phone         text,
  p_mode          order_mode,
  p_subtotal      numeric,
  p_tax           numeric,
  p_total         numeric,
  p_loyalty_code  text,
  p_note          text,
  p_items         jsonb   -- [{ name, qty, unit_price, options, product_id? }, ...]
)
returns text  -- the order's assigned code, e.g. 'GP-1044'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_code     text;
  v_item     jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'place_order: at least one item is required';
  end if;

  insert into orders
    (source, customer_name, phone, mode, subtotal, tax, total, loyalty_code, note)
  values
    (p_source, p_customer_name, p_phone, p_mode, p_subtotal, p_tax, p_total, p_loyalty_code, p_note)
  returning id, code into v_order_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into order_items (order_id, product_id, name, qty, unit_price, options)
    values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'name',
      coalesce((v_item->>'qty')::int, 1),
      (v_item->>'unit_price')::numeric,
      coalesce(v_item->'options', '[]'::jsonb)
    );
  end loop;

  return v_code;
end;
$$;

grant execute on function place_order(
  order_source, text, text, order_mode, numeric, numeric, numeric, text, text, jsonb
) to anon, authenticated;
