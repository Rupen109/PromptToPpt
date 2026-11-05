#!/bin/bash
# Restores the database from the backups bucket (WAL-G): the latest base backup, then WAL replayed up to a moment you choose.
#
#   sudo /opt/slidesdone/restore-db.sh                         # everything that was archived (latest possible point)
#   sudo /opt/slidesdone/restore-db.sh "2026-12-01 14:30:00+00" # stop at this moment (UTC), e.g. just before a bad change
#
# What it does: stops the app, moves the current data folder aside (nothing is deleted), fetches the base backup, replays WAL, then starts the app.
# Practise it once before launch, and after any change to the backup setup.
set -euo pipefail
cd /opt/slidesdone
TARGET="${1:-}"
COMPOSE="docker compose --env-file .env --env-file images.env"
DATA=/data/postgres
STAMP="$(date -u +%Y%m%d-%H%M%S)"

echo "== stopping the app and the database"
$COMPOSE stop caddy web api worker postgres
[ -d "$DATA" ] && mv "$DATA" "/data/postgres.before-restore-$STAMP"
install -d -o 999 -g 999 -m 700 "$DATA" # uid 999 = postgres in the official image

echo "== fetching the latest base backup"
$COMPOSE run --rm --no-deps -u postgres --entrypoint wal-g postgres backup-fetch "$DATA" LATEST

echo "== replaying WAL${TARGET:+ up to $TARGET}"
touch "$DATA/recovery.signal"
{
  echo "restore_command = 'wal-g wal-fetch %f %p'"
  [ -n "$TARGET" ] && echo "recovery_target_time = '$TARGET'" && echo "recovery_target_action = 'promote'"
} >> "$DATA/postgresql.auto.conf"
chown -R 999:999 "$DATA"
$COMPOSE up -d postgres
for _ in $(seq 1 120); do
  $COMPOSE exec -T postgres psql -tAc "select pg_is_in_recovery()" 2>/dev/null | grep -q '^f$' && break
  sleep 5
done
$COMPOSE exec -T postgres psql -tAc "select pg_is_in_recovery()" | grep -q '^f$' || { echo "still recovering after 10 minutes: see  docker compose logs postgres" >&2; exit 1; }
# recovery settings are only for this restore
sed -i "/^restore_command = /d; /^recovery_target_time = /d; /^recovery_target_action = /d" "$DATA/postgresql.auto.conf"

echo "== starting the app"
$COMPOSE up -d
echo "Restored. The previous data folder is kept at /data/postgres.before-restore-$STAMP (delete it once you are sure)."
