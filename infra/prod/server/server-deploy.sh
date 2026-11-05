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

# timers, installed once: a daily base backup (the WAL in between is shipped continuously by Postgres itself)
if [ ! -f /etc/systemd/system/slidesdone-basebackup.timer ]; then
  cat > /etc/systemd/system/slidesdone-basebackup.service <<UNIT
[Unit]
Description=SlidesDone database base backup (WAL-G)
[Service]
Type=oneshot
ExecStart=/opt/slidesdone/backup-base.sh
UNIT
  cat > /etc/systemd/system/slidesdone-basebackup.timer <<UNIT
[Unit]
Description=Daily SlidesDone database base backup
[Timer]
OnCalendar=*-*-* 21:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload && systemctl enable --now slidesdone-basebackup.timer
fi
$COMPOSE ps
