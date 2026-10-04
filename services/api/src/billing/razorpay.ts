import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.ts'
import { BillingError } from './errors.ts'

const API = 'https://api.razorpay.com/v1'

export const razorpayEnabled = () => !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET
export const razorpayTestMode = () => !!env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')

/** Razorpay returns `notes: []` (an array!) when there are none. */
type Notes = Record<string, string> | []
export const notesOf = (n: Notes | undefined): Record<string, string> => (n && !Array.isArray(n) ? n : {})

export interface RzpSubscription {
  id: string
  plan_id: string
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused'
  current_start: number | null
  current_end: number | null
  paid_count?: number
  short_url?: string
  notes?: Notes
}
export interface RzpPayment {
  id: string
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method?: string
  error_description?: string | null
  created_at: number
  notes?: Notes
  subscription_id?: string | null
}

export class RazorpayApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!razorpayEnabled()) throw new BillingError('BILLING_DISABLED', 'Payments are not configured on this server.', 503)
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null
  if (!res.ok || !data) throw new RazorpayApiError(res.status, data?.error?.description ?? `Razorpay ${res.status}`)
  return data
}

/**
 * Thin typed wrapper over the REST endpoints we use (no SDK: 5 calls, and fewer supply-chain dependencies on the payment path).
 * Exported as an object so tests can stub it — tests never reach the network.
 */
export const razorpay = {
  createPlan: (p: { period: 'monthly' | 'yearly'; name: string; amount: number; currency: string; notes?: Record<string, string> }) =>
    call<{ id: string }>('POST', '/plans', { period: p.period, interval: 1, item: { name: p.name, amount: p.amount, currency: p.currency }, notes: p.notes ?? {} }),
  createSubscription: (p: { planId: string; totalCount: number; notes: Record<string, string> }) =>
    call<RzpSubscription>('POST', '/subscriptions', { plan_id: p.planId, total_count: p.totalCount, customer_notify: 1, notes: p.notes }),
  fetchSubscription: (id: string) => call<RzpSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`),
  fetchPayment: (id: string) => call<RzpPayment>('GET', `/payments/${encodeURIComponent(id)}`),
  cancelSubscription: (id: string, atCycleEnd: boolean) => call<RzpSubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(actual, 'hex')
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

/** Checkout success callback: HMAC_SHA256(`${payment_id}|${subscription_id}`, key_secret). */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, secret = env.RAZORPAY_KEY_SECRET ?? ''): boolean {
  if (!secret) return false
  return safeEqualHex(createHmac('sha256', secret).update(`${paymentId}|${subscriptionId}`).digest('hex'), signature)
}

/** Webhook: HMAC_SHA256(raw request body, webhook secret) in `X-Razorpay-Signature`. Must be computed over the RAW bytes. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = env.RAZORPAY_WEBHOOK_SECRET ?? ''): boolean {
  if (!secret) return false
  return safeEqualHex(createHmac('sha256', secret).update(rawBody).digest('hex'), signature)
}
