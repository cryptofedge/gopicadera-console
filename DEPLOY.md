# Deploying the console

The storefront and the console are deployed separately and neither affects the
other. **Nothing here changes the client's existing storefront link.**

| | Storefront | Console |
| --- | --- | --- |
| What it is | One static HTML file | Next.js app, server-rendered |
| Hosted on | GitHub Pages | Netlify |
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

### 2. Connect it to Netlify

Import the repo at app.netlify.com → **Add new project → Import an existing
project**. `netlify.toml` in this folder supplies the build command, the
publish directory and the Next.js runtime, so accept what it detects.

If you push the whole `GoPicadera` folder rather than just `admin/`, set
**Base directory** to `admin`.

Create a **new** project. Do not reuse `gopicadera-preview` — that one is an
abandoned static storefront preview and its config expects a plain HTML folder.

> **Vercel instead?** It is the more natural host for Next.js and the steps are
> near-identical (Root Directory rather than Base directory, and it ignores
> `netlify.toml`). It was not chosen because its signup demands phone
> verification that rejects VoIP numbers.

### 3. Environment variables

In Netlify: **Site configuration → Environment variables**. Add all three:

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

Until the GoDaddy domain is connected, Netlify gives the app a
`*.netlify.app` URL. That works, but don't hand it to the client — wait for
the real subdomain.

Once `gopicadera.com` is pointed at the storefront, add a subdomain for this:

- `gopicadera.com` → storefront (GitHub Pages)
- `admin.gopicadera.com` → this console (Netlify)

In Netlify: **Domain management → Add a domain**, enter
`admin.gopicadera.com`, then create the CNAME it gives you in GoDaddy's DNS
panel.

### 5. First owner account

Supabase does not know who the owner is until you tell it. After the schema is
applied, create the account in **Authentication → Users → Add user**, then run
the bootstrap SQL in `../backend/SETUP.md` to give that user the `owner` role.

Every account created afterwards defaults to `staff`, and only an owner can
promote anyone.

---

## Known issue: `netlify build` fails on Windows

Running `netlify build` locally on Windows fails while bundling the edge
function for `proxy.ts`:

```
Cannot find module './webpack-runtime.js'
file:///Users/.../GoPicadera/admin/C:/Users/.../GoPicadera/admin/.netlify/...
```

Look at that path: a Unix-style base with a Windows drive letter glued onto the
middle of it. Netlify's edge bundler joins paths in a way that does not survive
a `C:\` prefix. It is not a problem with this app — the same failure appears
with both bundlers (`--webpack` and the default Turbopack), only the missing
runtime filename changes, and the file it cannot find is sitting right next to
the one that asked for it.

Netlify's own build machines run Linux, where that join is correct. So a real
deploy is the meaningful test; the local command is not.

**If the deploy does fail the same way**, nothing becomes insecure — proxy.ts
is convenience only. Every page calls `requireStaff()`/`requireOwner()` for
itself and RLS enforces in Postgres. The symptom would be a signed-out visitor
seeing an error instead of a clean redirect to `/login`.

## Before handing the link over

- [ ] Signing in as a staff account shows no owner-only nav items
- [ ] A staff account gets an error, not a silent success, on a price change
- [ ] `admin.gopicadera.com/robots.txt` returns `Disallow: /`
- [ ] The storefront link still works and is unchanged
- [ ] Searching the site for the restaurant name never surfaces the console
