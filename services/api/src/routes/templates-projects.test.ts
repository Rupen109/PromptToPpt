import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { DESIGNS, SKELETONS } from '@prompttoppt/theme'
import { presentationSchema } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { presentation } from '../db/schema.ts'
import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'

const free = DESIGNS.find((d) => !d.premium)!
const premium = DESIGNS.find((d) => d.premium)!

describe('POST /presentations (new deck from a template)', () => {
  it('creates a deck from a free template: the design theme + its category story, valid and openable', async () => {
    const u = await signUp('tp')
    const res = await api(u.cookie, 'POST', '/presentations', { templateId: free.id })
    expect(res.status).toBe(201)
    const { id } = (await json(res)).data
    const got = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data
    expect(presentationSchema.safeParse(got.document).success).toBe(true)
    expect(got.document.theme.templateId).toBe(free.id)
    expect(got.document.slides).toHaveLength(SKELETONS[free.category].length)
    expect(got.document.title).toBe(free.name)
    expect(got.revision).toBe(1)
    const list = (await json(await api(u.cookie, 'GET', '/presentations'))).data
    expect(list.map((d: any) => d.id)).toContain(id)
  })

  it('premium designs need Pro (server-enforced); Pro and Gold can use them', async () => {
    const u = await signUp('tp')
    const denied = await api(u.cookie, 'POST', '/presentations', { templateId: premium.id })
    expect(denied.status).toBe(403)
    expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
    await setPlan(u.id, 'pro')
    expect((await api(u.cookie, 'POST', '/presentations', { templateId: premium.id })).status).toBe(201)
  })

  it('unknown template → 404; blank deck works; aspect ratio is honoured', async () => {
    const u = await signUp('tp')
    expect((await api(u.cookie, 'POST', '/presentations', { templateId: 'nope' })).status).toBe(404)
    const blank = (await json(await api(u.cookie, 'POST', '/presentations', { aspectRatio: '4:3' }))).data
    const got = (await json(await api(u.cookie, 'GET', `/presentations/${blank.id}`))).data
    expect(got.document).toMatchObject({ aspectRatio: '4:3', title: 'Untitled presentation' })
    expect(got.document.slides).toHaveLength(1)
  })

  it('counts toward the monthly presentation allowance (Pro: 50)', async () => {
    const u = await signUp('tp')
    await setPlan(u.id, 'pro')
    for (let i = 0; i < 50; i++) await makeDeck(u.id, 2)
    const res = await api(u.cookie, 'POST', '/presentations', { templateId: free.id })
    expect(res.status).toBe(429)
    expect((await json(res)).error.code).toBe('LIMIT_REACHED')
  })

  it('saving a deck cannot smuggle in a premium template on Starter, but keeping an existing one is fine', async () => {
    const pro = await signUp('tp')
    await setPlan(pro.id, 'pro')
    const { id } = (await json(await api(pro.cookie, 'POST', '/presentations', { templateId: premium.id }))).data
    await setPlan(pro.id, 'starter') // downgrade: the deck stays editable
    const got = (await json(await api(pro.cookie, 'GET', `/presentations/${id}`))).data
    const keep = await api(pro.cookie, 'PUT', `/presentations/${id}`, { baseRevision: got.revision, document: { ...got.document, title: 'renamed' } })
    expect(keep.status).toBe(200)

    const u = await signUp('tp')
    const mine = (await json(await api(u.cookie, 'POST', '/presentations', { templateId: free.id }))).data
    const g = (await json(await api(u.cookie, 'GET', `/presentations/${mine.id}`))).data
    const swapped = await api(u.cookie, 'PUT', `/presentations/${mine.id}`, { baseRevision: g.revision, document: { ...g.document, theme: { ...premium.theme } } })
    expect(swapped.status).toBe(403)
  })
})

describe('projects', () => {
  it('Starter cannot create projects (server-enforced); Pro can, list shows deck counts', async () => {
    const s = await signUp('pj')
    const denied = await api(s.cookie, 'POST', '/projects', { name: 'Q4' })
    expect(denied.status).toBe(403)
    expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')

    const u = await signUp('pj')
    await setPlan(u.id, 'pro')
    const p = (await json(await api(u.cookie, 'POST', '/projects', { name: '  Client work  ' }))).data
    expect(p).toMatchObject({ name: 'Client work', decks: 0 })
    const deck = await makeDeck(u.id)
    expect((await api(u.cookie, 'PUT', `/presentations/${deck.id}/project`, { projectId: p.id })).status).toBe(200)
    const list = (await json(await api(u.cookie, 'GET', '/projects'))).data
    expect(list).toEqual([expect.objectContaining({ id: p.id, decks: 1 })])
    const inProject = (await json(await api(u.cookie, 'GET', `/presentations?projectId=${p.id}`))).data
    expect(inProject.map((d: any) => d.id)).toEqual([deck.id])
    expect((await json(await api(u.cookie, 'GET', '/presentations'))).data.find((d: any) => d.id === deck.id).projectId).toBe(p.id)
  })

  it('rename, validation, and deleting a project keeps its decks (unassigned); downgrade keeps access to existing projects', async () => {
    const u = await signUp('pj')
    await setPlan(u.id, 'pro')
    const p = (await json(await api(u.cookie, 'POST', '/projects', { name: 'Temp' }))).data
    expect((await api(u.cookie, 'POST', '/projects', { name: '   ' })).status).toBe(400)
    expect((await api(u.cookie, 'PATCH', `/projects/${p.id}`, { name: 'Renamed' })).status).toBe(200)
    const deck = await makeDeck(u.id)
    await api(u.cookie, 'PUT', `/presentations/${deck.id}/project`, { projectId: p.id })
    await setPlan(u.id, 'starter')
    expect((await json(await api(u.cookie, 'GET', '/projects'))).data).toHaveLength(1) // still visible
    expect((await api(u.cookie, 'DELETE', `/projects/${p.id}`)).status).toBe(200)
    expect((await json(await api(u.cookie, 'GET', '/projects'))).data).toEqual([])
    const [row] = await db.select().from(presentation).where(eq(presentation.id, deck.id))
    expect(row).toMatchObject({ projectId: null, deletedAt: null })
  })

  it("isolation: you can't see, rename, delete or move decks into someone else's project", async () => {
    const owner = await signUp('pj'); await setPlan(owner.id, 'pro')
    const other = await signUp('pj'); await setPlan(other.id, 'pro')
    const p = (await json(await api(owner.cookie, 'POST', '/projects', { name: 'Private' }))).data
    expect((await json(await api(other.cookie, 'GET', '/projects'))).data).toEqual([])
    expect((await api(other.cookie, 'PATCH', `/projects/${p.id}`, { name: 'x' })).status).toBe(404)
    expect((await api(other.cookie, 'DELETE', `/projects/${p.id}`)).status).toBe(404)
    const deck = await makeDeck(other.id)
    expect((await api(other.cookie, 'PUT', `/presentations/${deck.id}/project`, { projectId: p.id })).status).toBe(404)
    expect((await api(other.cookie, 'POST', '/presentations', { templateId: free.id, projectId: p.id })).status).toBe(404)
    const created = await api(owner.cookie, 'POST', '/presentations', { templateId: free.id, projectId: p.id })
    expect(created.status).toBe(201)
    const [row] = await db.select().from(presentation).where(and(eq(presentation.userId, owner.id), eq(presentation.projectId, p.id)))
    expect(row).toBeTruthy()
  })
})
