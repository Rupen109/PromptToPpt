# Test environment on AWS (Sydney): how it is built and run

Built 2026-10-31. Domain `slidesdone.app` (bought at Hostinger, 1 year, renews 2027-10-31 at ₹1,939). DNS lives in **Route 53**.

**Why Sydney:** the AWS *Free plan* account (461415799262) is locked by AWS to `ap-southeast-2`; EC2, RDS and secrets calls in other regions are refused ("explicit deny in a service control policy"). Certificates for CloudFront must be in us-east-1 and are allowed there. Credits: $100 until 2027-04-28 (+$20 per console task). Budget `slidesdone-monthly` ($80) mails rupenbhimani109@gmail.com at $20/$50/$80 actual and $50 forecast, counting spend before credits.

## What exists (code: `infra/tofu`, OpenTofu, local state)
| Part | What |
|---|---|
| Server | EC2 `t4g.micro` (1 GB, ARM) + 2 GB swap, 20 GB disk, fixed IP; ports 80/443 only; **no SSH** (AWS Session Manager); CPU credits mode `standard` |
| Runs (Docker Compose, `infra/compose`) | Caddy (HTTPS via Let's Encrypt), Postgres 16 (own container, nightly dump to S3 kept 30 days), API, website; memory limits 64/256/420/256 MB |
| Editor | static files in an S3 bucket behind CloudFront at `app.slidesdone.app` (created when `delegated = true`) |
| Hosts | `slidesdone.app` and `www` (website), `api.slidesdone.app` (API) point at the server IP; `app.` points at CloudFront |
| Pictures | S3 assets bucket (`ASSET_STORAGE=s3`) |
| Secrets | Parameter Store `/prompttoppt/test/*` (written by `infra/scripts/put-secrets.sh`, read by the server into `/opt/slidesdone/.env`) |
| Mail | MX to ImprovMX (free forwarding of support@ and similar), SPF and DMARC records; Brevo records through `extra_dns_records` |

## Run order
1. Registrar: set the 4 Route 53 nameservers (`tofu output nameservers`).
2. `infra/scripts/put-secrets.sh goldenhour test --from-env-file services/api/.env` (the owner, in a terminal; secrets never go through chat).
3. After delegation works: set `delegated = true` (`-var delegated=true`), `tofu plan`, then `tofu apply`. That creates the certificate, the CDN and the `app.` record.
4. `colima start`, then `infra/scripts/deploy.sh` (builds ARM images, pushes to ECR, starts on the server, runs migrations, publishes the editor). Partial runs: `deploy.sh api`, `web`, `editor`, `config`.
5. Reach the server: `aws ssm start-session --target <instance id> --profile goldenhour --region ap-southeast-2`.

## Known limits
- 1 GB is tight for API, website and Postgres together. Watch `free -m` and the budget mails; step up to `t4g.small` (2 GB) by changing `instance_type`.
- There is no CloudFront in front of the API or website yet, so no country header: prices use the default currency until an edge is added (`EDGE_SHARED_SECRET` is set but unused). Add it before real launch (see PRODUCTION_RELEASE_CHECKLIST).
- A single server means no failover; backups are nightly dumps only.
- OpenTofu state is a local file (`infra/tofu/terraform.tfstate`, git-ignored): back it up.
