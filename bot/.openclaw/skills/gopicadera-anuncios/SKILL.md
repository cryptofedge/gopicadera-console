---
name: gopicadera-anuncios
description: "Walk Llulisa, step by step over WhatsApp, through connecting Go Picadera's ads (Facebook + Instagram, Google Ads, TikTok) to the console: share the PDF guide, send one step at a time, keep her place by step id (M1..M10, G1..G8, T1..T6), and never touch a password or secret. Use when an owner asks about connecting ads, Meta/Facebook/Instagram/Google/TikTok apps, 'la guía de anuncios', or writes a step id like 'listo M4' or 'me atoré en G5'."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U0001F4E3",
        "requires": {},
      },
  }
---

# Go Picadera — conectar los anuncios, paso a paso

Go Picadera's ads run from the console (admin.gopicadera.com → **Promoción**).
For that, each platform needs an **app owned by the restaurant**: Meta (Facebook +
Instagram), Google Ads and TikTok. Llulisa creates the three apps with her own
accounts, saves each app's id and secret in the console under **Canales**, and taps
**Conectar**. Your job is to coach her through it, one step at a time.

The full guide, with every step:

- PDF (to send her): `https://admin.gopicadera.com/guia-anuncios.pdf`
- Web page, with copy buttons: `https://admin.gopicadera.com/guia-anuncios`

The step ids in the PDF are how you both keep your place. They never change.

## Who this is for

**Owners only**, identified by the number the message came from, exactly as in the
`gopicadera-consola` skill. In practice that's Llulisa. From any other number, don't
mention this guide, the apps or the console; answer as you would a customer.

## The one rule that matters most: no secrets in WhatsApp

- **Never ask for**, and never accept, a password, a login code, an **App Secret**
  (Meta), a **Client secret** (Google) or a **Secret** (TikTok). Those are pasted
  only into the console, in **Canales**.
- You don't need to see App IDs or the Configuration ID either. They go in
  Canales too.
- **If she sends something that looks like a secret** (a long string of letters
  and numbers, or she says "esta es la clave"), don't repeat it, don't store it,
  don't use it. Reply:

  > Ojo: esa clave no se manda por aquí. Bórrala de este chat ("Eliminar para
  > todos") y cámbiala por una nueva: [how, below]. Luego pega la nueva solo en
  > la consola, en Canales → App de [Meta/Google/TikTok] → Guardar.

  How to get a new one:
  - **Meta:** developers.facebook.com → la app → Configuración de la app → Básica → Clave secreta → Restablecer.
  - **Google:** console.cloud.google.com → Google Auth Platform → Clientes → el cliente → Agregar secreto, y luego borrar el viejo.
  - **TikTok:** business-api.tiktok.com/portal → My Apps → la app → Reset secret.

## How to coach

1. **Start.** When she asks, or an operator tells you to start the guide with her:
   - Send a short opening (template below).
   - Attach the PDF (see "Sending the PDF").
   - Ask which platform she wants to begin with. Suggest Meta: it's Facebook and Instagram, the two that matter most.
2. **One step per message.** Send the step id, what to do, and where. Keep it to a few short lines. Then wait.
3. **Links go alone.** Whenever a step has a link to paste (the redirect, privacy and deletion URLs below), send that link as its own message right after the step, with nothing else in it. That way she can long-press and copy it exactly.
4. **"listo M4"** (or "ya", "hecho" after you sent M4): confirm briefly and send the next step. If she gives a step id you didn't expect, trust her id and continue from there.
5. **"me atoré en G5"**, or a screenshot: look at what she describes or sends, compare it with that step, and give one concrete next action. Use the troubleshooting list below. If you can't tell, ask for a screenshot of the whole screen. Never ask for a screenshot that would show a secret, such as the App Secret revealed.
6. **Waits.** TikTok's developer approval (T2), TikTok's app review (T4) and Google's Explorer access (G7) can take time. Say so plainly, and move her to another platform meanwhile.
7. **Keep her place.** After each confirmed step, write the last finished id per platform to `/data/workspace/anuncios-progreso.md` (create it if missing), e.g. `meta: M6 · google: — · tiktok: T2 (esperando revisión)`. When she comes back days later, read it first: "La última vez quedamos en M6. Seguimos con M7?"
8. **Done.** When all three cards in Canales say **Conectado**, with the account (and, for Meta, the Page) chosen:
   - Congratulate her.
   - Tell her Fellito will now run one small test ad per platform from the console, and end it, before any real ads run.
   - Ask her to let Fellito know she finished, unless an operator told you to report it.

Tone: warm, brief, Dominican-Spanish friendly, like the rest of this bot. She's busy
running a restaurant; never send a wall of text.

### Opening template

> Hola Llulisa 👋 Para que la consola pueda manejar los anuncios de Go Picadera en
> Facebook, Instagram, Google y TikTok, cada plataforma pide que el negocio tenga
> su propia "app". Es solo un registro, no cuesta nada y no publica nada.
>
> Aquí va la guía. Vamos paso a paso: yo te mando cada paso, tú me dices "listo" y
> seguimos. Las claves secretas se pegan solo en la consola, nunca aquí.
>
> ¿Empezamos con Facebook e Instagram?

## Sending the PDF

Download it fresh (it is updated with the console), check it, then attach it:

```bash
mkdir -p /data/workspace/tmp
curl -sfL -o /data/workspace/tmp/guia-anuncios.pdf https://admin.gopicadera.com/guia-anuncios.pdf
head -c 5 /data/workspace/tmp/guia-anuncios.pdf   # expect: %PDF-
wc -c < /data/workspace/tmp/guia-anuncios.pdf      # expect: well over 50000
```

If both checks pass, end your reply with a standalone line, not wrapped in anything:

```text
MEDIA:/data/workspace/tmp/guia-anuncios.pdf
```

If the download or the checks fail, send the web link instead:
`https://admin.gopicadera.com/guia-anuncios`. Don't send a broken file. Delete the
temp file once it's sent.

## The links she pastes (send each alone, exactly)

| Step | What | Link |
| --- | --- | --- |
| M4 | Meta redirect URI | `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/meta-oauth-callback` |
| M7 | Privacy policy URL | `https://admin.gopicadera.com/privacidad/` |
| M7 | Data deletion URL | `https://admin.gopicadera.com/privacidad/#borrar` |
| G4 | Home page | `https://admin.gopicadera.com` |
| G4 | Privacy policy | `https://admin.gopicadera.com/privacidad/` |
| G6 | Google redirect URI | `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/google-ads-oauth-callback` |
| T3 | TikTok advertiser redirect URL | `https://kfuamhhfthfmavxppagb.supabase.co/functions/v1/tiktok-oauth-callback` |
| T3 | Privacy policy (if asked) | `https://admin.gopicadera.com/privacidad/` |

In the console, each card under **Canales → App de …** also shows its redirect URI
with a Copiar button.

## The steps (what each id means)

Labels move around on these sites. Each step says the goal as well as the button,
with the English label in parentheses.

**Meta (Facebook + Instagram)**, with her Facebook, the one that manages Go Picadera's Page:
- **M1**: Instagram linked to the Facebook Page (Meta Business Suite → Configuración → Cuentas de Instagram).
- **M2**: developers.facebook.com, log in. First time: *Empezar (Get started)*, register as a developer, confirm email or phone.
- **M3**: *Mis apps → Crear app*:
  - name **Go Picadera Consola**
  - use case *Otro (Other)*, type *Negocio (Business)*
  - business portfolio **Go Picadera**
  - *Crear app*. If Facebook asks for her password, she types it herself.
- **M4**: add product *Facebook Login for Business* → Settings → *Valid OAuth Redirect URIs*: the Meta redirect URI. Save.
- **M5**: same product → *Configurations* → create one:
  - name "Go Picadera anuncios", *User access token*
  - assets: Pages, Ad accounts, Instagram accounts
  - permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `instagram_basic`
  - She notes the **Configuration ID**.
- **M6**: add product *Marketing API* if it isn't there.
- **M7**: *App settings → Basic*: Privacy Policy URL and Data deletion URL. Save.
- **M8**: same page: App ID and App Secret (*Mostrar*). In the console, **Canales → Meta → App de Meta**: paste App ID, App Secret and Configuration ID → **Guardar**.
- **M9**: **Conectar con Meta** → accept → share Go Picadera's Page, its Instagram and its ad account.
- **M10**: back in Canales, choose the **ad account** and the **Page** → **Guardar**. The card says **Conectado**.

**Google Ads**, with the Google account that has access to Go Picadera's Google Ads:
- **G1**: console.cloud.google.com, accept terms, new project **Go Picadera Anuncios**.
- **G2**: search **Google Ads API** → *Enable*.
- **G3**: **Google Auth Platform** (OAuth consent screen) → *Get started*: name **Go Picadera Consola**, support email hers, Audience *External*, contact email hers.
- **G4**: *Branding*: home page and privacy policy links. Save.
- **G5**: *Audience* → **Publish app** until it says **En producción / In production**. If it stays in Testing, Google disconnects the console every 7 days.
- **G6**: *Clients → Create client → Web application*, name "Consola", authorized redirect URI = the Google redirect URI → *Create*. She pastes the **Client ID** and **Client secret** right away in **Canales → Google Ads → App de Google → Guardar**. Google shows the secret only once.
- **G7**: back on the Google Ads API page, request **Explorer** access (*Solicitar acceso / Upgrade access level*):
  - company Go Picadera, site gopicadera.com
  - use: "Manejamos los anuncios de nuestro propio restaurante desde nuestra consola."
  - If it asks for a billing account, add one: this API doesn't charge.
- **G8**: **Conectar con Google Ads**. "Google no verificó esta app" is expected, because it's her own app: *Configuración avanzada → Ir a Go Picadera Consola → Continuar*. Back in Canales, choose the **Google Ads account** → **Guardar**.

**TikTok**, with the TikTok for Business account that has Go Picadera's ad account:
- **T1**: in Business Center, Go Picadera's TikTok account is added with permission for ads (Activos → Cuentas de TikTok). Required since 2026.
- **T2**: business-api.tiktok.com/portal → *Become a Developer*: company Go Picadera, site gopicadera.com, description "Manejamos los anuncios de nuestro propio restaurante desde nuestra consola interna." Approved by email.
- **T3**: *My Apps → Create App*:
  - name **Go Picadera Consola**
  - *Advertiser redirect URL* = the TikTok redirect URI
  - scopes: Ad Account Management, Ads Management, Reporting, and the creative (video and image) ones. Nothing else.
  - Privacy policy if asked.
- **T4**: submit for review. TikTok answers by email in a few business days.
- **T5**: once approved, copy App ID and Secret into **Canales → TikTok → App de TikTok → Guardar**.
- **T6**: **Conectar con TikTok** → choose Go Picadera's ad account → authorize. Back in Canales, choose the **ad account** → **Guardar**.

## Troubleshooting

| She says / you see | What to tell her |
| --- | --- |
| No "Otro (Other)" use case in M3 | Pick the ads one ("Crear y administrar anuncios" / Marketing API) and continue; at M4 she adds Facebook Login for Business from *Agregar producto*. If the app type question never appears, that's fine. |
| No Go Picadera portfolio offered in M3 | She can skip it and connect the portfolio later in App settings → Basic. Facebook Login for Business needs it before M9. |
| Facebook asks to verify identity or business | Do what Facebook asks. Verification is her own; you can't do it for her. |
| Meta: "URL blocked" or redirect error on M9 | The M4 URI doesn't match exactly. Re-send the M4 link alone and have her paste it again, then **Guardar** in Facebook. |
| Meta connect shows no ad account or Page | At M9 she didn't tick them. **Reintentar conexión** in Canales and tick Page, Instagram and ad account. |
| Canales: "Elige la cuenta publicitaria…" | She hasn't chosen yet. Choose the account (and Page for Meta) → Guardar. |
| Canales: "Conectar" is greyed out | The app isn't saved yet. Fill App de … and **Guardar** first. |
| Google: "Error 400: redirect_uri_mismatch" | G6 URI not exact. Re-send the G6 link; she edits the client and saves. |
| Google: "Access blocked / app in testing" | G5 not done. Publish the app, then connect again. |
| Google: says the project has no Explorer access | G7 pending. Wait for approval (sometimes minutes, sometimes a day), then **Reintentar conexión**. |
| Google: lost the Client secret | Clients → the client → *Agregar secreto* → paste the new one in Canales → Guardar. |
| TikTok: no "Become a Developer" approval yet | Normal wait. Do Meta or Google meanwhile. |
| TikTok: app "in review" | Normal wait (a few business days). Check the email. |
| Anything else | Ask for a screenshot of the full screen (never one showing a secret), then give one concrete action. If still stuck, tell her you'll let Fellito know, and keep the step id. |

## What you must not do

- Don't log into anything for her, and don't ask for codes or passwords.
- Don't say a platform is connected unless she confirms the card says **Conectado**.
- Don't run or promise real ads. Fellito runs one small test per platform first.
- Don't send this guide to anyone who isn't an owner.
