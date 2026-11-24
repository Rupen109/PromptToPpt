import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { composeSlide, evaluate, type Expectation } from '@prompttoppt/theme'
import type { SlideContent } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { assetUrl, storeAsset } from '../brand/assets.ts'
import { aiAssistRequest, brandKit, creditBalance, presentationVersion } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

/** The honesty floor through the REAL route: the answer carries what it promises and a request record; the money follows the SAVED deck. */
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const ask = async (cookie: string, deckId: string, instruction: string, extra: object = {}) => {
  const res = await api(cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction, requestId: `req-${rid()}-${rid()}`, ...extra })
  return { status: res.status, body: await json(res), requestId: (await Promise.resolve(extra as { requestId?: string })).requestId }
}
async function setup(tag: string, plan: 'pro' | 'gold' = 'pro') {
  const u = await signUp(tag); await setPlan(u.id, plan)
  const { id, doc } = await makeDeck(u.id, 4)
  await api(u.cookie, 'GET', '/me/entitlements')
  return { u, id, doc, start: await balance(u.id) }
}
const row = async (requestId: string) => (await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, requestId)))[0]

describe('an answer that changes the deck', () => {
  it('carries what it promises (expect) and its request id, and the server records the request with its reservation', async () => {
    const { u, id, doc, start } = await setup('hon1')
    const requestId = `req-${rid()}-${rid()}`
    const res = await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'shorten slide 2', requestId, activeSlideId: doc.slides[0]!.id })
    const body = await json(res)
    expect(body.data.requestId).toBe(requestId)
    expect(body.data.expect).toHaveLength(1)
    expect(body.data.expect[0]).toMatchObject({ kind: 'edit', slideId: doc.slides[1]!.id, change: 'text' })
    const r = await row(requestId)
    expect(r).toMatchObject({ status: 'reserved', userId: u.id, presentationId: id, baseVersion: 1 })
    expect(r!.reservations).toEqual([{ ref: requestId, units: 2, kind: 'base' }])
    expect(await balance(u.id)).toBe(start - 2)
  })

  it('never saved (the browser did not apply it, or it did not land): the outcome report refunds it, and a repeat changes nothing', async () => {
    const { u, id, doc, start } = await setup('hon2')
    const requestId = `req-${rid()}-${rid()}`
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'shorten slide 2', requestId, activeSlideId: doc.slides[0]!.id })
    expect(await balance(u.id)).toBe(start - 2)
    const out = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist/${requestId}/outcome`, { results: [{ key: 'edit:0', status: 'done' }] })) // the browser claims it worked
    expect(out.data).toMatchObject({ settled: true, verified: 0, judged: 1, refunded: true })
    expect(await balance(u.id)).toBe(start)
    expect((await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist/${requestId}/outcome`, {}))).data.already).toBe(true)
    expect(await balance(u.id)).toBe(start)
  })

  it('saved in the deck: the same report keeps the charge, and what the browser claims does not matter', async () => {
    const { u, id, doc, start } = await setup('hon3')
    const requestId = `req-${rid()}-${rid()}`
    const body = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'shorten slide 2', requestId, activeSlideId: doc.slides[0]!.id }))
    const e = body.data.edits[0] as { slideId: string; content: SlideContent }
    const saved = structuredClone(doc); const s = saved.slides.find((x) => x.id === e.slideId)!; const f = composeSlide(e.content, saved.theme, '16:9'); s.content = f.content; s.layoutId = f.layoutId
    await db.update(presentationVersion).set({ document: saved }).where(eq(presentationVersion.presentationId, id))
    // the promise, checked on the saved deck with the same function the editor uses
    expect(evaluate(body.data.expect[0] as Expectation, saved).status).toBe('done')
    const out = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist/${requestId}/outcome`, { results: [{ key: 'edit:0', status: 'failed' }] })) // the browser says it failed
    expect(out.data).toMatchObject({ verified: 1, judged: 1, refunded: false })
    expect(await balance(u.id)).toBe(start - 2)
    expect((await row(requestId))!.mismatches).toBe(1) // counted
  })

  it('a locked slide is never planned: nothing to promise, nothing recorded, nothing charged', async () => {
    const { u, id, doc, start } = await setup('hon4')
    const locked = structuredClone(doc); locked.slides[1]!.locked = true
    await db.update(presentationVersion).set({ document: locked }).where(eq(presentationVersion.presentationId, id))
    const requestId = `req-${rid()}-${rid()}`
    const body = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'shorten slide 2', requestId, activeSlideId: doc.slides[0]!.id }))
    expect(body.data.applied).toEqual([]); expect(body.data.expect).toBeUndefined()
    expect(await row(requestId)).toBeUndefined()
    expect(await balance(u.id)).toBe(start)
  })
})

describe('capability discovery is generated, not written by the model', () => {
  const say = async (tag: string, text: string, plan: 'pro' | 'gold' = 'pro', extra: object = {}) => {
    const { u, id, doc, start } = await setup(tag, plan)
    const { body } = await ask(u.cookie, id, text, { activeSlideId: doc.slides[1]!.id, ...extra })
    return { reply: body.data.reply as string, charged: body.data.creditsCharged as number, u, start }
  }
  it('"what can you do?" lists what is ready, says what is not available right now and what it cannot do yet, and is free', async () => {
    const { reply, charged, u, start } = await say('hon5', 'what can you do?')
    expect(reply).toMatch(/Here is what I can do/); expect(reply).toMatch(/add a slide/); expect(reply).toMatch(/Not available yet/); expect(reply).toMatch(/Not supported in SlidesDone/); expect(reply).toMatch(/a shadow on a shape or on text/); expect(reply).toMatch(/change objects on a slide/)
    expect(charged).toBe(0); expect(await balance(u.id)).toBe(start)
  })
  it('background removal is development-only: in production it is listed as not available, never as a feature', async () => {
    // (the test environment is not production, so the flag decides; the production gate itself is tested in routes/cutout.test.ts)
    const { reply } = await say('hon6', 'what can you do?')
    expect(/remove the background of a picture/i.test(reply)).toBe(true) // available in development
    const { activeBackgroundProvider } = await import('../media/bg-providers.ts')
    expect(activeBackgroundProvider('production', 'server-dev')).toBeNull()
  })
  it('"what can you edit on this slide?" and "what is on my plan?" are answered from the slide and the plan', async () => {
    expect((await say('hon7', 'what can you edit on this slide?')).reply).toMatch(/On slide 2 I can/)
    const plan = (await say('hon8', 'what is available on my plan?')).reply
    expect(plan).toMatch(/On your .* plan I can/)
  })
})


describe('P1 through the real route: objects, the saved brand, the person\'s own pictures', () => {
  const titleOf = (doc: { slides: { elements: { id: string; type: string; role?: string }[] }[] }) => doc.slides[0]!.elements.find((e) => e.type === 'text' && e.role === 'title')!.id
  const send = async (u: { cookie: string }, id: string, instruction: string, extra: object = {}) => {
    const requestId = `req-${rid()}-${rid()}`
    const res = await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction, requestId, ...extra })
    return { body: await json(res), requestId }
  }

  it('"make this bigger" with the title selected: planned in absolute values, promised as an element change, settled by the saved deck', async () => {
    const { u, id, doc, start } = await setup('p1a')
    const sel = titleOf(doc as never)
    const { body, requestId } = await send(u, id, 'make this bigger', { activeSlideId: doc.slides[0]!.id, selection: { slideIds: [doc.slides[0]!.id], elementIds: [sel] } })
    expect(body.data.elementChanges).toHaveLength(1)
    expect(body.data.elementChanges[0]).toMatchObject({ slideId: doc.slides[0]!.id, elementId: sel, verb: 'Made the text of {} bigger' }) // (a title made bigger: its TEXT, in its own place)
    expect(body.data.expect[0]).toMatchObject({ kind: 'element', already: false })
    expect(await balance(u.id)).toBe(start - 2)
    // the browser applies and saves it
    const c = body.data.elementChanges[0]
    const saved = structuredClone(doc); Object.assign(saved.slides[0]!.elements.find((e) => e.id === sel)!, c.patch)
    await db.update(presentationVersion).set({ document: saved }).where(eq(presentationVersion.presentationId, id))
    expect(evaluate(body.data.expect[0] as Expectation, saved).status).toBe('done')
    const out = await json(await api(u.cookie, 'POST', `/presentations/${id}/ai-assist/${requestId}/outcome`, {}))
    expect(out.data).toMatchObject({ verified: 1, judged: 1, refunded: false })
    expect(await balance(u.id)).toBe(start - 2)
  })

  it('nothing selected and nothing named: ONE question, nothing charged, nothing recorded', async () => {
    const { u, id, doc, start } = await setup('p1b')
    const { body, requestId } = await send(u, id, 'make this bigger', { activeSlideId: doc.slides[0]!.id })
    expect(body.data).toMatchObject({ ask: true, creditsCharged: 0 })
    expect(body.data.reply).toMatch(/Which object do you mean/)
    expect(await row(requestId)).toBeUndefined()
    expect(await balance(u.id)).toBe(start)
  })

  it('a selected object on a LOCKED slide: refused with the reason, nothing recorded, nothing charged', async () => {
    const { u, id, doc, start } = await setup('p1c')
    const sel = titleOf(doc as never)
    const locked = structuredClone(doc); locked.slides[0]!.locked = true
    await db.update(presentationVersion).set({ document: locked }).where(eq(presentationVersion.presentationId, id))
    const { body, requestId } = await send(u, id, 'make this bigger', { activeSlideId: doc.slides[0]!.id, selection: { slideIds: [doc.slides[0]!.id], elementIds: [sel] } })
    expect(body.data.applied).toEqual([]); expect(body.data.elementChanges ?? []).toEqual([])
    expect(await row(requestId)).toBeUndefined()
    expect(await balance(u.id)).toBe(start)
  })

  it('"use my brand" applies the SAVED kit (colours and fonts) as a theme change that is verified; with no kit it says so', async () => {
    const { u, id, doc, start } = await setup('p1d', 'gold')
    const none = await send(u, id, 'use my brand', { activeSlideId: doc.slides[0]!.id })
    expect(none.body.data.notes.join(' ')).toMatch(/no saved brand/i); expect(none.body.data.theme).toBeNull()
    expect(await balance(u.id)).toBe(start)
    await db.insert(brandKit).values({ id: `bk-${rid()}`, userId: u.id, name: 'Acme', primaryColor: '#0A7D5A', accentColor: '#F59E0B', headingFont: 'Poppins', bodyFont: 'Inter', isDefault: true })
    const { body } = await send(u, id, 'use my brand', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.theme.fonts).toEqual({ heading: 'Poppins', body: 'Inter' })
    expect(body.data.expect[0]).toMatchObject({ kind: 'theme' }); expect(body.data.expect[0].parts).toEqual(expect.arrayContaining(['colours', 'fonts']))
  })

  it('on Pro (no brand kits) "use my brand" changes nothing, says it is a Gold feature, offers the upgrade and keeps no credits, even with a kit stored from an earlier plan', async () => {
    const { u, id, doc, start } = await setup('p1dpro', 'pro')
    await db.insert(brandKit).values({ id: `bk-${rid()}`, userId: u.id, name: 'Acme', primaryColor: '#0A7D5A', accentColor: '#F59E0B', headingFont: 'Poppins', bodyFont: 'Inter', isDefault: true })
    const { body } = await send(u, id, 'use my brand', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.theme).toBeNull(); expect(body.data.applied).toEqual([])
    expect(body.data.notes.join(' ')).toMatch(/brand kits/i)
    expect(body.data.upgrade).toBeTruthy()
    expect(await balance(u.id)).toBe(start)
  })

  it('"use my coffee photo": the person\'s own stored upload replaces the selected picture, promised as a REPLACEMENT (never worded as a cut-out)', async () => {
    const { u, id, doc } = await setup('p1e')
    const withPic = structuredClone(doc)
    withPic.slides[0]!.elements.push({ id: 'pic', type: 'image', src: 'https://x.test/old.png', alt: 'old', x: 100, y: 100, width: 300, height: 200, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' } as never)
    await db.update(presentationVersion).set({ document: withPic }).where(eq(presentationVersion.presentationId, id))
    const sharp = (await import('sharp')).default
    const upload = await storeAsset(u.id, 'brand', await sharp({ create: { width: 20, height: 20, channels: 3, background: '#553311' } }).png().toBuffer(), 'image/png', 'coffee beans')
    const { body } = await send(u, id, 'use my coffee photo here', { activeSlideId: doc.slides[0]!.id, selection: { slideIds: [doc.slides[0]!.id], elementIds: ['pic'] } })
    expect(body.data.pictureSwaps).toEqual([expect.objectContaining({ slideId: doc.slides[0]!.id, elementId: 'pic', url: assetUrl(upload), replaced: true })])
    expect(body.data.expect[0]).toMatchObject({ kind: 'picture_swap', replaced: true, from: 'https://x.test/old.png', to: assetUrl(upload) })
    expect(body.data.expect[0].transparentShare).toBeUndefined() // not a cut-out: no transparency is claimed
  })
})
