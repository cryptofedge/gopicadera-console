"use client";

/**
 * Who is signed in, resolved once for the whole console.
 *
 * On a static host there is no server to check a session before a page renders,
 * so the gate lives here instead. That makes it a *convenience*, not a security
 * boundary — anyone can download this JavaScript and skip it. What they cannot
 * skip is Row Level Security: the anon key below is public by design, and every
 * row it can read or write is decided by policy in Postgres.
 *
 * Practical consequence: never put anything in a table that the reader is not
 * allowed to see. There is no server-side filter to fall back on.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "./supabase-browser";

export type Role = "owner" | "staff";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  active: boolean;
  /** Set when the account was handed out with a temporary password. */
  must_change_password: boolean;
};

type SessionState = {
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionState>({
  profile: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    const sb = browserClient();

    // getUser() revalidates against Supabase. getSession() would just trust
    // whatever is in localStorage, which a stale or tampered value satisfies.
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data } = await sb
      .from("profiles")
      .select("id, full_name, role, active, must_change_password")
      .eq("id", user.id)
      .single();

    // A deactivated account counts as signed out rather than as a staff member
    // with no permissions — it should not linger in the console at all.
    setProfile(data && data.active ? (data as Profile) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();

    // Keeps other tabs honest: signing out in one tab drops the rest.
    const sb = browserClient();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => void load());
    return () => subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(async () => {
    await browserClient().auth.signOut();
    setProfile(null);
    router.replace("/login");
  }, [router]);

  return (
    <Ctx.Provider value={{ profile, loading, signOut, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);

export const isOwner = (p: Profile | null) => p?.role === "owner";
