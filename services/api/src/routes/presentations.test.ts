import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import { db } from '../db/index.ts'
import { creditBalance, presentationVersion } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

const get = async (cookie: string, id: string) => (await json(await api(cookie, 'GET', `/presentations/${id}`))).data
const save = (cookie: string, id: string, baseRevision: number, document: unknown, extra: object = {}) => api(cookie, 'PUT', `/presentations/${id}`, { baseRevision, document, ...extra })
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const edited = (doc: any, title: string) => ({ ...doc, title })

describe('save: optimistic concurrency + versions', () => {
  it('a save needs the current revision; a stale one gets 409 instead of overwriting', async () => {
    const u = await signUp('sv'); const { id } = await makeDeck(u.id)
    const a = await get(u.cookie, id)
    expect(a.revision).toBe(1)
    const ok = await save(u.cookie, id, 1, edited(a.document, 'Tab A'))
    expect(ok.status).toBe(200)
    expect((await json(ok)).data.revision).toBe(2)
    const stale = await save(u.cookie, id, 1, edited(a.document, 'Tab B'))
    expect(stale.status).toBe(409)
    expect((await json(stale)).error).toMatchObject({ code: 'CONFLICT', details: { currentRevision: 2 } })
    expect((await get(u.cookie, id)).document.title).toBe('Tab A') // nothing was overwritten
  })

  it('autosaves update the newest snapshot in place; explicit snapshots add history; restore never rewrites history', async () => {
    const u = await signUp('sv'); const { id } = await makeDeck(u.id)
    let { revision, document } = await get(u.cookie, id)
    for (const t of ['v-a', 'v-b', 'v-c']) {
      revision = (await json(await save(u.cookie, id, revision, edited(document, t)))).data.revision
    }
    const versionsAfterAutosaves = (await json(await api(u.cookie, 'GET', `/presentations/${id}/versions`))).data
    // v1 = the deck as generated (immutable); the first user save cuts v2; the next autosaves update v2 in place
    expect(versionsAfterAutosaves.map((v: any) => v.version)).toEqual([2, 1])

    const snap = await json(await save(u.cookie, id, revision, edited(document, 'milestone'), { snapshot: true }))
    revision = snap.data.revision
    expect(snap.data.version).toBe(3)
    revision = (await json(await save(u.cookie, id, revision, edited(document, 'after milestone')))).data.revision // updates v3 in place

    const versions = (await json(await api(u.cookie, 'GET', `/presentations/${id}/versions`))).data
    expect(versions.map((v: any) => v.version)).toEqual([3, 2, 1])

    const restored = await json(await api(u.cookie, 'POST', `/presentations/${id}/versions/1/restore`, { baseRevision: revision }))
    expect(restored.data.version).toBe(4) // a NEW latest version
    expect(restored.data.document.title).toBe('Test deck')
    expect((await get(u.cookie, id)).document.title).toBe('Test deck')
    const all = await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, id))
    expect(all).toHaveLength(4) // history preserved
    expect((await api(u.cookie, 'POST', `/presentations/${id}/versions/1/restore`, { baseRevision: 1 })).status).toBe(409) // stale
    expect((await api(u.cookie, 'POST', `/presentations/${id}/versions/99/restore`, { baseRevision: restored.data.revision })).status).toBe(404)
  })

  it('rejects invalid documents, mismatched ids, other users, and oversize payloads', async () => {
    const u = await signUp('sv'); const other = await signUp('sv'); const { id } = await makeDeck(u.id)
    const { document } = await get(u.cookie, id)
    expect((await save(u.cookie, id, 1, { nope: true })).status).toBe(400)
    expect((await save(u.cookie, id, 1, { ...document, id: 'someone-elses' })).status).toBe(400)
    expect((await save(u.cookie, id, 1, { ...document, slides: [] })).status).toBe(400)
    expect((await save(other.cookie, id, 1, document)).status).toBe(404)
    expect((await api(other.cookie, 'GET', `/presentations/${id}/versions`)).status).toBe(404)
    expect((await api(other.cookie, 'POST', `/presentations/${id}/versions/1/restore`, { baseRevision: 1 })).status).toBe(404)
    expect((await save(u.cookie, id, 1, { ...document, slides: [{ ...document.slides[0], speakerNotes: 'y'.repeat(6000) }] })).status).toBe(400) // schema limit
    expect((await save(u.cookie, id, 1, { junk: 'a'.repeat(3.5e6) })).status).toBe(413) // body limit
  })

  it('plan limits hold on save: Starter cannot exceed 20 slides; premium themes need Pro', async () => {
    const free = await signUp('sv'); const big = await makeDeck(free.id, 21)
    const d = await get(free.cookie, big.id)
    const r = await save(free.cookie, big.id, 1, d.document)
    expect(r.status).toBe(403)
    expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')

    const small = await makeDeck(free.id, 3)
    const doc = (await get(free.cookie, small.id)).document
    const forest = await save(free.cookie, small.id, 1, { ...doc, theme: getTheme('forest') })
    expect(forest.status).toBe(403)
    expect((await save(free.cookie, small.id, 1, { ...doc, theme: getTheme('slate') })).status).toBe(200)

    const pro = await signUp('sv'); await setPlan(pro.id, 'pro')
    const p = await makeDeck(pro.id, 3)
    expect((await save(pro.cookie, p.id, 1, { ...(await get(pro.cookie, p.id)).document, theme: getTheme('midnight') })).status).toBe(200)
  })

  it('deleted decks disappear from the list and from reads', async () => {
    const u = await signUp('sv'); const { id } = await makeDeck(u.id)
    expect((await api(u.cookie, 'DELETE', `/presentations/${id}`)).status).toBe(200)
    expect((await api(u.cookie, 'GET', `/presentations/${id}`)).status).toBe(404)
    expect((await json(await api(u.cookie, 'GET', '/presentations'))).data.some((p: any) => p.id === id)).toBe(false)
  })
})

describe('AI edit', () => {
  const body = (slideId: string, extra: object = {}) => ({ slideId, command: 'shorten', requestId: `r-${rid()}-${rid()}`, ...extra })

  it('Starter can use AI edits on its credits (starter-tier model, 2 credits) — and is stopped, not charged, when out of credits', async () => {
    const u = await signUp('ai'); const { id, doc } = await makeDeck(u.id)
    const r = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[1]!.id)))
    expect(r.data.creditsCharged).toBe(2)
    expect(await balance(u.id)).toBe(98)
    await db.update(creditBalance).set({ balance: 1 }).where(eq(creditBalance.userId, u.id))
    const broke = await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[1]!.id))
    expect(broke.status).toBe(402)
    expect((await json(broke)).error.code).toBe('INSUFFICIENT_CREDITS')
    expect(await balance(u.id)).toBe(1)
  })

  it('Starter cannot pick a premium model for an edit (server tier gate, no spend)', async () => {
    const u = await signUp('ai'); const { id, doc } = await makeDeck(u.id)
    const models = (await json(await api(u.cookie, 'GET', '/models'))).data.models
    const premium = models.find((m: any) => m.tier === 'premium').id
    const r = await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[1]!.id, { model: premium }))
    expect(r.status).toBe(403)
    expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')
    expect(await balance(u.id)).toBe(100)
  })

  it('Pro: returns a validated same-layout patch, charges the tier price, and retries are charged once', async () => {
    const u = await signUp('ai'); await setPlan(u.id, 'pro'); const { id, doc } = await makeDeck(u.id)
    const slide = doc.slides[1]!
    const payload = body(slide.id)
    const r = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, payload))
    expect(r.data.content.layout).toBe(slide.layoutId)
    expect(r.data.content.title).toContain('✎')
    expect(r.data.creditsCharged).toBe(4)
    expect(await balance(u.id)).toBe(3000 - 4)
    await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, payload) // same requestId (client retry)
    expect(await balance(u.id)).toBe(3000 - 4)
  })

  it('respects locked slides and unknown slides; a failing model refunds the charge', async () => {
    const u = await signUp('ai'); await setPlan(u.id, 'pro'); const { id, doc } = await makeDeck(u.id)
    const locked = { ...doc, slides: doc.slides.map((s, i) => (i === 1 ? { ...s, locked: true } : s)) }
    expect((await save(u.cookie, id, 1, locked)).status).toBe(200)
    const l = await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[1]!.id))
    expect(l.status).toBe(409)
    expect((await json(l)).error.code).toBe('SLIDE_LOCKED')
    expect((await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body('nope'))).status).toBe(404)

    await json(await api(u.cookie, 'GET', '/me/entitlements')) // ensure allowance granted
    const before = await balance(u.id)
    const fail = await api(u.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[2]!.id, { command: 'custom', argument: 'FAIL_PLEASE' }))
    expect(fail.status).toBe(503)
    expect(await balance(u.id)).toBe(before) // refunded
  })

  it("cannot edit another user's presentation", async () => {
    const owner = await signUp('ai'); const other = await signUp('ai'); await setPlan(other.id, 'pro')
    const { id, doc } = await makeDeck(owner.id)
    expect((await api(other.cookie, 'POST', `/presentations/${id}/ai-edit`, body(doc.slides[1]!.id))).status).toBe(404)
  })
})

describe('assistant chat keeps the undo record with the message', () => {
  it('saves it (and which undo records were later put back) and returns it on reload', async () => {
    const u = await signUp('chat')
    const { id } = await makeDeck(u.id)
    const undo = JSON.stringify({ id: 'u1', theme: null, contents: { s1: { layout: 'title', title: 'Old', speakerNotes: '', sources: [] } }, added: [], summary: ['Rewrote slide 1'] })
    const save = await api(u.cookie, 'POST', `/presentations/${id}/chat`, { messages: [{ role: 'user', text: 'shorten slide 1' }, { role: 'ai', reply: 'Done', applied: ['Rewrote slide 1'], notes: [], credits: 2, undo }, { role: 'ai', reply: 'Put back', applied: ['Put back my earlier change'], notes: [], credits: 0, revertedUndo: ['u1'] }] })
    expect(save.status).toBe(200)
    const rows = (await json(await api(u.cookie, 'GET', `/presentations/${id}/chat`))).data
    expect(rows).toHaveLength(3)
    expect(JSON.parse(rows[1].undo).id).toBe('u1')
    expect(rows[2].revertedUndo).toEqual(['u1'])
    const tooBig = await api(u.cookie, 'POST', `/presentations/${id}/chat`, { messages: [{ role: 'ai', reply: 'x', undo: 'x'.repeat(100_001) }] })
    expect(tooBig.status).toBe(400)
  })
})
