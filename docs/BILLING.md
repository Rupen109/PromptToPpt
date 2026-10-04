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

Test payments for **subscriptions**: the generic `4111 1111 1111 1111` card is *not* recurring-eligible ("This card is not eligible for recurring payments"). Use Mastercard `5267 3181 8797 5449` (or Visa `4718 6091 0820 4366`), any future expiry, any CVV, any OTP; or UPI `success@razorpay` (fail: `failure@razorpay`).

## Going live (later)
Create live keys + a live webhook, set `APP_ENV=production` with `rzp_live_` keys (boot refuses a mismatch), recreate plans (`provider_price_id` is per mode — clear it: `UPDATE plan_price SET provider_price_id = NULL`), enable International Payments → set `RAZORPAY_INTERNATIONAL=true` and remove `BILLING_FORCE_CURRENCY`. If a price changes, clear its `provider_price_id` (Razorpay plans are immutable). Not built yet: proration on plan switch, refunds UI, invoices/GST invoices, dunning emails, UPI-autopay mandate edge cases.
