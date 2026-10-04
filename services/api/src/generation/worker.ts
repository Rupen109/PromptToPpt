import { eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { generationJob } from '../db/schema.ts'
import { AIUnavailableError } from '@prompttoppt/ai'
import { refundCredits } from '../billing/credits.ts'
import { JobCancelled, runGeneration } from './pipeline.ts'
import { postgresQueue, type JobQueue } from './queue.ts'

const MAX_ATTEMPTS = 3
const POLL_MS = 1000

/** User-facing failure text. Raw provider errors can contain internals, so they only go to logs. */
const publicError = (e: unknown) => (e instanceof AIUnavailableError ? 'The AI service is busy or unavailable. Please try again in a moment.' : 'Something went wrong while generating your presentation.')

export async function processOne(queue: JobQueue = postgresQueue): Promise<boolean> {
  const id = await queue.claim(120)
  if (!id) return false
  const [job] = await db.select({ attempts: generationJob.attempts }).from(generationJob).where(eq(generationJob.id, id))
  try {
    if ((job?.attempts ?? 0) > MAX_ATTEMPTS) throw new Error('max attempts exceeded')
    await runGeneration(id)
  } catch (e) {
    if (e instanceof JobCancelled) return true
    console.error(`[worker] job ${id} attempt ${job?.attempts} failed:`, e)
    const final = (job?.attempts ?? 0) >= MAX_ATTEMPTS
    await db
      .update(generationJob)
      .set(
        final
          ? { status: 'failed', error: publicError(e), lockedUntil: null, updatedAt: new Date() }
          : { lockedUntil: null, runAfter: new Date(Date.now() + 2 ** (job?.attempts ?? 1) * 2000), updatedAt: new Date() }, // backoff, then retry from checkpoint
      )
      .where(eq(generationJob.id, id))
    if (final) {
      const [j] = await db.select({ userId: generationJob.userId }).from(generationJob).where(eq(generationJob.id, id))
      if (j) await refundCredits(j.userId, 'job', id) // failed work is not charged
    }
  }
  return true
}

export function startWorker(): () => void {
  let stopped = false
  void (async () => {
    while (!stopped) {
      try {
        if (await processOne()) continue
      } catch (e) {
        console.error('[worker] loop error', e)
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  })()
  return () => {
    stopped = true
  }
}
