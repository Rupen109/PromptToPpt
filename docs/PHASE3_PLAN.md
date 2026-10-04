# Phase 3 — Models, plans, credits, token analytics, real editor

Spec refs: §9 editor, §13 provider/model strategy, §14 owner dashboard, §15 plans/credits, §16 export gating.
Order matters: the editor's toolbar (model picker, AI edit, export) depends on entitlements and the model catalog, so those land first.

## Product decisions (from you) → how they are modelled

| Plan | Your spec | Modelled as (all DB-configurable in `plan`) |
|---|---|---|
| **Starter** (free) | 100 credits · starter AI model · up to 20 slides · watermark · **no export** | `monthlyCredits=100`, `maxSlides=20`, `modelTiers=[starter]`, `watermark=true`, `exportFormats=[]`, `aiEdits=false`, `advancedEditor=false` |
| **Pro** | 50 presentations/mo · 200+ premium templates · no watermark · export PPTX/PDF/PNG/JPG/HTML · advanced editor · AI edits · 24/7 WhatsApp support · premium models | `maxPresentationsPerMonth=50`, `exportFormats=[pptx,pdf,png,jpg,html]`, `watermark=false`, `aiEdits=true`, `advancedEditor=true`, `modelTiers=[starter,premium]`, `support=whatsapp` |
| **Gold** | all Pro + frontier models · advanced brand customization · shared knowledge base · generation speed **ultra** | adds `modelTiers+=frontier`, `brandKit=true`, `knowledgeBase=true`, `speed=ultra` (queue priority + parallel slide batches) |

Reference (competitor page you screenshotted, not copied as fact): Pro $20/mo, Gold $50/mo billed annually; 100 / 5,000 / 25,000 credits. Prices live in `plan_price` (INR + USD) and are **never hard-coded**; live-verify before launch.

Models: user picks a model per generation (and per AI edit). Model → **tier** (`starter | premium | frontier`) → plan gate, enforced server-side. Local dev serves the catalog from Vertex/Gemini; production serves it from OpenRouter (Sonnet 4.6, Opus 4.8, Opus 4.6, Haiku 4.5, GLM-5.2, Nano Banana Pro…). Same code, different catalog rows + provider.

Token measurement: every attempt already lands in the immutable `ai_usage_event` ledger. This phase adds provider-reported cost (OpenRouter returns it), credit cost, user country, and the owner **Tokens** dashboard (worldwide, filterable).

## Tasks (do in order, each verified before the next)

| # | Task | Done when |
|---|---|---|
| ✅ A1 | Plans, prices, subscriptions, credit balance + append-only credit ledger, credit cost table (DB) + seed Starter/Pro/Gold | Migration applies; seed idempotent |
| ✅ A2 | Entitlements service + server-side gates: model tier, max slides, presentations/month, AI edits, export formats, watermark flag | Tests prove each gate; client flags never trusted |
| ✅ A3 | Credits: estimate → atomic reserve at job create → settle/refund; idempotent; never negative | Concurrency test: parallel jobs can't overdraw |
| ✅ A4 | Pricing API + real pricing section on the site (from DB) + in-app plan/credits widget + upgrade modal; dev-only plan switcher (real checkout = Phase 5, needs Razorpay/Stripe keys) | Pricing page renders DB plans; Starter blocked from export with upgrade prompt |
| ✅ B1 | `model_catalog` table (DB-driven), sync script from OpenRouter catalog, local Vertex rows | `GET /models` returns only models the user's plan allows (others shown locked) |
| ✅ B2 | `OpenRouterProvider` (OpenAI-compatible; usage accounting → tokens + provider-reported cost) behind the existing `AIProvider` interface | Unit tests with recorded fixtures; works with a real key when provided |
| ✅ B3 | Model picker in the create flow; chosen model drives outline/slides; fallback stays within allowed tiers | E2E: pick model → ledger shows that model |
| ✅ C1 | Ledger additions: `provider_reported_cost_usd`, `credit_cost`, user `country`; reconciliation fields | Cost = provider-reported when available, else computed |
| ✅ C2 | Admin API (`role=admin`): tokens in/out/cached/reasoning, calls, cost, by day / model / user / request type / country; filters (range, provider, model, env, status, user) | Non-admin gets 403; numbers match raw ledger sums |
| ✅ (Overview/Tokens/Models/Users/Countries/Errors) C3 | Owner dashboard UI (sidebar; Overview + Tokens + Models) + `make-admin` script | Owner sees worldwide usage |
| ✅ D1 | Editor state: normalized doc store, command/patch-based undo-redo (inverse patches), selection (UI state kept separate) | Unit tests for every command + undo/redo |
| ✅ D2 | Canvas editing: select/move/resize w/ snapping, inline text editing, lock, delete, keyboard shortcuts | Browser E2E |
| ✅ D3 | Slide ops: add (blank/layout), duplicate (new IDs), delete+undo, drag-reorder, move up/down, context menu (reference screenshot 1), speaker notes | Browser E2E |
| ✅ D4 | Autosave + versions: debounced PUT with base-version check (409 on conflict), offline retry, multi-tab safety, version list/restore | Refresh/offline/two-tab tests |
| ✅ D5 | Style drawer (reference screenshot 2): theme switch, slide colors, typography, swap layout (re-compose from stored `content`) | Switch theme keeps content; validation still passes |
| ✅ D6 | AI edit: rewrite/shorten/expand/translate/tone → validated patch on one slide; respects `locked`; credits + ledger | Patch applied through the same command system (undoable) |
| ✅ (watermark, gated export, present mode) D7 | Watermark + gated export UX; present mode | Starter: watermark visible, export → upgrade modal |
| ✅ E1 | Project skills (`.claude/skills/*`) capturing the invariants of this codebase | Skills load; commands in them actually work |

Out of scope here: real payments (Phase 5), PPTX/PDF export implementation (Phase 4 — gate lands now), 200+ templates content (content project; ship the theme/template *system* + a starter set), image generation (needs provider decision), WhatsApp support channel, shared knowledge base internals (flag only).

## Assumptions I'm making (tell me if wrong — each is a data/config change, not a rewrite)
1. Credits **refill monthly** on every plan (Starter 100/mo).
2. Credit cost is a **fixed table per action × model tier** (predictable, shown before you click), while the ledger separately stores the true provider cost for margin analysis.
3. **AI edits are Pro+** (Starter lists none). Starter can still edit manually.
4. Pro credits = 5,000 and Gold = 25,000 (competitor's numbers), with Pro additionally capped at 50 presentations/month; Gold has no presentation cap.
5. Slide caps: Starter 20, Pro 40, Gold 60.
6. Owner dashboard lives inside the editor app under `/admin` (lazy-loaded, API-enforced); can be split to its own subdomain later.

## Status (2026-10-02) — all tasks built and verified
- API: 104 tests · editor: 20 unit tests + 39-check real-browser E2E · layout/theme: 18 · AI: 17 · api-client: 15. Real Gemini (Vertex) verified for generation and AI edit; **OpenRouter provider is unit-tested with fixtures only — no live call yet (no key).**
- Measured on real Gemini: 6-slide deck ≈ 14 s; AI "Shorten" ≈ 2.3 s.

## Known gaps / honest caveats
1. **Advanced-editor gate is UI-only** (moving/resizing/formatting objects); everything costing money or exposing premium content is server-enforced.
2. **Premium templates**: the system exists (4 themes, 2 gated) but "200+ templates" is a content project — pricing copy says "Premium templates", not a number.
3. **"Opus 4.8 Fast"** has no separate OpenRouter model id; omitted. Tier placement (Opus in Pro/premium per your list; newer Sonnet/Opus 5.5 as Gold/frontier) is a product call — editable in `model_catalog`.
4. INR prices are placeholders; no real payments (Phase 5). Export returns 501 after the gate.
5. Vertex prices are AI Studio estimates; reconcile with Cloud Billing.
6. Not built: image generation/replacement upload (URL-only), rich inline text (bold per selection), marquee multi-select, collaboration/share links, brand kit, shared knowledge base, remaining owner sections (sales, subscriptions, margin…).
7. Sitemap lists pages that don't exist yet; landing page contains unverifiable marketing claims (see AUDIT #12).
