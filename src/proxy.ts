/**
 * Keeps the Supabase session cookie fresh on every request, and bounces
 * signed-out visitors to /login before a page renders.
 *
 * This is convenience, not security. The real gate is Row Level Security in
 * Postgres — if this file were deleted tomorrow, a staff account still could
 * not read or change anything the policies forbid. Every page also calls
 * requireStaff()/requireOwner() for itself rather than trusting this ran.
 *
 * Named proxy.ts, not middleware.ts: Next 16 renamed the convention and warns
 * on the old name.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/auth"];

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates against Supabase; getSession() would trust the cookie.
  const {
    data: { user },
  } = await sb.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/orders";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // robots.txt must be excluded explicitly. Without it the proxy bounces
  // crawlers to /login, so they never read the Disallow and are free to index
  // whatever they can reach.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|webp|mp3)$).*)",
  ],
};
