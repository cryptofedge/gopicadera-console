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
 *
 * This page is also the source of public/guia-anuncios.pdf, which the WhatsApp bot
 * shares and walks through step by step (bot skill gopicadera-anuncios). The step ids
 * (M1, G1, T1...) are how she and the bot keep their place, so keep them stable, and
 * regenerate the PDF after any change here (see scripts/build-guide-pdf.mjs).
 */
export const metadata: Metadata = {
  title: "Guía: conectar los anuncios — Go Picadera",
  description: "Cómo conectar Facebook, Instagram, Google y TikTok a la consola de Go Picadera.",
};

const FN = "https://kfuamhhfthfmavxppagb.supabase.co/functions/v1";
const PRIVACY = "https://admin.gopicadera.com/privacidad/";
const CONSOLE = "https://admin.gopicadera.com";

// Screen styles follow the console theme; print styles turn it into a light A5
// booklet with a checkbox per step and one platform per page.
const CSS = `
.guide { max-width: 720px; margin: 0 auto; padding: 2rem 1rem 4rem; line-height: 1.6; }
.guide h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .25rem; }
.guide h2 { font-size: 1.25rem; margin: 2.5rem 0 .15rem; }
.guide .muted { color: var(--muted); margin: 0; }
.guide p { margin: .75rem 0; }
.guide .box { border: 1px solid var(--line); border-radius: 8px; padding: .25rem 1rem; margin: 1rem 0; }
.guide .how { list-style: decimal; padding-left: 1.25rem; }
.guide .how li { margin: .35rem 0; }
.guide .steps { list-style: none; padding: 0; margin: .75rem 0 0; }
.guide .step { display: grid; grid-template-columns: 2.4rem 1fr; gap: .5rem; padding: .7rem 0; border-top: 1px solid var(--line); }
.guide .step-id { font-weight: 700; color: var(--yellow); }
.guide .step ul { list-style: disc; padding-left: 1.1rem; margin-top: .35rem; }
.guide .step ul li { margin: .25rem 0; }
.guide code { font-size: .92em; }
@media print {
  @page { size: A5; margin: 11mm 10mm 12mm; }
  html, body { background: #fff !important; color: #111 !important; }
  .guide { max-width: none; padding: 0; font-size: 10pt; line-height: 1.45; }
  .guide h1 { font-size: 17pt; margin-top: 4mm; }
  .guide h2 { font-size: 13pt; margin-top: 0; break-before: page; }
  .guide .muted { color: #555 !important; }
  .guide .box { border-color: #bbb; }
  .guide p { margin: .5rem 0; }
  .guide .step { border-top-color: #ddd; break-inside: avoid; grid-template-columns: 3.1rem 1fr; padding: .45rem 0; }
  .guide .step ul { margin-top: .2rem; }
  .guide .step ul li { margin: .1rem 0; }
  .guide .step-id { color: #111; white-space: nowrap; }
  .guide .step-id::before { content: ""; display: inline-block; width: .85em; height: .85em; border: 1.3px solid #111; border-radius: 2px; margin-right: .3em; vertical-align: -.1em; }
  .guide .copy { border-color: #bbb !important; break-inside: avoid; margin: .3rem 0 .4rem !important; padding: .3rem .6rem !important; }
  .guide .copy button { display: none; }
  .guide a { color: inherit; text-decoration: none; }
}
`;

function Step({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <li className="step" id={id}>
      <span className="step-id">{id}</span>
      <div>{children}</div>
    </li>
  );
}

export default function GuiaAnunciosPage() {
  return (
    <main className="guide">
      <style>{CSS}</style>

      <h1>Conectar los anuncios de Go Picadera</h1>
      <p className="muted">Facebook e Instagram, Google y TikTok · consola {CONSOLE.replace("https://", "")}</p>

      <div className="box">
        <p>
          Cada plataforma pide que el negocio tenga su propia <strong>app</strong>. Es solo un registro: no cuesta nada
          y no publica nada. Se hace una sola vez por plataforma, con las cuentas de Go Picadera.
        </p>
        <p>
          Al final de cada parte vas a pegar dos o tres datos en la consola, en <strong>Canales</strong>, y tocar{" "}
          <strong>Conectar</strong>. Las claves secretas se pegan <strong>solo ahí</strong>: nunca por WhatsApp,
          correo ni mensaje, tampoco al bot.
        </p>
      </div>

      <p><strong>Cómo usar esta guía</strong></p>
      <ol className="how">
        <li>Ve en orden. Cada paso tiene un código: M para Meta, G para Google, T para TikTok.</li>
        <li>
          Al terminar un paso, o si te atoras, escríbele al WhatsApp de Go Picadera con el código, por ejemplo{" "}
          <strong>&quot;listo M4&quot;</strong> o <strong>&quot;me atoré en G5&quot;</strong>. El bot te dice el
          siguiente paso.
        </li>
        <li>
          Los enlaces largos te los manda el bot por WhatsApp para copiarlos fácil. También están, con botón de copiar,
          en <strong>admin.gopicadera.com/guia-anuncios</strong>.
        </li>
        <li>Nunca le mandes al bot una contraseña ni una clave secreta. Él nunca te las va a pedir.</li>
      </ol>

      <p>
        Tiempo: Meta unos 15 minutos · Google unos 15 minutos · TikTok unos 15 minutos más la espera de su revisión
        (unos días hábiles).
      </p>

      {/* ------------------------------------------------------------------ META */}
      <h2>1. Facebook e Instagram (Meta)</h2>
      <p className="muted">Con tu Facebook, el que administra la Página de Go Picadera.</p>
      <ol className="steps">
        <Step id="M1">
          El Instagram de Go Picadera tiene que estar vinculado a la Página de Facebook (Meta Business Suite →
          Configuración → Cuentas de Instagram). Si ya lo está, sigue.
        </Step>
        <Step id="M2">
          Abre <strong>developers.facebook.com</strong> e inicia sesión. Si es la primera vez, toca{" "}
          <em>Empezar (Get started)</em> y regístrate como desarrolladora: confirma tu correo o teléfono.
        </Step>
        <Step id="M3">
          Toca <em>Mis apps (My Apps)</em> → <em>Crear app (Create app)</em>:
          <ul>
            <li>Nombre de la app: <strong>Go Picadera Consola</strong>. Correo de contacto: el tuyo.</li>
            <li>Caso de uso: <em>Otro (Other)</em>, al final de la lista. Tipo de app: <em>Negocio (Business)</em>.</li>
            <li>Portafolio comercial (Business portfolio): el de <strong>Go Picadera</strong>.</li>
            <li>Toca <em>Crear app</em>. Si Facebook pide tu contraseña, escríbela tú.</li>
          </ul>
        </Step>
        <Step id="M4">
          En el panel de la app, agrega el producto <em>Inicio de sesión con Facebook para empresas (Facebook Login
          for Business)</em> → <em>Configurar (Set up)</em>. En <em>Configuración (Settings)</em>, en{" "}
          <em>URI de redireccionamiento de OAuth válidos (Valid OAuth Redirect URIs)</em>, pega esto y guarda:
          <CopyField label="URI de redireccionamiento de Meta" value={`${FN}/meta-oauth-callback`} />
        </Step>
        <Step id="M5">
          En ese mismo producto: <em>Configuraciones (Configurations)</em> → <em>Crear configuración</em>:
          <ul>
            <li>Nombre: <strong>Go Picadera anuncios</strong>.</li>
            <li>Tipo de token: <em>Token de acceso de usuario (User access token)</em>.</li>
            <li>Activos (Assets): <em>Páginas</em>, <em>Cuentas publicitarias</em> y <em>Cuentas de Instagram</em>.</li>
            <li>
              Permisos: <code>ads_management</code>, <code>ads_read</code>, <code>business_management</code>,{" "}
              <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_ads</code>,{" "}
              <code>instagram_basic</code>.
            </li>
            <li>Créala y <strong>anota su número</strong> (ID de configuración / Configuration ID).</li>
          </ul>
        </Step>
        <Step id="M6">
          Agrega también el producto <em>API de marketing (Marketing API)</em>, si no aparece ya en el panel.
        </Step>
        <Step id="M7">
          <em>Configuración de la app → Básica (App settings → Basic)</em>. Pega la política de privacidad y las
          instrucciones para eliminar datos, y guarda:
          <CopyField label="URL de la política de privacidad (Privacy Policy URL)" value={PRIVACY} />
          <CopyField label="Instrucciones para eliminar datos (Data deletion instructions URL)" value={`${PRIVACY}#borrar`} />
        </Step>
        <Step id="M8">
          En esa misma página están el <strong>Identificador de la app (App ID)</strong> y la{" "}
          <strong>Clave secreta de la app (App Secret)</strong>; para ver la clave toca <em>Mostrar</em>. En la
          consola: <strong>Canales → Meta → App de Meta</strong>. Pega el App ID, la App Secret y el ID de
          configuración (M5). Toca <strong>Guardar</strong>.
        </Step>
        <Step id="M9">
          Toca <strong>Conectar con Meta</strong>. Acepta, y cuando Facebook pregunte qué compartir, marca la Página de
          Go Picadera, su Instagram y su cuenta publicitaria.
        </Step>
        <Step id="M10">
          De vuelta en Canales, elige la <strong>cuenta publicitaria</strong> y la <strong>Página</strong> de Go
          Picadera y toca <strong>Guardar</strong>. La tarjeta queda en <strong>Conectado</strong>.
        </Step>
      </ol>

      {/* ---------------------------------------------------------------- GOOGLE */}
      <h2>2. Google Ads</h2>
      <p className="muted">Con la cuenta de Google que entra a la cuenta de Google Ads de Go Picadera.</p>
      <ol className="steps">
        <Step id="G1">
          Abre <strong>console.cloud.google.com</strong>, inicia sesión y acepta los términos si te los pide. Arriba,
          crea un proyecto nuevo: <strong>Go Picadera Anuncios</strong>.
        </Step>
        <Step id="G2">
          En el buscador de arriba escribe <strong>Google Ads API</strong>, ábrela y toca <em>Habilitar (Enable)</em>.
        </Step>
        <Step id="G3">
          Busca <strong>Google Auth Platform</strong> (o <em>Pantalla de consentimiento de OAuth</em>) →{" "}
          <em>Comenzar (Get started)</em>:
          <ul>
            <li>Nombre de la app: <strong>Go Picadera Consola</strong>. Correo de asistencia: el tuyo.</li>
            <li>Público (Audience): <em>Externo (External)</em>. Correo de contacto: el tuyo. Crea.</li>
          </ul>
        </Step>
        <Step id="G4">
          En <em>Desarrollo de la marca (Branding)</em>, pega la página principal y la política de privacidad, y guarda:
          <CopyField label="Página principal (Home page)" value={CONSOLE} />
          <CopyField label="Política de privacidad (Privacy policy)" value={PRIVACY} />
        </Step>
        <Step id="G5">
          <strong>Importante:</strong> en <em>Público (Audience)</em> toca <em>Publicar app (Publish app)</em> y
          confirma, hasta que diga <strong>En producción</strong>. Si se queda en &quot;Prueba&quot;, Google desconecta
          la consola cada 7 días.
        </Step>
        <Step id="G6">
          <em>Clientes (Clients)</em> → <em>Crear cliente (Create client)</em> → tipo{" "}
          <em>Aplicación web (Web application)</em>, nombre <strong>Consola</strong>. En{" "}
          <em>URI de redireccionamiento autorizados</em> toca <em>Agregar URI</em> y pega:
          <CopyField label="URI de redireccionamiento de Google" value={`${FN}/google-ads-oauth-callback`} />
          Toca <em>Crear</em>. Pega <strong>ya</strong> el <strong>ID de cliente (Client ID)</strong> y el{" "}
          <strong>Secreto del cliente (Client secret)</strong> en la consola, en{" "}
          <strong>Canales → Google Ads → App de Google</strong>,
          y toca <strong>Guardar</strong>: Google muestra el secreto una sola vez.
        </Step>
        <Step id="G7">
          Vuelve a la página de <strong>Google Ads API</strong> y solicita el acceso <strong>Explorer</strong> (puede
          decir <em>Solicitar acceso</em> o <em>Upgrade access level</em>). Empresa: Go Picadera. Sitio: gopicadera.com.
          Uso: &quot;Manejamos los anuncios de nuestro propio restaurante desde nuestra consola.&quot; Si pide una
          cuenta de facturación, agrégala: esta API no cobra. Suele aprobarse solo, a veces en minutos.
        </Step>
        <Step id="G8">
          En Canales toca <strong>Conectar con Google Ads</strong>. Si Google dice{" "}
          <em>&quot;Google no verificó esta app&quot;</em>, es normal porque la app es tuya: toca{" "}
          <em>Configuración avanzada</em> → <em>Ir a Go Picadera Consola</em> → <em>Continuar</em>. De vuelta en
          Canales, elige la <strong>cuenta de Google Ads</strong> de Go Picadera y toca <strong>Guardar</strong>.
        </Step>
      </ol>

      {/* ---------------------------------------------------------------- TIKTOK */}
      <h2>3. TikTok</h2>
      <p className="muted">Con la cuenta de TikTok for Business que tiene la cuenta publicitaria de Go Picadera.</p>
      <ol className="steps">
        <Step id="T1">
          En el <strong>Business Center</strong> de TikTok, la cuenta de TikTok de Go Picadera tiene que estar agregada
          y con permiso para anuncios (Business Center → Activos → Cuentas de TikTok). Desde 2026 TikTok no deja crear
          anuncios sin eso.
        </Step>
        <Step id="T2">
          Abre <strong>business-api.tiktok.com/portal</strong>, inicia sesión y regístrate como desarrolladora (
          <em>Become a Developer</em>). Empresa: Go Picadera. Sitio: gopicadera.com. Descripción: &quot;Manejamos los
          anuncios de nuestro propio restaurante desde nuestra consola interna.&quot; TikTok lo aprueba por correo.
        </Step>
        <Step id="T3">
          Cuando llegue el correo: <em>My Apps</em> → <em>Create App</em>:
          <ul>
            <li>Nombre: <strong>Go Picadera Consola</strong>. Descripción: la misma de T2.</li>
            <li>
              <em>Advertiser redirect URL</em>:
              <CopyField label="URL de redireccionamiento de TikTok" value={`${FN}/tiktok-oauth-callback`} />
            </li>
            <li>
              Permisos (Scopes): los de <em>Ad Account Management</em>, <em>Ads Management</em>, <em>Reporting</em> y
              los de videos e imágenes (<em>Creative Management</em> o parecido). Nada más.
            </li>
            <li>
              Si pide política de privacidad:
              <CopyField label="Política de privacidad" value={PRIVACY} />
            </li>
          </ul>
        </Step>
        <Step id="T4">Envía la app a revisión. TikTok responde por correo en unos días hábiles.</Step>
        <Step id="T5">
          Cuando la aprueben: abre la app en <em>My Apps</em> y copia el <strong>App ID</strong> y el{" "}
          <strong>Secret</strong>. En la consola: <strong>Canales → TikTok → App de TikTok</strong>. Pega los dos y toca{" "}
          <strong>Guardar</strong>.
        </Step>
        <Step id="T6">
          Toca <strong>Conectar con TikTok</strong>, marca la cuenta publicitaria de Go Picadera y autoriza. De vuelta en
          Canales, elige la <strong>cuenta publicitaria</strong> y toca <strong>Guardar</strong>.
        </Step>
      </ol>

      <div className="box">
        <p>
          <strong>Cuando termines</strong>, escríbele al bot <strong>&quot;terminé&quot;</strong>. Fellito prueba un
          anuncio pequeño en cada plataforma desde la consola y lo termina, para confirmar que todo funciona antes de
          anunciar de verdad.
        </p>
      </div>
    </main>
  );
}
