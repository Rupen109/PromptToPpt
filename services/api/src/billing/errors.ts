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
    public readonly code: 'BILLING_DISABLED' | 'CURRENCY_UNAVAILABLE' | 'ALREADY_SUBSCRIBED' | 'PAYMENT_INVALID' | 'NO_SUBSCRIPTION' | 'PROVIDER_ERROR' | 'DUPLICATE_REQUEST' | 'NOT_FOUND' | 'NO_PAYMENT',
    message: string,
    public readonly status: 400 | 404 | 409 | 502 | 503,
  ) {
    super(message)
  }
}

/** A person who may only VIEW a presentation (a viewer collaborator) asked for something that changes it, or costs the owner (AI, pictures, exports). Not a plan gate: no upgrade offer. */
export class ViewOnlyError extends Error {
  readonly code = 'VIEW_ONLY' as const
  readonly status = 403 as const
  constructor(message = 'You can view and comment on this presentation, but not change it. Ask its owner for edit access.') {
    super(message)
  }
}
