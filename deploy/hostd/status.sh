#!/usr/bin/env bash
# Read-only HandyCRM production diagnostic. Makes no server changes.
set -u

BOX="${HANDYCRM_DEPLOY_BOX:-root@66.94.107.112}"
SSH_PORT="${HANDYCRM_DEPLOY_SSH_PORT:-222}"
DEST="${HANDYCRM_DEPLOY_DEST:-/opt/handyman-crm}"
COMPOSE="deploy/hostd/docker-compose.prod.yml"
APP_PORT="${HANDYCRM_DEPLOY_APP_PORT:-3080}"
PUBLIC_URL="${HANDYCRM_PUBLIC_URL:-https://crm.itopsi.com}"
SSH=(ssh -o ConnectTimeout=8 -p "$SSH_PORT" "$BOX")

printf 'HandyCRM production status\n'
printf '  SSH target:  %s:%s\n' "$BOX" "$SSH_PORT"
printf '  Public URL:  %s\n\n' "$PUBLIC_URL"

if ! "${SSH[@]}" "true" >/dev/null 2>&1; then
  printf 'SSH        FAIL  cannot reach %s:%s\n' "$BOX" "$SSH_PORT"
  printf 'Result     STOP  host is wrong/offline/firewalled, or SSH credentials are unavailable\n'
  exit 2
fi
printf 'SSH        OK\n'

"${SSH[@]}" "
  printf 'Host       '; hostname
  printf 'CRM dir    '; test -d '$DEST' && echo OK || echo MISSING
  printf 'Env file   '; test -f '$DEST/deploy/hostd/.env' && echo PRESENT || echo MISSING
  printf 'Local API  '
  curl -fsS -m 5 http://127.0.0.1:$APP_PORT/api/health 2>/dev/null || echo FAIL
  echo
  echo 'Containers'
  cd '$DEST' 2>/dev/null && docker compose -f '$COMPOSE' ps || true
  echo
  echo 'Tunnel tail'
  docker logs --tail=12 handyman-cloudflared 2>&1 || true
"

printf '\nPublic API '
if curl -fsS -m 12 "$PUBLIC_URL/api/health"; then
  printf '\nPublic     OK\n'
else
  printf 'FAIL\n'
  printf 'Result     local service may be healthy, but DNS/Cloudflare routing is not publicly usable\n'
  exit 3
fi
