#!/bin/bash
# Runs ON the server (started by infra/scripts/deploy.sh through Session Manager): fetch the files, render settings, pull images, migrate, restart.
set -euo pipefail
cd /opt/slidesdone
source ./config.env
aws s3 sync "s3://$ASSETS_BUCKET/deploy/" /opt/slidesdone/ --region "$AWS_REGION" --no-progress
chmod +x ./*.sh
EDITOR_BUCKET="${ASSETS_BUCKET/-assets-/-editor-}"
mkdir -p editor
aws s3 sync "s3://$EDITOR_BUCKET/" /opt/slidesdone/editor/ --delete --region "$AWS_REGION" --no-progress
bash ./render-env.sh
REGISTRY="$(cut -d/ -f1 <<<"$(grep '^API_IMAGE=' images.env | cut -d= -f2-)")"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
COMPOSE="docker compose --env-file .env --env-file images.env"
$COMPOSE pull
$COMPOSE up -d postgres
$COMPOSE run --rm api node dist/migrate.js
$COMPOSE up -d --remove-orphans
docker image prune -f >/dev/null
# nightly backup timer (installed once)
if [ ! -f /etc/systemd/system/slidesdone-backup.timer ]; then
  cat > /etc/systemd/system/slidesdone-backup.service <<UNIT
[Unit]
Description=SlidesDone database backup
[Service]
Type=oneshot
ExecStart=/opt/slidesdone/backup.sh
UNIT
  cat > /etc/systemd/system/slidesdone-backup.timer <<UNIT
[Unit]
Description=Nightly SlidesDone database backup
[Timer]
OnCalendar=*-*-* 21:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload && systemctl enable --now slidesdone-backup.timer
fi
$COMPOSE ps
