#!/bin/bash
# One-time setup on the owner's Mac: writes ~/.slidesdone-backup/config and schedules pull-exports.sh every day at 11:00 (launchd).
# Usage: scripts/backup/install-mac.sh <backups bucket> [backup folder]    (the bucket name: `tofu output backups_bucket` in infra/prod/tofu)
# The AWS profile "slidesdone-backup-reader" must hold the read-only key (aws configure --profile slidesdone-backup-reader).
set -euo pipefail
BUCKET="${1:?usage: install-mac.sh <backups bucket> [backup folder]}"
DIR="${2:-$HOME/SlidesDoneBackups}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.slidesdone-backup" "$DIR"; chmod 700 "$HOME/.slidesdone-backup" "$DIR"
cat > "$HOME/.slidesdone-backup/config" <<CFG
BACKUP_DIR="$DIR"
BUCKET="$BUCKET"
REGION="ap-southeast-2"
AWS_PROFILE="slidesdone-backup-reader"
KEEP=15
STALE_HOURS=96
# only for restore.sh (an admin profile that may write to the bucket):
# RESTORE_AWS_PROFILE="your-admin-profile"
CFG
PLIST="$HOME/Library/LaunchAgents/com.slidesdone.backup-pull.plist"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.slidesdone.backup-pull</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HERE/pull-exports.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>11</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$HOME/.slidesdone-backup/pull.log</string>
  <key>StandardErrorPath</key><string>$HOME/.slidesdone-backup/pull.log</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. Exports will be pulled to $DIR every day at 11:00 (log: ~/.slidesdone-backup/pull.log). Run once now:  $HERE/pull-exports.sh"
