import { describe, expect, it } from 'vitest'
import { DESIGNS, designById, isDark } from '@prompttoppt/theme'
import { api, json, setPlan, signUp } from '../test-utils.ts'
import { runGeneration } from '../generation/pipeline.ts'
import { MAX_BRAND_THEMES } from './themes.ts'

/** themes made from a brand kit (brand/themes.ts + packages/theme brand-theme.ts): saved inputs, the theme worked out from the kit as it is now */
const gold = async () => { const u = await signUp('bt'); await setPlan(u.id, 'gold'); return u }
const kit = async (cookie: string, body: object = {}) => (await json(await api(cookie, 'POST', '/brand/kits', { name: 'Acme', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Inter', ...body }))).data
const free = DESIGNS.find((d) => !d.premium && d.look.mode === 'light')!
const premium = DESIGNS.find((d) => d.premium)!
const make = (cookie: string, body: object) => api(cookie, 'POST', '/brand/themes', { designId: free.id, mode: 'light', ...body })

describe('brand themes', () => {
  it('Gold makes one: the design\'s style and motion with the kit\'s colours and fonts, in the mode chosen; it is listed with its theme', async () => {
    const u = await gold(); const k = await kit(u.cookie)
    const r = await make(u.cookie, { kitId: k.id, mode: 'dark', name: 'Acme night' })
    expect(r.status).toBe(201)
    const t = (await json(r)).data
    expect(t).toMatchObject({ name: 'Acme night', kitId: k.id, kitName: 'Acme', designId: free.id, designName: free.name, mode: 'dark' })
    expect(isDark(t.theme.colors.background)).toBe(true) // (the design itself is light)
    expect(t.theme.fonts).toEqual({ heading: 'Playfair Display', body: 'Inter' })
    expect(t.theme.style).toEqual(free.theme.style)
    expect(t.theme.motion).toEqual(free.theme.motion)
    expect(t.theme.templateId).toBe(free.id)
    const list = (await json(await api(u.cookie, 'GET', '/brand/themes'))).data
    expect(list.limit).toBe(MAX_BRAND_THEMES); expect(list.themes.map((x: { id: string }) => x.id)).toEqual([t.id])
  })

  it('the name defaults to the kit\'s; light keeps the design\'s own ground', async () => {
    const u = await gold(); const k = await kit(u.cookie, { name: 'Zed' })
    const t = (await json(await make(u.cookie, { kitId: k.id }))).data
    expect(t.name).toBe('Zed light')
    expect(isDark(t.theme.colors.background)).toBe(false)
  })

  it('editing the kit changes its themes; deleting the kit deletes them', async () => {
    const u = await gold(); const k = await kit(u.cookie)
    await make(u.cookie, { kitId: k.id })
    await api(u.cookie, 'PATCH', `/brand/kits/${k.id}`, { headingFont: 'Inter', bodyFont: 'Inter' })
    expect((await json(await api(u.cookie, 'GET', '/brand/themes'))).data.themes[0].theme.fonts).toEqual({ heading: 'Inter', body: 'Inter' })
    await api(u.cookie, 'DELETE', `/brand/kits/${k.id}`)
    expect((await json(await api(u.cookie, 'GET', '/brand/themes'))).data.themes).toEqual([])
  })

  it('Starter and Pro cannot make or see one; someone else\'s kit, an unknown design and a Pro design on a plan without them are refused; delete is your own only', async () => {
    const u = await gold(); const k = await kit(u.cookie)
    for (const plan of ['starter', 'pro'] as const) {
      const p = await signUp('bt'); if (plan !== 'starter') await setPlan(p.id, plan)
      const r = await make(p.cookie, { kitId: k.id })
      expect(r.status).toBe(403); expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')
      expect((await json(await api(p.cookie, 'GET', '/brand/themes'))).data).toEqual({ themes: [], limit: 0 })
    }
    const other = await gold()
    expect((await make(other.cookie, { kitId: k.id })).status).toBe(404)
    expect((await make(u.cookie, { kitId: k.id, designId: 'nope' })).status).toBe(422)
    expect((await make(u.cookie, { kitId: k.id, mode: 'grey' })).status).toBe(400)
    if (premium) expect((await make(u.cookie, { kitId: k.id, designId: premium.id })).status).toBe(201) // (Gold has premium templates)
    const t = (await json(await make(u.cookie, { kitId: k.id }))).data
    expect((await api(other.cookie, 'DELETE', `/brand/themes/${t.id}`)).status).toBe(404)
    expect((await api(u.cookie, 'DELETE', `/brand/themes/${t.id}`)).status).toBe(200)
  })

  it(`keeps at most ${MAX_BRAND_THEMES}`, async () => {
    const u = await gold(); const k = await kit(u.cookie)
    for (let i = 0; i < MAX_BRAND_THEMES; i++) expect((await make(u.cookie, { kitId: k.id, name: `T${i}` })).status).toBe(201)
    const over = await make(u.cookie, { kitId: k.id })
    expect(over.status).toBe(429); expect((await json(over)).error.code).toBe('LIMIT_REACHED')
  })

  it('a NEW deck built in a brand theme has exactly that theme (not the topic\'s colours); it cannot be combined with a template or kit', async () => {
    const u = await gold(); const k = await kit(u.cookie)
    const t = (await json(await make(u.cookie, { kitId: k.id, mode: 'dark' }))).data
    const key = () => `key-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
    const job = { prompt: 'Create an 8 slide overview of our onboarding process for new customers', slideCount: 8, idempotencyKey: key(), brandThemeId: t.id }
    expect((await api(u.cookie, 'POST', '/generation/jobs', { ...job, idempotencyKey: key(), designId: free.id })).status).toBe(400)
    expect((await api(u.cookie, 'POST', '/generation/jobs', { ...job, idempotencyKey: key(), brandThemeId: 'nope' })).status).toBe(400)
    const r = await api(u.cookie, 'POST', '/generation/jobs', job)
    expect(r.status).toBe(201)
    const id = (await json(r)).data.id
    await runGeneration(id) // (the mock model in tests)
    const view = (await json(await api(u.cookie, 'GET', `/generation/jobs/${id}`))).data
    const deck = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data.document
    expect(deck.theme.colors).toEqual(t.theme.colors)
    expect(deck.theme.fonts).toEqual(t.theme.fonts)
    expect(deck.theme.templateId).toBe(designById(t.designId)!.id)
  })
})
