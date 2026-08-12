#!/bin/sh
# HandymanPro CRM — snapshot of the SQLite database.
#
# `cp dev.db backup.db` on a live database gives a torn copy: in WAL mode the newest
# pages sit in the -wal sidecar and the file alone is an older, sometimes inconsistent
# state. SQLite's own online backup takes a read transaction and writes a whole,
# self-contained database instead. Every snapshot is verified before it is kept, because
# an unverified backup is only a belief that a backup exists.
#
# Usage:  scripts/backup.sh
# Env:    DB_PATH      path to the database        (default: from DATABASE_URL, then ./dev.db)
#         BACKUP_DIR   where snapshots are written (default: <repo>/var/backups)
#         BACKUP_KEEP  how many snapshots to keep  (default: 14)
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${BACKUP_DIR:-"$ROOT/var/backups"}
BACKUP_KEEP=${BACKUP_KEEP:-14}
LOG=$BACKUP_DIR/backup.log

log() {
  line="$(date '+%Y-%m-%d %H:%M:%S') backup: $*"
  echo "$line"
  [ -d "$BACKUP_DIR" ] && echo "$line" >>"$LOG"
  return 0
}

die() {
  log "FAILED — $*"
  exit 1
}

# --- where the database lives -------------------------------------------------------
# The container passes DATABASE_URL; on a workstation it is only written in .env, which
# is not exported into the shell, so read it from there as a last resort.
if [ -z "${DB_PATH:-}" ]; then
  if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
    DATABASE_URL=$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$ROOT/.env" \
      | tr -d '\r' | tail -n 1 | sed -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  fi
  case "${DATABASE_URL:-}" in
    file:*) DB_PATH=${DATABASE_URL#file:} ;;
    "")     DB_PATH=$ROOT/dev.db ;;
    *)      echo "backup: DATABASE_URL is not a file: URL, set DB_PATH explicitly" >&2; exit 1 ;;
  esac
  # Relative URLs in .env are relative to the project root.
  case "$DB_PATH" in /*) ;; *) DB_PATH=$ROOT/${DB_PATH#./} ;; esac
fi

[ -f "$DB_PATH" ] || { echo "backup: database not found: $DB_PATH" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" || { echo "backup: cannot create $BACKUP_DIR" >&2; exit 1; }

# --- sqlite helpers -----------------------------------------------------------------
# The sqlite3 CLI is not installed everywhere; better-sqlite3 is already a dependency of
# this app and exposes the same online-backup API, so one of the two always works.
have_cli() { command -v sqlite3 >/dev/null 2>&1; }

snapshot() { # <source db> <destination file>
  if have_cli; then
    sqlite3 "$1" ".backup '$2'"
  else
    NODE_PATH="$ROOT/node_modules" node -e '
      function fail(e) { console.error("sqlite: " + String((e && e.message) || e)); process.exit(1); }
      try {
        const Database = require("better-sqlite3");
        const [src, dest] = process.argv.slice(1);
        const db = new Database(src, { fileMustExist: true });
        db.backup(dest).then(() => { db.close(); }).catch(fail);
      } catch (e) { fail(e); }
    ' "$1" "$2"
  fi
}

# A damaged file must come back as one readable line, not as a node stack trace — this
# text is what lands in the log and in the cron mail.
integrity() { # <db file> -> prints the pragma result
  if have_cli; then
    sqlite3 "$1" "PRAGMA integrity_check;"
  else
    NODE_PATH="$ROOT/node_modules" node -e '
      try {
        const Database = require("better-sqlite3");
        const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
        console.log(db.pragma("integrity_check")[0].integrity_check);
        db.close();
      } catch (e) {
        console.error("sqlite: " + String((e && e.message) || e));
        process.exit(1);
      }
    ' "$1"
  fi
}

# --- take it ------------------------------------------------------------------------
STAMP=$(date '+%Y%m%d-%H%M%S')
TMP=$BACKUP_DIR/.tmp-$STAMP-$$.db
FINAL=$BACKUP_DIR/crm-$STAMP.db.gz

cleanup() { rm -f "$TMP" "$TMP.gz"; }
trap cleanup EXIT INT TERM

log "source $DB_PATH ($(wc -c <"$DB_PATH" | tr -d ' ') bytes), engine $(have_cli && echo sqlite3 || echo better-sqlite3)"

snapshot "$DB_PATH" "$TMP" || die "snapshot failed"
[ -s "$TMP" ] || die "snapshot is empty"

CHECK=$(integrity "$TMP" 2>&1) || die "integrity_check could not run: $CHECK"
[ "$CHECK" = "ok" ] || die "integrity_check says: $CHECK"

gzip -9 "$TMP" || die "gzip failed"
# Two runs inside the same second must not overwrite each other.
N=1
while [ -e "$FINAL" ]; do
  N=$((N + 1))
  FINAL=$BACKUP_DIR/crm-$STAMP-$N.db.gz
done
mv "$TMP.gz" "$FINAL" || die "cannot move snapshot into place"
chmod 600 "$FINAL"
trap - EXIT INT TERM

log "kept $FINAL ($(wc -c <"$FINAL" | tr -d ' ') bytes), integrity ok"

# --- rotation -----------------------------------------------------------------------
# Names are timestamped and contain no spaces, so listing them by time is safe here.
COUNT=$(ls -1 "$BACKUP_DIR"/crm-*.db.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  ls -1t "$BACKUP_DIR"/crm-*.db.gz | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
    rm -f "$old" && log "rotated out $(basename "$old")"
  done
fi

log "done, $(ls -1 "$BACKUP_DIR"/crm-*.db.gz 2>/dev/null | wc -l | tr -d ' ') snapshots on disk (keep $BACKUP_KEEP)"
