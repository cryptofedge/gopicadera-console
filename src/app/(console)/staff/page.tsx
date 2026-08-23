import { requireOwner } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import StaffTable, { type Member } from "./StaffTable";

export const dynamic = "force-dynamic";

/**
 * Team management. Owner only — requireOwner() redirects staff before this
 * renders, and RLS refuses the writes regardless.
 */
export default async function StaffPage() {
  await requireOwner();
  const sb = await serverClient();

  const { data } = await sb
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .order("created_at");

  /**
   * Creating a login needs the service-role key, so it happens here on the
   * server and never in the browser. The new account is created already
   * confirmed — the owner is standing next to the person being added, and an
   * email round-trip just means a staff member who can't clock in.
   */
  async function invite(formData: FormData) {
    "use server";
    await requireOwner();

    const email = String(formData.get("email") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = formData.get("role") === "owner" ? "owner" : "staff";
    const password = String(formData.get("password") ?? "");

    if (!email || password.length < 8) return;

    const admin = adminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) return;

    await admin.from("profiles").upsert({
      id: created.user.id,
      full_name: name || email,
      role,
      active: true,
    });

    revalidatePath("/staff");
  }

  return <StaffTable rows={(data ?? []) as unknown as Member[]} invite={invite} />;
}
