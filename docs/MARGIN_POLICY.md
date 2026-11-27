# Margin policy (owner rule, 2026-11-26; applied the same day)

## The rule

The owner set these targets on 2026-11-26. They are measured in the **worst case** (the person spends every credit) and on **INR prices**, which earn the least. USD plans earn about 3.5 times more per credit.

| Plan | Target | Price | Credits / month | Worst-case margin now |
|---|---|---|---|---|
| Starter (free, hidden) | free (acquisition) | ₹0 | 150 | costs us at most $0.17 a user a month |
| Pro | **45-50%** is fine | ₹300 | **1,150** | **50%** |
| Gold | more than Pro | **₹700** (was ₹650) | 2,000 | **63%** |
| Premium | more than Pro | **₹1,300** (was ₹1,200) | 3,700 | **63%** |

Annual prices are the monthly price × 12 × 0.8:

| Plan | Annual |
|---|---|
| Pro | ₹2,880 |
| Gold | ₹6,720 |
| Premium | ₹12,480 |

USD prices did not change ($10 / $19 / $35).

**Plan for 2027-01-01:** the owner will re-price credits and plans when Gemini 3.6 and 3.8 Flash double in price. The cost per credit doubles that day, so the margins above fall unless prices or credits change.

## Dollar plans (checked 2026-11-26)

**Prices are kept:** Pro **$10**, Gold **$19**, Premium **$35** a month. Annual is 20% off: $96, $182.40 and $336 a year. The credits are the same as in INR.

**Margin:** a Razorpay international card costs 3% plus 18% GST on that fee. With the 0.9% Subscriptions add-on, the deduction is about 4.5%; 6% is used here to cover currency conversion. Export of services is zero-rated, so no GST on the price itself.

| Plan | Net revenue | Worst-case AI cost | Margin today | Margin after Flash doubles (2027) |
|---|---|---|---|---|
| Pro | $9.40 | $1.32 | **86%** | about 72% |
| Gold | $17.86 | $2.30 | **87%** | about 74% |
| Premium | $32.90 | $4.26 | **87%** | about 74% |

**Market:** Gamma, the main US rival, charges $12 / $25 / $100 a month (Plus / Pro / Ultra), or $9 / $18 / $90 billed yearly (Oct–Nov 2026 listings). Our monthly prices are below Gamma's at every level, with the margins above. Raising them would cost competitiveness for no margin need.

**Live today, nobody sees the dollar prices.** Production runs with `BILLING_FORCE_CURRENCY=INR`, so the live `/plans` answers `currency: INR`, `country: null`. Two things have to happen before dollar plans work:
1. **The owner** turns on International Payments in the Razorpay dashboard (Razorpay reviews it). Then the server gets `RAZORPAY_INTERNATIONAL=true` and the forced INR is removed.
2. **The visitor's country has to be known.**
   - The code reads it only from a CDN header (`CloudFront-Viewer-Country` or `CF-IPCountry`), and we have no CDN, so today everyone would get USD, Indians included.
   - Proposed fix: look the country up in the API from the visitor's IP with a local country database (DB-IP Lite, free, CC BY 4.0, updated monthly; no outside call per request). Caddy terminates TLS itself, so the IP it forwards is the real one.
   - This is not built; it needs the owner's approval.

## How margin is measured (re-check whenever a price, a model or a plan changes)

1. **Net revenue per month** = price ÷ 1.18 (GST), then minus Razorpay's 2.36%, then converted at the current ₹ per $ (₹93.5 on 2026-11-26).
   - Pro $2.66
   - Gold $6.20
   - Premium $11.51
2. **Cost of an action** comes from the `ai_usage_event` ledger: the average `provider_cost_usd` per action, including the read, understand and retry calls.
   - Never use a remembered figure.
   - Model prices come from [aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing) for the dates in question.
3. **Every action is priced** at `credits = ceil(measured cost ÷ $0.00115)`. So one credit never costs us more than $0.00115.
4. **Worst-case margin** = 1 − (plan credits × $0.00115) ÷ net revenue.

Every plan earns about the same per credit, so one credit price list serves all plans. A plan's margin is set by **its credits and its price**, never by a separate credit list.

## Credit prices (live since migration 0052; measured on Gemini 3.6 Flash, 2026-11-26)

| Action (`credit_cost`) | Measured cost | Credits (was) |
|---|---|---|
| `generate_slide` standard models (deck slide, also a whole-deck rebuild) | $0.0034 | **3** (2) |
| `generate_slide` premium (Gemini 3.1 Pro, Premium's choice) | $0.0115-0.0205, thinking tokens included | **12** (5) |
| `ai_edit` standard: one Edit with AI message (understanding, all code-only changes, the first written slide) | $0.0046 | **4** (2) |
| `ai_edit` premium | about $0.013 | **12** (4) |
| `ai_write_slide` (new): each further slide the AI writes in the same message, and each slide "add detail from my document" expands | $0.0034 | **3** standard / **12** premium |
| `image` standard (Fast images) | $0.0336 | **30** (20) |

These did not change:
- premium and frontier images (60 / 200);
- read image, read media, read video (4 / 6 / 3);
- web research (60);
- ask your deck (1).

Code-only changes are never charged extra: theme, colours, fonts, moving, deleting and undo.

How a message's price is built (`priceUnits` in `assistant/pipeline.ts`, charged in `routes/presentations.ts`):
- 0 units = free;
- 1 unit = `ai_edit`;
- each unit above 1 = one more written slide at `ai_write_slide`.

Every confirm question (the plan preview, bulk rewrite, adding 4 or more slides) states the credits before "Go ahead".

**Open:** the Gemini 3.1 Pro cost comes from only 27 calls. Re-measure it before launch.

## Checklist when anything about money or models changes

- [ ] Re-measure the action's cost from the ledger, and get a fresh Google price if a model changed.
- [ ] Credits = ceil(cost ÷ 0.00115). Update `credit_cost` in the seed **and** in a migration, because seeds never overwrite.
- [ ] Recompute every plan's worst-case margin against the targets above.
- [ ] The credit price is shown before any costly action.
- [ ] Update this file, the plans-and-entitlements skill and the memory note.

## Credit top-ups (2026-11-27)

A top-up sells **the plan's own monthly credits at the plan's own monthly price** (docs/CREDIT_TOP_UPS.md), so its margin is the plan's margin — there is no second price to keep in line, and the 2027-01-01 re-pricing moves top-ups with it automatically. If a top-up ever becomes a *discounted* pack, its margin must be computed separately against the same `credits = ceil(cost ÷ $0.00115)` rule, and it must never be cheaper per credit than the plan above it.
