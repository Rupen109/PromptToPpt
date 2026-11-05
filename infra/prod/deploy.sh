#!/usr/bin/env bash
# Build, upload and start SlidesDone in production (Sydney, behind CloudFront).
#
#   infra/prod/deploy.sh [api] [web] [editor] [server] [config]     (no argument = everything)
#
# api / web : build the image for the server's ARM chip, tag it with the git commit, push to ECR
# server    : build the Caddy (Route 53 plugin) and Postgres (WAL-G) images; needed once, and after changing infra/prod/images
# editor    : build the single-page app, upload it to its bucket, refresh index.html on CloudFront
# config    : only upload the server files and restart (no builds)
# Needs: Docker (colima start), the AWS profile, the secrets stored with infra/scripts/put-secrets.sh, and infra/prod/tofu applied.
set -euo pipefail
export PATH="$HOME/homebrew/bin:/opt/homebrew/bin:$PATH"
for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
ENVNAME="${ENVNAME:-prod}"; export AWS_REGION="${AWS_REGION:-ap-southeast-2}" AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}" AWS_PAGER=""
[ -n "${GITHUB_ACTIONS:-}" ] || export AWS_PROFILE="${AWS_PROFILE:-goldenhour}"
DOMAIN="${DOMAIN:-slidesdone.app}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PREFIX="slidesdone-$ENVNAME"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
ASSETS="$PREFIX-assets-$ACCOUNT_ID"; EDITOR_BUCKET="$PREFIX-editor-$ACCOUNT_ID"
INSTANCE="$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$PREFIX-server" "Name=instance-state-name,Values=running" --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ "$INSTANCE" != "None" ] || { echo "No running $PREFIX-server in $AWS_REGION: apply infra/prod/tofu first"; exit 1; }
DIST="$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$PREFIX editor'].Id | [0]" --output text)"

WHAT=("$@"); [ ${#WHAT[@]} -gt 0 ] || WHAT=(api web editor server config)
has() { for w in "${WHAT[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

# tags are immutable in ECR: the commit, plus a marker when the working tree has changes nobody committed
TAG="$(git rev-parse --short=12 HEAD)"; git diff --quiet HEAD -- . 2>/dev/null || TAG="$TAG-dirty-$(date -u +%m%d%H%M)"
image() { echo "$REGISTRY/$PREFIX/$1:$TAG"; }
build() { # name dockerfile [docker build args…]
  local name="$1" file="$2"; shift 2
  if aws ecr describe-images --repository-name "$PREFIX/$name" --image-ids imageTag="$TAG" >/dev/null 2>&1; then echo "== $name:$TAG already in ECR"; return; fi
  echo "== building $name ($TAG)"; docker build --platform linux/arm64 -f "$file" "$@" -t "$(image "$name")" .
  docker push "$(image "$name")"
}

if has api || has web || has server; then
  command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running. Start it with: colima start"; exit 1; }
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
fi
NEW=()
if has api; then build api services/api/Dockerfile; NEW+=("API_IMAGE=$(image api)"); fi
if has web; then
  build web apps/web/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL="https://$DOMAIN" --build-arg NEXT_PUBLIC_API_URL="https://api.$DOMAIN" --build-arg NEXT_PUBLIC_EDITOR_URL="https://app.$DOMAIN" \
    --build-arg NEXT_PUBLIC_GOOGLE_AUTH="${NEXT_PUBLIC_GOOGLE_AUTH:-true}" --build-arg NEXT_PUBLIC_MICROSOFT_AUTH="${NEXT_PUBLIC_MICROSOFT_AUTH:-false}"
  NEW+=("WEB_IMAGE=$(image web)")
fi
if has server; then
  build caddy infra/prod/images/caddy/Dockerfile; NEW+=("CADDY_IMAGE=$(image caddy)")
  build postgres infra/prod/images/postgres/Dockerfile; NEW+=("POSTGRES_IMAGE=$(image postgres)")
fi

if has editor; then
  echo "== building the editor"
  VITE_API_URL="https://api.$DOMAIN" VITE_WEB_URL="https://$DOMAIN" pnpm --filter @prompttoppt/editor build
  # hashed files first (cached for a year), the entry page last and never cached, so a page never points at scripts that are not there yet
  aws s3 sync apps/editor/dist "s3://$EDITOR_BUCKET/" --exclude index.html --cache-control "public, max-age=31536000, immutable" --no-progress >/dev/null
  aws s3 cp apps/editor/dist/index.html "s3://$EDITOR_BUCKET/index.html" --cache-control "no-cache" --no-progress >/dev/null
  aws s3 sync apps/editor/dist "s3://$EDITOR_BUCKET/" --delete --exclude index.html --no-progress >/dev/null # remove files the new build no longer has
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths /index.html / >/dev/null && echo "editor published, CDN refreshed"
fi

# images.env: the image tags the server runs; a partial deploy keeps the others as they were
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp infra/prod/server/* "$TMP/"
aws s3 cp "s3://$ASSETS/deploy/images.env" "$TMP/images.old" --no-progress >/dev/null 2>&1 || touch "$TMP/images.old"
for k in API_IMAGE WEB_IMAGE CADDY_IMAGE POSTGRES_IMAGE; do
  v="$(printf '%s\n' "${NEW[@]:-}" | grep "^$k=" || grep "^$k=" "$TMP/images.old" || true)"
  [ -n "$v" ] || { echo "$k has never been built: run  infra/prod/deploy.sh   (everything) once"; exit 1; }
  echo "$v"
done > "$TMP/images.env"
rm -f "$TMP/images.old"
if has api || has web || has server || has config; then
  aws s3 sync "$TMP" "s3://$ASSETS/deploy/" --delete --exact-timestamps --no-progress >/dev/null
  echo "== starting on the server"
  CMD_ID="$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript --comment "slidesdone deploy $TAG" \
    --parameters 'commands=["bash -c \"aws s3 sync s3://'"$ASSETS"'/deploy/ /opt/slidesdone/ --region '"$AWS_REGION"' --exact-timestamps --no-progress && chmod +x /opt/slidesdone/*.sh && /opt/slidesdone/server-deploy.sh\""]' \
    --timeout-seconds 1200 --query Command.CommandId --output text)"
  for _ in $(seq 1 120); do
    ST="$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)"
    case "$ST" in Success|Failed|Cancelled|TimedOut) break ;; esac; sleep 10
  done
  aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -40
  [ "$ST" = Success ] || { echo "Server step finished with status: $ST (the server rolled back to its last healthy images if it had any)"; exit 1; }
fi
echo "Done: $TAG"
