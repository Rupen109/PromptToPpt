import type { Currency, PlanSlug } from '@prompttoppt/types'

// ─────────────────────────────────────────────
// Billing Provider Abstraction
// ─────────────────────────────────────────────

export interface CheckoutSessionInput {
  userId: string
  planSlug: PlanSlug
  billingCycle: 'monthly' | 'annual'
  currency: Currency
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSessionResult {
  sessionId: string
  checkoutUrl: string
  provider: 'razorpay' | 'stripe'
}

export interface WebhookVerificationResult {
  isValid: boolean
  eventType: string
  payload: unknown
}

export interface BillingProvider {
  name: 'razorpay' | 'stripe'
  supportedCurrencies: Currency[]
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>
  verifyWebhook(payload: string, signature: string): Promise<WebhookVerificationResult>
  cancelSubscription(subscriptionId: string): Promise<void>
  getSubscriptionStatus(subscriptionId: string): Promise<string>
}

// ─── Provider Selection ───────────────────────────────────────────────────

export function selectBillingProvider(currency: Currency): 'razorpay' | 'stripe' {
  return currency === 'INR' ? 'razorpay' : 'stripe'
}

// ─── Credit Cost Table ───────────────────────────────────────────────────
// Configurable: 1 credit = how many "units" of each action

export const CREDIT_COST_TABLE = {
  generate_presentation_per_slide: 10,
  ai_edit_per_request: 5,
  export_pptx: 20,
  export_pdf: 10,
  image_generation_per_image: 15,
  source_ingestion_per_page: 2,
} as const

export type CreditCostKey = keyof typeof CREDIT_COST_TABLE
