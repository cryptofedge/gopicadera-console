"use client";

/**
 * Menu screen.
 *
 * Price editing is owner-only in the UI *and* in the database. If a staff
 * session somehow issued the update anyway, RLS refuses it — this component is
 * only deciding what to show, never what is permitted.
 */
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import type { Role } from "@/lib/session";
import ItemEditor, { type Item } from "./ItemEditor";

export type Dish = {
  id: string;
  slug: string;
  name: string;
  desc_es: string | null;
  desc_en: string | null;
  image_path: string | null;
  price: number | null;
  available: boolean;
  featured: number | null;
  sort: number;
  category_id: string | null;
  categories: { slug: string; name_es: string } | null;
};

const money = (n: number | null) =>
  n === null || n === undefined ? "—" : "$" + Number(n).toFixed(2);

export default function MenuTable({
  rows, role, onChanged, categories,
}: {
  rows: Dish[];
  role: Role;
  onChanged: () => void;
  categories: { id: string; name_es: string }[];
}) {
  const owner = role === "owner";
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  async function toggle(d: Dish) {
    setBusy(d.id);
    const sb = browserClient();
    const { error } = await sb
      .from("products")
      .update({ available: !d.available })
      .eq("id", d.id);
    setBusy(null);
    if (error) { alert("No se pudo cambiar la disponibilidad."); return; }
    onChanged();
  }

  async function editPrice(d: Dish) {
    if (!owner) return;
    const input = prompt(`Precio de ${d.name}:`, d.price === null ? "" : String(d.price));
    if (input === null) return;

    // Empty means "Personalizar" — a real state on this menu, not a mistake.
    const value = input.trim() === "" ? null : Number(input);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      alert("Precio no válido.");
      return;
    }

    setBusy(d.id);
    const sb = browserClient();
    const { error } = await sb.from("products").update({ price: value }).eq("id", d.id);
    setBusy(null);
    if (error) { alert("No se pudo guardar el precio."); return; }
    onChanged();
  }

  const filtered = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
    : rows;

  // Group under category headings, the way the menu itself reads.
  const groups = filtered.reduce<Record<string, Dish[]>>((acc, d) => {
    const k = d.categories?.name_es ?? "Sin categoría";
    (acc[k] ||= []).push(d);
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="text-xl font-black">Menú</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {rows.length} platos
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar plato…"
          className="px-3 py-1.5 rounded-full border text-sm outline-none"
          style={{ background: "var(--ink)", borderColor: "var(--line)", color: "var(--text)" }}
        />
        {!owner && (
          <span className="text-xs" style={{ color: "var(--faint)" }}>
            Solo el dueño puede cambiar precios.
          </span>
        )}
      </div>

      {Object.entries(groups).map(([cat, dishes]) => (
        <section key={cat} className="mb-5">
          <h2
            className="text-xs font-bold uppercase tracking-wider mb-2 pb-1 border-b"
            style={{ color: "var(--muted)", borderColor: "var(--line)" }}
          >
            {cat}
          </h2>

          <div className="rounded-xl border overflow-hidden"
               style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            <table className="w-full text-sm">
              <tbody>
                {dishes.map((d) => (
                  <tr key={d.id} className="border-b last:border-0"
                      style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2">
                      {d.name}
                      {d.featured && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded font-bold"
                              style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
                          TOP {d.featured}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right nums font-bold w-28">
                      {owner ? (
                        <button
                          onClick={() => editPrice(d)}
                          disabled={busy === d.id}
                          className="underline decoration-dotted underline-offset-4 disabled:opacity-40"
                          style={{ color: "var(--yellow)" }}
                          title="Cambiar precio"
                        >
                          {money(d.price)}
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>{money(d.price)}</span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right w-40">
                      <button
                        onClick={() => toggle(d)}
                        disabled={busy === d.id}
                        className="px-3 py-1 rounded-full text-xs font-bold disabled:opacity-40"
                        style={
                          d.available
                            ? { background: "var(--surface-3)", color: "var(--green)" }
                            : { background: "var(--red)", color: "#fff" }
                        }
                      >
                        {d.available ? "Disponible" : "Agotado"}
                      </button>

                      {/* Everything beyond the sold-out toggle is the owner's:
                          price, photo, description, and the choices a customer
                          gets. RLS refuses the writes to staff regardless. */}
                      {owner && (
                        <button
                          onClick={() => setEditing(d as unknown as Item)}
                          className="ml-2 px-3 py-1 rounded-full text-xs font-bold"
                          style={{ background: "var(--yellow)", color: "#0A0B0E" }}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {rows.length === 0 && (
        <p className="py-10 text-center text-sm" style={{ color: "var(--faint)" }}>
          El menú aún no se ha importado a la base de datos.
        </p>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
