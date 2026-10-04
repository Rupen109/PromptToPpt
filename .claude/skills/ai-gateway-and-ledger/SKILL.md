---
name: ai-gateway-and-ledger
description: Rules for calling AI models in promptToPpt — always via AIGateway, how routing/fallback/repair works, what the usage ledger records, how cost and tokens are measured, thinking-budget policy. Use when adding any feature that calls a model, or touching packages/ai or the usage ledger.
---

# AI gateway & usage ledger

## The rule
Application code **never** calls a provider SDK/fetch directly. It calls `gateway.run({...})` (`services/api/src/ai/gateway.ts`), which:
`resolve chain → (retry+backoff on retryable) → fallback → JSON parse → Zod validate → one "repair" re-ask → ledger row per attempt`.

```ts
await gateway.run({
  route: 'quality',            // 'fast' (analysis/directions) | 'quality' (outline/slides/edits)
  model: opts.model,           // optional catalog id the USER picked → chain = that model + same-tier fallbacks only
  requestType: 'slide_content',// ledger label (AIRequestType in packages/types)
  system, prompt, schema,      // schema = Zod; output is validated, never trusted
  ctx: { userId, jobId, presentationId },
})
```

## What gets recorded (`ai_usage_event`, append-only)
provider, model, model_version, request_type, input/cached/output/**reasoning** tokens, image_count, latency_ms, status+error_code, **`provider_cost_usd`** (OUR computation from a pricing snapshot — reproducible), **`provider_reported_cost_usd`** (what OpenRouter says it charged — for reconciliation), `pricing_snapshot_id`, environment, `credit_cost` (billing). `user_id`/`job_id` are deliberately **not** FKs (ledger outlives users).
Failures are rows too (retry/fallback/failure-rate metrics depend on it).

## Policies
- **Thinking budget defaults to 0** (`defaultThinkingBudget`). Measured on Gemini: 69s→17s and ~half the cost per deck with no visible quality loss. Override per call only with a reason.
- **No silent downgrades**: user-picked model falls back only within the same access tier.
- Credits are charged by (action × tier) from `credit_cost` — separate from provider dollars. Never derive customer price from tokens at request time.
- Prompts: system text is trusted/static; user & source text goes in `<user_request>`/`<source>` tags via `neutralise()`. Never ask a model for numbers/quotes not in the request or sources; `policy.ts` removes chart/metrics layouts when no numbers exist.
- Provider errors must not leak keys (`scrub()` in providers) and never reach users — `publicError()` in the worker.

## Testing
Use `AI_PROVIDER=mock` (`ai/mock-model.ts`, routes by a `[task:*]` marker in the system prompt). Tests run on their own DB (`prompttoppt_test`, created by `test-global-setup.ts`). Verify a real key with `pnpm --filter @prompttoppt/api ai:check`.
