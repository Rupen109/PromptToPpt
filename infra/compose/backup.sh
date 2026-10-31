#!/bin/bash
# Nightly: dump the database, compress, copy to the assets bucket (kept 30 days by the bucket's own rule).
set -euo pipefail
cd /opt/slidesdone
source ./config.env
F="/tmp/slidesdone-$(date -u +%Y%m%d-%H%M).sql.gz"
docker compose --env-file .env --env-file images.env exec -T postgres pg_dump -U slidesdone slidesdone | gzip > "$F"
aws s3 cp "$F" "s3://$ASSETS_BUCKET/db-backups/$(basename "$F")" --region "$AWS_REGION" --no-progress
rm -f "$F"
