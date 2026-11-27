import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Currency, TopUpOffer } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { creditTopUp, plan, planPrice, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { audit } from '../lib/audit.ts'
import * as mail from '../lib/email-templates.ts'
import { sendMail } from '../lib/mailer.ts'
import { clawbackExtra, creditPots, grantExtraCredits } from './credits.ts'
import { getEntitlements } from './entitlements.ts'
import { BillingError } from './errors.ts'
import { SIM_KEY_ID, simulatorEnabled } from './simulator.ts'
import { razorpay, razorpayEnabled, razorpayTestMode, RazorpayApiError, verifyOrderSignature, type RzpOrder, type RzpPayment } from './razorpay.ts'
import { priceId, recordPayment } from './subscriptions.ts'

/**
 * CREDIT TOP-UPS — "my credits ran out before the month did".
 *
 * What is sold: **the plan you are already on, again**. Its monthly credits, at its monthly price, added now. One thing to buy, no new price list,
 * and the credits-per-rupee is exactly the plan's, so the margins in docs/MARGIN_POLICY.md hold without any new sum.
 *  · Bought credits go in their own pot (`credit_balance.extra`): the monthly reset never takes them away, and they are spent only after the
 *    plan's own credits for the period are gone. Nobody loses what they paid for by buying late in the month.
 *  · The plan, the credits and the price are all read from the database HERE. The browser only says "top me up".
 *  · A top-up never touches the subscription: the renewal date, the plan and the billing cycle stay exactly as they were.
 *  · Starter is free, so it has nothing to buy again: it is told to take a plan instead.
 */

/** An unpaid order is handed out again for this long, so a double click does not create two orders with the provider. */
const ORDER_REUSE_MS = 15 * 60_000

export interface TopUpSession {
  keyId: string
  orderId: string
  topUpId: string
  credits: number
  amountMinor: number
  currency: Currency
  planName: string
  testMode: boolean
  /** true = the browser shows OUR test payment window (PAYMENTS_SIMULATOR), not Razorpay's */
  simulated: boolean
}

/** What this person can buy right now, for the page to show before anything is created with the provider. */
export async function topUpOffer(userId: string, currency: Currency): Promise<TopUpOffer> {
  const ent = await getEntitlements(userId)
  const pots = await creditPots(userId)
  if (ent.plan.id === 'starter') {
    return { available: false, reason: 'Top-ups are for paid plans: Starter credits renew free every month.', planId: ent.plan.id, planName: ent.plan.name, credits: 0, amountMinor: 0, currency, balance: pots.total, bought: pots.extra }
  }
  const [price] = await db.select().from(planPrice).where(and(eq(planPrice.id, priceId(ent.plan.id, currency, 'month')), eq(planPrice.isActive, true)))
  const [p] = await db.select().from(plan).where(eq(plan.id, ent.plan.id))
  if (!price || !p || price.amountMinor <= 0) {
    return { available: false, reason: 'Top-ups are not available for your plan yet.', planId: ent.plan.id, planName: ent.plan.name, credits: 0, amountMinor: 0, currency, balance: pots.total, bought: pots.extra }
  }
  if (!razorpayEnabled()) {
    return { available: false, reason: 'Payments are not configured on this server.', planId: ent.plan.id, planName: p.name, credits: p.monthlyCredits, amountMinor: price.amountMinor, currency, balance: pots.total, bought: pots.extra }
  }
  return { available: true, planId: ent.plan.id, planName: p.name, credits: p.monthlyCredits, amountMinor: price.amountMinor, currency, balance: pots.total, bought: pots.extra }
}

/** Creates the one-off order the browser will pay for. Credits, price and currency are decided here and written down before anyone pays. */
export async function startTopUp(userId: string, currency: Currency): Promise<TopUpSession> {
  if (!razorpayEnabled()) throw new BillingError('BILLING_DISABLED', 'Payments are not configured yet.', 503)
  if (currency === 'USD' && !env.RAZORPAY_INTERNATIONAL) throw new BillingError('CURRENCY_UNAVAILABLE', 'International (USD) payments are not available yet. Please check back soon.', 400)
  const offer = await topUpOffer(userId, currency)
  if (!offer.available) throw new BillingError('TOP_UP_UNAVAILABLE', offer.reason ?? 'Top-ups are not available on your plan.', 400)

  try {
    // One person opens one payment window at a time: the per-person lock makes a double click (or two tabs, or two servers) wait its
    // turn, and the second caller is handed the order the first one just opened instead of creating another with the provider.
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`topup:${userId}`}))`)
      const [recent] = await tx
        .select().from(creditTopUp)
        .where(and(eq(creditTopUp.userId, userId), eq(creditTopUp.status, 'created'), eq(creditTopUp.amountMinor, offer.amountMinor), eq(creditTopUp.currency, currency), gt(creditTopUp.createdAt, new Date(Date.now() - ORDER_REUSE_MS))))
        .orderBy(desc(creditTopUp.createdAt))
      if (recent) {
        const known = await razorpay.fetchOrder(recent.providerOrderId).catch(() => null)
        if (known && known.status !== 'paid') return session(recent.id, known, offer)
      }
      const id = nanoid()
      const order = await razorpay.createOrder({
        amount: offer.amountMinor, currency, receipt: `topup_${id}`,
        notes: { kind: 'credit_top_up', topUpId: id, userId, planId: offer.planId, credits: String(offer.credits), currency },
      })
      await tx.insert(creditTopUp).values({ id, userId, planId: offer.planId, credits: offer.credits, amountMinor: offer.amountMinor, currency, provider: 'razorpay', providerOrderId: order.id, status: 'created' })
      return session(id, order, offer)
    })
  } catch (e) {
    if (e instanceof RazorpayApiError) throw new BillingError('PROVIDER_ERROR', `The payment provider refused the request: ${e.message}`, 502)
    throw e
  }
}

const session = (topUpId: string, order: RzpOrder, offer: TopUpOffer): TopUpSession => ({
  keyId: simulatorEnabled() ? SIM_KEY_ID : env.RAZORPAY_KEY_ID!,
  orderId: order.id, topUpId, credits: offer.credits, amountMinor: offer.amountMinor, currency: offer.currency,
  planName: offer.planName, testMode: razorpayTestMode(), simulated: simulatorEnabled(),
})

/**
 * Grants a top-up that is really paid for. Idempotent in two layers: the row only ever moves `created` → `paid` once,
 * and the credit grant itself has a unique key per payment, so the browser's confirmation and the webhook can both run.
 * What is granted is what we wrote down when the order was made — never a number from the browser or from the provider's notes.
 */
export async function grantTopUp(order: RzpOrder, payment: RzpPayment | null, opts: { paymentId?: string; now?: Date } = {}): Promise<'granted' | 'ignored'> {
  const now = opts.now ?? new Date()
  const [row] = await db.select().from(creditTopUp).where(and(eq(creditTopUp.provider, 'razorpay'), eq(creditTopUp.providerOrderId, order.id)))
  if (!row) return 'ignored' // an order this server did not create
  if (order.status !== 'paid' && payment?.status !== 'captured') return 'ignored' // not money yet
  if ((order.amount_paid ?? payment?.amount ?? 0) < row.amountMinor) return 'ignored' // paid less than the order: never grant

  const [won] = await db.update(creditTopUp)
    .set({ status: 'paid', providerPaymentId: payment?.id ?? opts.paymentId ?? row.providerPaymentId, paidAt: now })
    .where(and(eq(creditTopUp.id, row.id), eq(creditTopUp.status, 'created')))
    .returning({ id: creditTopUp.id })
  // The grant is keyed on OUR row, not on the payment: the browser's confirmation and the webhook may know the payment by different
  // names (or not at all, when the provider cannot be reached for the payment), and this one key still grants exactly once.
  await grantExtraCredits(row.userId, row.credits, row.id)
  if (payment) await recordPayment(payment, { userId: row.userId, planId: row.planId })
  if (won) {
    void audit(row.userId, 'billing.credits_topped_up', { topUpId: row.id, credits: row.credits, amountMinor: row.amountMinor, currency: row.currency, planId: row.planId })
    await mailTopUp(row.userId, row).catch((e) => console.error('[billing mail]', (e as Error).message))
  }
  return 'granted'
}

async function mailTopUp(userId: string, row: typeof creditTopUp.$inferSelect): Promise<void> {
  const [u] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId))
  if (!u) return
  const pots = await creditPots(userId)
  await sendMail({ to: u.email, ...mail.creditsToppedUp({ name: u.name, credits: row.credits, amountMinor: row.amountMinor, currency: row.currency, balance: pots.total }) })
}

/** The browser reports a finished one-off checkout. The HMAC proves the provider (not the user) vouches for this order+payment pair. */
export async function confirmTopUp(userId: string, input: { orderId: string; paymentId: string; signature: string }): Promise<void> {
  if (!verifyOrderSignature(input.orderId, input.paymentId, input.signature)) throw new BillingError('PAYMENT_INVALID', 'Payment signature could not be verified.', 400)
  const [row] = await db.select().from(creditTopUp).where(and(eq(creditTopUp.provider, 'razorpay'), eq(creditTopUp.providerOrderId, input.orderId)))
  if (!row) throw new BillingError('PAYMENT_INVALID', 'That payment is not one of ours.', 400)
  if (row.userId !== userId) throw new BillingError('PAYMENT_INVALID', 'This payment belongs to a different account.', 400)
  let order: RzpOrder
  try {
    order = await razorpay.fetchOrder(input.orderId)
  } catch (e) {
    if (e instanceof RazorpayApiError) throw new BillingError('PROVIDER_ERROR', 'Could not confirm the payment with the provider. If you were charged, your credits will be added automatically.', 502)
    throw e
  }
  // the payment itself is a nice-to-have (it is what the receipt and the history show); the order already proves the money
  const pay = await razorpay.fetchPayment(input.paymentId).catch(() => null)
  if ((await grantTopUp(order, pay, { paymentId: input.paymentId })) === 'ignored') throw new BillingError('PAYMENT_INVALID', 'This payment is not complete yet. If you were charged, your credits will be added automatically.', 400)
}

/** A top-up payment came back (refund or dispute): the credits it added are taken back, as far as they are still there. The plan is untouched. */
export async function revokeTopUpForPayment(providerPaymentId: string): Promise<boolean> {
  const [row] = await db.select().from(creditTopUp).where(and(eq(creditTopUp.provider, 'razorpay'), eq(creditTopUp.providerPaymentId, providerPaymentId)))
  if (!row || row.status !== 'paid') return false
  await db.update(creditTopUp).set({ status: 'refunded' }).where(eq(creditTopUp.id, row.id))
  await clawbackExtra(row.userId, row.credits, row.id)
  void audit(row.userId, 'billing.credits_clawed_back', { topUpId: row.id, credits: row.credits }, null)
  return true
}

/** This person's top-ups, newest first (the billing page's history). */
export async function topUpHistory(userId: string): Promise<{ id: string; credits: number; amountMinor: number; currency: string; status: string; at: string }[]> {
  const rows = await db.select().from(creditTopUp).where(eq(creditTopUp.userId, userId)).orderBy(desc(creditTopUp.createdAt)).limit(20)
  return rows.filter((r) => r.status !== 'created').map((r) => ({ id: r.id, credits: r.credits, amountMinor: r.amountMinor, currency: r.currency, status: r.status, at: (r.paidAt ?? r.createdAt).toISOString() }))
}

