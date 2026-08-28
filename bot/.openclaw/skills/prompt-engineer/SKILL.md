---
name: prompt-engineer
description: "Turn a short request into a proper prompt before generating an image, a video, or a long piece of writing - then run it. Use for creative and generative work in podcast mode. Never use it for orders, stock, sales questions, or anything a customer asks."
metadata:
  {
    "openclaw":
      {
        "emoji": "✍️",
        "requires": {},
      },
  }
---

# Writing the prompt before doing the work

People ask for creative work in about six words. *"Hazme una miniatura sobre
profetas."* That is a complete request from a human and a hopeless one for an
image model. The gap between those two is this skill.

## When to use it — and when not to

Engage **only** when the output quality depends on how the request is phrased:

- Generating an **image** — thumbnails, quote cards, social artwork
- Generating **video** — B-roll, stings
- **Long-form writing** — episode descriptions, a set of social posts
- A **complex creative brief** with several parts

Do **not** engage otherwise. Most messages have one right answer and expanding
them adds delay while risking distortion:

| Request | What to do |
| --- | --- |
| "2 yaroas con pollo" | Take the order. Nothing to engineer. |
| "¿Cuánto vendimos hoy?" | Answer it. A precise question needs a precise answer. |
| "¿Está abierto?" | Answer it. |
| "¿Quedan aguacates?" | Check stock and say. |
| "Hazme una miniatura sobre profetas" | **Engage.** |

**Never engage for a customer.** Customers get food, prices, hours and
ordering — they never see a prompt, and they never wait while one is written.
This is podcast-side and owner-side only.

If you are unsure, don't. A direct answer that arrives is better than a
beautiful prompt for a question nobody asked.

## The method

**1. Work out what they actually want.** The deliverable, the format, where it
will be seen. A thumbnail and an Instagram quote card are different objects
even when the topic is identical.

**2. Fill the gaps from what you already know.** The week's theme, the
channel's look, the format specs in `lamesadelreino-media`, the line the clip
is built around. Do not ask for anything you can reasonably infer.

**3. Ask at most one question, and only if guessing wrong wastes money.** "¿Es
para YouTube o para Instagram?" is worth asking — the aspect ratio changes
everything. The exact shade of amber is not.

**4. Write the prompt.** For images, cover these in order:

- **Subject and composition** — what is in frame, where, how it is cropped
- **Lighting and mood**
- **Style and medium** — photographic, illustrated, graphic; the register
- **Text to render** — the exact words, in quotes, with every accent
- **Format** — aspect ratio and pixel size
- **What to exclude** — the things that must not appear

**5. Show it before spending money.** Images cost about $0.13, video costs
more, and a wrong prompt burns his time as well as his money. Show the prompt,
say what it will cost, wait for a yes.

**6. Run it, then iterate one variable at a time.** If a thumbnail is close but
the type is too small, change the type instruction and nothing else. Changing
four things at once means learning nothing from the result.

## Rules that do not bend

**Expanding a request is not replacing it.** Everything the person specified
survives into the prompt exactly as they said it. If Richard says *fondo
oscuro*, the prompt says dark background — you do not brighten it because it
would look better. Add detail to the parts he left open; never overwrite the
parts he closed.

**His words stay his words.** Episode titles, clip titles, quotes and scripture
go into the prompt **verbatim**. You are engineering the instructions around
the text, never the text itself. A model that "improves" Richard's title has
put words in his mouth and published them under his name.

**Carry the hard rules through every prompt.** No images of Jesus, God or the
Holy Spirit. No invented faces of real people. Spanish accents correct and
checked in the output. Those constraints come from `lamesadelreino-media` and
they are not negotiable — a prompt that optimises them away is worse than no
prompt at all.

**Say what you changed.** When you show the prompt, note in one line what you
inferred and what you assumed, so he can correct you before it costs anything.
"Asumí YouTube, 1280×720, y el tema de esta semana" is enough.

**Do not perform the process.** He wants a thumbnail, not an essay about how
you thought about the thumbnail. Show the prompt, note your assumptions, ask,
generate. No lecture on prompt engineering.

## Worked example

> **Richard:** hazme una miniatura sobre profetas

The theme is already known from the week's episode, so nothing needs asking:

> Miniatura de YouTube, 1280×720. Fondo carbón oscuro, luz ámbar lateral
> desde la izquierda, contraste alto. Una silla vacía junto a un micrófono de
> podcast, en penumbra, encuadre a la derecha. A la izquierda, texto blanco
> enorme en sans-serif bold, tres líneas, ocupando la mitad del alto:
> "¿LLAMADOS O AUTOPROCLAMADOS?" — con la tilde en LLAMADOS y los signos de
> apertura. Sin personas, sin rostros, sin figuras religiosas. Legible a
> 168px de ancho.
>
> Asumí YouTube y el tema de profetas de esta semana. ~$0.13. ¿Le doy?

Short, specific, every constraint carried through, and one line of assumptions
he can correct before a cent is spent.
