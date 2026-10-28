import type { Metadata } from "next";

/**
 * Public privacy policy, outside the signed-in console.
 *
 * Meta, Google and TikTok each ask for a privacy policy URL (and Meta for data
 * deletion instructions) before an app can connect an ad account. This page is
 * that URL. It describes only what the console actually stores; keep it in step
 * with integrations.sql / ads_oauth.sql / ads_sync.sql if that ever changes.
 */
export const metadata: Metadata = {
  title: "Política de privacidad — Go Picadera",
  description: "Qué datos usa la consola de Go Picadera y cómo borrarlos.",
};

const UPDATED = "28 de octubre de 2026";

const h2: React.CSSProperties = { fontSize: "1.1rem", margin: "1.75rem 0 0.5rem" };

export default function PrivacidadPage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem 3rem", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>Política de privacidad</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Go Picadera · Consola · Actualizada el {UPDATED}</p>

      <h2 style={h2}>Quiénes somos</h2>
      <p className="my-3">
        Go Picadera es un restaurante en 4820 4th Ave, Brooklyn, NY 11220. Esta consola (admin.gopicadera.com) es
        una herramienta interna que usan los dueños y el personal del restaurante para manejar pedidos, menú,
        inventario y los anuncios del propio restaurante.
      </p>

      <h2 style={h2}>Qué datos usa</h2>
      <ul className="list-disc pl-5 mt-1 space-y-1">
        <li>Los pedidos, el menú y el inventario del restaurante.</li>
        <li>
          Cuando un dueño conecta Meta (Facebook e Instagram), TikTok o Google Ads: el permiso de acceso que entrega
          cada plataforma, el número y el nombre de las cuentas publicitarias y Páginas del restaurante, y sus campañas
          con las cifras que da la plataforma (gasto, impresiones, clics y conversiones).
        </li>
      </ul>

      <h2 style={h2}>Para qué</h2>
      <p className="my-3">
        Solo para mostrar, crear, pausar y terminar los anuncios del propio restaurante desde la consola. No vendemos
        ni compartimos estos datos con nadie, y no los usamos para ningún otro fin.
      </p>

      <h2 style={h2}>Dónde se guardan</h2>
      <p className="my-3">
        En la base de datos del restaurante, en Supabase (Estados Unidos). Los permisos de acceso de las plataformas
        nunca se envían al navegador: ni siquiera el dueño puede leerlos de vuelta.
      </p>

      <h2 id="borrar" style={h2}>Cómo borrar sus datos</h2>
      <ul className="list-disc pl-5 mt-1 space-y-1">
        <li>En la consola, <strong>Canales → Desconectar</strong> borra al instante el permiso guardado de esa plataforma.</li>
        <li>
          También puede quitar el acceso desde cada plataforma: en Facebook, Configuración → Integraciones comerciales;
          en Google, myaccount.google.com/permissions; en TikTok, el Business Center → Apps autorizadas.
        </li>
        <li>
          Para pedir que borremos todo lo que guardamos de usted, llame al restaurante al{" "}
          <a href="tel:+13474639911">+1 (347) 463-9911</a>. Lo borramos en un plazo de 30 días.
        </li>
      </ul>

      <h2 style={h2}>In English</h2>
      <p className="my-3">
        This console is an internal tool of Go Picadera, a restaurant at 4820 4th Ave, Brooklyn, NY 11220. When an owner
        connects Meta, TikTok or Google Ads, it stores the access permission each platform issues, the restaurant&apos;s
        ad account and Page ids and names, and its campaigns with their reported metrics, solely to show and manage the
        restaurant&apos;s own ads. Nothing is sold or shared. Access tokens are kept server-side and never sent to a
        browser. To delete data: disconnect the platform in the console (Canales), revoke the app in that platform&apos;s
        settings, or call +1 (347) 463-9911 and we will delete it within 30 days.
      </p>
    </main>
  );
}
