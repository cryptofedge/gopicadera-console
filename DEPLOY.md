# Deploying the console

The storefront and the console are deployed separately and neither affects the
other. **Nothing here changes the client's existing storefront link.**

| | Storefront | Console |
| --- | --- | --- |
| What it is | One static HTML file | Next.js app, server-rendered |
| Hosted on | GitHub Pages | Vercel |
| Who uses it | Customers | Owner and staff |
| Indexed by Google | Yes, eventually | Never |

## Why not GitHub Pages

Pages serves static files and nothing else. This app needs a running Node
server for three separate reasons:

1. Pages query Supabase on the server before any HTML is sent.
2. `src/proxy.ts` refreshes the session cookie on every request.
3. The `service_role` key must stay server-side. On a static host there is no
   server to keep it on.

Static export is not a workaround — Next's own docs list proxy support under
static export as **No**.

---

## Steps

Steps 1 and 2 need an account and a password, so they are yours to do.

### 1. Put the code in a private GitHub repo

**Private.** Not `cryptofedge/GoPicadera` — that repo is public and holds only
the storefront. This one is the back office.

```bash
gh repo create gopicadera-console --private --source=. --push
```

Or create it through the GitHub web UI and push the `admin/` folder to it.

`.gitignore` already excludes `.env.local`, so no key can ride along by
accident. Worth confirming with `git status` before the first push anyway.

### 2. Connect it to Vercel

Import the repo at vercel.com. Framework preset detects as Next.js on its own.

If you push the whole `GoPicadera` folder rather than just `admin/`, set
**Root Directory** to `admin` in the project settings.

### 3. Environment variables

In Vercel: **Project Settings → Environment Variables**. Add all three to
Production, Preview and Development:

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xjuwamydkrzxdxjezlwa.supabase.co` | Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Public. RLS still applies to everything it does. |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **Secret. Bypasses RLS entirely.** |

The service role key goes into this box and nowhere else — not a repo, not a
chat window, not a screenshot. If it ever leaks, rotate it in the Supabase
dashboard immediately; anyone holding it can read and rewrite every table
regardless of policy.

### 4. Domain

Until the GoDaddy domain is connected, Vercel gives the app a
`*.vercel.app` URL. That works, but don't hand it to the client — wait for
the real subdomain.

Once `gopicadera.com` is pointed at the storefront, add a subdomain for this:

- `gopicadera.com` → storefront (GitHub Pages)
- `admin.gopicadera.com` → this console (Vercel)

In Vercel: **Settings → Domains → Add**, enter `admin.gopicadera.com`, then
create the CNAME it gives you in GoDaddy's DNS panel.

### 5. First owner account

Supabase does not know who the owner is until you tell it. After the schema is
applied, create the account in **Authentication → Users → Add user**, then run
the bootstrap SQL in `../backend/SETUP.md` to give that user the `owner` role.

Every account created afterwards defaults to `staff`, and only an owner can
promote anyone.

---

## Before handing the link over

- [ ] Signing in as a staff account shows no owner-only nav items
- [ ] A staff account gets an error, not a silent success, on a price change
- [ ] `admin.gopicadera.com/robots.txt` returns `Disallow: /`
- [ ] The storefront link still works and is unchanged
- [ ] Searching the site for the restaurant name never surfaces the console
