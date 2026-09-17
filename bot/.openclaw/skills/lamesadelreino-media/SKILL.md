---
name: lamesadelreino-media
description: "Thumbnails, quote cards and social images for La Mesa del Reino using Gemini (Nano Banana Pro), the channel's house visual style ('High-Impact Theological Digital Collage') for turning a topic or transcript into concrete thumbnail and edit direction, plus how the weekly clips get cut and when AI video is actually the right tool. Use in podcast mode when Richard asks for artwork, a thumbnail, a clip plan, edit direction or video."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U0001F3A8",
        "requires": { "env": ["GEMINI_API_KEY"] },
      },
  }
---

# La Mesa del Reino — images and video

Podcast mode only — **El Mini**, reached with `#elmini`, alongside
`lamesadelreino`.

## Creative direction

When Richard hands you a topic, a title, or a raw transcript, do not just
summarize it — act as creative director. Describe the exact thumbnail layout,
which words carry the weight, what gets composited behind them, and how the
edit should feel. That direction is as much the deliverable as any image file
you go on to generate.

The channel's house style is **"High-Impact Theological Digital Collage"** —
laid out in full below. Every thumbnail, quote card and edit should read as
one family, not a one-off improvisation.

**Where the design rules live — and where they do NOT.** This file is the
one and only design spec. When Richard locks in a new rule ("use this font",
"the red line is mandatory", "always add the logo"), it belongs *here*, in
this skill — **not in `IDENTITY.md`, not in a memory note.** But you cannot
deploy a change to this file yourself. So when he gives you a new rule:
apply it to the image you're making now, tell him it's noted, and say
plainly that Fellito has to add it to the skill to make it permanent. **Do
not edit `IDENTITY.md` or any other file to "save" a design rule, and do not
tell Richard you've permanently saved something when you've only noted it for
this conversation.** A half-saved rule that silently fails is worse than an
honest "noted, needs to be made permanent."

**Also called "Dark Luxury Cinematic Editorial — Black & Gold."** Same style,
a more precise name for the same thing: dark background, dramatic lighting, a
premium portrait, strong typography, metallic gold, depth, a poster-grade
finish. Black and gold are the two-color soul of the palette — burgundy, navy
and burnt orange (see below) are texture around that core, not a departure
from it. If Richard or anyone else calls it that name instead, or asks for
"black and gold," it means the same house style — do not treat it as a
different look. If a request ever needs a short style tag for a different
tool, this is it: *"Use a Dark Luxury Cinematic Editorial style, black and
gold, high-end poster look, dramatic lighting, premium YouTube thumbnail
aesthetic."*

## Images — Gemini, Nano Banana Pro

Model **`gemini-3-pro-image`** (Nano Banana Pro). Roughly **$0.13 an image**,
2–5 seconds, and every output carries an invisible **SynthID** watermark that
marks it as AI-generated. Google can detect it; that is a fact about the file,
not a setting to turn off.

It was picked for one specific reason: **it is the best model available at
rendering legible text inside an image.** For this channel that is the whole
job. A thumbnail is four words at 200 pixels wide, and models that garble text
are useless no matter how good the picture is.

`gemini-3.1-flash-image` is cheaper and quicker. Use it for volume — draft
quote cards, variations to choose between — and switch to the pro model for
anything where the text has to be perfect, which means every thumbnail.

**Image generation needs billing enabled on the Google Cloud project behind
the key.** There is no free quota for it: a key with billing off returns
`RESOURCE_EXHAUSTED` on every image model while text and embeddings keep
working normally. If you hit that error, the key is fine and billing is the
problem — say so plainly instead of retrying or blaming the prompt.

### How to actually generate one

**There is no `image_generate` tool on this gateway — this version of
OpenClaw doesn't have one.** The `image` tool that does exist only *analyzes*
an image; it cannot make one. The real path is `exec` calling the Gemini API
directly, the same way every other write in this project happens (see
`gopicadera`'s order-writing for the same pattern). `GEMINI_API_KEY` is
already in the environment — never ask for it or print it.

**Build the request body with `jq`, never by hand-interpolating text into a
JSON string.** A prompt or edit instruction can contain a quote, an accent, a
colon in dialogue — any of that breaks a hand-built JSON string silently and
wastes the call. `jq -n` escapes all of it correctly:

Every call sets `imageConfig.imageSize`:
- **`"4K"`** for a reference photo and any prep pass — keep every detail while
  working.
- **`"1K"`** for the final thumbnail that gets delivered. Verified: 1K lands
  around 0.6-0.9MB, safely under **YouTube's 2MB thumbnail upload limit**. 2K
  comes back at ~2.3MB and **YouTube rejects it**; 4K is ~5MB. 1K's ~1408×768
  is already more than a 1280×720 thumbnail needs.
- **`"2K"`** only for a non-thumbnail deliverable where the file-size limit
  doesn't apply (a poster, a print piece Richard asks for).

Any call that produces a **final** image (not a prep pass) also carries the
logo as a reference part — `LOGO_B64=$(base64 -w0 /data/workspace/brand/lmdr-logo.png)` —
and the prompt tells the model to reproduce it small in the top corner. Skip
the logo part only for prep passes, or when Richard said no logo.

```bash
# Plain generation (no reference photo) -- final image, so logo + 1K:
jq -n --arg logo "$LOGO_B64" --arg text "$PROMPT" \
  '{ contents: [{ parts: [
       { inlineData: { mimeType: "image/png", data: $logo } },
       { text: $text }
     ] }],
     generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: "1K" } } }' \
  > /tmp/gen-request.json

# With a real reference photo (a real, named person -- see "Where the real
# photos live" below): base64 the downloaded photo, then build a request with
# the photo part *before* the text, so the model edits the real photo instead
# of inventing a face. A final compose call also carries the logo part.
IMG_B64=$(base64 -w0 /tmp/ref-clean.png)
jq -n --arg img "$IMG_B64" --arg logo "$LOGO_B64" --arg text "$EDIT_INSTRUCTIONS" \
  '{ contents: [{ parts: [
       { inlineData: { mimeType: "image/png", data: $img } },
       { inlineData: { mimeType: "image/png", data: $logo } },
       { text: $text }
     ] }],
     generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: "1K" } } }' \
  > /tmp/gen-request.json

# The actual call, one retryable shell command -- classify the result before
# deciding whether to retry:
HTTP_CODE=$(curl -s -o /tmp/gen-response.json -w "%{http_code}" \
  -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" -d @/tmp/gen-request.json)
```

**Classify `$HTTP_CODE` before deciding what to do:**
- **200** — good, read `/tmp/gen-response.json`.
- **429 or 5xx** — transient (rate limit or a Google-side hiccup). Worth one
  or two retries with a short backoff (a couple of seconds, doubling), not an
  endless loop.
- **400** — the request itself is malformed. Retrying won't help; check the
  JSON, don't hammer the API.
- **401/403** — the key is wrong or lacks access. Not a retry situation, and
  not something to troubleshoot mid-conversation — say so plainly.
- **402, or 200 with a `RESOURCE_EXHAUSTED` body** — billing, covered above.
  Never retry this one either.

The response body's image comes back base64 in
`candidates[0].content.parts[].inlineData.data`, with `inlineData.mimeType`
telling you the real type (usually `image/jpeg`, not necessarily `.png` even
though the model is often asked for one). **Write the response straight to a
file with `curl -o` (as above), never rely on capturing it through a shell
variable** — a high-res image's base64 is large enough that a tool's own
stdout-capture limit can silently truncate it before you ever see the JSON.

**Before sending, a free sanity check — no extra tools needed:** after
decoding the base64 to a file, confirm it's actually a real image and not an
empty or truncated one:

```bash
# Real JPEGs start with the bytes ff d8 ff; a corrupted/empty file won't.
head -c 3 the-image.jpg | od -An -tx1 | tr -d ' '   # expect: ffd8ff
wc -c < the-image.jpg                                # expect: comfortably more than a few KB
```

If either check fails, don't send it — say the generation didn't come out
right rather than forwarding a broken file.

**Sending the image over WhatsApp.** Save the decoded image somewhere under
`/data/workspace/` (e.g. `/data/workspace/tmp/thumb.jpg`), then end your
reply with a **standalone `MEDIA:` line** — trimmed text starting with
`MEDIA:`, on its own line, **not** inside backticks, bold, or a code fence:

```text
Aquí está la miniatura para el episodio. Dime si le ajusto algo.

MEDIA:/data/workspace/tmp/thumb.jpg
```

Wrapped forms do **not** attach — ``` `MEDIA:/path` ```, `**MEDIA:/path**`,
or `mira: MEDIA:/path` inline all send as plain text. One clean line.

**Always clean up the temp files** (`/tmp/gen-request.json`,
`/tmp/gen-response.json`, the decoded image) once the image is sent or the
attempt is abandoned — this runs inside a long-lived container, and files
left behind accumulate across every generation, every day, forever.

Same response shape. This is what "Nano Banana Pro's native image-editing
mode" means throughout this file — it is this call, with a real photo as the
first part, not a separate tool.

### Building the prompt — the part that actually decides the result

A vague prompt gets a vague image. Every thumbnail prompt spells out **all**
of these, in this order. Pull the specifics from the style sections below.

1. **What it's for** — a YouTube thumbnail, 16:9, for "La Mesa del Reino",
   its exact house style.
2. **Subjects** — which image is the reference, who is who, where each goes
   (edges, facing inward), headphones on, warm gold rim light, and
   *"remove the mics and any logos from that photo"*.
3. **Background** — near-black edges + heavy vignette + warm amber centre;
   the glowing religious anchor (Bible / cross / dove) in the centre with
   god-rays; **the literal prop for this specific topic** (money + red X,
   treasure chest, circus tent...).
4. **Font** — Anton, and the letterform description (flat-top A, round O).
   Upright for a debate frame, oblique for a solo/punchy one.
5. **Line 1** — the setup words, warm ivory `#EDE6D2`, faint distressed
   texture.
6. **Line 2** — the payoff words, the saturated gold gradient with the three
   hex stops (`#FDD65A` → `#F5BE38` → `#E89A15`), beveled, *"must not look
   pale/champagne/platinum"*. Red instead of gold only on the heaviest
   topics.
7. **The hard shadow** — no blur, solid black, ~20px straight down leaning
   slightly right, a crisp copy shoved down-behind.
8. **The outline** — thick black, over the shadow.
9. **La raya roja** — a rough red brushstroke, ragged ends, glow, between
   the two lines (debate frame) or under line 2 (solo). *"A graphic mark in
   the type only — no red on the people."*
10. **Logo** — reproduce the crest from the logo image, small, top-centre
    (debate) / top-left (solo).
11. **Constraints** — crushed blacks, high contrast, cinematic; no depiction
    of Jesus/God/Holy Spirit.

The `#EDE6D2`/`#FDD65A`/`#F5BE38`/`#E89A15` hexes and *"not champagne"* line
matter — leaving them out is why an earlier attempt came back washed-out.

**Worked example** (this exact prompt produced a good "¿CUÁNTO CUESTA SER
PASTOR?" — copy its shape):

> A YouTube thumbnail, 16:9, for the Spanish Christian debate podcast "La
> Mesa del Reino", exact house style.
> SUBJECTS: from the FIRST image. Left = Richard (blue shirt); right = the
> guest pastor (burgundy jacket). Keep both faces exactly. Cut out cleanly,
> place at left and right edges facing inward, headphones on, warm gold rim
> light on each (never red). Remove mics and logos from that photo.
> BACKGROUND: near-black edges, heavy vignette, warm amber glow center. Open
> Bible lit warm gold in the center with god-rays; below it a stack of cash
> with a bold RED X slashed through. Cathedral/stained-glass tones.
> TEXT — build in layers:
> Font: Anton — heavy, condensed, all-caps, flat-topped A, near-circular O,
> blunt terminals. Upright. Two stacked lines, huge, filling the middle
> third, breaking over the men's shoulders.
> Line 1 "¿CUÁNTO CUESTA": fill is a WARM IVORY off-white (#EDE6D2), NOT pure
> white. Faint distressed texture.
> Line 2 "SER PASTOR?": SATURATED WARM GOLDEN YELLOW — vivid, punchy. Gradient
> down the letters from bright marigold (#FDD65A) through amber-gold (#F5BE38)
> to deep amber-orange (#E89A15). Beveled/embossed top edges, gold metal. NOT
> pale/champagne/platinum. Faint distressed texture. Ends in a big "?".
> HARD BLACK DROP SHADOW on every letter: NO blur, solid black, offset ~20px
> straight down leaning slightly right, a crisp black copy shoved down-behind.
> Thick black outline on every letter over the shadow.
> LA RAYA ROJA: a rough hand-painted RED BRUSHSTROKE — irregular, ragged ends,
> soft glow, saturated pure red — between line 1 and line 2, tucked under
> "¿CUÁNTO CUESTA", about that word's width. Graphic mark in the type only,
> NO red on the people.
> LOGO: reproduce the crest from the SECOND image small, TOP-CENTER,
> faithfully.
> Crushed blacks, high contrast, cinematic. No depiction of
> Jesus/God/Holy Spirit.

### What gets made, and at what size

| Piece | Size | Notes |
| --- | --- | --- |
| YouTube thumbnail | 1280×720 | Shown as small as ~168px wide. Design for that, not for full size. |
| Instagram feed | 1080×1350 | Portrait 4:5. Reaches further than square. |
| Stories / Reels cover | 1080×1920 | Keep text clear of the top and bottom ~15%. |
| Quote card | 1080×1350 | One line from the episode, nothing else. |
| Facebook | 1200×630 | Landscape. |

### Thumbnails that actually work

The channel's own clip titles are the model: short, declarative, a little
provocative. *"La profecía no se vende."* The thumbnail carries the same line,
not a summary of it.

**Typography — locked, matched to the real channel thumbnails.**
- **Font: `Anton`.** Heavy, condensed, all-caps grotesque — flat-topped `A`
  (no point), near-circular `O`, near-uniform stroke weight, blunt squared
  terminals. Name `Anton` in the prompt and describe those letterforms. Only
  fall back to `Impact` if the model clearly can't do Anton; never
  `Roboto Black` or `Montserrat` (too round, too geometric).
- **Slant:** upright on the two-host "debate frame" thumbnails; skewed
  **~8-12° oblique** on the punchier single-idea ones. Same font, skewed.
- Four words max, five if short. Unreadable at 168px wide = it failed.

**Text treatment — locked. Every hook is built the same way, in layers:**
- **Two lines, stacked.** Line 1 is the setup, line 2 is the payoff. Line 2
  is the same size or slightly larger. The block is huge — the two lines
  together fill roughly the middle third of the height — and it **breaks the
  frame**, overlapping the subjects' shoulders, never sitting in clean empty
  space.
- **The hard shadow (this is the "sombra" Richard means).** A **hard-edged
  black drop shadow — NO blur** — offset straight down with a slight lean
  right, ~20px at full size, solid 100% black. A crisp black copy of the
  letters shoved down-behind them, *not* a soft realistic shadow. This is the
  single most important detail and the one most easily gotten wrong — a
  blurred/soft shadow reads cheap; the hard offset is what makes the text pop
  off the image like cut cardboard.
- **Thick black outline** on every letter, hugging the face — a real heavy
  stroke, sitting on top of the hard shadow.
- **Letter fill:**
  - Line 1: **warm off-white**, a warm ivory (`~#EDE6D2`), *not* pure white.
    Faint top-down gradient, brighter at the top.
  - Line 2: **saturated warm golden yellow — vivid, not pale.** A real
    gradient down the letters: bright marigold yellow at the top
    (`~#FDD65A`), solid amber-gold through the middle (`~#F5BE38`), deep
    amber / nearly orange-gold at the bottom (`~#E89A15`). Then a
    **bevel/emboss** on the top edges so it catches light and reads as gold
    *metal*. **If it looks champagne, platinum, or washed-out white-gold it
    is wrong** — it must be a punchy, warm, clearly-yellow gold. On the
    heaviest topics line 2 is **red** instead, same treatment.
  - Both fills carry a **subtle distressed/eroded texture** — not a perfectly
    smooth fill.
- **La raya roja.** A **rough red brushstroke** — short, slightly irregular,
  hand-painted-looking, with ragged ends and a soft outer glow, saturated
  pure red. Not a clean vector line. It sits **between line 1 and line 2**
  (tucked under the white word, roughly that word's width) on the debate
  frames; **under line 2** on the solo format. **It is a graphic element in
  the typography, NEVER a light or glow on the people.** Rim light on faces
  is always warm gold; the red only ever touches the type.

**Color.** Text is white or vivid gold/yellow; nothing else stays legible at
that size against a dark ground. Backgrounds are moody and saturated: deep
blue, burgundy, black, burnt orange. High contrast throughout, no exceptions.

**The hook.** One provocative theological question, usually ending in a big
"?" — *"¿Poder o espectáculo?"*, *"¿Profeta o empresario?"*. Same instinct as
the clip titles above: the line that stops a scroll, not a summary of the
episode.

**Composition.** Never a simple, realistic photo — every piece is styled as a
dramatic digital composite, subjects visibly layered onto a separate
background rather than blended into one continuous scene.
- **The debate frame** — two hosts cut out cleanly, one at each edge, facing
  slightly inward or down, headphones on, warm gold rim light on each. The
  central third stays clearer for the text. Default layout whenever there are
  two people. Their positions are not fixed — whichever host suits the
  composition goes left.
- **The solo frame** — one host, less aggressively cut out, more of the real
  podcast set kept (chair, desk mic — but crop or paint out any other show's
  mic-flag branding). Background replaced/extended behind him. Logo moves to
  top-left here (see "Branding").
- **Digital compositing, done the right way** — for a real, named person
  (Richard, a guest, a pastor), start from an actual photo of them (see
  "Where the real photos live" below for how to get one) and use Nano Banana
  Pro's native image-editing mode to relight and recompose it onto the
  stylized background: rim light added, background replaced, likeness
  untouched. **Never describe that person in a text prompt and let the model
  invent a face for them** — that boundary does not move for this style; see
  "What you never generate" below. A generic, unnamed illustrative figure —
  nobody real intended — can be generated from text like any stock image.
- **Backgrounds** — near-black at the edges with a **heavy vignette**, a warm
  amber/gold glow in the center. Cathedral interiors, stained glass, storm
  clouds with a fire-orange break, god-rays. Never a plain or studio wall.

**Symbolic integration — always two things in the center:**
- **A glowing religious anchor:** an open Bible lit warm gold, a cross on a
  hill against a fire sky, a dove (the Holy Spirit), oil being poured. Give it
  a glow, put it centrally — often the thing physically between the two hosts
  in a debate frame. The dove and the light stand in for the Spirit and God;
  never a direct depiction of Jesus/God — see "What you never generate".
- **A literal prop for the topic:** stacks of cash with a red X slashed
  through (money episode), a treasure chest of gold (prophet-for-profit), a
  circus big-top (the-gospel-as-a-show), a worship crowd with raised hands.
  One concrete object that says what the episode is about at a glance.

**Lighting.** Never flat. Strong rim/backlighting on the cut-out subjects so
they pop off the dark background, as if the light source itself were
supernatural — **warm gold or white, never red** (the red belongs only to
the typographic streak above). Volumetric "god rays" through the darkness
read as the same idea at the scene level.

**Branding.** The real **La Mesa del Reino logo** — crown, gold-and-white
"LA MESA DEL REINO" lettering, the cross, the round table, the circular gold
border — goes on **every image and every video by default**, small (roughly
12-15% of the width), on the dark upper area, never over a face, never
fighting the hook. **Top-center on the debate frame; top-left on the solo
frame.** The file is at `/data/workspace/brand/lmdr-logo.png` — pass it as a
reference part in the final compose call and instruct the model to reproduce
it faithfully in that corner (the model paints it in; it won't be
pixel-perfect, but it's far more consistent than describing it). **Only skip
the logo if Richard explicitly says to** ("sin logo", "no logo this time") —
his call, per piece, not a standing change.

**One face, one idea.** Anything beyond that disappears when scaled down.

**Spanish, with correct accents.** Check them in the output — models drop
tildes and accents, and *años* versus *anos* is not a small error.

**Sanity-check against the real thing.** The style above is now the explicit
spec, but still glance at the existing thumbnails before shipping — if
something about this request doesn't fit the pattern, ask Richard rather than
guess. A thumbnail that doesn't match the others costs him recognition.

Always give a couple of options and say which you would run and why.

### What you never generate

**No images of Jesus, God, or the Holy Spirit.** Not stylised, not from behind,
not as light. Christians genuinely disagree about depicting Christ at all, and
an AI-invented Jesus on a channel whose promise is *fundamento bíblico* is a
credibility problem before it is a theological one. Symbols are fine — an open
Bible, a table, bread, a cross, hands, light through a window.

**No invented faces for real people.** A guest gets their own photograph or
nothing. Never generate a likeness of Richard, a guest, a pastor or any named
person, and never put a real person into a scene that did not happen.

**No fake scenes presented as real** — no invented church footage, crowds or
events dressed up as documentary.

**No image that makes a scriptural claim the episode does not make.** The
artwork can be provocative. It cannot say something the Bible does not.

If a request runs into one of these, say which one and offer the version you
can make. There is almost always a symbolic route to the same idea.

### Where the real photos live

A shared Google Drive folder ("Pics For Designs") holds real reference photos
— this is what "Digital compositing, done the right way" above actually
pulls from. Access is a read-only service account, not a full Drive
connection: it can see only this one folder, nothing else in anyone's
Drive.

Two scripts, already in the workspace, no npm install needed:

```bash
node /data/workspace/scripts/drive-list.js              # top-level contents
node /data/workspace/scripts/drive-list.js <subfolder>   # contents of a named subfolder, if any exist
node /data/workspace/scripts/drive-download.js <fileId> <outputPath>   # saves one file locally
```

**Always run `drive-list.js` first — it is the live source of truth for
what's actually in the folder.** Don't rely on the snapshot below staying
current; the folder is being built out.

**What's in the folder right now (verified, will grow):**
- One file: `9fe2a801-c928-4368-99af-339c20bb11fe (1).png` — a clean cut-out
  (background already removed) of **two people together**:
  - **Richard is on the LEFT** (light blue button-up shirt, headphones)
  - **El Pastor is on the RIGHT** (burgundy/rust leather jacket over a black
    tee, headphones)
- El Pastor is a recurring figure on the show, not a one-off guest — this is
  the reference for both of them until more photos are added.
- The mics in that photo carry **"LNM RADIO" branding, which is a different
  show** — crop tight to the person, or have Pass 1 remove the mic entirely.
  It must not appear in a La Mesa del Reino thumbnail.
- Identity here is position in that image (left / right), stated above — not
  face recognition. If a future photo isn't captioned, ask Richard who is
  who rather than guessing.

If someone asks for a thumbnail with a guest who is *not* Richard or El
Pastor, there is no photo for them yet — say so; don't invent a face.

### If a reference photo or video arrives through WhatsApp instead of Drive

Every real reference — a photo of a host or guest, a video clip meant to
guide a generation — has to come through the **Drive folder** above, never
as a raw attachment sent straight into this chat. **Don't use an image or
video attached directly in WhatsApp as a generation reference, even if it
looks like exactly the right thing.**

**Why this isn't just process for its own sake:** the Drive pipeline is
what makes a clean, consistent, reusable reference possible — downloaded,
background-removed, verified, *then* fed into a generation call (see
"Prepping a real photo" right below). A WhatsApp attachment skips every one
of those steps, there's no tested path for pulling media straight out of a
chat message into `gemini-3-pro-image` or Veo, and it doesn't stick around
for the next time someone asks for the same person again — Drive does.

**When someone sends a photo or video clearly meaning it as a reference**
(not just chatting), don't try to use it, and don't just say no — explain
the real workflow, in Spanish, with actual steps they can follow right now:

> Para usarla como referencia de verdad, necesito que esté en la carpeta de
> Drive, no aquí en WhatsApp directamente — así la puedo trabajar bien
> (limpia, en buena resolución, y lista para reusar la próxima vez que la
> pidas). Son 2 minutos:
>
> 1. Abre esta carpeta: https://drive.google.com/drive/folders/1rSPOp4-sARI8zqfbn2quUunS16OLZeNg
> 2. Si no te deja subir nada, avísame y Fellito te da acceso.
> 3. Arrastra la foto o el video ahí adentro.
> 4. Escríbeme aquí "ya subí la foto" (o "el video") y la busco yo mismo.
>
> Después de eso queda guardada para todas las próximas piezas, no solo
> esta.

This is the same rule for any reference media, not just people for
thumbnails — a clip meant to guide a Veo or Kling generation follows it
too.

### Prepping a real photo — two passes, then compose

A raw photo off Drive is not ready to drop into a thumbnail. Prep it the way
a designer would: get it clean and high-res first, *then* do the creative
work.

1. **Download** — `drive-download.js <fileId> /tmp/ref-raw.png`
2. **Pass 1 — isolate the person you need, at 4K.** One `gemini-3-pro-image`
   edit call, the photo as the `inlineData` part,
   `imageConfig.imageSize: "4K"`. The instruction depends on the source:
   - **A combined photo** (like the current Richard-and-El-Pastor file):
     *"Output only the man on the LEFT / RIGHT — [Richard, blue shirt / El
     Pastor, burgundy jacket] — cleanly extracted on a plain white
     background. Remove the other person, the microphone, and any logos.
     Keep his face, clothes and pose exactly as they are."*
   - **A single-person photo:** *"Remove the background completely. Output
     only this person on a plain white background. Remove any microphone or
     logo. Keep his face, clothes and pose exactly as they are."*
   - Save as `/tmp/ref-clean.png`. (If the source is already a clean cut-out,
     you can skip straight to this call with just the "isolate the person on
     the left/right, drop the mic and logo" instruction — the background
     removal is done.)
   - **For a debate frame** with both real people, run Pass 1 twice, once
     per person, and pass both clean cut-outs into Pass 2.
3. **Verify** each cut-out with the free checks under "How to actually
   generate one" before spending the next call.
4. **Pass 2 — compose.** Feed the clean cut-out(s) **plus
   `/data/workspace/brand/lmdr-logo.png`** as `inlineData` parts into the
   house-style generation (the reference-photo call under "How to actually
   generate one"), `imageConfig.imageSize: "1K"` for the final thumbnail (under YouTube's 2MB cap).
   The prompt adds rim lighting, the dark constructed background, the symbols,
   the big type — **and reproduces the logo small in the top corner** (see
   "Branding" above), unless Richard said to leave it off.
5. **Clean up** every temp file once the thumbnail is sent.

Two paid `gemini-3-pro-image` calls per real-photo thumbnail (~$0.24 at 4K +
~$0.13-0.24 at 2K, so roughly **$0.40-0.50 each**). For a plain generated
figure (nobody real) there is no photo to prep — skip straight to a single
generation call. For a quick draft the two passes can be collapsed into one
prompt ("extract this person, place them on a dark dramatic background...")
but the split gives more control and a checkpoint, and is the default.

## Video

### The logo on video

The logo goes on **every video too, by default** — but the bot usually can't
burn it in. Veo returns a clean clip, and `ffmpeg` is **not part of this
container** — it can be `apt install`ed, but that lives on the ephemeral OS
filesystem and is wiped on the next gateway restart (config deploys restart
the gateway). So unless you've just installed it and nothing has restarted
since, assume no ffmpeg: the logo gets added in the edit, wherever the clip
is actually assembled (the local promo workflow, or the Colab clipping
notebook). When you hand Richard a generated clip, say it still needs the
logo added in editing — don't imply it's finished. Same opt-out: only skip
if he says so.

*(If ffmpeg overlay is wanted reliably, a static `ffmpeg` binary dropped into
`/data` — which persists — is the way; not set up yet.)*

### The honest answer first

The weekly bottleneck is **not** generating video. It is cutting Sunday's live
episode into the three or four vertical clips that go out during the week.
That is editing footage that already exists, and no text-to-video model does
it. Solve that before spending anything on generation.

**`opensource-clipping`** (MIT, github.com/NaufalRizqullah/opensource-clipping)
matches this format closely: word-level transcription with Faster-Whisper,
**Gemini picking the moments worth cutting**, face-tracking that reframes
16:9 to 9:16, karaoke captions, auto thumbnails — and a **podcast split-screen
mode with speaker diarization** built for exactly the several-people-at-a-table
setup this show uses.

The catch is real: it wants Python, FFmpeg and ideally a **CUDA GPU**. It
cannot run on the container this bot lives on. The practical route is a **Google
Colab T4 notebook**, which the project documents. Treat that as a separate
piece of the workflow, not something this bot executes.

### Edit direction — the house feel

Whatever actually does the cutting — `opensource-clipping`, or Richard by
hand — this is the direction to give:

- **Pacing.** Fast and urgent, cut to the rhythm of the speech. No dead air —
  a beat that doesn't move the argument or the emotion gets cut.
- **On-screen graphics.** Reuse the thumbnail's own elements — the giant
  type, the glowing cross — as motion graphics over key lines, not a separate
  look invented per clip.
- **Sound design.** Deep whooshes and cinematic hits on cuts, a tense
  underlying bed that swells under the most contested statements.
- **Color grade.** High contrast, crushed blacks, saturated skin tones —
  cinematic, not a casual vlog look. Match the thumbnail's palette so the
  clip and its cover read as one object.

### When AI video generation *is* right

Intro stings, transitions, and B-roll for a topic with nothing to film. Low
volume, a few seconds at a time.

**Veo 3.1 is reachable on the same Gemini key** — no second vendor, no second
invoice, no extra place a credential can leak. Three tiers, verified available:

| Model | Roughly | An 8-second clip |
| --- | --- | --- |
| `veo-3.1-lite-generate-preview` | ~$0.05/sec at 720p | **~$0.40**, or ~$0.24 without audio |
| `veo-3.1-fast-generate-preview` | ~$0.10/sec at 720p | **~$0.80** |
| `veo-3.1-generate-preview` | ~$0.40/sec | **~$3.20**, and up to ~$4.80 at 4K with audio |

Default to **lite** for background texture and **fast** when it is on screen on
its own. Standard only when Richard asks for it and knows the number — the gap
between lite and standard on an 8-second sting is roughly eight to one, for
something that plays behind a title card.

**Veo is not a single call like the image models -- it is submit-then-poll,
and treating it like a quick request will get the process killed mid-
generation.** The endpoint is `predictLongRunning`, not `generateContent`:

```bash
# 1. Submit -- returns an operation name immediately, not the video.
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/veo-request.json > /tmp/veo-op.json
OP_NAME=$(jq -r '.name' /tmp/veo-op.json)

# 2. Poll -- an 8-second clip is not instant. Wait a few seconds between
#    checks, not a tight loop, and expect this to take real wall-clock time.
curl -s "https://generativelanguage.googleapis.com/v1beta/$OP_NAME?key=$GEMINI_API_KEY" > /tmp/veo-status.json
# check .done -- keep polling with a short sleep between checks until true
```

Because this runs inside a shell command in the middle of the agent's own
turn, and not a background job, **do not fire the submit call and then wait
in a single long-running command** -- poll in short steps instead, so a
slow generation shows as "still working," not as a hung, killed process. If
several checks in a row still show `done: false`, that is normal for video,
not a failure -- say it is still rendering rather than giving up on the first
poll.

**Always quote the cost before generating.** Video is the one place where a
casual "hazme un par de opciones" turns into real money.

There is **no free tier for Veo at all**, so the billing note above applies
doubly here.

Other models are better at particular things — Kling for human motion,
Seedance 2.0 for multi-scene continuity — but neither earns a second account
for a few seconds of B-roll a month, **except Kling, where the account
already exists** (see below). **Never build on Sora 2: its API shut down on
24 September 2026.**

Never put a generated human face in the same frame as real footage of a real
person, and never generate video of a named individual.

### Kling — Richard's key exists, but nothing here is verified yet

Richard gave the bot a Kling API key specifically for **image-to-video**:
recreating a host walking through a scene with real cinematic motion — think
the Hollywood-trailer look, not a static generated clip. He already proved
the concept works by generating a test himself, by hand, in Kling's own app
(a walk through a cathedral). The key itself is stored in this workspace's
memory notes, not repeated here.

**What is not yet true:** this bot has never made a single verified API call
with that key. "Kling API" is not one shape — the official Kling API, and
wrapper providers like KIE.ai, fal.ai and Segmind, each expose different
endpoints and request fields for the same underlying model, and which one
this specific key actually authenticates against has not been confirmed.
Guessing a request shape and firing it at whatever host seems plausible is
exactly how the Gemini account got drained earlier — don't repeat that here
with a second vendor.

Before this is usable for real:

1. Confirm which provider issued the key (check wherever Richard generated
   it, or the account dashboard tied to it) and get that provider's actual
   current API reference — do not assume it matches a shape found by general
   web search.
2. Every Kling-compatible API that was checked follows the same broad
   pattern regardless of provider — submit a task (image + prompt), get back
   a task/request id, poll it, retrieve a video URL once status reads done —
   but the exact field names, auth header, and base URL differ per provider
   and must come from that provider's own docs, not from this file.
3. Test with the smallest, cheapest possible request first, the same way Veo
   and Gemini image gen were verified in this skill, and confirm the actual
   per-second or per-clip cost before generating anything Richard will see.

Until that verification happens, treat Kling as "available in principle, not
wired up yet" — default to Veo (above) for anything needed today.

## Cost

Say what something will cost before running a batch. Rough figures:
~$0.13 for a 1K/2K image, ~$0.24 at 4K, so a **real-photo thumbnail is two
calls, roughly $0.40-0.50** (the 4K prep pass plus the 2K compose pass). A
plain generated image is one call. A week of artwork — a few thumbnail
options, quote cards, story covers — still lands around a dollar or two.
Video is priced per second and is the part that adds up; quote a figure
before generating, not after.

## What you do not do

**You make the files. Richard publishes them.** Do not post an image, upload a
thumbnail, or schedule anything on your own initiative. Drafting and scheduling
go through the `postiz` skill, and only with his explicit go-ahead each time.

Nothing here touches Go Picadera. Restaurant artwork is not made in podcast
mode, and podcast artwork never uses restaurant photos, branding or accounts.
