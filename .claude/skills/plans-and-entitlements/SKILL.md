---
name: plans-and-entitlements
description: How plans (Starter/Pro/Gold), feature gates, credits, and pricing work in SlidesDone — where limits are enforced, how to add a gated feature or change a plan, and what must never be trusted from the client. Use when touching billing, limits, export, AI edits, model access, or the pricing page.
---

# Plans, entitlements, credits

## Source of truth
Tables `plan`, `plan_price`, `credit_cost`, `subscription` (no row = Starter). Seeds: `services/api/src/billing/seed.ts` (insert-if-missing). Shared types: `packages/validation/src/plans.ts`. **Prices and features are data — never hard-code them in UI copy**; `planHighlights()` / `monthlyDisplay()` (`packages/api-client/src/plans.ts`) generate pricing text from plan data.

Plans v5 (docs/PLANS_AND_FEATURES_V5.md; always re-read the `plan` table, these numbers can change as data):

| | Starter (hidden, free) | Pro ₹300 | Gold ₹700 | Premium ₹1,300 |
|---|---|---|---|---|
| credits/month | 150 | 1,150 | 2,000 | 3,700 |
| AI edits | no | yes | yes | yes |
| model choice | no | no | no | yes (`modelChoice`) — in the CREATE flow only; the AI chat never asks anyone |
| top-up | no | yes | yes | yes |

These are the values since migration 0052 (2026-11-26).

## Margins: the owner's rule (read docs/MARGIN_POLICY.md before ANY price, credit, plan or model change)

**Worst-case margin** (the person spends every credit; INR prices):

| Plan | Owner's target | Now |
|---|---|---|
| Pro | 45-50% | 50% |
| Gold | more than Pro | 63% |
| Premium | more than Pro | 63% |

**How to price:**
- Net revenue = price ÷ 1.18 GST, then minus Razorpay's 2.36%, at the live ₹ per $ rate.
- Every plan earns about $0.0029 per credit, so one credit list serves all plans.
- Price every action at `credits = ceil(measured cost ÷ $0.00115)`. Measure the cost from the `ai_usage_event` ledger, including the read, understand and retry calls. Never use a figure from memory.
- A plan's margin is set by its credits and its price.

**Live credit prices (standard / Gemini 3.1 Pro):**

| Action | Credits |
|---|---|
| `generate_slide` | 3 / 12 |
| `ai_edit` (one message: understanding, code-only changes, first written slide) | 4 / 12 |
| `ai_write_slide` (each further slide written, and each enriched slide) | 3 / 12 |
| `image` standard | 30 |

Code-only changes (theme, colours, fonts, move, delete, undo) cost nothing extra. Confirm questions state the credits.

**A feature that makes many model calls** charges per slide written (`priceUnits` → `ai_write_slide`), never a flat price. Flat prices for big work lose money.

**Gemini 3.6 and 3.8 Flash double in price on 2027-01-01.** The owner re-prices credits and plans then.

## Enforcement (server only)
`getEntitlements(userId)` → used by every gated route; gates throw `GateError` (`UPGRADE_REQUIRED` 403 | `INSUFFICIENT_CREDITS` 402 | `LIMIT_REACHED` 429) rendered as `{error:{code,message,details}}`. Existing gates: `assertModelTier`, `assertSlideLimit`, `assertPresentationQuota`, `assertAiEdits`, `assertExport`.
The client only displays: `isGateError(e)` → open `UpgradeModal`. Watermark is a **view-time overlay** from entitlements (not stored in the document).

## Adding a gated feature
1. Add the flag to `planFeaturesSchema` + each plan in `seed.ts` (and a migration/UPDATE for existing DBs, since seeds don't overwrite).
2. Write `assertX(ent)` in `billing/entitlements.ts`; call it in the route **before** any work or spend.
3. Add a row to `billing.test.ts` proving Starter is refused and the right plan passes.
4. Surface it in `planHighlights()` so the pricing page stays truthful.

## Credits
**Two pots in `credit_balance`:** `balance` = the plan's allowance for this period (reset every period, no rollover) and `extra` = credits BOUGHT as a top-up (a reset never touches them). Spending takes `balance` first, then `extra`; `credit_ledger.extra_delta` records the split so a refund returns each credit to its own pot. `credits.balance` in the entitlements is the two added up, `credits.bought` is the `extra` part.

`ensureAllowance` lazily grants the plan allowance per period (monthly for Starter; subscription period for paid; unique key per (user, period) → exactly once). `reserveCredits(user, n, refType, refId)` is atomic (row lock), idempotent per ref, never negative (CHECK constraints on both pots). Refund on cancel/failure (`refundCredits`). Job flow: gates → reserve estimate → insert job → (race loser refunds). Ledger `credit_ledger` is append-only.

## Credit top-ups (docs/CREDIT_TOP_UPS.md)
Running out mid-month does not force an upgrade: a paid plan can buy **its own plan's credits again at its own plan's monthly price** (`services/api/src/billing/top-ups.ts`, `/billing/top-up`, `/billing/top-up/checkout`, `/billing/top-up/verify`). It is a one-off Razorpay **order**, not a subscription: the plan, the renewal date and the cycle do not change, and Starter is offered a plan instead. What is sold is read from `plan` + `plan_price` and written to `credit_top_up` **before** anyone pays; the grant is keyed on that row, so the browser's confirmation and the webhook (`order.paid`, `payment.captured`) can both run and still grant once. A refunded/disputed top-up takes back only its own credits (`clawbackExtra`), never the plan.

## Not built yet
Stripe (international cards beyond Razorpay's USD support). Plan changes in production must come from verified webhooks; the QA scripts are dev-only.


## Payments (Razorpay)
Real subscriptions live in `services/api/src/billing/{razorpay,subscriptions}.ts` and `routes/billing.ts` (`/billing/checkout|verify|subscription|cancel`, `/webhooks/razorpay`). Read `docs/BILLING.md` first. Invariants: price/currency are decided server-side; the checkout signature and webhook HMAC are verified on raw bytes; `applySubscription` is idempotent and never regresses a period or ends paid access early; the provider plan id must match `plan_price.provider_price_id`; tests stub `razorpay` (never the network, never real keys — `vitest.config.ts` injects fake ones). Dev-only `/dev/set-plan` still exists for gating tests.
