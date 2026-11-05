#!/usr/bin/env bash
# Copies the app's secrets from the test environment (/prompttoppt/test/*) to production (/prompttoppt/prod/*), both in Sydney, as encrypted SecureStrings.
# Values go from one AWS call to the next and are never printed or written to a file.
# Keeping AUTH_SECRET means nobody is signed out by the move; keeping the Razorpay webhook secret means the webhook keeps working.
# Run it yourself in a terminal:   infra/prod/copy-secrets-from-test.sh
# Afterwards, add or change production-only values with:   infra/scripts/put-secrets.sh goldenhour prod
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-goldenhour}" AWS_PAGER="" AWS_DEFAULT_REGION=ap-southeast-2
FROM=/prompttoppt/test; TO=/prompttoppt/prod
names="$(aws ssm get-parameters-by-path --path "$FROM" --recursive --query 'Parameters[].Name' --output text | tr '\t' '\n')"
[ -n "$names" ] || { echo "nothing under $FROM"; exit 1; }
for n in $names; do
  short="${n##*/}"
  if aws ssm get-parameter --name "$TO/$short" >/dev/null 2>&1; then echo "  kept   $TO/$short (already set)"; continue; fi
  aws ssm put-parameter --name "$TO/$short" --type SecureString \
    --value "$(aws ssm get-parameter --name "$n" --with-decryption --query Parameter.Value --output text)" >/dev/null
  echo "  copied $TO/$short"
done
# a value production needs that the test environment may not have
if ! aws ssm get-parameter --name "$TO/REVALIDATE_SECRET" >/dev/null 2>&1; then
  aws ssm put-parameter --name "$TO/REVALIDATE_SECRET" --type SecureString --value "$(openssl rand -hex 32)" >/dev/null && echo "  generated $TO/REVALIDATE_SECRET"
fi
echo "Done. Names under $TO (values not shown):"
aws ssm get-parameters-by-path --path "$TO" --query 'Parameters[].Name' --output text | tr '\t' '\n' | sed 's/^/  /'
