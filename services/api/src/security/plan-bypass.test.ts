import { afterAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { designById, DESIGNS } from '@prompttoppt/theme'
import { db } from '../db/index.ts'
import { creditBalance, generationJob, presentation } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

/** Attack simulations: using paid features without paying. Every one must be refused by the SERVER, whatever the client sends. */
const premium = DESIGNS.find((d) => d.premium)!
const free = DESIGNS.find((d) => !d.premium)!

const users: string[] = []
const newUser = async () => { const u = await signUp('pb'); users.push(u.id); return u }
// these tests create many decks: remove them afterwards so shared-DB analytics tests elsewhere are not affected
afterAll(async () => { if (users.length) { await db.delete(presentation).where(inArray(presentation.userId, users)); await db.delete(generationJob).where(inArray(generationJob.userId, users)) } })

describe('free plan cannot reach paid features', () => {
  it('there is no endpoint that changes your own plan', async () => {
    const u = await newUser()
    for (const planId of ['pro', 'gold']) expect((await api(u.cookie, 'POST', '/dev/set-plan', { planId })).status).toBe(404)
    expect((await json(await api(u.cookie, 'GET', '/me/entitlements'))).data.plan.id).toBe('starter')
  })

  it('a premium look pasted under a different id/name/templateId is still refused on save', async () => {
    const u = await newUser()
    const mine = (await json(await api(u.cookie, 'POST', '/presentations', { templateId: free.id }))).data
    const g = (await json(await api(u.cookie, 'GET', `/presentations/${mine.id}`))).data
    const disguised = { ...premium.theme, id: `custom-${rid()}`, name: 'My theme', templateId: undefined }
    const r = await api(u.cookie, 'PUT', `/presentations/${mine.id}`, { baseRevision: g.revision, document: { ...g.document, theme: disguised } })
    expect(r.status).toBe(403)
    expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')
    const claimsFree = await api(u.cookie, 'PUT', `/presentations/${mine.id}`, { baseRevision: g.revision, document: { ...g.document, theme: { ...premium.theme, id: free.theme.id, templateId: free.id } } })
    expect(claimsFree.status).toBe(403)
  })

  it('restoring an old version cannot bring back a premium look or a too-large deck after a downgrade', async () => {
    const u = await newUser()
    await setPlan(u.id, 'pro')
    const { id } = (await json(await api(u.cookie, 'POST', '/presentations', { templateId: premium.id }))).data
    const v1 = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data
    // swap to a free look while still on Pro, then downgrade and try to restore version 1
    const freeDoc = { ...v1.document, theme: free.theme }
    const saved = await json(await api(u.cookie, 'PUT', `/presentations/${id}`, { baseRevision: v1.revision, document: freeDoc, snapshot: true }))
    expect(saved.success).toBe(true)
    await setPlan(u.id, 'starter')
    const r = await api(u.cookie, 'POST', `/presentations/${id}/versions/1/restore`, { baseRevision: saved.data.revision })
    expect(r.status).toBe(403)
    expect((await api(u.cookie, 'POST', `/presentations/${id}/versions/abc/restore`, { baseRevision: 1 })).status).toBe(404) // not a 500
  })

  it('parallel "create presentation" calls cannot overshoot the monthly allowance', async () => {
    const u = await newUser()
    await setPlan(u.id, 'pro') // 50 decks / month
    for (let i = 0; i < 45; i++) await makeDeck(u.id, 2)
    const results = await Promise.all(Array.from({ length: 12 }, () => api(u.cookie, 'POST', '/presentations', { templateId: free.id })))
    expect(results.filter((r) => r.status === 201)).toHaveLength(5)
    expect(results.filter((r) => r.status === 429)).toHaveLength(7)
  })

  it('late cancel is not free: after the model has started writing slides the credits stay spent; early cancel refunds', async () => {
    const u = await newUser()
    await setPlan(u.id, 'pro')
    const mk = async () => (await json(await api(u.cookie, 'POST', '/generation/jobs', { prompt: 'A short deck about renewable energy for school kids', slideCount: 5, idempotencyKey: `k-${rid()}-${rid()}` }))).data.id as string
    const early = await mk()
    const late = await mk()
    await db.update(generationJob).set({ status: 'generating' }).where(eq(generationJob.id, late))
    const bal = async () => (await db.select().from(creditBalance).where(eq(creditBalance.userId, u.id)))[0]!.balance
    const before = await bal()
    const e = await json(await api(u.cookie, 'POST', `/generation/jobs/${early}/cancel`))
    expect(e.data.creditsRefunded).toBe(true)
    expect(await bal()).toBeGreaterThan(before)
    const mid = await bal()
    const l = await json(await api(u.cookie, 'POST', `/generation/jobs/${late}/cancel`))
    expect(l.data.creditsRefunded).toBe(false)
    expect(await bal()).toBe(mid)
  })

  it('one account cannot queue more than two presentations at once', async () => {
    const u = await newUser()
    await setPlan(u.id, 'pro')
    const mk = () => api(u.cookie, 'POST', '/generation/jobs', { prompt: 'A short deck about renewable energy for school kids', slideCount: 5, idempotencyKey: `k-${rid()}-${rid()}` })
    const r = [await mk(), await mk(), await mk()]
    expect(r.map((x) => x.status)).toEqual([201, 201, 429])
    void designById
  })

  it('exports are authorised on the server for every format', async () => {
    const u = await newUser()
    const deck = await makeDeck(u.id, 3)
    for (const format of ['pptx', 'pdf', 'png', 'jpg', 'html']) {
      const r = await api(u.cookie, 'POST', '/exports', { presentationId: deck.id, format })
      expect(r.status, format).toBe(403)
    }
  })
})
