# Go Picadera — staff console

Owner and staff back office for the restaurant: live order board, inventory,
menu, staff accounts, reports.

Separate from the customer storefront on purpose. The storefront is a single
static HTML file served from GitHub Pages; this is a Next.js app that needs a
Node server, so the two are deployed independently and share only the Supabase
project behind them.

## The one rule

**Permissions are enforced by Postgres Row Level Security, never by this UI.**

A staff account must be unable to change a price even by crafting the HTTP
request by hand. React only decides what to *show* — hiding a button is a
courtesy, not a control. If you add a feature, add the policy first.

Role split, in short: staff act on today (orders, stock counts, sold-out
toggles, loyalty redemption), the owner changes the business (prices, menu,
photos, hours, staff accounts, reports).

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Without a real Supabase key the app builds and renders, but every login is
rejected. That is expected, not a bug.

## Layout

| Path | What it is |
| --- | --- |
| `src/proxy.ts` | Session refresh + signed-out redirect. Convenience, not security. |
| `src/lib/supabase.ts` | Server clients. `serverClient()` is RLS-bound; `adminClient()` bypasses RLS and is `server-only`. |
| `src/lib/supabase-browser.ts` | Browser client. Kept in its own file so `next/headers` never reaches the client bundle. |
| `src/lib/auth.ts` | `requireStaff()` / `requireOwner()`. Every page calls one for itself. |
| `src/app/(console)/` | The signed-in console. |

Schema and policies live in `../backend/schema.sql`.

## Deploying

See [DEPLOY.md](DEPLOY.md).
