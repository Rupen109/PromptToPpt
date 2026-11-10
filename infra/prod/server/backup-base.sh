#!/bin/bash
# Base backup with WAL-G, twice a day (started by the slidesdone-basebackup timer, or by hand). Together with the WAL that Postgres ships every minute,
# it allows a restore to any point of the retention window. Old backups are removed by the bucket's own expiry rule (the server may not delete).
set -euo pipefail
cd /opt/slidesdone
docker compose --env-file .env --env-file images.env exec -T -u postgres postgres wal-g backup-push /var/lib/postgresql/data
docker compose --env-file .env --env-file images.env exec -T -u postgres postgres wal-g backup-list 2>/dev/null | tail -n 3
