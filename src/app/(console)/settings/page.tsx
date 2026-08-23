"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";

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

  return (
    <>
      <h1 className="text-xl font-black mb-3">Ajustes</h1>

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
