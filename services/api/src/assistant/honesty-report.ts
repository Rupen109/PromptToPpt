import { and, gte, eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { aiAssistRequest } from '../db/schema.ts'

/**
 * How honest the assistant was, measured in production: for every kind of change it promised, how many promises were verified on the SAVED deck and how many were not (claimed versus verified), plus how
 * often the browser disagreed with the server and how many requests ended with nothing verified. Read from the settlement records the money is decided from; nothing here is estimated.
 */
export interface HonestyRow { kind: string; promised: number; verified: number; unchanged: number; failed: number; skipped: number; verifiedShare: number | null }
export interface HonestyReport { days: number; requests: number; settled: number; nothingVerified: number; browserDisagreed: number; byKind: HonestyRow[] }

type StoredCheck = { kind?: string; status?: string }

/** pure: from stored settlement records to the report (tested without a database) */
export function summariseHonesty(rows: { status: string; results: unknown; mismatches: number }[], days: number): HonestyReport {
  const by = new Map<string, HonestyRow>()
  let settled = 0, nothingVerified = 0, browserDisagreed = 0
  for (const r of rows) {
    if (r.mismatches > 0) browserDisagreed++
    if (r.status !== 'settled') continue
    settled++
    const checks = Array.isArray(r.results) ? (r.results as StoredCheck[]) : []
    if (checks.length && !checks.some((c) => c.status === 'done')) nothingVerified++
    for (const c of checks) {
      if (!c.kind || c.kind === 'proposal' || c.status === 'info') continue
      const row = by.get(c.kind) ?? { kind: c.kind, promised: 0, verified: 0, unchanged: 0, failed: 0, skipped: 0, verifiedShare: null }
      row.promised++
      if (c.status === 'done') row.verified++; else if (c.status === 'unchanged') row.unchanged++; else if (c.status === 'skipped') row.skipped++; else row.failed++
      by.set(c.kind, row)
    }
  }
  const byKind = [...by.values()].map((r) => ({ ...r, verifiedShare: r.promised ? Math.round((r.verified / r.promised) * 1000) / 1000 : null })).sort((a, b) => b.promised - a.promised)
  return { days, requests: rows.length, settled, nothingVerified, browserDisagreed, byKind }
}

export async function honestyReport(days = 7): Promise<HonestyReport> {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await db.select({ status: aiAssistRequest.status, results: aiAssistRequest.results, mismatches: aiAssistRequest.mismatches }).from(aiAssistRequest).where(and(gte(aiAssistRequest.createdAt, since), eq(aiAssistRequest.status, 'settled')))
  return summariseHonesty(rows, days)
}
