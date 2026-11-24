import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { morphDecisionSchema } from '@prompttoppt/validation'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent } from '../db/schema.ts'
import { setPlan, signUp } from '../test-utils.ts'

const body = (extra: Record<string, unknown> = {}) => JSON.stringify({
  prompt: 'Series A pitch with market size, competition and go-to-market for a B2B SaaS',
  analysis: { topic: 'Series A pitch for a B2B SaaS', category: 'pitch', specificity: 'detailed', language: 'en', requiredSections: [], facts: [], ...extra },
})
const post = (cookie: string | undefined, b: string = body()) => app.request('/api/v1/generation/morph-match', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), 'x-forwarded-for': `198.51.100.${1 + Math.floor(Math.random() * 250)}` }, body: b })
const calls = (userId: string) => db.select().from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, userId), eq(aiUsageEvent.requestType, 'morph_match')))

describe('POST /generation/morph-match', () => {
  it('needs a signed-in person', async () => {
    expect((await post(undefined)).status).toBe(401)
  })

  it('is a Gold and Premium feature, like Morph itself (Starter and Pro are told to upgrade, and no model call is made)', async () => {
    const u = await signUp('mm')
    const starter = await post(u.cookie)
    expect(starter.status).toBe(403)
    expect(((await starter.json()) as { error: { code: string } }).error.code).toBe('UPGRADE_REQUIRED')
    await setPlan(u.id, 'pro')
    expect((await post(u.cookie)).status).toBe(403)
    expect(await calls(u.id)).toHaveLength(0)
  })

  it('on Gold: returns a decision that fits the schema, within the plan\'s slide limit, and a repeat is answered from the cache', async () => {
    const u = await signUp('mm')
    await setPlan(u.id, 'gold')
    const first = await post(u.cookie)
    expect(first.status).toBe(200)
    const data = morphDecisionSchema.parse(((await first.json()) as { data: unknown }).data)
    expect(data.mode).toBe('template')
    for (const c of data.candidates) expect(c.slides).toBeLessThanOrEqual(25) // Gold: 25 slides a deck
    const used = (await calls(u.id)).length
    expect(used).toBeLessThanOrEqual(1)
    const again = await post(u.cookie)
    expect(((await again.json()) as { data: unknown }).data).toEqual(data)
    expect(await calls(u.id)).toHaveLength(used) // not asked again
  })

  it('a language the template fonts cannot set is answered with a custom deck, without a model call', async () => {
    const u = await signUp('mm')
    await setPlan(u.id, 'gold')
    const r = await post(u.cookie, body({ language: 'ar' }))
    const data = morphDecisionSchema.parse(((await r.json()) as { data: unknown }).data)
    expect(data.mode).toBe('custom')
    expect(await calls(u.id)).toHaveLength(0)
  })

  it('rejects a request without an analysis', async () => {
    const u = await signUp('mm')
    await setPlan(u.id, 'gold')
    expect((await post(u.cookie, JSON.stringify({ prompt: 'a pitch deck for a startup' }))).status).toBe(400)
  })
})

describe('POST /generation/morph-lengths', () => {
  const lengths = (cookie: string | undefined, templateId: string, extra: Record<string, unknown> = {}) => app.request('/api/v1/generation/morph-lengths', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ templateId, prompt: 'Pitch deck for our bakery delivery startup', analysis: { topic: 'Bakery delivery pitch', category: 'pitch', specificity: 'detailed', language: 'en', requiredSections: [], facts: [], ...extra } }) })
  it('needs a person, and the Gold plan', async () => {
    expect((await lengths(undefined, 'pitch-orbit')).status).toBe(401)
    const u = await signUp('ml'); expect((await lengths(u.cookie, 'pitch-orbit')).status).toBe(403)
  })
  it('lists the lengths for this request, longest first, and what was left out because it cannot be filled', async () => {
    const u = await signUp('ml'); await setPlan(u.id, 'gold')
    const r = await lengths(u.cookie, 'pitch-orbit')
    expect(r.status).toBe(200)
    const d = ((await r.json()) as { data: { lengths: number[]; fullLength: number; leftOut: { scene: string; title: string }[] } }).data
    expect(d.fullLength).toBe(11); expect(d.lengths[0]).toBe(10) // no team named: the Team scene is left out
    expect(d.leftOut).toEqual([{ scene: 's8', title: 'Team' }])
    for (let i = 1; i < d.lengths.length; i++) expect(d.lengths[i]).toBe(d.lengths[i - 1]! - 1)
    const withTeam = ((await (await lengths(u.cookie, 'pitch-orbit', { facts: ['Our founding team of five'] })).json()) as { data: { lengths: number[]; leftOut: unknown[] } }).data
    expect(withTeam.lengths[0]).toBe(11); expect(withTeam.leftOut).toEqual([])
  })
  it('an unknown template is a 400', async () => {
    const u = await signUp('ml'); await setPlan(u.id, 'gold')
    expect((await lengths(u.cookie, 'nope')).status).toBe(400)
  })
})
