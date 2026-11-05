import type { generationJob } from '../db/schema.ts'

/** Internal error text (stack fragments, provider messages, paths) never reaches the browser: only a short, plain-language reason does. */
export const safeJobError = (e: string | null): string | null => (e ? (/^[A-Z][^\n]{0,140}$/.test(e) && !/(\bat\b .*\(|\/|\\|https?:|key|token|secret|SELECT|INSERT|ECONN|ENOTFOUND|undefined|\[object)/i.test(e) ? e : 'Generation failed. You were not charged — please try again.') : null)

/** What the browser may know about a job (never internal error text). */
export const jobView = (j: typeof generationJob.$inferSelect) => {
  const r = (j.checkpoint as { report?: { pictures?: { slots: number; placed: number }; remaining?: unknown[] } }).report
  return { id: j.id, status: j.status, progress: j.progress, presentationId: j.presentationId, error: safeJobError(j.error), quality: r ? { pictureSlots: r.pictures?.slots ?? 0, picturesPlaced: r.pictures?.placed ?? 0, openIssues: r.remaining?.length ?? 0 } : null }
}
