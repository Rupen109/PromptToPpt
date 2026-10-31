import { createHmac } from 'node:crypto'
import { nanoid } from 'nanoid'
import { env } from '../env.ts'
import { RazorpayApiError, notesOf, type RzpPayment, type RzpSubscription } from './razorpay-types.ts'

/**
 * TEST PAYMENTS. With PAYMENTS_SIMULATOR=true the server talks to this in-process stand-in instead of Razorpay, so the whole purchase can be tried without a
 * Razorpay account, a card, a phone number or the internet: the browser shows our own "Test payment" window (Pay / Fail) instead of Razorpay's, and everything after
 * it is the REAL code: signature check, plan activation, credits, receipt e-mail, payment history, renewals, refunds.
 * Refused at start-up when APP_ENV=production (see env.ts), and every route that drives it answers 404 when the flag is off.
 */
export const simulatorEnabled = () => env.PAYMENTS_SIMULATOR
/** the stand-in's own "key secret": signs the result of a test payment exactly the way Razorpay signs a real one */
export const SIM_SECRET = 'simulator-key-secret-not-for-production'
export const SIM_KEY_ID = 'rzp_test_simulator'

const subs = new Map<string, RzpSubscription>()
const pays = new Map<string, RzpPayment>()
const notFound = () => new RazorpayApiError(400, 'The ID provided is invalid or could not be found.')
const unix = (d: Date) => Math.floor(d.getTime() / 1000)

export const simProvider = {
  createPlan: async () => ({ id: `plan_sim_${nanoid(10)}` }),
  createSubscription: async (p: { planId: string; notes: Record<string, string> }): Promise<RzpSubscription> => {
    const s: RzpSubscription = { id: `sub_sim_${nanoid(10)}`, plan_id: p.planId, status: 'created', current_start: null, current_end: null, paid_count: 0, notes: p.notes }
    subs.set(s.id, s)
    return { ...s }
  },
  fetchSubscription: async (id: string): Promise<RzpSubscription> => {
    const s = subs.get(id)
    if (!s) throw notFound()
    return { ...s }
  },
  fetchPayment: async (id: string): Promise<RzpPayment> => {
    const p = pays.get(id)
    if (!p) throw notFound()
    return { ...p }
  },
  cancelSubscription: async (id: string, atCycleEnd: boolean): Promise<RzpSubscription> => {
    const s = subs.get(id)
    if (!s) return { id, plan_id: '', status: 'cancelled', current_start: null, current_end: null }
    if (!atCycleEnd) s.status = 'cancelled'
    return { ...s }
  },
}

const period = (interval: string) => (interval === 'year' ? 366 : 31) * 864e5
export const simSignature = (paymentId: string, subscriptionId: string) => createHmac('sha256', SIM_SECRET).update(`${paymentId}|${subscriptionId}`).digest('hex')

/** The person pressed "Pay" (or "Fail") in the test window for a subscription this server created. */
export function simPay(userId: string, subscriptionId: string, amountMinor: number, currency: string, outcome: 'success' | 'failure', now = new Date()): { sub: RzpSubscription; payment: RzpPayment } {
  const s = subs.get(subscriptionId)
  if (!s) throw new RazorpayApiError(400, 'This test payment window has expired: close it and click Subscribe again.')
  const notes = notesOf(s.notes)
  if (notes['userId'] !== userId) throw new RazorpayApiError(400, 'This test payment belongs to a different account.')
  const payment: RzpPayment = outcome === 'success'
    ? { id: `pay_sim_${nanoid(12)}`, amount: amountMinor, currency, status: 'captured', method: 'card', created_at: unix(now), notes: s.notes!, subscription_id: s.id }
    : { id: `pay_sim_${nanoid(12)}`, amount: amountMinor, currency, status: 'failed', method: 'card', error_description: 'Test payment failed: the card was declined (simulated)', created_at: unix(now), notes: s.notes!, subscription_id: s.id }
  pays.set(payment.id, payment)
  if (outcome === 'success') {
    s.status = 'active'; s.current_start = unix(now); s.current_end = unix(new Date(now.getTime() + period(notes['interval'] ?? 'month'))); s.paid_count = 1
  }
  return { sub: { ...s }, payment }
}

/** The next billing cycle of an existing test subscription, as the provider would report it (stateless: rebuilt from what we stored, so it survives a restart). */
export function simRenewal(o: { subscriptionId: string; providerPlanId: string; notes: Record<string, string>; periodEnd: Date; amountMinor: number; currency: string }): { sub: RzpSubscription; payment: RzpPayment } {
  const start = o.periodEnd
  const end = new Date(start.getTime() + period(o.notes['interval'] ?? 'month'))
  const sub: RzpSubscription = { id: o.subscriptionId, plan_id: o.providerPlanId, status: 'active', current_start: unix(start), current_end: unix(end), paid_count: 2, notes: o.notes }
  const payment: RzpPayment = { id: `pay_sim_${nanoid(12)}`, amount: o.amountMinor, currency: o.currency, status: 'captured', method: 'card', created_at: unix(new Date()), notes: o.notes, subscription_id: o.subscriptionId }
  subs.set(sub.id, sub); pays.set(payment.id, payment)
  return { sub, payment }
}
