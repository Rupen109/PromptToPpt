#!/usr/bin/env bash
# Build, upload and start SlidesDone on the test server (Sydney).
#
#   infra/scripts/deploy.sh [api] [web] [editor] [config]     (no argument = everything)
#
# api / web : build the Docker image for the server's ARM chip, push to ECR
# editor    : build the single-page app, copy to its bucket, refresh the CDN
# config    : only upload the compose files and restart (no builds)
# Needs: Docker running (colima start), the AWS profile, and the secrets stored once with infra/scripts/put-secrets.sh.
set -euo pipefail
export PATH="$HOME/homebrew/bin:/opt/homebrew/bin:$PATH"
ENVNAME="${ENVNAME:-test}"; export AWS_REGION="${AWS_REGION:-ap-southeast-2}" AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}" AWS_PAGER=""
# on your Mac the saved login profile is used; in GitHub Actions the role login is already in the environment
[ -n "${GITHUB_ACTIONS:-}" ] || export AWS_PROFILE="${AWS_PROFILE:-goldenhour}"
DOMAIN="${DOMAIN:-slidesdone.app}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
# resource names come from OpenTofu on your Mac; in CI (no state) they follow the same naming rule
TF() {
  if [ -z "${GITHUB_ACTIONS:-}" ] && [ -d infra/tofu/.terraform ]; then (cd infra/tofu && tofu output -raw "$1"); return; fi
  case "$1" in
    ecr_api) echo "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/slidesdone-$ENVNAME/api" ;;
    ecr_web) echo "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/slidesdone-$ENVNAME/web" ;;
    assets_bucket) echo "slidesdone-$ENVNAME-assets-$ACCOUNT_ID" ;;
    editor_bucket) echo "slidesdone-$ENVNAME-editor-$ACCOUNT_ID" ;;
    server_instance_id) aws ec2 describe-instances --filters "Name=tag:Name,Values=slidesdone-$ENVNAME-server" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text ;;
    editor_distribution_id) echo "" ;;
  esac
}
WHAT=("$@"); [ ${#WHAT[@]} -gt 0 ] || WHAT=(api web editor config)
has() { for w in "${WHAT[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
ECR_API="$(TF ecr_api)"; ECR_WEB="$(TF ecr_web)"; ASSETS="$(TF assets_bucket)"; EDITOR_BUCKET="$(TF editor_bucket)"; INSTANCE="$(TF server_instance_id)"
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo manual)-$(date -u +%m%d%H%M)"

if has api || has web; then
  command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running. Start it with: colima start"; exit 1; }
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
fi
if has api; then
  echo "== building API ($TAG)"; docker build --platform linux/arm64 -f services/api/Dockerfile -t "$ECR_API:$TAG" .
  docker push "$ECR_API:$TAG"; echo "API_IMAGE=$ECR_API:$TAG" > /tmp/api.image
fi
if has web; then
  echo "== building website ($TAG)"
  docker build --platform linux/arm64 -f apps/web/Dockerfile \
    --build-arg NEXT_PUBLIC_SITE_URL="https://$DOMAIN" --build-arg NEXT_PUBLIC_API_URL="https://api.$DOMAIN" --build-arg NEXT_PUBLIC_EDITOR_URL="https://app.$DOMAIN" \
    --build-arg NEXT_PUBLIC_GOOGLE_AUTH="${NEXT_PUBLIC_GOOGLE_AUTH:-false}" --build-arg NEXT_PUBLIC_MICROSOFT_AUTH="${NEXT_PUBLIC_MICROSOFT_AUTH:-false}" -t "$ECR_WEB:$TAG" .
  docker push "$ECR_WEB:$TAG"; echo "WEB_IMAGE=$ECR_WEB:$TAG" > /tmp/web.image
fi

if has editor; then
  echo "== building the editor"
  VITE_API_URL="https://api.$DOMAIN" VITE_WEB_URL="https://$DOMAIN" pnpm --filter @prompttoppt/editor build
  aws s3 sync apps/editor/dist "s3://$EDITOR_BUCKET/" --delete --no-progress >/dev/null
  DIST="$(TF editor_distribution_id 2>/dev/null || true)"
  if [ -n "$DIST" ] && [ "$DIST" != "null" ]; then aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' >/dev/null && echo "CDN refreshed"; fi
fi

# images.env keeps the image tags in use; a partial deploy keeps the other one as it was
TMP="$(mktemp -d)"; cp infra/compose/* "$TMP/"; echo "$DOMAIN" > "$TMP/domain.txt"
aws s3 cp "s3://$ASSETS/deploy/images.env" "$TMP/images.old" --no-progress >/dev/null 2>&1 || true
{ if [ -f /tmp/api.image ] && has api; then cat /tmp/api.image; else grep '^API_IMAGE=' "$TMP/images.old" 2>/dev/null || true; fi
  if [ -f /tmp/web.image ] && has web; then cat /tmp/web.image; else grep '^WEB_IMAGE=' "$TMP/images.old" 2>/dev/null || true; fi; } > "$TMP/images.env"
rm -f "$TMP/images.old" /tmp/api.image /tmp/web.image
if has api || has web || has config || has editor; then
  grep -q API_IMAGE "$TMP/images.env" && grep -q WEB_IMAGE "$TMP/images.env" || { echo "Both images are needed once: run  infra/scripts/deploy.sh api web"; exit 1; }
  aws s3 sync "$TMP" "s3://$ASSETS/deploy/" --no-progress --delete >/dev/null
  echo "== starting on the server"
  CMD_ID="$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript --comment "slidesdone deploy $TAG" --parameters 'commands=["bash -c \"mkdir -p /opt/slidesdone && aws s3 sync s3://'"$ASSETS"'/deploy/ /opt/slidesdone/ --region '"$AWS_REGION"' --no-progress && chmod +x /opt/slidesdone/*.sh && /opt/slidesdone/server-deploy.sh\""]' --timeout-seconds 900 --query Command.CommandId --output text)"
  for _ in $(seq 1 90); do
    ST="$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)"
    case "$ST" in Success|Failed|Cancelled|TimedOut) break ;; esac; sleep 10
  done
  aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -40
  [ "$ST" = Success ] || { echo "Server step finished with status: $ST"; exit 1; }
fi
rm -rf "$TMP"

echo "Done: $TAG"
