# Production release checklist — everything that must be true before we go live

Owner decision (2026-10-07): from here on we build with a **production mindset** — the goal is a public launch.
This file is the single list. Detail lives in the linked docs; this page says **what must be checked, and where we are**.

Status: ☑ done and verified · ◐ partly done · ☐ open · ❓ needs an owner decision
Review it before every release; add a date and initials when an item is ticked off. Keep it honest: if something was only tested locally, say so.

---

## 0. Blockers — fix before anything else

| | Item | Detail |
|---|---|---|
| ❓ | **Which AI provider runs in production?** | `docs/DEPLOYMENT.md` says `vertex`, but the model catalogue (`services/api/src/ai/catalog-seed.ts`) only offers **Vertex models in development/staging** and **OpenRouter models in staging/production**. With `AI_PROVIDER=vertex` in production the catalogue would be empty (no models). Decide: **OpenRouter** (prepaid credit, cannot overspend, catalogue already priced for it) or add Vertex rows for `production`. Then align `DEPLOYMENT.md`. |
| ☐ | **Paid AI account that cannot be switched off by surprise** | On 2026-10-07 every Gemini call failed with "requires billing to be enabled" (Google free trial ended). Production needs a paid account (or prepaid OpenRouter balance), **budget alerts**, and a low-balance alert. Free trial credit expires ~90 days after activation even if unspent — check the date. |
| ☑ | **Fresh database migrates from zero** | Migration `0012_pricing_v2_data.sql` used to fail on an empty database (plan prices inserted before plans existed). Fixed 2026-10-07; the test database is now dropped and recreated every run, so this is exercised on every test run. Keep it that way. |
| ☐ | **Docker images actually built** | `services/api/Dockerfile` and `apps/web/Dockerfile` have never been built (no Docker on the dev machine). First CI build may need fixes. |
| ☐ | **Nothing has been deployed anywhere yet** | No IaC (Terraform/CDK), no staging environment run end to end. |

## 1. AI, models and cost

- ◐ Model prices checked against the provider's page (Vertex text models verified 2026-10-06; image models are flat 1K estimates). **Gemini 3.6/3.7/3.8 Flash price doubles on 2027-01-01** ($0.75/$3.75 → $1.50/$7.50): run `pnpm --filter @prompttoppt/api catalog:vertex -- --apply` and re-check plan margins before then.
- ☐ OpenRouter prices synced (`pnpm catalog:sync -- --apply`) and the production catalogue reviewed model by model (tier, price, enabled).
- ☑ Spend circuit breaker built. ☐ Production values set: `AI_BUDGET_USD_HOUR`, `AI_BUDGET_USD_DAY`, `AI_USER_USD_DAY` (defaults 15 / 75 / per-user — far too high for launch; the owner suggested ~$3/hour, ~$10/day to start).
- ◐ Cost tracking: ledger explains ~86% of Google's burn (readings 2026-10-06 → 2026-10-08). ☐ Close the gap: BigQuery billing export (`docs/GOOGLE_CLOUD_BILLING.md`) or a controlled run (reading → one deck → wait 1–2 h → reading).
- ◐ Plan profitability: measured cost per credit — deck generation ≈ ₹0.05, AI edit ≈ ₹0.22, assistant ≈ ₹0.19, image ≈ ₹0.11. **AI edits and the assistant cost more per credit than Pro/Gold earn (₹0.166 / ₹0.12)** → heavy editors lose money. ☐ Decide: raise the credit price of edits, cap premium-model edits, or accept for launch. Re-check after the Flash price change.
- ☐ Assistant "put it back" (user complains about a change) and help-text replies are charged 0 credits but still cost one model call each. Capped only by the 15 requests/min per-user limit — check the daily cost of these free calls in the Cloud activity view after launch; add a daily allowance if they add up.
- ◐ PPTX animations (services/api/src/export/motion.ts): confirmed by the owner in PowerPoint desktop (plays, speed tuned to 450 ms per element, 0.7 s max stagger, "Fast" transitions). ☐ Still to check: Keynote and Google Slides open it without a repair prompt and play the transition. Looping pictures (Ken Burns / float / drift) are intentionally not animated in PPTX.
- ◐ Gemini 3.8 Flash (default model on Pro) is intermittently very slow on Vertex (measured 2 s, then ~94 s, 2026-10-08; 3.6 Flash stays 1–4 s) and the assistant then fails with 503 after ~100 s. **Owner decision: no code change — production uses OpenRouter, not Vertex.** ☐ Re-measure assistant latency on OpenRouter with the real production model before launch; if slow there too, add a short timeout + fallback to the next model.
- ☐ **Unsplash photographer credit is hidden on slides** (owner decision 2026-10-09; switch `SHOW_PHOTO_CREDIT` in packages/ui/src/SlideCanvas.tsx — the credit text is still stored on every picture). Unsplash's API guidelines require crediting the photographer and Unsplash wherever their photos are shown, and the Production-key application checks for it. Before applying for Production: either turn it back on, or show the credits somewhere visible to viewers (e.g. a "Photo credits" list in present/share view and exports) and describe that in the application. Pexels photos have the same expectation. Library photos (our own AI-generated set) need no credit.
- ✅ **"Use my brand" (C1)** — Style → Brand → "Get brand from a website": colours / fonts / logo from a company site; POST /api/v1/brand/extract (services/api/src/brand/). **Proven on the real internet (2026-10-10):** 34 real sites + 20 failure/attack addresses (`services/api/scripts/brand-probe.ts`: colour found 79%, wrong answers flagged low-confidence 5/5, logo 75%, fonts 88%, names 100%, median 1.7 s, 0 badly handled) and a real-browser suite `e2e/suites/23-brand-website.mjs` 19/19; full flow list and findings in docs/BRAND_FROM_WEBSITE_FLOWS.md. The real run found a **server-crash vulnerability** (a site answering in zstd killed the API process) — fixed centrally (`safeFetch` in sources/ssrf.ts + process safety net in src/index.ts). Still to do before launch: ☐ sites that build their look with JavaScript or only show colours in images (Linear, Mailchimp, Shopify, WordPress.org) give low-confidence results — decide whether a headless-browser fallback is worth it; ✅ deleting a brand kit no longer breaks decks that show its logo (files a deck or another kit still uses are kept); ☐ SVG logos are skipped (colour still used); ☐ logos are `generated_asset` rows of kind `logo` (max 100 per person, reused per site) — S3 + retention plan like other assets; ☐ 10 lookups/hour is counted in server memory (see the shared-store item); Pro/Gold only — confirm the plan decision; ☐ some big sites (Swiggy, Slack, Infosys) refuse automated visitors some of the time — expected, the message is plain; ☐ Terms line: the user is responsible for the right to use a fetched logo; ☐ open an exported .pptx with a logo in PowerPoint/Keynote/Google Slides; ☐ production Node is 22 (Dockerfile) vs dev 23 — rerun `brand-probe.ts` once on the production image.
- ✅ **Brand kits (C2)** — proven 2026-10-15 with a written flow list (docs/BRAND_KITS_FUNCTIONAL_FLOWS.md), real-browser suites `24-kits` (22 checks, no AI) and `25-kits-deck` (11 checks, two real AI generations) and unit tests. The run found and fixed: uploads over 256 KB were refused (global body limit), the brand's main colour was always darkened (now exact where legible), and deleted kits broke decks' logos. Still to do before launch: ☐ owner to look at the screenshots in e2e/results/25-*.png and confirm the look; ☐ plan gating (Pro 1 kit / Gold 5; Starter none) is a business decision; ☐ kit files live in `generated_asset` (kind logo/brand) — S3 + a clean-up job for files nothing references any more (kits keep files that decks use, so they are never removed automatically); ☐ the 60-uploads-per-hour limit is counted in server memory (shared-store item); ☐ a 1:1 slide is taller than a laptop window (editor zoom-to-fit) — affects all 1:1 decks; ☐ F7 wording on the Create page when a kit disappears was only checked through the API. Also open from the build: ☐ SVG logos are not supported (decide whether to rasterise); ☐ the Gold `knowledgeBase` flag is still only a flag (not advertised); ☐ add to the Terms that users must have the right to upload logos and pictures; the plan numbers are repeated in packages/api-client/src/plans.ts (`MAX_KITS` in services/api/src/brand/kits.ts); migration 0025 (`brand_kit`, `brand_kit_image`).
- ✅ **More sources (C4)** — Word (.docx/.docm), Excel (.xlsx/.xlsm), CSV/TSV, email (.eml) and Google Doc / Sheet / Slides links ("anyone with the link"), through the Add-sources dialog, the prompt bar (choose / drop / paste) and the landing page. Proven 2026-10-16 with a written flow list (docs/SOURCES_C4_FUNCTIONAL_FLOWS.md): 143 reader tests, real-browser suite `26-sources-c4` 18/18 (including three real public Google documents and the signed-out landing → sign-up hand-off), real-AI suite `27-sources-c4-ai` 4/4 (decks from a Word report, a spreadsheet, an email and a document that tries to give orders). The run found and fixed: zip files all treated as PowerPoint, several output problems only real files showed, an unfriendly rate-limit message, and an assistant crash when the model writes `null` for an optional field. Still to do before launch: ☐ **private Google files** need Google sign-in (an OAuth app + Google verification, a business/legal step) — today the app tells people to share "Anyone with the link" or upload the file; ✅ real Word/Excel files: 165 files saved by real Office (public test collections) read with 0 unexpected failures, and numbered lists, times and refusals fixed on the way (docs/SOURCES_C4_FUNCTIONAL_FLOWS.md) — still ☐ try one report and one sheet of your own; ☐ OCR for scanned PDFs / pictures is not built; ☐ Outlook `.msg`, old `.doc/.xls/.ppt`, `.xlsb` are refused with a hint (decide whether to support); ☐ Excel charts/pivots/pictures are ignored; ☐ the 20-requests-a-minute source limit is counted in server memory (shared-store item); ✅ load-tested 2026-10-23 and fixed: file reading now runs in worker threads (the API no longer freezes for other people: worst stall 2.3 s → 0.15 s; memory bounded by settings; 40-round soak plateaus ≈ 600 MB) — ☐ **give the API task 2 GB** (1 GB is the minimum; see docs/DEPLOYMENT.md "Reading uploaded files") and re-run `scripts/load-sources.ts` on staging at the real task size; ☐ deploy `dist/parse-worker.js` next to `dist/index.js` (the Dockerfile copies the whole dist; first Docker build still unverified); ☐ Terms: people confirm they may use the documents they upload.
- ✅ **AskPPT, Wikipedia & web data, 100+ languages (2026-10-28)** — plan flags `askDeck` (Pro, Gold) and `webData` (`wikipedia` on Pro, `web` on Gold), migration 0029, credit prices `ask_deck` 1/2/5 and `web_research` 60, language picker (120 languages), right-to-left text. Proven with a written flow list (docs/ASK_RESEARCH_LANG_FUNCTIONAL_FLOWS.md): real-browser suite `33-ask-research-lang` 16/16 with real Gemini, Wikipedia and Google grounding; 608 API tests. Still to do before launch: ☐ re-measure web-search cost on **OpenRouter** (its web plugin) and confirm 60 credits keeps Gold-India margin; ☐ the sign-up bug found here (token removed from auth answers) is fixed — keep `hasSession` in the answer; ☐ run migration 0029 on staging/production (existing databases need it; fresh ones get the seed); ☐ Privacy Policy: web search sends the topic to the AI provider's search tool; ☐ owner to decide whether to mirror whole slides for right-to-left languages.
- ✅ **Comments (C6)** — slide comments and pins with replies, resolve/reopen, edit/delete, `@` mentions (one plain-text email per person per 10 minutes), unread dots, live updates; for the owner and invited collaborators; kept out of the deck document, exports, Present mode and share links (migration 0026: `comment_thread`, `comment`, `comment_seen`). Proven 2026-10-16 with a written flow list (docs/COMMENTS_C6_FUNCTIONAL_FLOWS.md): 18 API tests, 6 editor tests, real-browser suite `28-comments` 23/23 with two real accounts (live updates, offline catch-up, pins, mentions and the real mail log, permissions, export file inspected, 300 threads, phone, axe). The run found and fixed: duplicate-name mentions going to the wrong person, stale mention picks, a caret race when typing right after picking a name, a hidden rail bubble, an accessibility error in the mention list, and an unbounded payload (now capped at 3,000 comments per deck). Still to do before launch: ☐ **view-only-link visitors cannot comment** (needs a name step + spam control — business decision); ☐ send one real mention email through Resend in staging; ☐ run with `LIVE_BUS=pg` behind the real load balancer (comments reuse the live channel); ☐ the 40-actions-a-minute limit is counted in server memory (shared-store item); ☐ pagination / archiving if decks routinely reach thousands of comments; ☐ reply emails and a comment search are not built; ☐ Terms/Privacy: comments are stored until the deck is purged.
- ✅ **Share-link analytics (C7)** — the owner of a view-only link sees views, different visitors, average time, slides reached and where people leave, devices, websites they came from and countries (Pro/Gold: full dashboard; every plan: total views + last view in the Share dialog); "Clear analytics"; nothing personal stored (no IP, user-agent text or cookie; the visitor id is a per-deck one-way hash), owner/collaborator/robot/Do-Not-Track visits not counted, 20,000-visit cap, 400-day retention (migration 0027: `share_view`). Proven 2026-10-19 with a written flow list (docs/SHARE_ANALYTICS_C7_FUNCTIONAL_FLOWS.md): 20 API tests, 5 timing tests, real-browser suite `29-share-analytics` 21/21 three runs in a row (many real visitors in separate browsers, real timing, hidden tab, closing tab, password/expired/turned-off links, phone, axe, 5,000 visits). The run found and fixed: the closing-tab report was lost (now `sendBeacon`), and a clipped phone table. Still to do before launch: ☐ **Privacy Policy / Terms must describe this analytics** (what is recorded and that the link owner sees it) — the viewer page carries a short notice but the legal text is yours; ☐ **countries need a country header** — forward `CloudFront-Viewer-Country` (or Cloudflare's `CF-IPCountry`) to the API, otherwise the Countries card stays empty; ☐ confirm the plan decision (total views on every plan, dashboard on Pro/Gold); ☐ test once in Safari and Firefox (only Chromium was run); ☐ the per-IP limits on the reporting endpoints (60 starts/min, 120 reports/min) are counted in server memory (shared-store item) and an office sharing one address could hit them in a very large event; ☐ the 400-day clean-up runs inside the API process every 6 hours; ☐ not built: view e-mail alerts, e-mail-gated links, data export.
- ✅ **Remix and Duplicate (C3, first version)** — editor ⋮ menu: "Remix this presentation…" builds a NEW deck from the open deck's slides (same look + format; POST /presentations/:id/remix-source, then a normal generation job with `remixOf`; services/api/src/remix/) and "Duplicate presentation" makes an exact copy. Hardened (2026-10-10): server tests for plan/ownership/deleted decks/rate limit/cleanup race/missing source/language/slide count, a full pipeline test (mock model), e2e (typing, save-first, upgrade, duplicate, job request), and two real-model runs (11→4 slides English; Spanish 5→4 slides with a conflicting "8 slides" in the text — stayed Spanish, exactly 4, facts kept). Bugs found and fixed by that review: a remix without its source text would have invented content; cleanup could delete a queued job's source; the English wrapper would have turned Spanish decks into English; the instruction's slide count could disagree with the charged count; unsaved edits were missed; the count box jumped while typing; citations to the temporary source were left on slides; hand-edited slides were read from their stale original text, ignoring the user's edits (and the editor's notes box); and the shared dialog hook stole focus after every keystroke (fixed in useDialog for ALL dialogs). Remaining decisions/limits: ☐ Remix is Pro/Gold only and charged per slide like a new deck (business decision); duplicates count toward the monthly deck allowance, cost no credits; ☐ hand-edited slides are read as they look NOW (their visible text, chart figures and tables, in reading order — editing by hand does not update the stored original text, which an earlier version of the remix wrongly used); only slides with nothing readable (pictures/shapes only) are skipped; ☐ the original's pictures are not reused — the remix picks new ones (uses the stock-photo hourly allowance like any generation); ☐ text over ~36,000 characters is shortened (speaker notes first); ☐ the newest 20 working sources per user are kept (nothing younger than an hour is ever removed); ☐ not built: 9:16 mobile format, importing a PowerPoint file to remix; ☐ real-model quality was checked on 2 decks — try several more of your own (very long, chart-heavy, other languages) before launch.
- ✅ **Remix/Duplicate verified end to end (2026-10-10)**: flow list in docs/REMIX_FUNCTIONAL_FLOWS.md; suite `22-remix-journey` 15/15 with real AI + all other editor suites green (107 checks in the closing run). Real bugs found and fixed that unit tests had missed: copy edits not saving after Duplicate (shared autosave bug), edits lost when leaving a deck within 1.5 s, Remix/Duplicate shown to collaborators, dialog wider than a phone, brand logo missing on hand-edited slides. Still true: Remix is Pro/Gold (decision), no 9:16 or PowerPoint import, and real-model quality was exercised on a handful of decks — keep an eye on the first real users' remixes.
- ℹ️ Cost note: the API unit tests (`services/api`, vitest) run on a MOCK AI provider (`AI_PROVIDER: 'mock'` in vitest.config.ts) and cost nothing; their "costs" in the ledger are simulated and the test database is wiped each run. The Playwright e2e suites (`e2e/`) DO use the real dev provider (Vertex): 03-create, 05-ai-assistant, 09, 14 and similar make real calls — run those sparingly while measuring costs. (An earlier version of this checklist said the unit tests cost money; that was wrong.)
- ☑ Free tools capped: `FREE_TOOLS_USD_DAY` ($3 rolling 24 h, all free tools), `FREE_TOOLS_IP_DAY` (20 calls/visitor/day), burst 6/min. ☐ Add Cloudflare Turnstile to the free-tool forms (server check exists).
- ☐ Provider keys live only in the secrets manager; none ever committed or pasted into chat/logs; rotate any key that was.
- ☐ Alert when the AI provider returns billing/auth errors (so a lapsed account is noticed in minutes, not by users).

## 2. Pictures (see `docs/PICTURES.md`)

- ☐ **Unsplash Production access** applied for and approved (demo key = 50 req/h, Production = 1000 req/h). Requirements we already meet: photographer credit with tracking links, hotlinking (no copies), download-endpoint ping, UTM. Then set `UNSPLASH_HOURLY_LIMIT=1000`.
- ☐ Production Unsplash key (and optional `PEXELS_API_KEY` as a second source) in the secrets manager. (`UNSPLASH_ACCESS_KEY`; the code also accepts the owner's `UNPLASH_ACCESS_KEY` spelling.)
- ☑ Policy: Unsplash → Pexels → our own library → none. **No AI images unless the user asks; no model in choosing pictures.**
- ❓/☐ **Permanent address for library photos.** Decks store library pictures as absolute URLs built from `WEB_URL` (`https://<site>/template-assets/…`). If the domain or hosting changes, every saved deck using one breaks. Serve them from a stable asset host (e.g. `assets.<domain>` behind CloudFront) from day one and point picture links at it.
- ☐ `template-assets` (≈57 MB, 160 files) served from a CDN with long cache headers; confirm CSP `img-src` allows the asset host, Unsplash and Pexels.
- ☐ "Picture unavailable" fallback in the editor for Unsplash photos that were deleted (link rot) — not built yet.
- ☐ More than one API instance → move the in-memory stock-search counters to a shared store (Redis); Unsplash's 403 is only the backstop.
- ☐ S3 bucket for AI-generated pictures: private, encrypted, lifecycle rules; `ASSET_STORAGE=s3` (the API refuses to boot in production otherwise).

## 3. Billing and plans (`docs/BILLING.md`, `docs/PRICING_MODEL.md`)

- ☐ Razorpay **live** keys + live webhook + `RAZORPAY_WEBHOOK_SECRET`; `APP_ENV=production` with `rzp_live_` keys (boot refuses a mismatch). Recreate plans in live mode (clear `provider_price_id`, per BILLING.md).
- ☐ One real small live payment end to end: subscribe → credits granted → renewal → cancel → refund → access revoked.
- ☐ Tax: GST/VAT handling, invoice format, business entity and bank details for payouts.
- ☐ Pricing page matches what is actually built. **Not built yet: Gold "Advanced brand customization" and "Shared knowledge base"** — build them or remove the promise (we have been burned by wrong promises before).
- ☐ Credits do not roll over: stated clearly on the pricing page and in checkout.
- ☑ Premium gate by design fingerprint, settle-once credit reservations, spend caps, plan-bypass tests (see `docs/SECURITY_PLAN.md` §3).

## 4. Security (`docs/SECURITY_PLAN.md`, `docs/SECURITY_RUNBOOK.md`)

- ☐ `NODE_ENV=production`, `APP_ENV=production`, `TRUSTED_PROXY_HOPS=2` (CloudFront + ALB), HTTPS URLs, `COOKIE_DOMAIN=.<domain>` (API refuses to boot without these).
- ☐ `AUTH_SECRET` from `openssl rand -base64 48`, unique per environment.
- ☐ **Email:** Resend key, verified sending domain (SPF, DKIM, DMARC), `REQUIRE_EMAIL_VERIFICATION=true` (production refuses to boot without Resend). Test verification, password reset and invite emails land in inboxes.
- ☐ **Turnstile** site key (web build) + secret (API) for sign-up, repeated sign-in failures and the free tools.
- ☐ **CloudFront + AWS WAF** with managed rules (Common, Known bad inputs, Bot Control) and rate rules on `/api/auth/*`.
- ☐ Security headers deployed for the editor host (`node scripts/gen-security-headers.mjs` → nginx / `_headers` / CloudFront policy). ☐ Nonce-based CSP for the website (needs `'unsafe-inline'` today).
- ☐ Shared limiter store (Redis/WAF) before running more than one API task.
- ☐ Server-side PDF/PNG export rendering if export limits must be strict (S30).
- ☐ **Third-party penetration test** before launch; dependency audit (`pnpm audit`) clean or accepted.
- ☐ Google sign-in (if enabled): production redirect URIs added in the Google console.
- ☐ Owner/admin account (`rupenbhimani109@gmail.com`) created in production with the owner role; test and QA accounts removed; no `@example.com` users in production.
- ☐ **`EDGE_SHARED_SECRET` (≥24 chars, production refuses to boot without it):** CloudFront adds it as the origin custom header `X-Origin-Verify` on every request to the ALB; the API believes `CloudFront-Viewer-Country` (and so the cheaper India price) only with it. Also restrict the ALB to CloudFront (prefix list / WAF rule on the header) so nobody can call the origin directly. (Found 2026-10-26: any client could send the country header and buy at the ₹ price.)
- ☐ Editor build ships **no source maps** (set 2026-10-26); if an error tracker is added, upload maps privately, never to the public bucket.
- ☐ Run `scripts/attack-routes.ts`, `attack-auth.sh`, `attack-payments.ts` and e2e suites 31 (exposure) / 32 (CTA crawl) against the staging stack with production settings (they need `RAZORPAY_API_BASE` stand-in only for the payment script, never in production).
- ☐ Database not public; API reachable only from the load balancer; S3 private; RDS/S3 encryption, backups and CloudTrail on.

## 5. Infrastructure and deployment (`docs/DEPLOYMENT.md`)

- ☐ Domains + TLS: `<domain>` (web), `app.<domain>` (editor), `api.<domain>` (API), asset host. SPA fallback (403/404 → `/index.html`) for the editor.
- ☐ ECS Fargate services (web, API), RDS PostgreSQL (backups, Multi-AZ at launch), S3 + CloudFront for the editor.
- ☐ Environment matrix filled in (below). Build-time `NEXT_PUBLIC_*` / `VITE_*` set per environment (they are public).
- ☐ CI green: migrate → typecheck → lint → test → build (`.github/workflows/ci.yml`).
- ☐ Release order: build/push images → `vite build` → sync editor to S3 + invalidate → **run `pnpm db:migrate` as a one-off task before rolling the API** (migrations stay backward-compatible for one release) → roll API → roll web.
- ☐ `LIVE_BUS=pg` (default in production) so live-editing events reach every API task.
- ☐ Rollback plan written and tried once on staging (previous images, DB changes reversible or backward-compatible).
- ☐ Restore drill: restore an RDS backup into a scratch database and open a deck from it.

### Environment variables to confirm in production

| Variable | Notes |
|---|---|
| `APP_ENV`, `NODE_ENV` | `production` |
| `API_URL`, `WEB_URL`, `EDITOR_URL`, `COOKIE_DOMAIN`, `TRUSTED_PROXY_HOPS` | see DEPLOYMENT.md |
| `DATABASE_URL`, `AUTH_SECRET` | secrets manager |
| `AI_PROVIDER` + key (`OPENROUTER_API_KEY` or `GEMINI_API_KEY`) | **decide first (§0)**; never `mock` |
| `AI_BUDGET_USD_HOUR/DAY`, `AI_USER_USD_DAY` | launch-sized limits |
| `FREE_TOOLS_USD_DAY`, `FREE_TOOLS_IP_DAY` | free-tool cost caps |
| `UNSPLASH_ACCESS_KEY`, `UNSPLASH_HOURLY_LIMIT`, `STOCK_USER_HOURLY`, `PEXELS_API_KEY` | pictures |
| `ASSET_STORAGE=s3`, `ASSET_BUCKET`, `ASSET_REGION` | AI pictures |
| `RESEND_API_KEY`, `EMAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION=true` | email |
| `TURNSTILE_SECRET_KEY` (+ `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | CAPTCHA |
| `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET` | live |
| `GCP_BILLING_EXPORT_TABLE` | optional: live Google-billed panel |
| `INR_PER_USD` | reporting rate |
| `EDGE_SHARED_SECRET` | CDN → origin secret (`X-Origin-Verify`); required in production |
| `RAZORPAY_API_BASE` | **must NOT be set** (test stand-in only; the API refuses to boot with it in production) |

## 6. Performance and load

- ◐ Deck generation: a 12-slide premium deck took **23 s** in the last real run (was 54–107 s); pictures add ≈0 s after the last slide is written. Target to hold: p50 ≤ ~35 s. ☐ Measure p50/p95 on the production provider and region, not only on a dev machine.
- ✅ Whole-app load test (2026-10-26, production builds, one laptop): 100→3,000 concurrent users, ≈145,000 requests, **0 errors**, ≈1,200 req/s, p95 ≤ 35 ms up to 3,000 users; a sudden 10× jump to 3,000 gave API read p95 ≈ 1 s / p99 1.5 s and recovered at once (docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md §E). ☐ Still to do: the same on the real stack (separate DB / API tasks / CDN) and with several API tasks (shared rate-limit store).
- ☐ Load test: concurrent generations (worker concurrency, queue depth, DB pool size), the free-tool endpoints (PDF parsing is CPU-bound, 25 s cap), SSE connections for live editing.
- ☐ Unsplash quota maths for expected traffic (≈10–13 requests per deck): 1000/h ≈ 75–100 decks/h; ask Unsplash for more or add Pexels before a spike.
- ☐ Vertex/OpenRouter rate limits and retry behaviour under load (quota errors showed up as slow calls during testing).

## 7. Product quality

- ☐ Full browser suite (`node e2e/run.mjs`, suites 01–19) green against a production-like stack. (Last full runs were partial: other projects held port 3000 at times.)
- ☐ Responsive and accessibility pass on the final build; real-phone check of the landing page, editor and free tools.
- ☑ Template catalogue: 137 designs, light/dark balanced, all compose without overflow/contrast errors. ◐ Review still open for Sales / Pitch / Product / Case Studies / Team (see `docs/TEMPLATE_REDESIGN_PLAN.md`); ☐ category-specific sample decks.
- ☐ Export fidelity checked in real PowerPoint / Keynote / Google Slides: fonts (Google fonts are not installed on most machines), images, animations.
- ☐ Error states reviewed: AI unavailable, quota exhausted, payment failed, expired link, offline editing.
- ❓ Free downloadable templates (idea discussed 2026-10-07): decide gate (account vs email), fonts, in-file "edit with AI" slide.

## 8. Legal, compliance, trust

- ☐ Terms of Service, Privacy Policy, Cookie notice, Refund/Cancellation policy; footer links; contact/support address.
- ☐ Data processing: provider agreements (Google / OpenRouter / Resend / Razorpay), data retention (draft attachments live 1 h; sources stored as text), user data export and deletion.
- ☐ Third-party attribution honoured: Unsplash/Pexels credits visible, Unsplash UTM links, no copies.
- ☐ Statement of what AI does with user content (not used for training by us; provider terms checked — free tiers may train on inputs, so **never use a free-tier key in production**).

## 9. SEO and marketing readiness

- ☐ `robots.txt`, `sitemap.xml` (includes the free tools and the `/free-templates/*` pages — done in code), canonical URLs, Open Graph images, structured data validated.
- ☐ Search Console + analytics (privacy-friendly) set up; goals for free-tool → sign-up and sign-up → first deck.
- ☐ Keyword volumes for the free-tool pages confirmed in Google Keyword Planner (public pages could not give exact numbers).
- ☐ Production domain redirects (www ↔ apex), no staging site indexed (`noindex` on non-production).

## 10. Monitoring and operations (`docs/SECURITY_RUNBOOK.md` §3)

- ☐ Alerts: AI circuit breaker tripped · AI provider billing/auth error · 429 rate on `/api/auth/*` > 5% · spikes in `auth_attempt` · one user > $3/day AI cost · `billing.access_revoked` · Unsplash rate limit hit · 5xx rate · queue backlog.
- ☐ Uptime checks for web, editor, API `/health`; error tracking (e.g. Sentry); log retention.
- ☐ Owner dashboard reviewed daily in week 1: Cloud (reconciliation + cost per action), Margin (profit per plan), free-tools cost.
- ☐ Runbooks: AI provider outage, Unsplash outage/403, payment webhook failures, database failover.

## 11. Launch day

1. Freeze changes; run the whole test suite and browser suite once more on the release commit.
2. Take a database backup. Run migrations. Deploy API, then web, then editor.
3. Smoke test on production: sign up (real email) → verify → create a deck from a prompt → pictures appear → edit with AI → export → pay → collaborate → free tools.
4. Watch the dashboards and alerts for the first hours; keep the previous images ready for rollback.
5. First-week review: reconcile Google/OpenRouter balance with the ledger, check cost per deck and margin per plan, fix what the numbers show.

---

### Changelog
- 2026-10-27 — full security / payments / exposure / load / CTA run (docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md) and pricing burn (docs/PRICING_BURN_RESULTS.md): added EDGE_SHARED_SECRET, no editor source maps, load-test result; open items listed above.
- 2026-10-08 — created. Collected from DEPLOYMENT, SECURITY_PLAN/RUNBOOK, BILLING, PICTURES, FREE_TOOLS_PLAN and the findings of 2026-10-06…08 (billing lapse, fresh-database migration bug, production provider mismatch, library-photo URLs, plan margins).
