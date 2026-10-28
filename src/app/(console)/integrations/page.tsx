"use client";

/**
 * Everything this console connects to: delivery marketplaces, the point of
 * sale, and the WhatsApp number. Owner-only.
 *
 * Meta, TikTok and Google Ads are the providers with a real connection flow: the button
 * below calls a Supabase Edge Function that redirects to the platform's own
 * consent screen, and the callback stores the resulting token server-side —
 * the owner never sees or pastes a token. She does create each platform's
 * developer app herself and saves its id and secret on the card (ads_apps,
 * write-only like every other secret here), and once connected she picks which
 * of the ad accounts and Pages the login reaches is Go Picadera's. Everything else still requires the
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
import { browserClient, IS_DEMO } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";
import { accountLabel, chosenAdAccount, chosenPage, NO_ACCOUNT_CHOSEN, pageLabel } from "@/lib/ads-choice";
import type { AdsDetails } from "@/lib/ads-choice";

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
  // Non-secret facts the connect step recorded: every ad account and Page the login reaches, the owner's
  // choice among them, and the token's expiry. See src/lib/ads-choice.ts.
  details?: AdsDetails | null;
  last_order_at: string | null;
  last_error: string | null;
  auto_accept: boolean;
};

type AdsProvider = "meta_ads" | "tiktok_ads" | "google_ads";

/** The owner's own developer app for an ad platform (ads_apps). The secret itself never reaches the browser. */
type AdsAppRow = { provider: AdsProvider; app_id: string | null; login_config_id: string | null; has_secret: boolean };

const isAdsProvider = (p: Provider): p is AdsProvider => p === "meta_ads" || p === "tiktok_ads" || p === "google_ads";

/** What a connected ad platform is attached to, so the owner can see it is the right one. */
function adsSummary(r: Row): string {
  const parts: string[] = [];
  const account = chosenAdAccount(r.store_id, r.details);
  parts.push(account ? `Cuenta ${accountLabel(account)}` : "Sin cuenta elegida");
  if (r.provider === "meta_ads") {
    const page = chosenPage(r.details);
    if (!page) parts.push("sin Página elegida");
    else {
      parts.push(`Página ${page.name ?? page.id}`);
      parts.push(page.instagram ? `Instagram ${page.instagram.username ? "@" + page.instagram.username : "vinculado"}` : "sin Instagram vinculado a la página");
    }
  }
  const exp = r.details?.token_expires_at;
  if (exp) parts.push(`vence el ${new Date(exp).toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}`);
  return parts.join(" · ");
}

// Where each platform sends the owner back after she approves. She pastes this exact address into her app.
// The demo build has a placeholder Supabase URL, so it shows the live project's address instead.
const LIVE_SUPABASE_URL = "https://kfuamhhfthfmavxppagb.supabase.co";
const SUPABASE_URL = ((IS_DEMO ? "" : process.env.NEXT_PUBLIC_SUPABASE_URL) || LIVE_SUPABASE_URL).replace(/\/$/, "");
const CALLBACK_SLUG: Record<AdsProvider, string> = { meta_ads: "meta", tiktok_ads: "tiktok", google_ads: "google-ads" };
const redirectUri = (p: AdsProvider) => `${SUPABASE_URL}/functions/v1/${CALLBACK_SLUG[p]}-oauth-callback`;

const APP_INFO: Record<AdsProvider, { title: string; idLabel: string; secretLabel: string; where: string; redirectWhere: string }> = {
  meta_ads: {
    title: "App de Meta",
    idLabel: "App ID",
    secretLabel: "App Secret",
    where: "En developers.facebook.com → tu app → Configuración → Básica.",
    redirectWhere: "Pégala en Inicio de sesión con Facebook para empresas → Configuración → URI de redireccionamiento de OAuth válidos.",
  },
  tiktok_ads: {
    title: "App de TikTok",
    idLabel: "App ID",
    secretLabel: "Secret",
    where: "En business-api.tiktok.com → My Apps → tu app.",
    redirectWhere: "Pégala como Advertiser redirect URL de tu app.",
  },
  google_ads: {
    title: "App de Google",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    where: "En console.cloud.google.com → APIs y servicios → Credenciales → tu cliente OAuth (aplicación web).",
    redirectWhere: "Pégala en URI de redireccionamiento autorizados de ese cliente.",
  },
};

/**
 * The owner's own app for one ad platform: the redirect address she pastes into it, and its id and secret,
 * saved through set_ads_app. Nothing goes in the Supabase dashboard. The secret is write-only from here.
 */
function AdsAppSection({ provider, app, onSaved }: { provider: AdsProvider; app: AdsAppRow | null; onSaved: () => void }) {
  const info = APP_INFO[provider];
  const saved = !!(app?.app_id && app?.has_secret);
  const [open, setOpen] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const uri = redirectUri(provider);

  async function copy() {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciona la dirección y cópiala a mano.");
    }
  }

  async function save(fd: FormData) {
    const appId = String(fd.get("app_id") ?? "").trim();
    if (saved && app?.app_id && appId !== app.app_id &&
        !confirm(`Cambiar el ${info.idLabel} desconecta ${info.title.replace("App de ", "")}: el permiso guardado es de la app anterior y habrá que conectar otra vez. ¿Seguir?`)) {
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await browserClient().rpc("set_ads_app", {
      p_provider: provider,
      p_app_id: appId,
      // Blank keeps the saved secret, so fixing the id never means retyping it.
      p_app_secret: String(fd.get("app_secret") ?? "").trim() || null,
      p_login_config_id: provider === "meta_ads" ? String(fd.get("login_config_id") ?? "").trim() || null : null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setOpen(false);
    onSaved();
  }

  return (
    <div className="mb-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold">{info.title}</span>
        <span className="text-[11px] font-bold" style={{ color: saved ? "var(--green)" : "var(--yellow)" }}>
          {saved ? "guardada" : app?.app_id ? "falta la clave secreta" : "sin guardar"}
        </span>
        {saved && (
          <button type="button" onClick={() => setOpen((v) => !v)}
                  className="ml-auto text-[11px] font-bold" style={{ color: "var(--muted)" }}>
            {open ? "Cerrar" : "Editar"}
          </button>
        )}
      </div>
      {saved && !open && (
        <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>{info.idLabel} {app?.app_id}</p>
      )}

      {open && (
        <form action={save} className="grid gap-2 mt-2">
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Dirección de regreso. {info.redirectWhere}
          </p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-[11px] break-all select-all" style={field}>{uri}</code>
            <button type="button" onClick={copy}
                    className="px-3 py-1.5 rounded-full text-xs font-bold flex-none"
                    style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
              {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--faint)" }}>{info.where}</p>
          <input name="app_id" defaultValue={app?.app_id ?? ""} placeholder={info.idLabel} required
                 autoComplete="off" spellCheck={false}
                 className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
          <input name="app_secret" type="password" autoComplete="new-password"
                 placeholder={app?.has_secret ? `${info.secretLabel}: guardado — déjalo vacío para conservarlo` : info.secretLabel}
                 className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
          {provider === "meta_ads" && (
            <input name="login_config_id" defaultValue={app?.login_config_id ?? ""}
                   placeholder="ID de configuración (opcional, Inicio de sesión para empresas)"
                   autoComplete="off" spellCheck={false}
                   className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
          )}
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            La clave secreta se guarda en la base de datos y no se vuelve a mostrar, ni a ti.
          </p>
          {error && <p className="text-xs" style={{ color: "var(--red)" }} role="alert">{error}</p>}
          <button disabled={busy}
                  className="px-4 py-2 rounded-full text-xs font-bold justify-self-start disabled:opacity-50"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Which of the ad accounts (and on Meta, Pages) this login reaches is Go Picadera's. Whoever connected may
 * see other businesses' too, so nothing is chosen for her: until she picks here, nothing is synced, launched
 * or paused on this platform. Saved through choose_ads_account.
 */
function AdsAccountChooser({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const details = row.details || {};
  const accounts = details.ad_accounts || [];
  const pages = details.pages || [];
  const isMeta = row.provider === "meta_ads";
  const current = chosenAdAccount(row.store_id, details);
  const currentPage = isMeta ? chosenPage(details) : null;
  const [account, setAccount] = useState(current?.id ?? "");
  const [page, setPage] = useState(currentPage?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = META[row.provider].name;

  const missing = !current || (isMeta && !currentPage);
  const changed = account !== (current?.id ?? "") || (isMeta && page !== (currentPage?.id ?? ""));
  const ready = !!account && (!isMeta || !!page);

  async function save() {
    if (current && account !== current.id &&
        !confirm(`Las campañas que se importaron de la cuenta ${accountLabel(current)} dejan de mostrarse en Promoción. Las que hiciste aquí se quedan. ¿Cambiar de cuenta?`)) {
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await browserClient().rpc("choose_ads_account", {
      p_provider: row.provider,
      p_account_id: account,
      p_page_id: isMeta ? page : null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  return (
    <div className="mb-3 pt-3 border-t grid gap-2" style={{ borderColor: "var(--line)" }}>
      <span className="text-xs font-bold">Cuenta de Go Picadera</span>
      {accounts.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--yellow)" }}>
          Esta conexión todavía no ve ninguna cuenta publicitaria. Si acabas de aceptar una invitación, aparece
          aquí sola en unos minutos.
        </p>
      ) : (
        <>
          {missing && (
            <p className="text-xs" style={{ color: "var(--yellow)" }}>
              Elige la cuenta publicitaria de Go Picadera{isMeta ? " y su Página de Facebook" : ""}. Hasta entonces
              no se publica, pausa ni sincroniza nada en {name}. Quien conectó puede ver otras cuentas: elige solo la
              del restaurante.
            </p>
          )}
          <select value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy}
                  aria-label={`Cuenta publicitaria de ${name}`}
                  className="px-3 py-2 rounded-lg border outline-none text-sm" style={field}>
            <option value="">Elige la cuenta publicitaria…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </select>
          {isMeta && (pages.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--yellow)" }}>
              Esta conexión no ve ninguna Página de Facebook. Hace falta una para anunciar en Facebook e Instagram.
            </p>
          ) : (
            <select value={page} onChange={(e) => setPage(e.target.value)} disabled={busy}
                    aria-label="Página de Facebook de los anuncios"
                    className="px-3 py-2 rounded-lg border outline-none text-sm" style={field}>
              <option value="">Elige la Página de Facebook…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{pageLabel(p)}</option>)}
            </select>
          ))}
          {error && <p className="text-xs" style={{ color: "var(--red)" }} role="alert">{error}</p>}
          <button type="button" onClick={save} disabled={busy || !ready || !changed}
                  className="px-4 py-2 rounded-full text-xs font-bold justify-self-start disabled:opacity-50"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      )}
    </div>
  );
}

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
    blurb: "Facebook e Instagram. Guarda abajo tu app de Meta y conecta tu cuenta de Meta Business con un botón.",
    portal: "business.facebook.com",
    color: "#0866FF",
    oauth: true,
    startFn: "meta-oauth-start",
  },
  google_ads: {
    name: "Google Ads",
    blurb: "Guarda abajo tu app de Google y conecta tu cuenta de Google Ads con un botón.",
    portal: "ads.google.com",
    color: "#4285F4",
    oauth: true,
    startFn: "google-ads-oauth-start",
  },
  tiktok_ads: {
    name: "TikTok",
    blurb: "Guarda abajo tu app de TikTok y conecta tu cuenta de TikTok for Business con un botón.",
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
        .select("provider, kind, status, store_id, client_id, has_secret, details, last_order_at, last_error, auto_accept")
        .order("provider") as never,
  );
  // The owner's own developer apps. A database without ads_accounts.sql answers with an error; the cards then
  // simply show every app as not saved.
  const apps = useQuery<AdsAppRow[]>(
    (sb) => sb.from("ads_apps").select("provider, app_id, login_config_id, has_secret") as never,
  );
  const appFor = (p: AdsProvider) => (apps.data ?? []).find((a) => a.provider === p) ?? null;
  const reloadAll = () => { reload(); apps.reload(); };

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
          return `La conexión con ${name} todavía no está lista: guarda la app de ${name} (ID y clave secreta) en esta misma tarjeta. Si ya está guardada, avísale a Fellito.`;
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
          const ads = r.kind === "ads" && isAdsProvider(r.provider) ? r.provider : null;
          const app = ads ? appFor(ads) : null;
          // Connecting goes through the owner's own app, so it waits until that app is saved.
          const appReady = !ads || !!(app?.app_id && app?.has_secret);
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
                {r.status !== "connected" ? m.blurb : r.kind === "ads" ? adsSummary(r) : ago(r.last_order_at)}
              </p>

              {/* The ads worker's "choose an account" note is what the chooser below already says. */}
              {r.last_error && !(ads && r.last_error === NO_ACCOUNT_CHOSEN) && (
                <p className="text-xs mb-3" style={{ color: "var(--red)" }}>
                  {r.last_error}
                </p>
              )}

              {ads && r.has_secret && (r.status === "connected" || r.status === "error") && (
                <AdsAccountChooser
                  key={`${r.store_id}|${r.details?.page_id}|${r.details?.chosen_at}|${(r.details?.ad_accounts ?? []).length}|${(r.details?.pages ?? []).length}`}
                  row={r} onSaved={reload} />
              )}

              {ads && <AdsAppSection key={`${app?.app_id}|${app?.has_secret}`} provider={ads} app={app} onSaved={reloadAll} />}

              {r.status === "connected" && r.provider !== "whatsapp" && r.kind !== "ads" && (
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
                    disabled={connecting === r.provider || !appReady}
                    title={appReady ? undefined : `Primero guarda la app de ${m.name}`}
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
            se conectan con tu propia app: la creas una vez en cada plataforma, pegas
            aquí su ID y su clave secreta, y conectas con un botón. Después eliges cuál
            de tus cuentas publicitarias es la de Go Picadera.
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
