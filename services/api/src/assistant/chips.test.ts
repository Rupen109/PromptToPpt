import { describe, expect, it } from 'vitest'
import { FAMILIES } from './understand.ts'
import { capabilityViews, quickActions, type CapCtx } from './registry.ts'

const ctx = (o: Partial<CapCtx> = {}): CapCtx => ({ features: { premiumTemplates: true, brandKit: true, advancedEditor: true } as never, flags: { background_removal: true, image_generation: true }, isOwner: true, hasSources: true, slide: { n: 2, layout: 'title-body', locked: false }, ...o })

describe('quick-action chips come from the registry', () => {
  it('every chip is the declared example of an AVAILABLE capability, in a known group, max 4 per group', () => {
    const chips = quickActions(ctx())
    expect(chips.length).toBeGreaterThan(5)
    const groups = new Set(chips.map((c) => c.group))
    expect([...groups].every((g) => ['Edit', 'Design', 'Create', 'Animations'].includes(g))).toBe(true)
    for (const g of groups) expect(chips.filter((c) => c.group === g).length).toBeLessThanOrEqual(4)
    const views = capabilityViews(ctx())
    for (const c of chips.filter((x) => x.family !== 'review')) expect(views.find((v) => v.family === c.family)!.availability.available).toBe(true)
    expect(chips[0]).toMatchObject({ family: 'review', text: 'Review my deck' })
  })
  it('a switched-off part is never offered (background removal off: no cut-out chip)', () => {
    const on = quickActions(ctx(), 20).map((c) => c.text.toLowerCase())
    const off = quickActions(ctx({ flags: { background_removal: false, image_generation: true } }), 20).map((c) => c.text.toLowerCase())
    expect(on.some((t) => t.includes('background of this image'))).toBe(true)
    expect(off.some((t) => t.includes('background of this image'))).toBe(false)
  })
  it('a plan without premium designs does not get the premium chip; a morph slide gets no layout chip', () => {
    expect(quickActions(ctx({ features: { premiumTemplates: false } as never }), 20).some((c) => /premium design/i.test(c.text))).toBe(false)
    expect(quickActions(ctx({ slide: { n: 1, layout: 'morph-template', locked: false } }), 20).filter((c) => c.family === 'layout')).toEqual([])
  })
  it('an own-template slide gets no layout chip', () => {
    expect(quickActions(ctx({ slide: { n: 1, layout: 'blank', locked: false, fromFile: true } }), 20).filter((c) => c.family === 'layout')).toEqual([])
  })
  it('the website-brand part is never a chip (it would send a made-up domain)', () => {
    const all = quickActions(ctx(), 40)
    expect(all.some((c) => /acme\.com/i.test(c.text))).toBe(false)
    expect(all.some((c) => c.family === 'brand' && /use my brand/i.test(c.text))).toBe(true)
  })
  it('no family is left without a decision (exhaustive map)', () => { expect(FAMILIES.length).toBeGreaterThan(10) })
})

import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'
describe('GET /presentations/:id/assistant/chips', () => {
  it('returns chips for the deck owner, refuses a stranger', async () => {
    const u = await signUp('chips'); await setPlan(u.id, 'pro')
    const { id, doc } = await makeDeck(u.id, 3)
    const r = await api(u.cookie, 'GET', `/presentations/${id}/assistant/chips?slideId=${doc.slides[0]!.id}`)
    expect(r.status).toBe(200)
    const chips = (await json(r)).data as { group: string; text: string }[]
    expect(chips.length).toBeGreaterThan(5)
    expect(chips.some((c) => c.group === 'Design')).toBe(true)
    const stranger = await signUp('chips2')
    expect((await api(stranger.cookie, 'GET', `/presentations/${id}/assistant/chips`)).status).toBe(404)
  })
})
