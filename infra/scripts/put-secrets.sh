#!/usr/bin/env bash
# Stores the app's secrets in AWS Systems Manager Parameter Store as encrypted SecureStrings (standard parameters are free).
# Run it yourself in a terminal. Values are typed silently, never printed, never written to a file, never sent to chat.
#
#   infra/scripts/put-secrets.sh <aws-profile> [environment] [--from-env-file services/api/.env]
#   e.g. infra/scripts/put-secrets.sh goldenhour test --from-env-file services/api/.env
#
# Names: /prompttoppt/<environment>/<NAME>.  Existing values are kept unless you confirm an overwrite.
set -euo pipefail

PROFILE="${1:-}"; ENVNAME="${2:-test}"; ENVFILE=""
case "$ENVNAME" in --*) echo "put the environment name before options, e.g. $0 goldenhour test --from-env-file services/api/.env"; exit 1 ;; esac
[ -n "$PROFILE" ] || { echo "usage: $0 <aws-profile> [environment] [--from-env-file path]"; exit 1; }
shift $(( $# >= 2 ? 2 : 1 )) || true
while [ $# -gt 0 ]; do case "$1" in --from-env-file) ENVFILE="${2:-}"; shift 2 ;; *) echo "unknown option $1"; exit 1 ;; esac; done
command -v aws >/dev/null || { echo "aws CLI is not installed"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is not installed"; exit 1; }
aws sts get-caller-identity --profile "$PROFILE" >/dev/null || { echo "Cannot use AWS profile '$PROFILE'. Run: aws configure --profile $PROFILE"; exit 1; }
PREFIX="/prompttoppt/$ENVNAME"

exists() { aws ssm get-parameter --profile "$PROFILE" --name "$PREFIX/$1" >/dev/null 2>&1; }
store() { # name value
  aws ssm put-parameter --profile "$PROFILE" --name "$PREFIX/$1" --type SecureString --overwrite --value "$2" >/dev/null
  echo "  stored $PREFIX/$1"
}
fromfile() { # name -> value from the env file, or empty
  [ -n "$ENVFILE" ] && [ -f "$ENVFILE" ] || return 0
  grep -E "^$1=" "$ENVFILE" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
}
ask() { # name  label  mode(required|optional|generate)  [hint]
  local name="$1" label="$2" mode="$3" hint="${4:-}" val=""
  if exists "$name"; then
    read -r -p "$name already exists. Overwrite? [y/N] " yn; [ "$yn" = "y" ] || { echo "  kept $name"; return 0; }
  fi
  if [ "$mode" = "generate" ]; then store "$name" "$(openssl rand -hex 32)"; return 0; fi
  val="$(fromfile "$name")"
  if [ -n "$val" ]; then
    read -r -p "$label: found in $ENVFILE — use it? [Y/n] " yn
    if [ "$yn" != "n" ]; then store "$name" "$val"; return 0; fi
  fi
  [ -n "$hint" ] && echo "  ($hint)"
  while true; do
    read -r -s -p "$label$( [ "$mode" = optional ] && echo ' (Enter to skip)'): " val; echo
    if [ -n "$val" ]; then store "$name" "$val"; return 0; fi
    if [ "$mode" = optional ]; then echo "  skipped $name"; return 0; fi
    echo "  this one is required"
  done
}

echo "Storing secrets for environment '$ENVNAME' with AWS profile '$PROFILE'."
echo "Generated automatically (you never see them):"
ask AUTH_SECRET "AUTH_SECRET" generate
ask EDGE_SHARED_SECRET "EDGE_SHARED_SECRET" generate
ask RAZORPAY_WEBHOOK_SECRET "RAZORPAY_WEBHOOK_SECRET" generate
echo "RAZORPAY_WEBHOOK_SECRET was generated: copy the SAME value into the Razorpay dashboard webhook later (I will show you how to read it back safely)."
echo
echo "Typed by you (hidden as you type):"
ask OPENROUTER_API_KEY "OpenRouter API key" required "needed for AI in the test environment"
ask RAZORPAY_KEY_ID "Razorpay key id (rzp_test_...)" required "TEST keys only for the test environment"
ask RAZORPAY_KEY_SECRET "Razorpay key secret" required
ask RESEND_API_KEY "Resend API key" optional "needed for sign-up and password emails; skip until you have one"
ask EMAIL_FROM "Sender address, e.g. SlidesDone <hello@yourdomain.com>" optional
ask UNSPLASH_ACCESS_KEY "Unsplash access key" optional
ask PEXELS_API_KEY "Pexels API key" optional
ask TURNSTILE_SECRET_KEY "Cloudflare Turnstile secret" optional
ask GOOGLE_CLIENT_ID "Google sign-in client id" optional
ask GOOGLE_CLIENT_SECRET "Google sign-in client secret" optional
echo
echo "Done. Names stored (values are not shown):"
aws ssm get-parameters-by-path --profile "$PROFILE" --path "$PREFIX" --query 'Parameters[].Name' --output text | tr '\t' '\n' | sed 's/^/  /'
