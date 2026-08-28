# Console setup — what I need from you

## 1. Supabase keys

I already know the project ref from their image URLs:

```
https://xjuwamydkrzxdxjezlwa.supabase.co
```

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
