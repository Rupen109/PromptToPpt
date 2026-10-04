---
name: plans-and-entitlements
description: How plans (Starter/Pro/Gold), feature gates, credits, and pricing work in promptToPpt — where limits are enforced, how to add a gated feature or change a plan, and what must never be trusted from the client. Use when touching billing, limits, export, AI edits, model access, or the pricing page.
---

# Plans, entitlements, credits

## Source of truth
Tables `plan`, `plan_price`, `credit_cost`, `subscription` (no row = Starter). Seeds: `services/api/src/billing/seed.ts` (insert-if-missing). Shared types: `packages/validation/src/plans.ts`. **Prices and features are data — never hard-code them in UI copy**; `planHighlights()` / `monthlyDisplay()` (`packages/api-client/src/plans.ts`) generate pricing text from plan data.

| | Starter | Pro | Gold |
|---|---|---|---|
| credits/mo | 100 | 5,000 | 25,000 |
| slides/deck | 20 | 40 | 60 |
| presentations/mo | — | 50 | — |
| watermark | yes | no | no |
| export | none | pptx/pdf/png/jpg/html | same |
| AI edits / advanced editor | no | yes | yes |
| model tiers | starter | +premium | +frontier |
| brand kit, knowledge base, speed | — | speed fast | yes, yes, ultra |

## Enforcement (server only)
`getEntitlements(userId)` → used by every gated route; gates throw `GateError` (`UPGRADE_REQUIRED` 403 | `INSUFFICIENT_CREDITS` 402 | `LIMIT_REACHED` 429) rendered as `{error:{code,message,details}}`. Existing gates: `assertModelTier`, `assertSlideLimit`, `assertPresentationQuota`, `assertAiEdits`, `assertExport`.
The client only displays: `isGateError(e)` → open `UpgradeModal`. Watermark is a **view-time overlay** from entitlements (not stored in the document).

## Adding a gated feature
1. Add the flag to `planFeaturesSchema` + each plan in `seed.ts` (and a migration/UPDATE for existing DBs, since seeds don't overwrite).
2. Write `assertX(ent)` in `billing/entitlements.ts`; call it in the route **before** any work or spend.
3. Add a row to `billing.test.ts` proving Starter is refused and the right plan passes.
4. Surface it in `planHighlights()` so the pricing page stays truthful.

## Credits
`ensureAllowance` lazily grants the plan allowance per period (monthly for Starter; subscription period for paid; reset, no rollover; unique key → exactly once). `reserveCredits(user, n, refType, refId)` is atomic (row lock + `balance >= n`), idempotent per ref, never negative (CHECK constraint). Refund on cancel/failure (`refundCredits`). Job flow: gates → reserve estimate → insert job → (race loser refunds). Ledger `credit_ledger` is append-only.

## Not built yet
Real payments (Razorpay India / Stripe intl) — `POST /dev/set-plan` exists for dev/staging only (404 in production). Plan changes in production must come from verified webhooks. INR prices in the seed are **placeholders**. Export rendering returns 501 after the gate passes.


## Payments (Razorpay)
Real subscriptions live in `services/api/src/billing/{razorpay,subscriptions}.ts` and `routes/billing.ts` (`/billing/checkout|verify|subscription|cancel`, `/webhooks/razorpay`). Read `docs/BILLING.md` first. Invariants: price/currency are decided server-side; the checkout signature and webhook HMAC are verified on raw bytes; `applySubscription` is idempotent and never regresses a period or ends paid access early; the provider plan id must match `plan_price.provider_price_id`; tests stub `razorpay` (never the network, never real keys — `vitest.config.ts` injects fake ones). Dev-only `/dev/set-plan` still exists for gating tests.
