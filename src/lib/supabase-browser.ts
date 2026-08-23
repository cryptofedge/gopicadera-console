/**
 * The Supabase client. Uses the ANON key, so every query it makes is still
 * gated by Row Level Security.
 *
 * In the demo build (NEXT_PUBLIC_DEMO=1) it returns an in-memory stand-in
 * instead — same shape, no database, no keys. That build is what the client
 * gets to click through before the real project is wired up.
 */
import { createBrowserClient } from "@supabase/ssr";
import { demoClient } from "./demo-client";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export function browserClient() {
  if (IS_DEMO) return demoClient() as unknown as ReturnType<typeof createBrowserClient>;

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
