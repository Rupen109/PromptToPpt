import { describe, expect, it } from 'vitest'
import { summariseHonesty } from './honesty-report.ts'

const chk = (kind: string, status: string) => ({ key: kind, kind, status })
describe('the honesty report: claimed versus verified, from settlement records', () => {
  it('counts what each kind of change promised and what was verified on the saved deck', () => {
    const r = summariseHonesty([
      { status: 'settled', mismatches: 0, results: [chk('element', 'done'), chk('element', 'failed'), chk('theme', 'done')] },
      { status: 'settled', mismatches: 1, results: [chk('element', 'done'), chk('element', 'unchanged')] },
      { status: 'settled', mismatches: 0, results: [chk('edit', 'failed')] },
      { status: 'reserved', mismatches: 0, results: null },
    ], 7)
    expect(r).toMatchObject({ days: 7, requests: 4, settled: 3, nothingVerified: 1, browserDisagreed: 1 })
    const el = r.byKind.find((k) => k.kind === 'element')!
    expect(el).toMatchObject({ promised: 4, verified: 2, failed: 1, unchanged: 1, verifiedShare: 0.5 })
    expect(r.byKind[0]!.kind).toBe('element') // the most promised first
  })
  it('proposals and information are not promises; an empty week is an empty report', () => {
    expect(summariseHonesty([{ status: 'settled', mismatches: 0, results: [chk('proposal', 'info'), chk('rewrite', 'info')] }], 7).byKind).toEqual([])
    expect(summariseHonesty([], 30)).toEqual({ days: 30, requests: 0, settled: 0, nothingVerified: 0, browserDisagreed: 0, byKind: [] })
  })
})
