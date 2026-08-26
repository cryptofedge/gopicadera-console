"use client";

/**
 * Full editor for one dish: what it is called, what it costs, what it looks
 * like, and every choice a customer gets to make about it.
 *
 * A panel rather than its own route. A static export has no server to resolve
 * /menu/<id> against, so a dynamic route would need every product id known at
 * build time — which is exactly the thing that changes when the owner adds a
 * dish.
 *
 * Owner-only. The menu page still lets staff flip a dish sold out, because a
 * kitchen that runs out of pernil at 7pm cannot wait for the owner; everything
 * in here moves money or changes the menu, so RLS refuses it to staff.
 */
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export type Group = {
  id: string;
  key: string;
  label_es: string;
  label_en: string;
  sort: number;
  option_choices: Choice[];
};

export type Choice = {
  id: string;
  label_es: string;
  label_en: string;
  price_delta: number;
  quiet: boolean;
  sort: number;
};

export type Item = {
  id: string;
  slug: string;
  name: string;
  desc_es: string | null;
  desc_en: string | null;
  price: number | null;
  image_path: string | null;
  available: boolean;
  featured: number | null;
  sort: number;
  category_id: string | null;
};

const field = {
  background: "var(--ink)",
  borderColor: "var(--line)",
  color: "var(--text)",
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border outline-none text-base";
const labelCls = "block text-xs font-bold uppercase tracking-wider mb-1.5";

export default function ItemEditor({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: Item;
  categories: { id: string; name_es: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Item>(item);
  const [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof Item>(k: K, v: Item[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    void (async () => {
      const { data } = await browserClient()
        .from("option_groups")
        .select("id, key, label_es, label_en, sort, option_choices(id, label_es, label_en, price_delta, quiet, sort)")
        .eq("product_id", item.id)
        .order("sort");
      setGroups((data ?? []) as unknown as Group[]);
    })();
  }, [item.id]);

  /**
   * Uploads go straight from the browser to Storage — there is no server to
   * pass through. The filename is randomised rather than reusing the dish
   * name: two uploads called "mofongo.jpg" would otherwise fight, and a cached
   * old photo would keep showing under the same URL.
   */
  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La foto pesa más de 5 MB. Usa una más liviana.");
      return;
    }
    setUploading(true);
    setError("");

    const sb = browserClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${form.slug}-${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage.from("dishes").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
    });
    setUploading(false);
    if (upErr) { setError(upErr.message); return; }

    const { data } = sb.storage.from("dishes").getPublicUrl(path);
    set("image_path", data.publicUrl);
  }

  async function save() {
    setBusy(true);
    setError("");
    const sb = browserClient();

    const { error: err } = await sb
      .from("products")
      .update({
        name: form.name.trim(),
        desc_es: form.desc_es,
        desc_en: form.desc_en,
        // Empty means "Personalizar" — a real state on this menu for catering
        // sizes that are quoted rather than priced.
        price: form.price === null || Number.isNaN(form.price) ? null : form.price,
        image_path: form.image_path,
        available: form.available,
        featured: form.featured,
        sort: form.sort,
        category_id: form.category_id,
      })
      .eq("id", item.id);

    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  // ---- option groups -------------------------------------------------------

  async function addGroup() {
    const sb = browserClient();
    const { data } = await sb
      .from("option_groups")
      .insert({ product_id: item.id, key: "nuevo", label_es: "Nueva opción", label_en: "New option", sort: groups.length })
      .select("id, key, label_es, label_en, sort")
      .single();
    if (data) setGroups((g) => [...g, { ...(data as unknown as Group), option_choices: [] }]);
  }

  async function saveGroup(g: Group) {
    await browserClient()
      .from("option_groups")
      .update({ key: g.key, label_es: g.label_es, label_en: g.label_en })
      .eq("id", g.id);
  }

  async function delGroup(g: Group) {
    if (!confirm(`¿Borrar "${g.label_es}" y todas sus opciones?`)) return;
    await browserClient().from("option_groups").delete().eq("id", g.id);
    setGroups((list) => list.filter((x) => x.id !== g.id));
  }

  async function addChoice(g: Group) {
    const { data } = await browserClient()
      .from("option_choices")
      .insert({ group_id: g.id, label_es: "Nueva", label_en: "New", price_delta: 0, sort: g.option_choices.length })
      .select("id, label_es, label_en, price_delta, quiet, sort")
      .single();
    if (!data) return;
    setGroups((list) =>
      list.map((x) => (x.id === g.id ? { ...x, option_choices: [...x.option_choices, data as unknown as Choice] } : x)),
    );
  }

  async function saveChoice(c: Choice) {
    await browserClient()
      .from("option_choices")
      .update({ label_es: c.label_es, label_en: c.label_en, price_delta: c.price_delta, quiet: c.quiet })
      .eq("id", c.id);
  }

  async function delChoice(g: Group, c: Choice) {
    await browserClient().from("option_choices").delete().eq("id", c.id);
    setGroups((list) =>
      list.map((x) => (x.id === g.id ? { ...x, option_choices: x.option_choices.filter((y) => y.id !== c.id) } : x)),
    );
  }

  const patchGroup = (id: string, patch: Partial<Group>) =>
    setGroups((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const patchChoice = (gid: string, cid: string, patch: Partial<Choice>) =>
    setGroups((list) =>
      list.map((g) =>
        g.id === gid
          ? { ...g, option_choices: g.option_choices.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }
          : g,
      ),
    );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "rgba(0,0,0,.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="mx-auto my-6 rounded-2xl border max-w-3xl"
        style={{ background: "var(--surface)", borderColor: "var(--line-warm)" }}
      >
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 z-10 rounded-t-2xl"
             style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <h2 className="text-lg font-black">{form.name || "Sin nombre"}</h2>
          <button onClick={onClose} className="ml-auto text-sm px-3 py-1.5 rounded-full"
                  style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
            Cerrar
          </button>
          <button onClick={save} disabled={busy}
                  className="px-4 py-1.5 rounded-full text-sm font-bold disabled:opacity-50"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <div className="p-4">
          {error && (
            <p className="text-sm mb-4 px-3 py-2 rounded-lg" role="alert"
               style={{ color: "var(--red)", background: "rgba(255,84,104,.08)" }}>
              {error}
            </p>
          )}

          {/* ---- photo ---- */}
          <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Foto
          </h3>
          <div className="flex gap-4 items-start mb-6 flex-wrap">
            <div className="rounded-xl overflow-hidden flex-none"
                 style={{ width: 132, height: 132, background: "var(--surface-2)" }}>
              {form.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_path} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-xs" style={{ color: "var(--faint)" }}>
                  Sin foto
                </div>
              )}
            </div>

            <div className="flex-1 min-w-[210px]">
              <label className="inline-block px-4 py-2 rounded-full text-sm font-bold cursor-pointer mb-2"
                     style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
                {uploading ? "Subiendo…" : "Subir foto"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
              </label>
              {form.image_path && (
                <button onClick={() => set("image_path", null)}
                        className="ml-2 px-3 py-2 rounded-full text-sm"
                        style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                  Quitar
                </button>
              )}
              <p className="text-xs" style={{ color: "var(--faint)" }}>
                JPG o PNG, hasta 5 MB. Sale en la página tal como se ve aquí —
                una foto cuadrada y bien iluminada rinde más que una grande.
              </p>
            </div>
          </div>

          {/* ---- the basics ---- */}
          <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Datos
          </h3>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <div>
              <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="ed-name">Nombre</label>
              <input id="ed-name" value={form.name} onChange={(e) => set("name", e.target.value)}
                     className={inputCls} style={field} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="ed-price">Precio</label>
              <input id="ed-price" type="number" step="0.01" min={0}
                     value={form.price ?? ""}
                     placeholder="Personalizar"
                     onChange={(e) => set("price", e.target.value === "" ? null : Number(e.target.value))}
                     className={`${inputCls} nums`} style={field} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="ed-cat">Categoría</label>
              <select id="ed-cat" value={form.category_id ?? ""}
                      onChange={(e) => set("category_id", e.target.value || null)}
                      className={inputCls} style={field}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name_es}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
            <div>
              <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="ed-des">Descripción (español)</label>
              <textarea id="ed-des" rows={2} value={form.desc_es ?? ""}
                        onChange={(e) => set("desc_es", e.target.value)}
                        className={inputCls} style={field} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--faint)" }} htmlFor="ed-den">Descripción (inglés)</label>
              <textarea id="ed-den" rows={2} value={form.desc_en ?? ""}
                        onChange={(e) => set("desc_en", e.target.value)}
                        className={inputCls} style={field} />
            </div>
          </div>

          <div className="flex gap-5 mb-6 flex-wrap text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.available}
                     onChange={(e) => set("available", e.target.checked)} className="w-4 h-4" />
              Disponible
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.featured !== null}
                     onChange={(e) => set("featured", e.target.checked ? 1 : null)} className="w-4 h-4" />
              Destacado en la página
            </label>
          </div>

          {/* ---- options ---- */}
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Opciones que elige el cliente
            </h3>
            <button onClick={addGroup} className="ml-auto text-xs font-bold px-3 py-1.5 rounded-full"
                    style={{ background: "var(--surface-3)", color: "var(--text)" }}>
              + Grupo
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--faint)" }}>
            Un grupo es una pregunta (“Carne”, “Sabor”). Cada opción puede
            sumarle al precio: pon 2.00 y el plato cuesta $2 más si la eligen.
          </p>

          {groups.length === 0 && (
            <p className="text-xs mb-4 px-3 py-3 rounded-xl" style={{ color: "var(--faint)", background: "var(--surface-2)" }}>
              Este plato se agrega directo al carrito, sin preguntas.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border p-3 mb-3"
                 style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}>
              <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
                <input value={g.label_es} aria-label="Nombre del grupo en español"
                       onChange={(e) => patchGroup(g.id, { label_es: e.target.value })}
                       onBlur={() => saveGroup(g)}
                       className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
                <input value={g.label_en} aria-label="Nombre del grupo en inglés"
                       onChange={(e) => patchGroup(g.id, { label_en: e.target.value })}
                       onBlur={() => saveGroup(g)}
                       className="px-3 py-2 rounded-lg border outline-none text-sm" style={field} />
                <button onClick={() => delGroup(g)}
                        className="px-3 py-2 rounded-lg text-sm justify-self-start"
                        style={{ background: "var(--surface-3)", color: "var(--red)" }}>
                  Borrar grupo
                </button>
              </div>

              {g.option_choices.map((c) => (
                <div key={c.id} className="flex gap-2 mb-2 flex-wrap items-center">
                  <input value={c.label_es} aria-label="Opción en español"
                         onChange={(e) => patchChoice(g.id, c.id, { label_es: e.target.value })}
                         onBlur={() => saveChoice(c)}
                         className="px-3 py-2 rounded-lg border outline-none text-sm flex-1 min-w-[120px]" style={field} />
                  <input value={c.label_en} aria-label="Opción en inglés"
                         onChange={(e) => patchChoice(g.id, c.id, { label_en: e.target.value })}
                         onBlur={() => saveChoice(c)}
                         className="px-3 py-2 rounded-lg border outline-none text-sm flex-1 min-w-[120px]" style={field} />
                  <input type="number" step="0.01" value={c.price_delta} aria-label="Cargo extra"
                         onChange={(e) => patchChoice(g.id, c.id, { price_delta: Number(e.target.value) })}
                         onBlur={() => saveChoice(c)}
                         className="px-3 py-2 rounded-lg border outline-none text-sm nums w-24" style={field} />
                  <button onClick={() => delChoice(g, c)} aria-label="Borrar opción"
                          className="px-2.5 py-2 rounded-lg text-sm"
                          style={{ background: "var(--surface-3)", color: "var(--faint)" }}>
                    ✕
                  </button>
                </div>
              ))}

              <button onClick={() => addChoice(g)} className="text-xs font-bold px-3 py-1.5 rounded-full mt-1"
                      style={{ background: "var(--surface-3)", color: "var(--text)" }}>
                + Opción
              </button>
            </div>
          ))}

          <p className="text-xs mt-4" style={{ color: "var(--faint)" }}>
            Las opciones se guardan al salir de cada casilla. El nombre, el
            precio y la foto se guardan con el botón de arriba.
          </p>
        </div>
      </div>
    </div>
  );
}
