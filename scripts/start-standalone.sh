#!/bin/sh
# Run the production build the way the container runs it.
#
# next.config.mjs asks for output: "standalone", and `next start` cannot serve that —
# it prints a warning and ignores the bundle. The standalone tree also ships without
# the static chunks and public/, which the Dockerfile copies in as separate layers;
# outside the container nobody does, and the app comes up with no CSS at all. This
# script does that copy, so `npm start` on any box serves the same thing the VPS does.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/.next/standalone/server.js"

if [ ! -f "$SERVER" ]; then
  echo "No standalone build at $SERVER — run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "$ROOT/.next/standalone/.next"
# Replace, never merge: a stale chunk left from an earlier build is served happily and
# then fails to hydrate against the new one.
rm -rf "$ROOT/.next/standalone/.next/static" "$ROOT/.next/standalone/public"
cp -r "$ROOT/.next/static" "$ROOT/.next/standalone/.next/static"
if [ -d "$ROOT/public" ]; then
  cp -r "$ROOT/public" "$ROOT/.next/standalone/public"
fi

exec node "$SERVER"
