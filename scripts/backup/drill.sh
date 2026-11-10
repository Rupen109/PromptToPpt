#!/bin/bash
# A restore drill, safe to run any time: decrypts an export, loads it into a throw-away database on THIS computer and compares the row counts with the manifest.
# If this passes, the export can bring the system back. Run it once after the first export, then now and then (monthly).
#
#   scripts/backup/drill.sh [export stamp]            # needs gpg + your private key, and postgres client tools (brew install libpq)
#   DRILL_PG="postgresql://user:pw@localhost:5432/postgres" scripts/backup/drill.sh
set -euo pipefail
CONF="${SLIDESDONE_BACKUP_CONFIG:-$HOME/.slidesdone-backup/config}"
# shellcheck disable=SC1090
source "$CONF"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_restore || echo /opt/homebrew/opt/libpq/bin/pg_restore)")}"
ADMIN="${DRILL_PG:-postgresql://postgres:postgres@localhost:5432/postgres}"
STAMP="${1:-$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort | tail -n 1 | xargs -n1 basename)}"
DIR="$BACKUP_DIR/$STAMP"; [ -f "$DIR/manifest.json" ] || { echo "no export $STAMP in $BACKUP_DIR" >&2; exit 1; }
FILE="$(sed -n 's/.*"file": "\(.*\)".*/\1/p' "$DIR/manifest.json")"
DB="slidesdone_drill_$$"; WORK="$(mktemp -d)"
cleanup() { "$PGBIN/psql" "$ADMIN" -qc "drop database if exists $DB" >/dev/null 2>&1 || true; rm -rf "$WORK"; }; trap cleanup EXIT
echo "== checksum"; (cd "$DIR" && shasum -a 256 -c SHA256SUMS)
echo "== decrypting (your passphrase)"; gpg --quiet --decrypt --output "$WORK/db.dump" "$DIR/$FILE"
echo "== restoring into a scratch database ($DB)"
"$PGBIN/psql" "$ADMIN" -qc "create database $DB"
BASE="${ADMIN%/*}/$DB"
"$PGBIN/pg_restore" --no-owner --no-privileges --exit-on-error -d "$BASE" "$WORK/db.dump"
echo "== comparing row counts with the manifest"
bad=0
for t in $(sed -n '/"rows": {/,/^  }/p' "$DIR/manifest.json" | sed -n 's/^ *"\([^"]*\)": [0-9]*,\{0,1\}$/\1/p'); do
  want="$(sed -n '/"rows": {/,/^  }/p' "$DIR/manifest.json" | sed -n "s/^ *\"$t\": \([0-9]*\),\{0,1\}\$/\1/p")"
  got="$("$PGBIN/psql" "$BASE" -tAc "select count(*) from public.\"$t\"")"
  # rows written between the count and the dump can differ by a few on a busy table: only a table that LOST rows fails
  [ "$got" -ge "$want" ] || { echo "  MISSING ROWS in $t: manifest $want, restored $got"; bad=1; }
done
[ "$bad" = 0 ] && echo "DRILL PASSED: export $STAMP restores and every table is complete" || { echo "DRILL FAILED"; exit 1; }
