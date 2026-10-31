# Billing — Razorpay (test mode first)

## Flow
1. Editor `POST /api/v1/billing/checkout {planId, interval}` → server picks **currency** (`BILLING_FORCE_CURRENCY` → else visitor country: IN→INR, else USD), looks the price up in `plan_price`, lazily creates the Razorpay **plan** (immutable, id cached in `plan_price.provider_price_id`), creates a Razorpay **subscription** with `notes {userId, planId, interval, currency}` and returns `{keyId, subscriptionId}`. The browser never sends or chooses a price.
2. Browser opens Razorpay Checkout (`checkout.js`, loaded on demand). On success it calls `POST /billing/verify` with Razorpay's `{payment_id, subscription_id, signature}`.
3. Server verifies `HMAC_SHA256(payment_id|subscription_id, KEY_SECRET)`, fetches the subscription from Razorpay, checks `notes.userId === session user`, and activates it (`applySubscription`).
4. Razorpay also calls `POST /api/v1/webhooks/razorpay` (HMAC of the RAW body with `RAZORPAY_WEBHOOK_SECRET`) for activation, every renewal (`subscription.charged`), failures, cancellation. Both paths use the same idempotent `applySubscription`, so they can race or repeat safely. **The webhook is the source of truth for renewals** — without it a plan would lapse at the end of the first period.
5. Credits: the plan allowance is granted lazily when the subscription period key changes (no rollover). Upgrading resets the balance to the new plan's allowance.

## Rules enforced in code (`services/api/src/billing/subscriptions.ts`, covered by `payments.test.ts`)
- Events about a replaced subscription are ignored; switching plan cancels the old Razorpay subscription immediately (no proration yet).
- A running period never moves backwards (out-of-order delivery). Cancelled/completed keep access until the paid period ends; `halted` (renewals failing) ends access.
- A subscription is only applied if its Razorpay `plan_id` equals the one we created for exactly (plan, currency, interval) — notes alone are not trusted.
- Webhook dedupe by `X-Razorpay-Event-Id` (else content hash), recorded only after successful handling → failures return 500 and Razorpay retries.
- `payment` table: one row per Razorpay payment id (captured / failed / refunded) — feeds the owner Sales & Margin sections.
- USD checkout is refused (`CURRENCY_UNAVAILABLE`) unless `RAZORPAY_INTERNATIONAL=true`.
- Production boot fails if keys/mode don't match `APP_ENV` (live keys ⇔ production) or the webhook secret is missing.

## Local setup (test mode)
```
# services/api/.env
RAZORPAY_KEY_ID=rzp_test_…          # public
RAZORPAY_KEY_SECRET=…               # the 24-char secret only (NOT "id,secret")
RAZORPAY_WEBHOOK_SECRET=…           # any long random string; same value in the dashboard
BILLING_FORCE_CURRENCY=INR          # until international payments are enabled
pnpm --filter @prompttoppt/api billing:sync-plans   # optional: creates the 4 plans now and surfaces config errors early
```
Webhook (needed for renewals/failed-payment events; checkout itself works without it locally):
`cloudflared tunnel --url http://localhost:4000` (or ngrok) → Dashboard → Settings → Webhooks → URL `<tunnel>/api/v1/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `subscription.activated, .charged, .pending, .halted, .cancelled, .completed, .paused, .resumed` and `payment.failed`.

Test payments for **subscriptions** (Razorpay's current list, https://razorpay.com/docs/payments/recurring-payments/cards/test-cards , checked 2026-10-30): Visa `4100 2800 0000 1007` (or Mastercard `5305 6200 0006 0000`, RuPay `6527 6589 0000 1005`, or the older Visa `4718 6091 0820 4366`), any future expiry, any CVV; on the mock bank page choose **Success**. UPI: `success@razorpay` (fail: `failure@razorpay`). The generic `4111 1111 1111 1111` and the old Mastercard `5267 3181 8797 5449` now answer "This card is not eligible for recurring payments". To see failures on purpose: Visa `4100 2800 0006 0011` = not eligible, `4100 2800 0005 0004` = declined, `4100 2800 0008 0001` = insufficient funds.

**"The payment provider refused the request: The ID provided is invalid or could not be found."** The Razorpay plan ids saved in `plan_price.provider_price_id` belong to a different Razorpay account (keys were changed, test ↔ live, or a plan was deleted in the dashboard). Checkout now heals itself once (forgets the id, creates the plan again, retries). By hand: `UPDATE plan_price SET provider_price_id = NULL;` then `pnpm --filter @prompttoppt/api billing:sync-plans`.

## Test payments (no Razorpay needed): `PAYMENTS_SIMULATOR=true`
Razorpay's sandbox cannot fully test subscriptions (recurring-eligible cards change, the card-saving OTP step, no way to trigger a renewal or a refund). So the server has its own stand-in provider (`src/billing/simulator.ts`, `test-payments.ts`):
* Set `PAYMENTS_SIMULATOR=true` in `services/api/.env` and restart the API. Subscribe now opens **our own "Test payment" window** (Pay / Make this payment fail / Cancel) instead of Razorpay's. No account, card, phone number or internet is needed.
* Everything after the button is the REAL code: the signed result goes through the normal `/billing/verify`, then plan activation, credits, the receipt e-mail, the payment history. "Fail" records a failed payment and sends the failure e-mail.
* The Billing page gets a **Test payment tools** box: *Simulate next renewal* (period moves forward, a new payment, credits renew) and *Simulate full refund* (plan ends, credits taken back: the same path a real refund webhook takes). Cancel renewal works too.
* Safety: it is **off by default**; every route that drives it answers 404 when off; the API **refuses to start** with it on when `APP_ENV=production`; the stand-in signs with its own secret, so a simulator signature is worthless against a real-Razorpay server. State of a pending test payment lives in memory (a restart means: close the window, click Subscribe again).
* To use Razorpay's real test mode again: set `PAYMENTS_SIMULATOR=false` (checkout then heals the plan ids by itself, see above). Proof: `e2e/suites/48-test-payments.mjs` (9 browser checks), `billing/simulator.test.ts` (10 API checks).

## Going live (later)
Create live keys + a live webhook, set `APP_ENV=production` with `rzp_live_` keys (boot refuses a mismatch), recreate plans (`provider_price_id` is per mode — clear it: `UPDATE plan_price SET provider_price_id = NULL`), enable International Payments → set `RAZORPAY_INTERNATIONAL=true` and remove `BILLING_FORCE_CURRENCY`. If a price changes, clear its `provider_price_id` (Razorpay plans are immutable). Not built yet: proration on plan switch, refunds UI, invoices/GST invoices, dunning emails, UPI-autopay mandate edge cases.
