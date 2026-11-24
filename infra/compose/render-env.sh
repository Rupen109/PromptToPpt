#!/bin/bash
# Builds /opt/slidesdone/.env from Parameter Store (secrets) plus the fixed settings of this environment. The file is readable by root only.
set -euo pipefail
cd /opt/slidesdone
source ./config.env
DOMAIN="$(cat domain.txt)"
umask 077
{
  echo "NODE_ENV=production"
  echo "PORT=4000"
  # the live site before the public launch (owner, 2026-11-24): Razorpay TEST keys, so not "production" (which needs live keys); at launch: APP_ENV=production, live keys, a fresh database
  echo "APP_ENV=staging"
  echo "DOMAIN=$DOMAIN"
  echo "API_URL=https://api.$DOMAIN"
  echo "WEB_URL=https://$DOMAIN"
  echo "EDITOR_URL=https://app.$DOMAIN"
  echo "COOKIE_DOMAIN=.$DOMAIN"
  echo "TRUSTED_PROXY_HOPS=1"
  echo "RUN_WORKER=true"
  echo "AI_PROVIDER=gemini" # Gemini through AI Studio, key GEMINI_API_KEY in Parameter Store
  # the PAID key (a Google project with billing): every model and AI pictures; Google bills real use
  echo "AI_KEY_TIER=paid"
  echo "COOKIE_PREFIX=slidesdone"
  # sign-up stays invite-only until the public launch (test payments + the paid AI key): SIGNUP_ALLOWED_EMAILS (addresses and @domains, comma separated) is stored in
  # Parameter Store and written below; remove it there to open sign-up
  echo "ASSET_STORAGE=s3"
  echo "ASSET_BUCKET=$ASSETS_BUCKET"
  echo "ASSET_REGION=$AWS_REGION"
  echo "REQUIRE_EMAIL_VERIFICATION=true"
  echo "NEXT_TELEMETRY_DISABLED=1"
  aws ssm get-parameters-by-path --region "$AWS_REGION" --path "/prompttoppt/$ENVNAME/" --with-decryption --recursive --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do echo "${name##*/}=$value"; done
} > .env.new
mv .env.new .env
PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD is missing in Parameter Store: run infra/scripts/put-secrets.sh first" >&2; exit 1; }
echo "DATABASE_URL=postgres://slidesdone:$PW@postgres:5432/slidesdone" >> .env
# the OpenRouter backup stays off until a real OpenRouter key is stored and checked (docs/AI_EDIT_V3_ARCHITECTURE.md, "AI provider")
sed -i '/^AI_BACKUP_PROVIDER=/d' .env
echo "AI_BACKUP_PROVIDER=none" >> .env
