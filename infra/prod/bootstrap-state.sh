#!/usr/bin/env bash
# Makes the S3 bucket that holds OpenTofu's state (run once; Sydney is this account's Region).
# Versioned (every state change can be recovered), encrypted, private. OpenTofu locks the state with a lock file in the same bucket.
#   infra/prod/bootstrap-state.sh
set -euo pipefail
PROFILE="${AWS_PROFILE:-goldenhour}"; REGION=ap-southeast-2
ACCOUNT_ID="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
BUCKET="slidesdone-tfstate-$ACCOUNT_ID"
if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then echo "$BUCKET already exists"; else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION" --profile "$PROFILE" >/dev/null
  echo "created $BUCKET"
fi
aws s3api put-public-access-block --bucket "$BUCKET" --profile "$PROFILE" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --profile "$PROFILE" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --profile "$PROFILE" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
echo "ready: versioned, encrypted, private"
