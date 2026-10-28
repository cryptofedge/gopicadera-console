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

## Failure 2 — the bot goes quiet after about 11 days (out of memory)

The bot stops replying, yet the service looks fine: Railway shows the
deployment as active and the domain still answers `401 Auth required`. The log
ends with:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
[gateway] exited code=1 signal=null
```

**Why it stays down.** The service runs two processes: a small wrapper that
owns the domain and the `/setup` password, and the OpenClaw gateway behind it
that talks to WhatsApp. When the gateway exits, the wrapper keeps running and
does **not** start it again, and Railway's restart policy only watches the
wrapper. So the bot stays dead until someone restarts it (see *Getting a dead
gateway back*). This happened on 2026-10-27 at 22:08 UTC and lasted until a
manual restart on 2026-10-28 at 19:22 UTC. Railway's memory graph shows the same
climb and drop around 2026-10-01, when the bot was also down for most of a day.

**Cause — a stray, half-linked WhatsApp account.** The gateway config lists two
WhatsApp accounts under `channels.whatsapp.accounts`: `gp3`, the restaurant's
linked number, and `default`, left over from a pairing that never finished. It
has a credentials file but no phone number, hence `starting provider (unknown)`
in the log. OpenClaw starts every listed account, so:

1. `default` connects and WhatsApp closes it at once
   (`channel exited: {"error":{},...}`).
2. OpenClaw retries it 10 times with backoff, then its health monitor restarts
   it (`health-monitor: restarting (reason: stopped)`) and the cycle repeats:
   about 800 failed starts a day.
3. Each failed start leaks memory. In the OpenClaw version this template pins
   (v2026.3.8), the WhatsApp monitor adds a `SIGINT` listener every time it
   starts and removes it only when the connection ends normally. A connection
   that fails before it opens skips that cleanup, so the listener, and the
   state it holds on to, stays in memory for good. The log shows it about an
   hour after any restart:
   `MaxListenersExceededWarning: ... 51 SIGINT listeners added to [process]`.
   Current upstream OpenClaw removes the listener in a `finally`; v2026.3.8
   does not.
4. Memory climbs 100–160 MB a day, from about 0.8 GB right after a restart to
   2.5 GB at the crash. When the gateway's JavaScript heap reaches Node's ~2 GB
   limit, it dies: 11 days this time, about three weeks in September.

Memory was flat at about 0.6 GB from 2026-08-29 to 2026-09-08 and started
climbing after the 2026-09-09 redeploys, most likely when the number was
relinked as `gp3` and `default` was left behind.

**Fix — switch the stray account off.** One config edit. Saving it restarts the
gateway for about 10 seconds; the WhatsApp pairing on the volume is kept.

1. Pick a quiet moment: restaurant closed, nobody in a conversation with the
   bot, and in particular not while the owner is in the ads walkthrough.
2. Open `https://<service-domain>/setup` and sign in with the setup password
   (Railway variable `SETUP_PASSWORD`).
3. In **Config editor (advanced)**, find `channels` → `whatsapp` → `accounts` →
   `default` and add `enabled: false` to it. Leave `gp3` as it is.
4. In the same `whatsapp` block, if there is no `defaultAccount`, add
   `defaultAccount: "gp3"`. Otherwise anything that sends without naming an
   account would still pick the dead `default`.

   ```json5
   whatsapp: {
     // ...existing settings...
     defaultAccount: "gp3",
     accounts: {
       default: { /* existing keys */ enabled: false },
       gp3: { /* unchanged */ },
     },
   },
   ```

5. **Save.** The editor keeps a timestamped `.bak-*` copy of the old file and
   restarts the gateway.
6. In the logs, `[gp3] starting provider` and `Listening for personal WhatsApp
   inbound messages` should appear, and no new `[default]` lines. Send the bot a
   WhatsApp message and look for `Auto-replied`.
7. Over the next day, memory (Railway → the service → **Metrics**, or
   `railway metrics -s clawdbot-railway-template --memory --since 1d`) should
   stay flat near 0.8 GB instead of climbing, and the `SIGINT listeners`
   warning should not come back.

To undo, set `enabled: true` again or restore the `.bak-*` file.

Until the fix is in, the crash is predictable: roughly 11 days after the last
gateway restart. Restarting the gateway at a quiet hour before then resets the
clock.

## Getting a dead gateway back

Any one of:

- **Railway → `clawdbot-railway-template` → Restart** (or `railway restart`).
  Restarts the whole container.
- **`/setup` → Debug console → `gateway.restart` → Run.** Restarts only the
  gateway.
- Open `https://<service-domain>/` (the dashboard, not `/setup`) and sign in
  with the setup password: the wrapper starts the gateway if it isn't running.

Then confirm with `/healthz` (below) or a WhatsApp message.

## How the uptime check sees the gateway

`.github/workflows/gateway-health-watch.yml` runs every 10 minutes on GitHub
and reads `https://<service-domain>/healthz`. That endpoint is public (no
password, nothing secret in it) and reports `gateway.reachable`, which the
wrapper gets by connecting to the gateway's port. The check fails, and GitHub
emails the repo's watchers, when there is no response at all or `reachable` is
not `true` three times over about a minute. A routine gateway restart (skill
import, config save) takes about 10 seconds and does not trip it.

It only watches: it has no credentials and restarts nothing. It also cannot see
a gateway that is up but stuck (port open, nothing processed); a WhatsApp test
message is still the real check.

## Harmless log noise

- `[health-monitor] [whatsapp:gp3] health-monitor: restarting (reason:
  stale-socket)` about every 35 minutes. OpenClaw treats a WhatsApp connection
  with no events for 30 minutes as dead and reconnects it; on a quiet number
  that is most of the day. Each reconnect takes about a second and goes through
  the normal shutdown path, so it does not leak. The 30-minute threshold is
  fixed in v2026.3.8 (newer OpenClaw has
  `gateway.channelStaleEventThresholdMinutes`). The only setting here,
  `gateway.channelHealthCheckMinutes` (default 5), also delays catching a
  genuinely dead connection, so leave it alone unless messages go missing.
- `[tools] tools.profile (coding) allowlist contains unknown entries
  (apply_patch)`, logged at error level every 15 minutes and on every message.
  It is a tool-allowlist warning and does not affect replies.
