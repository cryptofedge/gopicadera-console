"use client";

/**
 * Everything this console connects to: delivery marketplaces, the point of
 * sale, and the WhatsApp number. Owner-only.
 *
 * Two kinds of connection live here, and the difference matters. Square, Clover
 * and Lightspeed offer real OAuth — one button, no keys ever in the owner's
 * hands. Uber Eats, DoorDash, Grubhub and Toast require the restaurant to be
 * approved as an API partner first, which then yields a store id and a key
 * pair to paste. The card says which it is rather than showing a Connect button
 * that cannot work yet.
 *
 * Secrets are write-only from here: once saved, the field shows that a key
 * exists and never its value. Staff cannot open this page at all, and RLS
 * refuses them the table even if they craft the request by hand.
 */
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";

type Provider =
  | "doordash" | "ubereats" | "grubhub"
  | "whatsapp"
  | "square" | "clover" | "toast" | "lightspeed";
type Kind = "delivery" | "messaging" | "pos";
type Status = "disconnected" | "pending" | "connected" | "error";

type Row = {
  provider: Provider;
  kind: Kind;
  status: Status;
  store_id: string | null;
  client_id: string | null;
  has_secret?: boolean;
  last_order_at: string | null;
  last_error: string | null;
  auto_accept: boolean;
};

/**
 * `oauth: true` means the provider genuinely supports click-to-connect and the
 * owner never handles a key. The rest require the restaurant to be approved as
 * a partner first, which is a business step no amount of code shortens — so the
 * card says so instead of pretending otherwise.
 */
const META: Record<Provider, { name: string; blurb: string; portal: string; color: string; oauth?: boolean }> = {
  ubereats: {
    name: "Uber Eats",
    blurb: "Pide acceso de API en Uber Eats Manager. Ellos aprueban y te dan las llaves.",
    portal: "merchants.ubereats.com",
    color: "#06C167",
  },
  doordash: {
    name: "DoorDash",
    blurb: "Solicita la integración en el Merchant Portal de DoorDash.",
    portal: "merchant.doordash.com",
    color: "#FF3008",
  },
  grubhub: {
    name: "Grubhub",
    blurb: "Pide la integración a tu representante de Grubhub for Restaurants.",
    portal: "restaurant.grubhub.com",
    color: "#F63440",
  },
  whatsapp: {
    name: "WhatsApp Business",
    blurb: "Número nuevo del negocio. Envía la confirmación cuando se cobra el pedido.",
    portal: "business.facebook.com",
    color: "#25D366",
  },

  square: {
    name: "Square",
    blurb: "Conecta directo con tu cuenta de Square. Sincroniza menú, precios y ventas.",
    portal: "squareup.com",
    color: "#3E4348",
    oauth: true,
  },
  clover: {
    name: "Clover",
    blurb: "Conecta con tu cuenta de Clover desde aquí.",
    portal: "clover.com",
    color: "#0B7C3E",
    oauth: true,
  },
  toast: {
    name: "Toast",
    blurb: "Toast exige aprobación de socio antes de dar acceso a la API.",
    portal: "toasttab.com",
    color: "#FF4C00",
  },
  lightspeed: {
    name: "Lightspeed",
    blurb: "Conecta con tu cuenta de Lightspeed Restaurant.",
    portal: "lightspeedhq.com",
    color: "#F5344C",
    oauth: true,
  },
};

const SECTIONS: { kind: Kind; title: string; note: string }[] = [
  {
    kind: "delivery",
    title: "Canales de pedido",
    note: "Los pedidos de todas las plataformas caen en la misma pantalla de Pedidos, marcados con su canal.",
  },
  {
    kind: "pos",
    title: "Punto de venta",
    note: "Conecta la caja para que el menú, los precios y las ventas del mostrador cuadren con la consola. Solo se puede conectar un sistema a la vez.",
  },
  {
    kind: "messaging",
    title: "Mensajería",
    note: "El número por el que sale la confirmación de pago al cliente.",
  },
];

const STATUS_LABEL: Record<Status, string> = {
  connected: "Conectado",
  pending: "Esperando aprobación",
  disconnected: "Sin conectar",
  error: "Con problema",
};

const STATUS_COLOR: Record<Status, string> = {
  connected: "var(--green)",
  pending: "var(--yellow)",
  disconnected: "var(--faint)",
  error: "var(--red)",
};

function ago(iso: string | null) {
  if (!iso) return "todavía no llegan pedidos";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "último pedido hace segundos";
  if (mins < 60) return `último pedido hace ${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `último pedido hace ${h}h`;
  return `último pedido hace ${Math.round(h / 24)}d`;
}

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

export default function IntegrationsPage() {
  const { data, loading, error, reload } = useQuery<Row[]>(
    (sb) =>
      sb
        .from("integrations")
        .select("provider, kind, status, store_id, client_id, has_secret, last_order_at, last_error, auto_accept")
        .order("provider") as never,
  );

  const [open, setOpen] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function save(provider: Provider, fd: FormData) {
    setBusy(true);
    setSaveError("");

    const secret = String(fd.get("client_secret") ?? "").trim();
    const patch: Record<string, unknown> = {
      store_id: String(fd.get("store_id") ?? "").trim() || null,
      client_id: String(fd.get("client_id") ?? "").trim() || null,
      // Blank means "leave the existing key alone" rather than "erase it" —
      // otherwise re-saving to change the store id would silently wipe the key.
      ...(secret ? { client_secret: secret } : {}),
      status: "pending",
    };

    const { error: err } = await browserClient()
      .from("integrations")
      .update(patch)
      .eq("provider", provider);

    setBusy(false);
    if (err) { setSaveError(err.message); return; }
    setOpen(null);
    reload();
  }

  async function disconnect(provider: Provider) {
    const isPos = rows.find((r) => r.provider === provider)?.kind === "pos";
    const warn = isPos
      ? `¿Desconectar ${META[provider].name}? El menú y las ventas del mostrador dejarán de sincronizarse.`
      : `¿Desconectar ${META[provider].name}? Dejarán de entrar pedidos de este canal.`;
    if (!confirm(warn)) return;
    setBusy(true);
    await browserClient()
      .from("integrations")
      .update({ status: "disconnected", client_secret: null })
      .eq("provider", provider);
    setBusy(false);
    reload();
  }

  async function toggleAuto(row: Row) {
    setBusy(true);
    await browserClient()
      .from("integrations")
      .update({ auto_accept: !row.auto_accept })
      .eq("provider", row.provider);
    setBusy(false);
    reload();
  }

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando canales…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const rows = data ?? [];

  return (
    <>
      <h1 className="text-xl font-black mb-1">Conexiones</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Todo lo que la consola conecta con el mundo de afuera.
      </p>

{SECTIONS.map((sec) => {
  const group = rows.filter((r) => r.kind === sec.kind);
  if (group.length === 0) return null;
  return (
    <section key={sec.kind} className="mb-7">
      <h2 className="text-xs font-bold uppercase tracking-wider mb-1 pb-1 border-b"
          style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
        {sec.title}
      </h2>
      <p className="text-xs mb-3" style={{ color: "var(--faint)" }}>{sec.note}</p>

      <div className="grid gap-3"
           style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        {group.map((r) => {
          const m = META[r.provider];
          return (
            <div key={r.provider} className="rounded-xl border p-4"
                 style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-2.5 h-2.5 rounded-full flex-none"
                      style={{ background: m.color }} />
                <span className="font-bold">{m.name}</span>
                <span className="ml-auto text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: STATUS_COLOR[r.status] }}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                {r.status === "connected" ? ago(r.last_order_at) : m.blurb}
              </p>

              {r.last_error && (
                <p className="text-xs mb-3" style={{ color: "var(--red)" }}>
                  {r.last_error}
                </p>
              )}

              {r.status === "connected" && r.provider !== "whatsapp" && (
                <label className="flex items-center gap-2 mb-3 text-xs cursor-pointer">
                  <input type="checkbox" checked={r.auto_accept} disabled={busy}
                         onChange={() => toggleAuto(r)} className="w-3.5 h-3.5" />
                  <span style={{ color: "var(--muted)" }}>
                    Aceptar pedidos automáticamente
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(open === r.provider ? null : r.provider)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}
                >
                  {r.status === "disconnected"
                    ? m.oauth ? `Conectar con ${m.name}` : "Conectar"
                    : "Editar"}
                </button>
                {r.status !== "disconnected" && (
                  <button
                    onClick={() => disconnect(r.provider)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: "var(--surface-3)", color: "var(--muted)" }}
                  >
                    Desconectar
                  </button>
                )}
              </div>

              {open === r.provider && (
                <form
                  action={(fd) => save(r.provider, fd)}
                  className="mt-4 pt-4 border-t grid gap-2.5"
                  style={{ borderColor: "var(--line)" }}
                >
                  <p className="text-xs" style={{ color: "var(--faint)" }}>
                    {m.oauth
                      ? `Al guardar te mandamos a ${m.portal} para que autorices la conexión con tu propia cuenta. No hace falta copiar llaves.`
                      : `Estos datos salen del portal de ${m.portal}.`}
                  </p>
                  <input name="store_id" defaultValue={r.store_id ?? ""}
                         placeholder="ID de tienda"
                         className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
                  <input name="client_id" defaultValue={r.client_id ?? ""}
                         placeholder="Client ID"
                         className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
                  <input name="client_secret" type="password"
                         placeholder={r.has_secret ? "•••••••• (guardada)" : "Client secret"}
                         className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
                  <p className="text-xs" style={{ color: "var(--faint)" }}>
                    La clave se guarda cifrada y no se vuelve a mostrar. Déjala
                    en blanco para no cambiarla.
                  </p>
                  {saveError && (
                    <p className="text-xs" style={{ color: "var(--red)" }} role="alert">{saveError}</p>
                  )}
                  <button disabled={busy}
                          className="px-4 py-2 rounded-full text-xs font-bold justify-self-start disabled:opacity-50"
                          style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
                    {busy ? "Guardando…" : "Guardar"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
})}

      <div className="rounded-xl border p-4 max-w-3xl"
           style={{ background: "var(--surface)", borderColor: "var(--line-warm)" }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--yellow)" }}>
          Cómo se conecta cada uno
        </h2>
        <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Square, Clover y Lightspeed</strong>{" "}
          se conectan con un botón: te mandan a tu propia cuenta, la autorizas y
          listo. Nunca tienes que copiar una llave.
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Uber Eats, DoorDash, Grubhub y Toast</strong>{" "}
          no funcionan así: hay que pedirles acceso de API desde su portal de
          comercios y esperar a que lo aprueben. Cuando aprueben te dan un ID de
          tienda y un par de llaves, y eso es lo que se pega aquí. Mientras
          tanto el canal se queda en “Esperando aprobación”.
        </p>
      </div>
    </>
  );
}
