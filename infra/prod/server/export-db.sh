#!/bin/bash
# An encrypted, verified export of the whole database, kept in the backups bucket under exports/<UTC time>/ for the owner to pull to their own computer
# (scripts/backup/pull-exports.sh). Runs from the slidesdone-export timer every day but only does the work when the newest export is 47 hours old or older,
# so exports happen about every 2 days and a missed night is caught up the next. By hand:  sudo /opt/slidesdone/export-db.sh --force
#
# Nothing readable ever leaves this server: the dump is encrypted with the owner's PUBLIC key (backup-public-key.asc, shipped with the deploy). The private key
# lives only with the owner, so a hacked server cannot read old exports, and the server may add files to the bucket but never delete them.
# An export is complete only when its manifest.json exists: the manifest is uploaded last.
set -euo pipefail
umask 077
HOME_DIR="${SLIDESDONE_HOME:-/opt/slidesdone}" # only a test points this elsewhere
cd "$HOME_DIR"
source ./config.env
COMPOSE="docker compose --env-file .env --env-file images.env"
KEYFILE="$HOME_DIR/backup-public-key.asc"
MIN_AGE_HOURS=47
PREFIX="exports"

[ -s "$KEYFILE" ] || { echo "export-db: $KEYFILE is missing. Nothing is exported unencrypted. See docs/BACKUP_AND_RESTORE.md (step 1)." >&2; exit 1; }

if [ "${1:-}" != "--force" ]; then
  last="$(aws s3 ls "s3://$BACKUPS_BUCKET/$PREFIX/" --region "$AWS_REGION" | awk '$1=="PRE"{print $2}' | tr -d '/' | sort | tail -n 1 || true)"
  if [ -n "$last" ]; then
    then_s="$(date -u -d "${last:0:4}-${last:4:2}-${last:6:2} ${last:9:2}:${last:11:2}:${last:13:2}" +%s)"
    age_h=$(( ( $(date -u +%s) - then_s ) / 3600 ))
    [ "$age_h" -lt "$MIN_AGE_HOURS" ] && { echo "export-db: newest export is $age_h h old (< $MIN_AGE_HOURS h): nothing to do"; exit 0; }
  fi
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d /var/tmp/slidesdone-export.XXXXXX)"
export GNUPGHOME="$WORK/gnupg"; install -d -m 700 "$GNUPGHOME"
trap 'rm -rf "$WORK"' EXIT

echo "== dumping the database"
$COMPOSE exec -T postgres pg_dump -Fc -U slidesdone slidesdone > "$WORK/db.dump"
# the archive must be readable before we trust it (its table of contents is read back)
$COMPOSE exec -T postgres pg_restore -l < "$WORK/db.dump" > "$WORK/db.toc"
[ -s "$WORK/db.dump" ] && [ "$(wc -l < "$WORK/db.toc")" -gt 20 ] || { echo "export-db: the dump looks empty or damaged" >&2; exit 1; }
DUMP_BYTES="$(wc -c < "$WORK/db.dump" | tr -d ' ')"

echo "== counting rows (to compare after a restore)"
ROWS="$($COMPOSE exec -T postgres psql -U slidesdone -tA -c "select string_agg(format('    \"%s\": %s', relname, n), E',\n' order by relname) from (select relname, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || quote_ident(relname), false, true, '')))[1]::text::bigint as n from pg_stat_user_tables where schemaname='public') t")"
MIGRATIONS="$($COMPOSE exec -T postgres psql -U slidesdone -tA -c 'select count(*) from drizzle.__drizzle_migrations' 2>/dev/null || echo unknown)"

echo "== encrypting with the owner's public key"
gpg --batch --quiet --import "$KEYFILE"
FPR="$(gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr"{print $10; exit}')"
[ -n "$FPR" ] || { echo "export-db: no usable key in $KEYFILE" >&2; exit 1; }
FILE="slidesdone-$STAMP.dump.gpg"
gpg --batch --quiet --trust-model always --recipient "$FPR" --cipher-algo AES256 --compress-algo none --output "$WORK/$FILE" --encrypt "$WORK/db.dump"
SUM="$(sha256sum "$WORK/$FILE" | awk '{print $1}')"
BYTES="$(wc -c < "$WORK/$FILE" | tr -d ' ')"
echo "$SUM  $FILE" > "$WORK/SHA256SUMS"

cat > "$WORK/manifest.json" <<JSON
{
  "format": "slidesdone-export/1",
  "created": "$STAMP",
  "file": "$FILE",
  "encrypted_bytes": $BYTES,
  "dump_bytes": $DUMP_BYTES,
  "sha256": "$SUM",
  "encrypted_to": "$FPR",
  "dump_format": "pg_dump custom (restore with pg_restore)",
  "postgres": "$($COMPOSE exec -T postgres postgres --version | tr -d '\r')",
  "migrations_applied": "$(echo "$MIGRATIONS" | tr -d '\r\n ')",
  "rows": {
$ROWS
  }
}
JSON

echo "== uploading (the manifest last)"
DEST="s3://$BACKUPS_BUCKET/$PREFIX/$STAMP"
aws s3 cp "$WORK/$FILE" "$DEST/$FILE" --region "$AWS_REGION" --no-progress
aws s3 cp "$WORK/SHA256SUMS" "$DEST/SHA256SUMS" --region "$AWS_REGION" --no-progress
remote="$(aws s3api head-object --bucket "$BACKUPS_BUCKET" --key "$PREFIX/$STAMP/$FILE" --region "$AWS_REGION" --query ContentLength --output text)"
[ "$remote" = "$BYTES" ] || { echo "export-db: uploaded $remote bytes, expected $BYTES" >&2; exit 1; }
aws s3 cp "$WORK/manifest.json" "$DEST/manifest.json" --region "$AWS_REGION" --no-progress
echo "export-db: done: $DEST ($BYTES bytes encrypted)"
