# Card payments (Stripe), test mode first

Status (2026-09-25): the database migration is applied and all three functions are deployed, but `create-checkout`
and `stripe-webhook` have no Stripe keys yet, so they safely refuse everything (`503 not_configured`) — no card
payment can go through until step 1 and step 3 below happen. The storefront's card button is hidden for
customers; it only appears when the page is opened with `?card=test`. Cash and WhatsApp ordering are untouched.

## How it works

1. Customer fills the cart, name and phone, taps **Pagar con tarjeta**.
2. The storefront calls `place_card_order` (Supabase). It sends product ids, quantities and option picks only, never a price.
   The database prices the cart from the menu tables (`price_cart`) and saves the order as `price_verified`.
3. The storefront calls the `create-checkout` function with just the order code. The function reads the amounts back from
   the database and builds the Stripe Checkout Session from them. Stripe hosts the card form.
4. Stripe calls the `stripe-webhook` function. It checks the signature, checks amount, currency and session against the
   order, marks it paid (once per event), and the existing trigger queues the WhatsApp confirmation.
5. The customer lands on `pedido.html?code=...&paid=1`, which waits a few seconds for the webhook and then shows the paid order.

Why a customer cannot pay less: the browser never sends an amount, and the webhook refuses any payment whose amount does
not match what the database priced.

## Files

| File | What it is |
| --- | --- |
| `admin/backend/stripe_payments.sql` | Tables, columns and functions. Safe to run more than once. Not part of `APPLY_ALL.sql` on purpose. |
| `admin/supabase/functions/create-checkout/` | Makes the Stripe Checkout Session |
| `admin/supabase/functions/stripe-webhook/` | Receives Stripe's events |
| `admin/supabase/functions/stripe-status/` | Read-only setup status for the console's Integrations page (owner-only, never returns a key) |
| `admin/supabase/functions/_shared/` | Shared logic (signature check, request building, handlers) |
| `redesign/index.html` | Card block in the cart, behind the `CARD_PAYMENTS` flag |
| `redesign/pedido.html` | Waits for the webhook when the customer returns from Stripe |
| `admin/src/app/(console)/integrations/page.tsx` | The "Pagos en línea" status card (`StripeStatusCard`) |
| `ops/stripe-sql.test.mjs`, `ops/stripe-functions.test.mjs` | The tests (76 + 97 checks) |

## Turn it on in test mode

Nobody pastes a key into WhatsApp or chat. Keys go straight from the Stripe dashboard into the Supabase secrets command below.

1. **Stripe access.** Llulisa already has the account. She invites Fellito as a Developer (Settings, Team). Both stay in
   **Test mode** (the toggle at the top of the dashboard). Test mode moves no real money. **Not done yet — this is what
   everything else below is waiting on.**
2. ~~**Database.**~~ Done 2026-09-25: `stripe_payments.sql` is applied. (To redo or check: `supabase db query --linked
   --project-ref kfuamhhfthfmavxppagb --file backend/stripe_payments.sql` runs it against the real database through
   the CLI's logged-in session — no separate database password needed. Safe to run again if ever in doubt.)
3. **Secrets.** In Stripe (Test mode): Developers, API keys, copy the secret key (`sk_test_...`). Then:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_XXXX SITE_URL=https://gopicadera.com --project-ref kfuamhhfthfmavxppagb
   ```
   `SITE_ORIGINS` is optional. It defaults to gopicadera.com, www.gopicadera.com and cryptofedge.github.io.
4. ~~**Deploy the functions.**~~ Done 2026-09-25: all three are live (`create-checkout`, `stripe-webhook` with
   `--no-verify-jwt`; `stripe-status` with `verify_jwt` on, checked with `supabase functions list`). The console's
   Integrations page already shows a "Pagos en línea" card with a live status (sin configurar / a medias / modo
   prueba / modo real). `create-checkout`/`stripe-webhook` currently answer every request with `503
   {"error":"not_configured"}` until step 3 sets a key — verified with a plain `curl`, nothing needs redeploying once
   the secrets land.
5. **Webhook.** Stripe (Test mode): Developers, Webhooks, Add endpoint.
   URL: `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/stripe-webhook`
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`.
   Copy the signing secret (`whsec_...`) and set it:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXXX --project-ref kfuamhhfthfmavxppagb
   ```
6. **Publish the storefront** with the card block (`index.html` and `pedido.html`). Publish only those two files: the dish photos
   live in the deployed site's `assets/`, not in this folder.
7. **Try it.** Open `https://gopicadera.com/?card=test`, add something, fill name and phone, tap **Pagar con tarjeta**.

   | Card | Expected |
   | --- | --- |
   | `4242 4242 4242 4242` | Paid. Order page shows paid, console shows the order paid, one WhatsApp confirmation |
   | `4000 0000 0000 9995` | Declined for funds. Nothing is marked paid |
   | `4000 0000 0000 0002` | Declined. Nothing is marked paid |

   Use any future expiry, any 3-digit CVC, any ZIP. Then refund the paid test in the Stripe dashboard and check the order shows refunded.
   Also close the Stripe page without paying: you should land on the storefront with "Pago cancelado".

Safety while testing: only someone who opens the page with `?card=test` sees the button. The functions refuse live keys and
live events unless `ALLOW_LIVE=1` is set, so test mode cannot accidentally take real money.

## Going live (later, on purpose)

1. Llulisa finishes Stripe account activation (business and bank details, entered by her).
2. Stripe in **Live mode**: new secret key and a new webhook endpoint (same URL and events) with its own `whsec_`.
3. `supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... ALLOW_LIVE=1 --project-ref kfuamhhfthfmavxppagb`
4. In `redesign/index.html` change `const CARD_PAYMENTS = new URLSearchParams(location.search).get("card") === "test";` to `const CARD_PAYMENTS = true;` and publish.
5. Place one real small order and refund it. Watch the console before announcing it.

## Turn it off

Set `CARD_PAYMENTS` back to the `?card=test` form and publish: the button disappears at once. To stop payments entirely,
delete the two functions in Supabase. Orders already paid stay as they are.

## A trap already hit once

`admin/supabase/functions/**` is Deno code, deployed by the Supabase CLI, never by `next build`. Next's own
TypeScript check scans the whole repo by default and cannot parse it (`Cannot find name 'Deno'`, `.ts` import
extensions) — the first two functions built here (`create-checkout`, `stripe-webhook`) silently broke the
console's `next build`/GitHub Pages deploy for a while before anyone pushed and found out. `admin/tsconfig.json`
now excludes `supabase/**`; keep it that way, and run `npm run build` in `admin/` after touching anything under
`supabase/functions/` to catch this early next time.

## Known limits

- Dishes with no fixed price, orders over $2,000, and carts with more than 40 lines are refused for card payment (send those on WhatsApp).
- The tax rate (8.875%) lives in `redesign/index.html` and in `price_cart`. Change both together.
- A Checkout Session expires after 30 minutes. An abandoned order stays `unpaid`; after 3 hours it can no longer be paid by card.
