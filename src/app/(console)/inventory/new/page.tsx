"use client";

/**
 * Add an inventory item.
 *
 * The inventory page has always offered "+ Artículo"; this is what it was
 * pointing at. Owner-only, both here and in the console layout's guard — the
 * shape of the inventory is a business decision, while counting what is on the
 * shelf is a shift decision.
 *
 * Two writes, not one: the item row, then an opening balance as a stock move.
 * Stock is an append-only ledger, so the starting count is a movement like any
 * other rather than a number written straight onto the item.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserClient } from "@/lib/supabase-browser";

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

const UNITS = ["und", "lb", "oz", "gal", "caja", "botella", "porción"];

export default function NewInventoryItemPage() {
  const router = useRouter();
  const [kind, setKind] = useState<"ingredient" | "product">("ingredient");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("und");
  const [qty, setQty] = useState("0");
  const [reorder, setReorder] = useState("0");
  const [track, setTrack] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");

    const sb = browserClient();
    const { data, error: insErr } = await sb
      .from("inventory_items")
      .insert({
        kind,
        name: name.trim(),
        unit,
        reorder_level: Number(reorder) || 0,
        track,
      })
      .select("id")
      .single();

    if (insErr) {
      setError(insErr.message);
      setBusy(false);
      return;
    }

    const opening = Number(qty) || 0;
    if (opening > 0 && data?.id) {
      // Not fatal if this fails — the item exists, and someone can count it in
      // from the inventory page. Better than rolling back a good row.
      await sb.from("stock_moves").insert({
        item_id: data.id,
        delta: opening,
        reason: "count",
        note: "Conteo inicial",
      });
    }

    router.push(`/inventory?kind=${kind}`);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-black">Nuevo artículo</h1>
        <Link
          href="/inventory"
          className="ml-auto text-sm"
          style={{ color: "var(--faint)" }}
        >
          Cancelar
        </Link>
      </div>

      <form
        onSubmit={save}
        className="rounded-xl border p-4 max-w-xl"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <label className="block text-xs font-bold uppercase tracking-wider mb-2"
               style={{ color: "var(--muted)" }}>
          Tipo
        </label>
        <div className="flex gap-2 mb-5">
          {([
            ["ingredient", "Ingrediente"],
            ["product", "Producto"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setKind(v)}
              className="px-4 py-2 rounded-full text-sm font-bold"
              style={
                kind === v
                  ? { background: "var(--yellow)", color: "#0A0B0E" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs -mt-3 mb-5" style={{ color: "var(--faint)" }}>
          Ingrediente es lo que se cocina (pernil, plátano). Producto es lo que
          se vende tal cual (una botella, una lata).
        </p>

        <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider mb-1.5"
               style={{ color: "var(--muted)" }}>
          Nombre
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={kind === "ingredient" ? "Pernil (crudo)" : "Country Club Uva"}
          className="w-full mb-5 px-4 py-3 rounded-xl border outline-none text-base"
          style={field}
        />

        <div className="grid gap-4 mb-5"
             style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <div>
            <label htmlFor="unit" className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                   style={{ color: "var(--muted)" }}>
              Unidad
            </label>
            <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border outline-none text-base" style={field}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="qty" className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                   style={{ color: "var(--muted)" }}>
              Cantidad inicial
            </label>
            <input id="qty" type="number" min={0} step="0.01" value={qty}
                   onChange={(e) => setQty(e.target.value)}
                   className="w-full px-3 py-3 rounded-xl border outline-none text-base nums" style={field} />
          </div>

          <div>
            <label htmlFor="reorder" className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                   style={{ color: "var(--muted)" }}>
              Mínimo
            </label>
            <input id="reorder" type="number" min={0} step="0.01" value={reorder}
                   onChange={(e) => setReorder(e.target.value)}
                   className="w-full px-3 py-3 rounded-xl border outline-none text-base nums" style={field} />
          </div>
        </div>

        <label className="flex items-center gap-2.5 mb-1 cursor-pointer">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)}
                 className="w-4 h-4" />
          <span className="text-sm">Descontar automáticamente al vender</span>
        </label>
        <p className="text-xs mb-6 ml-6" style={{ color: "var(--faint)" }}>
          Desmárcalo para cosas que se cuentan a mano, como servilletas o aceite.
        </p>

        {error && (
          <p className="text-sm mb-4" style={{ color: "var(--red)" }} role="alert">
            {error}
          </p>
        )}

        <button disabled={busy}
                className="px-6 py-3 rounded-full font-bold disabled:opacity-50"
                style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
          {busy ? "Guardando…" : "Guardar artículo"}
        </button>
      </form>

      <p className="mt-4 text-xs max-w-xl" style={{ color: "var(--faint)" }}>
        La cantidad inicial se guarda como un conteo, no como un número suelto.
        Todo movimiento de inventario queda registrado, así que siempre se puede
        ver de dónde salió una diferencia.
      </p>
    </>
  );
}
