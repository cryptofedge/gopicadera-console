# Go Picadera — backend plan

Owner and staff console for the restaurant. Drafted 2026-08-16.

## Stack

**Supabase** (Postgres + Auth + Storage + Row Level Security) with a **Next.js**
admin app.

Reasons, not defaults:

- Their existing site already runs on Supabase, and the product catalogue with
  its images is already there. A second database would mean two sources of truth
  for prices — exactly the bug that had the chimi showing `$0` on one page and
  `$10.99` on another.
- Roles enforced in **RLS**, not in the UI. A staff account must be unable to
  change a price even if they open the network tab and craft the request
  themselves. Hiding a button is not access control.
- Storage handles dish photos, so uploading a new one is a normal part of
  editing a dish rather than a developer task.

## Roles

Two roles, as requested. Owner is a superset of staff.

| Capability | Staff | Owner |
|---|:--:|:--:|
| See live incoming orders | ✅ | ✅ |
| Advance order status (new → cooking → ready → done) | ✅ | ✅ |
| Mark a dish sold out / back in stock | ✅ | ✅ |
| **Count stock in / out, adjust quantities** | ✅ | ✅ |
| **See low-stock and out-of-stock alerts** | ✅ | ✅ |
| Redeem a loyalty code | ✅ | ✅ |
| See today's order list | ✅ | ✅ |
| **Add / remove inventory items, set reorder levels** | ❌ | ✅ |
| **See stock value and usage reports** | ❌ | ✅ |
| Edit dish name, description, options | ❌ | ✅ |
| Change **prices** | ❌ | ✅ |
| Add / remove dishes and categories | ❌ | ✅ |
| Upload or replace dish photos | ❌ | ✅ |
| Edit opening hours | ❌ | ✅ |
| Create / disable staff accounts | ❌ | ✅ |
| Issue discounts, configure loyalty | ❌ | ✅ |
| See revenue and reports | ❌ | ✅ |
| Edit site settings, delivery links | ❌ | ✅ |

The split follows one rule: **staff can act on today, owner can change the
business.** Anything that alters money, the menu, or who has access is owner
only. Everything a shift needs to run is staff.

### Deliberately staff-allowed

"Sold out" is a staff power even though it touches the menu. If the kitchen runs
out of pernil at 7pm, they must be able to stop new orders for it immediately
without calling the owner. It is reversible and affects only availability, never
price.

## Tables

- `profiles` — one row per auth user, holds `role` ('owner' | 'staff') and
  `active`. Role lives here, never in client-editable metadata.
- `categories` — slug, name_es, name_en, sort order.
- `products` — the 42 dishes: names, description es/en, price, category,
  photo path, `available`, sort order.
- `option_groups` / `option_choices` — the dropdowns (meat, side, salt, sugar,
  flavour), with optional `price_delta` for surcharges like extra meat.
- `orders` — customer name/phone, mode (delivery | pickup), status, totals,
  loyalty code used, timestamps.
- `order_items` — product, quantity, unit price **captured at order time**, plus
  the chosen options as JSON.
- `loyalty_cards` / `loyalty_codes` — stamps per customer, issued codes, and
  crucially `redeemed_at` so a code cannot be used twice.
- `settings` — opening hours, delivery links, tax rate, free-delivery rule.
- `audit_log` — who changed what and when. Small table, saves arguments later.

## Inventory

- `inventory_items` — the things actually counted: a case of Coca-Cola, a box of
  Jarritos Tamarindo, pernil, green plantains. Holds `qty`, `unit`
  ('bottle', 'lb', 'case'), `reorder_level`, and `track` on/off.
- `stock_moves` — an append-only ledger: every count, delivery, waste entry and
  sale writes a row with who and why. Quantity is **derived from the ledger**,
  never edited directly, so a wrong number can always be traced instead of
  silently overwritten.

### Linking stock to the menu — the part that matters

Stock attaches to **two** different things, and this is the whole design:

- **Products** — a dish runs out (no more tres leche).
- **Option choices** — a *flavour* runs out while the product is fine. Refresco
  is in stock; Sprite is not.

That second case is the reason inventory was asked for. `option_choices` gets a
nullable `inventory_item_id`, and when that item hits zero the choice disappears
from the storefront dropdown while every other flavour stays. Without it, the
only options are listing sodas they don't have or pulling Refresco entirely.

Same mechanism covers the six Country Club and eight Jarritos flavours, and the
meat choices — if pernil is out, it drops off the chimi, patacón, yaroa and taco
dropdowns at once, because they all point at the same inventory item.

### Depletion

When an order is marked **done**, a trigger writes negative `stock_moves` for
every tracked item in it. Not at order placement — orders get cancelled, and
stock that moves on a cancelled order is stock the count will disagree with by
the end of the night.

Dishes are linked to what they consume through `product_ingredients`
(product → inventory item → quantity per serving). For drinks that is one
bottle. For a Picadera Large it is a list, and the client will need to tell us
the quantities. Anything without a recipe simply isn't depleted automatically
and stays on manual count.

### One rule worth stating

`order_items.unit_price` is a **copy** of the price at the moment of ordering,
not a lookup. If the owner raises the chimi to $12.99 tomorrow, last week's
orders must still read $11.99. Reports built on live prices are wrong reports.

## Decisions taken 2026-08-16

1. **Their existing Supabase project** (`xjuwamydkrzxdxjezlwa`), so the
   catalogue has one source of truth.
2. **Separate admin app** — its own Next.js project, deployed to an `/admin`
   subdomain. Buildable without touching their live site, which still hasn't
   been located.
3. **Order is saved to the database, then WhatsApp opens as it does today.**
   Nothing changes for the customer; staff get a real live queue and stock
   depletes on completed orders.

### What (3) means in practice

The storefront gains a write on checkout. Two consequences worth naming now:

- **It must not block the order.** If the database write fails — offline, RLS
  misconfigured, project paused — checkout still opens WhatsApp. Losing an
  order because our logging broke would be far worse than losing the log.
- **The order arrives twice**: once as a row, once as a WhatsApp message. Staff
  should work from the console, and the message becomes the customer's receipt.
  Worth saying out loud to the client so nobody double-cooks a ticket.

## WhatsApp bot (its own number)

The bot is a **third writer** alongside the storefront and the console, so the
schema treats channel as data: `orders.source` records where a ticket came from
and the console shows one queue regardless. A ticket is a ticket.

### It also solves the loyalty problem

The sign-in requirement was the weak point of the stamp card — nobody creates an
account for a $3 empanada. **The bot already knows the customer's phone number**
before they type anything, so `loyalty_cards.phone` is the identity and stamps
accrue with zero friction. A web account becomes optional rather than a gate.

### Where the bot fits

- It authenticates as a **machine identity**, not a person. Use the
  `service_role` key on the bot's server, never `owner`. It should be able to
  write orders and read the menu, nothing else — and it must never run in a
  browser.
- Status changes can push back out: *"tu pedido está listo"* when staff mark it
  ready. That is the payoff for having orders in the database at all.
- The storefront's WhatsApp links move to the bot number once it is live. That
  is a one-line change — the number is a single constant in the front end.

### Worth flagging to the client

WhatsApp Business API numbers cannot also be used as a normal WhatsApp account
on a phone. If **(929) 705-8086** is the number staff answer by hand today, it
should stay human and the bot should take a **new** number. Converting the
existing one would take away the manual channel they rely on now.

## Still open

- Recipe quantities per dish, for automatic ingredient depletion. The client
  needs to tell us what a Picadera Large actually consumes. Dishes without a
  recipe stay on manual count, which is a fine starting point.
- Whether finished-goods counts start from a real stocktake or from zero.
