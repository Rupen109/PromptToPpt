import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { morphMatchLog, user } from '../db/schema.ts'
import { api, json, signUp } from '../test-utils.ts'
import { logDecision, markUsed } from '../generation/morph-log.ts'
import type { MorphDecision, PromptAnalysis } from '@prompttoppt/validation'

/** Rows sit in a private one-day window far in the past (unique per run): the test DB is shared between runs and suites. */
function windowOf() {
  const from = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3650) * 864e5)
  return { from, at: (h: number) => new Date(from.getTime() + (10 + h) * 36e5), q: `from=${from.toISOString()}&to=${new Date(from.getTime() + 864e5).toISOString()}` }
}
const adminUser = async () => { const u = await signUp('mm'); await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id)); return u }
const get = async (cookie: string, path: string) => { const r = await api(cookie, 'GET', `/admin${path}`); expect(r.status).toBe(200); return (await json(r)).data }
const decision = (o: Partial<MorphDecision>): MorphDecision => ({ mode: 'custom', confidence: 0.9, reason: 'No template fits.', candidates: [], excluded: { plan: 0, language: 0, mood: 0, pictures: 0, credits: 0, topic: 0 }, ...o })
const analysis = (topic: string, category?: PromptAnalysis['category']) => ({ topic, language: 'en', requiredSections: [], facts: [], specificity: 'detailed', ...(category ? { category } : {}) }) as unknown as PromptAnalysis

describe('Morph matches (owner report)', () => {
  it('is admin-only: a normal user gets 403, anonymous 401', async () => {
    const u = await signUp('mm')
    for (const p of ['morph/summary', 'morph/templates', 'morph/unmatched']) {
      expect((await api(u.cookie, 'GET', `/admin/${p}`)).status, p).toBe(403)
      expect((await api('', 'GET', `/admin/${p}`)).status, p).toBe(401)
    }
  })

  it('logs a decision, notes what the deck was started with, and reports counts, template use and topics with no template, with no identity', async () => {
    const admin = await adminUser()
    const w = windowOf()
    const person = await signUp('mm')
    const [{ email } = { email: '' }] = await db.select({ email: user.email }).from(user).where(eq(user.id, person.id))
    // a followed recommendation, a switched one, one where the person chose the AI-planned deck, and two custom decisions
    await logDecision(person.id, 'pitch deck one', analysis('Series A pitch', 'pitch'), decision({ mode: 'template', templateId: 'pitch-market', confidence: 0.9, reason: 'fits' }))
    await logDecision(person.id, 'pitch deck two', analysis('Seed pitch', 'pitch'), decision({ mode: 'template', templateId: 'pitch-orbit', confidence: 0.8, reason: 'fits' }))
    await logDecision(person.id, 'pitch deck three', analysis('Another pitch', 'pitch'), decision({ mode: 'template', templateId: 'pitch-cards', confidence: 0.7, reason: 'fits' }))
    await logDecision(person.id, 'tax guide', analysis('Tax planning guide for freelancers', 'strategy'), decision({ reason: 'Nothing fits the topic.' }))
    await logDecision(person.id, 'wedding plan', analysis('Wedding planning timeline', undefined), decision({}))
    await markUsed(person.id, 'pitch deck one', 'pitch-market')
    await markUsed(person.id, 'pitch deck two', 'pitch-market') // switched to another template
    await markUsed(person.id, 'pitch deck three', null) // chose the AI-planned deck
    // move this person's rows into the private window
    const rows = await db.select().from(morphMatchLog).where(eq(morphMatchLog.userId, person.id))
    expect(rows).toHaveLength(5); expect(rows.filter((r) => r.usedAt).length).toBe(3)
    for (const [i, r] of rows.entries()) await db.update(morphMatchLog).set({ createdAt: w.at(i) }).where(eq(morphMatchLog.id, r.id))

    const s = await get(admin.cookie, `/morph/summary?${w.q}`)
    expect(s).toMatchObject({ total: 5, template: 3, custom: 2, started: 3, followed: 1, switched: 1, choseAi: 1, choseTemplateAnyway: 0 })
    const t = await get(admin.cookie, `/morph/templates?${w.q}`) as { id: string; recommended: number; used: number }[]
    expect(t.find((x) => x.id === 'pitch-market')).toMatchObject({ recommended: 1, used: 2 })
    expect(t.find((x) => x.id === 'pitch-orbit')).toMatchObject({ recommended: 1, used: 0 })
    const u = await get(admin.cookie, `/morph/unmatched?${w.q}`) as { byCategory: { category: string; n: number }[]; recent: { topic: string; category: string | null; reason: string; createdAt: string }[] }
    expect(u.recent.map((x) => x.topic).sort()).toEqual(['Tax planning guide for freelancers', 'Wedding planning timeline'])
    for (const r of u.recent) expect(new Date(r.createdAt).getUTCFullYear()).toBe(w.from.getUTCFullYear()) // a real timestamp, in UTC
    expect(u.byCategory.find((x) => x.category === 'strategy')?.n).toBe(1)
    expect(u.byCategory.find((x) => x.category === 'unknown')?.n).toBe(1)
    // privacy: nothing that identifies the person leaves the report
    const all = JSON.stringify([s, t, u])
    expect(all).not.toContain(email); expect(all).not.toContain(person.id)
  })

  it('markUsed only touches the person\'s own latest decision for that request, once', async () => {
    const a = await signUp('mm'), b = await signUp('mm')
    await logDecision(a.id, 'same prompt', analysis('Topic A'), decision({ mode: 'template', templateId: 'space' }))
    await logDecision(b.id, 'same prompt', analysis('Topic B'), decision({ mode: 'template', templateId: 'space' }))
    await markUsed(a.id, 'same prompt', 'space')
    await markUsed(a.id, 'same prompt', 'launch') // already noted: not overwritten
    const ra = await db.select().from(morphMatchLog).where(eq(morphMatchLog.userId, a.id)); const rb = await db.select().from(morphMatchLog).where(eq(morphMatchLog.userId, b.id))
    expect(ra[0]!.usedTemplate).toBe('space'); expect(rb[0]!.usedAt).toBeNull()
    void nanoid
  })
})
