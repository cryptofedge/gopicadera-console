"use client";

import { useSession } from "@/lib/session";
import { useQuery } from "@/lib/useQuery";
import OrderBoard, { type Order } from "./OrderBoard";

const SELECT =
  "id, code, source, customer_name, phone, mode, status, total, payment, notified_at, taken_by_name, handled_by_name, loyalty_code, note, created_at, order_items(name, qty, unit_price, options)";

export default function OrdersPage() {
  const { profile } = useSession();

  // Today's queue. Completed and cancelled tickets drop off so the board shows
  // work, not history — reports are where the past lives.
  const { data, loading, error } = useQuery<Order[]>((sb) => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return sb
      .from("orders")
      .select(SELECT)
      .gte("created_at", since.toISOString())
      .in("status", ["new", "cooking", "ready"])
      .order("created_at", { ascending: true }) as never;
  });

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando pedidos…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  return <OrderBoard initial={data ?? []} role={profile!.role} />;
}
