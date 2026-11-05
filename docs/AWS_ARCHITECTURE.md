# AWS architecture: final plan (2026-11-04)

Status: **final plan; code written 2026-11-04 (`infra/prod/`), applied step by step after the owner's yes on each `tofu plan`.** Runbook: `docs/DEPLOY_AWS_PROD.md`. Replaces the test setup in `docs/DEPLOY_AWS_TEST.md`.

Every price is a list price from the AWS Pricing API (read 2026-11-04, 730 hours a month) or from AWS's own pages (sources at the end). Measured numbers say "measured". Estimates say "assumed" and show their assumptions.

---

## 1. Decisions

| Question | Decision | Why |
|---|---|---|
| Region | **Sydney (`ap-southeast-2`)** | the only Region this account can use: AWS fixes it from the contact country for accounts made with the "new" sign-up (India → Sydney) and the Paid plan does not change it (AWS docs: "You cannot modify your AWS Region"). Mumbai would be $7.30 a month cheaper for the same server and about 130 ms closer to visitors in India, but it needs "Activate advanced features" (irreversible) and a Region-policy edit; the owner chose not to (2026-11-05). |
| AWS account | **Paid plan (done 2026-11-04)** | a Free-plan account closes itself when the plan ends (2027-04-28) or the credit runs out; the $137.62 credit carried over |
| Frontend | **on AWS behind CloudFront**: website on the server, editor in S3 | about $0 extra at 30,000 active users (section 5); Vercel's free plan forbids commercial use and Pro adds $20 a month |
| Server | **one EC2 `t4g.small` (2 GB, ARM)** | free for 750 hours a month until 2026-12-31 (AWS T4g trial); the upload parser needs about 1 GB on its own |
| Database | **Postgres on the server, on its own disk, with point-in-time backups**; RDS when a trigger fires | RDS adds $18 a month from day one; backups to S3 cost cents |
| Not chosen | Lightsail ($12 all-in) | about $3–6 cheaper, but AWS does not document IAM roles or a CloudFront-only firewall for it, and it has its own network |
| Not chosen | load balancer, NAT gateway, Multi-AZ, Fargate | $18–43 a month each with nothing to gain at one server |

## 2. Today (verified live 2026-11-04)
One `t4g.micro` (1 GB) in Sydney runs Caddy, the website, the API with the deck worker inside, the editor's files and Postgres. No CloudFront. The origin is open to the internet. Backups run nightly. Measured cost: **$16 a month** before credits.

## 3. Target architecture

```
                         Route 53 (DNS for slidesdone.app, global)
                                        │
                 CloudFront (3 distributions, global edge, HTTPS)
     ┌────────────────────────┬─────────────────────────┬──────────────────────────┐
 slidesdone.app, www     app.slidesdone.app          api.slidesdone.app
 website                 editor                      API
 caches /_next/static     origin: S3 editor bucket    no caching, except pictures
 and pages by their own   (private, Origin Access     (/api/v1/assets/*: public, immutable)
 Cache-Control            Control), SPA fallback      adds X-Origin-Verify + viewer country
     └─────────────────────────────┬───────────────────────────────┘
                          origin.slidesdone.app
                                   │  security group: TCP 443 only from CloudFront's address list
     EC2 t4g.small (Sydney), our own VPC, public subnet, no NAT, no SSH (Session Manager)
       Caddy ─ origin HTTPS; refuses any request without X-Origin-Verify
       web (Next.js)  ·  api  ·  worker  ·  Postgres 16
       disk 1: root 20 GB (throw-away)   disk 2: data 20 GB (Postgres only, daily snapshots)

 S3 (Sydney): editor files · assets (pictures, private) · backups (own bucket; server can write, not delete)
 Backups: Postgres WAL archived continuously + daily base backup → point-in-time restore
 ECR: api and web images tagged by git SHA (immutable) · Parameter Store: secrets
 CloudWatch: status-check alarm with auto-recover, CPU / memory / disk alarms · AWS Budgets e-mails
 GitHub Actions: build ARM images → ECR → deploy over Session Manager → health check → roll back
```

How the parts work together:
- **Front door.** Every visitor reaches CloudFront, never the server. Data from AWS origins to CloudFront is free (AWS pricing page). CloudFront adds the visitor's country (`countryFromHeaders` already reads it, so India pricing starts working) and the shared secret `X-Origin-Verify`.
- **Caching follows the app's own headers.** The API marks pictures `public, max-age=31536000, immutable` and every other answer `private, no-store`, so CloudFront caches only what is safe. Blog and news pages are cached 60 s by the website itself.
- **Live features.** Live streams send a heartbeat every 20 s, under CloudFront's 30 s origin read timeout.
- **Client IP.** Caddy drops a forwarded `X-Forwarded-For` from untrusted senders (Caddy docs). The API reads `CloudFront-Viewer-Address` when `X-Origin-Verify` is valid, so rate limits stay per person (built, tested).
- **Origin certificates.** AWS's only managed policy that passes the visitor's IP and country (`AllViewerAndCloudFrontHeaders-2022-06`) also forwards the Host header, and the origin certificate must then match that name (CloudFront docs). So Caddy answers for the public names with Let's Encrypt certificates obtained through the **DNS challenge** in Route 53 (Caddy built with `caddy-dns/route53`; the server may write only `_acme-challenge` TXT records). No port 80 is open.
- **Deck worker** runs as its own container (`RUN_WORKER=false` for `api`). That keeps deck building away from page requests and lets it move to its own server with one setting.
- **Data safety.** Losing the server loses at most minutes of data: the data disk survives, snapshots run daily, and WAL in S3 allows a point-in-time restore. A restore is tested once before launch.
- **Search engines.** `robots.txt` and `sitemap.xml` are live already. The editor has `noindex, nofollow`. `origin.` answers nothing without the secret.

## 4. Scale triggers (from our own metrics, never from guesses)

| Signal | Action | Extra a month (Sydney, list prices) |
|---|---|---|
| deck queue wait p95 above the plan targets, or server memory above 75% for a day | worker moves to its own `t4g.medium` (Spot, since the account is on the Paid plan) | about **$17–22** on Spot (instance $11.5–16.2 + disk $1.92 + IP $3.65); $36.52 on-demand |
| database CPU above 60%, or the backups need to be hands-off | Postgres → RDS `db.t4g.micro`, private subnet, 7-day point-in-time restore | +$21.01 (instance $18.25 + 20 GB $2.76), −$1.92 (the data disk is no longer needed) = **+$19.09** |
| API CPU above 60% for an hour, or p95 above 500 ms | server to `t4g.medium`; past that, two API servers behind a load balancer | +$15.47; load balancer $18.40+ |
| attacks or abuse | API distribution on CloudFront Pro flat rate (WAF, DDoS, logs, 10M requests, no overage) | $15 |
| database connections above 70% of the limit | RDS `db.t4g.small`, PgBouncer / RDS Proxy | +$18.98 over the micro |

## 5. Frontend cost at 25,000–30,000 active users (assumed traffic)

Measured: a website first visit is **0.55 MB and 22 requests** (home page, 2026-11-04). The editor is **0.6 MB compressed** and its script files are cached for a year.
Assumed: 2 website visits per active user a month, at 0.8 MB and 35 requests each (some pages need more). Editor: 1.5 MB and 40 requests per active user a month (first load plus reloads after deploys).

| | Website | Editor | Together |
|---|---|---|---|
| Data | 40–48 GB | 38–45 GB | **78–93 GB** |
| Requests | 1.75–2.1M | 1.0–1.2M | **2.8–3.3M** |

CloudFront's always-free allowance is 1 TB and 10M requests a month, so the **frontend costs $0** on CloudFront. The website runs inside the server you pay for anyway. The editor's 2 MB in S3 costs nothing measurable.

## 6. Total AWS cost for the first three months (Sydney, list prices)

Unit prices (AWS Pricing API, Sydney): `t4g.small` $0.0212 / h, `t4g.medium` $0.0424 / h, Spot `t4g.medium` $0.0157 / h on 2026-11-05 (it moves), EBS gp3 $0.096 / GB-month, snapshots $0.055 / GB-month, RDS `db.t4g.micro` $0.025 / h + $0.138 / GB-month, public IPv4 $0.005 / h, alarms $0.10 each.

| | Month 1: 500 users | Month 2: 3,000–5,000 users | Month 3: 15,000–30,000 users |
|---|---|---|---|
| Server `t4g.small` | $15.48 | $15.48 | $15.48 |
| Disks (40 GB, then 20 GB once Postgres leaves) | $3.84 | $3.84 | $1.92 |
| Public IPv4 | $3.65 | $3.65 | $3.65 |
| Snapshots, 4 alarms, Route 53, S3, ECR | $2.75 | $2.75 | $2.75 |
| Deck worker on its own server (Spot, with disk and IP) | — | $0, or about $17–22 if its trigger fires | about $17–22 |
| RDS `db.t4g.micro` + 20 GB | — | — | $21.01 |
| CloudFront | $0 | $0 (about 2–3M requests) | $4–7 (13–16M requests; data about 200–245 GB, free) |
| **Total** | **about $26** | **about $26, or $43–48 with the worker split** | **about $66–74** |

- Until 2026-12-31 the `t4g.small` is free (750 hours a month, AWS free trial): subtract $15.48 from each month that falls before 2027-01-01. Month 1 is then about **$10**.
- Month 3 can reach **about $100–108** if the server (`t4g.medium`, +$15.47) and the database (`db.t4g.small`, +$18.98) both need their next size (section 4).
- Three months together: **about $117–147** (a worst case of about $196 needs every upgrade trigger to fire with an on-demand worker). The $137.62 credit covers the low case and most of the middle one. AWS's FAQ gives both 6 and 12 months for how long credits last, so check the credit's expiry date in Billing.
- Month 3 CloudFront assumes the editor request change in section 7. Without it, an idle editor makes about 420 requests an hour, and month 3 would be about 48M requests (about $46).
- Compared with the Mumbai version of this plan, Sydney costs about $7.30 a month more at Stage 1 (server) and a little more later (the RDS instance is $18.25 a month in Sydney against $15.33 in Mumbai).
- Not AWS, but larger: AI costs about $0.018 a deck (measured). 90,000 decks a month would be about $1,620.

## 7. What changes in the code and infrastructure

| Area | Change |
|---|---|
| `infra/tofu` | Region `ap-southeast-2` (Sydney); own VPC (2 zones, public subnets, private DB subnets ready for RDS, no NAT); S3 state backend with locking; 3 CloudFront distributions + one ACM certificate (us-east-1); security group with one inbound rule, TCP 443 from `com.amazonaws.global.cloudfront.origin-facing` (counts as 55 of the default 60 rules); data EBS volume + daily snapshot policy; backups bucket; alarms with auto-recover; budgets; immutable ECR tags; Search Console TXT added to the apex TXT record (with SPF) |
| `infra/compose` | `worker` as its own service; Postgres data on the data disk; WAL archiving + daily base backup to S3; Caddy serves only `origin.` and checks `X-Origin-Verify`; editor removed from the server |
| API | `clientIp` reads `CloudFront-Viewer-Address` behind a valid `X-Origin-Verify`; `EDGE_SHARED_SECRET` set |
| Editor | built 2026-11-04: the server re-announces presence on its 20 s heartbeat (no 15 s keepalive from the browser); session checked on focus and when the tab becomes visible (no 30 s timer); comments polled only while the live channel is down; share-link analytics flushed every 30 s instead of 10 s (slide changes and leaving still report at once); security headers from a CloudFront response-headers policy generated from `scripts/csp.mjs` |
| Deploy | editor: S3 upload + CloudFront invalidation of `index.html`; images by git SHA; rollback on a failed health check |

## 8. Order of work (nothing user-visible breaks; each step can be undone)

0. **Owner:** upgrade the AWS account to the Paid plan (Billing → Upgrade plan). Take a fresh database backup first.
1. **Search Console:** add the `google-site-verification` TXT to the apex TXT record in `infra/tofu` (Route 53 is global, so this does not wait for anything else), apply, verify in Search Console, submit `https://slidesdone.app/sitemap.xml`.
2. State to S3; build the new VPC, buckets, ECR and secrets (in Sydney, next to the test environment).
3. Certificate + editor distribution. This also shows whether AWS lets this account create CloudFront distributions. Community answers report new accounts needing a support case under Account and billing (up to about 2 days). If blocked: open the case and continue with step 4.
4. New `t4g.small` with the data disk, WAL archiving and alarms; copy the database and pictures from the test server; one test restore.
5. Switch: editor, website and API behind CloudFront, origin locked. A few minutes of downtime, announced. Run `e2e/live-smoke.mjs`.
6. Editor request change and client-IP change (code, tests, deploy).
7. After a stable week: remove the test server and test buckets.

## 9. Known unknowns
- **CloudFront on this account:** only creating the first distribution shows whether AWS wants verification (step 3).
- **Spot prices move.** Sydney Spot for `t4g.medium` was $0.0157 / h on 2026-11-05 (earlier $0.0159–0.0222); the worker figures use that range.
- **Traffic per user** in section 5 is assumed. The first month's CloudFront and Cost Explorer reports replace the assumptions with measurements.

## Sources
- AWS Pricing API (`aws pricing get-products`), Sydney (and Mumbai for the comparison), 2026-11-04; Lightsail bundles (`aws lightsail get-bundles`); account plan (`aws freetier get-account-plan-state`: FREE, $137.84, ends 2027-04-28); Cost Explorer 2026-10-31 to 2026-11-04.
- [CloudFront pay-as-you-go pricing: always-free tier, free origin fetches from AWS](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/)
- [CloudFront flat-rate plans](https://aws.amazon.com/cloudfront/pricing/) and [developer guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
- [AWS Free and Paid account plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/)
- [EC2 T4g (t4g.small trial until 2026-12-31)](https://aws.amazon.com/ec2/instance-types/t4/), [EC2 FAQ](https://aws.amazon.com/ec2/faqs/)
- [AWS-managed prefix list weights](https://docs.aws.amazon.com/vpc/latest/userguide/working-with-aws-managed-prefix-lists.html)
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Lightsail FAQ](https://aws.amazon.com/lightsail/faq/)
- [Vercel fair use: Hobby is non-commercial](https://vercel.com/docs/limits/fair-use-guidelines)
- [re:Post: account verification for CloudFront](https://repost.aws/questions/QUwuoclRJlQ7Gw5qjrlTAi4w/aws-account-needs-to-be-verified-before-you-can-add-new-cloudfront-resources)
