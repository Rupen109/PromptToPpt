# ADR-001: Editor Rendering Architecture

**Date:** 2026-09-30
**Status:** Decided
**Decider:** Principal Architect

## Problem

We need to choose the rendering architecture for the slide canvas in the browser editor. Options are:
1. DOM-based (HTML + CSS)
2. SVG-based
3. Canvas (HTML5 Canvas / OffscreenCanvas)
4. Hybrid (DOM + Canvas)

## Decision

**DOM-based (HTML + CSS)** using CSS Grid/Flexbox for layout within fixed aspect-ratio containers.

## Why

| Criterion | DOM | SVG | Canvas |
|---|---|---|---|
| Inline text editing | ✅ Native | ⚠️ Complex | ❌ Custom |
| PPTX export fidelity | ✅ Good | ✅ Good | ⚠️ Pixel-only |
| Accessibility | ✅ Native | ⚠️ Partial | ❌ None |
| Precise positioning | ✅ CSS | ✅ SVG attrs | ✅ Pixels |
| Performance (large decks) | ⚠️ Virtualize | ⚠️ Virtualize | ✅ Best |
| Rich text | ✅ Tiptap | ❌ Hard | ❌ Custom |
| Image handling | ✅ img tags | ✅ image elem | ⚠️ drawImage |
| Snapshot for export | ✅ html2canvas | ✅ SVG serialize | ✅ toDataURL |

## Trade-offs

- Canvas would give better perf at very large decks but makes text editing impractical.
- SVG is good for diagrams but text editing is painful.
- DOM gives us Tiptap for rich text and native browser text selection — essential for a PPT editor.

## Migration Path

If performance becomes a bottleneck on very large decks (50+ slides with many elements), we can:
1. Virtualize the thumbnail rail (already planned).
2. Use OffscreenCanvas only for non-editable thumbnails.
3. Keep DOM for the active editing canvas.

---

# ADR-002: State Management for Editor

**Date:** 2026-09-30
**Status:** Decided

## Decision

**Zustand** for editor state.

## Why

- Zustand is lightweight (< 1KB), doesn't require boilerplate (no actions/reducers/selectors).
- Perfect for a slice-based editor state (slides, selection, history, UI state).
- Supports immer for immutable updates.
- Redux Toolkit was considered but is heavier; overkill for our model size.
- Jotai considered but atom granularity harder to manage for large composite state.

---

# ADR-003: API Framework

**Date:** 2026-09-30
**Status:** Decided

## Decision

**Hono** on Node.js 20 LTS.

## Why

- Hono is TypeScript-first, ultra-fast (fastest benchmark results), edge-compatible.
- Express was considered but lacks built-in TypeScript support and is slower.
- Fastify was considered but heavier configuration.
- Hono's middleware system matches our needs (cors, auth, rate limiting, logging).

---

# ADR-004: Database

**Date:** 2026-09-30
**Status:** Decided

## Decision

**PostgreSQL 16** via **AWS RDS** (Aurora Serverless v2 for cost efficiency at low scale).

## Cost at Scale

| MAU | RDS Cost/month |
|---|---|
| 1k | ~$30 (t3.micro) |
| 10k | ~$70 (t3.small) |
| 100k | ~$150 (t3.medium) |
| 1M | ~$500 (Aurora Serverless auto-scaling) |

## Why not DynamoDB

- Our data model is highly relational (users → subscriptions → presentations → slides → elements → versions).
- Analytics queries require JOINs and aggregations — DynamoDB would need duplicated data or expensive scans.
- Billing/ledger requires ACID transactions.

---

# ADR-005: Authentication — Better Auth hosted in the API, cookie sessions

**Date:** 2026-10-02 · **Status:** Decided

**Problem.** Two front-ends on different subdomains (Next.js site, React editor) and one API must share one login, without tokens in `localStorage`.

**Options.** (a) Auth.js inside Next.js — editor/API would need to trust a Next-issued session; (b) managed IdP (Clerk/Cognito) — fastest, per-MAU cost and lock-in; (c) Better Auth in the API.

**Decision.** (c) Better Auth + Drizzle adapter in `services/api`. httpOnly session cookie, `COOKIE_DOMAIN=.domain` in prod. Email/password + Google (enabled by env). `role` is a server-controlled column (`input:false`; covered by a test). Login/signup UI lives in `apps/web`; the editor redirects there with a validated `?next=`.

**Cost/perf.** $0 licence; one DB read per session check. **Trade-offs.** We own password reset/email verification (Resend, pending) and abuse controls. **Migration path.** Users/accounts are plain tables; moving to a managed IdP means importing hashes or forcing reset.

---

# ADR-006: Landing prompt → editor handoff via server-side drafts

**Date:** 2026-10-02 · **Status:** Decided

**Problem.** A visitor types a prompt on the marketing site (anonymous), must sign up, then land in the editor with that prompt — across origins.

**Options.** (a) prompt in the URL — leaks into logs/referrers/analytics, length-limited; (b) `localStorage` — not shared across origins; (c) server-side draft.

**Decision.** (c) `POST /api/v1/drafts` (public, rate-limited, ≤4000 chars) returns an unguessable 24-char id (30 min TTL). Redirect carries only the id. `POST /drafts/:id/claim` (authenticated) atomically binds it to the user (single use; idempotent for the same user, 404 for anyone else). Verified end-to-end in a real browser.

**Trade-offs.** One extra request; orphaned drafts need a cleanup job (index on `expires_at` exists; sweep job TODO). **Migration path.** Drafts become the first step of the `GenerationJob` in Phase 2.

---

# ADR-007: Deployment shape — containers for dynamic apps, static SPA for the editor

**Date:** 2026-10-02 · **Status:** Proposed (cost model pending)

Web (Next standalone) and API as containers on ECS Fargate; editor as static files on S3+CloudFront; RDS Postgres; SQS + worker in Phase 2. Rationale: lowest operational complexity with no always-on server for the heaviest-traffic static surface. Alternatives to price in the cost model: AWS Amplify Hosting for Next.js (less ops), Lambda for the API (cheaper at low traffic, awkward for long generation → keep the worker on Fargate regardless). See `docs/DEPLOYMENT.md`.

---

# ADR-008: Document model + deterministic layout engine (models never emit coordinates)

**Date:** 2026-10-02 · **Status:** Decided

**Problem.** LLM-placed coordinates produce overlaps/overflow and break when the theme changes; yet the editor, present mode and PPTX export all need exact geometry.

**Options.** (a) model emits full element geometry; (b) model emits HTML/Markdown; (c) model emits *semantic* content per layout, code lays it out.

**Decision.** (c). `slideContentSchema` (Zod, discriminated by layout) is what the model writes; `composeSlide(content, theme, aspect)` in `packages/theme` — pure and deterministic — produces absolutely-positioned elements in fixed canvas units (1920×1080 for 16:9). The semantic `content` is kept on the slide, so "swap design" and theme changes re-run layout without losing content. Text is fitted by a conservative width/line estimator; validators (schema, overflow, contrast WCAG, duplicate layout, font fallback, missing content, unresolved images) run before a deck is saved. 12 layouts × 4 themes × 3 aspect ratios are exercised in tests with zero overflow/contrast errors.

**Cost/perf.** Cheaper outputs (no geometry tokens), no extra model call for layout. **Trade-offs.** Less "creative" layouts than a human designer; the estimator is approximate (real-font measurement in the browser can be added in Phase 3). **Migration path.** New layouts = new `content` variant + a `case` in `composeSlide`; schema is versioned (`schemaVersion`).

---

# ADR-009: Generation queue — Postgres `SKIP LOCKED`, checkpointed stages

**Date:** 2026-10-02 · **Status:** Decided (SQS later if needed)

**Options.** SQS + Lambda/worker; BullMQ (needs Redis); Postgres queue.

**Decision.** Postgres: `claim()` leases one job with `FOR UPDATE SKIP LOCKED`; stages save outputs to `generation_job.checkpoint`; a crashed/expired lease is re-claimed and **resumes** (no re-spend on finished stages); persisting the deck is one transaction that re-checks the locked job row (can never create two decks); `(user_id, idempotency_key)` is unique. Retries back off exponentially, max 3 attempts, then `failed` with a user-safe message (raw provider errors go to logs only). The worker runs in the API process today (`RUN_WORKER`), and the `JobQueue` interface lets `services/worker` or SQS take over without touching the pipeline.

**Why.** No extra infrastructure/fixed cost; transactional with the job row; adequate to thousands of jobs/hour. **Trade-offs.** Polling (1s) not push; a long-running worker shares CPU with the API until split. **Migration path.** Implement `JobQueue` over SQS, keep checkpoints.

---

# ADR-010: AI gateway + immutable usage ledger

**Date:** 2026-10-02 · **Status:** Decided

All model calls go through `AIGateway`: route class (fast/quality) → ordered model chain → timeout → retry w/ backoff → fallback → JSON parse + Zod validate → one "repair" re-ask → **a ledger row for every attempt, including failures**. Cost is computed by us from a stored pricing snapshot (Gemini semantics: cached tokens inside prompt count; thinking tokens billed as output) — never from the provider dashboard. Ledger rows are protected by a trigger (append-only). Providers sit behind `AIProvider` (Gemini, Mock today; OpenRouter/others plug in without touching product code). Model chains are env-overridable. Prices were verified on 2026-10-02 from https://ai.google.dev/gemini-api/docs/pricing; `gemini-3.6-flash` is promotional until 2026-12-31 (re-verify then).

**Backends.** `AI_PROVIDER=gemini` (AI Studio key, header auth) or `vertex` (Vertex AI/Agent Platform express key bound to a service account — key goes in the query string; the provider scrubs it from every error). Same request/response format, different base URL; ledger rows record the real backend (`gemini` | `vertex`). **Thinking:** hidden thinking tokens are capped at 0 by default (measured: 69 s→17 s and half the cost per deck, no visible quality loss on structured output); per-call override available.

**Trade-offs.** One extra DB write per attempt (negligible next to LLM latency). **Open:** OpenRouter fee/latency comparison and image generation need a billing-enabled key (tracked for the cost-model task).

---

# ADR-011: Source ingestion safety

**Date:** 2026-10-02 · **Status:** Decided

User-supplied URLs are fetched by our server, so: http(s) only, ports 80/443, no credentials, hostname deny-list, **resolve-then-check at connect time** (undici custom `lookup` rejects private/loopback/link-local/metadata/multicast, v4 and v6, incl. IPv4-mapped), every redirect re-validated (max 3), 10 s timeout, 2 MB cap, HTML/text only. PDFs: magic-byte check (not extension/MIME), ≤10 MB, ≤100 pages, parsed in memory. Extracted text is **data**: wrapped in `<source>` tags, tag look-alikes neutralised, system prompt instructs the model never to follow instructions inside them, and citations to unknown source ids are dropped by the policy layer. Numeric layouts (chart/metrics) are only allowed when real numbers exist in the request or sources.

**Not covered yet:** malware scanning, scanned-PDF OCR, YouTube/audio/PPTX ingestion, private S3 retention of originals.


---

# ADR-012: Editor state — immer patches + commands, DOM rendering

**Date:** 2026-10-02 · **Status:** Decided (confirms ADR-001/002)

Zustand holds the document and its history; every edit is a pure command run through `produceWithPatches`, storing patches + inverse patches (exact undo/redo, tiny memory, no deck copies). UI state is a separate store. Drag/resize commit one command on pointer-up; typing/nudging merge by key within 1 s. Redux Toolkit was rejected (more ceremony, no benefit here); a hand-rolled snapshot stack was rejected (memory, no diffing for autosave/conflict).

---

# ADR-013: Save protocol — optimistic concurrency, in-place autosave, immutable history

**Date:** 2026-10-02 · **Status:** Decided

`PUT` carries `baseRevision`; mismatch → 409 (never a silent overwrite). Autosave updates only the user's own recent snapshot (≤5 min); generation/restore/AI snapshots are immutable, so "the deck as generated" is always recoverable (a test caught the first design overwriting it). Restore creates a new version. Client keeps unsaved edits in localStorage and syncs same-browser tabs via BroadcastChannel; cross-device conflicts are resolved by the user (load latest / keep mine). **Trade-off:** last-writer-wins after an explicit "keep mine"; real-time co-editing (CRDT/OT) is a future phase.

---

# ADR-014: Plans, entitlements and credits

**Date:** 2026-10-02 · **Status:** Decided (prices/amounts are DB data, not code)

Starter/Pro/Gold live in `plan` + `plan_price`; entitlements are computed server-side per request. Credits: lazy per-period allowance grant (unique key → exactly once), atomic reserve (row lock + CHECK ≥ 0, idempotent per ref), refund on cancel/failure, append-only ledger. Customer price = fixed table (action × model tier), deliberately separate from provider dollars, so cost can be estimated before the user clicks and margin can be analysed from the ledger. Alternative (credits = tokens × markup) rejected: unpredictable for users. **Soft gate:** advanced editor is UI-only. Real payments (Razorpay/Stripe) = Phase 5; `dev/set-plan` exists only outside production.

---

# ADR-015: Model catalogue in the database; one provider per deployment

**Date:** 2026-10-02 · **Status:** Decided

`model_catalog` rows define models, access tier, price, environments and internal route order; local dev serves Vertex/Gemini rows, production OpenRouter rows, through the same `AIProvider` interface. User-picked models fall back only within the same tier (no silent downgrade). OpenRouter returns real cost (`usage.cost`), stored beside our computed cost. `catalog:sync` refreshes OpenRouter prices (and disables vanished models). Owner analytics read the ledger (tokens, cost, country via edge header, environment, status). **Open:** live OpenRouter verification; image models disabled until the image phase.
