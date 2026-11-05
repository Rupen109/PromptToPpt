#!/usr/bin/env bash
# One-time move of the data from the test server to the production server, both in Sydney (docs/DEPLOY_AWS_PROD.md, steps 5 and 6).
#   infra/prod/migrate-from-test.sh            copy pictures, dump + load the database (the test site keeps running: a rehearsal)
#   infra/prod/migrate-from-test.sh --final    the same, but the test site's app is stopped first, so nothing is written after the dump
# Pictures are copied first and again at the end (only new ones), so the final run is short.
set -euo pipefail
FINAL=false; [ "${1:-}" = "--final" ] && FINAL=true
export AWS_PROFILE="${AWS_PROFILE:-goldenhour}" AWS_PAGER="" AWS_DEFAULT_REGION=ap-southeast-2
REGION=ap-southeast-2
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OLD_ASSETS="slidesdone-test-assets-$ACCOUNT_ID"
NEW_ASSETS="slidesdone-prod-assets-$ACCOUNT_ID"; NEW_BACKUPS="slidesdone-prod-backups-$ACCOUNT_ID"
instance() { aws ec2 describe-instances --filters "Name=tag:Name,Values=$1" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text; }
OLD_SERVER="$(instance slidesdone-test-server)"; NEW_SERVER="$(instance slidesdone-prod-server)"
run() { # instance command → waits, prints the output, fails if the command failed
  local id st
  id="$(aws ssm send-command --instance-ids "$1" --document-name AWS-RunShellScript --parameters "commands=[\"$2\"]" --timeout-seconds 1800 --query Command.CommandId --output text)"
  for _ in $(seq 1 180); do st="$(aws ssm get-command-invocation --command-id "$id" --instance-id "$1" --query Status --output text 2>/dev/null || echo Pending)"; case "$st" in Success|Failed|Cancelled|TimedOut) break ;; esac; sleep 10; done
  aws ssm get-command-invocation --command-id "$id" --instance-id "$1" --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -20
  [ "$st" = Success ]
}
copy_pictures() { echo "== pictures: test bucket → production bucket"; aws s3 sync "s3://$OLD_ASSETS/" "s3://$NEW_ASSETS/" --exclude 'deploy/*' --exclude 'db-backups/*' --exclude 'migrate/*' --no-progress; }

copy_pictures
if $FINAL; then echo "== stopping the test site's app (its database stays up for the dump)"; run "$OLD_SERVER" "cd /opt/slidesdone && docker compose --env-file .env --env-file images.env stop caddy web api"; fi
STAMP="$(date -u +%Y%m%d-%H%M)"; KEY="migrate/test-$STAMP.dump"
echo "== dumping the test database"
run "$OLD_SERVER" "cd /opt/slidesdone && docker compose --env-file .env --env-file images.env exec -T postgres pg_dump -U slidesdone -Fc slidesdone > /tmp/m.dump && aws s3 cp /tmp/m.dump s3://$OLD_ASSETS/$KEY --region $REGION --no-progress && rm /tmp/m.dump"
aws s3 cp "s3://$OLD_ASSETS/$KEY" "s3://$NEW_BACKUPS/$KEY" --no-progress
aws s3 rm "s3://$OLD_ASSETS/$KEY" >/dev/null
copy_pictures # anything uploaded while the dump ran
echo "== loading it on the production server"
run "$NEW_SERVER" "/opt/slidesdone/import-dump.sh $KEY && /opt/slidesdone/server-deploy.sh"
echo "Done. Production now has the test site's data as of $STAMP UTC.$($FINAL && echo ' Next: cutover (docs/DEPLOY_AWS_PROD.md, step 6).')"
