"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient, IS_DEMO } from "@/lib/supabase-browser";
import { DEMO_USERS } from "@/lib/demo-data";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(mail: string, pass: string) {
    setBusy(true);
    setError("");

    const sb = browserClient();
    const { error } = await sb.auth.signInWithPassword({ email: mail, password: pass });
    if (error) {
      // Deliberately vague: saying which half was wrong tells an attacker
      // which email addresses have accounts here.
      setError("Correo o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    router.push(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  const field = {
    background: "var(--ink)",
    borderColor: "var(--line)",
    color: "var(--text)",
  };

  return (
    // min-h-dvh, not min-h-screen: on mobile the browser chrome makes 100vh
    // taller than the visible area, which pushes the card off centre.
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl p-8 sm:p-10 border text-center"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        {/* The badge earns its space here — a login screen is the one place
            with room for the full mark at a size where it actually reads. */}
        {/* Next does not rewrite a plain <img>, so the base path goes on by
            hand — without it this resolves to the domain root and 404s. */}
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`}
          alt="Go Picadera"
          width={455}
          height={420}
          className="mx-auto mb-5 h-24 w-auto"
        />

        <div className="font-black text-3xl tracking-tight mb-1">
          <span style={{ color: "var(--ember)" }}>GO</span>PICADERA
        </div>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          Consola de pedidos e inventario
        </p>

        {/* Demo build only, and deliberately ABOVE the fields: below them it
            sat past the fold on a phone, so people met an empty form with no
            hint that they were not expected to type anything. */}
        {IS_DEMO && (
          <div
            className="mb-7 pb-6 border-b text-left"
            style={{ borderColor: "var(--line)" }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--yellow)" }}
            >
              Demostración · toca una cuenta para entrar
            </p>

            {DEMO_USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  // Fill the fields as well, so it is obvious what was used.
                  setEmail(u.email);
                  setPassword(u.password);
                  void signIn(u.email, u.password);
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl border mb-2 transition-colors disabled:opacity-50"
                style={{ background: "var(--ink)", borderColor: "var(--line)" }}
              >
                <span className="block text-sm font-bold">{u.full_name}</span>
                <span className="block text-xs nums" style={{ color: "var(--faint)" }}>
                  {u.email} · {u.password}
                </span>
              </button>
            ))}

            <p className="text-xs mt-3" style={{ color: "var(--faint)" }}>
              Los pedidos, el inventario y los precios son de ejemplo. Puedes
              cambiar lo que quieras: todo vuelve a su sitio al recargar.
            </p>
          </div>
        )}

        {/* Fields stay left-aligned inside the centred card — centred labels
            above left-aligned text inputs reads as a mistake. */}
        <div className="text-left">
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--faint)" }}
          >
            Correo
          </label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-5 px-4 py-3 rounded-xl border outline-none text-base"
            style={field}
          />

          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--faint)" }}
          >
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-6 px-4 py-3 rounded-xl border outline-none text-base"
            style={field}
          />
        </div>

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
          {busy ? "Entrando…" : "Entrar"}
        </button>

      </form>
    </div>
  );
}
