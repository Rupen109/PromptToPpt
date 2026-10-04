import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { refuseIfOverBudget } from '../ai/budget.ts'
import { livePlanFor } from '../billing/entitlements.ts'
import { db } from '../db/index.ts'
import { featureFlag } from '../db/schema.ts'
import { env } from '../env.ts'
import { FLAGS, FLAG_KEYS, type FlagKey } from './registry.ts'

export type FlagRow = typeof featureFlag.$inferSelect
export interface FlagCtx { userId?: string | undefined; planId?: string | undefined }

const TTL_MS = 15_000
let cache: { at: number; rows: Map<string, FlagRow> } | null = null
let loading: Promise<Map<string, FlagRow>> | null = null

/** All DB rows, cached for 15s per process; writes in this process call `invalidateFlags()` so they show up immediately. */
export async function loadFlagRows(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  if (!loading) {
    const started = loading = db.select().from(featureFlag).then((rows) => {
      const map = new Map(rows.map((r) => [r.key, r]))
      if (loading === started) cache = { at: Date.now(), rows: map } // an invalidation during the read discards this result
      return map
    }).finally(() => { if (loading === started) loading = null })
  }
  return loading
}
export function invalidateFlags() {
  cache = null
  loading = null
}

/** Stable 0..99 bucket per (user, flag): the same user always lands in the same bucket, and buckets are spread evenly. */
export function bucketOf(userId: string, key: string): number {
  return createHash('sha256').update(`${userId}:${key}`).digest().readUInt32BE(0) % 100
}

/** Pure resolution: state → rollout → plan restriction. */
export function resolveFlag(key: FlagKey, row: FlagRow | undefined, ctx: FlagCtx = {}): boolean {
  let on = row ? row.enabled : FLAGS[key].default
  if (!on) return false
  if (row) {
    const pct = row.rolloutPercent
    if (pct < 100) on = ctx.userId ? bucketOf(ctx.userId, key) < pct : false
    if (!on) return false
    const plans = row.plans ?? []
    if (plans.length > 0) on = !!ctx.planId && plans.includes(ctx.planId)
  }
  // the env switch is a hard kill for images, on top of the flag
  if (key === 'image_generation' && !env.IMAGES_ENABLED) return false
  return on
}

export async function isFlagOn(key: FlagKey, ctx: FlagCtx = {}): Promise<boolean> {
  const row = (await loadFlagRows()).get(key)
  if (row && (row.plans ?? []).length > 0 && ctx.userId && !ctx.planId) ctx = { ...ctx, planId: (await livePlanFor(ctx.userId)).plan.id }
  return resolveFlag(key, row, ctx)
}

/** Effective value of every known flag for one user (what GET /api/v1/flags returns). */
export async function effectiveFlags(ctx: FlagCtx): Promise<Record<FlagKey, boolean>> {
  const rows = await loadFlagRows()
  const needsPlan = ctx.userId && !ctx.planId && [...rows.values()].some((r) => (r.plans ?? []).length > 0)
  const c = needsPlan ? { ...ctx, planId: (await livePlanFor(ctx.userId!)).plan.id } : ctx
  return Object.fromEntries(FLAG_KEYS.map((k) => [k, resolveFlag(k, rows.get(k), c)])) as Record<FlagKey, boolean>
}

const MESSAGES: Record<FlagKey, { status: 403 | 503; code: string; message: string }> = {
  maintenance_mode: { status: 503, code: 'MAINTENANCE', message: "We're doing some quick maintenance, so AI features are paused for a short while. Your work is safe — please try again soon." },
  ai_assistant: { status: 403, code: 'FEATURE_DISABLED', message: 'The AI assistant is switched off right now.' },
  image_generation: { status: 403, code: 'FEATURE_DISABLED', message: 'Image generation is switched off right now.' },
  exports: { status: 403, code: 'FEATURE_DISABLED', message: 'Exporting is switched off right now.' },
}

/**
 * Route guard. `refuseIfOff('ai_assistant', c, userId)` returns the standard error Response when the flag is off for this
 * user (call it BEFORE reserving credits), else null. `refuseIfOn('maintenance_mode', ...)` is the inverse for kill-switches.
 */
export async function refuseIfOff(key: FlagKey, c: Context, userId: string): Promise<Response | null> {
  if (key === 'image_generation') {
    const over = await refuseIfOverBudget(c, userId)
    if (over) return over
  }
  if (await isFlagOn(key, { userId })) return null
  const m = MESSAGES[key]
  return c.json({ success: false, error: { code: m.code, message: m.message } }, m.status)
}
export async function refuseIfOn(key: FlagKey, c: Context, userId: string): Promise<Response | null> {
  if (key === 'maintenance_mode') {
    const over = await refuseIfOverBudget(c, userId) // every costly route passes through this kill-switch check first
    if (over) return over
  }
  if (!(await isFlagOn(key, { userId }))) return null
  const m = MESSAGES[key]
  return c.json({ success: false, error: { code: m.code, message: m.message } }, m.status)
}
