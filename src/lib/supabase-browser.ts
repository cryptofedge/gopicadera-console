/**
 * Browser-side Supabase client.
 *
 * Kept in its own module on purpose: the server client imports `next/headers`,
 * and if the two live together that import gets pulled into the client bundle
 * and the build fails. Client components import from here, only.
 *
 * Uses the ANON key, so every query is still gated by Row Level Security.
 */
import { createBrowserClient } from "@supabase/ssr";

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
