---
name: lamesadelreino-media
description: "Thumbnails, quote cards and social images for La Mesa del Reino using Gemini (Nano Banana Pro), plus how the weekly clips get cut and when AI video is actually the right tool. Use in podcast mode when Richard asks for artwork, a thumbnail, a clip plan or video."
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

Podcast mode only — **El Mini**, reached through `@podcast` or `@mini`,
alongside `lamesadelreino`.

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

- **Four words maximum.** Five if they are short ones.
- **Enormous type.** If it is unreadable at 168px wide it has failed, and that
  is the size most people see it at.
- **One face, one idea, high contrast.** Anything else disappears when scaled.
- **Spanish, with correct accents.** Check them in the output — models drop
  tildes and accents, and *años* versus *anos* is not a small error.
- **Match the channel.** Look at the existing thumbnails before inventing a
  look. If the palette or the font is unclear, ask Richard rather than
  guessing — a thumbnail that does not match the others costs him recognition.

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
