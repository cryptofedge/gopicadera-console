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

**Typography.** Massive, aggressive, blocky, condensed, all-caps sans-serif —
Impact, Roboto Black, Montserrat ExtraBold. Four words maximum, five if they
are short. If it is unreadable at 168px wide — the size most people actually
see it at — it has failed.

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
- **The debate frame** — two speakers flanking the central text, implying a
  confrontation of ideas. Default layout whenever there are two people to
  work with.
- **Digital compositing, done the right way** — for a real, named person
  (Richard, a guest, a pastor), start from an actual photo of them (see
  "Where the real photos live" below for how to get one) and use Nano Banana
  Pro's native image-editing mode to relight and recompose it onto the
  stylized background: rim light added, background replaced, likeness
  untouched. **Never describe that person in a text prompt and let the model
  invent a face for them** — that boundary does not move for this style; see
  "What you never generate" below. A generic, unnamed illustrative figure —
  nobody real intended — can be generated from text like any stock image.
- **Backgrounds** — moody, abstract, symbolic, never a plain studio wall.
  Ancient libraries, stormy skies, an abstract cathedral interior lost in
  shadow.

**Symbolic integration.** Ground the topic immediately with religious
iconography: an open Bible, a glowing cross, a dove (the Holy Spirit), oil
being poured (anointing), shafts of light breaking through darkness. Give the
symbol a glow and put it centrally — often the thing physically standing
between two opposing subjects in a debate-frame layout. Stacked cash has
already been used once, for a prosperity-gospel episode. The dove and the
light stand in for the Spirit and God — never a direct depiction; see below.

**Lighting.** Never flat. Strong rim/backlighting in white or warm gold on
the cut-out subjects so they pop off the dark background, as if the light
source itself were supernatural. Volumetric "god rays" through the darkness
read as the same idea at the scene level.

**Branding.** The "MESA DEL REINO" logo sits small, top-center or top-left,
on every piece — consistent, never fighting the hook for attention.

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
node /data/workspace/scripts/drive-list.js              # top-level: shows the subfolders
node /data/workspace/scripts/drive-list.js <subfolder>   # contents of one subfolder, e.g. "Richard"
node /data/workspace/scripts/drive-download.js <fileId> <outputPath>   # saves one photo locally
```

**Always list before you assume a name.** The folder is organized by
subfolder per person (something like `Richard/` and a subfolder per guest or
pastor) rather than face recognition — reliable, and there is nothing to
misidentify. But don't guess a subfolder's exact name; run `drive-list.js`
with no argument first to see what is actually there, then `drive-list.js
<that name>` to find the right photo inside it. If a subfolder you expected
doesn't exist yet, say so plainly rather than pretending a photo was used —
this folder is new and may still be empty or half-organized.

Once you have a `fileId`, download it, then hand that local file to
`image_generate` as the reference image for Nano Banana Pro's editing mode.
That's the whole path from "real photo" to "on-brand thumbnail."

## Video

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

**Always quote the cost before generating.** Video is the one place where a
casual "hazme un par de opciones" turns into real money.

There is **no free tier for Veo at all**, so the billing note above applies
doubly here.

Other models are better at particular things — Kling 3.0 for human motion,
Seedance 2.0 for multi-scene continuity — but neither earns a second account
for a few seconds of B-roll a month. **Never build on Sora 2: its API shut
down on 24 September 2026.**

Never put a generated human face in the same frame as real footage of a real
person, and never generate video of a named individual.

## Cost

Say what something will cost before running a batch. At about $0.13 an image,
a week of artwork — thumbnail options, a few quote cards, story covers — lands
around a dollar or two. Video is priced per second and is the part that adds
up; quote a figure before generating, not after.

## What you do not do

**You make the files. Richard publishes them.** Do not post an image, upload a
thumbnail, or schedule anything on your own initiative. Drafting and scheduling
go through the `postiz` skill, and only with his explicit go-ahead each time.

Nothing here touches Go Picadera. Restaurant artwork is not made in podcast
mode, and podcast artwork never uses restaurant photos, branding or accounts.
