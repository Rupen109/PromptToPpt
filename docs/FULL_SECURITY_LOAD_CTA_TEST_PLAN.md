# Full security, payments, exposure, load and CTA test — plan and results

Written BEFORE the run (2026-10-26) so the checks cannot be bent to fit the results. Everything is attacked from the OUTSIDE (real HTTP against the running API and the real built websites; real browsers), not by calling internal functions. The earlier audit (docs/SECURITY_PLAN.md, 2026-10-04) predates everything built since (brand lookups, file reading pool, comments, share analytics, kits, landing header), so this is a fresh pass over old and new.

Authorised target: this project's own local system only. Status: ✅ held · ❌ broken (then fixed and re-run) · ⏳ not yet run · ➖ not applicable / cannot be tested locally (said why).

## RESULTS (run 2026-10-26 → 27) — read this first

Scripts that reproduce every result: `services/api/scripts/attack-routes.ts` (B), `attack-auth.sh` + `attack-auth.ts` (A, two production-shaped API instances), `attack-payments.ts` (C, stand-in Razorpay with real signatures), `e2e/suites/31-exposure.mjs` (D), `services/api/scripts/load-app.ts` (E), `e2e/suites/32-cta-crawl.mjs` (F). API unit tests: 588 pass (53 files).

| Section | Result |
|---|---|
| A auth (A1–A12) | ✅ all held after the fixes below; ➖ Secure cookie flag and shared-domain scope cannot be seen on plain-http dev (set by NODE_ENV=production; check in the production rehearsal) |
| B routes (B1–B5, B7) | ✅ 123 non-public routes refuse signed-out callers; 36 owner-scoped routes refuse another user using the victim's real ids (valid bodies, so validation cannot hide a missing check); 56 admin routes refuse a Pro user; hostile bodies (20 MB, 10,000-level nesting, 100,000 keys, bad UTF-8, truncated) never give a 5xx; every costly mutating route has a limiter. **B6 (stored XSS across editor / share / present) was not re-run here**; only the comments case is covered (suite 28) |
| C payments (C1–C7) | ✅ all held after the fixes below. **C8 (the pay button in a real browser, slow network, closing checkout) was not run**: only the "Upgrade" burst test on a Pro account (no button shown) and the API-level double click (30 parallel clicks → 1 provider subscription) |
| D exposure (D1–D5) | ✅ 19/19: no secret value or key shape in any bundle, page or response of a full journey; no source maps; no stack traces; tokens not in URLs; headers present; discovery paths empty |
| E load (E1–E5) | ✅ 100→3,000 concurrent users: ≈145,000 requests, 0 errors, ≈1,200 req/s, p95 ≤ 35 ms; 10× spike: API read p95 ≈ 1 s, p99 1.5 s, recovered immediately; API peak 92 % CPU / 505 MB. **Limits:** one laptop ran generator, API, database and website; the editor (static) was not load-tested; 1,500 users shared 4 generator processes (so some deck-save conflicts, 11,658 × 409, are a test artifact); one trusted proxy hop with random addresses per virtual user; a single API process (shared limiter store untested) |
| F CTAs (F1–F5) | ✅ 15/15: 22 website pages and all links/anchors, 292 website controls + 54 editor controls (Pro) + Starter + phone width clicked, no errors, 0 controls with no effect, double-clicks make one item. Skipped by design: destructive and paid controls (tested by name: delete asks first, checkout burst) |

### Real defects found and fixed (each has a test)
1. **Unreadable JSON gave a 500 and a stack trace** (Hono's HTTPException was mapped to 500) → 400 `INVALID_REQUEST`. NUL characters in a body gave a database error 500 on sign-in/sign-up/projects → refused with 400 before the database.
2. **Abuse counters could be outrun by a parallel burst** (checked first, recorded after): 12 simultaneous sign-ups let 9 through a limit of 6, and a parallel password-guess burst bypassed the 5-guess lock → each attempt now takes its place first and is counted with the others (`auth-guard.ts`).
3. **Refund resurrection:** after a refund/chargeback the provider's own "cancelled" event (with the old future period end) restored the access that was refunded → a finished subscription never comes back; a new purchase makes a new one.
4. **Anyone could pick the India price** by sending a country header to the origin → country headers are believed only with the CDN's secret (`EDGE_SHARED_SECRET`, `X-Origin-Verify`); production refuses to boot without it.
5. **Pay button was not idempotent**: 30 parallel clicks created 30 provider subscriptions → one open session per person and terms (advisory lock, `checkout_attempt` table, migration 0028).
6. **Session tokens were repeated in auth JSON answers** (sign-in, sign-up, get-session, and every token in list-sessions), defeating HttpOnly against an injected script → removed from answers; auth answers are `no-store`; private `/api/v1` answers default to `no-store`.
7. **Editor shipped public source maps** (the original source including admin screens) → disabled.
8. Missing limiters: draft claim, version restore, project create, billing cancel; checkout/verify now limited per user (an office behind one address was sharing 10/min); a per-user cap of 600 changing requests a minute as a backstop.
9. **Cross-site fetch metadata**: a request labelled `Sec-Fetch-Site: cross-site` with our Origin header was accepted → refused.

### Accepted / noted (not defects)
- Sign-up with an existing e-mail says "User already exists" (reveals a registered address; bounded by the per-address sign-up limit; standard for password sign-up).
- Someone who knows a victim's e-mail can lock that account for 15 minutes (the owner can still reset the password).
- A real-world caveat of every number above: this is one machine, dev AI provider, stand-in payment provider; the production rehearsal (OpenRouter, S3, real CDN, several tasks) is still open in the release checklist.

## A. Authentication: sign-up, sign-in, sessions, password reset
| ID | Attack / check | Must be true |
|---|---|---|
| A1 | Sign-up flood from one address | Slowed (429) after the limit; legitimate first sign-ups work |
| A2 | Same person signing up many times: `+tag` aliases, Gmail dots, upper/lower case, disposable mail domains | Refused as duplicates / disposable |
| A3 | Weak, empty, huge, unicode and NUL passwords; huge name / email; malformed JSON; wrong content types | Clean 4xx, never 500, nothing stored |
| A4 | Account enumeration: sign-up / sign-in / reset with existing vs unknown email | Same answer and no timing difference large enough to tell (measured) |
| A5 | Brute force one account (many wrong passwords), including from "many addresses" (spoofed forwarding headers) | Account locks for the window; spoofed headers are ignored unless a trusted proxy is configured |
| A6 | Credential stuffing: many different emails from one address | Per-address cap |
| A7 | Password reset: mail-bombing a victim, token reuse, expired/forged token, token in URL leakage, reset for unknown email | Per-email and per-address limits; tokens single-use; no enumeration |
| A8 | Sessions: cookie flags (HttpOnly, SameSite, Secure when production), sign-out really kills the session server-side (old cookie rejected), tampered / truncated / foreign cookie, session after password change | All hold |
| A9 | CSRF: state-changing requests with a foreign Origin, no Origin, `Sec-Fetch-Site: cross-site`, `text/plain` "simple request" bodies — for the auth endpoints AND every `/api/v1` route | Refused |
| A10 | Open redirect / callback abuse: `callbackURL` / `redirectTo` pointing to another site in sign-in, sign-up, reset | Refused or ignored |
| A11 | Role escalation: update-user with `role`, `emailVerified`, `plan`, `credits`; signing up with extra fields | Ignored / refused |
| A12 | Admin routes with a normal user, with no user, with a forged role cookie | 401 / 403 |

## B. Every route: authorisation, abuse limits, malformed input (generated from the live route table)
| ID | Check | Must be true |
|---|---|---|
| B1 | Every `/api/v1` route called signed-out | 401 (or intentionally public: listed and reviewed) |
| B2 | Every route that takes an id (presentation, thread, comment, source, kit, asset, job, project, export…) called by ANOTHER signed-in user with the owner's real ids | Never 2xx with data; 403/404 |
| B3 | Rate-limit coverage: every mutating route hammered 150× in a minute by one user | Each either limits (429) or is listed as unlimited and judged (cheap vs costly) |
| B4 | Bodies: 20 MB JSON, deeply nested JSON (10,000 levels), 100,000 keys, invalid UTF-8, wrong types, negative / huge numbers, SQL / NoSQL / template / path-traversal / CRLF strings in every text field | 4xx within a second, never 500, never a crash |
| B5 | Verbs and CORS: TRACE/OPTIONS oddities, preflight from an evil origin with credentials | Not allowed |
| B6 | Stored XSS: payloads in titles, names, comments, kit names, source titles, slide text, then viewed in the editor, share page, present mode | Shown as text; nothing runs |
| B7 | Mass assignment: extra fields on create/update calls (`userId`, `plan`, `role`, `status`, `credits`, `isDefault` on others) | Ignored |

## C. Payments (a stand-in Razorpay server, real signatures; the API runs against it)
| ID | Attack / check | Must be true |
|---|---|---|
| C1 | Clicking the pay button many times (parallel and rapid) | ONE checkout session per person/plan/interval; no pile of provider subscriptions |
| C2 | Plan / price tampering: unknown plan, `starter`, negative or custom amounts in the body, interval garbage, currency spoofed through headers | Server chooses price; bad input refused; no cheaper price by header spoofing |
| C3 | Confirm (`/billing/verify`) with a forged signature, another person's subscription, an unpaid subscription, a signature for a different payment, repeated confirms | Refused; no access; no double grant |
| C4 | Webhook: no signature, wrong signature, valid signature over a tampered body, replay of the same event, old event, oversized body, flood | Rejected / idempotent; credits granted once |
| C5 | Races: confirm + webhook at the same moment, two webhooks, two confirms | One activation, one credit grant |
| C6 | Cancel: twice, with no subscription, someone else's, then refund / dispute webhooks | Correct state each time; access revoked on refund |
| C7 | Bypass: dev plan switching, direct entitlement fields, premium features as Starter (themes, exports, models, slide counts, collaborators, brand, sources) | All refused |
| C8 | The pay button in a real browser: double click, Enter held, slow network, closing the checkout, coming back | One request per click burst; button shows progress; a failure leaves it usable |

## D. Nothing sensitive in the network tab or the shipped code
| ID | Check | Must be true |
|---|---|---|
| D1 | All requests/responses of a full browsing session (landing → sign-up → editor → create → billing → share → comments → admin) recorded and scanned | No secrets, tokens in URLs (except intended share/invite links), other people's data, stack traces, internal host names or file paths |
| D2 | Production bundles of the website and editor scanned for every secret value in `.env` and for key patterns; source maps; dev-only pages | No secret values, no source maps, no dev pages |
| D3 | Response shapes: `/me`, entitlements, models, plans, billing, admin endpoints | Only fields the screen needs; no costs / margins / provider names a customer should not see; no password hashes or internal ids of others |
| D4 | Security headers on website, editor and API (CSP, X-Frame-Options / frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, HSTS in production) and `Cache-Control: no-store` on private responses; no `X-Powered-By` | Present |
| D5 | Discovery: `/.env`, `/.git`, `/api`, `/docs`, `/openapi.json`, `/swagger`, `/metrics`, `/admin`, source-map URLs, directory listing, verbose 404 / 500 pages | Nothing useful returned |

## E. Traffic: thousands of users (production builds)
| ID | Check | Must be true / measured |
|---|---|---|
| E1 | Realistic mix: visitors (landing, pricing, templates, plans), signed-in editors (session, decks, open, autosave, comments, share), public viewers with analytics | Ramp 100 → 500 → 1,000 → 2,000 → 3,000 virtual users |
| E2 | Per stage: requests/s, p50 / p95 / p99, error rate, 429 share, API memory and CPU, event-loop stall, database connections and waits | Targets: errors < 1 %, p95 < 1 s for reads, < 2 s for writes at the stage the machine can serve; the break point is found and named |
| E3 | Rate limiters under many distinct addresses (forwarding header from a trusted proxy) and under ONE address | Distinct users are not blocked by each other; one abuser is |
| E4 | Spikes and recovery: 10× jump, then back | No lingering errors, memory returns |
| E5 | Honest limits of this test | One laptop runs the load generator, the API, the database and the websites; absolute numbers are a floor, the shape and the break point are the finding |

## F. Every call-to-action
| ID | Check | Must be true |
|---|---|---|
| F1 | Every page of the website and the editor is opened; every link is followed (status, anchors exist, external links `noopener`) | No 4xx / 5xx, no dead anchors |
| F2 | Every button / CTA is clicked in a safe state; the effect is recorded (navigation, dialog, request, download) | Each does something; "does nothing" ones are listed and fixed or justified; no console errors, no failed requests |
| F3 | Destructive or paid CTAs (delete, sign out, cancel plan, turn link off, clear analytics, checkout) are tested separately with throw-away data | Ask first or are undoable; double-click does one thing |
| F4 | Every CTA that changes state: double-click / rapid repeat | Exactly one effect (or a clear refusal), never duplicates |
| F5 | The same CTAs signed out, as Starter, as Pro, as a collaborator, on a phone width | Right set shown; gated ones explain and offer the upgrade; none leaks a paid result |
