"use client";

import { useQuery } from "@/lib/useQuery";

const money = (n: number) => "$" + Number(n ?? 0).toFixed(2);

type Row = {
  total: number;
  status: string;
  source: string;
  created_at: string;
  handled_by_name: string | null;
  taken_by_name: string | null;
  order_items: { name: string; qty: number }[] | null;
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Página web",
  whatsapp: "WhatsApp",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  grubhub: "Grubhub",
  phone: "Teléfono",
  walkin: "En tienda",
};

/** A labelled bar, sized against the biggest value in its own list. */
function Bar({ label, value, max, suffix }: {
  label: string; value: number; max: number; suffix: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm">{label}</span>
        <span className="ml-auto text-sm font-bold nums">{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full"
             style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: "var(--yellow)" }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4"
         style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1"
           style={{ color: "var(--faint)" }}>{label}</div>
      <div className="text-2xl font-black nums" style={{ color: "var(--yellow)" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  // Only completed orders count as revenue. Counting tickets still in the queue
  // would make the number drift every time someone cancels.
  const { data, loading, error } = useQuery<Row[]>(
    (sb) =>
      sb
        .from("orders")
        .select("total, status, source, created_at, handled_by_name, taken_by_name, order_items(name, qty)")
        .eq("status", "done")
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()) as never,
  );

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando reportes…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const rows = data ?? [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = rows.filter((o) => new Date(o.created_at) >= startOfDay);

  const sum = (a: Row[]) => a.reduce((t, o) => t + Number(o.total ?? 0), 0);
  const avg = (a: Row[]) => (a.length ? sum(a) / a.length : 0);

  // Best sellers by quantity actually sold, not by what we featured.
  const counts = new Map<string, number>();
  rows.forEach((o) =>
    (o.order_items ?? []).forEach((it) =>
      counts.set(it.name, (counts.get(it.name) ?? 0) + Number(it.qty ?? 0)),
    ),
  );
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const bySource = rows.reduce<Record<string, number>>((acc, o) => {
    acc[o.source] = (acc[o.source] ?? 0) + 1;
    return acc;
  }, {});

  // Revenue per channel, not just ticket count — three Uber orders at $40 are
  // not the same business as three walk-ins at $8.
  const channelMoney = new Map<string, number>();
  rows.forEach((o) => channelMoney.set(o.source, (channelMoney.get(o.source) ?? 0) + Number(o.total ?? 0)));
  const channels = [...channelMoney.entries()].sort((a, b) => b[1] - a[1]);
  const channelMax = channels[0]?.[1] ?? 0;

  // Orders closed per person. Anything that came off a platform without a
  // human touching it is left out rather than credited to nobody.
  const perPerson = new Map<string, { count: number; money: number }>();
  rows.forEach((o) => {
    const who = o.handled_by_name ?? o.taken_by_name;
    if (!who) return;
    const cur = perPerson.get(who) ?? { count: 0, money: 0 };
    perPerson.set(who, { count: cur.count + 1, money: cur.money + Number(o.total ?? 0) });
  });
  const people = [...perPerson.entries()].sort((a, b) => b[1].money - a[1].money);
  const peopleMax = people[0]?.[1].money ?? 0;

  return (
    <>
      <h1 className="text-xl font-black mb-3">Reportes</h1>

      <div className="grid gap-3 mb-6"
           style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Stat label="Hoy" value={money(sum(today))} sub={`${today.length} pedidos`} />
        <Stat label="7 días" value={money(sum(rows))} sub={`${rows.length} pedidos`} />
        <Stat label="Ticket promedio" value={money(avg(rows))} sub="últimos 7 días" />
        <Stat
          label="Canales"
          value={String(Object.keys(bySource).length)}
          sub={Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
        />
      </div>

      <div className="grid gap-4 mb-6"
           style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="rounded-xl border p-4"
             style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--muted)" }}>Ventas por canal · 7 días</h2>
          {channels.length === 0 && (
            <p className="text-xs" style={{ color: "var(--faint)" }}>Sin datos todavía.</p>
          )}
          {channels.map(([src, amount]) => (
            <Bar key={src} label={SOURCE_LABEL[src] ?? src} value={amount}
                 max={channelMax} suffix={money(amount)} />
          ))}
        </div>

        <div className="rounded-xl border p-4"
             style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--muted)" }}>Por persona · 7 días</h2>
          {people.length === 0 && (
            <p className="text-xs" style={{ color: "var(--faint)" }}>
              Sin pedidos atendidos por el equipo todavía.
            </p>
          )}
          {people.map(([who, v]) => (
            <Bar key={who} label={who} value={v.money} max={peopleMax}
                 suffix={`${money(v.money)} · ${v.count}`} />
          ))}
          <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>
            Cuenta los pedidos que cada quien cerró. Los que entran solos desde
            las plataformas no se le cuentan a nadie.
          </p>
        </div>
      </div>

      <h2 className="text-xs font-bold uppercase tracking-wider mb-2 pb-1 border-b"
          style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
        Más vendidos · 7 días
      </h2>

      <div className="rounded-xl border overflow-hidden"
           style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <tbody>
            {top.length === 0 && (
              <tr><td className="px-3 py-8 text-center" style={{ color: "var(--faint)" }}>
                Todavía no hay pedidos completados.
              </td></tr>
            )}
            {top.map(([name, qty], i) => (
              <tr key={name} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 w-8 nums" style={{ color: "var(--faint)" }}>{i + 1}</td>
                <td className="px-3 py-2">{name}</td>
                <td className="px-3 py-2 text-right nums font-bold">{qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
        Solo cuentan los pedidos entregados. Los precios son los del momento de
        la venta, así que subir un precio hoy no cambia los reportes de ayer.
      </p>
    </>
  );
}
