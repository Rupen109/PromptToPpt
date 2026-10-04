/**
 * Creates the Razorpay plans (Pro/Gold × monthly/yearly) for every currency we can charge, and stores their ids on
 * `plan_price.provider_price_id`. Idempotent. Checkout also does this lazily, so running it is optional — it just surfaces
 * configuration problems (bad keys, currency not enabled) before a customer hits them.
 *   pnpm --filter @prompttoppt/api billing:sync-plans
 * If you CHANGE a price in `plan_price`, clear its provider_price_id first (Razorpay plans are immutable).
 */
import { env } from '../src/env.ts'
import { razorpayEnabled } from '../src/billing/razorpay.ts'
import { ensureProviderPlan } from '../src/billing/subscriptions.ts'

if (!razorpayEnabled()) {
  console.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in services/api/.env')
  process.exit(1)
}
const currencies = env.RAZORPAY_INTERNATIONAL ? (['INR', 'USD'] as const) : (['INR'] as const)
let failed = false
for (const planId of ['pro', 'gold']) {
  for (const currency of currencies) {
    for (const interval of ['month', 'year'] as const) {
      try {
        const r = await ensureProviderPlan(planId, currency, interval)
        console.log(`✓ ${planId} ${currency} ${interval}: ${r.providerPlanId} (${(r.amountMinor / 100).toLocaleString()} ${currency})`)
      } catch (e) {
        failed = true
        console.error(`✗ ${planId} ${currency} ${interval}:`, (e as Error).message)
      }
    }
  }
}
process.exit(failed ? 1 : 0)
