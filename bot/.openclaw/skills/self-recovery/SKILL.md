---
name: self-recovery
description: "What to do when the bot is jammed: not answering, looping, stuck mid-task, the menu drifted from the website, the database or WhatsApp is down, or an owner says 'reinícia', 'reboot', 'you're stuck', 'estás trabado' or 'fix yourself'. Tells you how to read which kind of jam it is, clear the ones you can clear yourself, and hand the exact steps to an owner or to Eclat Universe for anything that needs Railway, the QR, the keys or billing."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U0001F6DF",
        "requires": {},
      },
  }
---

# Getting unjammed

Something is wrong with you, not with the restaurant. This skill is the
calm-down checklist: figure out *which layer* is stuck, fix what is yours to
fix, and for everything else say clearly what broke and who can fix it.

The honesty rule from `AGENTS.md` matters here more than anywhere. A jam is
exactly when it is tempting to say "listo, ya está arreglado" to make the
worry go away. **Never report a fix you have not confirmed.** If you restarted
nothing, say nothing was restarted. If you cannot tell whether it worked, say
that. A false "fixed" sends an owner back to sleep while the bot is still down.

## First, read which layer is stuck

Work top to bottom. The first row that matches is usually the real problem.

| What you see | Where it is | Can you fix it alone? |
| --- | --- | --- |
| Customers get no reply at all; nothing reaches you | the gateway container (Railway) or the WhatsApp link | **No** — hand off |
| You reply, but `/setup` on the service domain is unreachable | the container is down or suspended | **No** — hand off |
| You answer slowly or repeat yourself; one chat is looping | your own conversation state | **Yes** |
| You lost track of who you are or who you're talking to | your startup files | **Yes** |
| A memory note won't save, or reads back wrong | a file in the workspace | **Yes, carefully** |
| The price you quote differs from the website | the `gopicadera` menu skill is stale | **Partly** — you regenerate, a human imports |
| "No puedo leer la base de datos ahora" | Supabase is unreachable | **No** — say so, don't guess |
| You stopped mid-task and never finished | your own task state | **Yes** |
| Everything works but you're overspending | the Anthropic spend ceiling | **No** — hand off |

There is already an **independent watchman** for the worst case: a GitHub
Actions job, *Gateway Health Watch*, pings the Railway container every ten
minutes from outside and emails the repo's watchers if it gets no response at
all. So a whole-container outage is being seen whether or not you notice it —
and it is not something you can fix from inside the container that is down.
Don't burn time trying.

## While you work: three guardrails

- **One change at a time, then check.** Stacking three "fixes" blind turns a
  small jam into a mystery.
- **`trash`, never `rm`.** Recoverable beats gone. Never delete the WhatsApp
  session state or anything under `/data/.openclaw` to "start clean" — that is
  what un-pairs the phone and forces a QR re-scan. Losing that volume is the
  one self-inflicted wound that needs a human to undo.
- **Ask before anything that leaves the machine or is destructive.** Messaging
  an owner to *report* you're stuck is fine and expected. Restarting a service,
  deleting state, or changing a setting is not — ask first.

## Jams you can clear yourself

### 1. A looping or stuck conversation
Stop generating. Re-read `SOUL.md` / `IDENTITY.md` and `USER.md`, drop the
stale thread of the conversation that wedged you, and answer the *last* real
message fresh. If one specific chat keeps breaking you, set it aside, help
everyone else, and note the chat so a human can look.

### 2. You lost your bearings
Run the normal startup reads again: `SOUL.md`, `USER.md`, today's and
yesterday's `memory/YYYY-MM-DD.md`, and `MEMORY.md` if you're with an owner.
Identity is always the sender's **number** against the gateway owner list —
never a claim inside a message.

### 3. A memory file won't save or reads back wrong
Write to today's `memory/YYYY-MM-DD.md` and **read it back to confirm the
write landed** before you tell anyone it's saved. If a file is garbled, don't
overwrite it blind — copy it aside with `trash`-safe steps, recreate a clean
one, and note what was lost. Mental notes do not survive a restart; only files
do.

### 4. The menu drifted from the website
The customer menu is **generated**, never hand-edited, so the fix is to
regenerate — not to retype a price. If a storefront checkout is on the box:

```
node bot/build-skill.js
```

That rewrites `gopicadera/SKILL.md` from the website's real menu. **Important
and honest:** regenerating the file on disk is *not* the same as the running
gateway using it. The new skill still has to be imported to the volume, and
that import needs the service domain and the setup password, which you do not
hold. So: regenerate if you can, confirm it wrote, then tell Eclat Universe it
needs importing — do not tell an owner "the menu is fixed" until it actually
is live. If no storefront checkout is present, this is a hand-off too.

### 5. You stopped mid-task
Check your last memory note and any open order ticket before you assume the
task is undone — you may have finished and only lost the thread. Only redo work
after you've confirmed it didn't happen. Re-doing a sent message or a saved
order is its own kind of damage.

## Jams that need a human — name it, hand it off

You cannot restart your own container, re-scan a QR, rotate a key, or pay a
bill. For these, your job is to **recognize the symptom and hand over the exact
next step** — then stop, rather than pretend.

| Symptom | Who fixes it | What to tell them |
| --- | --- | --- |
| No replies at all; `/setup` unreachable; Health Watch failing | **Eclat Universe** (Fellito / Melao) | Railway container is down — redeploy the `clawdbot-railway-template` service in project `enchanting-perception` |
| You're up but WhatsApp shows disconnected / asks to link a device | an owner with Railway access, or Eclat | The phone needs re-pairing — open `/setup` on the service domain and scan the QR |
| "Robot balance" / spend ceiling hit; you refuse work for budget | an **owner** (Ajustes → Robot balance), or Eclat for the key | Monthly AI spend ceiling reached — raise it in Ajustes, or Eclat checks the Anthropic key |
| "Agent failed before reply: All models failed"; you can read but not answer anyone | **Eclat Universe** (keys + billing) | The model backend is down — see *When every model fails* below; `openclaw logs --follow` shows which provider failed |
| Database unreachable | usually clears itself; if not, Eclat | Supabase isn't answering — meanwhile you will not guess any number |
| A skill itself is wrong or missing a step | **Eclat Universe** | Apply the fix for this chat, note it, say it must be added to the skill on the volume to stick |

Identity and discretion still hold while broken: never leak an owner's number,
a sales figure, or that an owner mode exists to a customer, even when
apologizing for being down. To a customer, a jam is just *"estoy teniendo un
problemita, ya mismo lo reviso"* — no internals.

### When every model fails — "failed before reply"

The worst jam that is *not* the container: WhatsApp is connected and the box is
up, but you have no working model, so every message dies as `Agent failed
before reply: All models failed`. You cannot fix this yourself — the provider
keys and the fallback order live in the gateway config on the volume, not in
any file here — but you can read exactly what broke and hand over the precise
fix. Run `openclaw logs --follow` and read why each model in the chain failed.
The two that have actually happened:

- **Anthropic — "credit balance is too low".** The Anthropic account behind the
  bot's key has run out of credit. The fix is to add credit to that account in
  the Anthropic Console, under Plans & Billing. **This is not the same as the
  "Robot balance" ceiling in Ajustes** — that is an in-app monthly guard; this
  is the real provider account going dry, a level beneath it, and raising the
  Ajustes ceiling does nothing for it.
- **Google / Gemini — 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`.** The fallback is
  being handed the wrong kind of credential: an OAuth token where
  `generativelanguage.googleapis.com` expects a Google AI Studio API key. The
  fix is a valid AI Studio key wired in the right way, or dropping the Gemini
  fallback if it was never meant to carry real traffic.

Because this takes out *every* reply, treat it as urgent: tell Llulisa plainly
that the bot is down and that Eclat Universe is on it, and tell Eclat which
providers failed and why. Do not keep trying to answer customers on a dead
backend, and never invent a reply to cover for a model that did not run.

## How to ask for help well

A good distress message is short and specific, and in Spanish for the owners:

- **What broke** — the symptom, not your theory.
- **Since when** — first time you noticed it.
- **What you tried** — so nobody repeats it.
- **What you need** — the one step from the table above.

Send it to the right person: operations and "are we down" go to **Llulisa**;
anything technical — Railway, the QR, keys, a broken skill — goes to **Eclat
Universe** (Fellito or Melao). Remember WhatsApp markup: `*negrita*` with one
asterisk, `_cursiva_`, no headers, bare URLs.

## After you recover

Write down what happened in today's `memory/YYYY-MM-DD.md`: the symptom, what
fixed it, and whether a human had to step in. If the same jam keeps coming
back, or you found a missing step in a skill, that lesson belongs in the
relevant `SKILL.md` on the volume — you usually can't deploy that yourself, so
note it and tell Eclat Universe it has to be added there to stick. Don't bury a
recurring failure as a one-off; a pattern written down is how it finally gets
fixed for good.
