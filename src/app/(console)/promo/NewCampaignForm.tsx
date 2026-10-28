"use client";

/**
 * A new ad, drafted here and launched by the ads worker when the owner presses Publicar.
 *
 * Each platform needs something different: Meta an image (it runs on Facebook and Instagram at once),
 * TikTok a video, Google several short headlines, descriptions and keywords. The form asks only for
 * what the chosen platform uses. The checks below mirror validateLaunch in
 * supabase/functions/_shared/ads-lib.ts, which has the final word: this copy only saves the owner a
 * round trip.
 */
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useQuery } from "@/lib/useQuery";

type Provider = "google_ads" | "meta_ads" | "tiktok_ads";

const PLATFORMS: Record<Provider, { name: string; min: number; media: "image" | "video" | null }> = {
  meta_ads: { name: "Meta (Facebook e Instagram)", min: 1, media: "image" },
  tiktok_ads: { name: "TikTok", min: 20, media: "video" },
  google_ads: { name: "Google (búsqueda)", min: 1, media: null },
};

const TIKTOK_TEXT_MAX = 100;
const MAX_UPLOAD_MB = { image: 8, video: 50 };

type Targeting = { radius_mi?: number; destination_url?: string };
type Dish = { name: string; image_path: string };

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};
const inputCls = "w-full px-3 py-2 rounded-lg border outline-none text-sm";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider mb-1";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

function problem(p: Provider, f: {
  name: string; headline: string; body: string; budget: number; start: string; end: string;
  url: string; radius: number; media: boolean; heads: string[]; descs: string[]; kws: string[];
}): string | null {
  if (!f.name.trim()) return "Ponle un nombre a la campaña.";
  if (!/^https?:\/\/\S+\.\S+/.test(f.url)) return "El enlace de destino no es una dirección web válida.";
  if (!(f.budget >= PLATFORMS[p].min)) return `${PLATFORMS[p].name} pide al menos $${PLATFORMS[p].min} al día.`;
  if (f.end && f.end <= (f.start || today())) return "La fecha de fin tiene que ser después de la de inicio.";
  if (p === "meta_ads") {
    if (!f.media) return "Meta necesita una imagen.";
    if (!f.headline.trim() || !f.body.trim()) return "Escribe el titular y el texto.";
    if (f.radius < 0.63 || f.radius > 50) return "Para Meta el radio va de 0.63 a 50 millas.";
  }
  if (p === "tiktok_ads") {
    if (!f.media) return "TikTok necesita un video.";
    const text = [f.headline.trim(), f.body.trim()].filter(Boolean).join(". ");
    if (!text) return "Escribe el texto del anuncio.";
    if (text.length > TIKTOK_TEXT_MAX) return `Para TikTok, titular y texto juntos: ${TIKTOK_TEXT_MAX} caracteres como máximo (ahora ${text.length}).`;
  }
  if (p === "google_ads") {
    if (f.heads.length < 3 || f.heads.length > 15) return "Google pide entre 3 y 15 titulares.";
    if (f.heads.some((h) => h.length > 30)) return "Cada titular de Google: 30 caracteres como máximo.";
    if (f.descs.length < 2 || f.descs.length > 4) return "Google pide entre 2 y 4 descripciones.";
    if (f.descs.some((d) => d.length > 90)) return "Cada descripción de Google: 90 caracteres como máximo.";
    if (f.kws.length < 1) return "Google necesita al menos una palabra clave.";
  }
  return null;
}

export default function NewCampaignForm({ onSaved }: { onSaved: () => void }) {
  const targeting = useQuery<{ value: Targeting }[]>(
    (sb) => sb.from("settings").select("value").eq("key", "ads_targeting") as never,
  );
  const products = useQuery<{ name: string; image_path: string | null }[]>(
    (sb) => sb.from("products").select("name, image_path").order("sort") as never,
  );
  const withPhoto: Dish[] = (products.data ?? []).filter((d): d is Dish => !!d.image_path);
  const t = targeting.data?.[0]?.value || {};

  const [provider, setProvider] = useState<Provider>("meta_ads");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [budget, setBudget] = useState("");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState("");
  const [url, setUrl] = useState("");
  const [radius, setRadius] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dishPhoto, setDishPhoto] = useState("");
  const [heads, setHeads] = useState("");
  const [descs, setDescs] = useState("");
  const [kws, setKws] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const p = PLATFORMS[provider];
  const effUrl = url || t.destination_url || "https://gopicadera.com";
  const effRadius = Number(radius || t.radius_mi || 3);
  const tiktokText = [headline.trim(), body.trim()].filter(Boolean).join(". ");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const hasMedia = !!file || (provider === "meta_ads" && !!dishPhoto);
    const why = problem(provider, {
      name, headline, body, budget: Number(budget), start, end, url: effUrl, radius: effRadius,
      media: hasMedia, heads: lines(heads), descs: lines(descs), kws: lines(kws),
    });
    if (why) { setError(why); return; }

    setBusy(true);
    const sb = browserClient();
    let mediaUrl: string | null = provider === "meta_ads" && !file ? dishPhoto || null : null;

    if (file && p.media) {
      const limit = MAX_UPLOAD_MB[p.media];
      if (!file.type.startsWith(`${p.media}/`)) { setError(p.media === "image" ? "Ese archivo no es una imagen." : "Ese archivo no es un video."); setBusy(false); return; }
      if (file.size > limit * 1024 * 1024) { setError(`El archivo pesa más de ${limit} MB.`); setBusy(false); return; }
      // A random name: two uploads called "promo.mp4" must not overwrite each other.
      const ext = (file.name.split(".").pop() || (p.media === "image" ? "jpg" : "mp4")).toLowerCase();
      const path = `${provider}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await sb.storage.from("ads").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) { setError(upErr.message); setBusy(false); return; }
      mediaUrl = sb.storage.from("ads").getPublicUrl(path).data.publicUrl;
    }

    const { error: insErr } = await sb.from("campaigns").insert({
      provider,
      name: name.trim(),
      headline: headline.trim() || null,
      body: body.trim() || null,
      daily_budget: Number(budget),
      starts_at: start ? new Date(`${start}T00:00:00`).toISOString() : null,
      ends_at: end ? new Date(`${end}T23:59:00`).toISOString() : null,
      destination_url: effUrl,
      radius_mi: effRadius,
      media_url: mediaUrl,
      google_assets: provider === "google_ads" ? { headlines: lines(heads), descriptions: lines(descs), keywords: lines(kws) } : null,
      status: "draft",
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onSaved();
  }

  const counter = (s: string, max: number) =>
    lines(s).map((l, i) => (
      <span key={i} className="mr-2 nums" style={{ color: l.length > max ? "var(--red)" : "var(--faint)" }}>
        {l.length}/{max}
      </span>
    ));

  return (
    <form onSubmit={save} className="rounded-xl border p-4 mb-5 grid gap-3 max-w-2xl"
          style={{ background: "var(--surface)", borderColor: "var(--line-warm)" }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-provider">Dónde</label>
          <select id="nc-provider" value={provider} onChange={(e) => { setProvider(e.target.value as Provider); setFile(null); }}
                  className={inputCls} style={field}>
            {(Object.keys(PLATFORMS) as Provider[]).map((k) => <option key={k} value={k}>{PLATFORMS[k].name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-name">Nombre interno</label>
          <input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} style={field} />
        </div>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-budget">Presupuesto diario (mín. ${p.min})</label>
          <input id="nc-budget" type="number" min={p.min} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)}
                 required className={`${inputCls} nums`} style={field} />
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-start">Empieza</label>
          <input id="nc-start" type="date" value={start} min={today()} onChange={(e) => setStart(e.target.value)} className={inputCls} style={field} />
        </div>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-end">Termina (opcional)</label>
          <input id="nc-end" type="date" value={end} min={start || today()} onChange={(e) => setEnd(e.target.value)} className={inputCls} style={field} />
        </div>
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-radius">Radio (millas)</label>
          <input id="nc-radius" type="number" min={0.63} max={50} step="0.5" value={radius} placeholder={String(t.radius_mi ?? 3)}
                 onChange={(e) => setRadius(e.target.value)} className={`${inputCls} nums`} style={field} />
        </div>
      </div>

      {provider !== "google_ads" && (
        <>
          <div>
            <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-headline">Titular</label>
            <input id="nc-headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
                   placeholder="Mofongo con pernil, hoy $12" className={inputCls} style={field} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-body">Texto</label>
            <textarea id="nc-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls} style={field} />
            {provider === "tiktok_ads" && (
              <p className="text-[11px] mt-1 nums" style={{ color: tiktokText.length > TIKTOK_TEXT_MAX ? "var(--red)" : "var(--faint)" }}>
                En TikTok salen juntos: {tiktokText.length}/{TIKTOK_TEXT_MAX}
              </p>
            )}
          </div>
        </>
      )}

      {provider === "meta_ads" && (
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-image">Imagen</label>
          <input id="nc-image" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm mb-2" />
          {!file && withPhoto.length > 0 && (
            <select value={dishPhoto} onChange={(e) => setDishPhoto(e.target.value)} className={inputCls} style={field} aria-label="Usar la foto de un plato">
              <option value="">…o usa la foto de un plato</option>
              {withPhoto.map((d) => <option key={d.image_path} value={d.image_path}>{d.name}</option>)}
            </select>
          )}
          <p className="text-[11px] mt-1" style={{ color: "var(--faint)" }}>
            Sale en Facebook e Instagram. Mejor cuadrada (1080×1080) y bien iluminada.
          </p>
        </div>
      )}

      {provider === "tiktok_ads" && (
        <div>
          <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-video">Video</label>
          <input id="nc-video" type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          <p className="text-[11px] mt-1" style={{ color: "var(--faint)" }}>
            Vertical (9:16), de 5 a 60 segundos, hasta {MAX_UPLOAD_MB.video} MB. Sale con el nombre de la cuenta de TikTok del negocio.
          </p>
        </div>
      )}

      {provider === "google_ads" && (
        <>
          <div>
            <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-heads">Titulares (uno por línea, 3 a 15, máx. 30 letras)</label>
            <textarea id="nc-heads" rows={4} value={heads} onChange={(e) => setHeads(e.target.value)}
                      placeholder={"Mofongo en Sunset Park\nComida dominicana\nPide por WhatsApp"} className={inputCls} style={field} />
            <p className="text-[11px] mt-1">{counter(heads, 30)}</p>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-descs">Descripciones (una por línea, 2 a 4, máx. 90 letras)</label>
            <textarea id="nc-descs" rows={3} value={descs} onChange={(e) => setDescs(e.target.value)} className={inputCls} style={field} />
            <p className="text-[11px] mt-1">{counter(descs, 90)}</p>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-kws">Palabras clave (una por línea)</label>
            <textarea id="nc-kws" rows={3} value={kws} onChange={(e) => setKws(e.target.value)}
                      placeholder={"mofongo brooklyn\ncomida dominicana sunset park"} className={inputCls} style={field} />
          </div>
        </>
      )}

      <div>
        <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="nc-url">A dónde lleva</label>
        <input id="nc-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.destination_url || "https://gopicadera.com"}
               className={inputCls} style={field} />
      </div>

      {error && <p className="text-xs" style={{ color: "var(--red)" }} role="alert">{error}</p>}

      <p className="text-xs" style={{ color: "var(--faint)" }}>
        Se guarda como borrador. No gasta nada hasta que le des a Publicar, y solo si {p.name.split(" (")[0]} está conectado en Canales.
      </p>
      <button disabled={busy}
              className="px-4 py-2 rounded-full text-sm font-bold justify-self-start disabled:opacity-50"
              style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
        {busy ? "Guardando…" : "Guardar borrador"}
      </button>
    </form>
  );
}
