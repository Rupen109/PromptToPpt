# Production on AWS (Sydney): how it is built and run

Design and costs: `docs/AWS_ARCHITECTURE.md`. Code: `infra/prod/` (OpenTofu in `tofu/`, server files in `server/`, images in `images/`).
The test environment (`infra/tofu`, `infra/compose`, `infra/scripts/deploy.sh`) is in the same account and the same Region (Sydney, the only Region this account can use: AWS fixes it from the contact country for accounts made with the "new" sign-up; checked 2026-11-05). It keeps running until the cutover and is removed a week after it.
`infra/tofu` also holds the Route 53 zone and the mail and Search Console records; those stay there.

## What is where

| Part | Where |
|---|---|
| Entry for every visitor | CloudFront: `slidesdone.app` + `www` (website), `app.` (editor), `api.` (API); one ACM certificate (us-east-1) |
| Editor files | private S3 bucket `slidesdone-prod-editor-…`, read only by CloudFront |
| Server | EC2 `t4g.small` in Sydney, own VPC, reachable only from CloudFront (port 443), no SSH (Session Manager) |
| On the server | Docker Compose: Caddy (origin HTTPS, refuses requests without `X-Origin-Verify`), website, API, deck worker, Postgres 16 |
| Database | Postgres on its own EBS disk (`/data`), WAL shipped to S3 every minute, base backup daily, 14-day point-in-time restore; disk snapshots daily (7 kept) |
| Pictures | S3 `slidesdone-prod-assets-…` (versioned) |
| Backups | S3 `slidesdone-prod-backups-…` (the server can write, not delete) |
| Secrets | Parameter Store `/prompttoppt/prod/*` (Sydney) |
| Images | ECR `slidesdone-prod/{api,web,caddy,postgres}`, tagged by git commit, immutable |
| Alarms | CloudWatch → e-mail: host failure (auto-recover), OS frozen (auto-reboot), CPU credits low, CPU high |
| State | S3 `slidesdone-tfstate-…` (versioned, locked) |

Why the origin works this way: CloudFront forwards the visitor's Host header, because AWS's only managed policy that passes the visitor's IP and country (`AllViewerAndCloudFrontHeaders-2022-06`) includes it. So Caddy answers for the public names with Let's Encrypt certificates obtained through the DNS challenge (the server may write only `_acme-challenge` TXT records). Checked locally on 2026-11-04: without the secret every name answers 403; with it the website and API answer.

## Order of work

`[you]` = done by the owner in the AWS console or a terminal. `[claude]` = run by Claude after the owner's yes; every `tofu apply` is shown as a plan first.

### 0. Before anything
1. `[claude]` Fresh backup of the test database (`backup.sh` on the test server).
2. `[you]` **Upgrade the AWS account to the Paid plan** — done 2026-11-04 (plan PAID, credit carried over). A Free-plan account closes itself on 2027-04-28.
3. **Region: Sydney (decided 2026-11-05).** Mumbai would need "Activate advanced features" (irreversible; you become administrator of the AWS Organization and the spend limit is removed) plus an edit of the organization's Region policy; the owner chose not to. All checks of the services this plan needs were run in Sydney on 2026-11-05 and work (EC2 `t4g.small` and `t4g.medium`, Spot prices, EBS snapshots lifecycle, SNS, CloudWatch, ECR, S3, Parameter Store, IAM, ACM in us-east-1, CloudFront, Route 53).
4. `[you]` **Search Console**: the TXT record is live. Click **Verify**, then Sitemaps → submit `https://slidesdone.app/sitemap.xml`.

### 1. Requests to AWS (only if needed)
1. Nothing to request for timeouts: this account's CloudFront quota "Response timeout per origin" (L-AECE9FA7) is already **120 s** (read 2026-11-04), and the API distribution uses 120. (One AI call can take up to 60 s; a retry more.)
2. If step 3 below fails with "Your account must be verified before you can add new CloudFront resources": `[you]` open a support case, type **Account and billing**, and paste that message. AWS community reports say up to about 2 days.

### 2. Secrets for production
`[you]` in a terminal (values are never printed):
```
infra/prod/copy-secrets-from-test.sh
```
It copies `/prompttoppt/test/*` to `/prompttoppt/prod/*` (same `AUTH_SECRET`, so nobody is signed out; same Razorpay webhook secret) and generates `REVALIDATE_SECRET`. Production-only values later: `infra/scripts/put-secrets.sh goldenhour prod`.

### 3. Build the production stack (the site keeps running on the test server)
1. `[claude]` Preview without creating anything: `cd infra/prod/tofu && tofu init -backend=false && tofu plan` (needs step 2 done; it only reads).
2. `[claude]` `infra/prod/bootstrap-state.sh` (state bucket), then `tofu init -migrate-state` and `tofu plan` → owner says yes → `tofu apply` (`cutover = false`: nothing public changes).
3. `[you]` Confirm the e-mail "AWS Notification - Subscription Confirmation" (alarms).
4. `[you]` GitHub → Settings → Secrets and variables → Actions: add `AWS_PROD_ACCESS_KEY_ID` and `AWS_PROD_SECRET_ACCESS_KEY`:
   `cd infra/prod/tofu && tofu output -raw github_deploy_access_key_id | pbcopy` (then the secret key the same way).

### 4. First deploy and checks
1. `[claude]` `colima start && infra/prod/deploy.sh` (all images, the editor, the server files).
2. `[claude]` Caddy's certificates: `docker compose logs caddy | grep -i "certificate obtained"` through Session Manager.
3. `[claude]` Test through CloudFront before DNS changes: `curl --resolve slidesdone.app:443:<edge ip> https://slidesdone.app/` and the same for `api.` (`/health`) and `app.` (edge ip from `dig +short <cloudfront domain>`; domains from `tofu output cloudfront_domains`).

### 5. Rehearsal (the test site keeps running)
1. `[claude]` `infra/prod/migrate-from-test.sh`: pictures copied, the test database dumped and loaded on the production server.
2. `[claude]` Restore test on the server: `sudo /opt/slidesdone/restore-db.sh` (latest point), check the row counts, then the app comes back.
3. `[claude]` Browser check through `/etc/hosts` pointing the four names at a CloudFront edge address: sign in with the owner's account, open a deck, make one, export.

### 6. Cutover (a few minutes of downtime; announce it)
1. `[claude]` `infra/prod/migrate-from-test.sh --final` (stops the test site's app, final dump and load).
2. `[claude]` `tofu apply -var cutover=true` (plan shown first): `slidesdone.app`, `www`, `app`, `api` now point at CloudFront.
3. `[claude]` In `infra/tofu`, replace the four old records with `removed` blocks so the test state forgets them without deleting them:
   ```hcl
   removed {
     from = aws_route53_record.apex
     lifecycle { destroy = false }
   }
   ```
   (the same for `aws_route53_record.www`, `aws_route53_record.api`, `aws_route53_record.app_server`), then `tofu apply` there.
4. `[claude]` `LIVE_EMAIL=… LIVE_PASSWORD=… node e2e/live-smoke.mjs` against the live site.
5. Rollback, if needed: `tofu apply -var cutover=false` does not restore the old records (they were overwritten); restore them by applying `infra/tofu` without the `removed` blocks, which points the names back at the test server (start its app again first).

### 7. One week later
1. `[claude]` Remove the test server, its buckets (after copying anything still needed) and `infra/compose`, `infra/scripts/deploy.sh`, `.github/workflows/deploy.yml`. `infra/tofu` keeps only the zone, mail and Search Console records.
2. `[you]` Billing → Budgets: set the existing `slidesdone-monthly` budget to the new expected bill (about $20–30).

## Everyday operations
- **Deploy:** GitHub → Actions → "Deploy (production)", or `infra/prod/deploy.sh [api] [web] [editor] [server] [config]`. A deploy whose services are not healthy within about 2 minutes goes back to the last healthy images by itself.
- **Reach the server:** `aws ssm start-session --target <server_instance_id> --profile goldenhour --region ap-southeast-2`.
- **Logs:** `cd /opt/slidesdone && sudo docker compose --env-file .env --env-file images.env logs --tail 200 api` (rotated, kept on the server).
- **Restore the database to a moment:** `sudo /opt/slidesdone/restore-db.sh "2026-12-01 14:30:00+00"` (UTC). The previous data folder is kept aside.
- **Backups:** `sudo /opt/slidesdone/backup-base.sh` runs a base backup now and lists the latest ones.
- **Switch to production mode at launch:** store `APP_ENV=production` (and live Razorpay keys) in `/prompttoppt/prod/`, then deploy `config`.
- **Grow:** follow the scale triggers in `docs/AWS_ARCHITECTURE.md`; a bigger server is `-var instance_type=t4g.medium` (a stop and start, about 2 minutes).

## Known limits
- One server: if it fails, EC2 recovers it, but the site is down for those minutes.
- The first boot needs S3 working: Postgres ships WAL from its first minute, and a Postgres that cannot ship WAL cannot finish its first start (seen in the local test).
- CloudFront waits at most 120 s for an API answer (the account quota). A longer wait needs a Service Quotas request for "Response timeout per origin".
- Changing the editor's Content-Security-Policy: edit `scripts/csp.mjs`, regenerate `infra/prod/tofu/generated/` (command in `scripts/gen-security-headers.mjs`), `tofu apply`.
