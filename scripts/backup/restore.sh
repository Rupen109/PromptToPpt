#!/bin/bash
# Brings an export back to life after the database was lost. Two steps, and nothing on the server changes until YOU run the printed command:
#   1. here: decrypt the export with your private key (asks for its passphrase) and put the plain dump in the backups bucket under migrate/ (removed after 30 days)
#   2. on the server: import-dump.sh loads it (it stops the app, replaces the data, you then run the normal deploy to apply newer migrations and start)
#
#   scripts/backup/restore.sh                 # the newest export on this computer
#   scripts/backup/restore.sh 20261112T220000Z
#
# Needs: gpg + your private key, the AWS CLI with an ADMIN profile (the read-only backup-reader key cannot write): set RESTORE_AWS_PROFILE.
set -euo pipefail
CONF="${SLIDESDONE_BACKUP_CONFIG:-$HOME/.slidesdone-backup/config}"
# shellcheck disable=SC1090
source "$CONF"
STAMP="${1:-$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort | tail -n 1 | xargs -n1 basename)}"
DIR="$BACKUP_DIR/$STAMP"; [ -f "$DIR/manifest.json" ] || { echo "no export $STAMP in $BACKUP_DIR" >&2; exit 1; }
FILE="$(sed -n 's/.*"file": "\(.*\)".*/\1/p' "$DIR/manifest.json")"
echo "Export $STAMP"; sed -n 's/.*"\(created\|dump_bytes\|migrations_applied\|postgres\)".*/  &/p' "$DIR/manifest.json"
read -r -p "Restore THIS export over the production database? Type RESTORE: " ok; [ "$ok" = "RESTORE" ] || { echo "cancelled"; exit 1; }
PLAIN="$(mktemp -d)/slidesdone-$STAMP.dump"; trap 'rm -rf "$(dirname "$PLAIN")"' EXIT
echo "== decrypting (your passphrase)"
gpg --decrypt --output "$PLAIN" "$DIR/$FILE"
pg_restore -l "$PLAIN" >/dev/null || { echo "the decrypted dump is not readable" >&2; exit 1; }
AWSP=(aws --region "$REGION" ${RESTORE_AWS_PROFILE:+--profile "$RESTORE_AWS_PROFILE"})
KEY="migrate/restore-$STAMP.dump"
"${AWSP[@]}" s3 cp "$PLAIN" "s3://$BUCKET/$KEY" --no-progress
cat <<MSG

Uploaded to s3://$BUCKET/$KEY
Now, on the server (AWS Systems Manager > Session Manager, or: aws ssm start-session --target <instance id>):
    sudo /opt/slidesdone/import-dump.sh $KEY
then bring the app back with the normal deploy:  infra/prod/deploy.sh server
When it is back and checked, remove the plain dump:  aws s3 rm s3://$BUCKET/$KEY
MSG
