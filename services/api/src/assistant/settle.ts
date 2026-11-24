import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { evaluate, type Check, type Expectation } from '@prompttoppt/theme'
import type { ExpectationKind, Presentation } from '@prompttoppt/validation'
import { refundCredits, reserveCredits } from '../billing/credits.ts'
import { db } from '../db/index.ts'
import { aiAssistRequest, presentation, presentationVersion } from '../db/schema.ts'
import { MIN_TRANSPARENT_SHARE, transparentShareOfStored } from '../media/cutout-picture.ts'

/**
 * Settling what an assistant request cost, by what is REALLY in the saved deck.
 *
 * The browser reports when it has applied an answer and saved; that report only TRIGGERS this. The server loads the saved deck and checks every expectation of the request itself
 * (the same `evaluate` the editor used, plus checks only the server can make, like the stored picture's real transparency), and decides the money from that alone. The report is stored to
 * count how often the browser disagrees; it is never trusted for money. Everything is idempotent by the request id, and a sweeper settles requests whose browser never reported.
 */
export interface Reservation { ref: string; units: number; kind: 'base' | 'more' | 'enrich' | 'external'; /** the ledger reference type the credits were reserved under (default `ai_assist`) */ refType?: string | undefined; /** an external cost belongs to one expectation and is charged only if that one is verified */ forKey?: string | undefined }

/**
 * Every kind of expectation is classified, so a new kind cannot be forgotten (it does not compile until it is here): a CHANGE to the deck decides the money; information, proposals, rebuilds and
 * put-backs never do (they are charged or refunded where they happen). `written` marks the kinds whose work a model WROTE (the second unit is for writing more than one slide).
 */
const KIND_CLASS: Record<ExpectationKind, 'change' | 'info'> = {
  theme: 'change', edit: 'change', addition: 'change', background: 'change', gradient: 'change', background_blur: 'change', background_pattern: 'change', background_copy: 'change', slide_brand: 'change', clear_pictures: 'change', picture_swap: 'change', readability: 'change', photo: 'change',
  duplicate: 'change', move: 'change', lock: 'change', removal: 'change', element: 'change', transition: 'change',
  revert: 'info', proposal: 'info', rewrite: 'info',
}
const CHANGE_KINDS = new Set((Object.keys(KIND_CLASS) as ExpectationKind[]).filter((k) => KIND_CLASS[k] === 'change'))
/** the kinds whose work a model WROTE */
const WRITTEN_KINDS = new Set(['edit', 'addition'])

export interface Plan { refund: string[]; keep: string[]; reason: string; verified: number; judged: number }

/**
 * The money policy (docs/AI_EDIT_HONESTY_AND_SCENARIOS.md section 10.4), pure so it is tested row by row:
 *  - nothing verified: every reservation of the request is refunded;
 *  - at least one change verified: the base unit stays; the second unit (more than one slide written) stays only if at least two written slides are verified; the enrich unit only if a
 *    slide edit is verified; an external cost only if ITS operation is verified;
 *  - no change to judge (proposals, rebuilds, put-backs only): untouched, those flows are charged or refunded where they happen.
 */
export function settlementPlan(reservations: Reservation[], expectations: Pick<Expectation, 'key' | 'kind'>[], checks: Pick<Check, 'key' | 'status'>[]): Plan {
  const status = new Map(checks.map((c) => [c.key, c.status]))
  const judged = expectations.filter((e) => CHANGE_KINDS.has(e.kind))
  const verified = judged.filter((e) => status.get(e.key) === 'done')
  if (judged.length === 0) return { refund: [], keep: reservations.map((r) => r.ref), reason: 'no change to judge', verified: 0, judged: 0 }
  if (verified.length === 0) return { refund: reservations.map((r) => r.ref), keep: [], reason: 'nothing was verified in the saved deck', verified: 0, judged: judged.length }
  const writtenDone = verified.filter((e) => WRITTEN_KINDS.has(e.kind)).length
  const editDone = verified.filter((e) => e.kind === 'edit').length
  const refund: string[] = [], keep: string[] = []
  for (const r of reservations) {
    const keepIt = r.kind === 'base' ? true : r.kind === 'more' ? writtenDone >= 2 : r.kind === 'enrich' ? editDone >= 1 : status.get(r.forKey ?? '') === 'done'
    ;(keepIt ? keep : refund).push(r.ref)
  }
  return { refund, keep, reason: `${verified.length} of ${judged.length} changes verified`, verified: verified.length, judged: judged.length }
}

export interface Settled { status: 'settled'; plan: Plan; checks: Check[]; refunded: string[]; already: boolean }

/** The server's own check of every expectation against the saved deck (plus what only the server can look at). */
export async function verifySaved(ownerId: string, doc: Presentation, expectations: Expectation[]): Promise<Check[]> {
  const out: Check[] = []
  for (const e of expectations) {
    let c = evaluate(e, doc)
    // a cut-out is only a cut-out if the stored file really is see-through (measured from the stored bytes, not from what anyone reported)
    if (e.kind === 'picture_swap' && c.status === 'done') {
      const share = await transparentShareOfStored(ownerId, e.to)
      if (share === null || share < MIN_TRANSPARENT_SHARE) c = { key: e.key, kind: e.kind, status: 'failed', reason: 'no_transparency', slideId: e.slideId, elementId: e.elementId, evidence: [share === null ? 'the stored picture could not be read' : `the stored picture is only ${Math.round(share * 100)}% see-through`] }
      else c = { ...c, evidence: [...c.evidence, `stored picture re-checked: ${Math.round(share * 100)}% see-through`] }
    }
    out.push(c)
  }
  return out
}

async function savedDoc(presentationId: string): Promise<Presentation | null> {
  const [p] = await db.select({ latest: presentation.latestVersion }).from(presentation).where(eq(presentation.id, presentationId))
  if (!p) return null
  const [v] = await db.select({ document: presentationVersion.document }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, presentationId), eq(presentationVersion.version, p.latest)))
  return (v?.document as Presentation | undefined) ?? null
}

/**
 * Settles one request. Safe to call many times (and from two places at once): the first call claims it and does the work, later calls return the stored result.
 * `report` is what the browser said; it is only compared and stored.
 */
export async function settleAssistRequest(requestId: string, o: { trigger: 'client' | 'sweeper'; report?: { results?: { key: string; status: string }[] | undefined } | undefined }): Promise<Settled | null> {
  const claimed = await db.update(aiAssistRequest).set({ status: 'settling', trigger: o.trigger }).where(and(eq(aiAssistRequest.id, requestId), eq(aiAssistRequest.status, 'reserved'))).returning()
  const row = claimed[0]
  if (!row) {
    const [existing] = await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, requestId))
    if (!existing) return null
    return { status: 'settled', plan: { refund: existing.refundedRefs ?? [], keep: [], reason: 'settled earlier', verified: 0, judged: 0 }, checks: (existing.results as Check[] | null) ?? [], refunded: existing.refundedRefs ?? [], already: true }
  }
  try {
    const doc = await savedDoc(row.presentationId)
    const expectations = row.expectations as Expectation[]
    // a deck that cannot be read verifies nothing: nothing is claimed and nothing is kept
    const checks = doc ? await verifySaved(row.userId, doc, expectations) : expectations.map((e): Check => ({ key: e.key, kind: e.kind, status: 'failed', reason: 'missing_slide', evidence: ['the saved deck could not be read'] }))
    const plan = settlementPlan(row.reservations, expectations, checks)
    for (const ref of plan.refund) await refundCredits(row.userId, row.reservations.find((r) => r.ref === ref)?.refType ?? 'ai_assist', ref) // idempotent per reference
    const mismatches = o.report?.results ? o.report.results.filter((r) => { const mine = checks.find((c) => c.key === r.key); return !!mine && mine.status !== r.status && !(mine.status === 'skipped' && r.status === 'failed') && !(mine.status === 'failed' && r.status === 'skipped') }).length : 0
    if (mismatches) console.warn(`[ai-assist settle] ${requestId}: the browser disagreed with the saved deck on ${mismatches} change(s)`)
    await db.update(aiAssistRequest).set({ status: 'settled', results: checks, refundedRefs: plan.refund, clientReport: o.report ?? null, mismatches, settledAt: new Date() }).where(eq(aiAssistRequest.id, requestId))
    return { status: 'settled', plan, checks, refunded: plan.refund, already: false }
  } catch (e) {
    // put it back so the sweeper (or another report) can try again; nothing was half-settled (refunds are idempotent)
    await db.update(aiAssistRequest).set({ status: 'reserved' }).where(and(eq(aiAssistRequest.id, requestId), eq(aiAssistRequest.status, 'settling')))
    throw e
  }
}

/** Requests whose browser never reported (a closed tab, a failed save) are settled against the saved deck after this long. */
export const STALE_AFTER_MS = 10 * 60_000

export async function settleStaleRequests(olderThanMs = STALE_AFTER_MS, limit = 50): Promise<number> {
  const rows = await db.select({ id: aiAssistRequest.id }).from(aiAssistRequest).where(and(eq(aiAssistRequest.status, 'reserved'), lt(aiAssistRequest.createdAt, new Date(Date.now() - olderThanMs)))).limit(limit)
  let n = 0
  for (const r of rows) { try { if (await settleAssistRequest(r.id, { trigger: 'sweeper' })) n++ } catch (e) { console.error('[ai-assist sweeper]', r.id, e) } }
  // a request stuck in "settling" (the server stopped mid-way) goes back to reserved after the same time
  await db.update(aiAssistRequest).set({ status: 'reserved' }).where(and(eq(aiAssistRequest.status, 'settling'), lt(aiAssistRequest.createdAt, new Date(Date.now() - 2 * olderThanMs)), sql`true`))
  return n
}

/**
 * The window in which a refund can be taken back. A browser that saved WITHOUT the change reported, was refunded, and then saved the change a little later (the same work, re-applied) must not
 * keep that work for free. The later deck is judged by the same rules as at settlement, and only when EVERY change of the request is now verified (a partial result is never charged late).
 */
export const RECLAIM_WITHIN_MS = 30 * 60_000

/** Re-checks recently refunded requests against the deck as it is now; charges again (once) the ones whose changes are all there. Returns how many were charged. */
export async function reclaimRefunded(withinMs = RECLAIM_WITHIN_MS, limit = 50): Promise<number> {
  const rows = await db.select({ id: aiAssistRequest.id }).from(aiAssistRequest).where(and(eq(aiAssistRequest.status, 'settled'), gt(aiAssistRequest.settledAt, new Date(Date.now() - withinMs)), sql`jsonb_array_length(coalesce(${aiAssistRequest.refundedRefs}, '[]'::jsonb)) > 0`)).limit(limit)
  let n = 0
  for (const { id } of rows) {
    try {
      // claimed first (settled → reclaiming), so two sweeps never charge twice
      const [row] = await db.update(aiAssistRequest).set({ status: 'reclaiming' }).where(and(eq(aiAssistRequest.id, id), eq(aiAssistRequest.status, 'settled'))).returning()
      if (!row) continue
      let charged = false, final: 'reclaimed' | 'settled' = 'settled'
      try {
        const doc = await savedDoc(row.presentationId)
        const expectations = row.expectations as Expectation[]
        const checks = doc ? await verifySaved(row.userId, doc, expectations) : []
        const plan = settlementPlan(row.reservations, expectations, checks)
        const judged = expectations.filter((e) => KIND_CLASS[e.kind] === 'change')
        const everyChange = doc !== null && judged.length > 0 && judged.every((e) => checks.find((c) => c.key === e.key)?.status === 'done')
        if (everyChange) {
          const refunded = row.refundedRefs ?? []
          // what the full result is charged: the units refunded earlier that the full result keeps (the same rule as settlement, applied to a fully verified deck)
          const owed = plan.keep.filter((ref) => refunded.includes(ref))
          for (const ref of owed) { const r = row.reservations.find((x) => x.ref === ref)!; await reserveCredits(row.userId, r.units, r.refType ?? 'ai_assist', ref) }
          // (reserveCredits of a reference refunded before opens a new attempt; one already charged is left alone)
          charged = owed.length > 0; final = 'reclaimed'
        }
      } finally {
        await db.update(aiAssistRequest).set({ status: final }).where(and(eq(aiAssistRequest.id, id), eq(aiAssistRequest.status, 'reclaiming')))
      }
      if (charged) n++
    } catch (e) { console.error('[ai-assist reclaim]', id, e) }
  }
  return n
}
