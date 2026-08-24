"use client";

/**
 * Console navigation.
 *
 * Owner-only sections are not rendered at all for staff rather than rendered
 * disabled. A greyed-out "Precios" tab just tells a staff member there is
 * something they are missing; leaving it out keeps their console focused on
 * the shift. The database refuses the write either way.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Role } from "@/lib/session";

type Item = { href: string; label: string; owner?: boolean };

const ITEMS: Item[] = [
  { href: "/orders",    label: "Pedidos" },
  { href: "/payments",  label: "Pagos" },
  { href: "/history",   label: "Historial" },
  { href: "/inventory", label: "Inventario" },
  { href: "/menu",      label: "Menú",       owner: true },
  { href: "/integrations", label: "Canales", owner: true },
  { href: "/promo",     label: "Promoción" },
  { href: "/staff",     label: "Equipo",     owner: true },
  { href: "/reports",   label: "Reportes",   owner: true },
  { href: "/settings",  label: "Ajustes",    owner: true },
];

export default function Nav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const { signOut } = useSession();
  const items = ITEMS.filter((i) => !i.owner || role === "owner");

  return (
    <nav
      className="flex items-center gap-1 px-4 py-2 border-b sticky top-0 z-40 backdrop-blur"
      style={{ borderColor: "var(--line)", background: "rgba(10,11,14,.82)" }}
    >
      <span className="font-black tracking-tight mr-3 select-none">
        <span style={{ color: "var(--ember)" }}>GO</span>
        <span>PICADERA</span>
      </span>

      {items.map((i) => {
        const active = path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
            style={{
              background: active ? "var(--yellow)" : "transparent",
              color: active ? "#0A0B0E" : "var(--muted)",
            }}
          >
            {i.label}
          </Link>
        );
      })}

      <span className="ml-auto flex items-center gap-3 text-sm">
        <span style={{ color: "var(--faint)" }}>{name}</span>
        <span
          className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
          style={{
            border: "1px solid var(--line-warm)",
            color: role === "owner" ? "var(--yellow)" : "var(--muted)",
          }}
        >
          {role === "owner" ? "Dueño" : "Staff"}
        </span>
        {/* Was a POST to a route handler, so a prefetch or an <img> could not
            trigger it. With no server, sign-out is a direct Supabase call --
            still not reachable by anything but a real click. */}
        <button
          onClick={() => void signOut()}
          className="text-sm"
          style={{ color: "var(--faint)" }}
        >
          Salir
        </button>
      </span>
    </nav>
  );
}
