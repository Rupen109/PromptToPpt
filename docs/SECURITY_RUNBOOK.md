# Security runbook — deploy, monitor, respond

> The consolidated go-live list (this runbook's must-haves plus billing, pictures, performance, legal) is [`PRODUCTION_RELEASE_CHECKLIST.md`](./PRODUCTION_RELEASE_CHECKLIST.md).

## 1. Production must-haves (the API refuses to boot without the first group)
| Setting | Why |
|---|---|
| `NODE_ENV=production`, `APP_ENV=production` (explicit), `TRUSTED_PROXY_HOPS` ≥ 1 (ALB = 1, CloudFront + ALB = 2) | correct client IPs for rate limits; no dev-only behaviour |
| `REQUIRE_EMAIL_VERIFICATION=true` + `RESEND_API_KEY` or `BREVO_API_KEY` + `EMAIL_FROM` | unverified accounts cannot sign in → no free-credit farming |
| `AUTH_SECRET` from `openssl rand -base64 48` | placeholders are rejected at boot |
| `AI_PROVIDER` ≠ `mock`; `ASSET_STORAGE=s3`; HTTPS URLs + `COOKIE_DOMAIN` | |
| `AI_BUDGET_USD_HOUR`, `AI_BUDGET_USD_DAY`, `AI_USER_USD_DAY` | the spend circuit breaker: your cloud bill has a ceiling |
| `LIVE_BUS=pg` (default in production) | live editing events reach every API task |
| `TURNSTILE_SECRET_KEY` (+ `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the web build) | CAPTCHA on sign-up and after repeated sign-in failures |
| Razorpay live keys + `RAZORPAY_WEBHOOK_SECRET` | webhook HMAC |

## 2. Edge (outside this repo)
* **CloudFront + AWS WAF** in front of API, web and editor: managed rule groups (Common, Known bad inputs, Bot Control), plus rate-based rules —
  `/api/auth/sign-up/*` 20 / 5 min / IP, `/api/auth/sign-in/*` 60 / 5 min / IP, everything else 2,000 / 5 min / IP.
* Editor static host: apply the generated headers — `API_URL=… WEB_URL=… EDITOR_URL=… node scripts/gen-security-headers.mjs` writes
  `apps/editor/security/{nginx.conf,_headers,cloudfront-response-headers-policy.json}`.
* Security group: API reachable only from the load balancer; database not public; S3 bucket private (assets are served by the API).
* Turn on S3 / RDS encryption, automated backups, and CloudTrail.

## 3. Monitoring & alerts (what to watch)
| Signal | Where | Alert when |
|---|---|---|
| `[budget] AI spend circuit breaker TRIPPED` | API log | any occurrence (page the owner) |
| 429 rate on `/api/auth/*` | ALB / WAF metrics | > 5% for 10 min (credential stuffing / sign-up flood) |
| `auth_attempt` rows by kind (`signup`, `signin_fail`) | DB | spikes vs. the 7-day baseline |
| Owner dashboard → AI cost per user / per hour | admin app | one user > $3/day |
| `billing.access_revoked` audit rows | `audit_log` | any (a refund or chargeback happened) |
| Unsplash 403/429 | API log | repeated (apply for Production access) |

## 4. Incident response (short form)
1. **Cost spike** — set the owner flag `maintenance_mode` (stops all AI immediately), find the account in the dashboard, disable it (`UPDATE "user" SET …` / delete sessions), lower the budgets, resume.
2. **Account-farming wave** — add the domains to `EXTRA_BLOCKED_EMAIL_DOMAINS`, tighten `AUTH_SIGNUPS_PER_IP_*`, add a WAF rule for the ASN/country, confirm Turnstile is on.
3. **Credential stuffing** — the per-email lockout already applies; add a WAF rate rule; force password reset for affected accounts (sessions are revoked on reset).
4. **Leaked key** — rotate (`AUTH_SECRET` signs out everyone), then review `audit_log` and the AI usage ledger for the exposure window.
5. **SSRF / suspicious fetches** — search logs for `BlockedUrlError`; the guard blocks, so this is reconnaissance: rate-limit the account.

## 5. Pre-launch checklist
- [ ] `pnpm test && node e2e/run.mjs` green, including `15-security`
- [ ] `pnpm audit --prod --audit-level=high` clean; gitleaks job green
- [ ] `node e2e/csp-check.mjs` against the production build shows no CSP violations
- [ ] Production boot test: starting the API with `NODE_ENV=production` and a weak config must exit with a clear message
- [ ] Email verification works end to end with the real mailer (sign-up → mail → link → sign-in)
- [ ] Unsplash Production access approved (50/h demo limit would degrade pictures for everyone)
- [ ] External penetration test; fix findings; repeat the e2e suite
