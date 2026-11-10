#!/bin/bash
# Runs ON the server (started by infra/scripts/deploy.sh through Session Manager): fetch the files, render settings, pull images, migrate, restart.
set -euo pipefail
cd /opt/slidesdone
source ./config.env
# --exact-timestamps: by default sync SKIPS a same-sized file unless the local copy is newer. images.env always has the same size (every tag is the same length),
# so the server kept an old image list, pulled an image that no longer exists, and the deploy failed. Compare by time exactly, so any change is fetched.
aws s3 sync "s3://$ASSETS_BUCKET/deploy/" /opt/slidesdone/ --region "$AWS_REGION" --exact-timestamps --no-progress
chmod +x ./*.sh
EDITOR_BUCKET="${ASSETS_BUCKET/-assets-/-editor-}"
mkdir -p editor
aws s3 sync "s3://$EDITOR_BUCKET/" /opt/slidesdone/editor/ --delete --region "$AWS_REGION" --exact-timestamps --no-progress
# index.html always has the same size (only the script hashes inside it change): copied explicitly as well, so a page never asks for scripts that no longer exist
aws s3 cp "s3://$EDITOR_BUCKET/index.html" /opt/slidesdone/editor/index.html --region "$AWS_REGION" --no-progress
bash ./render-env.sh
REGISTRY="$(cut -d/ -f1 <<<"$(grep '^API_IMAGE=' images.env | cut -d= -f2-)")"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
COMPOSE="docker compose --env-file .env --env-file images.env"
$COMPOSE pull
$COMPOSE up -d postgres
$COMPOSE run --rm api node dist/migrate.js
$COMPOSE up -d --remove-orphans
docker image prune -f >/dev/null
# backup timer, written on every deploy: twice a day, 02:30 and 13:00 India time (21:00 and 07:30 UTC)
{
  cat > /etc/systemd/system/slidesdone-backup.service <<UNIT
[Unit]
Description=SlidesDone database backup
[Service]
Type=oneshot
ExecStart=/opt/slidesdone/backup.sh
UNIT
  cat > /etc/systemd/system/slidesdone-backup.timer <<UNIT
[Unit]
Description=Twice-daily SlidesDone database backup
[Timer]
OnCalendar=*-*-* 21:00:00 UTC
OnCalendar=*-*-* 07:30:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload && systemctl enable --now slidesdone-backup.timer && systemctl restart slidesdone-backup.timer
}
$COMPOSE ps
