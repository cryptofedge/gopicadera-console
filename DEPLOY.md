# Deploying the console

Both halves of Go Picadera now live on GitHub Pages, in separate repos. Nothing
here touches the storefront link the client already has.

| | Storefront | Console |
| --- | --- | --- |
| Repo | `cryptofedge/GoPicadera` | `cryptofedge/gopicadera-console` |
| URL | `cryptofedge.github.io/GoPicadera/` | `cryptofedge.github.io/gopicadera-console/` |
| What it is | One static HTML file | Static export of a Next.js app |
| Who uses it | Customers | Owner and staff |
| Indexed | Yes, eventually | Never |

## What changed to make this possible

The console was originally server-rendered. GitHub Pages runs no server, so it
was rebuilt as a browser-only app:

- Seven pages that queried Supabase on the server now query it from the browser
- Two Server Actions became direct Supabase calls
- `proxy.ts` and the `/auth/signout` route handler are gone; the login gate and
  sign-out are client-side
- **The `service_role` key is gone entirely.** Creating a staff login now uses
  `signUp()` on a throwaway client with `persistSession: false`, so the new
  account never displaces the owner's session

## The thing to understand before shipping this

**Row Level Security is now the only thing protecting the data.**

There is no server. The anon key ships inside the JavaScript — that is normal
and by design — but it means every table is reachable by anyone who opens the
console URL. What they can actually read or write is decided entirely by policy
in `../backend/schema.sql`.

Two consequences:

1. Nothing may sit in a table that its reader is not allowed to see. There is no
   server-side filter to fall back on.
2. **The policies have never been executed against a live database.** Test them
   with a real staff account before this URL goes anywhere near the client:
   sign in as staff and confirm a price change is refused by Postgres, not just
   hidden by the UI.

## Steps

### 1. Repository visibility

Pages on a **private** repo requires GitHub Pro. On the free plan the repo must
be **public**.

Public is defensible here — there are no secrets in it (`.env.local` is
gitignored and the `service_role` key no longer exists anywhere in the codebase)
— but it does mean the source is readable, so a weak RLS policy is readable too.
Read the section above before flipping it.

```bash
gh repo edit cryptofedge/gopicadera-console --visibility public
```

### 2. Build secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xjuwamydkrzxdxjezlwa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key |

The workflow fails deliberately if it builds with the placeholder key, rather
than publishing a console that cannot reach Supabase.

### 3. Turn on Pages

**Settings → Pages → Source → GitHub Actions.** Not "Deploy from a branch" —
the workflow publishes the built output, and there is no branch holding it.

### 4. Push

`.github/workflows/deploy.yml` builds and deploys on every push to `master`, or
on demand from the Actions tab.

### 5. First owner account

Supabase does not know who the owner is until you tell it. After the schema is
applied, create the account in **Authentication → Users → Add user**, then run
the bootstrap SQL in `../backend/SETUP.md` to give that user the `owner` role.

Also check **Authentication → Providers → Email**: if "Confirm email" is on, a
staff member created from the console cannot sign in until they click the link
in their inbox. Turning it off matches the old behaviour, where the owner
handed over the password in person.

### 6. Domain, later

When `gopicadera.com` is connected:

- `gopicadera.com` → storefront
- `admin.gopicadera.com` → this console

At that point set `BASE_PATH` in `next.config.ts` back to `""` — the repo-name
prefix only exists because the site is served from a subpath.

## Before handing the link over

- [ ] Staff account sees no owner-only nav items
- [ ] Staff account gets an **error** on a price change, not a silent success
- [ ] `/gopicadera-console/robots.txt` returns `Disallow: /`
- [ ] The storefront link still works and is unchanged
- [ ] The logo renders on the login page (it needs the base-path prefix by hand)
