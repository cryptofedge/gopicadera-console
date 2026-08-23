import { requireStaff } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import InventoryTable, { type Level } from "./InventoryTable";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const me = await requireStaff();
  const { kind } = await searchParams;
  const tab = kind === "product" ? "product" : "ingredient";

  const sb = await serverClient();
  const { data } = await sb
    .from("inventory_levels")
    .select("id, kind, name, unit, qty, reorder_level, low, out_of_stock, track")
    .eq("kind", tab)
    .order("name");

  return (
    <InventoryTable
      rows={(data ?? []) as unknown as Level[]}
      tab={tab}
      role={me.role}
    />
  );
}
