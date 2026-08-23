import { requireStaff } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import MenuTable, { type Dish } from "./MenuTable";

export const dynamic = "force-dynamic";

/**
 * Staff land here too, but read-only with the availability toggle — that is the
 * one menu power a shift genuinely needs (86 a dish the moment it runs out).
 * Everything that touches money is owner-only, enforced by RLS.
 */
export default async function MenuPage() {
  const me = await requireStaff();
  const sb = await serverClient();

  const { data } = await sb
    .from("products")
    .select("id, slug, name, price, available, featured, sort, category_id, categories(slug, name_es)")
    .order("sort");

  return <MenuTable rows={(data ?? []) as unknown as Dish[]} role={me.role} />;
}
