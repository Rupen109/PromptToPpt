import { and, eq, gte, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Presentation } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { GateError } from '../billing/errors.ts'
import { assertPresentationQuota, type getEntitlements } from '../billing/entitlements.ts'
import { generationJob, presentation, presentationVersion } from '../db/schema.ts'

/** How many presentations one account keeps. */
export const MAX_LIVE_PRESENTATIONS = 500

/**
 * Saves a new deck for a user with every create-time limit applied: serialised per user (parallel requests cannot overshoot the monthly
 * allowance), monthly presentations, and the cap on how many decks one account keeps. Used by "new from template" and "duplicate".
 */
export async function insertDeck(userId: string, ent: Awaited<ReturnType<typeof getEntitlements>>, d: { id: string; title: string; aspectRatio: string; doc: Presentation; projectId?: string | null | undefined }) {
  const { id, title, aspectRatio, doc, projectId } = d
  const input = { aspectRatio, projectId }
  await db.transaction(async (tx) => {
    // Serialise a user's creates: without the lock, ten parallel requests all pass the monthly-deck check and overshoot the plan limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pres:${userId}`}))`)
    // recount INSIDE the lock using this transaction's connection (a nested pool checkout while holding the lock would deadlock under load)
    const [{ n: made } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(presentation).where(and(eq(presentation.userId, userId), gte(presentation.createdAt, ent.period.start)))
    const [{ n: running } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(generationJob).where(and(eq(generationJob.userId, userId), notInArray(generationJob.status, ['completed', 'failed', 'cancelled']), isNull(generationJob.presentationId), sql`${generationJob.options}->>'targetPresentationId' is null`, gte(generationJob.createdAt, ent.period.start)))
    assertPresentationQuota({ limits: ent.limits, plan: ent.plan, usage: { presentationsThisPeriod: made + running, imagesThisPeriod: 0 } })
    const [{ n: live } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(presentation).where(and(eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (live >= MAX_LIVE_PRESENTATIONS) throw new GateError('LIMIT_REACHED', `You can keep up to ${MAX_LIVE_PRESENTATIONS} presentations. Delete some to create more.`, 429, { feature: 'presentations', limit: MAX_LIVE_PRESENTATIONS })
    await tx.insert(presentation).values({ id, userId, title, aspectRatio: input.aspectRatio, latestVersion: 1, revision: 1, ...(projectId ? { projectId } : {}) })
    await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  })
}
