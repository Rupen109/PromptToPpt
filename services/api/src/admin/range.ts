import { z } from 'zod'

/** Date range shared by every owner section. `to` is exclusive; default = last 30 days. */
export const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
export type RangeQuery = z.infer<typeof rangeSchema>

const DAY = 864e5
export function rangeOf(q: RangeQuery, now = new Date()) {
  const to = q.to ?? new Date(now.getTime() + 1000)
  const from = q.from ?? new Date(to.getTime() - 30 * DAY)
  return { from, to }
}

export const bucketOf = z.enum(['hour', 'day', 'week', 'month']).default('day')
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
