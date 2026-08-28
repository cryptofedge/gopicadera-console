---
name: lamesadelreino-clips
description: "Cutting Sunday's episode into the week's vertical clips with the Colab notebook. Use in podcast mode when Richard asks about clips, shorts, subtitles, or turning an episode into content for the week."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U00002702",
        "requires": {},
      },
  }
---

# Turning the episode into the week's clips

This is the weekly job. One live episode on Sunday becomes three or four
vertical clips through the week, and cutting them by hand is where Richard's
time actually goes.

**This is not video generation.** Veo invents footage that never existed; this
cuts footage that did. Do not offer to generate a clip — there is nothing to
generate, the moment is already on the recording.

## What runs it

A Colab notebook, `clipping/LaMesaDelReino_Clips.ipynb` in the project repo,
driving `opensource-clipping` (MIT). Paste the episode's YouTube link, run,
download a zip of vertical clips with captions burned in.

**It does not run on this bot.** It needs a CUDA GPU, which this container does
not have, so it runs on a free Colab T4. If asked to "just do it", say plainly
that the clipping runs in Colab and offer to walk through it step by step.

## What it does per clip

- Transcribes with Faster-Whisper (`large-v3`), word by word
- **Gemini picks the moments worth cutting**
- Reframes 16:9 to 9:16, tracking faces so nobody drifts out of frame
- Burns in karaoke-style captions
- **Splits the screen by speaker** when more than one person is talking, and
  goes full-screen when only one is — which is what a table show needs

## Walking him through it

Six steps, in order. Do not skip ahead; each one fails loudly if the one before
was missed.

1. **GPU first.** `Entorno de ejecución → Cambiar tipo de entorno → GPU (T4)`.
   Without it the run takes hours instead of minutes. The notebook stops with a
   clear message rather than crawling.
2. **Install** — five to eight minutes, first run only.
3. **Keys**, in Colab's Secrets panel (the key icon):
   - `GOOGLE_API_KEY` — required, the same Gemini key the bot uses
   - `HF_TOKEN` — optional, only for speaker split-screen
4. **Paste the episode link**, set how many clips, run.
5. **Wait** — roughly 20 to 40 minutes for a 45-minute episode.
6. **Download** the zip.

### The HuggingFace trap

Split-screen needs `HF_TOKEN` **and** the pyannote model agreement accepted at
`huggingface.co/pyannote/speaker-diarization-3.1`. A token without the accepted
agreement fails at the diarization step, deep into the run, after twenty
minutes of work. If he wants split-screen, confirm he accepted the agreement
before he starts — not after.

Without a token it still works fine; it just never splits the screen.

## Things that are already handled

Do not "fix" these — they are deliberate:

- **`--gemini-fallback-model gemini-3.6-flash`.** The project's own fallback is
  `gemini-2.5-flash`, which no longer exists for keys issued now. Left alone, a
  hiccup on the primary model kills the whole run.
- **`--words-per-sub 4`.** Spanish words are long; five per line overflows in
  vertical.
- **`--silence-trim`.** It is a conversation show, with pauses.

## What to check before anything goes out

**Read the subtitles.** Whisper is good and still wrong on proper nouns and
biblical terms — names, books, places. On a channel built on *fundamento
bíblico*, a misspelled book of the Bible burned into the video is worse than no
caption. Tell him to read them, every time.

**The titles are his.** Gemini suggests a title for each clip. That is a draft.
The `lamesadelreino` skill has the rule and it holds here: what goes out is
Richard's wording, not the model's.

**Nothing publishes itself.** The notebook produces files. Posting goes through
`postiz`, with his explicit approval each time.
