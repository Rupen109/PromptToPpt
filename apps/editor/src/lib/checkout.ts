import { ApiError, type CheckoutSession, type Entitlements, type RazorpayResult } from '@prompttoppt/api-client'
import { api } from './api'

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'
let loading: Promise<void> | null = null
/** Razorpay's script is loaded on demand (only people who actually click Subscribe download it). */
function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load the secure payment window. Check your connection or ad-blocker and try again.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export class CheckoutDismissed extends Error {
  constructor() {
    super('Checkout closed')
  }
}

function openCheckout(s: CheckoutSession): Promise<RazorpayResult> {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: s.keyId,
      subscription_id: s.subscriptionId,
      name: 'promptToPpt',
      // test mode: the left panel of Razorpay's own window is the only place the user is guaranteed to look
      description: `${s.planName} · ${s.interval === 'month' ? 'monthly' : 'yearly'} subscription${s.testMode ? ' — TEST: use card 5267 3181 8797 5449' : ''}`,
      prefill: s.prefill,
      theme: { color: '#4f46e5' },
      handler: (r: RazorpayResult) => resolve(r),
      modal: { ondismiss: () => reject(new CheckoutDismissed()) },
    })
    rzp.on('payment.failed', () => {
      /* the window stays open so the user can retry with another method; the webhook records the failure */
    })
    rzp.open()
  })
}

/**
 * Full purchase flow: server creates the subscription (price/currency decided there) → Razorpay window → server verifies
 * the signed result and activates the plan. Resolves with the new entitlements; rejects with CheckoutDismissed if the
 * user closed the window.
 */
export async function subscribe(planId: 'pro' | 'gold', interval: 'month' | 'year', onSession?: (s: CheckoutSession) => void): Promise<Entitlements> {
  const [session] = await Promise.all([api.startCheckout(planId, interval), loadCheckoutScript()])
  onSession?.(session)
  const result = await openCheckout(session)
  return api.verifyPayment(result)
}

export const checkoutErrorMessage = (e: unknown): string | null => {
  if (e instanceof CheckoutDismissed) return null
  if (e instanceof ApiError) return e.message
  return e instanceof Error ? e.message : 'Something went wrong with the payment. You have not been charged unless you see a confirmation.'
}

/** Razorpay test mode: the generic 4111… test card is NOT eligible for recurring payments, so subscriptions need these. */
export const TEST_MODE_HINT = 'Test mode — pay with card 5267 3181 8797 5449 (any future expiry, any CVV, any OTP) or UPI success@razorpay. The 4111 1111 1111 1111 card cannot be used for subscriptions.'
