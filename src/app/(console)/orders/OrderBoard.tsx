"use client";

/**
 * Live order board.
 *
 * Three columns, left to right, matching how a ticket actually moves through a
 * kitchen. Realtime keeps every screen in sync — the person on the register and
 * the person at the fryer must never disagree about what is cooking.
 */
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import type { Role } from "@/lib/session";

export type Order = {
  id: string;
  code: string;
  source: string;
  customer_name: string | null;
  phone: string | null;
  mode: "delivery" | "pickup";
  status: "new" | "cooking" | "ready" | "done" | "cancelled";
  total: number;
  loyalty_code: string | null;
  note: string | null;
  created_at: string;
  order_items: {
    name: string;
    qty: number;
    unit_price: number;
    options: { label: string }[] | string[];
  }[];
};

const COLUMNS = [
  { key: "new",     title: "Nuevos",    next: "cooking", cta: "Empezar" },
  { key: "cooking", title: "Cocinando", next: "ready",   cta: "Listo" },
  { key: "ready",   title: "Listos",    next: "done",    cta: "Entregado" },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  web: "Web", whatsapp: "WhatsApp", phone: "Teléfono", walkin: "En tienda",
  doordash: "DoorDash", ubereats: "Uber Eats", grubhub: "Grubhub",
};

const money = (n: number) => "$" + Number(n ?? 0).toFixed(2);

/** Minutes since the ticket landed — the number that actually matters on a rush. */
function useAge(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}

function Ticket({
  o, cta, onAdvance, busy,
}: { o: Order; cta: string; onAdvance: () => void; busy: boolean }) {
  const age = useAge(o.created_at);
  // Colour by wait, not by status: a ticket sitting 20 minutes is the problem
  // regardless of which column it is in.
  const heat = age >= 20 ? "var(--red)" : age >= 10 ? "var(--ember)" : "var(--faint)";

  return (
    <article
      className="rounded-xl border p-3 mb-2"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <header className="flex items-baseline gap-2 mb-2">
        <span className="font-bold nums">{o.code}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
          {SOURCE_LABEL[o.source] ?? o.source}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
          {o.mode === "delivery" ? "Entrega" : "Recoger"}
        </span>
        <span className="ml-auto text-xs font-bold nums" style={{ color: heat }}>
          {age}m
        </span>
      </header>

      {(o.customer_name || o.phone) && (
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          {o.customer_name}
          {o.phone && <> · <a href={`tel:${o.phone}`} className="underline">{o.phone}</a></>}
        </p>
      )}

      <ul className="text-sm mb-2 space-y-1">
        {o.order_items?.map((it, i) => {
          const opts = (it.options ?? []) as (string | { label: string })[];
          const labels = opts.map((x) => (typeof x === "string" ? x : x.label));
          return (
            <li key={i}>
              <span className="nums font-semibold">{it.qty}×</span> {it.name}
              {labels.length > 0 && (
                <span className="block pl-5 text-xs" style={{ color: "var(--yellow)" }}>
                  {labels.join(" · ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {o.note && (
        <p className="text-xs italic mb-2" style={{ color: "var(--ember)" }}>
          “{o.note}”
        </p>
      )}

      {o.loyalty_code && (
        <p className="text-xs mb-2 font-bold" style={{ color: "var(--yellow)" }}>
          🎉 Plato gratis · {o.loyalty_code}
        </p>
      )}

      <footer className="flex items-center gap-2">
        <span className="nums font-bold">{money(o.total)}</span>
        <button
          onClick={onAdvance}
          disabled={busy}
          className="ml-auto px-3 py-1.5 rounded-full text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--yellow)", color: "#0A0B0E" }}
        >
          {cta}
        </button>
      </footer>
    </article>
  );
}

export default function OrderBoard({
  initial, role,
}: { initial: Order[]; role: Role }) {
  const [orders, setOrders] = useState<Order[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  // Realtime: every console reflects the same board without anyone refreshing.
  useEffect(() => {
    const sb = browserClient();
    const ch = sb
      .channel("orders-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => location.reload(),
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  async function advance(o: Order, next: string) {
    setBusy(o.id);
    const sb = browserClient();
    const { error } = await sb.from("orders").update({ status: next }).eq("id", o.id);
    setBusy(null);
    if (error) {
      alert("No se pudo actualizar el pedido. Intenta de nuevo.");
      return;
    }
    // Leaving the board once done keeps the queue showing work, not history.
    setOrders((prev) =>
      next === "done"
        ? prev.filter((x) => x.id !== o.id)
        : prev.map((x) => (x.id === o.id ? { ...x, status: next as Order["status"] } : x)),
    );
  }

  return (
    <>
      <div className="flex items-baseline gap-3 mb-3">
        <h1 className="text-xl font-black">Pedidos de hoy</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {orders.length} activos
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.key);
          return (
            <section key={col.key}>
              <h2
                className="text-xs font-bold uppercase tracking-wider mb-2 pb-1 border-b"
                style={{ color: "var(--muted)", borderColor: "var(--line)" }}
              >
                {col.title}{" "}
                <span className="nums" style={{ color: "var(--faint)" }}>{list.length}</span>
              </h2>

              {list.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--faint)" }}>
                  —
                </p>
              ) : (
                list.map((o) => (
                  <Ticket
                    key={o.id}
                    o={o}
                    cta={col.cta}
                    busy={busy === o.id}
                    onAdvance={() => advance(o, col.next)}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>

      {role === "staff" && (
        <p className="mt-6 text-xs" style={{ color: "var(--faint)" }}>
          Para cambiar precios o el menú, pídeselo al dueño.
        </p>
      )}
    </>
  );
}
