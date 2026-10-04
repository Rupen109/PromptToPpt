import { sql } from 'drizzle-orm'
import { db } from '../db/index.ts'

/**
 * Job queue seam. Today: Postgres (`FOR UPDATE SKIP LOCKED`) — no extra infrastructure, transactional with the
 * job row, safe with multiple workers. Production-at-scale can swap this for SQS without touching the pipeline:
 * the pipeline only needs "give me the next job id" and is idempotent per job (checkpoints + unique presentation).
 */
export interface JobQueue {
  /** Atomically leases the next runnable job; null if none. */
  claim(leaseSeconds: number): Promise<string | null>
}

export const postgresQueue: JobQueue = {
  async claim(leaseSeconds) {
    const res = await db.execute<{ id: string }>(sql`
      UPDATE generation_job
         SET locked_until = now() + make_interval(secs => ${leaseSeconds}),
             attempts = attempts + 1,
             updated_at = now()
       WHERE id = (
         SELECT id FROM generation_job
          WHERE status NOT IN ('completed', 'failed', 'cancelled')
            AND run_after <= now()
            AND (locked_until IS NULL OR locked_until < now())
          -- fair share: every user's oldest job runs before anyone's second job, so one account can't monopolise the worker
          ORDER BY (SELECT count(*) FROM generation_job j2 WHERE j2.user_id = generation_job.user_id AND j2.created_at < generation_job.created_at AND j2.status NOT IN ('completed', 'failed', 'cancelled')), created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1)
      RETURNING id`)
    return res.rows[0]?.id ?? null
  },
}
