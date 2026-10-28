import { inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent } from '../db/schema.ts'
import { tinyPdf } from '../test-pdf.ts'
import { json } from '../test-utils.ts'
import { resetFreeToolsCache, setFreeToolsCap } from './limits.ts'

/** The public free tools: anonymous, so every test here is also a cost-control test. (Burst limit is 6/min, so this file stays under 6 calls.) */
const events: string[] = []
beforeEach(() => { resetFreeToolsCache(); setFreeToolsCap() })
afterAll(async () => { if (events.length) await db.delete(aiUsageEvent).where(inArray(aiUsageEvent.id, events)).catch(() => {}) })

const post = (path: string, body: unknown) => app.request(`/api/v1/free-tools${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const upload = (bytes: Uint8Array, name: string, mode?: string) => {
  const fd = new FormData()
  fd.set('file', new File([Buffer.from(bytes)], name, { type: 'application/pdf' }))
  if (mode) fd.set('mode', mode)
  return app.request('/api/v1/free-tools/pdf', { method: 'POST', body: fd })
}

describe('free tools', () => {
  it('builds an outline with no login', async () => {
    const r = await post('/outline', { topic: 'Salesforce Agentforce', slides: 6 })
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d.slides).toHaveLength(6)
    expect(d.slides[0].points.length).toBeGreaterThan(0)
  })

  it('refuses an empty topic and an out-of-range slide count', async () => {
    expect((await post('/outline', { topic: 'x' })).status).toBe(400)
  })

  it('turns a PDF into a summary + outline and keeps the parsed file for the editor hand-off', async () => {
    const r = await upload(tinyPdf(['Revenue grew in Q3', 'Risks remain in supply']), 'Q3 report.pdf', 'executive')
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d.mode).toBe('executive')
    expect(d.slides.length).toBeGreaterThanOrEqual(3)
    expect(d.attachmentId).toMatch(/^[\w-]{24}$/)
  })

  it('rejects a fake PDF without calling the model', async () => {
    const r = await upload(new TextEncoder().encode('<html>not a pdf</html>'), 'x.pdf')
    expect(r.status).toBe(422)
  })

  it('pauses once the free tools have spent their daily budget (a botnet cannot burn more)', async () => {
    const id = nanoid(); events.push(id)
    await db.insert(aiUsageEvent).values({ id, userId: null, provider: 'vertex', model: 'm', requestType: 'free_outline', latencyMs: 1, status: 'success', providerCostUsd: '0.01', environment: 'development' })
    setFreeToolsCap(0.005) // the ledger is immutable, so prove the cap with a tiny cost row and a tiny cap
    const r = await post('/outline', { topic: 'Anything at all' })
    expect(r.status).toBe(503)
    expect((await json(r)).error.code).toBe('BUSY')
  })
})
