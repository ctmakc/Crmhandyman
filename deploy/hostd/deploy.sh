#!/usr/bin/env bash
# HandymanPro CRM — deploy from the workstation to hostd.Canada.
#
# Idempotent: every step converges on the same state, so running it twice in a row is
# safe and running it after a half-failed attempt is the recovery procedure.
#
#   1. rsync the working tree to /opt/handyman-crm on the box (code only — the database,
#      uploads and backups live on the crm-var volume and are never in the sync path);
#   2. build the image and start/refresh both containers there;
#   3. prove the result: /api/health through the box's loopback answers 200 only when
#      the database replies AND every shipped migration is applied.
#
# Migrations need no separate step: docker-entrypoint.sh runs `prisma migrate deploy`
# on every container start, before the server binds — a failed migration keeps the old
# container's last state instead of serving a half-migrated schema.
#
# Usage:  deploy/hostd/deploy.sh            # from anywhere; paths are self-anchored
# First deploy only: put a filled .env at /opt/handyman-crm/deploy/hostd/.env on the
# box (start from .env.production.example). The script stops with instructions if it
# is missing — it never invents secrets.
set -euo pipefail

BOX="root@66.94.107.112"
SSH_PORT=222
DEST="/opt/handyman-crm"
COMPOSE="deploy/hostd/docker-compose.prod.yml"
APP_PORT=3080

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SSH=(ssh -p "$SSH_PORT" "$BOX")

say() { printf '\n== %s\n' "$*"; }

say "rsync $REPO -> $BOX:$DEST"
# --delete keeps the box an exact mirror of the workstation tree, which is what makes
# rollbacks honest: checkout the previous commit locally, deploy again. The excludes
# are everything that must NOT travel: build output and node_modules (rebuilt in the
# image), live data (var/, dev.db* — production data lives on the volume anyway, this
# guards the workstation's own copies), and every .env — the box's secrets stay on the
# box, excluded entries are also protected from --delete.
rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude ".next" \
  --exclude "var" \
  --exclude ".env" \
  --exclude "dev.db*" \
  --exclude "cookies.txt" \
  --exclude "*.tsbuildinfo" \
  -e "ssh -p $SSH_PORT" \
  "$REPO/" "$BOX:$DEST/"

say "checking $DEST/deploy/hostd/.env on the box"
"${SSH[@]}" "test -f $DEST/deploy/hostd/.env" || {
  cat >&2 <<EOF

deploy: no .env on the box yet. One-time setup:

  ssh -p $SSH_PORT $BOX
  cp $DEST/deploy/hostd/.env.production.example $DEST/deploy/hostd/.env
  chmod 600 $DEST/deploy/hostd/.env
  # fill in NEXTAUTH_SECRET, MAILGUN_WEBHOOK_SIGNING_KEY

then run this script again.
EOF
  exit 1
}

say "building the image (10-20 min on first run: better-sqlite3 compiles from source)"
"${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE build"

say "starting containers (entrypoint applies migrations before serving)"
"${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE up -d"

say "waiting for /api/health on the box's loopback"
# The container's own start_period is 40s; migrations on a big database can use all of
# it. Poll rather than sleep-and-pray, fail loudly with the logs if it never comes up.
if "${SSH[@]}" "
  for i in \$(seq 1 30); do
    body=\$(curl -fsS -m 5 http://127.0.0.1:$APP_PORT/api/health 2>/dev/null) && {
      echo \"health: \$body\"; exit 0; }
    sleep 4
  done
  exit 1
"; then
  say "deployed: https://crm.agintent.com is serving (via the tunnel)"
else
  say "FAILED: /api/health never answered — container logs follow"
  "${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE ps && docker compose -f $COMPOSE logs --tail=80 crm" || true
  exit 1
fi
