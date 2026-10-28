import type { Metadata } from "next";
import CopyField from "./CopyField";

/**
 * Public, step-by-step guide for the restaurant owner: create the Meta, Google and
 * TikTok developer apps under the restaurant's own accounts, then save each app's
 * id and secret in Canales and connect.
 *
 * Nobody else's account is attached to Go Picadera's ads, so these apps have to be
 * hers. Platform dashboards change their labels often; each step names the goal as
 * well as the button, with the English label in parentheses, so it still makes sense
 * when a label has moved.
 */
export const metadata: Metadata = {
  title: "Guía: conectar los anuncios — Go Picadera",
  description: "Cómo conectar Facebook, Instagram, Google y TikTok a la consola de Go Picadera.",
};

const FN = "https://kfuamhhfthfmavxppagb.supabase.co/functions/v1";
const PRIVACY = "https://admin.gopicadera.com/privacidad/";
const CONSOLE = "https://admin.gopicadera.com";

const h2: React.CSSProperties = { fontSize: "1.25rem", margin: "2.5rem 0 0.25rem" };
const note: React.CSSProperties = { color: "var(--muted)", marginTop: 0 };
const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: "0.75rem 1rem", margin: "1rem 0" };

export default function GuiaAnunciosPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem 4rem", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>Conectar los anuncios de Go Picadera</h1>
      <p style={note}>Facebook e Instagram, Google y TikTok · para la consola {CONSOLE.replace("https://", "")}</p>

      <div style={box}>
        <p className="mb-2" style={{ marginTop: 0 }}>
          Cada plataforma pide que el negocio tenga su propia <strong>app</strong>. Es solo un registro: no cuesta nada
          y no publica nada. Se hace una sola vez por plataforma, con las cuentas de Go Picadera.
        </p>
        <p className="mt-3" style={{ marginBottom: 0 }}>
          Al final de cada parte vas a pegar dos o tres datos en la consola, en <strong>Canales</strong>, y tocar{" "}
          <strong>Conectar</strong>. Las claves secretas se pegan <strong>solo ahí</strong>: nunca por WhatsApp,
          correo ni mensaje.
        </p>
      </div>

      <p className="my-4">Tiempo: Meta unos 15 minutos · Google unos 15 minutos · TikTok unos 15 minutos más la espera de su revisión.</p>

      {/* ------------------------------------------------------------------ META */}
      <h2 style={h2}>1. Facebook e Instagram (Meta)</h2>
      <p style={note}>Con tu Facebook, el que administra la Página de Go Picadera.</p>
      <ol className="list-decimal pl-6 space-y-3">
        <li>
          Antes de empezar: el Instagram de Go Picadera tiene que estar vinculado a la Página de Facebook (Meta Business
          Suite → Configuración → Cuentas de Instagram). Si ya lo está, sigue.
        </li>
        <li>
          Abre <strong>developers.facebook.com</strong> e inicia sesión. Si es la primera vez, toca{" "}
          <em>Empezar (Get started)</em> y regístrate como desarrolladora: confirma tu correo o teléfono.
        </li>
        <li>
          Toca <em>Mis apps (My Apps)</em> → <em>Crear app (Create app)</em>.
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Nombre de la app: <strong>Go Picadera Consola</strong>. Correo de contacto: el tuyo.</li>
            <li>
              Caso de uso: elige <em>Otro (Other)</em>, al final de la lista. Tipo de app:{" "}
              <em>Negocio (Business)</em>.
            </li>
            <li>Portafolio comercial (Business portfolio): elige el de <strong>Go Picadera</strong>.</li>
            <li>Toca <em>Crear app</em>. Facebook puede pedirte tu contraseña: escríbela tú.</li>
          </ul>
        </li>
        <li>
          En el panel de la app, agrega el producto <em>Inicio de sesión con Facebook para empresas (Facebook Login
          for Business)</em> → <em>Configurar (Set up)</em>. En <em>Configuración (Settings)</em>, en{" "}
          <em>URI de redireccionamiento de OAuth válidos (Valid OAuth Redirect URIs)</em>, pega esto y guarda:
          <CopyField label="URI de redireccionamiento de Meta" value={`${FN}/meta-oauth-callback`} />
        </li>
        <li>
          En ese mismo producto, abre <em>Configuraciones (Configurations)</em> → <em>Crear configuración</em>:
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Nombre: <strong>Go Picadera anuncios</strong>.</li>
            <li>Tipo de token: <em>Token de acceso de usuario (User access token)</em>.</li>
            <li>Activos (Assets): <em>Páginas</em>, <em>Cuentas publicitarias</em> e <em>Cuentas de Instagram</em>.</li>
            <li>
              Permisos: <code>ads_management</code>, <code>ads_read</code>, <code>business_management</code>,{" "}
              <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_ads</code>,{" "}
              <code>instagram_basic</code>.
            </li>
            <li>Crea la configuración y <strong>anota su número</strong> (ID de configuración / Configuration ID).</li>
          </ul>
        </li>
        <li>
          Agrega también el producto <em>API de marketing (Marketing API)</em> si no aparece ya en el panel.
        </li>
        <li>
          Ve a <em>Configuración de la app → Básica (App settings → Basic)</em>:
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>
              Pega la política de privacidad en <em>URL de la política de privacidad</em>:
              <CopyField label="Política de privacidad" value={PRIVACY} />
            </li>
            <li>
              Y en <em>Instrucciones para eliminar datos (Data deletion instructions URL)</em>:
              <CopyField label="Eliminación de datos" value={`${PRIVACY}#borrar`} />
            </li>
            <li>Guarda los cambios.</li>
            <li>
              Arriba están el <strong>Identificador de la app (App ID)</strong> y la{" "}
              <strong>Clave secreta de la app (App Secret)</strong>. Para ver la clave toca <em>Mostrar</em>.
            </li>
          </ul>
        </li>
        <li>
          En la consola: <strong>Canales → Meta → App de Meta</strong>. Pega el App ID, la App Secret y el ID de
          configuración. Toca <strong>Guardar</strong>.
        </li>
        <li>
          Toca <strong>Conectar con Meta</strong>. Acepta, y cuando Facebook pregunte qué compartir, marca la Página de
          Go Picadera, su Instagram y su cuenta publicitaria.
        </li>
        <li>
          De vuelta en Canales, elige la <strong>cuenta publicitaria</strong> y la <strong>Página</strong> de Go
          Picadera y toca <strong>Guardar</strong>. La tarjeta queda en <strong>Conectado</strong>.
        </li>
      </ol>

      {/* ---------------------------------------------------------------- GOOGLE */}
      <h2 style={h2}>2. Google Ads</h2>
      <p style={note}>Con la cuenta de Google que entra a la cuenta de Google Ads de Go Picadera.</p>
      <ol className="list-decimal pl-6 space-y-3">
        <li>
          Abre <strong>console.cloud.google.com</strong>, inicia sesión y acepta los términos si te los pide. Arriba,
          crea un proyecto nuevo: <strong>Go Picadera Anuncios</strong>.
        </li>
        <li>
          En el buscador de arriba escribe <strong>Google Ads API</strong>, ábrela y toca{" "}
          <em>Habilitar (Enable)</em>.
        </li>
        <li>
          Busca <strong>Google Auth Platform</strong> (o <em>Pantalla de consentimiento de OAuth</em>) →{" "}
          <em>Comenzar (Get started)</em>:
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Nombre de la app: <strong>Go Picadera Consola</strong>. Correo de asistencia: el tuyo.</li>
            <li>Público (Audience): <em>Externo (External)</em>. Correo de contacto: el tuyo. Crea.</li>
            <li>
              En <em>Desarrollo de la marca (Branding)</em>, página principal y política de privacidad:
              <CopyField label="Página principal" value={CONSOLE} />
              <CopyField label="Política de privacidad" value={PRIVACY} />
            </li>
            <li>
              <strong>Importante:</strong> en <em>Público (Audience)</em> toca <em>Publicar app (Publish app)</em> y
              confirma, hasta que diga <strong>En producción</strong>. Si se queda en &quot;Prueba&quot;, Google
              desconecta la consola cada 7 días.
            </li>
          </ul>
        </li>
        <li>
          En <em>Clientes (Clients)</em> → <em>Crear cliente (Create client)</em> → tipo{" "}
          <em>Aplicación web (Web application)</em>, nombre <strong>Consola</strong>. En{" "}
          <em>URI de redireccionamiento autorizados</em> toca <em>Agregar URI</em> y pega:
          <CopyField label="URI de redireccionamiento de Google" value={`${FN}/google-ads-oauth-callback`} />
          Toca <em>Crear</em>. Copia el <strong>ID de cliente</strong> y el <strong>Secreto del cliente</strong> en ese
          momento: Google muestra el secreto una sola vez.
        </li>
        <li>
          Vuelve a la página de <strong>Google Ads API</strong> y solicita el acceso <strong>Explorer</strong> (puede
          decir <em>Solicitar acceso</em> o <em>Upgrade access level</em>). Empresa: Go Picadera. Sitio: gopicadera.com.
          Uso: &quot;Manejamos los anuncios de nuestro propio restaurante desde nuestra consola.&quot; Si te pide una
          cuenta de facturación, agrégala: esta API no cobra. Normalmente lo aprueban solo, a veces en minutos.
        </li>
        <li>
          En la consola: <strong>Canales → Google Ads → App de Google</strong>. Pega el ID de cliente y el secreto.
          Toca <strong>Guardar</strong> y luego <strong>Conectar con Google Ads</strong>.
        </li>
        <li>
          Si Google dice <em>&quot;Google no verificó esta app&quot;</em>, es normal porque la app es tuya: toca{" "}
          <em>Configuración avanzada</em> → <em>Ir a Go Picadera Consola</em> → <em>Continuar</em>.
        </li>
        <li>
          De vuelta en Canales, elige la <strong>cuenta de Google Ads</strong> de Go Picadera y toca{" "}
          <strong>Guardar</strong>.
        </li>
      </ol>

      {/* ---------------------------------------------------------------- TIKTOK */}
      <h2 style={h2}>3. TikTok</h2>
      <p style={note}>Con la cuenta de TikTok for Business que tiene la cuenta publicitaria de Go Picadera.</p>
      <ol className="list-decimal pl-6 space-y-3">
        <li>
          Antes de empezar: en el <strong>Business Center</strong> de TikTok, la cuenta de TikTok de Go Picadera tiene
          que estar agregada y con permiso para anuncios (Business Center → Activos → Cuentas de TikTok). Desde 2026
          TikTok no deja crear anuncios sin eso.
        </li>
        <li>
          Abre <strong>business-api.tiktok.com/portal</strong>, inicia sesión y regístrate como desarrolladora (
          <em>Become a Developer</em>). Empresa: Go Picadera. Sitio: gopicadera.com. Descripción: &quot;Manejamos los
          anuncios de nuestro propio restaurante desde nuestra consola interna.&quot; TikTok lo aprueba por correo.
        </li>
        <li>
          Cuando llegue el correo: <em>My Apps</em> → <em>Create App</em>.
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Nombre: <strong>Go Picadera Consola</strong>. Descripción: la misma de arriba.</li>
            <li>
              <em>Advertiser redirect URL</em>:
              <CopyField label="URL de redireccionamiento de TikTok" value={`${FN}/tiktok-oauth-callback`} />
            </li>
            <li>
              Permisos (Scopes): los de <em>Ad Account Management</em>, <em>Ads Management</em>, <em>Reporting</em> y
              los de videos e imágenes (<em>Creative Management</em> o similar). Nada más.
            </li>
            <li>
              Si pide política de privacidad:
              <CopyField label="Política de privacidad" value={PRIVACY} />
            </li>
            <li>Envía la app a revisión. TikTok responde por correo en unos días hábiles.</li>
          </ul>
        </li>
        <li>
          Cuando la aprueben: abre la app en <em>My Apps</em> y copia el <strong>App ID</strong> y el{" "}
          <strong>Secret</strong>.
        </li>
        <li>
          En la consola: <strong>Canales → TikTok → App de TikTok</strong>. Pega los dos, toca{" "}
          <strong>Guardar</strong> y luego <strong>Conectar con TikTok</strong>. Marca la cuenta publicitaria de Go
          Picadera y autoriza.
        </li>
        <li>
          De vuelta en Canales, elige la <strong>cuenta publicitaria</strong> y toca <strong>Guardar</strong>.
        </li>
      </ol>

      <div style={box}>
        <strong>Cuando termines</strong>, avísale a Fellito. Él prueba un anuncio pequeño en cada plataforma desde la
        consola y lo termina, para confirmar que todo funciona antes de anunciar de verdad.
      </div>
    </main>
  );
}
