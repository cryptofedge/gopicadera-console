/**
 * Server-side Supabase clients. Never import this from a client component —
 * it pulls in `next/headers`. Client code uses `supabase-browser.ts`.
 *
 *  - serverClient() uses the ANON key, so Row Level Security still applies.
 *    This is what pages and actions should use.
 *
 *  - adminClient() uses the SERVICE ROLE key and bypasses every policy. It
 *    exists only for operations that genuinely require it, such as creating an
 *    auth user when the owner adds a staff member.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function serverClient() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}

export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
