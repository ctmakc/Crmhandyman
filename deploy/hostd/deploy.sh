#!/usr/bin/env bash
# HandyCRM production deploy from an operator workstation.
#
# Defaults preserve the last documented host, but every machine-specific fact can be
# overridden without editing the repository. This matters because the old host may be
# retired while the product/domain live on.
#
# Examples:
#   deploy/hostd/deploy.sh
#   HANDYCRM_DEPLOY_BOX=root@203.0.113.10 HANDYCRM_DEPLOY_SSH_PORT=22 deploy/hostd/deploy.sh
#
set -euo pipefail

BOX="${HANDYCRM_DEPLOY_BOX:-root@66.94.107.112}"
SSH_PORT="${HANDYCRM_DEPLOY_SSH_PORT:-222}"
DEST="${HANDYCRM_DEPLOY_DEST:-/opt/handyman-crm}"
COMPOSE="deploy/hostd/docker-compose.prod.yml"
APP_PORT="${HANDYCRM_DEPLOY_APP_PORT:-3080}"
PUBLIC_URL="${HANDYCRM_PUBLIC_URL:-https://crm.itopsi.com}"

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SSH=(ssh -p "$SSH_PORT" "$BOX")

say() { printf '\n== %s\n' "$*"; }

say "preflight: $BOX:$SSH_PORT"
if ! "${SSH[@]}" "true"; then
  cat >&2 <<EOF

deploy: cannot reach $BOX on SSH port $SSH_PORT.
Nothing was copied and no container was changed.

If production moved, run again with the real target, for example:
  HANDYCRM_DEPLOY_BOX=root@<new-ip> HANDYCRM_DEPLOY_SSH_PORT=<port> $0
EOF
  exit 1
fi

say "rsync $REPO -> $BOX:$DEST"
rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude ".next" \
  --exclude "var" \
  --exclude ".env" \
  --exclude "cloudflared" \
  --exclude "reset-demo.sh" \
  --exclude "present-fill.cjs" \
  --exclude "dev.db*" \
  --exclude "cookies.txt" \
  --exclude "*.tsbuildinfo" \
  -e "ssh -p $SSH_PORT" \
  "$REPO/" "$BOX:$DEST/"

say "checking $DEST/deploy/hostd/.env on the box"
"${SSH[@]}" "test -f $DEST/deploy/hostd/.env" || {
  cat >&2 <<EOF

deploy: no production .env on the box yet. One-time setup:

  ssh -p $SSH_PORT $BOX
  cp $DEST/deploy/hostd/.env.production.example $DEST/deploy/hostd/.env
  chmod 600 $DEST/deploy/hostd/.env
  # fill NEXTAUTH_SECRET and the integration secrets actually used on this install

then run this script again.
EOF
  exit 1
}

say "building image"
"${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE build"

say "starting containers"
"${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE up -d"

say "waiting for local /api/health on the production box"
if "${SSH[@]}" "
  for i in \$(seq 1 30); do
    body=\$(curl -fsS -m 5 http://127.0.0.1:$APP_PORT/api/health 2>/dev/null) && {
      echo \"health: \$body\"; exit 0; }
    sleep 4
  done
  exit 1
"; then
  say "container healthy on $BOX"
else
  say "FAILED: local /api/health never answered — container logs follow"
  "${SSH[@]}" "cd $DEST && docker compose -f $COMPOSE ps && docker compose -f $COMPOSE logs --tail=100 crm" || true
  exit 1
fi

say "checking public route $PUBLIC_URL/api/health"
if curl -fsS -m 12 "$PUBLIC_URL/api/health"; then
  printf '\n'
  say "deployed: $PUBLIC_URL is healthy through the public route"
else
  cat >&2 <<EOF

WARNING: the container is healthy locally, but $PUBLIC_URL/api/health is not reachable
from this workstation. The deploy itself succeeded; DNS/Cloudflare Tunnel still needs
attention before a customer can use the CRM.
EOF
fi
