import { bodyLimit } from 'hono/body-limit'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { planIdSchema, type Currency, type PlanView } from '@prompttoppt/validation'
import { getEntitlements } from '../billing/entitlements.ts'
import { razorpayEnabled, razorpayTestMode } from '../billing/razorpay.ts'
import { cancelAtPeriodEnd, confirmCheckout, handleWebhook, startCheckout, subscriptionSummary } from '../billing/subscriptions.ts'
import { db } from '../db/index.ts'
import { plan, planPrice, subscription } from '../db/schema.ts'
import { env } from '../env.ts'
import { audit, ipOf } from '../lib/audit.ts'
import { countryFromHeaders } from '../lib/country.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const billing = new Hono<AppEnv>()

/**
 * Country → billing currency, from a header our own edge sets (CloudFront-Viewer-Country / Cloudflare), never from
 * the client. In development only, `x-debug-country` lets us preview India pricing locally.
 * Payment authorisation must re-derive this server-side; this only decides what the pricing page displays.
 */
export function detectCurrency(headers: Headers): { country: string | null; currency: Currency } {
  const country = countryFromHeaders(headers)
  return { country, currency: env.BILLING_FORCE_CURRENCY ?? (country === 'IN' ? 'INR' : 'USD') }
}

billing.get('/plans', async (c) => {
  const { currency, country } = detectCurrency(c.req.raw.headers)
  const [plans, prices] = await Promise.all([db.select().from(plan).where(eq(plan.isActive, true)).orderBy(plan.sortOrder), db.select().from(planPrice).where(eq(planPrice.isActive, true))])
  const data: PlanView[] = plans.map((p) => ({
    id: p.id as PlanView['id'], name: p.name, monthlyCredits: p.monthlyCredits, maxSlides: p.maxSlides,
    maxPresentationsPerMonth: p.maxPresentationsPerMonth, maxImagesPerPresentation: p.maxImagesPerPresentation, maxImagesPerMonth: p.maxImagesPerMonth, features: p.features,
    prices: prices.filter((x) => x.planId === p.id && x.currency === currency).sort((a, b) => (a.interval === 'month' ? -1 : 1) - (b.interval === 'month' ? -1 : 1)).map((x) => ({ interval: x.interval as 'month' | 'year', amountMinor: x.amountMinor, currency })),
  }))
  c.header('Cache-Control', 'public, max-age=60, s-maxage=300')
  c.header('Vary', 'CloudFront-Viewer-Country, CF-IPCountry')
  return c.json({ success: true, data: { currency, country, plans: data } })
})

billing.get('/me/entitlements', requireAuth, async (c) => {
  const { period: _period, ...ent } = await getEntitlements(c.get('session')!.user.id)
  return c.json({ success: true, data: ent })
})

// ─── payments (Razorpay) ────────────────────────────────────────────────────

/** Starts a checkout. Plan price and currency are resolved server-side; the browser only names plan + interval. */
billing.post('/billing/checkout', requireAuth, rateLimit({ windowMs: 60_000, max: 10, key: byUser('checkout') }), zValidator('json', z.object({ planId: z.enum(['pro', 'gold']), interval: z.enum(['month', 'year']) })), async (c) => {
  const { user } = c.get('session')!
  const { planId, interval } = c.req.valid('json')
  const session = await startCheckout(user.id, planId, interval, detectCurrency(c.req.raw.headers).currency)
  return c.json({ success: true, data: { ...session, prefill: { name: user.name ?? '', email: user.email } } })
})

/** Checkout finished in the browser: verify Razorpay's signature, then activate. (The webhook does the same independently.) */
billing.post(
  '/billing/verify', requireAuth, rateLimit({ windowMs: 60_000, max: 20, key: byUser('verify') }),
  zValidator('json', z.object({ razorpay_payment_id: z.string().min(5).max(64), razorpay_subscription_id: z.string().min(5).max(64), razorpay_signature: z.string().min(32).max(128) })),
  async (c) => {
    const b = c.req.valid('json')
    const userId = c.get('session')!.user.id
    await confirmCheckout(userId, { paymentId: b.razorpay_payment_id, subscriptionId: b.razorpay_subscription_id, signature: b.razorpay_signature })
    const { period: _p, ...ent } = await getEntitlements(userId)
    return c.json({ success: true, data: ent })
  },
)

billing.get('/billing/subscription', requireAuth, async (c) => c.json({ success: true, data: { ...(await subscriptionSummary(c.get('session')!.user.id)), billingEnabled: razorpayEnabled(), testMode: razorpayTestMode() } }))

billing.post('/billing/cancel', requireAuth, rateLimit({ windowMs: 60_000, max: 10, key: byUser('cancel') }), async (c) => {
  const userId = c.get('session')!.user.id
  await cancelAtPeriodEnd(userId)
  void audit(userId, 'billing.cancel_requested', {}, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: await subscriptionSummary(userId) })
})

/** Razorpay → us. No session: authenticity is the HMAC of the raw body. */
billing.post('/webhooks/razorpay', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'Payload too large' } }, 413) }), rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
  const { status, body } = await handleWebhook(await c.req.text(), c.req.raw.headers)
  return c.json(body, status)
})

// NOTE: there is intentionally no 'set my plan' endpoint. Plans change only through verified payment webhooks (or the admin-run QA scripts).
