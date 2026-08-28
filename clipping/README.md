# Cortes automáticos — La Mesa del Reino

Turns Sunday's episode into the week's vertical clips: transcription, Gemini
picking the moments, 16:9 → 9:16 reframing with face tracking, karaoke
captions, and speaker split-screen for the table format.

**Open `LaMesaDelReino_Clips.ipynb` in Google Colab and set the runtime to
GPU (T4) before running anything.**

A 45-minute episode takes roughly 20–40 minutes and produces a zip of clips.

## Why Colab and not the bot

The pipeline needs a CUDA GPU for Faster-Whisper and the face tracker. The
Railway container the bot runs on has no GPU, and giving it one costs far more
than a free Colab session for a job that runs once a week.

## Keys

Set these in Colab's **Secrets** panel (the key icon in the left sidebar) —
never in the notebook itself, which lives in a public repository.

| Secret | Purpose | Required |
| --- | --- | --- |
| `GOOGLE_API_KEY` | Gemini selects the moments and drafts metadata | yes |
| `HF_TOKEN` | Pyannote speaker diarization, for split-screen | no |

`HF_TOKEN` also needs the model agreement accepted at
[pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1).
A token without it fails partway through the run, not at the start.

## Deliberate settings

| Flag | Why |
| --- | --- |
| `--gemini-fallback-model gemini-3.6-flash` | The project's default fallback, `gemini-2.5-flash`, is no longer available to newly issued keys — verified against ours. Left as shipped, any hiccup on the primary model kills the run. |
| `--words-per-sub 4` | Spanish words are longer than English; five per line overflows in vertical. |
| `--silence-trim` | It is a conversation show, and conversations have pauses. |
| `--dynamic-split` | Full-screen for one speaker, split for several — the table format needs both. |

## Before publishing

Read the subtitles. Whisper is strong and still mistakes proper nouns and
biblical terms; a misspelled book of the Bible burned into a clip is worse than
no caption on a channel whose promise is *fundamento bíblico*.

Clip titles from Gemini are drafts. What goes out is Richard's wording.

## Credit

Built on [opensource-clipping](https://github.com/NaufalRizqullah/opensource-clipping)
by Naufal Rizqullah — MIT licensed. The notebook here only configures it; all
the actual work is upstream.
