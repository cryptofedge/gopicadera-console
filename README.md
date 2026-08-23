# Go Picadera — staff console

Owner and staff back office for the restaurant: live order board, inventory,
menu, staff accounts, reports.

Separate from the customer storefront on purpose. Both are served from GitHub
Pages out of their own repos and share only the Supabase project behind them.
This one is a Next.js **static export** — a browser app, no server anywhere.

## The one rule

**Permissions are enforced by Postgres Row Level Security, never by this UI.**

A staff account must be unable to change a price even by crafting the HTTP
request by hand. React only decides what to *show* — hiding a button is a
courtesy, not a control. If you add a feature, add the policy first.

This was always the rule; on a static host it is also the *only* line of
defence. There is no server left to check anything, and the anon key ships
inside the JavaScript. Never put a row in a table that its reader may not see.

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
| `src/lib/session.tsx` | Who is signed in, resolved once. The login gate lives here. |
| `src/lib/useQuery.ts` | The loading/error/refetch bookkeeping that replaced each page's server-side `await`. |
| `src/lib/supabase-browser.ts` | The only Supabase client. Anon key, RLS-bound. |
| `src/app/(console)/layout.tsx` | Shell + role guard. Owner-only routes are refused here and by RLS. |
| `src/app/(console)/` | The signed-in console. |

Schema and policies live in `../backend/schema.sql`.

## Deploying

See [DEPLOY.md](DEPLOY.md).
