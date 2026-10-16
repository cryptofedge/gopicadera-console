# Recovering the WhatsApp bot

What to do when the Go Picadera WhatsApp bot stops replying. Nothing secret is
in this file on purpose — keys, phone numbers and the setup password live only
in the Railway variables and the gateway volume, never in this repo (see
[README.md](README.md)).

## Where the model is configured

The bot runs on the `clawdbot-railway-template` service in the Railway project
`enchanting-perception`. The model API key is the Railway variable
**`GEMINI_API_KEY`**. The model fallback order (Gemini first, Anthropic last)
lives in the gateway config on the Railway volume at `/data/.openclaw`, set
through the `/setup` wizard — not in Railway's variables.

To read what the bot is actually doing, open **Railway → the project → Logs**
(or run `openclaw logs --follow`).

## Failure 1 — "All models failed" with a Gemini 401

The log shows:

```
Embedded agent failed before reply: All models failed
google/gemini-...: 401 "The bound service account is deleted or disabled."
  reason: ACCOUNT_STATE_INVALID
anthropic/claude-...: credit balance too low
```

**Cause.** Current Gemini API keys are bound to a Google **service account**. If
the Google Cloud **project** that key belongs to gets suspended, that service
account is disabled, and every call returns the 401 above. The bot then tries
the Anthropic fallback, which only works if that account has credit (see
*Resilience* below).

**Fix — put a Gemini key from an _active_ project into Railway:**

1. In the Google Cloud Console, confirm you have a project that is **not**
   suspended: open its Service Accounts page; if it does not redirect to an
   `/appeal` page and the accounts show **Enabled**, it's good.
2. On that project's **APIs & Services → Credentials** page, reveal an existing
   Gemini API key (**Show key**) or create one (**Create credentials → API key
   → restrict to Gemini API → bind a service account**). Copy the value.
3. **Railway → `clawdbot-railway-template` → Variables → `GEMINI_API_KEY` →
   Edit.** Clear the old value completely, paste the new one, submit, then
   **Deploy**.
4. **Confirm the deploy actually swaps the container** — the logs should show
   `Stopping Container` / `Starting Container`. A common trap is editing the
   variable without the change registering, so the old dead key keeps running.
5. Send the bot a WhatsApp message and watch the logs: a clean `Auto-replied`
   with no 401 means it's back.

If **every** project on the account is suspended, there is no clean project
left. Either create the key on a **different Google account** that Google has
not flagged, or make the Anthropic fallback the working path (see below).

## Resilience — keep a funded fallback

The model chain ends in Anthropic (`claude-...`). If that account has credit, a
Gemini failure fails over to Claude and the bot keeps answering. If it has no
credit, any Gemini problem is a **total outage**. Funding the Anthropic account
is the single thing that turns a Gemini outage into a non-event, and it is the
only provider a Google-side suspension cannot touch. Keep it topped up.

Also prefer **stable (GA) model IDs** over `-preview` ones in the gateway
config; preview models are retired on Google's schedule.

## Harmless log noise

A second WhatsApp channel logs `[default] starting provider (unknown)` →
`channel exited` → `auto-restart attempt N/10`, forever. That `default` channel
is unused/misconfigured; the live channel is the personal one that logs
`Listening for personal WhatsApp inbound messages`. The noise does not affect
service. Removing the stray `default` channel from the gateway config is
optional cleanup.
