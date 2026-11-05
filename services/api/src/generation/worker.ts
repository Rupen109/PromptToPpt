import { eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { generationJob } from '../db/schema.ts'
import { AIUnavailableError } from '@prompttoppt/ai'
import { refundCredits } from '../billing/credits.ts'
import { JobCancelled, runGeneration } from './pipeline.ts'
import { closeDeck } from './progress.ts'
import { postgresQueue, releaseLeases, renewLease, type JobQueue } from './queue.ts'
import { onJobWaiting } from './wake.ts'
import { env } from '../env.ts'

const MAX_ATTEMPTS = 3

/** User-facing failure text. Raw provider errors can contain internals, so they only go to logs. */
const publicError = (e: unknown) => (e instanceof AIUnavailableError ? 'The AI service is busy or unavailable. Please try again in a moment.' : 'Something went wrong while generating your presentation.')

const LEASE_SECONDS = 120
/** the lease is renewed this often while a job runs, so a long model call never looks like a crashed worker */
const HEARTBEAT_MS = 30_000

/** Runs one claimed job to its end (finished, failed for good, or put back for a retry from its checkpoint). Never throws. */
export async function runJob(id: string): Promise<void> {
  const beat = setInterval(() => void renewLease(id, LEASE_SECONDS).catch(() => {}), HEARTBEAT_MS)
  try {
    const [job] = await db.select({ attempts: generationJob.attempts }).from(generationJob).where(eq(generationJob.id, id))
    try {
      if ((job?.attempts ?? 0) > MAX_ATTEMPTS) throw new Error('max attempts exceeded')
      await runGeneration(id)
    } catch (e) {
      if (e instanceof JobCancelled) return
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
        const [d] = await db.select({ presentationId: generationJob.presentationId, options: generationJob.options }).from(generationJob).where(eq(generationJob.id, id))
        // the open deck keeps the slides that were written; the ones that never got their text are taken out
        if (j && d?.presentationId && !(d.options as { targetPresentationId?: string }).targetPresentationId) await closeDeck(id, d.presentationId, j.userId).catch((e2) => console.error(`[worker] could not tidy the deck of job ${id}`, e2))
      }
    }
  } finally {
    clearInterval(beat)
  }
}

/** Claims and runs one job (tests, one-off scripts). */
export async function processOne(queue: JobQueue = postgresQueue): Promise<boolean> {
  const id = await queue.claim(LEASE_SECONDS)
  if (!id) return false
  await runJob(id)
  return true
}

export interface WorkerStats { slots: number; busy: number; free: number; claimed: number; finished: number }
export interface WorkerHandle {
  /** stops taking jobs, lets the running ones finish for up to `graceMs`, hands back the rest (another worker resumes them from their checkpoints) */
  stop(graceMs?: number): Promise<void>
  stats(): WorkerStats
}
export interface WorkerOptions { slots?: number; queue?: JobQueue; run?: (id: string) => Promise<void>; pollMs?: number }

/**
 * The worker: `slots` decks at the same time in this process. One dispatcher takes jobs while a slot is free (a nudge from the API wakes it at once,
 * a slow poll is the safety net), so an idle worker starts a new deck within milliseconds and many idle slots never poll the database at the same time.
 */
export function startWorker(o: WorkerOptions = {}): WorkerHandle {
  const slots = o.slots ?? env.WORKER_SLOTS
  const queue = o.queue ?? postgresQueue
  const run = o.run ?? runJob
  const pollMs = o.pollMs ?? 2000
  const running = new Map<string, Promise<void>>()
  let stopping = false, claimed = 0, finished = 0
  let nudged = false
  let wake: (() => void) | null = null
  const nudge = () => { nudged = true; wake?.() }
  const idle = (ms: number) => new Promise<void>((resolve) => {
    if (nudged) { nudged = false; return resolve() }
    const t = setTimeout(done, ms)
    function done() { clearTimeout(t); wake = null; nudged = false; resolve() }
    wake = done
  })
  const stopListening = onJobWaiting(nudge)

  const loop = (async () => {
    while (!stopping) {
      if (running.size >= slots) { await idle(pollMs); continue }
      let id: string | null = null
      try { id = await queue.claim(LEASE_SECONDS) } catch (e) { console.error('[worker] claim failed', e) }
      if (!id) { await idle(pollMs); continue }
      claimed++
      const p = run(id).catch((e) => console.error(`[worker] job ${id} crashed`, e)).finally(() => { running.delete(id!); finished++; nudge() })
      running.set(id, p)
    }
  })()

  return {
    stats: () => ({ slots, busy: running.size, free: slots - running.size, claimed, finished }),
    async stop(graceMs = 25_000) {
      stopping = true
      stopListening()
      nudge()
      await loop
      const left = Promise.allSettled([...running.values()])
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([left, new Promise((r) => { timer = setTimeout(r, graceMs) })])
      clearTimeout(timer)
      await releaseLeases([...running.keys()]).catch((e) => console.error('[worker] could not hand back jobs', e))
    },
  }
}
