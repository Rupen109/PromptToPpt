import type { GateCode } from '@prompttoppt/validation'

/** A business-rule refusal (plan/credits/limits). Rendered as a stable JSON code the UI maps to an upgrade prompt. */
export class GateError extends Error {
  constructor(
    public readonly code: GateCode,
    message: string,
    public readonly status: 402 | 403 | 429,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

/** Optimistic-concurrency failure: the caller's copy is stale (another tab/device saved first). */
export class ConflictError extends Error {
  constructor(message: string, public readonly details: Record<string, unknown>) {
    super(message)
  }
}

/** Payment-flow refusal that is not a plan gate (provider off, currency unavailable, already subscribed, provider outage…). */
export class BillingError extends Error {
  constructor(
    public readonly code: 'BILLING_DISABLED' | 'CURRENCY_UNAVAILABLE' | 'ALREADY_SUBSCRIBED' | 'PAYMENT_INVALID' | 'NO_SUBSCRIPTION' | 'PROVIDER_ERROR' | 'DUPLICATE_REQUEST',
    message: string,
    public readonly status: 400 | 404 | 409 | 502 | 503,
  ) {
    super(message)
  }
}
