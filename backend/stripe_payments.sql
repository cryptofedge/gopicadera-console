-- ============================================================================
-- Stripe card payments for website orders (built in TEST MODE first)
--
-- Run after schema.sql, integrations.sql, whatsapp_orders.sql and place_order.sql.
-- Safe to run more than once. See STRIPE.md for the whole flow and the runbook.
--
-- The rule this file exists to enforce: NOTHING THE BROWSER SENDS DECIDES WHAT A
-- CUSTOMER IS CHARGED. The old `place_order` stores whatever prices and totals the
-- storefront posts, which is fine when payment happens at the counter and fatal
-- once a card is charged (a cart could be posted for $0.01). So:
--
--   * `place_card_order`   prices the cart from the menu tables, ignores any client
--                          total, and stamps the order `price_verified`.
--   * `begin_card_checkout` refuses any order that is not `price_verified`, so an
--                          order that came in through the old path can never be charged.
--   * `apply_stripe_event`  marks an order paid only if Stripe's amount equals the
--                          order's total, once per Stripe event.
--
-- The three server-only functions are executable by `service_role` alone; the Edge
-- Functions call them with the service key, never the browser.
-- ============================================================================

-- ---------------------------------------------------------------- columns -----
alter table orders
  add column if not exists price_verified    boolean not null default false,
  add column if not exists stripe_session_id text,
  add column if not exists checkout_attempts int     not null default 0;

-- ------------------------------------------------- audit + replay protection ---
-- One row per Stripe event we have seen. The primary key is what makes a webhook
-- delivered twice harmless, and the outcome column is the trail for "why is this
-- order not marked paid".
create table if not exists stripe_events (
  id          text primary key,              -- Stripe's event id, evt_...
  type        text not null,
  order_code  text,
  outcome     text not null default 'processing',
  detail      text,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
drop policy if exists "owner reads stripe events" on stripe_events;
create policy "owner reads stripe events" on stripe_events for select using (is_owner());

-- ------------------------------------------------------------ price the cart ---
-- Input:  [{ "slug": "pic-small", "qty": 1, "sel": [[1,4,7], 0] }, ...]
--         `sel` is what the storefront already keeps per cart line: one entry per option
--         group, in group order. A single-choice group holds the choice index, a multi-pick
--         group an array of indices, a quantity group a count. The same rules as
--         `unitPrice()` in redesign/index.html.
-- Output: { lines: [...], subtotal, tax, total } computed only from products,
--         option_groups and option_choices. Raises on anything it cannot price.
create or replace function price_cart(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tax        constant numeric := 0.08875;   -- keep in step with TAX in redesign/index.html
  c_max_lines  constant int     := 40;
  c_max_qty    constant int     := 50;
  c_max_total  constant numeric := 2000;      -- bigger orders are catering quotes, not a card checkout
  it        jsonb;
  sel       jsonb;
  prod      products%rowtype;
  grp       option_groups%rowtype;
  ch        option_choices%rowtype;
  v         jsonb;
  e         jsonb;
  qty       int;
  unit      numeric;
  gi        int;
  n         int;
  ngroups   int;
  labels    jsonb;
  counts    jsonb;
  names     text[];
  k         text;
  lines     jsonb := '[]'::jsonb;
  subtotal  numeric := 0;
  tax       numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'price_cart: the cart is empty';
  end if;
  if jsonb_array_length(p_items) > c_max_lines then
    raise exception 'price_cart: too many lines';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'price_cart: bad line'; end if;
    if coalesce(it->>'qty', '') !~ '^[0-9]{1,3}$' then raise exception 'price_cart: bad quantity'; end if;
    qty := (it->>'qty')::int;
    if qty < 1 or qty > c_max_qty then raise exception 'price_cart: quantity out of range'; end if;

    select * into prod from products where slug = it->>'slug' and available;
    if not found then raise exception 'price_cart: unknown or unavailable product %', coalesce(it->>'slug', '(none)'); end if;
    if prod.price is null then raise exception 'price_cart: % is priced in store, it cannot be paid online', prod.slug; end if;

    sel := coalesce(it->'sel', '[]'::jsonb);
    if jsonb_typeof(sel) <> 'array' then raise exception 'price_cart: bad selection'; end if;
    select count(*) into ngroups from option_groups where product_id = prod.id;
    if jsonb_array_length(sel) > ngroups then raise exception 'price_cart: too many selections for %', prod.slug; end if;

    unit := prod.price;
    labels := '[]'::jsonb;
    gi := 0;
    for grp in select * from option_groups where product_id = prod.id order by sort, key loop
      v := sel -> gi;
      if v is not null and jsonb_typeof(v) <> 'null' then
        if grp.qty then
          -- a counted extra, e.g. avocados at a fixed price each
          if jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]{1,2}$' then raise exception 'price_cart: bad count for %', grp.key; end if;
          n := v::text::int;
          if n > 20 then raise exception 'price_cart: bad count for %', grp.key; end if;   -- 20 extras of one thing is not a real order
          unit := unit + n * coalesce(grp.unit_price, 0);
          if n > 0 then
            labels := labels || jsonb_build_array(jsonb_build_object('label',
              n || ' ' || case when n = 1 then coalesce(grp.label_one_es, grp.label_es) else coalesce(grp.label_many_es, grp.label_es) end));
          end if;
        elsif grp.pick is not null then
          -- pick several, repeats allowed (three of the same meat is three surcharges)
          if jsonb_typeof(v) <> 'array' then raise exception 'price_cart: % needs a list of picks', grp.key; end if;
          if jsonb_array_length(v) > grp.pick then raise exception 'price_cart: too many picks for %', grp.key; end if;
          counts := '{}'::jsonb;
          names := array[]::text[];
          for e in select * from jsonb_array_elements(v) loop
            if jsonb_typeof(e) <> 'number' or e::text !~ '^[0-9]{1,2}$' then raise exception 'price_cart: bad pick for %', grp.key; end if;
            select * into ch from option_choices where group_id = grp.id order by sort, id offset (e::text::int) limit 1;
            if not found then raise exception 'price_cart: pick out of range for %', grp.key; end if;
            unit := unit + ch.price_delta;
            k := ch.label_es;
            if counts ? k then
              counts := jsonb_set(counts, array[k], to_jsonb((counts->>k)::int + 1));
            else
              counts := counts || jsonb_build_object(k, 1);
              names := names || k;
            end if;
          end loop;
          if array_length(names, 1) is not null then
            labels := labels || jsonb_build_array(jsonb_build_object('label', (
              select string_agg(case when (counts->>nm)::int > 1 then (counts->>nm) || '× ' || nm else nm end, ' + ' order by ord)
              from unnest(names) with ordinality as t(nm, ord))));
          end if;
        else
          if jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]{1,2}$' then raise exception 'price_cart: bad choice for %', grp.key; end if;
          select * into ch from option_choices where group_id = grp.id order by sort, id offset (v::text::int) limit 1;
          if not found then raise exception 'price_cart: choice out of range for %', grp.key; end if;
          unit := unit + ch.price_delta;
          if not ch.quiet then labels := labels || jsonb_build_array(jsonb_build_object('label', ch.label_es)); end if;
        end if;
      end if;
      gi := gi + 1;
    end loop;

    lines := lines || jsonb_build_array(jsonb_build_object(
      'product_id', prod.id, 'slug', prod.slug, 'name', prod.name,
      'qty', qty, 'unit_price', unit, 'options', labels));
    subtotal := subtotal + unit * qty;
  end loop;

  if subtotal <= 0 then raise exception 'price_cart: nothing to charge'; end if;
  if subtotal > c_max_total then raise exception 'price_cart: order too large for online payment, send it as a catering quote'; end if;
  tax := round(subtotal * c_tax, 2);
  return jsonb_build_object('lines', lines, 'subtotal', subtotal, 'tax', tax, 'total', subtotal + tax);
end;
$$;

-- --------------------------------------------------- the storefront's new door ---
-- Same idea as place_order, but the prices are ours. Only the cart contents come from
-- the browser, and only as product slugs, quantities and option choices.
create or replace function place_card_order(
  p_customer_name text,
  p_phone         text,
  p_mode          order_mode,
  p_loyalty_code  text,
  p_note          text,
  p_items         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  priced jsonb;
  v_id   uuid;
  v_code text;
  l      jsonb;
begin
  priced := price_cart(p_items);

  insert into orders
    (source, customer_name, phone, mode, subtotal, tax, total, loyalty_code, note, price_verified)
  values (
    'web',
    nullif(left(trim(coalesce(p_customer_name, '')), 80), ''),
    nullif(left(trim(coalesce(p_phone, '')), 30), ''),
    coalesce(p_mode, 'pickup'),
    (priced->>'subtotal')::numeric,
    (priced->>'tax')::numeric,
    (priced->>'total')::numeric,
    nullif(left(coalesce(p_loyalty_code, ''), 40), ''),
    nullif(left(coalesce(p_note, ''), 500), ''),
    true)
  returning id, code into v_id, v_code;

  for l in select * from jsonb_array_elements(priced->'lines') loop
    insert into order_items (order_id, product_id, name, qty, unit_price, options)
    values (v_id, (l->>'product_id')::uuid, l->>'name', (l->>'qty')::int, (l->>'unit_price')::numeric, coalesce(l->'options', '[]'::jsonb));
  end loop;

  return jsonb_build_object('code', v_code, 'subtotal', priced->'subtotal', 'tax', priced->'tax', 'total', priced->'total');
end;
$$;

grant execute on function place_card_order(text, text, order_mode, text, text, jsonb) to anon, authenticated;
revoke all on function price_cart(jsonb) from public, anon, authenticated;
-- Otherwise unreachable from outside place_card_order/begin_card_checkout. Granted to service_role too, so
-- an Edge Function can call it directly with an empty cart as a cheap, side-effect-free proof that this
-- migration has been applied (see stripe-status in admin/supabase/functions/_shared/handlers.ts).
grant execute on function price_cart(jsonb) to service_role;

-- ------------------------------------------------ what create-checkout reads ---
-- Everything the Stripe session is built from comes out of this one call, so the
-- Edge Function never has to trust the request body for money.
create or replace function begin_card_checkout(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o          orders%rowtype;
  items      jsonb;
  sum_cents  bigint;
begin
  select * into o from orders where code = p_code for update;
  if not found then raise exception 'checkout: order not found'; end if;
  if o.source <> 'web' then raise exception 'checkout: only website orders can be paid by card'; end if;
  if not o.price_verified then raise exception 'checkout: this order was not priced by the server'; end if;
  if o.payment not in ('unpaid', 'pending') then raise exception 'checkout: order is already %', o.payment; end if;
  if o.status = 'cancelled' then raise exception 'checkout: order was cancelled'; end if;
  if o.created_at < now() - interval '3 hours' then raise exception 'checkout: order is too old, place it again'; end if;
  if o.checkout_attempts >= 5 then raise exception 'checkout: too many attempts'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', oi.name, 'options', oi.options, 'qty', oi.qty, 'unit_cents', round(oi.unit_price * 100)::int)
           order by oi.id), '[]'::jsonb),
         coalesce(sum(round(oi.unit_price * 100) * oi.qty), 0)
    into items, sum_cents
    from order_items oi where oi.order_id = o.id;

  if jsonb_array_length(items) = 0 then raise exception 'checkout: order has no items'; end if;
  if sum_cents <> round(o.subtotal * 100) then raise exception 'checkout: order lines do not add up'; end if;
  if round(o.subtotal * 100) + round(o.tax * 100) <> round(o.total * 100) then raise exception 'checkout: order total does not add up'; end if;

  update orders set checkout_attempts = checkout_attempts + 1 where id = o.id;

  return jsonb_build_object(
    'order_id', o.id, 'code', o.code, 'mode', o.mode, 'phone', o.phone,
    'subtotal_cents', round(o.subtotal * 100)::int,
    'tax_cents',      round(o.tax * 100)::int,
    'total_cents',    round(o.total * 100)::int,
    'attempt',        o.checkout_attempts + 1,
    'items',          items);
end;
$$;

create or replace function attach_checkout_session(p_code text, p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update orders
     set stripe_session_id = p_session_id, payment = 'pending'
   where code = p_code and price_verified and payment in ('unpaid', 'pending');
  if not found then raise exception 'checkout: could not attach the session to %', p_code; end if;
end;
$$;

-- ---------------------------------------------------- what the webhook applies ---
-- Called with the verified event. Returns the outcome so the webhook can log it.
-- Marking paid sets the phone in the same UPDATE so the existing trigger
-- (queue_payment_confirmation) sees it and queues the WhatsApp confirmation, once.
create or replace function apply_stripe_event(p_event_id text, p_type text, p_object jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o         orders%rowtype;
  v_code    text;
  v_outcome text := 'ignored';
  v_detail  text;
begin
  insert into stripe_events (id, type) values (p_event_id, p_type) on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  if p_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    v_code := coalesce(p_object->>'client_reference_id', p_object #>> '{metadata,order_code}');
    select * into o from orders where code = v_code and source = 'web' for update;
    if not found then
      v_outcome := 'unknown_order';
    elsif p_object->>'payment_status' <> 'paid' then
      v_outcome := 'awaiting_payment';
    elsif o.payment = 'paid' then
      v_outcome := 'already_paid';
    elsif o.stripe_session_id is not null and o.stripe_session_id <> coalesce(p_object->>'id', '') then
      v_outcome := 'session_mismatch';
      v_detail := format('order expects %s, event is for %s', o.stripe_session_id, p_object->>'id');
    elsif coalesce((p_object->>'amount_total')::bigint, -1) <> round(o.total * 100)
       or lower(coalesce(p_object->>'currency', '')) <> 'usd' then
      v_outcome := 'amount_mismatch';
      v_detail := format('order is %s cents, Stripe charged %s %s', round(o.total * 100), p_object->>'amount_total', p_object->>'currency');
    else
      update orders
         set payment       = 'paid',
             paid_at       = now(),
             external_id   = p_object->>'payment_intent',
             phone         = coalesce(nullif(phone, ''), nullif(p_object #>> '{customer_details,phone}', '')),
             customer_name = coalesce(nullif(customer_name, ''), nullif(p_object #>> '{customer_details,name}', ''))
       where id = o.id;
      v_outcome := 'paid';
    end if;

  elsif p_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
    v_code := coalesce(p_object->>'client_reference_id', p_object #>> '{metadata,order_code}');
    update orders
       set payment = case when p_type = 'checkout.session.expired' then 'unpaid'::payment_status else 'failed'::payment_status end
     where code = v_code and source = 'web' and payment = 'pending' and stripe_session_id = p_object->>'id'
    returning * into o;
    v_outcome := case when found then (case when p_type = 'checkout.session.expired' then 'expired' else 'failed' end) else 'ignored' end;

  elsif p_type = 'charge.refunded' then
    select * into o from orders where source = 'web' and external_id = p_object->>'payment_intent' for update;
    if not found then
      v_outcome := 'unknown_order';
    elsif coalesce((p_object->>'amount_refunded')::bigint, 0) >= coalesce((p_object->>'amount')::bigint, 1) then
      update orders set payment = 'refunded' where id = o.id;
      v_outcome := 'refunded';
    else
      v_outcome := 'partial_refund';
      v_detail := format('%s of %s cents refunded', p_object->>'amount_refunded', p_object->>'amount');
    end if;
  end if;

  update stripe_events
     set outcome = v_outcome, detail = v_detail, order_code = coalesce(v_code, o.code)
   where id = p_event_id;
  return v_outcome;
end;
$$;

-- server-only: the browser must never be able to call these
revoke all on function begin_card_checkout(text)               from public, anon, authenticated;
revoke all on function attach_checkout_session(text, text)     from public, anon, authenticated;
revoke all on function apply_stripe_event(text, text, jsonb)   from public, anon, authenticated;
grant execute on function begin_card_checkout(text)             to service_role;
grant execute on function attach_checkout_session(text, text)   to service_role;
grant execute on function apply_stripe_event(text, text, jsonb) to service_role;
