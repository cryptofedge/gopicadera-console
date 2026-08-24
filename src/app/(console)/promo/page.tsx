"use client";

/**
 * Promotion. Owner writes, staff reads.
 *
 * Staff can see what is running because a promo explains a sudden rush, and a
 * kitchen that knows "2x1 en empanadas until Sunday" prepares differently.
 * Starting or stopping one costs money, so that stays with the owner and RLS
 * enforces it.
 *
 * Same connection reality as the delivery platforms: Google Ads, Meta and
 * TikTok all require an approved developer account before their APIs answer.
 * Until then a campaign here is a draft the owner can read, edit and schedule —
 * it just cannot go live on its own.
 */
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useSession, isOwner } from "@/lib/session";
import { useQuery } from "@/lib/useQuery";

type Provider = "google_ads" | "meta_ads" | "tiktok_ads";
type Status = "draft" | "scheduled" | "publishing" | "active" | "paused" | "ended" | "failed";

const META: Record<Provider, { name: string; color: string; where: string }> = {
  meta_ads:   { name: "Meta",       color: "#0866FF", where: "Facebook e Instagram" },
  google_ads: { name: "Google Ads", color: "#4285F4", where: "Búsqueda y Maps" },
  tiktok_ads: { name: "TikTok",     color: "#FE2C55", where: "TikTok" },
};

const STATUS_LABEL: Record<Status, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  publishing: "Publicando…",
  active: "Activa",
  paused: "En pausa",
  ended: "Terminada",
  failed: "No se pudo publicar",
};

const STATUS_COLOR: Record<Status, string> = {
  draft: "var(--faint)",
  scheduled: "var(--yellow)",
  publishing: "var(--yellow)",
  active: "var(--green)",
  paused: "var(--ember)",
  ended: "var(--faint)",
  failed: "var(--red)",
};

type Campaign = {
  id: string;
  provider: Provider;
  name: string;
  status: Status;
  headline: string | null;
  body: string | null;
  daily_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  starts_at: string | null;
  ends_at: string | null;
  external_id: string | null;
  last_error: string | null;
  synced_at: string | null;
};

const money = (n: number) => "$" + Number(n ?? 0).toFixed(2);
const num = (n: number) => Number(n ?? 0).toLocaleString("es-DO");

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

export default function PromoPage() {
  const { profile } = useSession();
  const owner = isOwner(profile);

  const { data, loading, error, reload } = useQuery<Campaign[]>(
    (sb) =>
      sb
        .from("campaigns")
        .select(
          "id, provider, name, status, headline, body, daily_budget, spend, impressions, clicks, orders, starts_at, ends_at, external_id, last_error, synced_at",
        )
        .order("created_at", { ascending: false }) as never,
  );

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // A campaign sitting in "publishing" is waiting on the bot, which will finish
  // out of band. Poll while any of them are, and stop once none are.
  const publishing = (data ?? []).some((c) => c.status === "publishing");
  useEffect(() => {
    if (!publishing) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [publishing, reload]);

  /**
   * Launching goes through "publishing", not straight to "active".
   *
   * The console cannot call Meta or Google itself, so this only records the
   * intent — a database trigger queues the job and the bot does the work.
   * Jumping to "active" would tell the owner the ad is running before anything
   * has been published, and be a lie for as long as the platform took to
   * answer, or forever if it refused.
   */
  async function setStatus(c: Campaign, status: Status) {
    setBusy(true);
    await browserClient()
      .from("campaigns")
      .update({ status, last_error: null })
      .eq("id", c.id);
    setBusy(false);
    reload();
  }

  async function launch(c: Campaign) {
    // Resuming something already on the platform goes straight back to active;
    // a first launch has to be created there first.
    await setStatus(c, c.external_id ? "active" : "publishing");
  }

  async function create(fd: FormData) {
    setBusy(true);
    await browserClient().from("campaigns").insert({
      provider: String(fd.get("provider")),
      name: String(fd.get("name") ?? "").trim(),
      headline: String(fd.get("headline") ?? "").trim() || null,
      body: String(fd.get("body") ?? "").trim() || null,
      daily_budget: Number(fd.get("daily_budget")) || 0,
      status: "draft",
    });
    setBusy(false);
    setOpen(false);
    reload();
  }

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando promociones…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const rows = data ?? [];
  const live = rows.filter((c) => c.status === "active");
  const spend = rows.reduce((t, c) => t + Number(c.spend ?? 0), 0);
  const attributed = rows.reduce((t, c) => t + Number(c.orders ?? 0), 0);

  return (
    <>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="text-xl font-black">Promoción</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {live.length} activas · {money(spend)} gastado · {attributed} pedidos
        </span>
        {owner && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ background: "var(--yellow)", color: "#0A0B0E" }}
          >
            {open ? "Cancelar" : "+ Nueva promoción"}
          </button>
        )}
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Anuncios en Facebook, Instagram, Google y TikTok. El asistente escribe
        el texto; tú decides si sale y con cuánto.
      </p>

      {open && owner && (
        <form
          action={create}
          className="rounded-xl border p-4 mb-5 grid gap-3 max-w-2xl"
          style={{ background: "var(--surface)", borderColor: "var(--line-warm)" }}
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
            <select name="provider" className="px-3 py-2 rounded-lg border outline-none text-sm" style={field}>
              {Object.entries(META).map(([k, m]) => (
                <option key={k} value={k}>{m.name}</option>
              ))}
            </select>
            <input name="name" required placeholder="Nombre interno"
                   className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
            <input name="daily_budget" type="number" min={0} step="0.01" placeholder="Presupuesto diario"
                   className="px-3 py-2 rounded-lg border outline-none text-sm nums" style={field} />
          </div>
          <input name="headline" placeholder="Titular — ej. Mofongo con pernil, hoy $12"
                 className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
          <textarea name="body" rows={3} placeholder="Texto del anuncio"
                    className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Se guarda como borrador. No sale a la calle hasta que le des a
            Activar, y solo si el canal está conectado.
          </p>
          <button disabled={busy}
                  className="px-4 py-2 rounded-full text-sm font-bold justify-self-start disabled:opacity-50"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
            {busy ? "Guardando…" : "Guardar borrador"}
          </button>
        </form>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--faint)" }}>
          Todavía no hay promociones.
        </div>
      )}

      <div className="grid gap-3"
           style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        {rows.map((c) => {
          const m = META[c.provider];
          // Cost per attributed order is the only number that answers "was this
          // worth it". Impressions flatter every platform.
          const cpo = c.orders > 0 ? c.spend / c.orders : null;

          return (
            <div key={c.id} className="rounded-xl border p-4"
                 style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: m?.color }} />
                <span className="font-bold">{c.name}</span>
                <span className="ml-auto text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: STATUS_COLOR[c.status] }}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>

              <p className="text-xs mb-2" style={{ color: "var(--faint)" }}>
                {m?.name} · {m?.where} · {money(c.daily_budget)}/día
              </p>

              {c.status === "publishing" && (
                <p className="text-xs mb-2" style={{ color: "var(--yellow)" }}>
                  Enviando a {m?.name}. Tarda un momento; la pantalla se
                  actualiza sola cuando confirme.
                </p>
              )}
              {c.status === "failed" && c.last_error && (
                <p className="text-xs mb-2" style={{ color: "var(--red)" }} role="alert">
                  {c.last_error}
                </p>
              )}

              {c.headline && <p className="text-sm font-bold mb-1">{c.headline}</p>}
              {c.body && (
                <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>{c.body}</p>
              )}

              <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t"
                   style={{ borderColor: "var(--line)" }}>
                {[
                  ["Gastado", money(c.spend)],
                  ["Clics", num(c.clicks)],
                  ["Pedidos", num(c.orders)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--faint)" }}>{k}</div>
                    <div className="text-sm font-bold nums">{v}</div>
                  </div>
                ))}
              </div>

              {cpo !== null && (
                <p className="text-xs mb-3"
                   style={{ color: cpo > 8 ? "var(--ember)" : "var(--green)" }}>
                  {money(cpo)} por pedido conseguido
                </p>
              )}

              {owner && (
                <div className="flex gap-2 flex-wrap">
                  {c.status !== "active" && c.status !== "publishing" && (
                    <button onClick={() => launch(c)} disabled={busy}
                            className="px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                            style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
                      {c.status === "paused" ? "Reanudar" : c.status === "failed" ? "Reintentar" : "Publicar ahora"}
                    </button>
                  )}
                  {c.status === "active" && (
                    <button onClick={() => setStatus(c, "paused")} disabled={busy}
                            className="px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                            style={{ background: "var(--surface-3)", color: "var(--ember)" }}>
                      Pausar
                    </button>
                  )}
                  {c.external_id && (
                    <button onClick={() => setStatus(c, c.status)} disabled={busy}
                            className="px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                            style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                      Actualizar cifras
                    </button>
                  )}
                  {c.status !== "ended" && c.status !== "publishing" && (
                    <button onClick={() => setStatus(c, "ended")} disabled={busy}
                            className="px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                            style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                      Terminar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!owner && (
        <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>
          Puedes ver lo que está corriendo para saber por qué hay más pedidos de
          lo normal. Solo el dueño puede cambiarlas.
        </p>
      )}
    </>
  );
}
