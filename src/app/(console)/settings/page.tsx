import { requireOwner } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Hours = { open: number; close: number }[];

const DEFAULT_HOURS: Hours = [
  { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 23 },
  { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 25 },
  { open: 11, close: 25 },
];

export default async function SettingsPage() {
  await requireOwner();
  const sb = await serverClient();

  const { data } = await sb.from("settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const hours: Hours = (map.hours as Hours) ?? DEFAULT_HOURS;
  const whatsapp = (map.whatsapp as string) ?? "";

  async function save(formData: FormData) {
    "use server";
    await requireOwner();
    const sb = await serverClient();

    // close > 24 encodes "past midnight" — Friday closing at 1am is close: 25.
    const next: Hours = DAYS.map((_, i) => {
      const open = Number(formData.get(`open-${i}`));
      let close = Number(formData.get(`close-${i}`));
      if (close <= open) close += 24;
      return { open, close };
    });

    await sb.from("settings").upsert([
      { key: "hours", value: next },
      { key: "whatsapp", value: String(formData.get("whatsapp") ?? "") },
    ]);

    revalidatePath("/settings");
  }

  const field = {
    background: "var(--ink)",
    borderColor: "var(--line)",
    color: "var(--text)",
  };

  return (
    <>
      <h1 className="text-xl font-black mb-3">Ajustes</h1>

      <form action={save}
            className="rounded-xl border p-4 max-w-2xl"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: "var(--muted)" }}>Horario</h2>

        {DAYS.map((d, i) => (
          <div key={d} className="flex items-center gap-3 mb-2">
            <span className="w-24 text-sm">{d}</span>
            <input name={`open-${i}`} type="number" min={0} max={23} defaultValue={hours[i]?.open ?? 11}
                   className="w-20 px-2 py-1.5 rounded-lg border outline-none nums" style={field} />
            <span style={{ color: "var(--faint)" }}>a</span>
            <input name={`close-${i}`} type="number" min={0} max={23}
                   defaultValue={(hours[i]?.close ?? 23) % 24}
                   className="w-20 px-2 py-1.5 rounded-lg border outline-none nums" style={field} />
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
        <input name="whatsapp" defaultValue={whatsapp} placeholder="1XXXXXXXXXX"
               className="w-full max-w-xs px-3 py-2 rounded-lg border outline-none nums mb-1"
               style={field} />
        <p className="text-xs mb-5" style={{ color: "var(--faint)" }}>
          Número nuevo de WhatsApp Business. Solo dígitos, con código de país.
        </p>

        <button className="px-5 py-2 rounded-full font-bold"
                style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
          Guardar
        </button>
      </form>

      <p className="mt-4 text-xs max-w-2xl" style={{ color: "var(--faint)" }}>
        El horario controla el aviso de “Abierto ahora” en la web, la
        programación de pedidos fuera de hora y el horario que Google publica.
        Los tres salen de aquí.
      </p>
    </>
  );
}
