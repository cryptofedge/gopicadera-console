"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";

type Usage = {
  period_start: string;
  spend_usd: number;
  budget_usd: number;
  messages: number;
  updated_at: string;
};

const usd = (n: number) => "$" + Number(n ?? 0).toFixed(2);

/**
 * What the GoPicadera Robot costs to run this month.
 *
 * Two things worth knowing about this number. Anthropic reports *spend*, not a
 * remaining balance — so "left" here means left against the ceiling the owner
 * sets below, not against a prepaid balance.
 *
 * And the figure is written by the bot, server-side. Reading it from Anthropic
 * needs an admin key, and this console is a static site: a key placed here
 * would be readable by anyone who opened the page. The bot holds the key, polls
 * on a schedule, and writes the result to the database. The console only reads.
 */
function RobotBalance() {
  const { data, loading, reload } = useQuery<Usage[]>(
    (sb) =>
      sb.from("ai_usage").select("period_start, spend_usd, budget_usd, messages, updated_at")
        .order("period_start", { ascending: false }) as never,
  );

  const row = (data ?? [])[0];
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setBudget(String(row.budget_usd ?? 0));
  }, [row]);

  if (loading) return null;

  const spend = Number(row?.spend_usd ?? 0);
  const cap = Number(row?.budget_usd ?? 0);
  const left = Math.max(cap - spend, 0);
  const pct = cap > 0 ? Math.min((spend / cap) * 100, 100) : 0;
  const tight = cap > 0 && left / cap < 0.2;

  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    await browserClient().from("ai_usage")
      .update({ budget_usd: Number(budget) || 0 })
      .eq("period_start", row.period_start);
    setSaving(false);
    reload();
  }

  return (
    <div className="rounded-xl border p-4 max-w-2xl mb-5"
         style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--muted)" }}>Gasto estimado del Robot GoPicadera</h2>

      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="text-2xl font-black nums"
              style={{ color: tight ? "var(--ember)" : "var(--yellow)" }}>
          {usd(left)}
        </span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          disponible de {usd(cap)} este mes
        </span>
        {row && (
          <span className="ml-auto text-xs nums" style={{ color: "var(--faint)" }}>
            {row.messages.toLocaleString("es-DO")} mensajes
          </span>
        )}
      </div>

      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full"
             style={{ width: `${pct}%`, background: tight ? "var(--ember)" : "var(--green)" }} />
      </div>

      <p className="text-xs mb-4" style={{ color: tight ? "var(--ember)" : "var(--faint)" }}>
        {tight
          ? "Queda poco. Si se acaba, el Robot deja de responder por WhatsApp hasta el mes que viene."
          : `Gastado ${usd(spend)} en lo que va del mes.`}
      </p>

      <form onSubmit={saveBudget} className="flex items-end gap-2 flex-wrap">
        <div>
          <label htmlFor="budget" className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                 style={{ color: "var(--muted)" }}>
            Tope mensual
          </label>
          <input id="budget" type="number" min={0} step="1" value={budget}
                 onChange={(e) => setBudget(e.target.value)}
                 className="w-32 px-3 py-2 rounded-lg border outline-none nums"
                 style={{ background: "var(--ink)", borderColor: "var(--line)", color: "var(--text)" }} />
        </div>
        <button disabled={saving}
                className="px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50"
                style={{ background: "var(--surface-3)", color: "var(--text)" }}>
          {saving ? "Guardando…" : "Cambiar tope"}
        </button>
      </form>

      <p className="text-xs mt-3" style={{ color: "var(--faint)" }}>
        El tope lo pones tú. El Robot calcula su propio gasto y lo reporta una
        vez al día — la consola nunca guarda la llave.
      </p>
      <p className="text-xs mt-1.5" style={{ color: "var(--faint)" }}>
        Es un <b>estimado</b>: el Robot cuenta sus propios tokens y les pone
        precio. La factura de verdad está en la cuenta del proveedor.
      </p>
    </div>
  );
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Hours = { open: number; close: number }[];

const DEFAULT_HOURS: Hours = [
  { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 23 },
  { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 25 },
  { open: 11, close: 25 },
];

type Setting = { key: string; value: unknown };

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

type AdsTargetingValue = {
  lat?: number;
  lng?: number;
  radius_mi?: number;
  destination_url?: string;
  tiktok_location_ids?: (string | number)[];
};

/**
 * Where ads are aimed and where they lead. The ads worker reads this when it launches a campaign:
 * Meta and Google draw a circle around the restaurant, TikTok needs its own location ids (it has no
 * radius targeting). Seeded from the stored value once, by the parent's key, rather than in an effect.
 */
function AdsTargeting({ initial, onSaved }: { initial: AdsTargetingValue; onSaved: () => void }) {
  const [lat, setLat] = useState(String(initial.lat ?? ""));
  const [lng, setLng] = useState(String(initial.lng ?? ""));
  const [radius, setRadius] = useState(String(initial.radius_mi ?? 3));
  const [url, setUrl] = useState(initial.destination_url ?? "https://gopicadera.com");
  const [tiktok, setTiktok] = useState((initial.tiktok_location_ids ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value: AdsTargetingValue = {
      lat: Number(lat),
      lng: Number(lng),
      radius_mi: Number(radius),
      destination_url: url.trim(),
      tiktok_location_ids: tiktok.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    };
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat!) > 90 || Math.abs(value.lng!) > 180) {
      setMsg("La ubicación no es válida.");
      return;
    }
    if (!(value.radius_mi! >= 0.63 && value.radius_mi! <= 50)) {
      setMsg("El radio va de 0.63 a 50 millas.");
      return;
    }
    setSaving(true);
    setMsg("");
    const { error: err } = await browserClient().from("settings").upsert([{ key: "ads_targeting", value }]);
    setSaving(false);
    setMsg(err ? `No se pudo guardar: ${err.message}` : "Guardado.");
    if (!err) onSaved();
  }

  const small = "px-3 py-2 rounded-lg border outline-none nums w-36";
  return (
    <form onSubmit={save} className="rounded-xl border p-4 max-w-2xl mb-5"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>Anuncios</h2>

      <div className="flex gap-3 flex-wrap mb-2">
        <label className="text-xs" style={{ color: "var(--faint)" }}>Latitud
          <input value={lat} onChange={(e) => setLat(e.target.value)} className={`${small} block mt-1`} style={field} />
        </label>
        <label className="text-xs" style={{ color: "var(--faint)" }}>Longitud
          <input value={lng} onChange={(e) => setLng(e.target.value)} className={`${small} block mt-1`} style={field} />
        </label>
        <label className="text-xs" style={{ color: "var(--faint)" }}>Radio (millas)
          <input type="number" min={0.63} max={50} step="0.5" value={radius} onChange={(e) => setRadius(e.target.value)}
                 className={`${small} block mt-1`} style={field} />
        </label>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--faint)" }}>
        Meta y Google muestran los anuncios a quien esté dentro de este círculo alrededor del restaurante.
      </p>

      <label className="text-xs block mb-4" style={{ color: "var(--faint)" }}>A dónde llevan los anuncios
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border outline-none mt-1" style={field} />
      </label>

      <label className="text-xs block mb-1" style={{ color: "var(--faint)" }}>Zonas de TikTok (IDs, separados por coma)
        <input value={tiktok} onChange={(e) => setTiktok(e.target.value)} className="w-full px-3 py-2 rounded-lg border outline-none nums mt-1" style={field} />
      </label>
      <p className="text-xs mb-4" style={{ color: "var(--faint)" }}>
        TikTok no usa radio: apunta por zonas con su propio número. Fellito los pone una vez desde TikTok Ads Manager.
      </p>

      <button disabled={saving} className="px-5 py-2 rounded-full font-bold disabled:opacity-50"
              style={{ background: "var(--surface-3)", color: "var(--text)" }}>
        {saving ? "Guardando…" : "Guardar anuncios"}
      </button>
      {msg && (
        <span className="ml-3 text-sm" style={{ color: msg === "Guardado." ? "var(--green)" : "var(--red)" }}>{msg}</span>
      )}
    </form>
  );
}

export default function SettingsPage() {
  const { data, loading, error, reload } = useQuery<Setting[]>(
    (sb) => sb.from("settings").select("key, value") as never,
  );

  const [hours, setHours] = useState<Hours>(DEFAULT_HOURS);
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  // Seed the form once the stored values arrive. Server-rendered defaultValue
  // used to do this; in the browser the data lands after the first paint.
  useEffect(() => {
    if (!data) return;
    const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
    setHours((map.hours as Hours) ?? DEFAULT_HOURS);
    setWhatsapp((map.whatsapp as string) ?? "");
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved("");

    // close > 24 encodes "past midnight" — Friday closing at 1am is close: 25.
    const next: Hours = hours.map(({ open, close }) => ({
      open,
      close: close <= open ? close + 24 : close,
    }));

    const { error: err } = await browserClient()
      .from("settings")
      .upsert([
        { key: "hours", value: next },
        { key: "whatsapp", value: whatsapp },
      ]);

    setSaving(false);
    setSaved(err ? `No se pudo guardar: ${err.message}` : "Guardado.");
    if (!err) reload();
  }

  if (loading) return <p style={{ color: "var(--faint)" }}>Cargando ajustes…</p>;
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;

  const adsTargeting = ((data ?? []).find((r) => r.key === "ads_targeting")?.value ?? {}) as AdsTargetingValue;

  return (
    <>
      <h1 className="text-xl font-black mb-3">Ajustes</h1>

      <RobotBalance />

      <AdsTargeting key={JSON.stringify(adsTargeting)} initial={adsTargeting} onSaved={reload} />

      <form onSubmit={save}
            className="rounded-xl border p-4 max-w-2xl"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: "var(--muted)" }}>Horario</h2>

        {DAYS.map((d, i) => (
          <div key={d} className="flex items-center gap-3 mb-2">
            <span className="w-24 text-sm">{d}</span>
            <input
              type="number" min={0} max={23}
              value={hours[i]?.open ?? 11}
              onChange={(e) => setHours((h) =>
                h.map((v, j) => (j === i ? { ...v, open: Number(e.target.value) } : v)))}
              className="w-20 px-2 py-1.5 rounded-lg border outline-none nums" style={field}
              aria-label={`${d} abre`}
            />
            <span style={{ color: "var(--faint)" }}>a</span>
            <input
              type="number" min={0} max={23}
              value={(hours[i]?.close ?? 23) % 24}
              onChange={(e) => setHours((h) =>
                h.map((v, j) => (j === i ? { ...v, close: Number(e.target.value) } : v)))}
              className="w-20 px-2 py-1.5 rounded-lg border outline-none nums" style={field}
              aria-label={`${d} cierra`}
            />
            <span className="text-xs" style={{ color: "var(--faint)" }}>
              {(hours[i]?.close ?? 23) > 24 ? "cierra pasada la medianoche" : ""}
            </span>
          </div>
        ))}

        <p className="text-xs mt-2 mb-5" style={{ color: "var(--faint)" }}>
          Formato 24h. Si la hora de cierre es menor que la de apertura, se
          entiende que cierra al día siguiente.
        </p>

        <h2 className="text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--muted)" }}>WhatsApp del bot</h2>
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="1XXXXXXXXXX"
          aria-label="WhatsApp del bot"
          className="w-full max-w-xs px-3 py-2 rounded-lg border outline-none nums mb-1"
          style={field}
        />
        <p className="text-xs mb-5" style={{ color: "var(--faint)" }}>
          Número nuevo de WhatsApp Business. Solo dígitos, con código de país.
        </p>

        <button disabled={saving}
                className="px-5 py-2 rounded-full font-bold disabled:opacity-50"
                style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>

        {saved && (
          <span className="ml-3 text-sm"
                style={{ color: saved === "Guardado." ? "var(--green)" : "var(--red)" }}>
            {saved}
          </span>
        )}
      </form>

      <p className="mt-4 text-xs max-w-2xl" style={{ color: "var(--faint)" }}>
        El horario controla el aviso de “Abierto ahora” en la web, la
        programación de pedidos fuera de hora y el horario que Google publica.
        Los tres salen de aquí.
      </p>
    </>
  );
}
