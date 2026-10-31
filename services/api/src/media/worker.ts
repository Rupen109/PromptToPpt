import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { refundCredits } from '../billing/credits.ts'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { mediaJob } from '../db/schema.ts'
import { NoContent, publicMediaError, runMediaJob } from './pipeline.ts'
import { cleanup, strayFiles } from './store.ts'

const MAX_ATTEMPTS = 2
const LEASE_SECONDS = 20 * 60

/** Leases the next queued (or abandoned) job. `FOR UPDATE SKIP LOCKED`: several workers can run side by side. */
export async function claimMediaJob(): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    UPDATE media_job SET locked_until = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = attempts + 1, status = 'processing', updated_at = now()
     WHERE id = (SELECT id FROM media_job
                  WHERE status IN ('queued', 'processing') AND attempts <= ${MAX_ATTEMPTS} AND (locked_until IS NULL OR locked_until < now())
                  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`)
  return res.rows[0]?.id ?? null
}

export async function processOneMedia(): Promise<boolean> {
  const id = await claimMediaJob()
  if (!id) return false
  const [job] = await db.select().from(mediaJob).where(eq(mediaJob.id, id))
  try {
    await runMediaJob(id)
  } catch (e) {
    const final = e instanceof NoContent || (job?.attempts ?? 1) >= MAX_ATTEMPTS
    console.error(`[media] job ${id} attempt ${job?.attempts} failed:`, e instanceof NoContent ? 'no content' : e)
    if (final) {
      await db.update(mediaJob).set({ status: 'failed', error: publicMediaError(e), lockedUntil: null, updatedAt: new Date() }).where(eq(mediaJob.id, id))
      if (job) await refundCredits(job.userId, 'media_job', id) // failed work is not charged
      await cleanup(id)
    } else await db.update(mediaJob).set({ lockedUntil: null, updatedAt: new Date() }).where(eq(mediaJob.id, id)) // try once more
  }
  return true
}

/** Uploads nobody finished, and files of jobs that are over, are removed. */
export async function sweepMedia(now = new Date()): Promise<number> {
  const stale = await db.update(mediaJob).set({ status: 'failed', error: 'The upload did not finish in time.', updatedAt: now })
    .where(and(eq(mediaJob.status, 'uploading'), lt(mediaJob.updatedAt, new Date(now.getTime() - 2 * 3600_000)))).returning({ id: mediaJob.id })
  for (const j of stale) await cleanup(j.id)
  const live = await db.select({ id: mediaJob.id }).from(mediaJob).where(inArray(mediaJob.status, ['uploading', 'queued', 'processing']))
  const stray = await strayFiles(new Set(live.map((x) => x.id)))
  for (const id of stray) await cleanup(id)
  return stale.length + stray.length
}

export function startMediaWorker(): () => void {
  let stopped = false
  const loop = async () => { while (!stopped) { try { if (await processOneMedia()) continue } catch (e) { console.error('[media] loop error', e) } await new Promise((r) => setTimeout(r, 2000)) } }
  for (let i = 0; i < env.MEDIA_JOB_CONCURRENCY; i++) void loop()
  void sweepMedia().catch(() => {})
  const sweeper = setInterval(() => void sweepMedia().catch(() => {}), 10 * 60_000); sweeper.unref()
  return () => { stopped = true; clearInterval(sweeper) }
}
