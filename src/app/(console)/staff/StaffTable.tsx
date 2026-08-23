"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

export type Member = {
  id: string;
  full_name: string | null;
  role: "owner" | "staff";
  active: boolean;
  created_at: string;
};

export default function StaffTable({
  rows,
  invite,
  onChanged,
}: {
  rows: Member[];
  // router.refresh() re-ran the server component. There is no server now,
  // so the page hands down its own refetch.
  onChanged: () => void;
  // Returns an error message, or null on success. Account creation now happens
  // in the browser against Supabase, so failures (duplicate email, weak
  // password, confirmation required) have to surface here rather than being
  // swallowed by a server action.
  invite: (fd: FormData) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const owners = rows.filter((r) => r.role === "owner" && r.active).length;

  async function setActive(m: Member, active: boolean) {
    // Deactivating the last owner would lock everyone out of prices, staff and
    // settings permanently — there is no other way back in.
    if (!active && m.role === "owner" && owners <= 1) {
      alert("No puedes desactivar al único dueño. Primero nombra a otro dueño.");
      return;
    }
    setBusy(m.id);
    const sb = browserClient();
    const { error } = await sb.from("profiles").update({ active }).eq("id", m.id);
    setBusy(null);
    if (error) { alert("No se pudo actualizar la cuenta."); return; }
    onChanged();
  }

  async function setRole(m: Member, role: "owner" | "staff") {
    if (role === "staff" && m.role === "owner" && owners <= 1) {
      alert("Debe quedar al menos un dueño.");
      return;
    }
    setBusy(m.id);
    const sb = browserClient();
    const { error } = await sb.from("profiles").update({ role }).eq("id", m.id);
    setBusy(null);
    if (error) { alert("No se pudo cambiar el rol."); return; }
    onChanged();
  }

  const field = {
    background: "var(--ink)",
    borderColor: "var(--line)",
    color: "var(--text)",
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-xl font-black">Equipo</h1>
        <span className="text-sm nums" style={{ color: "var(--muted)" }}>
          {rows.filter((r) => r.active).length} activos
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto px-3 py-1.5 rounded-full text-sm font-bold"
          style={{ background: "var(--yellow)", color: "#0A0B0E" }}
        >
          {open ? "Cancelar" : "+ Agregar"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            setInviteError(null);
            const err = await invite(fd);
            setInviteError(err);
            if (!err) setOpen(false);
          }}
          className="rounded-xl border p-4 mb-4 grid gap-3"
          style={{ background: "var(--surface)", borderColor: "var(--line-warm)",
                   gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
        >
          <input name="name" placeholder="Nombre" required
                 className="px-3 py-2 rounded-lg border outline-none" style={field} />
          <input name="email" type="email" placeholder="Correo" required
                 className="px-3 py-2 rounded-lg border outline-none" style={field} />
          <input name="password" type="text" placeholder="Contraseña (mín. 8)"
                 minLength={8} required
                 className="px-3 py-2 rounded-lg border outline-none" style={field} />
          <select name="role" className="px-3 py-2 rounded-lg border outline-none" style={field}>
            <option value="staff">Staff</option>
            <option value="owner">Dueño</option>
          </select>
          <button className="px-4 py-2 rounded-full font-bold"
                  style={{ background: "var(--yellow)", color: "#0A0B0E" }}>
            Crear cuenta
          </button>
          {inviteError && (
            <p className="text-xs col-span-full" style={{ color: "var(--red)" }} role="alert">
              {inviteError}
            </p>
          )}
          <p className="text-xs col-span-full" style={{ color: "var(--faint)" }}>
            Entrégale la contraseña en persona y pídele que la cambie. Si el
            proyecto pide confirmar el correo, la persona tendrá que abrir el
            enlace que le llegue antes de poder entrar.
          </p>
        </form>
      )}

      <div className="rounded-xl border overflow-hidden"
           style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <th className="text-left font-semibold px-3 py-2">Nombre</th>
              <th className="text-left font-semibold px-3 py-2">Rol</th>
              <th className="text-right font-semibold px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2">
                  {m.full_name ?? "—"}
                  {!m.active && (
                    <span className="ml-2 text-[11px]" style={{ color: "var(--faint)" }}>
                      desactivado
                    </span>
                  )}
                </td>

                <td className="px-3 py-2">
                  <select
                    value={m.role}
                    disabled={busy === m.id}
                    onChange={(e) => setRole(m, e.target.value as "owner" | "staff")}
                    className="px-2 py-1 rounded-lg border outline-none text-sm"
                    style={field}
                  >
                    <option value="staff">Staff</option>
                    <option value="owner">Dueño</option>
                  </select>
                </td>

                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setActive(m, !m.active)}
                    disabled={busy === m.id}
                    className="px-3 py-1 rounded-full text-xs font-bold disabled:opacity-40"
                    style={
                      m.active
                        ? { background: "var(--surface-3)", color: "var(--green)" }
                        : { background: "var(--surface-3)", color: "var(--faint)" }
                    }
                  >
                    {m.active ? "Activo" : "Inactivo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
        Desactivar cierra el acceso al instante. Es preferible a borrar: los
        pedidos que esa persona atendió siguen teniendo su nombre.
      </p>
    </>
  );
}
