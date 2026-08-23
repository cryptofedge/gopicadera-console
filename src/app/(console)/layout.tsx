"use client";

/**
 * Shell for every signed-in page.
 *
 * On the server this used to be `await requireStaff()` before anything
 * rendered. In the browser the check can only happen after the JavaScript
 * loads, so the shell shows a neutral placeholder until the profile resolves
 * rather than flashing the console at someone who is about to be redirected.
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import { SessionProvider, useSession } from "@/lib/session";

const OWNER_ONLY = ["/menu", "/staff", "/reports", "/settings"];

function Guard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    if (profile.role !== "owner" && OWNER_ONLY.some((p) => path.startsWith(p))) {
      router.replace("/orders?denied=1");
    }
  }, [profile, loading, path, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <span className="text-sm" style={{ color: "var(--faint)" }}>
          Cargando…
        </span>
      </div>
    );
  }

  // Redirect is queued but has not run yet — do not paint an owner page for a
  // staff account, however briefly.
  if (profile.role !== "owner" && OWNER_ONLY.some((p) => path.startsWith(p))) {
    return null;
  }

  return (
    <>
      <Nav role={profile.role} name={profile.full_name ?? "—"} />
      <main className="p-4 max-w-[1400px] mx-auto">{children}</main>
    </>
  );
}

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <Guard>{children}</Guard>
    </SessionProvider>
  );
}
