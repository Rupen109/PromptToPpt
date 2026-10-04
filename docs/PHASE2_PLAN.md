# Phase 2 — Generation MVP (plan)

Spec refs: §5 prompt intelligence, §6 sources, §7 pipeline, §8 design system, §13–14 AI + usage ledger, App. A/B.
Goal (spec §21): **prompt → analysis → outline → slide JSON → render → editor**, broad-topic clarification, basic source ingestion, AI usage tracking.

| # | Task | Spec | Done when |
|---|---|---|---|
| ✅ T1 | Presentation document schema (Zod, single source) + semantic slide content + outline + prompt-analysis schemas; ERD doc | §5, §8, App. B | Schemas validate fixtures; legacy duplicate types removed |
| ✅ T2 | DB: presentations, versions, generation_jobs (idempotency key), ai_usage_events (immutable ledger), model_pricing_snapshots, source_documents/chunks | §12, §13 | Migration applies; ledger has no UPDATE/DELETE path |
| ✅ T3 | `packages/ai`: Provider interface, ModelRegistry (+capabilities, pricing), GeminiProvider, MockProvider, cost + usage normalization, routing + fallback | §13 | Unit tests; real Gemini call once key is enabled |
| ✅ T4 | AI gateway in API: every call (success **and** failure) writes an `ai_usage_event` with provider/model/tokens/latency/cost/env/user/job | §14 | Test: failed call still produces a ledger row |
| ✅ T5 | Prompt analysis + broad-topic **directions** (deterministic policy layer around the model; injection-safe prompts) | §5 | Broad → 3–4 directions; detailed → straight through |
| ✅ T6 | Async generation: Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`) behind a `JobQueue` interface (SQS swap in prod), stage machine, idempotency, cancel, progress | §7 | Job survives retry without duplicate deck/charge |
| ✅ T7 | Deterministic layout engine (content + theme + aspect → positioned elements) + validators (schema, overflow, contrast, duplicate layout, completeness) | §7–8 | Pure functions, unit-tested |
| ✅ T8 | Editor: create flow (analyze → direction cards → options → live progress) and read-only deck viewer (thumbnails + canvas) | §3–4 | Browser E2E passes |
| ✅ T9 | Source ingestion v1: pasted text, website URL (main-content extraction, SSRF-safe), PDF text; sources fed to generation as **untrusted data** with citations | §6, §18 | Deck cites a supplied source |
| ✅ T10 | Hardening: tests, ADRs (queue, layout engine, document model), docs, secret-leak scan | §20 | typecheck/lint/test/build green |

Out of scope here (later phases): rich editing canvas (P3), export/share (P4), billing/credits (P5), owner dashboard UI (P6), image generation (needs a billing-enabled key), audio/YouTube/PPTX ingestion.

Key design decisions
- **Models never emit coordinates.** They emit *semantic* slide content; a deterministic layout engine places elements. Cheaper, validatable, and keeps designs coherent across theme changes (§3 "design system must remain coherent").
- **Document JSON is canonical** (§11 of the master prompt): elements carry absolute positions in fixed canvas units so the same data drives the editor, present mode and PPTX export.
- **Ledger first.** The gateway is the only way to call a model; nothing bypasses it.

## Status (2026-10-02)
All ten tasks implemented, tested, and **verified against real Gemini via Vertex AI** (service-account-bound "express" key, `AI_PROVIDER=vertex`).

Measured on a real 8-slide deck (3.1-flash-lite for analysis/directions, 3.6-flash for outline + slides):
| | before tuning | after `thinkingBudget: 0` |
|---|---|---|
| wall-clock | ~69 s | ~17 s |
| thinking tokens | ~3,400 | 0 |
| est. provider cost | ~$0.021 | ~$0.010 |
Costs are **estimates**: Vertex pricing wasn't retrievable, so AI Studio list prices are assumed (flagged on the pricing snapshot). Reconcile against the Cloud Billing report; the free-trial credit covers it.

Known limits: `gemini-2.5-flash-lite` is not available in this project/region (removed from the default fast chain). No images yet — slides with `split-image-text` show a labelled placeholder; image generation (Vertex/Gemini image models) is the next AI task. Audio/YouTube/PPTX ingestion and S3 retention of uploaded originals are deferred.
