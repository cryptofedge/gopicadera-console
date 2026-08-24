"use client";

/**
 * Every order, searchable. Staff and owner both.
 *
 * The board shows what still needs cooking and drops a ticket the moment it is
 * done. That is right for a shift, and useless for "the lady who called about
 * her pernil an hour ago". This is where a finished order can still be found.
 *
 * Read-only. Reopening a closed ticket or editing a past total would break the
 * reports, which deliberately price orders at what they sold for.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/useQuery";

const SOURCE_LABEL: Record<string, string> = {
  web: "Página web",
  whatsapp: "WhatsApp",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  grubhub: "Grubhub",
  phone: "Teléfono",
  walkin: "En tienda",
};

const SOURCE_COLOR: Record<string, string> = {
  web: "var(--yellow)",
  whatsapp: "#25D366",
  doordash: "#FF3008",
  ubereats: "#06C167",
  grubhub: "#F63440",
  phone: "var(--muted)",
  walkin: "var(--muted)",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  cooking: "Cocinando",
  ready: "Listo",
  done: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  new: "var(--yellow)",
  cooking: "var(--ember)",
  ready: "var(--green)",
  done: "var(--faint)",
  cancelled: "var(--red)",
};

type Row = {
  id: string;
  code: string;
  source: string;
  customer_name: string | null;
  phone: string | null;
  mode: "delivery" | "pickup";
  status: string;
  payment?: string;
  total: number;
  note: string | null;
  created_at: string;
  taken_by_name?: string | null;
  handled_by_name?: string | null;
  order_items: { name: string; qty: number }[] | null;
};

const money = (n: number) => "$" + Number(n ?? 0).toFixed(2);

const RANGES = [
  { key: "1", label: "Hoy", days: 1 },
  { key: "7", label: "7 días", days: 7 },
  { key: "30", label: "30 días", days: 30 },
] as const;

// Accent-insensitive, so searching "ramirez" finds "Ramírez".
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

export default function HistoryPage() {
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");

  const { data, loading, error } = useQuery<Row[]>(
    (sb) =>
      sb
        .from("orders")
        .select(
          "id, code, source, customer_name, phone, mode, status, payment, total, note, created_at, taken_by_name, handled_by_name, order_items(name, qty)",
        )
        .gte("created_at", new Date(Date.now() - days * 864e5).toISOString())
        .order("created_at", { ascending: false }) as never,
    [days],
  );

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return (data ?? []).filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (source !== "all" && o.source !== source) return false;
      if (!needle) return true;
      const hay = fold(
        [o.code, o.customer_name ?? "", o.phone ?? "",
         o.taken_by_name ?? "", o.handled_by_name ?? "",
         ...(o.order_items ?? []).map((i) => i.name)].join(" "),
      );
      return hay.includes(needle);
    });
  }, [data, q, status, source]);

  const total = rows.reduce((t, o) => t + Number(o.total ?? 0), 0);

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando historial…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="text-xl font-black">Historial de pedidos</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {rows.length} pedidos · {money(total)}
        </span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setDays(r.days)}
            className="px-3 py-1.5 rounded-full text-sm font-bold"
            style={
              days === r.days
                ? { background: "var(--yellow)", color: "#0A0B0E" }
                : { background: "var(--surface-2)", color: "var(--muted)" }
            }
          >
            {r.label}
          </button>
        ))}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar código, nombre, teléfono o plato…"
          aria-label="Buscar pedidos"
          className="px-3 py-2 rounded-lg border outline-none text-sm flex-1 min-w-[220px]"
          style={field}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value)}
                aria-label="Filtrar por estado"
                className="px-3 py-2 rounded-lg border outline-none text-sm" style={field}>
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select value={source} onChange={(e) => setSource(e.target.value)}
                aria-label="Filtrar por canal"
                className="px-3 py-2 rounded-lg border outline-none text-sm" style={field}>
          <option value="all">Todos los canales</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--faint)" }}>
          No hay pedidos que coincidan.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden"
             style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          {/* The table scrolls inside its own box; the page never scrolls
              sideways on a phone. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 840 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                  <th className="text-left font-semibold px-3 py-2">Pedido</th>
                  <th className="text-left font-semibold px-3 py-2">Canal</th>
                  <th className="text-left font-semibold px-3 py-2">Cliente</th>
                  <th className="text-left font-semibold px-3 py-2">Detalle</th>
                  <th className="text-left font-semibold px-3 py-2">Atendido por</th>
                  <th className="text-left font-semibold px-3 py-2">Estado</th>
                  <th className="text-right font-semibold px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const when = new Date(o.created_at);
                  return (
                    <tr key={o.id} className="border-t align-top"
                        style={{ borderColor: "var(--line)" }}>
                      <td className="px-3 py-2.5">
                        <span className="font-bold nums block">{o.code}</span>
                        <span className="text-xs nums" style={{ color: "var(--faint)" }}>
                          {when.toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}
                          {" · "}
                          {when.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="text-xs font-bold"
                              style={{ color: SOURCE_COLOR[o.source] ?? "var(--muted)" }}>
                          {SOURCE_LABEL[o.source] ?? o.source}
                        </span>
                        <span className="block text-xs" style={{ color: "var(--faint)" }}>
                          {o.mode === "delivery" ? "Entrega" : "Recoger"}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="block">{o.customer_name ?? "—"}</span>
                        {o.phone && (
                          <a href={`tel:${o.phone}`} className="text-xs underline nums"
                             style={{ color: "var(--faint)" }}>{o.phone}</a>
                        )}
                      </td>

                      <td className="px-3 py-2.5" style={{ color: "var(--muted)" }}>
                        {(o.order_items ?? []).map((it) => `${it.qty}× ${it.name}`).join(", ") || "—"}
                        {o.note && (
                          <span className="block text-xs italic" style={{ color: "var(--ember)" }}>
                            “{o.note}”
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                        {o.handled_by_name ?? o.taken_by_name ?? (
                          <span style={{ color: "var(--faint)" }}>automático</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider"
                              style={{ color: STATUS_COLOR[o.status] ?? "var(--muted)" }}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                        <span className="block text-xs"
                              style={{ color: o.payment === "paid" ? "var(--green)" : "var(--faint)" }}>
                          {o.payment === "paid" ? "Pagado" : "Sin pagar"}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right font-bold nums">{money(o.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs max-w-2xl" style={{ color: "var(--faint)" }}>
        Los totales son los del momento de la venta. Cambiar un precio hoy no
        altera lo que dice un pedido de la semana pasada.
      </p>
    </>
  );
}
