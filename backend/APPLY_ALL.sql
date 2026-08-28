-- =====================================================================
--  Go Picadera - full database setup
--  Run this ONCE, in the Supabase SQL Editor, on an empty project.
--  Order matters: schema.sql defines the tables that integrations.sql
--  extends, so this file must be run top to bottom in one go.
-- =====================================================================

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


-- =====================================================================
--  integrations.sql
-- =====================================================================

-- Delivery platform connections, payment confirmation, and the WhatsApp
-- notification that follows it.
--
-- Run after schema.sql.
--
-- Design note on "connecting an account": DoorDash, Uber Eats and Grubhub do
-- not offer a consumer-style OAuth connect. Each requires the restaurant to be
-- approved as an API partner on their merchant portal, which yields a client
-- id / secret / store id. So this table stores those credentials and a status,
-- and the owner pastes them in once each platform approves. Nothing here can
-- shortcut that approval.

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------

create type integration_provider as enum (
  -- delivery marketplaces
  'doordash', 'ubereats', 'grubhub',
  -- messaging
  'whatsapp',
  -- point of sale
  'square', 'clover', 'toast', 'lightspeed'
);

-- Which group a provider belongs to, so the console can render them apart
-- without hardcoding the split in two places.
create type integration_kind as enum ('delivery', 'messaging', 'pos');
create type integration_status   as enum ('disconnected', 'pending', 'connected', 'error');

create table integrations (
  provider      integration_provider primary key,
  kind          integration_kind not null,
  status        integration_status not null default 'disconnected',

  -- The platform's own identifier for this restaurant.
  store_id      text,

  -- Credentials live here rather than in the client. RLS keeps this table
  -- unreadable to staff and to the anonymous role; only an owner can select
  -- it, and even then the UI shows only whether a secret is set, never its
  -- value.
  client_id     text,
  client_secret text,

  -- Set by the receiving webhook, so the console can show "last order 4m ago"
  -- and make a stalled connection obvious.
  last_order_at timestamptz,
  last_error    text,

  auto_accept   boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles
);

alter table integrations enable row level security;

-- Staff need to know whether a channel is live, because "no Uber orders today"
-- and "Uber has been disconnected since Tuesday" look identical on the board.
-- They get status only; the credential columns are filtered out by the view
-- below, which is what the console actually reads.
create view integration_status_view as
  select provider, kind, status, store_id, last_order_at, auto_accept, updated_at
  from integrations;

create policy "staff read integration status"
  on integrations for select
  using (is_staff() and false);   -- staff never read the table directly

create policy "owner reads integrations"
  on integrations for select using (is_owner());

create policy "owner writes integrations"
  on integrations for all using (is_owner()) with check (is_owner());

-- ---------------------------------------------------------------------------
-- Payment confirmation
-- ---------------------------------------------------------------------------

create type payment_status as enum ('unpaid', 'pending', 'paid', 'refunded', 'failed');

alter table orders
  add column payment  payment_status not null default 'unpaid',
  add column paid_at  timestamptz,
  -- The platform's order id. Unique so a webhook delivered twice - which every
  -- one of these platforms will do - cannot create a duplicate ticket.
  add column external_id text,
  -- Stamped once the WhatsApp confirmation goes out, so a retried webhook or a
  -- second status update never messages the customer twice.
  add column notified_at timestamptz;

create unique index orders_external_id_key
  on orders (source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- Notify on payment
-- ---------------------------------------------------------------------------

-- Queue rather than direct send: a trigger cannot make an outbound HTTP call
-- reliably, and a failed send must never roll back a confirmed payment. The
-- bot drains this table.
create table whatsapp_outbox (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references orders on delete cascade,
  phone       text not null,
  body        text not null,
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now()
);

alter table whatsapp_outbox enable row level security;
create policy "staff read outbox" on whatsapp_outbox for select using (is_staff());

create or replace function queue_payment_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lines text;
  wa    text;
begin
  -- Only on the transition into paid, and only once.
  if new.payment is distinct from 'paid' then return new; end if;
  if old.payment = 'paid' then return new; end if;
  if new.notified_at is not null then return new; end if;
  if new.phone is null or new.phone = '' then return new; end if;

  select string_agg(format('• %s× %s', oi.qty, oi.name), E'\n' order by oi.name)
    into lines
  from order_items oi
  where oi.order_id = new.id;

  select value #>> '{}' into wa from settings where key = 'whatsapp';

  insert into whatsapp_outbox (order_id, phone, body)
  values (
    new.id,
    new.phone,
    format(
      E'Go Picadera — pago confirmado ✅\n\nPedido %s\n%s\n\nTotal: $%s\n\n%s',
      new.code,
      coalesce(lines, '—'),
      to_char(new.total, 'FM999999990.00'),
      case new.mode
        when 'delivery' then 'Vamos en camino. Te avisamos cuando salga.'
        else 'Te avisamos cuando esté listo para recoger.'
      end
    )
  );

  new.notified_at := now();
  if new.paid_at is null then new.paid_at := now(); end if;
  return new;
end;
$$;

create trigger orders_notify_on_paid
  before update of payment on orders
  for each row execute function queue_payment_confirmation();

-- Seed a row per provider so the console has something to render.
insert into integrations (provider, kind) values
  ('doordash',   'delivery'),
  ('ubereats',   'delivery'),
  ('grubhub',    'delivery'),
  ('whatsapp',   'messaging'),
  ('square',     'pos'),
  ('clover',     'pos'),
  ('toast',      'pos'),
  ('lightspeed', 'pos')
on conflict (provider) do nothing;

-- Only one POS can be authoritative: two systems both claiming to own prices
-- would fight, and the losing one would silently overwrite the other.
create unique index one_connected_pos
  on integrations ((kind))
  where kind = 'pos' and status = 'connected';

-- ---------------------------------------------------------------------------
-- Who handled the order
-- ---------------------------------------------------------------------------

alter table orders
  -- Who entered it. Null for anything that arrived from the web, WhatsApp or a
  -- delivery marketplace — nobody took those.
  add column taken_by       uuid references profiles on delete set null,
  -- Who last moved it along the board.
  add column handled_by     uuid references profiles on delete set null,
  -- Snapshots of the names, for the same reason order_items keeps unit_price:
  -- the record has to keep meaning after the person is gone. The Equipo screen
  -- already tells owners that deactivating someone leaves their name on past
  -- orders, and `on delete set null` above would otherwise make that a lie.
  add column taken_by_name  text,
  add column handled_by_name text;

-- Stamp whoever moved the ticket, rather than trusting the client to send it.
-- A staff member could otherwise attribute their work to someone else.
create or replace function stamp_handler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.handled_by := auth.uid();
    select full_name into new.handled_by_name from profiles where id = auth.uid();
  end if;
  return new;
end;
$$;

create trigger orders_stamp_handler
  before update of status on orders
  for each row execute function stamp_handler();

-- Same on the way in, for tickets typed at the counter.
create or replace function stamp_taker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.taken_by := auth.uid();
    select full_name into new.taken_by_name from profiles where id = auth.uid();
  end if;
  return new;
end;
$$;

create trigger orders_stamp_taker
  before insert on orders
  for each row execute function stamp_taker();

-- ---------------------------------------------------------------------------
-- Advertising channels
-- ---------------------------------------------------------------------------

alter type integration_kind add value 'ads';
alter type integration_provider add value 'google_ads';
alter type integration_provider add value 'meta_ads';
alter type integration_provider add value 'tiktok_ads';

insert into integrations (provider, kind) values
  ('google_ads', 'ads'), ('meta_ads', 'ads'), ('tiktok_ads', 'ads')
on conflict (provider) do nothing;

create type campaign_status as enum ('draft', 'scheduled', 'active', 'paused', 'ended');

create table campaigns (
  id            uuid primary key default uuid_generate_v4(),
  provider      integration_provider not null,
  name          text not null,
  status        campaign_status not null default 'draft',

  -- What the bot wrote. Kept so the owner can read it before it runs, and so a
  -- campaign that did well can be repeated.
  headline      text,
  body          text,
  image_url     text,

  daily_budget  numeric(10,2) not null default 0,
  spend         numeric(10,2) not null default 0,
  impressions   int not null default 0,
  clicks        int not null default 0,
  -- Orders the platform attributed to this campaign. Their number, not ours;
  -- every platform counts conversions differently and generously.
  orders        int not null default 0,

  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid references profiles on delete set null,
  created_at    timestamptz not null default now()
);

alter table campaigns enable row level security;

-- Staff can look but not touch. Knowing a promo is running explains a sudden
-- rush; being able to start one does not belong to a shift.
create policy "staff read campaigns"  on campaigns for select using (is_staff());
create policy "owner writes campaigns" on campaigns for all
  using (is_owner()) with check (is_owner());

-- ---------------------------------------------------------------------------
-- Assistant credit
-- ---------------------------------------------------------------------------

-- What the WhatsApp bot and the promo writer cost to run.
--
-- IMPORTANT: this table is written by the BOT, server-side, never by the
-- console. Anthropic's usage figures require an admin key, and this console is
-- a static site with no server — a key placed here would be readable by anyone
-- who opened the page. The bot holds the key, calls the cost report on a
-- schedule, and writes the result here. The console only ever reads a number.
--
-- Note also that Anthropic reports spend, not a remaining balance. So the
-- budget below is the owner's own ceiling, and "left" is measured against it.
create table ai_usage (
  period_start  date primary key,
  spend_usd     numeric(10,2) not null default 0,
  budget_usd    numeric(10,2) not null default 0,
  messages      int not null default 0,
  updated_at    timestamptz not null default now()
);

alter table ai_usage enable row level security;
create policy "owner reads ai usage"  on ai_usage for select using (is_owner());
create policy "owner sets ai budget"  on ai_usage for update
  using (is_owner()) with check (is_owner());

-- ---------------------------------------------------------------------------
-- Running a campaign from the console
-- ---------------------------------------------------------------------------

-- The console cannot talk to Meta, Google or TikTok itself. It is a static
-- site: there is no server to hold an ad account token, and a token shipped to
-- the browser is a token given away. Their APIs also refuse cross-origin calls
-- from a page.
--
-- So pressing Activar does not publish. It records the intent, and the bot -
-- which already holds the credentials for the WhatsApp side - picks the job up,
-- calls the platform, and writes back what happened. Same shape as
-- whatsapp_outbox, for the same reason: the thing that can fail is kept
-- separate from the thing that must not.

alter type campaign_status add value 'publishing';
alter type campaign_status add value 'failed';

alter table campaigns
  -- The platform's own id once it exists, so later calls address the right ad.
  add column external_id text,
  add column last_error  text,
  add column synced_at   timestamptz;

create type campaign_action as enum ('launch', 'pause', 'resume', 'end', 'sync');

create table campaign_jobs (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns on delete cascade,
  action      campaign_action not null,
  requested_by uuid references profiles on delete set null,
  attempts    int not null default 0,
  last_error  text,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index campaign_jobs_pending on campaign_jobs (created_at) where done_at is null;

alter table campaign_jobs enable row level security;
create policy "staff read campaign jobs" on campaign_jobs for select using (is_staff());
create policy "owner queues campaign jobs" on campaign_jobs for insert
  with check (is_owner());

-- Queue the work whenever the owner moves a campaign, rather than trusting the
-- client to insert the job. A dropped connection between the two writes would
-- otherwise leave a campaign that says "active" while nothing was ever
-- published.
create or replace function queue_campaign_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act campaign_action;
begin
  if new.status is not distinct from old.status then return new; end if;

  act := case new.status
    when 'publishing' then 'launch'
    when 'paused'     then 'pause'
    when 'active'     then case when old.status = 'paused' then 'resume' else 'launch' end
    when 'ended'      then 'end'
    else null
  end;

  if act is null then return new; end if;

  -- Nothing to pause or end on the platform if it was never published.
  if act in ('pause', 'resume', 'end') and new.external_id is null then
    return new;
  end if;

  insert into campaign_jobs (campaign_id, action, requested_by)
  values (new.id, act, auth.uid());

  return new;
end;
$$;

create trigger campaigns_queue_job
  after update of status on campaigns
  for each row execute function queue_campaign_job();

-- ---------------------------------------------------------------------------
-- Dish photos
-- ---------------------------------------------------------------------------

-- The console uploads straight from the browser to Storage. There is no server
-- to proxy through, so the bucket's own policies are the access control: anyone
-- may read a dish photo (the storefront shows them to the public), only an
-- owner may add or replace one.
insert into storage.buckets (id, name, public)
values ('dishes', 'dishes', true)
on conflict (id) do nothing;

create policy "dish photos are public"
  on storage.objects for select
  using (bucket_id = 'dishes');

create policy "owner uploads dish photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dishes' and is_owner());

create policy "owner replaces dish photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'dishes' and is_owner());

create policy "owner deletes dish photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dishes' and is_owner());

-- Staff may still flip a dish sold out; everything else about a product is the
-- owner's. Spelled out here because the menu editor now writes far more than
-- the availability toggle it started as.
drop policy if exists "staff toggles availability" on products;
create policy "staff toggles availability"
  on products for update to authenticated
  using (is_staff()) with check (is_staff());

create policy "owner edits products"
  on products for all to authenticated
  using (is_owner()) with check (is_owner());

alter table option_groups  enable row level security;
alter table option_choices enable row level security;

create policy "anyone reads option groups"  on option_groups  for select using (true);
create policy "anyone reads option choices" on option_choices for select using (true);
create policy "owner edits option groups"   on option_groups  for all
  using (is_owner()) with check (is_owner());
create policy "owner edits option choices"  on option_choices for all
  using (is_owner()) with check (is_owner());

-- ---------------------------------------------------------------------------
-- What the storefront is allowed to know about stock
-- ---------------------------------------------------------------------------

-- The public site reads this and nothing else. It exposes exactly one fact per
-- row -- "this thing is out" -- and never quantities, costs, reorder levels or
-- supplier names. A customer has no business knowing there are two pernils
-- left, and the anon key that reads this ships inside the page.
--
-- Three kinds of row, because the storefront has three kinds of thing to grey
-- out:
--   product  key = slug              a whole dish
--   choice   key = 'group|label'     one flavour inside a dish's options
--   addon    key = inventory name    a standalone extra, e.g. Aguacate
create or replace view public_stock as
  -- whole dishes: either switched off by staff, or their own stock ran out
  select 'product'::text as kind,
         p.slug          as key,
         (not p.available) or coalesce(l.out_of_stock, false) as out_of_stock
  from products p
  left join inventory_items i on i.product_id = p.id
  left join inventory_levels l on l.id = i.id

  union all

  -- one flavour of a drink, without taking the drink off the menu
  select 'choice',
         g.key || '|' || c.label_es,
         coalesce(l.out_of_stock, false)
  from option_choices c
  join option_groups g on g.id = c.group_id
  left join inventory_levels l on l.id = c.inventory_item_id
  where c.inventory_item_id is not null

  union all

  -- extras the storefront offers on every dish rather than per product
  select 'addon', l.name, l.out_of_stock
  from inventory_levels l
  where l.kind = 'ingredient' and l.track;

-- Deliberately owner-run: the storefront must see what is sold out without
-- holding read rights on products or inventory. It exposes a slug and a
-- boolean, nothing countable.
alter view public_stock set (security_invoker = off);
grant select on public_stock to anon, authenticated;

-- The other two views are owner-run as well, which means they do NOT apply the
-- row policies of the tables underneath them. Supabase grants select on new
-- objects in `public` to anon by default, and the console is a public repo
-- whose anon key ships inside the JavaScript -- so without these revokes,
-- anyone who opens devtools can read exact stock counts, and which delivery
-- platforms are connected along with their store ids.
--
-- Staff and owners reach these while signed in, as `authenticated`.
revoke all on inventory_levels        from anon;
revoke all on integration_status_view from anon;

-- Worth pairing with: turn off self-signup in Supabase Auth. `authenticated`
-- means anyone holding a valid JWT, so open signup would let a stranger mint
-- an account and read everything staff can.
