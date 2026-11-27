import type { PaidPlanId } from '@prompttoppt/validation'
import { ApiError, type CheckoutSession, type Entitlements, type RazorpayOrderResult, type RazorpayResult, type TopUpSession } from '@prompttoppt/api-client'
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
      name: 'SlidesDone',
      // test mode: the left panel of Razorpay's own window is the only place the user is guaranteed to look
      description: `${s.planName} · ${s.interval === 'month' ? 'monthly' : 'yearly'} subscription${s.testMode ? ' — TEST: use card 4100 2800 0000 1007' : ''}`,
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
export async function subscribe(planId: PaidPlanId, interval: 'month' | 'year', onSession?: (s: CheckoutSession) => void): Promise<Entitlements> {
  const session = await api.startCheckout(planId, interval)
  simulatorMode = !!session.simulated
  onSession?.(session)
  // test payments: our own window (no Razorpay account, card or internet); its result goes through the same /billing/verify as a real one
  if (!session.simulated) await loadCheckoutScript()
  const result = session.simulated ? await openTestPayment(session) : await openCheckout(session)
  return api.verifyPayment(result)
}

/**
 * Buying credits: the plan's own credits again, at the plan's own price, paid once (a Razorpay ORDER, not a subscription).
 * Same shape as `subscribe`: server decides what is sold → payment window → server verifies the signed result and adds the credits.
 */
export async function buyCredits(onSession?: (s: TopUpSession) => void): Promise<Entitlements> {
  const session = await api.startTopUp()
  simulatorMode = !!session.simulated
  onSession?.(session)
  if (!session.simulated) await loadCheckoutScript()
  const result = session.simulated ? await openTestOrderPayment(session) : await openOrderCheckout(session)
  return api.verifyTopUp(result)
}

function openOrderCheckout(s: TopUpSession): Promise<RazorpayOrderResult> {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: s.keyId,
      order_id: s.orderId,
      amount: s.amountMinor,
      currency: s.currency,
      name: 'SlidesDone',
      description: `${s.credits.toLocaleString()} credits (${s.planName})${s.testMode ? ' — TEST: use card 4111 1111 1111 1111' : ''}`,
      prefill: s.prefill,
      theme: { color: '#4f46e5' },
      handler: (r: RazorpayOrderResult) => resolve(r),
      modal: { ondismiss: () => reject(new CheckoutDismissed()) },
    })
    rzp.on('payment.failed', () => {
      /* the window stays open so the person can try another method; the webhook records the failure */
    })
    rzp.open()
  })
}

/** The test payment window for a credit top-up (PAYMENTS_SIMULATOR): the same window as a plan, with the credits as the title. */
function openTestOrderPayment(s: TopUpSession): Promise<RazorpayOrderResult> {
  return testWindow<RazorpayOrderResult>({
    title: `${s.credits.toLocaleString()} credits · ${s.planName}`,
    amount: money(s.amountMinor, s.currency),
    explain: "This is SlidesDone's own test checkout (the server is in test-payment mode). Pressing Pay adds the credits exactly as a real payment would, without any card.",
    pay: async (outcome) => {
      const r = await api.simulatorPayOrder(s.orderId, outcome)
      return r.outcome === 'paid' ? { ok: { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature } } : { error: r.message }
    },
  })
}

const money = (minor: number, currency: string) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)

/**
 * The TEST PAYMENT window (server flag PAYMENTS_SIMULATOR): shown instead of Razorpay's. "Pay" completes a test payment, "Fail" makes a declined one (the failure e-mail
 * and history entry are real), closing leaves the person on their current plan. Built as plain DOM so it works from any call site, and labelled so nobody mistakes it for a real charge.
 */
function openTestPayment(s: CheckoutSession): Promise<RazorpayResult> {
  return testWindow<RazorpayResult>({
    title: `${s.planName} · ${s.interval === 'month' ? 'monthly' : 'yearly'}`,
    amount: money(s.amountMinor, s.currency),
    explain: "This is SlidesDone's own test checkout (the server is in test-payment mode). Pressing Pay activates the plan exactly as a real payment would, without any card.",
    pay: async (outcome) => {
      const r = await api.simulatorPay(s.subscriptionId, outcome)
      return r.outcome === 'paid' ? { ok: { razorpay_payment_id: r.razorpay_payment_id, razorpay_subscription_id: r.razorpay_subscription_id, razorpay_signature: r.razorpay_signature } } : { error: r.message }
    },
  })
}

/** The test payment window itself (plain DOM, so it works from any call site, and clearly labelled so nobody mistakes it for a real charge). */
function testWindow<T>(o: { title: string; amount: string; explain: string; pay: (outcome: 'success' | 'failure') => Promise<{ ok: T } | { error: string }> }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const previous = document.activeElement as HTMLElement | null
    const root = document.createElement('div')
    root.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4'
    root.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Test payment" class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p class="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Test payment: no real money</p>
        <h2 class="font-heading text-xl font-bold" data-title></h2>
        <p class="mt-1 text-3xl font-extrabold" data-amount></p>
        <p class="mt-2 text-sm text-slate-600" data-explain></p>
        <p data-error role="alert" class="mt-3 hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"></p>
        <div class="mt-5 grid gap-2">
          <button type="button" data-pay class="rounded-lg bg-primary px-4 py-3 font-bold text-white disabled:opacity-60">Pay (test)</button>
          <button type="button" data-fail class="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-60">Make this payment fail (test)</button>
          <button type="button" data-cancel class="rounded-lg px-4 py-2 text-sm text-slate-600 underline">Cancel</button>
        </div>
      </div>`
    const $ = <E extends HTMLElement>(sel: string) => root.querySelector<E>(sel)!
    $('[data-title]').textContent = o.title
    $('[data-amount]').textContent = o.amount
    $('[data-explain]').textContent = o.explain
    const buttons = ['[data-pay]', '[data-fail]', '[data-cancel]'].map((x) => $<HTMLButtonElement>(x))
    const show = (text: string | null) => { const e = $('[data-error]'); e.textContent = text ?? ''; e.classList.toggle('hidden', !text) }
    const finish = () => { document.removeEventListener('keydown', onKey, true); root.remove(); previous?.focus?.() }
    const cancel = () => { finish(); reject(new CheckoutDismissed()) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() } }
    const act = async (outcome: 'success' | 'failure') => {
      show(null)
      buttons.forEach((b) => (b.disabled = true))
      try {
        const r = await o.pay(outcome)
        if ('ok' in r) { finish(); resolve(r.ok); return }
        show(`${r.error} You can try again.`)
      } catch (e) {
        show(e instanceof ApiError ? e.message : 'Could not reach the server. Try again.')
      }
      buttons.forEach((b) => (b.disabled = false))
    }
    $('[data-pay]').addEventListener('click', () => void act('success'))
    $('[data-fail]').addEventListener('click', () => void act('failure'))
    $('[data-cancel]').addEventListener('click', cancel)
    root.addEventListener('mousedown', (e) => { if (e.target === root) cancel() })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(root)
    buttons[0]!.focus()
  })
}

export const checkoutErrorMessage = (e: unknown): string | null => {
  if (e instanceof CheckoutDismissed) return null
  if (e instanceof ApiError) return e.message
  return e instanceof Error ? e.message : 'Something went wrong with the payment. You have not been charged unless you see a confirmation.'
}

let simulatorMode = false
/** the server says whether payments are Razorpay's test mode or our own test payments; the hint under the plans follows */
export const setSimulatorMode = (on: boolean) => { simulatorMode = on }
/** Razorpay's own test mode needs recurring-eligible test cards; our test payments need nothing. */
export const testModeHint = () => simulatorMode
  ? 'Test payments are on: no real money, no card. Pressing Pay in the test window activates the plan like a real payment.'
  : 'Test mode — no real money is charged. Pay with Visa 4100 2800 0000 1007 (any future expiry, any CVV), then choose Success on the bank test page. Or UPI success@razorpay. Older test cards (4111…, 5267…) are refused for subscriptions.'
