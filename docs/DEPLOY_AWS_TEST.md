# QA environment on AWS (Sydney): how it is built and run

**Since 2026-11-24 (evening) this server is THE live site**: https://slidesdone.app (`www.` sends on to it, `app.`, `api.`), t4g.small, deployed from `master` after the owner's approval, the paid Gemini key, Razorpay test keys and invite-only sign-up until the public launch. There is no QA server any more. Branches, releases and the launch steps: `docs/RELEASES.md`. (The QA-era notes below are history.)

Built 2026-10-31 as the test environment. Domain `slidesdone.app` (bought at Hostinger, 1 year, renews 2027-10-31 at ₹1,939). DNS lives in **Route 53**.

**Why Sydney:** the AWS *Free plan* account (461415799262) is locked by AWS to `ap-southeast-2`; EC2, RDS and secrets calls in other regions are refused ("explicit deny in a service control policy"). Certificates for CloudFront must be in us-east-1 and are allowed there. Credits: $100 until 2027-04-28 (+$20 per console task). Budget `slidesdone-monthly` ($80) mails rupenbhimani109@gmail.com at $20/$50/$80 actual and $50 forecast, counting spend before credits.

## What exists (code: `infra/tofu`, OpenTofu, local state)
| Part | What |
|---|---|
| Server | EC2 `t4g.micro` (1 GB, ARM) + 2 GB swap, 20 GB disk, fixed IP; ports 80/443 only; **no SSH** (AWS Session Manager); CPU credits mode `standard` |
| Runs (Docker Compose, `infra/compose`) | Caddy (HTTPS via Let's Encrypt), Postgres 16 (own container, nightly dump to S3 kept 30 days), API, website; memory limits 64/256/420/256 MB |
| Editor | static files in an S3 bucket behind CloudFront at `app.slidesdone.app` (created when `delegated = true`) |
| Hosts | `qa.slidesdone.app` (website), `api.qa.slidesdone.app` (API) and `app.qa.slidesdone.app` (editor, served by Caddy while `use_cloudfront = false`) point at the server IP. Until 2026-11-24 it used the bare domain, `www`, `api.` and `app.`, which are production's now |
| Pictures | S3 assets bucket (`ASSET_STORAGE=s3`) |
| Secrets | Parameter Store `/prompttoppt/test/*` (written by `infra/scripts/put-secrets.sh`, read by the server into `/opt/slidesdone/.env`) |
| Mail | MX to ImprovMX (free forwarding of support@ and similar), SPF and DMARC records; Brevo records through `extra_dns_records` |

## Run order
1. Registrar: set the 4 Route 53 nameservers (`tofu output nameservers`).
2. `infra/scripts/put-secrets.sh goldenhour test --from-env-file services/api/.env` (the owner, in a terminal; secrets never go through chat).
3. After delegation works: set `delegated = true` (`-var delegated=true`), `tofu plan`, then `tofu apply`. That creates the certificate, the CDN and the `app.` record.
4. `colima start`, then `infra/scripts/deploy.sh` (builds ARM images, pushes to ECR, starts on the server, runs migrations, publishes the editor). Partial runs: `deploy.sh api`, `web`, `editor`, `config`.
5. Reach the server: `aws ssm start-session --target <instance id> --profile goldenhour --region ap-southeast-2`.

## Deploying
- **From GitHub:** every push to the `qa` branch (CI first), or by hand: Actions -> "Deploy (QA)" -> Run workflow (choose everything, api, web, editor or config). Uses repository secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` of the limited IAM user `slidesdone-test-github-deploy` (this Free-plan account blocks the passwordless OIDC login; rotate the key from `infra/tofu`: `tofu apply -replace=aws_iam_access_key.github_deploy`, then update the two secrets). Builds on a GitHub ARM runner, about 10-15 minutes.
- **From the Mac:** `colima start`, then `infra/scripts/deploy.sh [api] [web] [editor] [config]`.
- First live deploy: 2026-10-31. Checked in a real browser: home, pricing, login, signup and the editor's login redirect load over HTTPS; containers up, 417 of 910 MB used.

- **AI on QA:** a FREE-tier Gemini key (`AI_KEY_TIER=free`, key `GEMINI_API_KEY` in Parameter Store = the "SlidesDone QA" key from a Google project with no billing). The paid OpenRouter backup is always off on QA (`render-env.sh` writes `AI_BACKUP_PROVIDER=none`). What the free tier allows and what is switched off: `docs/QA_AND_RELEASES.md`.
- **Live check after a deploy:** `LIVE_EMAIL=<verified account> LIVE_PASSWORD=... node e2e/live-smoke.mjs` runs 16 checks through a real browser (pages, login, scratch editor, pictures in S3, share link, support form, AI). It tests what a free-plan person can do.

## Lessons (deploy)
- **`aws s3 sync` skips same-sized files** unless the local copy is newer. The image list (`images.env`) is always the same size (every tag has the same length), so on 2026-11-02 the server kept the 31 Oct list, tried to pull an image the registry had already expired (it keeps the last 5) and the deploy failed with "manifest unknown". Every server-side download now uses `--exact-timestamps` (`deploy.sh`, `server-deploy.sh`). Any new sync from S3 to a machine must too.
- To see what a server runs: `aws ssm send-command` with `cat /opt/slidesdone/images.env; docker ps`.

## Known limits
- 1 GB is tight for API, website and Postgres together. Watch `free -m` and the budget mails; step up to `t4g.small` (2 GB) by changing `instance_type`.
- There is no CloudFront in front of the API or website yet, so no country header: prices use the default currency until an edge is added (`EDGE_SHARED_SECRET` is set but unused). Add it before real launch (see PRODUCTION_RELEASE_CHECKLIST).
- A single server means no failover; backups are database dumps only, twice a day (02:30 and 13:00 India time).
- OpenTofu state is a local file (`infra/tofu/terraform.tfstate`, git-ignored): back it up.

## Review account for Razorpay (international payments)

Razorpay asks for a login to review the site. The account is made by the owner, not through the sign-up form (the site is invite-only, and the form would e-mail a confirmation link): it is created verified, as a plain Starter account, with the first-visit question answered. Code: `services/api/src/admin/review-account.ts`; the command is built into the API image as `dist/review-account.js`.

1. The password lives in `services/api/.env` as `Razorpay_Test` (at least 10 characters). It is never typed into a command or shown.
2. Put it in Parameter Store: `infra/scripts/put-secrets.sh goldenhour test --from-env-file services/api/.env` and answer **y** for `Razorpay_Test` (keep the others).
3. Refresh the server's settings: `infra/scripts/deploy.sh config`.
4. Create the account on the server (through `aws ssm start-session`, or `send-command`):
   `cd /opt/slidesdone && docker compose --env-file .env --env-file images.env run --rm api node dist/review-account.js razorpayreviewer@slidesdone.app Razorpay_Test`
5. Running step 4 again only resets the password. Locally: `pnpm --filter @prompttoppt/api review-account razorpayreviewer@slidesdone.app Razorpay_Test`.

