import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PLAN_IDS } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { featureFlag, user } from '../db/schema.ts'
import { FLAGS, FLAG_KEYS, type FlagKey } from '../flags/registry.ts'
import { invalidateFlags, loadFlagRows, resolveFlag, type FlagRow } from '../flags/flags.ts'

export const flagBody = z.object({
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100),
  plans: z.array(z.enum(PLAN_IDS)).max(PLAN_IDS.length).transform((p) => [...new Set(p)]),
  note: z.string().trim().max(200).nullish().transform((n) => n || null),
})
export type FlagBody = z.infer<typeof flagBody>

const stateOf = (row: FlagRow | undefined, key: FlagKey) => ({ enabled: row ? row.enabled : FLAGS[key].default, rolloutPercent: row?.rolloutPercent ?? 100, plans: row?.plans ?? [], note: row?.note ?? null, custom: !!row })

/** Registry merged with DB state. `effective` = what a user with no restrictions (in the rollout, any plan) would get. */
export async function listFlags() {
  const [rows, users] = await Promise.all([loadFlagRows(), db.select({ id: user.id, email: user.email }).from(user).innerJoin(featureFlag, eq(featureFlag.updatedBy, user.id))])
  const emails = new Map(users.map((u) => [u.id, u.email]))
  return FLAG_KEYS.map((key) => {
    const row = rows.get(key)
    return {
      key, description: FLAGS[key].description, default: FLAGS[key].default, ...stateOf(row, key),
      effective: resolveFlag(key, row ? { ...row, rolloutPercent: 100, plans: [] } : undefined),
      updatedBy: row?.updatedBy ? (emails.get(row.updatedBy) ?? row.updatedBy) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }
  })
}

export async function setFlag(key: FlagKey, body: FlagBody, actorId: string) {
  const before = stateOf((await db.select().from(featureFlag).where(eq(featureFlag.key, key)))[0], key)
  const now = new Date()
  const values = { enabled: body.enabled, rolloutPercent: body.rolloutPercent, plans: body.plans, note: body.note, updatedBy: actorId, updatedAt: now }
  await db.insert(featureFlag).values({ key, ...values }).onConflictDoUpdate({ target: featureFlag.key, set: values })
  invalidateFlags()
  return { before, after: { enabled: body.enabled, rolloutPercent: body.rolloutPercent, plans: body.plans, note: body.note } }
}

export async function resetFlag(key: FlagKey) {
  const before = stateOf((await db.select().from(featureFlag).where(eq(featureFlag.key, key)))[0], key)
  await db.delete(featureFlag).where(eq(featureFlag.key, key))
  invalidateFlags()
  return { before, after: { enabled: FLAGS[key].default, rolloutPercent: 100, plans: [], note: null } }
}
