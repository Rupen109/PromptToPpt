#!/bin/bash
# Builds the settings files from Parameter Store (secrets) plus the fixed settings of this environment. Both files are readable by root only.
#   .env        the API, the worker and compose itself (image tags come from images.env)
#   .env.caddy  only what Caddy needs (it never sees the app's secrets)
set -euo pipefail
cd /opt/slidesdone
source ./config.env # ENVNAME, AWS_REGION, ASSETS_BUCKET, BACKUPS_BUCKET, DOMAIN, HOSTED_ZONE_ID, APP_ENV, ACME_EMAIL (written by the server's first boot)
umask 077
{
  echo "NODE_ENV=production"
  echo "PORT=4000"
  echo "APP_ENV=$APP_ENV"
  echo "DOMAIN=$DOMAIN"
  echo "API_URL=https://api.$DOMAIN"
  echo "WEB_URL=https://$DOMAIN"
  echo "EDITOR_URL=https://app.$DOMAIN"
  echo "COOKIE_DOMAIN=.$DOMAIN"
  # one proxy (Caddy) in front of the API; behind CloudFront the visitor's IP comes from CloudFront-Viewer-Address (checked with EDGE_SHARED_SECRET)
  echo "TRUSTED_PROXY_HOPS=1"
  echo "AI_PROVIDER=gemini" # Gemini through AI Studio (key GEMINI_API_KEY in Parameter Store; vertex only with a Vertex AI key); a value stored there (e.g. AI_PROVIDER=openrouter) overrides it, it is written later in this file
  echo "ASSET_STORAGE=s3"
  echo "ASSET_BUCKET=$ASSETS_BUCKET"
  echo "ASSET_REGION=$AWS_REGION"
  echo "REQUIRE_EMAIL_VERIFICATION=true"
  echo "NEXT_TELEMETRY_DISABLED=1"
  # blog / news changes refresh the website's cache directly inside the server's network (not through CloudFront)
  echo "WEB_REVALIDATE_URL=http://web:3000/api/revalidate-content"
  echo "BACKUPS_BUCKET=$BACKUPS_BUCKET"
  echo "AWS_REGION=$AWS_REGION"
  aws ssm get-parameters-by-path --region "$AWS_REGION" --path "/prompttoppt/$ENVNAME/" --with-decryption --recursive --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do echo "${name##*/}=$value"; done
} > .env.new
get() { grep "^$1=" .env.new | tail -n1 | cut -d= -f2-; }
PW="$(get POSTGRES_PASSWORD)"; EDGE="$(get EDGE_SHARED_SECRET)"
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD is missing in Parameter Store /prompttoppt/$ENVNAME/: run infra/scripts/put-secrets.sh first" >&2; exit 1; }
[ -n "$EDGE" ] || { echo "EDGE_SHARED_SECRET is missing in Parameter Store /prompttoppt/$ENVNAME/: run infra/scripts/put-secrets.sh first" >&2; exit 1; }
echo "DATABASE_URL=postgres://slidesdone:$PW@postgres:5432/slidesdone" >> .env.new
mv .env.new .env
{
  echo "DOMAIN=$DOMAIN"
  echo "ACME_EMAIL=$ACME_EMAIL"
  echo "HOSTED_ZONE_ID=$HOSTED_ZONE_ID"
  echo "EDGE_SHARED_SECRET=$EDGE"
  echo "AWS_REGION=$AWS_REGION"
} > .env.caddy
