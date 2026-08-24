"use client";

/**
 * Confirmed online payments. Staff and owner both.
 *
 * The order board answers "what do I cook next". This answers a different
 * question that comes up at the counter: has this been paid for already, or do
 * I collect? Orders from Uber Eats, DoorDash, Grubhub and the website arrive
 * already charged; phone and walk-in do not. Handing food to someone who still
 * owes money is the mistake this page exists to prevent.
 *
 * Read-only on purpose. Nobody marks a payment confirmed by hand — that comes
 * from the platform, and a button here would only invite someone to fake it.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@/lib/useQuery";

const ONLINE = ["web", "whatsapp", "doordash", "ubereats", "grubhub"];

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
};

type Paid = {
  id: string;
  code: string;
  source: string;
  customer_name: string | null;
  phone: string | null;
  mode: "delivery" | "pickup";
  status: string;
  total: number;
  paid_at: string | null;
  notified_at: string | null;
  created_at: string;
  taken_by_name?: string | null;
  handled_by_name?: string | null;
  order_items: { name: string; qty: number }[] | null;
};

const money = (n: number) => "$" + Number(n ?? 0).toFixed(2);

function since(iso: string | null) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `hace ${h}h` : `hace ${Math.round(h / 24)}d`;
}

export default function PaymentsPage() {
  const { data, loading, error, reload } = useQuery<Paid[]>(
    (sb) =>
      sb
        .from("orders")
        .select(
          "id, code, source, customer_name, phone, mode, status, total, paid_at, notified_at, created_at, taken_by_name, handled_by_name, order_items(name, qty)",
        )
        .eq("payment", "paid")
        .gte("created_at", new Date(Date.now() - 864e5).toISOString())
        .order("paid_at", { ascending: false }) as never,
  );

  // The kitchen leaves this on a screen; without a refresh it would show
  // whatever was true when someone last opened the tab.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      reload();
    }, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando pagos…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const rows = (data ?? []).filter((o) => ONLINE.includes(o.source));
  const today = rows.reduce((t, o) => t + Number(o.total ?? 0), 0);

  return (
    <>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="text-xl font-black">Pagos confirmados</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {rows.length} pedidos · {money(today)}
        </span>
        <span className="ml-auto text-xs" style={{ color: "var(--faint)" }}>
          se actualiza solo
        </span>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Pedidos de internet que ya están cobrados. No hay que cobrar nada al
        entregarlos.
      </p>

      {rows.length === 0 && (
        <div className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--faint)" }}>
          Todavía no hay pagos confirmados hoy.
        </div>
      )}

      <div className="grid gap-2.5"
           style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {rows.map((o) => {
          // Anything in the last five minutes is probably still being packed,
          // so it gets the warm border rather than sinking into the list.
          const fresh =
            o.paid_at && Date.now() - new Date(o.paid_at).getTime() < 5 * 60_000;

          return (
            <div
              key={o.id}
              className="rounded-xl border p-3.5"
              style={{
                background: "var(--surface)",
                borderColor: fresh ? "var(--line-warm)" : "var(--line)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-black nums">{o.code}</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "var(--surface-3)",
                    color: SOURCE_COLOR[o.source] ?? "var(--muted)",
                  }}
                >
                  {SOURCE_LABEL[o.source] ?? o.source}
                </span>
                <span className="text-xs" style={{ color: "var(--faint)" }}>
                  {o.mode === "delivery" ? "Entrega" : "Recoger"}
                </span>
                <span className="ml-auto font-black nums" style={{ color: "var(--green)" }}>
                  {money(o.total)}
                </span>
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
                 style={{ color: "var(--green)" }}>
                Pagado {since(o.paid_at)}
              </p>

              {o.customer_name && (
                <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                  {o.customer_name}
                  {o.phone && (
                    <> · <a href={`tel:${o.phone}`} className="underline">{o.phone}</a></>
                  )}
                </p>
              )}

              <ul className="text-sm mb-2">
                {o.order_items?.map((it, i) => (
                  <li key={i}>
                    <span className="nums font-semibold">{it.qty}×</span> {it.name}
                  </li>
                ))}
              </ul>

              {(o.handled_by_name || o.taken_by_name) && (
                <p className="text-xs mb-1" style={{ color: "var(--faint)" }}>
                  Atendido por {o.handled_by_name ?? o.taken_by_name}
                </p>
              )}

              <p className="text-[11px] pt-2 border-t"
                 style={{ borderColor: "var(--line)", color: o.notified_at ? "var(--faint)" : "var(--yellow)" }}>
                {o.notified_at
                  ? `Confirmación enviada al cliente por WhatsApp ${since(o.notified_at)}`
                  : "Confirmación de WhatsApp pendiente de enviar"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs max-w-2xl" style={{ color: "var(--faint)" }}>
        Los pedidos por teléfono o en tienda no salen aquí: esos se cobran en el
        mostrador. Si un pedido de internet no aparece en esta lista, todavía no
        está pagado — no lo entregues sin cobrar.
      </p>
    </>
  );
}
