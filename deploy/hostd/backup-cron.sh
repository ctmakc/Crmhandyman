#!/bin/sh
# HandymanPro CRM — nightly backup driver for the host cron on hostd.Canada.
#
# The real work is scripts/backup.sh INSIDE the container: SQLite's online .backup,
# integrity_check on the snapshot, rotation to BACKUP_KEEP (14) inside the volume.
# This wrapper adds the one thing the container cannot: a copy of the newest snapshot
# OUTSIDE the volume. A volume that is deleted, corrupted or migrated away takes its
# own backups with it — the host-side directory is what survives that.
#
# Cron (root), see README.md:
#   15 3 * * * /opt/handyman-crm/deploy/hostd/backup-cron.sh >> /var/log/handyman-backup.log 2>&1
#
# Exit is non-zero on any failure so cron mails the operator instead of staying quiet.
set -eu

CONTAINER=handyman-crm
HOST_DIR=/var/backups/handyman-crm
KEEP=14

# cron runs with a bare environment, so the off-box remote (and anything else the deploy
# put in .env) is not here unless we read it. Same file the compose stack uses.
ENV_FILE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: start"

# The snapshot itself. -T? Plain `docker exec` (no tty allocation) is cron-safe.
docker exec "$CONTAINER" /app/scripts/backup.sh

# Pull the newest snapshot out of the volume onto the host disk.
mkdir -p "$HOST_DIR"
LATEST=$(docker exec "$CONTAINER" sh -c 'ls -1t /app/var/backups/crm-*.db.gz | head -n 1')
[ -n "$LATEST" ] || { echo "backup-cron: FAILED — no snapshot found after backup.sh"; exit 1; }
docker cp "$CONTAINER:$LATEST" "$HOST_DIR/"
chmod 600 "$HOST_DIR/$(basename "$LATEST")"
echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: copied $(basename "$LATEST") to $HOST_DIR"

# Same 14-day window on the host side; timestamped names sort correctly by mtime.
COUNT=$(ls -1 "$HOST_DIR"/crm-*.db.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$HOST_DIR"/crm-*.db.gz | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old" && echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: rotated out $(basename "$old")"
  done
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: done, $(ls -1 "$HOST_DIR"/crm-*.db.gz | wc -l | tr -d ' ') host-side snapshots (keep $KEEP)"

# Off-box copy. A snapshot that lives only on this disk dies with this disk — the host
# directory survives a deleted volume, not a lost box. When an rclone remote is set in
# the env (OFFSITE_RCLONE_REMOTE, e.g. "mega:backups/handyman-crm"), push the newest
# snapshot there and confirm it landed. Absent remote → skip quietly; this is opt-in so
# a box without rclone still backs up locally.
if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  NEWEST="$HOST_DIR/$(basename "$LATEST")"
  if rclone copy "$NEWEST" "$OFFSITE_RCLONE_REMOTE/" >/dev/null 2>&1 &&
     rclone lsf "$OFFSITE_RCLONE_REMOTE/" 2>/dev/null | grep -qF "$(basename "$NEWEST")"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: off-box copy verified at $OFFSITE_RCLONE_REMOTE"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') backup-cron: WARNING off-box copy to $OFFSITE_RCLONE_REMOTE failed"
  fi
fi
