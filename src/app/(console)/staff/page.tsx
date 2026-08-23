"use client";

import { createClient } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";
import StaffTable, { type Member } from "./StaffTable";

/**
 * Team management. Owner only — the console layout redirects staff before this
 * renders, and RLS refuses the writes regardless.
 */
export default function StaffPage() {
  const { data, loading, error, reload } = useQuery<Member[]>(
    (sb) =>
      sb
        .from("profiles")
        .select("id, full_name, role, active, created_at")
        .order("created_at") as never,
  );

  /**
   * Creating a login, without a server.
   *
   * The old version called auth.admin.createUser() with the service-role key.
   * There is nowhere to keep that key on a static host, so this uses ordinary
   * signUp() instead — the same call a customer self-registering would make.
   *
   * The catch: signUp() signs the new account in, which would kick the owner
   * out of their own console. So it runs on a throwaway client with
   * persistSession off. That client writes no tokens to storage, leaving the
   * owner's session untouched.
   *
   * The profile row is then written from the OWNER's session, because only an
   * owner is allowed to set a role.
   */
  async function invite(fd: FormData): Promise<string | null> {
    const email = String(fd.get("email") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim();
    const role = fd.get("role") === "owner" ? "owner" : "staff";
    const password = String(fd.get("password") ?? "");

    if (!email || password.length < 8) {
      return "Correo obligatorio y contraseña de al menos 8 caracteres.";
    }

    const isolated = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: created, error: signUpError } = await isolated.auth.signUp({
      email,
      password,
    });
    if (signUpError) return signUpError.message;
    if (!created.user) return "No se pudo crear la cuenta.";

    const { error: profileError } = await browserClient().from("profiles").upsert({
      id: created.user.id,
      full_name: name || email,
      role,
      active: true,
    });
    if (profileError) return profileError.message;

    reload();
    return null;
  }

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando equipo…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return <StaffTable rows={data ?? []} invite={invite} />;
}
