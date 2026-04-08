#!/usr/bin/env sh
set -e

# Try openssl first
if command -v openssl >/dev/null 2>&1; then
  openssl rand -hex 48
  exit 0
fi

# Fallback to node
if command -v node >/dev/null 2>&1; then
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  exit 0
fi

echo "Error: neither openssl nor node is available to generate a secret" >&2
exit 1
