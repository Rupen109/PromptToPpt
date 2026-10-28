#!/usr/bin/env bash
# Starts the two production-shaped API instances the auth attack needs, runs it, stops them.
#   S :4010  strict limits, no trusted proxy, e-mail verification off
#   T :4011  one trusted proxy hop, e-mail verification ON (the production setting), e-mails readable in its log
set -u
cd "$(dirname "$0")/.."
LOGDIR=${LOGDIR:-/private/tmp/claude-502}
COMMON="RUN_WORKER=false AUTH_SIGNUPS_PER_IP_HOUR=6 AUTH_SIGNUPS_PER_IP_DAY=15 AUTH_SIGNIN_FAILS_PER_EMAIL=5 AUTH_SIGNIN_FAILS_PER_IP=30 AUTH_RESET_PER_EMAIL_HOUR=3 AUTH_RESET_PER_IP_HOUR=10"
env $COMMON PORT=4010 TRUSTED_PROXY_HOPS=0 REQUIRE_EMAIL_VERIFICATION=false npx tsx --env-file-if-exists=.env src/index.ts > "$LOGDIR/auth-s.log" 2>&1 &
S=$!
env $COMMON PORT=4011 TRUSTED_PROXY_HOPS=1 REQUIRE_EMAIL_VERIFICATION=true npx tsx --env-file-if-exists=.env src/index.ts > "$LOGDIR/auth-t.log" 2>&1 &
T=$!
trap 'kill $S $T 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null localhost:4010/api/auth/get-session && curl -s -o /dev/null localhost:4011/api/auth/get-session && break; sleep 1; done
LOG_T="$LOGDIR/auth-t.log" npx tsx --env-file-if-exists=.env scripts/attack-auth.ts
