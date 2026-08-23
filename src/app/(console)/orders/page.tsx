import { requireStaff } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import OrderBoard, { type Order } from "./OrderBoard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const me = await requireStaff();
  const sb = await serverClient();

  // Today's queue. Completed and cancelled tickets drop off so the board shows
  // work, not history — reports are where the past lives.
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data } = await sb
    .from("orders")
    .select(
      "id, code, source, customer_name, phone, mode, status, total, loyalty_code, note, created_at, order_items(name, qty, unit_price, options)",
    )
    .gte("created_at", since.toISOString())
    .in("status", ["new", "cooking", "ready"])
    .order("created_at", { ascending: true });

  return <OrderBoard initial={(data ?? []) as unknown as Order[]} role={me.role} />;
}
