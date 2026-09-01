#!/usr/bin/env bash
# Beaver Movers first-client production rollout.
#
# This script is intentionally opinionated and fail-closed. It performs, in order:
#   1. local repository sanity + origin/main parity checks
#   2. read-only production status
#   3. verified pre-deploy SQLite backup on the host
#   4. normal HandyCRM deploy (which runs Prisma migrations before Next.js starts)
#   5. local + public health verification against the migration count shipped by this repo
#   6. guarded/idempotent Beaver tenant provisioning
#
# Legacy host authentication is password-based, so this defaults to password mode and
# prompts once. The shared ssh-auth helper keeps the password out of argv/files/logs.
# Override HANDYCRM_DEPLOY_AUTH=key if the host later moves to key auth.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
# shellcheck source=deploy/hostd/ssh-auth.sh
source "$SCRIPT_DIR/ssh-auth.sh"

export HANDYCRM_DEPLOY_AUTH="${HANDYCRM_DEPLOY_AUTH:-password}"
BOX="${HANDYCRM_DEPLOY_BOX:-root@66.94.107.112}"
SSH_PORT="${HANDYCRM_DEPLOY_SSH_PORT:-222}"
DEST="${HANDYCRM_DEPLOY_DEST:-/opt/handyman-crm}"
COMPOSE="deploy/hostd/docker-compose.prod.yml"
APP_PORT="${HANDYCRM_DEPLOY_APP_PORT:-3080}"
PUBLIC_URL="${HANDYCRM_PUBLIC_URL:-https://crm.itopsi.com}"
BEAVER_URL="${HANDYCRM_BEAVER_URL:-https://beaver-movers.itopsi.com}"

fail() {
  printf '\nROLL-OUT STOPPED: %s\n' "$*" >&2
  exit 1
}

say() {
  printf '\n===== %s =====\n' "$*"
}

# The deploy script rsyncs the working tree, not a Git archive. A dirty/untracked file can
# therefore change production even when HEAD is known-good, so refuse anything but clean main.
if git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH=$(git -C "$REPO" branch --show-current)
  [ "$BRANCH" = "main" ] || fail "checkout main first (current branch: ${BRANCH:-detached})"
  [ -z "$(git -C "$REPO" status --porcelain)" ] || fail "working tree is not clean; commit/stash local changes first"

  # A clean local main can still be stale. Refresh the remote-tracking ref but do not mutate
  # the operator's branch automatically: if HEAD differs from origin/main, stop and require a
  # deliberate `git pull --ff-only` before production is touched.
  git -C "$REPO" remote get-url origin >/dev/null 2>&1 || fail "Git remote 'origin' is missing"
  git -C "$REPO" fetch --quiet origin main || fail "could not refresh origin/main; no production change was attempted"

  LOCAL_SHA=$(git -C "$REPO" rev-parse HEAD)
  REMOTE_SHA=$(git -C "$REPO" rev-parse refs/remotes/origin/main)
  [ "$LOCAL_SHA" = "$REMOTE_SHA" ] || \
    fail "local main is not current origin/main; run 'git pull --ff-only' and retry"
else
  fail "$REPO is not a Git checkout"
fi

EXPECTED_MIGRATIONS=$(find "$REPO/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
[ "$EXPECTED_MIGRATIONS" -gt 0 ] || fail "could not determine shipped migration count"

say "rollout target"
printf 'Commit:       %s\n' "$LOCAL_SHA"
printf 'SSH:          %s:%s\n' "$BOX" "$SSH_PORT"
printf 'Platform:     %s\n' "$PUBLIC_URL"
printf 'Beaver:       %s\n' "$BEAVER_URL"
printf 'Migrations:   %s expected after deploy\n' "$EXPECTED_MIGRATIONS"

# Prompt once here. Child status/deploy scripts inherit SSHPASS and reuse it.
handycrm_init_ssh "$BOX" "$SSH_PORT"
"${SSH[@]}" "true" >/dev/null || fail "SSH authentication failed before any production change"

say "read-only preflight status"
bash "$SCRIPT_DIR/status.sh"

say "verified backup before deploy"
# Use the already-deployed backup driver BEFORE rsync replaces any host-side scripts.
# It performs SQLite online .backup + integrity check, copies the snapshot outside the
# Docker volume, rotates old snapshots and optionally verifies the configured off-box copy.
"${SSH[@]}" "
  set -eu
  test -d '$DEST'
  test -f '$DEST/deploy/hostd/.env'
  test -f '$DEST/deploy/hostd/backup-cron.sh'
  sh '$DEST/deploy/hostd/backup-cron.sh'
  latest=\$(ls -1t /var/backups/handyman-crm/crm-*.db.gz 2>/dev/null | head -n 1)
  test -n \"\$latest\"
  test -s \"\$latest\"
  echo \"pre-deploy backup verified: \$latest\"
" || fail "backup did not complete; production was not deployed"

say "deploy current main"
bash "$SCRIPT_DIR/deploy.sh"

say "verify migration parity and public route"
LOCAL_HEALTH=$("${SSH[@]}" "curl -fsS -m 10 http://127.0.0.1:$APP_PORT/api/health") || fail "local container health failed after deploy"
PUBLIC_HEALTH=$("${SSH[@]}" "curl -fsS -m 12 '$PUBLIC_URL/api/health'") || fail "public platform health failed after deploy"
BEAVER_HEALTH=$("${SSH[@]}" "curl -fsS -m 12 '$BEAVER_URL/api/health'") || fail "Beaver wildcard host health failed after deploy"

printf 'Local:   %s\n' "$LOCAL_HEALTH"
printf 'Public:  %s\n' "$PUBLIC_HEALTH"
printf 'Beaver:  %s\n' "$BEAVER_HEALTH"

for payload in "$LOCAL_HEALTH" "$PUBLIC_HEALTH" "$BEAVER_HEALTH"; do
  printf '%s' "$payload" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' || fail "health payload is not ok"
  printf '%s' "$payload" | grep -Eq '"migrations"[[:space:]]*:[[:space:]]*'"$EXPECTED_MIGRATIONS" || \
    fail "deployed migration count does not match the current repository ($EXPECTED_MIGRATIONS)"
done

say "guard Beaver tenant identity"
# Do not blindly run --add-workers against a slug collision. Read exactly the four fields
# required to prove that an existing beaver-movers workspace is the same client.
TENANT_ROW=$("${SSH[@]}" "
  docker exec handyman-crm sqlite3 -separator '|' /app/var/crm.db \
    \"SELECT businessName, ownerEmail, plan, status FROM Tenant WHERE slug='beaver-movers' LIMIT 1;\"
") || fail "could not inspect the live Beaver tenant"

if [ -n "$TENANT_ROW" ]; then
  printf 'Existing tenant: %s\n' "$TENANT_ROW"
  case "$TENANT_ROW" in
    'Beaver Movers|darryl@beavermovers.com|PAID|ACTIVE')
      echo "Identity matches the canonical Beaver workspace; missing crew may be added idempotently."
      ;;
    *)
      fail "slug beaver-movers already exists but does not match canonical Beaver identity; no provisioning mutation was attempted"
      ;;
  esac
else
  echo "No beaver-movers tenant exists yet; the provisioner will create it."
fi

say "provision / reconcile Beaver Movers"
# --add-workers is safe on both paths: absent workspace -> create the complete workspace;
# existing canonical workspace -> add only missing workers, never rotate existing passwords.
# Fresh credentials printed here exist only in this operator terminal; do not paste them
# into GitHub, shared chat or repository files.
"${SSH[@]}" "
  cd '$DEST'
  docker compose -f '$COMPOSE' exec -T crm \
    node scripts/provision-tenant.js \
      --business 'Beaver Movers' \
      --slug beaver-movers \
      --owner darryl@beavermovers.com \
      --owner-name 'Darryl' \
      --plan paid \
      --worker 'Mike <mike@beavermovers.com>' \
      --worker 'Nicolas <nicolas@beavermovers.com>' \
      --domain itopsi.com \
      --add-workers
" || fail "Beaver tenant provisioning/reconciliation failed"

say "verify canonical Beaver accounts"
ACCOUNT_ROWS=$("${SSH[@]}" "
  docker exec handyman-crm sqlite3 -separator '|' /app/var/crm.db \"
    SELECT lower(u.email), u.role, u.approved
    FROM User u
    JOIN Tenant t ON t.id = u.tenantId
    WHERE t.slug = 'beaver-movers'
      AND lower(u.email) IN ('darryl@beavermovers.com','mike@beavermovers.com','nicolas@beavermovers.com')
    ORDER BY lower(u.email);
  \"
") || fail "could not verify Beaver accounts"

EXPECTED_ACCOUNTS=$(printf '%s\n' \
  'darryl@beavermovers.com|ADMIN|1' \
  'mike@beavermovers.com|WORKER|1' \
  'nicolas@beavermovers.com|WORKER|1')

printf '%s\n' "$ACCOUNT_ROWS"
[ "$ACCOUNT_ROWS" = "$EXPECTED_ACCOUNTS" ] || \
  fail "canonical Beaver accounts/roles/approval do not match the launch contract"

say "repository/infrastructure rollout complete"
printf '%s\n' \
  "Production is on the current migration set and the canonical Beaver workspace exists." \
  "Next: log in to $BEAVER_URL and complete Settings -> Go-live readiness." \
  "Do not enable paid traffic until /settings/go-live reports READY."
