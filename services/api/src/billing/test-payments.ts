import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { payment, planPrice, subscription } from '../db/schema.ts'
import { BillingError } from './errors.ts'
import { notesOf, razorpay } from './razorpay.ts'
import { SIM_KEY_ID, simPay, simRenewal, simSignature, simulatorEnabled } from './simulator.ts'
import { applySubscription, priceId, recordPayment, revokeForPayment } from './subscriptions.ts'

void SIM_KEY_ID

/** Every function here is for PAYMENTS_SIMULATOR only: with the flag off they refuse, and the routes that call them answer 404. */
const guard = () => {
  if (!simulatorEnabled()) throw new BillingError('NOT_FOUND', 'Not found', 404)
}

export type TestPayResult =
  | { outcome: 'paid'; razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
  | { outcome: 'failed'; message: string }

/**
 * "Pay" or "Fail" pressed in the test payment window. A success hands back what Razorpay's window would (payment id, subscription id and a signature made
 * with the stand-in's key), and the browser then calls the normal /billing/verify, which activates the plan through the real code. A failure is recorded
 * exactly like a declined card: a failed payment row and the "payment did not go through" e-mail.
 */
export async function testPay(userId: string, subscriptionId: string, outcome: 'success' | 'failure'): Promise<TestPayResult> {
  guard()
  const sub = await razorpay.fetchSubscription(subscriptionId).catch(() => null)
  if (!sub) throw new BillingError('PAYMENT_INVALID', 'This test payment window has expired: close it and click Subscribe again.', 400)
  const notes = notesOf(sub.notes)
  if (notes['userId'] !== userId) throw new BillingError('PAYMENT_INVALID', 'This test payment belongs to a different account.', 400)
  const [price] = await db.select().from(planPrice).where(eq(planPrice.id, priceId(notes['planId'] ?? '', notes['currency'] ?? '', notes['interval'] ?? '')))
  if (!price) throw new BillingError('PAYMENT_INVALID', 'That plan is not available.', 400)
  const { payment: pay } = simPay(userId, subscriptionId, price.amountMinor, price.currency, outcome)
  if (outcome === 'failure') {
    await recordPayment(pay, { userId, planId: notes['planId'], interval: notes['interval'], subscriptionId })
    return { outcome: 'failed', message: pay.error_description ?? 'The test payment failed.' }
  }
  return { outcome: 'paid', razorpay_payment_id: pay.id, razorpay_subscription_id: subscriptionId, razorpay_signature: simSignature(pay.id, subscriptionId) }
}

/** The next billing cycle of the person's test subscription happens now: the period moves forward, a new payment is captured and recorded, credits renew. */
export async function testRenew(userId: string): Promise<void> {
  guard()
  const [row] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  if (!row || !row.providerRef?.startsWith('sub_sim_')) throw new BillingError('NO_SUBSCRIPTION', 'You have no test subscription to renew. Buy a plan with the test payment first.', 404)
  const [price] = await db.select().from(planPrice).where(eq(planPrice.id, priceId(row.planId, row.currency, row.interval)))
  if (!price?.providerPriceId) throw new BillingError('PAYMENT_INVALID', 'That plan is not available.', 400)
  const notes = { userId, planId: row.planId, interval: row.interval, currency: row.currency }
  const { sub, payment: pay } = simRenewal({ subscriptionId: row.providerRef, providerPlanId: price.providerPriceId, notes, periodEnd: row.currentPeriodEnd > new Date() ? row.currentPeriodEnd : new Date(), amountMinor: price.amountMinor, currency: price.currency })
  await applySubscription(sub, { paidConfirmed: true })
  await recordPayment(pay, { userId, planId: row.planId, interval: row.interval, subscriptionId: row.providerRef })
}

/** The person's latest test payment is refunded in full: the plan ends and the credits it granted are taken back (the same path a real refund webhook takes). */
export async function testRefund(userId: string): Promise<void> {
  guard()
  const [pay] = await db.select().from(payment).where(and(eq(payment.userId, userId), eq(payment.status, 'captured'))).orderBy(desc(payment.paidAt)).limit(1)
  if (!pay || !pay.providerPaymentId.startsWith('pay_sim_')) throw new BillingError('NO_PAYMENT', 'There is no test payment to refund.', 404)
  await revokeForPayment(pay.providerPaymentId, 'refunded', pay.amountMinor)
}
