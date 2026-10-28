# Console setup — what I need from you

## 1. Supabase keys

The live project is the one the storefront (`cryptofedge/GoPicadera`) talks to:

```
https://kfuamhhfthfmavxppagb.supabase.co
```

(Earlier notes named `xjuwamydkrzxdxjezlwa`, the ref in the old site's image URLs. Neither the storefront nor
the Edge Functions use it.)

I need two values from **Supabase → Project Settings → API**:

| Value | Where it goes | Secret? |
|---|---|---|
| `anon` / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No — safe in the browser, RLS protects the data |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **YES.** Server-side only. Bypasses every RLS policy. |

### Read this before pasting anything

**`cryptofedge/GoPicadera` is a public repo.** The `service_role` key must never
go anywhere near it — that key ignores all row level security and can read,
change or delete the whole database.

The admin app is a **separate** project with its own `.env.local`, which is
gitignored by default. Keys live there and in the host's environment settings,
never in the storefront repo.

If a `service_role` key has ever been pasted into a chat, a commit or a public
page, rotate it in Supabase before launch. Rotating is free and takes a minute.

## 2. Confirm before I touch their live database

The schema in `schema.sql` creates new tables and **enables Row Level Security**
on them. RLS on a table with no policy denies everyone, which is how it should
be — but if their existing site already reads a table by the same name, turning
on RLS would break the live site instantly.

So before running anything I need to know:

- Which tables already exist in that project, and
- Whether their live site reads them with the `anon` key.

Easiest answer: run this in the Supabase SQL editor and send me the output.

```sql
select table_name,
       (select count(*) from information_schema.columns c
         where c.table_name = t.table_name) as cols
from information_schema.tables t
where table_schema = 'public'
order by table_name;
```

If there's a name collision I'll namespace the new tables rather than risk it.

## 3. First owner account

Supabase Auth has no users yet for this. Once the schema is in:

1. Invite the owner's email in **Authentication → Users**.
2. Run:

```sql
update profiles set role = 'owner' where id = '<their-user-id>';
```

Every account after that gets created from inside the console, so this is the
only time anyone touches SQL for a user.

**The first account must be the owner.** `profiles` defaults new users to
`staff`, deliberately — an account that somehow gets created without being
granted a role ends up with the least power, not the most.

## 4. Apply order

Each file assumes the ones above it. `APPLY_ALL.sql` is exactly the first two.

1. `schema.sql`
2. `integrations.sql`
3. `whatsapp_orders.sql`, then `place_order.sql` — **not on `master` yet**; they are on the unmerged
   branch `add-order-flow-and-elmini-media`. `place_order` is what the storefront calls, and the order
   code trigger lives in `whatsapp_orders.sql`, so a fresh project needs both.
4. `seed_menu.sql`
5. `first_login.sql` (or `CREATE_OWNERS.sql`, which contains it)
6. `stripe_payments.sql`
7. `ads_oauth.sql`
8. `ai_usage_writer.sql`
9. `security_hardening.sql` — what a browser may write to orders, loyalty codes and integrations.
   Safe to run again.
10. `ads_sync.sql` — what the ads worker reads and writes (see ADS_WORKER.md).
11. `ads_create.sql` — the `ads` Storage bucket for ad images and videos, and the default targeting.
12. `ads_schedule.sql` — wakes the ads worker. Needs `pg_cron`, `pg_net` and two Vault secrets, and the
    `ads-worker` function deployed first.

`npm run test:sql` executes steps 1–11 (Postgres in WebAssembly, no account needed). Step 12 uses
Supabase-only extensions and is checked by hand, as described at the end of ADS_WORKER.md.

## 5. Before telling the owner the ad connections work

Nobody asks Llulisa to do anything until all of these pass:

1. `npm test`: the connect-flow and database tests are green.
2. `backend/check_readiness.sql`, pasted in the SQL editor: every row says `ok`. It is read-only.
3. `npm run check:connect`: each platform answers `302`, meaning deployed with secrets set. TikTok can stay at
   `503` until its app review clears.
4. Fellito connects Meta and Google once from **Canales** (he is an app admin, and Llulisa has invited him into her
   business accounts; see META_ADS.md and GOOGLE_ADS.md). Both cards say **Conectado**, and the second result of
   `check_readiness.sql` shows a Page for Meta.

Only then does she get the short message asking her to accept the invitations, if she has not already.
