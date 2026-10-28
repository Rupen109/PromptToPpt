import { createHash } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Currency, SubscriptionSummary } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { checkoutAttempt, payment, plan, planPrice, subscription, user, webhookEvent } from '../db/schema.ts'
import { env } from '../env.ts'
import { audit } from '../lib/audit.ts'
import { clawbackCredits } from './credits.ts'
import { BillingError } from './errors.ts'
import { notesOf, razorpay, razorpayEnabled, razorpayTestMode, RazorpayApiError, verifyCheckoutSignature, verifyWebhookSignature, type RzpPayment, type RzpSubscription } from './razorpay.ts'

type Interval = 'month' | 'year'
type PaidPlan = 'pro' | 'gold'

/** Razorpay needs a finite cycle count; renewals stop after this (10 years monthly / 10 years yearly). */
const TOTAL_COUNT: Record<Interval, number> = { month: 120, year: 10 }
const PERIOD: Record<Interval, 'monthly' | 'yearly'> = { month: 'monthly', year: 'yearly' }
const PERIOD_MS: Record<Interval, number> = { month: 31 * 864e5, year: 366 * 864e5 }
/** access states: the subscription row keeps the user on the plan until currentPeriodEnd */
const LIVE = ['active', 'trialing', 'past_due']

/** A payment session that nobody has paid for is handed out again for this long; after that a click opens a fresh one. */
const CHECKOUT_REUSE_MS = 15 * 60_000

const priceId = (planId: string, currency: string, interval: string) => `${planId}-${currency}-${interval}`

/** Razorpay plans are immutable, so each (plan, currency, interval) maps to one provider plan, created on first use. */
export async function ensureProviderPlan(planId: string, currency: Currency, interval: Interval): Promise<{ providerPlanId: string; amountMinor: number; planName: string }> {
  const [row] = await db.select().from(planPrice).where(and(eq(planPrice.id, priceId(planId, currency, interval)), eq(planPrice.isActive, true)))
  const [p] = await db.select().from(plan).where(and(eq(plan.id, planId), eq(plan.isActive, true)))
  if (!row || !p || row.amountMinor <= 0) throw new BillingError('PAYMENT_INVALID', 'That plan is not available for purchase.', 400)
  if (row.providerPriceId) return { providerPlanId: row.providerPriceId, amountMinor: row.amountMinor, planName: p.name }
  const created = await razorpay.createPlan({ period: PERIOD[interval], name: `${p.name} (${interval === 'month' ? 'monthly' : 'yearly'})`, amount: row.amountMinor, currency, notes: { planId, interval, currency } })
  const [won] = await db.update(planPrice).set({ providerPriceId: created.id }).where(and(eq(planPrice.id, row.id), isNull(planPrice.providerPriceId))).returning({ id: planPrice.providerPriceId })
  if (won) return { providerPlanId: created.id, amountMinor: row.amountMinor, planName: p.name }
  const [again] = await db.select().from(planPrice).where(eq(planPrice.id, row.id)) // lost a race: use the winner's plan
  return { providerPlanId: again!.providerPriceId!, amountMinor: row.amountMinor, planName: p.name }
}

export interface CheckoutSession {
  keyId: string
  subscriptionId: string
  currency: Currency
  amountMinor: number
  planName: string
  interval: Interval
  testMode: boolean
}

/** Creates the provider subscription the browser will pay for. Price, plan and currency are all decided here, never by the client. */
export async function startCheckout(userId: string, planId: PaidPlan, interval: Interval, currency: Currency): Promise<CheckoutSession> {
  if (!razorpayEnabled()) throw new BillingError('BILLING_DISABLED', 'Payments are not configured yet.', 503)
  if (currency === 'USD' && !env.RAZORPAY_INTERNATIONAL) {
    throw new BillingError('CURRENCY_UNAVAILABLE', 'International (USD) payments are not available yet. Please check back soon.', 400)
  }
  const [existing] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  if (existing && LIVE.includes(existing.status) && existing.currentPeriodEnd > new Date() && existing.planId === planId && existing.interval === interval && !existing.cancelAtPeriodEnd) {
    throw new BillingError('ALREADY_SUBSCRIBED', `You are already on ${planId} (${interval}ly).`, 409)
  }
  const { providerPlanId, amountMinor, planName } = await ensureProviderPlan(planId, currency, interval)
  try {
    // One person opens one payment session at a time: the per-person lock makes a double click (or a script, or two tabs, even on two servers)
    // wait its turn, and the second caller is handed the session the first one just opened instead of creating another with the provider.
    const sub = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`checkout:${userId}`}))`)
      const [recent] = await tx.select().from(checkoutAttempt).where(and(eq(checkoutAttempt.userId, userId), eq(checkoutAttempt.planId, planId), eq(checkoutAttempt.interval, interval), eq(checkoutAttempt.currency, currency), gt(checkoutAttempt.createdAt, new Date(Date.now() - CHECKOUT_REUSE_MS))))
      if (recent) {
        const known = await razorpay.fetchSubscription(recent.providerRef).catch(() => null)
        if (known && known.status === 'created' && known.plan_id === providerPlanId) return known // still unpaid and for exactly these terms: reuse
      }
      const fresh = await razorpay.createSubscription({ planId: providerPlanId, totalCount: TOTAL_COUNT[interval], notes: { userId, planId, interval, currency } })
      await tx.insert(checkoutAttempt).values({ id: nanoid(), userId, planId, interval, currency, providerRef: fresh.id }).onConflictDoUpdate({ target: [checkoutAttempt.userId, checkoutAttempt.planId, checkoutAttempt.interval, checkoutAttempt.currency], set: { providerRef: fresh.id, createdAt: new Date() } })
      return fresh
    })
    return { keyId: env.RAZORPAY_KEY_ID!, subscriptionId: sub.id, currency, amountMinor, planName, interval, testMode: razorpayTestMode() }
  } catch (e) {
    if (e instanceof RazorpayApiError) throw new BillingError('PROVIDER_ERROR', `The payment provider refused the request: ${e.message}`, 502)
    throw e
  }
}

const unix = (s: number | null | undefined) => (typeof s === 'number' ? new Date(s * 1000) : null)

/**
 * Brings our `subscription` row in line with the provider's state. Called by both the verified webhook and the checkout
 * confirmation, so the two can race/repeat safely: it is idempotent, never moves a running period backwards, ignores
 * events about a subscription that has been replaced, and never ends access before the paid period does.
 */
export async function applySubscription(entity: RzpSubscription, opts: { paidConfirmed?: boolean; now?: Date } = {}): Promise<'applied' | 'ignored'> {
  const now = opts.now ?? new Date()
  const notes = notesOf(entity.notes)
  const { userId, planId, interval, currency } = notes
  if (!userId || !planId || (interval !== 'month' && interval !== 'year') || (currency !== 'INR' && currency !== 'USD') || (planId !== 'pro' && planId !== 'gold')) return 'ignored'

  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId))
  const [price] = await db.select().from(planPrice).where(eq(planPrice.id, priceId(planId, currency, interval)))
  // Defence in depth: the provider plan on the subscription must be the one we created for exactly these terms.
  if (!owner || !price || price.providerPriceId !== entity.plan_id) return 'ignored'

  const [existing] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  const sameSub = existing?.providerRef === entity.id
  const terminal = ['cancelled', 'completed', 'expired', 'halted'].includes(entity.status)

  if (entity.status === 'created') return 'ignored' // not paid yet
  if (entity.status === 'authenticated' && !opts.paidConfirmed) return 'ignored' // mandate set up, first charge pending
  if (existing && !sameSub && terminal) return 'ignored' // news about an old, already-replaced subscription
  if (!existing && terminal) return 'ignored' // a cancelled/completed subscription we never saw paid must never grant a period of access
  // A subscription that is over for us (refunded, charged back, ended) never comes back: buying again makes a NEW provider subscription. Without this, the
  // "cancelled" event the provider sends after we cancel a refunded subscription (it still carries the old, future period end) would hand the access back.
  if (existing && sameSub && existing.status === 'cancelled' && existing.currentPeriodEnd <= now) return 'ignored'

  const start = unix(entity.current_start) ?? (sameSub ? existing!.currentPeriodStart : now)
  const end = unix(entity.current_end) ?? (sameSub ? existing!.currentPeriodEnd : new Date(now.getTime() + PERIOD_MS[interval]))
  // events can arrive out of order: a running period only ever moves forward
  const keepPeriod = sameSub && existing!.currentPeriodEnd > end
  const periodStart = keepPeriod ? existing!.currentPeriodStart : start
  const periodEnd = keepPeriod ? existing!.currentPeriodEnd : end

  let status: string
  let cancelAtPeriodEnd = sameSub ? existing!.cancelAtPeriodEnd : false
  if (entity.status === 'pending' || entity.status === 'paused') status = 'past_due'
  else if (terminal) {
    // keep access until the period the customer already paid for ends (livePlanFor compares against currentPeriodEnd);
    // 'halted' means renewals kept failing, so it is not extended.
    status = entity.status !== 'halted' && periodEnd > now ? 'active' : 'cancelled'
    cancelAtPeriodEnd = true
  } else status = 'active'

  if (existing && !sameSub && existing.provider === 'razorpay' && existing.providerRef && LIVE.includes(existing.status)) {
    // plan switch: the new subscription replaces the old one, so stop billing the old one now (best effort)
    await razorpay.cancelSubscription(existing.providerRef, false).catch((e) => console.error('could not cancel replaced subscription', existing.providerRef, e))
  }

  await db
    .insert(subscription)
    .values({ id: nanoid(), userId, planId, status, currency, interval, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd, provider: 'razorpay', providerRef: entity.id })
    .onConflictDoUpdate({
      target: subscription.userId,
      set: { planId, status, currency, interval, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd, provider: 'razorpay', providerRef: entity.id, updatedAt: now },
    })
  // verify + webhook both land here, so only a real change is audited (no plan/card data beyond ids and plan names)
  if (!existing || existing.planId !== planId || existing.status !== status || existing.interval !== interval) void audit(userId, 'billing.plan_changed', { planId, interval, status, previousPlanId: existing?.planId ?? 'starter', provider: 'razorpay' })
  return 'applied'
}

/** Idempotent per provider payment id; a later refund/failure of the same payment updates the row. */
export async function recordPayment(p: RzpPayment, ctx: { userId: string; planId?: string | undefined; interval?: string | undefined; subscriptionId?: string | undefined }): Promise<void> {
  const status = p.status === 'captured' ? 'captured' : p.status === 'failed' ? 'failed' : p.status === 'refunded' ? 'refunded' : null
  if (!status) return // created/authorized: not money yet
  const values = {
    userId: ctx.userId, provider: 'razorpay', providerPaymentId: p.id, providerSubscriptionId: ctx.subscriptionId ?? p.subscription_id ?? null,
    planId: ctx.planId ?? null, interval: ctx.interval ?? null, currency: p.currency, amountMinor: p.amount, status, method: p.method ?? null,
    failureReason: status === 'failed' ? (p.error_description ?? null) : null, paidAt: new Date(p.created_at * 1000),
  }
  await db.insert(payment).values({ id: nanoid(), ...values }).onConflictDoUpdate({ target: [payment.provider, payment.providerPaymentId], set: { status, failureReason: values.failureReason } })
}

/** Browser reports a finished checkout. The HMAC proves Razorpay (not the user) vouches for this payment+subscription pair. */
export async function confirmCheckout(userId: string, input: { paymentId: string; subscriptionId: string; signature: string }): Promise<void> {
  if (!verifyCheckoutSignature(input.paymentId, input.subscriptionId, input.signature)) throw new BillingError('PAYMENT_INVALID', 'Payment signature could not be verified.', 400)
  let sub: RzpSubscription
  try {
    sub = await razorpay.fetchSubscription(input.subscriptionId)
  } catch (e) {
    if (e instanceof RazorpayApiError) throw new BillingError('PROVIDER_ERROR', 'Could not confirm the payment with the provider. If you were charged, your plan will activate automatically.', 502)
    throw e
  }
  const notes = notesOf(sub.notes)
  if (notes['userId'] !== userId) throw new BillingError('PAYMENT_INVALID', 'This payment belongs to a different account.', 400)
  if ((await applySubscription(sub, { paidConfirmed: true })) === 'ignored') throw new BillingError('PAYMENT_INVALID', 'This payment is not complete yet. If you were charged, your plan will activate automatically.', 400)
  const pay = await razorpay.fetchPayment(input.paymentId).catch(() => null)
  if (pay) await recordPayment(pay, { userId, planId: notes['planId'], interval: notes['interval'], subscriptionId: sub.id })
}

/** Ends renewals; the customer keeps what they paid for until the period ends. */
export async function cancelAtPeriodEnd(userId: string): Promise<void> {
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  if (!sub || !LIVE.includes(sub.status) || sub.currentPeriodEnd <= new Date()) throw new BillingError('NO_SUBSCRIPTION', 'You have no active subscription.', 404)
  if (sub.provider === 'razorpay' && sub.providerRef) {
    try {
      await razorpay.cancelSubscription(sub.providerRef, true)
    } catch (e) {
      if (e instanceof RazorpayApiError) throw new BillingError('PROVIDER_ERROR', `Could not cancel with the payment provider: ${e.message}`, 502)
      throw e
    }
  }
  await db.update(subscription).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscription.userId, userId))
}

export async function subscriptionSummary(userId: string): Promise<{ subscription: SubscriptionSummary | null; payments: { id: string; amountMinor: number; currency: string; status: string; paidAt: string; planId: string | null }[] }> {
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  const pays = await db.select().from(payment).where(eq(payment.userId, userId)).orderBy(desc(payment.paidAt)).limit(20)
  const live = sub && LIVE.includes(sub.status) && sub.currentPeriodEnd > new Date()
  return {
    subscription: live ? { planId: sub.planId as SubscriptionSummary['planId'], status: sub.status, interval: sub.interval as Interval, currency: sub.currency as Currency, currentPeriodEnd: sub.currentPeriodEnd.toISOString(), cancelAtPeriodEnd: sub.cancelAtPeriodEnd, provider: sub.provider } : null,
    payments: pays.map((p) => ({ id: p.id, amountMinor: p.amountMinor, currency: p.currency, status: p.status, paidAt: p.paidAt.toISOString(), planId: p.planId })),
  }
}

// ─── webhook ──────────────────────────────────────────────────────────────

interface WebhookBody {
  event: string
  payload?: { subscription?: { entity: RzpSubscription }; payment?: { entity: RzpPayment }; refund?: { entity: { id: string; payment_id: string; amount: number } }; dispute?: { entity: { id: string; payment_id: string } } }
}

/**
 * `POST /webhooks/razorpay`. Authenticity = HMAC over the RAW body. Deliveries are at-least-once and may be reordered, so
 * handling is idempotent and the event id is remembered only after successful handling (a failure → 500 → Razorpay retries).
 */
export async function handleWebhook(rawBody: string, headers: Headers): Promise<{ status: 200 | 400 | 401 | 503; body: Record<string, unknown> }> {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return { status: 503, body: { error: 'webhook not configured' } }
  const signature = headers.get('x-razorpay-signature')
  if (!signature || !verifyWebhookSignature(rawBody, signature)) return { status: 401, body: { error: 'bad signature' } }
  let evt: WebhookBody
  try {
    evt = JSON.parse(rawBody) as WebhookBody
  } catch {
    return { status: 400, body: { error: 'invalid json' } }
  }
  const eventId = headers.get('x-razorpay-event-id') ?? `sha256:${createHash('sha256').update(rawBody).digest('hex')}`
  const [seen] = await db.select({ id: webhookEvent.id }).from(webhookEvent).where(eq(webhookEvent.id, eventId))
  if (seen) return { status: 200, body: { ok: true, duplicate: true } }

  const subEntity = evt.payload?.subscription?.entity
  const payEntity = evt.payload?.payment?.entity
  if (evt.event.startsWith('subscription.') && subEntity) {
    await applySubscription(subEntity)
    const notes = notesOf(subEntity.notes)
    if (payEntity && notes['userId']) await recordPayment(payEntity, { userId: notes['userId'], planId: notes['planId'], interval: notes['interval'], subscriptionId: subEntity.id })
  } else if (evt.event === 'payment.failed' && payEntity) {
    const subId = payEntity.subscription_id ?? undefined
    const notes = notesOf(payEntity.notes)
    const [row] = subId ? await db.select().from(subscription).where(eq(subscription.providerRef, subId)) : []
    const userId = notes['userId'] ?? row?.userId
    if (userId) await recordPayment(payEntity, { userId, planId: notes['planId'] ?? row?.planId, interval: notes['interval'] ?? row?.interval, subscriptionId: subId })
  }
  // Money going back: a full refund or a dispute ends the access that payment bought and claws back the credits it granted — otherwise a customer
  // could pay, spend the credits, then refund / charge back and keep both.
  const refund = evt.payload?.refund?.entity
  const dispute = evt.payload?.dispute?.entity
  if (evt.event === 'refund.processed' && refund) await revokeForPayment(refund.payment_id, 'refunded', refund.amount)
  else if (evt.event === 'payment.dispute.created' && dispute) await revokeForPayment(dispute.payment_id, 'disputed')
  await db.insert(webhookEvent).values({ id: eventId, provider: 'razorpay', type: evt.event }).onConflictDoNothing()
  return { status: 200, body: { ok: true } }
}


/**
 * Ends the access a payment bought. `refundedMinor` undefined = a dispute (always revokes); a refund revokes only when it returns the whole payment
 * (a partial goodwill refund must not cancel the customer). Idempotent: the credit clawback has a unique key per payment.
 */
export async function revokeForPayment(providerPaymentId: string, kind: 'refunded' | 'disputed', refundedMinor?: number): Promise<void> {
  const [pay] = await db.select().from(payment).where(and(eq(payment.provider, 'razorpay'), eq(payment.providerPaymentId, providerPaymentId)))
  if (!pay) return
  if (kind === 'refunded' && refundedMinor !== undefined && refundedMinor < pay.amountMinor) return // partial refund: keep the plan
  await db.update(payment).set({ status: kind }).where(eq(payment.id, pay.id))
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, pay.userId))
  if (sub && (!pay.providerSubscriptionId || sub.providerRef === pay.providerSubscriptionId)) {
    await db.update(subscription).set({ status: 'cancelled', cancelAtPeriodEnd: true, currentPeriodEnd: new Date(), updatedAt: new Date() }).where(eq(subscription.userId, pay.userId))
    if (sub.provider === 'razorpay' && sub.providerRef) await razorpay.cancelSubscription(sub.providerRef, false).catch((e) => console.error('could not cancel refunded subscription', sub.providerRef, e))
  }
  await clawbackCredits(pay.userId, `${kind}:${pay.providerPaymentId}`)
  void audit(pay.userId, 'billing.access_revoked', { reason: kind, paymentId: pay.providerPaymentId }, null)
}
