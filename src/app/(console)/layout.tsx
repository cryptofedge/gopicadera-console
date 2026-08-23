/**
 * Shell for every signed-in page. Resolves the profile once here so each page
 * doesn't repeat the lookup, and hands the role to the nav.
 */
import Nav from "@/components/Nav";
import { requireStaff } from "@/lib/auth";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireStaff();
  return (
    <>
      <Nav role={me.role} name={me.full_name ?? "—"} />
      <main className="p-4 max-w-[1400px] mx-auto">{children}</main>
    </>
  );
}
