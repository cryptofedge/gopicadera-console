"use client";

/**
 * Stock screen.
 *
 * Two tabs because a shift counts them differently:
 *   Productos    — bottles and finished goods, counted by eye in the cooler.
 *   Ingredientes — pernil, plátanos, queso, counted by weight in the back.
 *
 * Staff can move stock; only the owner can create items or change reorder
 * levels. Counting is the job of whoever is on shift, so locking it to the
 * owner would just mean it never gets done.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";
import type { Role } from "@/lib/auth";

export type Level = {
  id: string;
  kind: "product" | "ingredient";
  name: string;
  unit: string;
  qty: number;
  reorder_level: number;
  low: boolean;
  out_of_stock: boolean;
  track: boolean;
};

export default function InventoryTable({
  rows, tab, role,
}: { rows: Level[]; tab: "product" | "ingredient"; role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Every change is a ledger entry, never an overwrite. A wrong number can then
   * be traced to who entered it and why, instead of vanishing.
   */
  async function move(item: Level, delta: number, reason: string, note?: string) {
    setBusy(item.id);
    const sb = browserClient();
    const { error } = await sb.from("stock_moves").insert({
      item_id: item.id, delta, reason, note: note ?? null,
    });
    setBusy(null);
    if (error) { alert("No se pudo guardar el movimiento."); return; }
    router.refresh();
  }

  async function setCount(item: Level) {
    const input = prompt(`Conteo real de ${item.name} (${item.unit}):`, String(item.qty));
    if (input === null) return;
    const target = Number(input);
    if (Number.isNaN(target)) { alert("Número no válido."); return; }
    // Record the correction, not the new total — the ledger stays the truth.
    await move(item, target - item.qty, "count", `conteo → ${target}`);
  }

  const lowCount = rows.filter((r) => r.low && r.track).length;

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="text-xl font-black">Inventario</h1>

        <div className="flex rounded-full overflow-hidden border" style={{ borderColor: "var(--line)" }}>
          {(["ingredient", "product"] as const).map((k) => (
            <Link
              key={k}
              href={`/inventory?kind=${k}`}
              className="px-3 py-1.5 text-sm font-semibold"
              style={{
                background: tab === k ? "var(--yellow)" : "transparent",
                color: tab === k ? "#0A0B0E" : "var(--muted)",
              }}
            >
              {k === "ingredient" ? "Ingredientes" : "Productos"}
            </Link>
          ))}
        </div>

        {lowCount > 0 && (
          <span className="text-sm font-bold" style={{ color: "var(--ember)" }}>
            {lowCount} por reponer
          </span>
        )}

        {role === "owner" && (
          <Link
            href="/inventory/new"
            className="ml-auto px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ background: "var(--yellow)", color: "#0A0B0E" }}
          >
            + Artículo
          </Link>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden"
           style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <th className="text-left font-semibold px-3 py-2">Artículo</th>
              <th className="text-right font-semibold px-3 py-2">Cantidad</th>
              <th className="text-right font-semibold px-3 py-2">Mínimo</th>
              <th className="text-right font-semibold px-3 py-2">Ajustar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center" style={{ color: "var(--faint)" }}>
                  Nada registrado todavía.
                </td>
              </tr>
            )}

            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2">
                  {r.name}
                  {r.out_of_stock && r.track && (
                    <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: "var(--red)", color: "#fff" }}>
                      AGOTADO
                    </span>
                  )}
                  {!r.out_of_stock && r.low && r.track && (
                    <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: "var(--ember)", color: "#fff" }}>
                      BAJO
                    </span>
                  )}
                  {!r.track && (
                    <span className="ml-2 text-[11px]" style={{ color: "var(--faint)" }}>
                      sin seguimiento
                    </span>
                  )}
                </td>

                <td className="px-3 py-2 text-right nums font-bold">
                  {Number(r.qty).toFixed(Number(r.qty) % 1 ? 2 : 0)}{" "}
                  <span style={{ color: "var(--faint)" }}>{r.unit}</span>
                </td>

                <td className="px-3 py-2 text-right nums" style={{ color: "var(--faint)" }}>
                  {Number(r.reorder_level).toFixed(0)}
                </td>

                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => move(r, -1, "waste", "merma")} disabled={busy === r.id}
                            className="w-8 h-8 rounded-full font-bold disabled:opacity-40"
                            style={{ background: "var(--surface-3)" }} title="Restar 1">−</button>
                    <button onClick={() => move(r, 1, "delivery", "entrada")} disabled={busy === r.id}
                            className="w-8 h-8 rounded-full font-bold disabled:opacity-40"
                            style={{ background: "var(--surface-3)" }} title="Sumar 1">+</button>
                    <button onClick={() => setCount(r)} disabled={busy === r.id}
                            className="px-2 h-8 rounded-full text-xs font-bold disabled:opacity-40"
                            style={{ background: "var(--surface-3)" }}>Contar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
        Cuando un artículo llega a cero, el sabor o plato que depende de él se
        oculta del menú en la web automáticamente.
      </p>
    </>
  );
}
