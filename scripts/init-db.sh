#!/usr/bin/env sh
set -e

DB_PATH="/data/nomnom.db"
FIRST=0
if [ ! -f "$DB_PATH" ]; then
  FIRST=1
fi

mkdir -p /data
touch "$DB_PATH"

# Ensure prisma client exists
echo "[init] generating prisma client"
npx prisma generate

echo "[init] running migrations"
npx prisma migrate deploy

if [ "$FIRST" -eq 1 ]; then
  echo "[init] database created — running seed (if present)"
  if [ -f /app/backend/prisma/seed.js ]; then
    node /app/backend/prisma/seed.js || true
  fi
fi

echo "[init] init complete — starting app"
exec "$@"
