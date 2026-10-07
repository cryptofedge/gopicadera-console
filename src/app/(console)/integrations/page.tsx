"use client";

/**
 * Everything this console connects to: delivery marketplaces, the point of
 * sale, and the WhatsApp number. Owner-only.
 *
 * Meta, TikTok and Google Ads are the providers with a real connection flow: the button
 * below calls a Supabase Edge Function that redirects to the platform's own
 * consent screen, and the callback stores the resulting token server-side —
 * the owner never sees or pastes a key. Everything else still requires the
 * restaurant to be approved as a partner first, which then yields a store id
 * and a key pair to paste. `oauth: true` on a card is reserved for a provider
 * actually wired through a redirect like that; it used to be claimed for
 * Square, Clover, Meta and TikTok before any of them had one, and that
 * mismatch is the bug this comment is here to stop from coming back.
 *
 * Secrets are write-only from here: once saved, the field shows that a key
 * exists and never its value. Staff cannot open this page at all, and RLS
 * refuses them the table even if they craft the request by hand.
 */
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";

type Provider =
  | "doordash" | "ubereats" | "grubhub"
  | "whatsapp"
  | "square" | "clover" | "toast" | "lightspeed"
  | "google_ads" | "meta_ads" | "tiktok_ads";
type Kind = "delivery" | "messaging" | "pos" | "ads";
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
 * owner never handles a key. Right now that is Meta, TikTok and Google Ads, through the
 * Edge Functions named by `startFn`. Everyone else below needs approval, a
 * real redirect-based connection this console does not have yet, or both —
 * so the card says so instead of pretending otherwise.
 */
const META: Record<Provider, { name: string; blurb: string; portal: string; color: string; oauth?: boolean; startFn?: string }> = {
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
    blurb: "Pide la integración en el portal de desarrolladores de Square. Ellos aprueban y dan las llaves.",
    portal: "squareup.com",
    color: "#3E4348",
  },
  clover: {
    name: "Clover",
    blurb: "Pide acceso de API a Clover. Aprueban y dan un ID de app y una llave.",
    portal: "clover.com",
    color: "#0B7C3E",
  },
  toast: {
    name: "Toast",
    blurb: "Toast exige aprobación de socio antes de dar acceso a la API.",
    portal: "toasttab.com",
    color: "#FF4C00",
  },
  lightspeed: {
    name: "Lightspeed",
    blurb: "Pide acceso de API a Lightspeed Restaurant. Aprueban y dan un ID y una llave.",
    portal: "lightspeedhq.com",
    color: "#F5344C",
  },

  meta_ads: {
    name: "Meta",
    blurb: "Facebook e Instagram. Conecta tu propia cuenta de Meta Business con un botón — nunca copias una llave.",
    portal: "business.facebook.com",
    color: "#0866FF",
    oauth: true,
    startFn: "meta-oauth-start",
  },
  google_ads: {
    name: "Google Ads",
    blurb: "Conecta tu propia cuenta de Google Ads con un botón — nunca copias una llave.",
    portal: "ads.google.com",
    color: "#4285F4",
    oauth: true,
    startFn: "google-ads-oauth-start",
  },
  tiktok_ads: {
    name: "TikTok",
    blurb: "Conecta tu propia cuenta de TikTok for Business con un botón — nunca copias una llave.",
    portal: "business.tiktok.com",
    color: "#FE2C55",
    oauth: true,
    startFn: "tiktok-oauth-start",
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
    kind: "ads",
    title: "Publicidad",
    note: "Desde dónde salen los anuncios. Lo que se anuncia y con cuánto se maneja en Promoción.",
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

/**
 * Pago con tarjeta en la web (Stripe). This does not belong in the Provider/kind model above: Stripe is
 * not a channel that brings in orders, and it is never OAuth or paste-a-key-here — the restaurant uses its
 * own Stripe account directly, and the secret key lives only in Stripe and in the Edge Functions' own
 * config, never in this browser or this database. So there is no Connect button and no form here, only a
 * read-only status read from the stripe-status Edge Function (owner-only; never returns the key itself).
 */
type StripeStatusValue = "not_configured" | "partial" | "test" | "live" | "unknown";
type StripeStatus = {
  status: StripeStatusValue;
  databaseApplied: boolean;
  keysConfigured: boolean;
  keyMode: "test" | "live" | "unknown" | null;
  webhookConfigured: boolean;
  liveAllowed: boolean;
  missing: string[];
};

const STRIPE_STATUS_LABEL: Record<StripeStatusValue, string> = {
  not_configured: "Sin configurar",
  partial: "A medias",
  test: "Modo prueba",
  live: "Modo real",
  unknown: "Clave con formato raro",
};
const STRIPE_STATUS_COLOR: Record<StripeStatusValue, string> = {
  not_configured: "var(--faint)",
  partial: "var(--yellow)",
  test: "var(--yellow)",
  live: "var(--green)",
  unknown: "var(--red)",
};
const STRIPE_MISSING_LABEL: Record<string, string> = {
  database: "aplicar stripe_payments.sql en la base de datos",
  stripe_key: "poner la clave secreta de Stripe",
  webhook: "configurar el webhook de Stripe",
};

function StripeStatusCard() {
  const { data, loading, error } = useQuery<StripeStatus>(
    (sb) => sb.functions.invoke("stripe-status") as never,
  );

  return (
    <section className="mb-7">
      <h2 className="text-xs font-bold uppercase tracking-wider mb-1 pb-1 border-b"
          style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
        Pagos en línea
      </h2>
      <p className="text-xs mb-3" style={{ color: "var(--faint)" }}>
        El pago con tarjeta en la página web. No hay botón para conectar aquí a propósito: Stripe usa tu
        propia cuenta directamente, nunca una llave pegada en la consola. Se conecta invitando a Fellito
        como Developer en Stripe (Configuración → Equipo → Invitar); él hace el resto.
      </p>

      <div className="rounded-xl border p-4 max-w-md"
           style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        {loading && <p className="text-xs" style={{ color: "var(--faint)" }}>Revisando…</p>}
        {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
        {data && (
          <>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-2.5 h-2.5 rounded-full flex-none"
                    style={{ background: STRIPE_STATUS_COLOR[data.status] }} />
              <span className="font-bold">Stripe</span>
              <span className="ml-auto text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: STRIPE_STATUS_COLOR[data.status] }}>
                {STRIPE_STATUS_LABEL[data.status]}
              </span>
            </div>

            {data.missing.length > 0 ? (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Falta: {data.missing.map((m) => STRIPE_MISSING_LABEL[m] ?? m).join(", ")}.
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Base de datos, clave y webhook están puestos.
              </p>
            )}

            {data.status === "live" && !data.liveAllowed && (
              <p className="text-xs mt-2" style={{ color: "var(--red)" }}>
                Ojo: la clave puesta es de modo real, pero los cobros reales siguen apagados a propósito
                (falta ALLOW_LIVE). Nadie puede cobrar de verdad todavía.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

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
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  // Meta/TikTok's own redirect lands back here with ?oauth=meta|tiktok&status=connected|error[&reason=...].
  // Read it once, show it, then strip it from the URL so a refresh does not repeat the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("oauth");
    if (!provider) return;
    const status = params.get("status");
    const reason = params.get("reason");
    const name = provider === "meta" ? "Meta" : provider === "tiktok" ? "TikTok" : provider === "google" ? "Google Ads" : provider;
    setBanner(
      status === "connected"
        ? { ok: true, text: `${name} quedó conectado.` }
        : { ok: false, text: `${name} no se pudo conectar${reason ? `: ${reason}` : ""}.` },
    );
    params.delete("oauth");
    params.delete("status");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // supabase-js turns any non-2xx into a generic "returned a non-2xx status code"; the real reason is in
  // the response body, so read it and say something the owner can act on.
  async function explainStartError(err: unknown, name: string): Promise<string> {
    const res = (err as { context?: Response } | null)?.context;
    if (res && typeof res.json === "function") {
      try {
        const body = await res.json();
        if (body?.error === "not_configured") {
          return `La conexión con ${name} todavía no está lista: falta un paso del lado técnico. Avísale a Fellito.`;
        }
        if (body?.error === "forbidden") return "Solo una cuenta de dueño puede conectar esto.";
      } catch { /* fall through to the generic message */ }
    }
    return `No se pudo iniciar la conexión con ${name}. Intenta de nuevo en un momento.`;
  }

  async function connectVia(provider: Provider) {
    const fn = META[provider].startFn;
    if (!fn) return;
    setConnecting(provider);
    setBanner(null);
    const { data, error: err } = await browserClient().functions.invoke(fn);
    if (err || !data?.url) {
      setConnecting(null);
      // The banner, not saveError: saveError only renders inside the manual-key form, which these cards do not have.
      setBanner({ ok: false, text: await explainStartError(err, META[provider].name) });
      return;
    }
    window.location.href = data.url;
  }

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

  // Split by how each provider actually connects, so the explainer below can
  // never contradict the cards above it.
  const shown = rows.map((r) => r.provider).filter((pv) => META[pv]);
  const oauthNames = shown.filter((pv) => META[pv].oauth).map((pv) => META[pv].name);
  const partnerNames = shown
    .filter((pv) => !META[pv].oauth && pv !== "whatsapp")
    .map((pv) => META[pv].name);

  return (
    <>
      <h1 className="text-xl font-black mb-1">Conexiones</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Todo lo que la consola conecta con el mundo de afuera.
      </p>

      {banner && (
        <div className="rounded-xl border p-3 mb-4 max-w-md text-xs font-bold"
             style={{
               background: "var(--surface)",
               borderColor: banner.ok ? "var(--green)" : "var(--red)",
               color: banner.ok ? "var(--green)" : "var(--red)",
             }}>
          {banner.text}
        </div>
      )}

      <StripeStatusCard />

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
                {(!m.startFn || r.status !== "connected") && (
                  <button
                    onClick={() =>
                      m.startFn
                        ? connectVia(r.provider)
                        : setOpen(open === r.provider ? null : r.provider)
                    }
                    disabled={connecting === r.provider}
                    className="px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                    style={{ background: "var(--yellow)", color: "#0A0B0E" }}
                  >
                    {connecting === r.provider
                      ? "Conectando…"
                      : m.startFn
                        ? r.status === "disconnected" ? `Conectar con ${m.name}` : "Reintentar conexión"
                        : r.status === "disconnected" ? "Conectar" : "Editar"}
                  </button>
                )}
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

              {open === r.provider && !m.startFn && (
                <form
                  action={(fd) => save(r.provider, fd)}
                  className="mt-4 pt-4 border-t grid gap-2.5"
                  style={{ borderColor: "var(--line)" }}
                >
                  <p className="text-xs" style={{ color: "var(--faint)" }}>
                    Estos datos salen del portal de {m.portal}.
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

      {/* Derived from META rather than written out by hand. The last version
          of this paragraph listed the delivery and POS names literally, and
          went stale the moment the ad platforms were added. */}
      <div className="rounded-xl border p-4 max-w-3xl"
           style={{ background: "var(--surface)", borderColor: "var(--line-warm)" }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--yellow)" }}>
          Cómo se conecta cada uno
        </h2>

        {oauthNames.length > 0 && (
          <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--muted)" }}>
            <strong style={{ color: "var(--text)" }}>
              {oauthNames.join(", ")}
            </strong>{" "}
            se conectan con un botón: te mandan a tu propia cuenta, la autorizas y
            listo. Nunca tienes que copiar una llave.
          </p>
        )}

        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>
            {partnerNames.join(", ")}
          </strong>{" "}
          no funcionan así: hay que pedirles acceso desde su portal de comercios
          y esperar a que lo aprueben. Cuando aprueben te dan un ID de tienda y
          un par de llaves, y eso es lo que se pega aquí. Mientras tanto se
          quedan en “Esperando aprobación”.
        </p>
      </div>
    </>
  );
}
