"use client";

/**
 * First sign-in: replace the temporary password.
 *
 * Accounts are handed out with a temporary password, so for a short window
 * somebody other than the owner knows it. Until this form is completed the
 * console will not let the account go anywhere — see the gate in the console
 * layout.
 *
 * This is a convenience gate, not a security boundary: the JavaScript can be
 * skipped. What cannot be skipped is Row Level Security. The point here is to
 * make sure the temporary password stops working, not to fence off pages.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";
import { useSession } from "@/lib/session";

const MIN = 8;

export default function CambiarClavePage() {
  const router = useRouter();
  const { profile, refresh, signOut } = useSession();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Escribe tu nombre.");
      return;
    }
    if (pass.length < MIN) {
      setError(`La contraseña debe tener al menos ${MIN} caracteres.`);
      return;
    }
    if (pass !== again) {
      setError("Las dos contraseñas no son iguales.");
      return;
    }

    setBusy(true);
    const sb = browserClient();

    const { error: upErr } = await sb.auth.updateUser({ password: pass });
    if (upErr) {
      // Supabase rejects a password identical to the current one, which is
      // exactly the case worth catching here — otherwise someone "changes" the
      // temporary password to itself and the flag clears anyway.
      setError(
        upErr.message.toLowerCase().includes("different")
          ? "Escoge una contraseña distinta a la temporal."
          : "No se pudo cambiar la contraseña. Intenta de nuevo.",
      );
      setBusy(false);
      return;
    }

    // Only clear the flag once the password actually changed. Doing it first
    // would leave an account marked "done" with the temporary password still
    // working if the update failed.
    const { error: rpcErr } = await sb.rpc("complete_first_login", {
      p_full_name: name.trim(),
    });
    if (rpcErr) {
      setError(
        "La contraseña se cambió, pero no pudimos guardar el estado. Vuelve a entrar.",
      );
      setBusy(false);
      return;
    }

    await refresh();
    router.replace("/orders");
  }

  const field = {
    background: "var(--ink)",
    borderColor: "var(--line)",
    color: "var(--text)",
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl p-8 sm:p-10 border"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`}
          alt="Go Picadera"
          width={455}
          height={420}
          className="mx-auto mb-5 h-20 w-auto"
        />

        <h1 className="font-black text-2xl tracking-tight mb-2 text-center">
          Configura tu cuenta
        </h1>
        <p className="text-sm mb-7 text-center" style={{ color: "var(--muted)" }}>
          Entraste con una contraseña temporal. Escoge tu nombre y una
          contraseña tuya para seguir — nadie más la va a saber.
        </p>

        <label
          htmlFor="name"
          className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "var(--faint)" }}
        >
          Tu nombre
        </label>
        <input
          id="name"
          type="text"
          value={name}
          required
          maxLength={60}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-2 px-4 py-3 rounded-xl border outline-none text-base"
          style={field}
        />
        <p className="text-xs mb-5" style={{ color: "var(--faint)" }}>
          Así apareces en la consola y en los pedidos que atiendas.
        </p>

        <label
          htmlFor="pass"
          className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "var(--faint)" }}
        >
          Nueva contraseña
        </label>
        <input
          id="pass"
          type="password"
          value={pass}
          required
          minLength={MIN}
          autoComplete="new-password"
          onChange={(e) => setPass(e.target.value)}
          className="w-full mb-5 px-4 py-3 rounded-xl border outline-none text-base"
          style={field}
        />

        <label
          htmlFor="again"
          className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "var(--faint)" }}
        >
          Repítela
        </label>
        <input
          id="again"
          type="password"
          value={again}
          required
          minLength={MIN}
          autoComplete="new-password"
          onChange={(e) => setAgain(e.target.value)}
          className="w-full mb-2 px-4 py-3 rounded-xl border outline-none text-base"
          style={field}
        />

        <p className="text-xs mb-6" style={{ color: "var(--faint)" }}>
          Mínimo {MIN} caracteres. Usa algo que no uses en otro sitio.
        </p>

        {error && (
          <p className="text-sm mb-4" style={{ color: "var(--red)" }} role="alert">
            {error}
          </p>
        )}

        <button
          disabled={busy}
          className="w-full py-3 rounded-full font-bold text-base disabled:opacity-50"
          style={{ background: "var(--yellow)", color: "#0A0B0E" }}
        >
          {busy ? "Guardando…" : "Guardar y entrar"}
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full mt-3 py-2 text-sm"
          style={{ color: "var(--faint)" }}
        >
          Salir
        </button>
      </form>
    </div>
  );
}
