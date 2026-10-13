#!/usr/bin/env sh
# Bundle the OpenClaw skills in bot/.openclaw and import them to the running
# gateway in one step, so a price change or a skill edit reaches WhatsApp
# without retyping the tar + curl by hand.
#
# Secrets never live in this repo -- it is public. Pass them in the environment:
#
#   SETUP_PASSWORD   required -- the gateway /setup wizard password
#   GATEWAY_URL      optional -- gateway base URL, no trailing /setup
#                    (default: the Railway service the Health Watch pings)
#   SETUP_USER       optional -- basic-auth user (default: admin)
#   SKIP_BUILD       optional -- set to 1 to skip regenerating the menu skill
#   DRY_RUN          optional -- set to 1 to bundle and report only, no import
#
# Usage:
#   SETUP_PASSWORD='...' sh bot/import-skills.sh
#   DRY_RUN=1            sh bot/import-skills.sh         # see what would import
#   SETUP_PASSWORD='...' GATEWAY_URL='https://my.domain' sh bot/import-skills.sh
#
# The gateway import extracts into /data and does NOT delete existing files, so
# it updates skills without dropping the paired WhatsApp session.

set -eu

# This script's own directory (= the bot/ folder), so it runs from any cwd.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

GATEWAY_URL=${GATEWAY_URL:-https://clawdbot-railway-template-production-8925.up.railway.app}
SETUP_USER=${SETUP_USER:-admin}
GATEWAY_URL=${GATEWAY_URL%/}   # strip any trailing slash

if [ ! -d "$SCRIPT_DIR/.openclaw" ]; then
  echo "error: $SCRIPT_DIR/.openclaw not found -- run this from a checkout of the console repo." >&2
  exit 1
fi

# A real import needs the password; a dry run does not.
if [ "${DRY_RUN:-}" != "1" ] && [ -z "${SETUP_PASSWORD:-}" ]; then
  echo "error: SETUP_PASSWORD is not set." >&2
  echo "  run:  SETUP_PASSWORD='the-setup-wizard-password' sh \"$0\"" >&2
  echo "  or a dry run:  DRY_RUN=1 sh \"$0\"" >&2
  exit 1
fi

# Keep the customer menu in step with the website before shipping it, so the
# bot never quotes a stale price. Best-effort: needs node and a storefront
# checkout nearby. If either is missing, keep going with the committed menu.
if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "skipping menu regeneration (SKIP_BUILD=1); importing the committed menu as-is."
elif ! command -v node >/dev/null 2>&1; then
  echo "note: node not found; skipping menu regeneration, importing the committed menu as-is." >&2
elif node "$SCRIPT_DIR/build-skill.js"; then
  :
else
  echo "note: could not regenerate the menu skill (no storefront checkout?). Importing the committed menu as-is." >&2
fi

# Bundle into a throwaway temp dir outside the repo; clean it up on exit.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
tar -czf "$WORK/skills.tar.gz" -C "$SCRIPT_DIR" .openclaw

SKILLS=$(tar -tzf "$WORK/skills.tar.gz" | grep -c 'SKILL.md' || true)
BYTES=$(wc -c < "$WORK/skills.tar.gz" | tr -d ' ')
echo "bundled $SKILLS skills, $BYTES bytes."

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "dry run -- not importing. Would POST to: $GATEWAY_URL/setup/import"
  echo "skills in the bundle:"
  tar -tzf "$WORK/skills.tar.gz" | sed -n 's#^\.openclaw/skills/\([^/]*\)/.*#  - \1#p' | sort -u
  exit 0
fi

# Pass a bare filename to curl (cwd = the temp dir) to avoid path-translation
# issues on Windows/MSYS. Inspect the HTTP code ourselves for a clear message.
echo "importing to $GATEWAY_URL/setup/import ..."
status=0
http=$(cd "$WORK" && curl -sS -u "$SETUP_USER:$SETUP_PASSWORD" \
  --data-binary @skills.tar.gz \
  -H "content-type: application/gzip" \
  -o /dev/null -w '%{http_code}' \
  "$GATEWAY_URL/setup/import") || status=$?

if [ "$status" -ne 0 ]; then
  echo "error: curl failed (exit $status) reaching $GATEWAY_URL/setup/import." >&2
  echo "       check the gateway is up and GATEWAY_URL is correct." >&2
  exit "$status"
fi

case "$http" in
  2*)      echo "done -- gateway accepted the import (HTTP $http)." ;;
  401|403) echo "error: gateway rejected the credentials (HTTP $http). Check SETUP_PASSWORD." >&2; exit 1 ;;
  *)       echo "error: gateway returned HTTP $http -- the import may not have applied." >&2; exit 1 ;;
esac
