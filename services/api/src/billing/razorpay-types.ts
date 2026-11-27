/** Razorpay returns `notes: []` (an array!) when there are none. */
export type Notes = Record<string, string> | []
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
  /** set when the payment is for a one-off order (a credit top-up) */
  order_id?: string | null
}

/** A one-off payment (a credit top-up). Subscriptions are a different object: this one is paid once and never renews. */
export interface RzpOrder {
  id: string
  amount: number
  amount_paid?: number
  currency: string
  status: 'created' | 'attempted' | 'paid'
  receipt?: string | null
  notes?: Notes
}

export class RazorpayApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}
