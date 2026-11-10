#!/bin/bash
# Runs ON the server (started by infra/prod/deploy.sh through Session Manager): fetch the files, render settings, pull images, migrate, restart,
# check health, and go back to the previous images if the new ones are not healthy.
set -euo pipefail
cd /opt/slidesdone
source ./config.env
# --exact-timestamps: sync would otherwise skip a same-sized file (images.env always has the same length) and run old images
aws s3 sync "s3://$ASSETS_BUCKET/deploy/" /opt/slidesdone/ --region "$AWS_REGION" --exact-timestamps --no-progress
chmod +x ./*.sh
bash ./render-env.sh

COMPOSE="docker compose --env-file .env --env-file images.env"
REGISTRY="$(grep '^API_IMAGE=' images.env | cut -d= -f2- | cut -d/ -f1)"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

healthy() { # every service with a health check reports healthy within about 2 minutes
  for _ in $(seq 1 24); do
    local bad
    bad="$($COMPOSE ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy"' || true)"
    [ -z "$bad" ] && return 0
    sleep 5
  done
  echo "not healthy: $bad" >&2; return 1
}

$COMPOSE pull --quiet
$COMPOSE up -d postgres
$COMPOSE run --rm --no-deps api node dist/migrate.js
$COMPOSE up -d --remove-orphans
if healthy; then
  cp images.env images.good # the last set of images that came up healthy
else
  if [ -f images.good ] && ! cmp -s images.env images.good; then
    echo "== rolling back to the last healthy images" >&2
    COMPOSE_BACK="docker compose --env-file .env --env-file images.good"
    $COMPOSE_BACK up -d --remove-orphans
    healthy || echo "the previous images are not healthy either: look at  docker compose logs" >&2
  fi
  # migrations are forward-only and written to be backwards compatible, so the previous images run on the migrated database
  exit 1
fi
docker image prune -f >/dev/null

# timers, written on every deploy (so a changed time reaches a running server): a base backup twice a day, at 02:30 and 13:00 India time (21:00 and 07:30 UTC).
# The WAL in between is shipped continuously by Postgres itself.
{
  cat > /etc/systemd/system/slidesdone-basebackup.service <<UNIT
[Unit]
Description=SlidesDone database base backup (WAL-G)
[Service]
Type=oneshot
ExecStart=/opt/slidesdone/backup-base.sh
UNIT
  cat > /etc/systemd/system/slidesdone-basebackup.timer <<UNIT
[Unit]
Description=Twice-daily SlidesDone database base backup
[Timer]
OnCalendar=*-*-* 21:00:00 UTC
OnCalendar=*-*-* 07:30:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload && systemctl enable --now slidesdone-basebackup.timer && systemctl restart slidesdone-basebackup.timer
}
# an encrypted export of the whole database for the owner to pull (export-db.sh): the timer fires every night, the script itself only exports when the last one is 47 hours old
{
  cat > /etc/systemd/system/slidesdone-export.service <<UNIT
[Unit]
Description=SlidesDone encrypted database export
[Service]
Type=oneshot
ExecStart=/opt/slidesdone/export-db.sh
UNIT
  cat > /etc/systemd/system/slidesdone-export.timer <<UNIT
[Unit]
Description=SlidesDone database export (about every 2 days)
[Timer]
OnCalendar=*-*-* 22:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload && systemctl enable --now slidesdone-export.timer && systemctl restart slidesdone-export.timer
}
$COMPOSE ps
