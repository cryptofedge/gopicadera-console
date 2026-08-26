"use client";

/**
 * Staff land here too, but read-only with the availability toggle — that is the
 * one menu power a shift genuinely needs (86 a dish the moment it runs out).
 * Everything that touches money is owner-only, enforced by RLS.
 */
import { useSession } from "@/lib/session";
import { useQuery } from "@/lib/useQuery";
import MenuTable, { type Dish } from "./MenuTable";

type Cat = { id: string; name_es: string };

export default function MenuPage() {
  const { profile } = useSession();

  const { data, loading, error, reload } = useQuery<Dish[]>(
    (sb) =>
      sb
        .from("products")
        .select(
          "id, slug, name, desc_es, desc_en, image_path, price, available, featured, sort, category_id, categories(slug, name_es)",
        )
        .order("sort") as never,
  );

  // The editor needs the full category list, not just the ones already in use,
  // so a dish can be moved into an empty section.
  const cats = useQuery<Cat[]>((sb) =>
    sb.from("categories").select("id, name_es").order("sort") as never,
  );

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando menú…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return <MenuTable rows={data ?? []} onChanged={reload} role={profile!.role} categories={cats.data ?? []} />;
}
