"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSession } from "@/lib/session";
import { useQuery } from "@/lib/useQuery";
import InventoryTable, { type Level } from "./InventoryTable";

function Inventory() {
  const { profile } = useSession();
  const params = useSearchParams();
  const tab = params.get("kind") === "product" ? "product" : "ingredient";

  const { data, loading, error } = useQuery<Level[]>(
    (sb) =>
      sb
        .from("inventory_levels")
        .select("id, kind, name, unit, qty, reorder_level, low, out_of_stock, track")
        .eq("kind", tab)
        .order("name") as never,
    [tab],
  );

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando inventario…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return <InventoryTable rows={data ?? []} tab={tab} role={profile!.role} />;
}

// useSearchParams needs a Suspense boundary above it, otherwise it opts the
// whole route out of static generation — which a static export cannot allow.
export default function InventoryPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--faint)" }}>Cargando…</p>}>
      <Inventory />
    </Suspense>
  );
}
