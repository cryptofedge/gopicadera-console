/**
 * Role helpers.
 *
 * These gate the UI. They are NOT the security boundary — Row Level Security in
 * Postgres is. Everything here is about not showing someone a button that would
 * fail anyway; the database is what actually refuses the write.
 */
import { serverClient } from "./supabase";
import { redirect } from "next/navigation";

export type Role = "owner" | "staff";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  active: boolean;
};

/** Current profile, or null when signed out / deactivated. */
export async function getProfile(): Promise<Profile | null> {
  const sb = await serverClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .single();

  // A deactivated account is treated as signed out rather than as a staff
  // member with no permissions — it should not linger in the console at all.
  if (!data || !data.active) return null;
  return data as Profile;
}

/** Any active account. Use on every console page. */
export async function requireStaff(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}

/** Owner-only pages: prices, menu, staff, reports, settings. */
export async function requireOwner(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  if (p.role !== "owner") redirect("/orders?denied=1");
  return p;
}

export const isOwner = (p: Profile | null) => p?.role === "owner";
