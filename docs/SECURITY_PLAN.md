# Security plan & tracker

Scope: the attacker's view of promptToPpt — people who want free AI decks, try to bypass plans, hammer sign-up/login, burn our Google Cloud
credits, attack other users, or break in through uploads/links. Audited 2026-10-04 by five independent read-only reviews (auth & account abuse,
plan/credit/billing enforcement, authorization & admin, input handling/SSRF/XSS, AI cost abuse). Every finding below has a file reference; the fix
column says what we will build. Status: ☐ todo · ◐ in progress · ☑ done (with test).

## 1. Threat model (who attacks, what they want)

| Attacker | Goal | Main paths |
|---|---|---|
| Free-rider | decks/images/exports without paying | many accounts, replayed request ids, dev endpoints, premium template/model via direct API, restore old versions, client-side-only gates |
| Credential attacker | take over accounts | brute force, credential stuffing, enumeration, weak/breached passwords, pre-registration with someone's email, session theft |
| Cost attacker | burn our cloud budget / starve others | parallel jobs, retry/cancel tricks, unmetered endpoints, Unsplash quota exhaustion, huge sources |
| Data attacker | read other users' data / our internal network | IDOR, SSRF (sources, export, pictures), prompt injection, stored XSS in shared decks |
| Platform abuser | break availability | zip/PDF bombs, huge bodies, DB growth, queue monopoly |

## 2. Findings (consolidated, de-duplicated)

### Critical / High
| ID | Finding | Where | Fix | Status |
|---|---|---|---|---|
| S1 | **Replaying a request id runs the AI free**: `reserveCredits` returns early when the ledger key exists; ai-edit/assist have no "already settled" guard; refund-then-retry with the same id is free | billing/credits.ts:51-57, routes/presentations.ts | settle-once semantics: a request id can be charged once and returns the stored result on replay; a refunded id is rejected (409) | ☑ tests: `billing/replay.test.ts` |
| S2 | **Unlimited free accounts**: email verification off, 100 free credits + 6 images granted at first use, no disposable-email block, no Gmail alias normalisation, no CAPTCHA, no per-IP sign-up cap | auth.ts:21, billing/credits.ts:34-47, schema.ts:9 | verify email before any AI/credit grant (Google sign-in counts as verified); canonical-email unique key; disposable-domain blocklist; sign-up limits per IP/hour and per canonical email; Turnstile hook; smaller unverified allowance | ☑ tests: `security/auth-abuse.test.ts`, `email-verification.test.ts`; Turnstile hook server-side + web widget |
| S3 | **No automatic global spend cap** — only manual flags | flags/flags.ts, ai/ledger.ts | spend circuit-breaker: sum `provider_cost_usd` for 1h/24h, trip `maintenance_mode` for AI at a configurable budget; per-user USD cap | ☑ tests: `security/spend-breaker.test.ts` |
| S4 | **Auth rate limiting is one shared 30/min bucket**, in memory; Better Auth's own limiter mis-keys behind proxies; no per-email lockout; `TRUSTED_PROXY_HOPS=0` default | app.ts:66, middleware/rate-limit.ts, auth.ts, env.ts:16 | dedicated limits: sign-up 5/h/IP, sign-in 10/10 min/IP and 5 failures/15 min/email, reset/verify limits; `get-session` excluded; prod boot fails if proxy hops unset; shared store interface (DB-backed) | ☑ DB-backed limits in `security/auth-guard.ts`; production refuses to boot without proxy hops |
| S5 | **SSRF guard bypass** via IPv6 IPv4-mapped hex (`[::ffff:7f00:1]`, metadata `[::ffff:a9fe:a9fe]`), NAT64, 6to4, link-local ranges; IP literals skip the DNS check | sources/ssrf.ts:19-24 | parse IPv6 to bytes, unwrap mapped/compat/NAT64/6to4, allow only global unicast; re-check the connected IP in the socket hook | ☑ tests: `sources/ssrf.test.ts` (56 cases) |
| S6 | **Export fetches ANY URL in a document** (metadata endpoint, localhost, VPC), follows redirects, buffers unbounded bodies | export/pptx.ts:20-33 | allow-list hosts (our assets, template assets, unsplash, pexels), SSRF-safe agent, manual redirects, streamed byte cap, max images per export; reject non-allow-listed `src`/background at save time | ☑ tests: `export/pptx-ssrf.test.ts` |
| S7 | **`javascript:` links accepted** (`z.url()` allows it) and rendered as `<a href>`; same for `attribution.url`; `background.value` is an unvalidated string used in CSS | validation/presentation.ts, ui/SlideCanvas.tsx:101,168 | shared `httpUrl` schema (https/http only) everywhere; render-time guard; background image restricted to allow-listed hosts | ☑ schema `httpUrl` + render-time guards |
| S8 | **Model-emitted `imageUrl`** is trusted (prompt-injected source → pixel exfiltration / SSRF on export) | pipeline.ts, ai-edit.ts, deck.ts:66 | strip `imageUrl`/`attribution.url` from model output; only our picture pipeline sets pictures | ☑ tests: `generation/lock-pictures.test.ts` |
| S9 | **No CSP / frame-ancestors / nosniff** on the web and editor apps (clickjacking on checkout/login) | apps/web/next.config.ts, apps/editor | security headers for both apps: CSP, frame-ancestors 'none', HSTS, Referrer-Policy, Permissions-Policy | ☑ `scripts/csp.mjs` → Next headers, Vite headers, `scripts/gen-security-headers.mjs` (nginx / CloudFront / _headers); `e2e/csp-check.mjs` |
| S10 | **`/api/v1/dev/set-plan`**: any signed-in user can give themselves any plan if `APP_ENV` is not "production" (defaults to development) | routes/billing.ts:90-107 | remove from non-test builds; production env must be set explicitly; boot guard | ☑ route and client/UI button removed; `plan-bypass.test.ts` |

### Medium
| ID | Finding | Fix | Status |
|---|---|---|---|
| S11 | One account can fill the single FIFO job queue (20 jobs/day pre-funded) and starve everyone | ≤2 active jobs per user, fair claim order, worker pool | ☑ cap 2 active jobs + fair claim order |
| S12 | Cancel late in a job refunds credits after the AI already ran | abort signal into gateway; refund only unperformed stages; rate-limit cancels | ☑ refund only while queued/analyzing/outlining |
| S13 | `/analyze` is unmetered AI and limited per IP | per-user key, daily cap, global cap | ☑ per-user key, 6/min, 80/day |
| S14 | Most costly routes keyed by IP, not user | key by user id; add IP limit too | ☑ per-user keys on jobs, analyze, ai-edit, chat, sources, save, cancel |
| S15 | assist refunds the planning call after paying (free big prompts) | non-refundable planning fee / daily cap on free no-ops | ☑ refund allowance 25/day (`refundPlanning`) |
| S16 | Unsplash demo quota (50/h) exhaustible by one user; vision checks unpriced | global token bucket, per-user stock-search cap, vision cap per job | ☑ per-user 30/h + shared 40/h token bucket + global latch; test in `pictures.test.ts` |
| S17 | Unbounded growth: versions (3 MB × 120/min), chat `images` blobs, sources per user, presentations per user, stock asset rows | global body limit; per-route limits; prune versions; caps per user | ☑ chat image schema bounded, versions pruned to 100, snapshots 12/min, 100 sources, 500 decks, elements ≤ 400 |
| S18 | No global request body limit; chat/text-source bodies unbounded | `bodyLimit` default 256 KB + explicit larger on uploads | ☑ global 256 KB JSON limit (explicit larger limits on uploads / save) |
| S19 | Anonymous `/drafts` endpoints (parse PDFs, fetch links): no global/per-IP-daily quota, cleanup opportunistic | caps + scheduled purge + CAPTCHA | ☑ 40 uploads/day/client, 20k unclaimed rows cap, scheduled purge |
| S20 | PPTX import zip bomb (trusts declared size); PDF parsing has no timeout | pre-scan central directory, cap total/entry count, timeouts | ☑ total/entry-count zip caps, PDF wall-clock budget; tests `sources/bombs.test.ts` |
| S21 | No `maxOutputTokens` on main pipeline calls; enrich fan-out under-priced | per-request-type caps; reprice per slide | ☑ default `maxOutputTokens` ceiling in the gateway; free planning capped |
| S22 | CSRF relies on defaults; cross-subdomain cookie | Origin/Sec-Fetch-Site check on all non-GET `/api/v1` | ☑ `middleware/origin-check.ts` |
| S23 | No breached-password check; sign-up reveals existing emails | HIBP plugin; generic sign-up response after verification is on | ◐ breached-password check on in production, 10+ chars; generic sign-up answer not done (needs verification flow in prod) |
| S24 | Vulnerable `image-size` via pptxgenjs (2 high) | upgrade/override | ☑ `image-size` override ≥ 2.0.3 (no high/critical left; 2 dev-only esbuild advisories remain) |
| S26 | **Premium theme gate on save is bypassable**: only fires when `theme.id` changes and only matches known ids — a Starter user can PUT premium colours/fonts/style under the old or an invented id | routes/presentations.ts:139-142 | compare the whole theme against catalogue themes / derived custom themes; reject anything else | ☑ `billing/premium-look.ts` fingerprint; tests in `plan-bypass.test.ts` |
| S27 | Presentation-per-month quota race (parallel creates overshoot the plan limit) | routes/generation.ts:118, presentations.ts:63 | advisory lock around check+insert (pattern already used by images) | ☑ advisory lock; test in `plan-bypass.test.ts` |
| S28 | Refunds/chargebacks never revoke access or credits (only `subscription.*` and `payment.failed` handled) | billing/subscriptions.ts:208-218 | handle `payment.refunded`, `refund.*`, `payment.dispute.*`: cancel + claw back the period's grant | ☑ `revokeForPayment` + `clawbackCredits`; tests in `payments.test.ts` |
| S29 | A terminal subscription event with null `current_end` and no row grants 31 days of active | billing/subscriptions.ts:94,104 | never grant on terminal states without a captured payment | ☑ terminal events never grant; test in `payments.test.ts` |
| S30 | **PDF/PNG/JPG/HTML exports are rendered in the browser** (ACCEPTED RESIDUAL RISK: every format is authorised by the server and Starter is refused, but a determined user with dev-tools can still screenshot or print what they can see. Strict enforcement = server-side rendering via headless Chromium, tracked as a product decision.) — plan gating and the "watermark" are only UI | routes/exports.ts:38, apps/editor export | server-side gate by entitlement before returning the document for client export is impossible → move watermark/format gating into the exported pixels (server-rendered PDF/PNG for free plan, or watermark baked into the render) and keep entitlement checks on every export request | ☐ |
| S31 | Webhook route has no body limit/rate limit | routes/billing.ts:81 | bodyLimit + rate limit | ☑ 256 KB + 120/min |
| S25 | CI: no `permissions:`, no audit/secret scan; Docker base images unpinned | add | ☑ least-privilege workflow token, `pnpm audit --audit-level=high`, gitleaks job, Dependabot |

### Low
Version restore skips plan/premium checks · restore param NaN → 500 · audit-log IP spoofable · `generation.error` returned raw · `lang`/title in HTML export · stock `download()` follows redirects ·
production does not reject weak/dev `AUTH_SECRET` values · session lifetime 30 days.

## 3. Billing / plan-bypass review (summary)
Checked and safe: every costly route is authenticated and gated by plan/model tier/slide count on the server; entitlements come from the DB; credits are reserved
with a row lock + unique ledger key + non-negative DB check; Razorpay webhook HMAC is verified over the raw body with constant-time compare; price/plan/currency are
chosen server-side; checkout confirmation re-fetches the subscription from Razorpay. The gaps are S1, S10, S26–S31 above.

## 4. Phases

1. **Phase 1 – stop the free rides and the internal-network holes** (S1, S2, S3, S4, S5, S6, S7, S8, S10)
2. **Phase 2 – harden the edges** (S9, S11–S18, S22, S23)
3. **Phase 3 – resource safety & hygiene** (S19–S21, S24, S25, low items)
4. **Phase 4 – verification**: an attack-simulation test suite (`services/api/src/security/*.test.ts` + `e2e/suites/15-security.mjs`) that runs every attack above against the real API and must stay green in CI; staging pen-test checklist; monitoring & alerts.

## 4b. What is still open (honest list)
* **Redis/shared store for the in-memory limiters** on non-auth routes (auth limits are already database-backed). Needed before running more than one API task.
* **Nonce-based CSP for the website** (it needs `'unsafe-inline'` scripts today because of Next.js bootstrap scripts).
* **Server-side PDF/PNG rendering** (S30) if plan enforcement on exports must be strict.
* **WAF / bot protection** in front of the API (CloudFront + AWS WAF rate rules on `/api/auth/*`, managed bot control) — see `docs/SECURITY_RUNBOOK.md`.
* **Turnstile site key** and **Resend key** must be created and set in production (the code is ready; production refuses to boot without Resend).
* **Third-party penetration test** before launch.

## 5. Progress log

| Date | Step | Result |
|---|---|---|
| 2026-10-04 | Five-way security audit | done — findings above |
| 2026-10-04 | Phase 1 complete (S1–S8, S10) + S11–S14, S22, S26–S29, S31: replay-proof credits, SSRF-proof fetching, safe URLs, no model-chosen pictures, no dev plan switch, production boot guards, DB-backed auth abuse limits (sign-up/sign-in/reset), email verification gate, canonical-email + disposable-domain blocks, CAPTCHA hook, spend circuit breaker, per-user limits, job fairness, premium-look fingerprint, refund/chargeback revocation | done — 351 API tests green incl. attack simulations in `src/security/` |
| 2026-10-04 | Phase 2/3 done: security headers (web + editor), body limits, growth caps, zip/PDF bombs, stock budgets, token ceilings, upload caps, audit IP, error text, HTML export escaping, dependency override, CI hardening | done |
| 2026-10-04 | Phase 4: `e2e/suites/15-security.mjs` (12 attacks over real HTTP, 12/12) + `services/api/src/security/*` attack-simulation tests | done |
