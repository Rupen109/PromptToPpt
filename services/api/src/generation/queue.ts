import { sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { env } from '../env.ts'

/**
 * The job queue. Postgres (`FOR UPDATE SKIP LOCKED`): transactional with the job row, safe with any number of workers, no extra service to run.
 * The pipeline only needs "give me the next job id" and is idempotent per job (checkpoints + one deck per job), so the transport can change
 * (BullMQ, SQS) without touching it; docs/DECK_GENERATION_SCALE_ARCHITECTURE.md says when that becomes necessary (a measured gate, not a guess).
 *
 * Lines (lanes): Gold 0, Pro 1, Starter 2. Nobody is made to wait, so under normal load every lane is served at once. When ALL slots are busy the
 * lines share them by weight (default Gold 30 %, Pro 40 %, Starter 30 %): the line furthest below its share goes next, and a line with nobody
 * waiting lends its share to the others. A surge of one plan therefore can never starve another, and a paid plan is never stuck behind free users.
 */
export const LANES = 3
export type Lane = 0 | 1 | 2
/** the speed a plan promises decides its line */
export const laneOfSpeed = (speed: 'standard' | 'fast' | 'ultra'): Lane => (speed === 'ultra' ? 0 : speed === 'fast' ? 1 : 2)

/** how many model calls one deck may run side by side: the paid plans' extra speed. (The provider limiter, not this number, keeps the system inside the quota.) */
export const PARALLEL_BY_LANE: readonly number[] = [8, 5, 3]

export const laneShares = (): number[] => env.LANE_SHARES.split(',').map(Number)

export interface JobQueue {
  /** Atomically leases the next runnable job; null if none. */
  claim(leaseSeconds: number): Promise<string | null>
}

const RUNNABLE = sql`status NOT IN ('completed', 'failed', 'cancelled') AND run_after <= now() AND (locked_until IS NULL OR locked_until < now())`

/** The line to serve next: among lines with a waiting job, the one with the fewest busy slots per share of the slots (ties: the paid line first). */
export function nextLane(waiting: number[], running: number[], shares: number[]): Lane | null {
  let best: Lane | null = null
  let bestLoad = Infinity
  for (let lane = 0; lane < LANES; lane++) {
    if (!(waiting[lane]! > 0)) continue
    const load = (running[lane] ?? 0) / Math.max(shares[lane] ?? 1, 0.0001)
    if (load < bestLoad) { best = lane as Lane; bestLoad = load }
  }
  return best
}

async function claimFrom(lane: number, leaseSeconds: number): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    UPDATE generation_job
       SET locked_until = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1, updated_at = now()
     WHERE id = (SELECT id FROM generation_job WHERE lane = ${lane} AND ${RUNNABLE} ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`)
  return res.rows[0]?.id ?? null
}

export const postgresQueue: JobQueue = {
  async claim(leaseSeconds) {
    // one small indexed query for the lines with a waiting job, one for the busy slots per line; then the claim itself
    const waitingRows = await db.execute<{ lane: number; n: number }>(sql`
      SELECT lane, count(*)::int AS n FROM (SELECT lane FROM generation_job WHERE ${RUNNABLE} LIMIT 1000) q GROUP BY lane`)
    if (waitingRows.rows.length === 0) return null
    const waiting: number[] = [0, 0, 0]
    for (const r of waitingRows.rows) waiting[r.lane] = r.n
    const runningRows = await db.execute<{ lane: number; n: number }>(sql`
      SELECT lane, count(*)::int AS n FROM generation_job WHERE status NOT IN ('completed', 'failed', 'cancelled') AND locked_until >= now() GROUP BY lane`)
    const running: number[] = [0, 0, 0]
    for (const r of runningRows.rows) running[r.lane] = r.n
    const shares = laneShares()
    // a line can empty between the look and the claim (another worker took its job): try the next best
    for (let tries = 0; tries < LANES; tries++) {
      const lane = nextLane(waiting, running, shares)
      if (lane === null) return null
      const id = await claimFrom(lane, leaseSeconds)
      if (id) return id
      waiting[lane] = 0
    }
    return null
  },
}

/** Keeps a running job's lease alive (a long stage must never look like a crashed worker). */
export async function renewLease(jobId: string, leaseSeconds: number): Promise<void> {
  await db.execute(sql`UPDATE generation_job SET locked_until = now() + make_interval(secs => ${leaseSeconds}) WHERE id = ${jobId} AND status NOT IN ('completed', 'failed', 'cancelled')`)
}

/** A worker that is stopping hands its jobs back at once: another worker resumes them from their checkpoints without waiting for the lease to run out. */
export async function releaseLeases(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return
  await db.execute(sql`UPDATE generation_job SET locked_until = NULL, attempts = GREATEST(attempts - 1, 0) WHERE id IN (${sql.join(jobIds.map((i) => sql`${i}`), sql`, `)}) AND status NOT IN ('completed', 'failed', 'cancelled')`)
}

/** How the lines look right now: the numbers the autoscaler and the dashboards use. */
export async function queueStats(): Promise<{ waiting: number[]; running: number[]; oldestWaitMs: number[] }> {
  const w = await db.execute<{ lane: number; n: number; oldest: number | null }>(sql`
    SELECT lane, count(*)::int AS n, (extract(epoch from (now() - min(created_at))) * 1000)::bigint AS oldest FROM generation_job WHERE ${RUNNABLE} GROUP BY lane`)
  const r = await db.execute<{ lane: number; n: number }>(sql`
    SELECT lane, count(*)::int AS n FROM generation_job WHERE status NOT IN ('completed', 'failed', 'cancelled') AND locked_until >= now() GROUP BY lane`)
  const waiting = [0, 0, 0], running = [0, 0, 0], oldestWaitMs = [0, 0, 0]
  for (const x of w.rows) { waiting[x.lane] = x.n; oldestWaitMs[x.lane] = Number(x.oldest ?? 0) }
  for (const x of r.rows) running[x.lane] = x.n
  return { waiting, running, oldestWaitMs }
}
