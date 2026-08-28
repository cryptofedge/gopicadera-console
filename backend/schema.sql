-- ============================================================================
-- Go Picadera — owner/staff console schema
-- Postgres / Supabase. Run in the SQL editor, or as a migration.
--
-- Design rule throughout: permissions are enforced by Row Level Security, not
-- by the admin UI. A staff account must be unable to change a price even by
-- crafting the request by hand. Hiding a button is not access control.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------- roles ----
create type app_role as enum ('owner', 'staff');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  role        app_role not null default 'staff',
  active      boolean  not null default true,
  created_at  timestamptz not null default now()
);

-- Role is read through these helpers so policies stay readable, and so the
-- role can never be spoofed from client-supplied JWT metadata.
create or replace function is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'owner' and active
  );
$$;

create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active
  );
$$;

-- ------------------------------------------------------------- catalogue ----
create table categories (
  id        uuid primary key default uuid_generate_v4(),
  slug      text unique not null,
  name_es   text not null,
  name_en   text not null,
  sort      int  not null default 0
);

create table products (
  id           uuid primary key default uuid_generate_v4(),
  category_id  uuid references categories on delete restrict,
  slug         text unique not null,
  name         text not null,
  desc_es      text default '',
  desc_en      text default '',
  price        numeric(10,2),          -- null = "Personalizar" / ask in store
  image_path   text,
  available    boolean not null default true,   -- staff may toggle this
  featured     int,                    -- best-seller rank, null = not featured
  sort         int not null default 0,
  updated_at   timestamptz not null default now()
);

create table option_groups (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid references products on delete cascade,
  key         text not null,           -- 'carne', 'sabor', 'sal', 'azucar'
  label_es    text not null,
  label_en    text not null,
  sort        int not null default 0
);

create table option_choices (
  id                uuid primary key default uuid_generate_v4(),
  group_id          uuid references option_groups on delete cascade,
  label_es          text not null,
  label_en          text not null,
  price_delta       numeric(10,2) not null default 0,  -- e.g. extra meat 2.50
  quiet             boolean not null default false,    -- default, omit from ticket
  -- The link that makes a single flavour disappear while the product stays:
  inventory_item_id uuid,
  sort              int not null default 0
);

-- ------------------------------------------------------------- inventory ----
-- Two genuinely different things get counted, so they are typed:
--
--   'product'    finished goods sold as they are -- a bottle of Coca-Cola, a
--                Jarritos Tamarindo, a Presidente. One sale = one unit gone.
--                These map to a product or a single option choice.
--
--   'ingredient' raw materials consumed by recipes -- pernil, green plantains,
--                queso frito, chicken. One sale consumes a per-serving amount,
--                and the same ingredient feeds many dishes: pernil runs out and
--                it must drop off the chimi, patacón, yaroa and tacos at once.
--
-- The console shows these as two tabs because a shift counts them differently:
-- bottles are counted by eye in the cooler, ingredients by weight in the back.
create type inventory_kind as enum ('product', 'ingredient');

create table inventory_items (
  id             uuid primary key default uuid_generate_v4(),
  kind           inventory_kind not null default 'ingredient',
  name           text not null,
  unit           text not null default 'unit',   -- bottle, case, lb, portion
  reorder_level  numeric(10,2) not null default 0,
  track          boolean not null default true,
  -- 'product' rows may point straight at the dish they are, so selling it
  -- depletes one unit without needing a recipe row.
  product_id     uuid,
  created_at     timestamptz not null default now()
);

alter table option_choices
  add constraint option_choices_inventory_fk
  foreign key (inventory_item_id) references inventory_items on delete set null;

alter table inventory_items
  add constraint inventory_product_fk
  foreign key (product_id) references products on delete set null;

-- Append-only ledger. Quantity on hand is derived from this, never edited
-- directly, so a wrong count can be traced rather than silently overwritten.
create table stock_moves (
  id            bigserial primary key,
  item_id       uuid not null references inventory_items on delete cascade,
  delta         numeric(10,2) not null,          -- + received, - used/waste
  reason        text not null,                   -- 'count','delivery','waste','sale'
  order_id      uuid,
  note          text,
  created_by    uuid references profiles,
  created_at    timestamptz not null default now()
);
create index on stock_moves (item_id, created_at desc);

create or replace view inventory_levels as
  select i.id, i.kind, i.name, i.unit, i.reorder_level, i.track,
         coalesce(sum(m.delta), 0)                    as qty,
         coalesce(sum(m.delta), 0) <= i.reorder_level as low,
         coalesce(sum(m.delta), 0) <= 0               as out_of_stock
  from inventory_items i
  left join stock_moves m on m.item_id = i.id
  group by i.id;

-- What a dish consumes. Dishes with no recipe simply aren't auto-depleted.
create table product_ingredients (
  product_id  uuid references products on delete cascade,
  item_id     uuid references inventory_items on delete cascade,
  qty_per     numeric(10,2) not null default 1,
  primary key (product_id, item_id)
);

-- ---------------------------------------------------------------- orders ----
create type order_status as enum ('new','cooking','ready','done','cancelled');
create type order_mode   as enum ('delivery','pickup');
-- Where the order came from. The WhatsApp bot writes rows too, so the console
-- must show one queue regardless of channel -- a ticket is a ticket.
create type order_source as enum ('web','whatsapp','phone','walkin','doordash','ubereats','grubhub');

create table orders (
  id             uuid primary key default uuid_generate_v4(),
  code           text unique not null,            -- short human ref, e.g. GP-1043
  source         order_source not null default 'web',
  customer_name  text,
  phone          text,
  mode           order_mode  not null default 'delivery',
  status         order_status not null default 'new',
  subtotal       numeric(10,2) not null default 0,
  tax            numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  loyalty_code   text,
  note           text,
  created_at     timestamptz not null default now(),
  done_at        timestamptz
);
create index on orders (status, created_at desc);

create table order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references orders on delete cascade,
  product_id  uuid references products on delete set null,
  name        text not null,        -- snapshot: product may later be renamed
  qty         int  not null default 1,
  unit_price  numeric(10,2) not null,  -- SNAPSHOT, never a live lookup
  options     jsonb not null default '[]'::jsonb
);

-- --------------------------------------------------------------- loyalty ----
-- Phone is the identity, not the account. The WhatsApp bot knows the customer's
-- number before they say anything, so stamps can accrue with no sign-up at all
-- -- which removes the one piece of friction that kills most loyalty schemes.
-- user_id stays optional, for anyone who later creates a web account.
create table loyalty_cards (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users on delete cascade,
  phone       text unique,
  stamps      int not null default 0,
  updated_at  timestamptz not null default now()
);

create table loyalty_codes (
  code        text primary key,                 -- GP-XXXXXX
  card_id     uuid references loyalty_cards on delete cascade,
  issued_at   timestamptz not null default now(),
  redeemed_at timestamptz,                      -- non-null = spent, cannot reuse
  redeemed_by uuid references profiles
);

-- -------------------------------------------------------------- settings ----
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_log (
  id          bigserial primary key,
  actor       uuid references profiles,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Staff act on today. Owner changes the business.
-- ============================================================================
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table option_groups       enable row level security;
alter table option_choices      enable row level security;
alter table inventory_items     enable row level security;
alter table stock_moves         enable row level security;
alter table product_ingredients enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table loyalty_cards       enable row level security;
alter table loyalty_codes       enable row level security;
alter table settings            enable row level security;
alter table audit_log           enable row level security;

-- profiles: you may read yourself; only the owner sees or manages the team
create policy profiles_self_read  on profiles for select using (id = auth.uid() or is_owner());
create policy profiles_owner_all  on profiles for all    using (is_owner()) with check (is_owner());

-- catalogue: the public storefront reads it; only the owner writes it
create policy cat_public_read on categories     for select using (true);
create policy cat_owner_write on categories     for all    using (is_owner()) with check (is_owner());
create policy prod_public_read on products      for select using (true);
create policy prod_owner_write on products      for all    using (is_owner()) with check (is_owner());
create policy og_public_read  on option_groups  for select using (true);
create policy og_owner_write  on option_groups  for all    using (is_owner()) with check (is_owner());
create policy oc_public_read  on option_choices for select using (true);
create policy oc_owner_write  on option_choices for all    using (is_owner()) with check (is_owner());

-- The one exception: staff may flip availability, and ONLY availability.
create policy prod_staff_availability on products for update
  using (is_staff()) with check (is_staff());

-- Column grants cannot separate owner from staff here: in Supabase both are the
-- same database role, `authenticated`. An earlier version granted update on
-- only (available), then granted update on the whole table on the next line so
-- owners could edit prices -- which handed that same power to every staff
-- account. RLS gates rows, not columns, so nothing else caught it.
--
-- So: the grant is table-wide, and a trigger is what separates the two.
revoke update on products from authenticated;
grant  update on products to authenticated;

create or replace function guard_product_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_owner() then
    return new;
  end if;

  -- Staff may flip availability and nothing else. Comparing the whole row
  -- rather than naming columns means any column added later is locked down by
  -- default, instead of silently becoming writable by staff.
  if (to_jsonb(new) - 'available' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'available' - 'updated_at') then
    raise exception
      'Solo el dueno puede cambiar esto. El personal solo puede marcar agotado.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_product_writes on products;
create trigger trg_guard_product_writes
  before update on products
  for each row execute function guard_product_writes();

-- inventory: staff count and move stock, owner defines the items
create policy inv_staff_read  on inventory_items for select using (is_staff());
create policy inv_owner_write on inventory_items for all    using (is_owner()) with check (is_owner());
create policy moves_staff_read   on stock_moves for select using (is_staff());
create policy moves_staff_insert on stock_moves for insert with check (is_staff());
create policy moves_owner_all    on stock_moves for all    using (is_owner()) with check (is_owner());
create policy ping_staff_read on product_ingredients for select using (is_staff());
create policy ping_owner_write on product_ingredients for all using (is_owner()) with check (is_owner());

-- The storefront places orders anonymously: insert allowed, read is not. A
-- customer can create a ticket; nobody can browse other people's orders.
create policy orders_public_insert on orders      for insert with check (true);
create policy items_public_insert  on order_items for insert with check (true);

-- orders: any signed-in staff works the queue
create policy orders_staff_read   on orders for select using (is_staff());
create policy orders_staff_update on orders for update using (is_staff()) with check (is_staff());
create policy orders_owner_all    on orders for all    using (is_owner()) with check (is_owner());
create policy items_staff_read    on order_items for select using (is_staff());
create policy items_owner_all     on order_items for all    using (is_owner()) with check (is_owner());

-- loyalty: staff redeem, owner configures
create policy cards_staff_read  on loyalty_cards for select using (is_staff());
create policy codes_staff_read  on loyalty_codes for select using (is_staff());
create policy codes_staff_spend on loyalty_codes for update using (is_staff()) with check (is_staff());
create policy codes_owner_all   on loyalty_codes for all    using (is_owner()) with check (is_owner());

-- settings: storefront reads hours; owner alone writes
create policy set_public_read on settings for select using (true);
create policy set_owner_write on settings for all    using (is_owner()) with check (is_owner());

-- audit: owner reads, nobody edits
create policy audit_owner_read on audit_log for select using (is_owner());

-- ============================================================================
-- Deplete stock when an order is completed -- not when it is placed. Orders get
-- cancelled, and stock moved on a cancelled order is stock the nightly count
-- will disagree with.
-- ============================================================================
create or replace function deplete_on_done() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    -- ingredients: consume the per-serving amount from each dish's recipe
    insert into stock_moves (item_id, delta, reason, order_id, created_by)
    select pi.item_id, -(pi.qty_per * oi.qty), 'sale', new.id, auth.uid()
    from order_items oi
    join product_ingredients pi on pi.product_id = oi.product_id
    join inventory_items ii     on ii.id = pi.item_id and ii.track
    where oi.order_id = new.id;

    -- finished goods: one sale, one unit off the shelf, no recipe needed
    insert into stock_moves (item_id, delta, reason, order_id, created_by)
    select ii.id, -oi.qty, 'sale', new.id, auth.uid()
    from order_items oi
    join inventory_items ii
      on ii.product_id = oi.product_id and ii.kind = 'product' and ii.track
    where oi.order_id = new.id;

    new.done_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_deplete_on_done
  before update on orders
  for each row execute function deplete_on_done();

-- A loyalty code can only be spent once.
create or replace function redeem_code(p_code text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if not is_staff() then raise exception 'not authorised'; end if;
  update loyalty_codes
     set redeemed_at = now(), redeemed_by = auth.uid()
   where code = p_code and redeemed_at is null
  returning true into ok;
  return coalesce(ok, false);
end;
$$;
