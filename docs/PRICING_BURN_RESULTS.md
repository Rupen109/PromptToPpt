# Pricing calibration: real customers burning real credits

Run on 2026-10-26 against the production-built API with the **dev AI provider (Google Vertex / Gemini)**. Each plan was bought through the real checkout → confirm path (stand-in Razorpay, real signatures), then used like a customer: make a deck, then 4–10 edits / assistant restyles / pictures / hand edits, then the next deck, until credits ran out (or a cap hit). Every number comes from what the server recorded (`ai_usage_event`, `credit_ledger`).
Scripts: `services/api/scripts/pricing-burn.ts`, `pricing-report.ts`. **OpenRouter (production provider) pass: pending the key.**

| | Pro (₹499) | Gold (₹1,200) |
|---|---|---|
| Credits spent | 2,986 / 3,000 (ran to zero) | 8,130 / 10,000 (stopped at the 90-minute cap, not by credits) |
| Decks / slides made | 47 / (not counted) | 89 / 919 |
| Real model cost (recorded) | **$2.06** | **$6.06** |
| Cost per 1,000 credits | **$0.69** | **$0.745** |
| Cost per deck (incl. its edits) | $0.044 | $0.068 |
| Full allowance at this mix | ≈ $2.07 | ≈ $7.45 |
| Margin vs net revenue, India | **56 %** | **34 %** |
| Margin vs net revenue, international ($15 / $30) | 85 % | 74 % |

Net revenue per month used (after GST and gateway fees, docs/PRICING_MODEL.md): Pro India $4.67, Pro intl $14.27, Gold India $11.23, Gold intl $28.83.

## Where the money goes (Gold, recorded cost)
| Action | Calls | Cost | Avg per call |
|---|---|---|---|
| AI pictures | 76 | $2.75 (45 %) | $0.036 |
| Slide writing | 362 | $1.37 | $0.0038 |
| Assistant restyles | 104 | $0.92 | $0.0088 |
| AI edits | 482 | $0.49 | $0.0010 |
| Outlines | 92 | $0.42 | $0.0045 |
| Deck critic + prompt analysis | 132 | $0.11 | <$0.002 |

Pro looks the same: pictures were 45 % of its cost ($0.94 of $2.06).

## Findings
1. **Pictures are the expensive thing.** A starter picture costs ≈ $0.034–0.036 for 20 credits = ≈ $0.0017 per credit, about 2.4× the average cost per credit and 1.5× what a Gold credit earns in India ($0.00112). The monthly picture caps (60 / 100) are what protect margin; the credit price alone does not.
2. **Gold in India is the thinnest plan** (34 % before unrecorded spend). Levers: raise the India Gold price, raise the picture credit price, or lower the picture cap.
3. **Our usage record matched Google's bill for this run.** Owner readings: ₹27,146.99 → ₹25,972.65 = **₹1,174.34 ≈ $13.34** burned; the usage table recorded **$13.40** for the same window (2,972 calls, including the two earlier partial runs). Coverage ≈ 100 %, so the margins above need no correction. (The 52–86 % gaps in older readings came from other spend on the project, not from missed calls here.)
4. **Failed AI calls still cost money**: about $0.18 (Pro) and a similar share on Gold, mostly Vertex "resource exhausted" retries on one model.
5. **The per-account daily cap ($6 / 24 h, `AI_USER_USD_DAY`) stopped the Gold customer** (429 `DAILY_AI_LIMIT`, plain message, work safe). A Gold customer using the whole allowance at this mix ($7.45) cannot do it in one day: protective, but it should be mentioned to heavy users. The generation limit is 20 decks / 24 h (`GENERATION_DAILY_LIMIT`, raised for this test only).
6. **Pro never reached its 50-decks-a-month cap**: credits ran out first at 47 decks.
7. **`ai_usage_event.credit_cost` is always 0**, so cost-vs-credit per action cannot be read from one table; the credit ledger has the credits. Fill the column when charging (reporting gap).
8. The "at zero credits" refusal message was **not verified**: Gold stopped at the time cap, and the Pro script hung before its zero-credit check. Test it separately.

## Not covered
Vertex Gemini only (dev). Production uses OpenRouter, with different models and prices: re-run `PLANS=pro,gold pnpm tsx scripts/pricing-burn.ts` with that key and a spend cap. One mix of behaviour was simulated; real customers use fewer pictures and assists than this mix, so these margins are a worst-realistic case, not an average.
