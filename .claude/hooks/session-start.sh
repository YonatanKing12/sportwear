#!/bin/bash
# SessionStart hook (Claude Code on the web only). Prepares a fresh container for SportWear work:
#   1. Node tooling for the theme, QA and catalog scripts (all devDependencies)
#   2. Dependencies of the vendored Shopify AI Toolkit validators
#   3. Shopify AI Toolkit telemetry opt-out file
#   4. Browser trust for the session's HTTPS proxy CA, so headless Chromium (QA screenshots,
#      product-page fetching) works with TLS verification on
# Idempotent and non-interactive.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# NODE_ENV=production in this environment makes npm skip devDependencies, and all tooling is dev-only.
npm install --include=dev --no-audit --no-fund --loglevel=error

# The vendored skill ships a package.json without a lockfile (theme-check packages for its validator).
npm install --include=dev --no-audit --no-fund --loglevel=error --prefix .claude/skills/shopify

# Belt and braces with OPT_OUT_INSTRUMENTATION / DO_NOT_TRACK in .claude/settings.json.
mkdir -p "$HOME/.config/shopify-ai-toolkit"
touch "$HOME/.config/shopify-ai-toolkit/opt-out"

PROXY_CA=/root/.ccr/agent-proxy-ca.crt
if [ -f "$PROXY_CA" ]; then
  if ! command -v certutil >/dev/null 2>&1; then
    apt-get install -y -q libnss3-tools >/dev/null 2>&1 ||
      { apt-get update -q >/dev/null 2>&1 && apt-get install -y -q libnss3-tools >/dev/null 2>&1; } ||
      echo "session-start: could not install certutil; headless Chromium may reject the proxy certificate" >&2
  fi
  if command -v certutil >/dev/null 2>&1; then
    nssdb="$HOME/.pki/nssdb"
    mkdir -p "$nssdb"
    [ -f "$nssdb/cert9.db" ] || certutil -d "sql:$nssdb" -N --empty-password
    tmpdir="$(mktemp -d)"
    csplit -s -z -f "$tmpdir/ca-" "$PROXY_CA" '/-----BEGIN CERTIFICATE-----/' '{*}'
    i=0
    for cert in "$tmpdir"/ca-*; do
      grep -q 'BEGIN CERTIFICATE' "$cert" || continue
      i=$((i + 1))
      certutil -d "sql:$nssdb" -D -n "ccr-agent-proxy-ca-$i" >/dev/null 2>&1 || true
      certutil -d "sql:$nssdb" -A -t "C,," -n "ccr-agent-proxy-ca-$i" -i "$cert"
    done
    rm -rf "$tmpdir"
  fi
fi
