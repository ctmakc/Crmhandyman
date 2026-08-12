#!/bin/sh
# HandymanPro CRM — restore the SQLite database from a snapshot.
#
# Two rules this script enforces, both learned the expensive way:
#   * the current database is snapshotted first, so a restore of the wrong file is
#     still reversible;
#   * the -wal and -shm sidecars of the replaced database are removed. A stale WAL next
#     to a freshly restored file is read as its tail and silently corrupts it.
#
# Usage:  scripts/restore.sh <snapshot.db.gz | snapshot.db | --latest> [--yes]
#         Without --yes the word RESTORE must be typed to proceed.
# Env:    DB_PATH, BACKUP_DIR — same meaning as in backup.sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${BACKUP_DIR:-"$ROOT/var/backups"}
LOG=$BACKUP_DIR/backup.log

log() {
  line="$(date '+%Y-%m-%d %H:%M:%S') restore: $*"
  echo "$line"
  [ -d "$BACKUP_DIR" ] && echo "$line" >>"$LOG"
  return 0
}

die() {
  log "FAILED — $*"
  exit 1
}

SOURCE=""
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    --latest) SOURCE="--latest" ;;
    -*) echo "restore: unknown option $arg" >&2; exit 1 ;;
    *) SOURCE=$arg ;;
  esac
done
[ -n "$SOURCE" ] || { echo "usage: $0 <snapshot.db.gz|snapshot.db|--latest> [--yes]" >&2; exit 1; }

# --- where the database lives (same resolution order as backup.sh) ------------------
if [ -z "${DB_PATH:-}" ]; then
  if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
    DATABASE_URL=$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$ROOT/.env" \
      | tr -d '\r' | tail -n 1 | sed -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  fi
  case "${DATABASE_URL:-}" in
    file:*) DB_PATH=${DATABASE_URL#file:} ;;
    "")     DB_PATH=$ROOT/dev.db ;;
    *)      echo "restore: DATABASE_URL is not a file: URL, set DB_PATH explicitly" >&2; exit 1 ;;
  esac
  case "$DB_PATH" in /*) ;; *) DB_PATH=$ROOT/${DB_PATH#./} ;; esac
fi

if [ "$SOURCE" = "--latest" ]; then
  SOURCE=$(ls -1t "$BACKUP_DIR"/crm-*.db.gz 2>/dev/null | head -n 1 || true)
  [ -n "$SOURCE" ] || die "no snapshots in $BACKUP_DIR"
fi
[ -f "$SOURCE" ] || die "snapshot not found: $SOURCE"

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
# text is what the operator sees at three in the morning.
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

mkdir -p "$BACKUP_DIR"
# The pid keeps two restores inside the same second from overwriting each other's safety
# copy — the first run's copy quietly disappeared before this suffix existed.
STAMP=$(date '+%Y%m%d-%H%M%S')-$$
STAGED=$BACKUP_DIR/.restore-$STAMP.db
cleanup() { rm -f "$STAGED"; }
trap cleanup EXIT INT TERM

# --- unpack and verify the candidate BEFORE anything is touched ---------------------
case "$SOURCE" in
  *.gz) gzip -dc "$SOURCE" >"$STAGED" || die "cannot unpack $SOURCE" ;;
  *)    cp "$SOURCE" "$STAGED" || die "cannot read $SOURCE" ;;
esac
[ -s "$STAGED" ] || die "snapshot is empty: $SOURCE"

CHECK=$(integrity "$STAGED" 2>&1) || die "integrity_check could not run: $CHECK"
[ "$CHECK" = "ok" ] || die "snapshot is damaged, integrity_check says: $CHECK"
log "candidate $SOURCE verified, integrity ok"

# --- confirmation -------------------------------------------------------------------
if [ "$ASSUME_YES" -ne 1 ]; then
  echo
  echo "  Restore  $SOURCE"
  echo "  over     $DB_PATH"
  echo "  Stop the application first: an open connection keeps writing to the file"
  echo "  that is about to be replaced."
  echo
  printf "  Type RESTORE to proceed: "
  read -r ANSWER || ANSWER=""
  [ "$ANSWER" = "RESTORE" ] || { echo "restore: cancelled"; exit 1; }
fi

# --- safety copy of what is there now -----------------------------------------------
if [ -f "$DB_PATH" ]; then
  SAFETY=$BACKUP_DIR/pre-restore-$STAMP.db
  snapshot "$DB_PATH" "$SAFETY" || die "cannot snapshot the current database, nothing changed"
  gzip -9 "$SAFETY" || die "cannot compress the safety copy, nothing changed"
  [ -f "$SAFETY.gz" ] || die "safety copy did not appear, nothing changed"
  chmod 600 "$SAFETY.gz"
  log "current database saved to $SAFETY.gz"

  mv "$DB_PATH" "$DB_PATH.replaced-$STAMP" || die "cannot move the current database aside"
fi

# The sidecars belong to the file that was just moved away.
rm -f "$DB_PATH-wal" "$DB_PATH-shm"

mv "$STAGED" "$DB_PATH" || die "cannot put the snapshot in place"
chmod 600 "$DB_PATH"
trap - EXIT INT TERM

CHECK=$(integrity "$DB_PATH" 2>&1) || die "restored file cannot be opened: $CHECK"
[ "$CHECK" = "ok" ] || die "restored file is damaged: $CHECK"

log "restored $SOURCE -> $DB_PATH, integrity ok"
log "previous database kept at $DB_PATH.replaced-$STAMP — delete it once the app is verified"
