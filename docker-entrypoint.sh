#!/bin/sh
# Container start: check the environment, apply migrations, hand over to the server.
set -eu

# Fail closed. A container that starts without these silently creates an empty database
# next to the volume, or signs sessions with a default secret.
: "${DATABASE_URL:?DATABASE_URL is required, expected file:/app/var/crm.db}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"
: "${NEXTAUTH_URL:?NEXTAUTH_URL is required, must match the public address}"

case "$DATABASE_URL" in
  file:/app/var/*) ;;
  file:*) echo "entrypoint: DATABASE_URL points outside /app/var — the database would" \
               "live inside the container and vanish with it" >&2; exit 1 ;;
  *) echo "entrypoint: DATABASE_URL must be a file: URL (SQLite)" >&2; exit 1 ;;
esac

mkdir -p /app/var/uploads /app/var/backups

# Migrations before the first request, and a failure here stops the container: serving
# a half-migrated schema to a paying contractor is worse than not coming up at all.
# The CLI is invoked by path — npx would try the network when the local copy moves.
echo "entrypoint: applying migrations"
node ./node_modules/prisma/build/index.js migrate deploy

echo "entrypoint: starting Next.js (standalone) on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
