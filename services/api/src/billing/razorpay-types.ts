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
}

export class RazorpayApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}
