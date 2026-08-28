# Go Picadera WhatsApp bot

OpenClaw gateway, hosted on Railway, answering WhatsApp for the restaurant.

- Railway project `enchanting-perception`, service `clawdbot-railway-template`
- Setup wizard: `/setup` on the service domain
- State, config and skills live on the Railway volume at `/data/.openclaw`.
  That volume is what keeps the WhatsApp session paired across redeploys --
  lose it and someone has to scan the QR again.

## Skills

**`skills/gopicadera`** — the customer-facing one: menu, prices, options,
hours, and how to take an order. **Generated**, never hand-edited, so a price
can not drift between the website and what the bot quotes on WhatsApp.

**`skills/gopicadera-consola`** — the back office: what each console section
does, the owner/staff split, and the rules that are enforced by Row Level
Security rather than by the screen. Hand-written.

## Regenerating the menu skill

After any menu or price change on the storefront:

```bash
node bot/build-skill.js
```

Then install it on the running gateway. The wizard's import extracts into
`/data` and, per its source, does **not** delete existing files -- so it will
not wipe the WhatsApp session:

```bash
tar -czf skills.tar.gz -C bot .openclaw
curl -u admin:SETUP_PASSWORD --data-binary @skills.tar.gz   -H "content-type: application/gzip"   https://<service-domain>/setup/import
```

## What is deliberately not in this repo

**The owners' phone numbers.** This repository is public, because GitHub Pages
on the free plan only serves public repos. Personal numbers belong in the
gateway config on the Railway volume, which is private -- never here.

The skill therefore describes the *rule* ("identity is the number the message
came from; the owner list is configured in the gateway") without naming anyone.

Also absent, for the same reason: the Anthropic API key, the Supabase
service-role key, and the gateway setup password.
