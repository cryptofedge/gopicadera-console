"use client";

/**
 * Staff land here too, but read-only with the availability toggle — that is the
 * one menu power a shift genuinely needs (86 a dish the moment it runs out).
 * Everything that touches money is owner-only, enforced by RLS.
 */
import { useSession } from "@/lib/session";
import { useQuery } from "@/lib/useQuery";
import MenuTable, { type Dish } from "./MenuTable";

export default function MenuPage() {
  const { profile } = useSession();

  const { data, loading, error } = useQuery<Dish[]>(
    (sb) =>
      sb
        .from("products")
        .select(
          "id, slug, name, price, available, featured, sort, category_id, categories(slug, name_es)",
        )
        .order("sort") as never,
  );

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando menú…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return <MenuTable rows={data ?? []} role={profile!.role} />;
}
