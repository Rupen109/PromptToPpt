#!/bin/bash
# Pulls the encrypted database exports from AWS to this computer, checks each one, and keeps the newest N. Safe to run as often as you like: it only fetches what is new.
# Needs the AWS CLI and the read-only backup-reader access key (docs/BACKUP_AND_RESTORE.md). It does NOT need (or touch) your private key: the files stay encrypted here.
#
#   scripts/backup/pull-exports.sh            # pull what is new
#   scripts/backup/pull-exports.sh --list     # show what is on this computer
#
# Settings live in ~/.slidesdone-backup/config (written by install-mac.sh): BACKUP_DIR, BUCKET, REGION, AWS_PROFILE, KEEP, STALE_HOURS.
set -euo pipefail
CONF="${SLIDESDONE_BACKUP_CONFIG:-$HOME/.slidesdone-backup/config}"
[ -f "$CONF" ] || { echo "No settings found at $CONF. Run scripts/backup/install-mac.sh first." >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONF"
: "${BACKUP_DIR:?}" "${BUCKET:?}" "${REGION:?}"
KEEP="${KEEP:-15}"            # 15 exports = about 30 days
STALE_HOURS="${STALE_HOURS:-96}" # warn when the newest export is older than this
AWS=(aws --region "$REGION" ${AWS_PROFILE:+--profile "$AWS_PROFILE"})
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

notify() { echo "backup: $1" >&2; command -v osascript >/dev/null 2>&1 && osascript -e "display notification \"$1\" with title \"SlidesDone backup\"" >/dev/null 2>&1 || true; }
fail() { notify "$1"; exit 1; }

list_local() { find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort; }
if [ "${1:-}" = "--list" ]; then
  for d in $(list_local); do echo "$(basename "$d")  $(du -sh "$d" | cut -f1)"; done; exit 0
fi

remote="$("${AWS[@]}" s3 ls "s3://$BUCKET/exports/" | awk '$1=="PRE"{print $2}' | tr -d '/' | sort)" || fail "could not list the exports in AWS (check the access key)"
for stamp in $remote; do
  [ -f "$BACKUP_DIR/$stamp/manifest.json" ] && continue
  # a complete export has its manifest (uploaded last); a half-uploaded one is skipped and tried again next time
  "${AWS[@]}" s3api head-object --bucket "$BUCKET" --key "exports/$stamp/manifest.json" >/dev/null 2>&1 || continue
  tmp="$BACKUP_DIR/.incoming-$stamp"; rm -rf "$tmp"; mkdir -p "$tmp"
  "${AWS[@]}" s3 cp "s3://$BUCKET/exports/$stamp/" "$tmp/" --recursive --no-progress >/dev/null || { rm -rf "$tmp"; fail "download of $stamp failed"; }
  file="$(sed -n 's/.*"file": "\(.*\)".*/\1/p' "$tmp/manifest.json")"
  want="$(sed -n 's/.*"sha256": "\(.*\)".*/\1/p' "$tmp/manifest.json")"
  got="$(shasum -a 256 "$tmp/$file" | awk '{print $1}')"
  [ -n "$file" ] && [ "$got" = "$want" ] || { rm -rf "$tmp"; fail "export $stamp is damaged (checksum differs): not kept"; }
  mv "$tmp" "$BACKUP_DIR/$stamp"; chmod -R go-rwx "$BACKUP_DIR/$stamp"
  echo "backup: pulled $stamp ($(du -sh "$BACKUP_DIR/$stamp" | cut -f1))"
done

# keep the newest KEEP exports on this computer
count="$(list_local | wc -l | tr -d ' ')"
if [ "$count" -gt "$KEEP" ]; then list_local | head -n "$((count - KEEP))" | while read -r d; do rm -rf "$d"; done; fi

newest="$(list_local | tail -n 1 | xargs -n1 basename 2>/dev/null || true)"
[ -n "$newest" ] || fail "no export on this computer yet (the server makes the first one within 2 days of the first deploy)"
then_s="$(date -j -u -f '%Y%m%dT%H%M%SZ' "$newest" +%s)"
age_h=$(( ( $(date -u +%s) - then_s ) / 3600 ))
[ "$age_h" -le "$STALE_HOURS" ] || fail "the newest export is $age_h hours old: the server's export may have stopped"
echo "backup: newest export $newest ($age_h h old), $(list_local | wc -l | tr -d ' ') kept in $BACKUP_DIR"
