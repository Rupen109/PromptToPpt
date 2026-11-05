#!/bin/bash
# One-time move from the test server: loads a pg_dump file (custom format) from the backups bucket into this server's database.
#   sudo /opt/slidesdone/import-dump.sh migrate/test-20261110-0930.dump
# Started by infra/prod/migrate-from-test.sh. The app is stopped while loading; the deploy afterwards runs any newer migrations.
set -euo pipefail
cd /opt/slidesdone
source ./config.env
KEY="${1:?usage: import-dump.sh <key in the backups bucket>}"
COMPOSE="docker compose --env-file .env --env-file images.env"
aws s3 cp "s3://$BACKUPS_BUCKET/$KEY" /tmp/import.dump --region "$AWS_REGION" --no-progress
$COMPOSE stop caddy web api worker
$COMPOSE up -d postgres
for _ in $(seq 1 30); do $COMPOSE exec -T postgres pg_isready -q && break; sleep 2; done
# --clean --if-exists: replaces whatever an earlier deploy created; --no-owner: everything belongs to this server's database user
$COMPOSE exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges -U slidesdone -d slidesdone < /tmp/import.dump
rm -f /tmp/import.dump
$COMPOSE exec -T postgres psql -U slidesdone -tAc "select count(*) || ' users, ' || (select count(*) from presentation) || ' presentations' from \"user\""
echo "Imported. Run the deploy (server-deploy.sh) to apply newer migrations and start the app."
