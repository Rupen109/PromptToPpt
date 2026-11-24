import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { expectationsFromChanges, type Expectation } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { assetUrl, storeAsset } from '../brand/assets.ts'
import { reserveCredits } from '../billing/credits.ts'
import { db } from '../db/index.ts'
import { aiAssistRequest, creditBalance, presentationVersion } from '../db/schema.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'
import { reclaimRefunded, settleAssistRequest, settleStaleRequests, settlementPlan, type Reservation } from './settle.ts'

const R = (kind: Reservation['kind'], ref: string = kind, forKey?: string): Reservation => ({ ref, units: 1, kind, ...(forKey ? { forKey } : {}) })
const E = (kind: string, key = kind): Pick<Expectation, 'key' | 'kind'> => ({ key, kind } as never)
const S = (key: string, status: 'done' | 'failed' | 'unchanged' | 'skipped' | 'info') => ({ key, status })

describe('settlementPlan: the money policy, row by row', () => {
  it('every kind of change the deck can get is judged for money (element changes included), and only information is not', () => {
    for (const kind of ['theme', 'edit', 'addition', 'background', 'gradient', 'clear_pictures', 'picture_swap', 'readability', 'photo', 'duplicate', 'move', 'lock', 'removal', 'element']) {
      expect(settlementPlan([R('base')], [E(kind, 'k')], [S('k', 'failed')]).refund, `${kind} must be judged`).toEqual(['base'])
    }
    for (const kind of ['revert', 'proposal', 'rewrite']) expect(settlementPlan([R('base')], [E(kind, 'k')], [S('k', 'info')]), `${kind}`).toMatchObject({ judged: 0, refund: [] })
  })
  const all = [R('base'), R('more'), R('enrich')]
  it('nothing verified: every reservation is refunded', () => {
    expect(settlementPlan(all, [E('edit', 'e0'), E('theme')], [S('e0', 'failed'), S('theme', 'skipped')])).toMatchObject({ refund: ['base', 'more', 'enrich'], keep: [], verified: 0, judged: 2 })
  })
  it('only "already so" results: nothing needed changing, nothing is charged', () => {
    expect(settlementPlan([R('base')], [E('lock')], [S('lock', 'unchanged')]).refund).toEqual(['base'])
  })
  it('one written slide verified: the base unit and the enrich unit stay, the second unit (more than one slide written) is refunded', () => {
    const p = settlementPlan(all, [E('edit', 'e0'), E('edit', 'e1')], [S('e0', 'done'), S('e1', 'failed')])
    expect(p.keep).toEqual(['base', 'enrich']); expect(p.refund).toEqual(['more'])
  })
  it('two written slides verified: the second unit stays too', () => {
    const p = settlementPlan([R('base'), R('more')], [E('edit', 'e0'), E('addition', 'a0')], [S('e0', 'done'), S('a0', 'done')])
    expect(p.keep).toEqual(['base', 'more']); expect(p.refund).toEqual([])
  })
  it('a change that is not written (a background): base stays, second and enrich units are refunded', () => {
    const p = settlementPlan(all, [E('background')], [S('background', 'done')])
    expect(p.keep).toEqual(['base']); expect(p.refund).toEqual(['more', 'enrich'])
  })
  it('partial: no pro-rating of the base unit (1 of 3 verified keeps it)', () => {
    expect(settlementPlan([R('base')], [E('edit', 'a'), E('edit', 'b'), E('edit', 'c')], [S('a', 'done'), S('b', 'failed'), S('c', 'failed')])).toMatchObject({ keep: ['base'], refund: [], verified: 1, judged: 3 })
  })
  it('an external cost is charged only for its own verified operation', () => {
    const exps = [E('picture_swap', 'p0'), E('picture_swap', 'p1')]
    const p = settlementPlan([R('base'), R('external', 'ext0', 'p0'), R('external', 'ext1', 'p1')], exps, [S('p0', 'done'), S('p1', 'failed')])
    expect(p.keep).toEqual(['base', 'ext0']); expect(p.refund).toEqual(['ext1'])
  })
  it('proposals, rebuilds and put-backs alone are not judged here (they are charged or refunded where they happen)', () => {
    const p = settlementPlan(all, [E('proposal'), E('rewrite'), E('revert')], [S('proposal', 'info'), S('rewrite', 'info'), S('revert', 'done')])
    expect(p).toMatchObject({ refund: [], judged: 0 })
  })
})

// ── against the real database ───────────────────────────────────────────────────────────────────
const balanceOf = async (userId: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, userId)))[0]!.balance
const newTitle = (doc: Presentation, i: number, title: string) => ({ slideId: doc.slides[i]!.id, content: { ...(doc.slides[i]!.content as SlideContent), title } as SlideContent })

async function setup(opts: { reservations?: ('base' | 'more')[]; edits?: number } = {}) {
  const u = await signUp('settle')
  const { id, doc } = await makeDeck(u.id, 4)
  await db.insert(creditBalance).values({ userId: u.id, balance: 100, periodKey: 'test' }).onConflictDoUpdate({ target: creditBalance.userId, set: { balance: 100, periodKey: 'test' } })
  const requestId = `req-${Math.random().toString(36).slice(2, 10)}`
  const reservations: { ref: string; units: number; kind: 'base' | 'more' }[] = []
  for (const k of opts.reservations ?? ['base']) {
    const ref = k === 'base' ? requestId : `${requestId}:more`
    await reserveCredits(u.id, k === 'base' ? 2 : 1, 'ai_assist', ref)
    reservations.push({ ref, units: k === 'base' ? 2 : 1, kind: k })
  }
  const changes = { theme: null, edits: Array.from({ length: opts.edits ?? 1 }, (_, i) => newTitle(doc, i + 1, `Edited ${i + 1}`)) }
  const expect_ = expectationsFromChanges(doc, changes)
  await db.insert(aiAssistRequest).values({ id: requestId, userId: u.id, presentationId: id, expectations: expect_, reservations, baseVersion: 1 })
  return { u, id, doc, requestId, changes, expect: expect_ }
}
/** what the editor does after applying: the saved deck now holds the new text */
async function saveEdits(id: string, doc: Presentation, changes: { slideId: string; content: SlideContent }[]) {
  const { composeSlide } = await import('@prompttoppt/theme')
  const next = structuredClone(doc)
  for (const c of changes) { const s = next.slides.find((x) => x.id === c.slideId)!; const f = composeSlide(c.content, next.theme, '16:9'); s.content = f.content; s.layoutId = f.layoutId }
  await db.update(presentationVersion).set({ document: next }).where(eq(presentationVersion.presentationId, id))
  return next
}

describe('settleAssistRequest: the SERVER decides from the saved deck', () => {
  it('the change was never saved: everything is refunded, and settling again changes nothing (idempotent)', async () => {
    const s = await setup()
    expect(await balanceOf(s.u.id)).toBe(98)
    const r = await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(r).toMatchObject({ already: false, plan: { verified: 0, judged: 1 } })
    expect(await balanceOf(s.u.id)).toBe(100)
    const again = await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(again).toMatchObject({ already: true })
    expect(await balanceOf(s.u.id)).toBe(100) // not refunded twice
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, s.requestId)))[0]).toMatchObject({ status: 'settled', trigger: 'client' })
  })

  it('the change is in the saved deck: the charge stays', async () => {
    const s = await setup()
    await saveEdits(s.id, s.doc, s.changes.edits)
    const r = await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(r!.plan).toMatchObject({ verified: 1, judged: 1, refund: [] })
    expect(await balanceOf(s.u.id)).toBe(98)
  })

  it('a lying browser: "everything failed" about a change that IS saved keeps the charge; "everything done" about one that is NOT saved still refunds; the disagreement is counted', async () => {
    const saved = await setup(); await saveEdits(saved.id, saved.doc, saved.changes.edits)
    await settleAssistRequest(saved.requestId, { trigger: 'client', report: { results: saved.expect.map((e) => ({ key: e.key, status: 'failed' })) } })
    expect(await balanceOf(saved.u.id)).toBe(98) // still charged: the browser's word was ignored
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, saved.requestId)))[0]!.mismatches).toBe(1)
    const notSaved = await setup()
    await settleAssistRequest(notSaved.requestId, { trigger: 'client', report: { results: notSaved.expect.map((e) => ({ key: e.key, status: 'done' })) } })
    expect(await balanceOf(notSaved.u.id)).toBe(100) // refunded even though the browser said done
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, notSaved.requestId)))[0]!.mismatches).toBe(1)
  })

  it('partial: one of two slides saved keeps the base unit and refunds the second unit', async () => {
    const s = await setup({ reservations: ['base', 'more'], edits: 2 })
    expect(await balanceOf(s.u.id)).toBe(97)
    await saveEdits(s.id, s.doc, [s.changes.edits[0]!])
    const r = await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(r!.plan).toMatchObject({ verified: 1, judged: 2 })
    expect(r!.refunded).toEqual([`${s.requestId}:more`])
    expect(await balanceOf(s.u.id)).toBe(98)
  })

  it('two settlements at the same time refund exactly once', async () => {
    const s = await setup()
    await Promise.all([settleAssistRequest(s.requestId, { trigger: 'client' }), settleAssistRequest(s.requestId, { trigger: 'sweeper' }), settleAssistRequest(s.requestId, { trigger: 'client' })])
    expect(await balanceOf(s.u.id)).toBe(100)
  })

  it('the sweeper settles requests whose browser never reported, and leaves fresh ones alone', async () => {
    const old = await setup(), fresh = await setup()
    await db.update(aiAssistRequest).set({ createdAt: new Date(Date.now() - 11 * 60_000) }).where(eq(aiAssistRequest.id, old.requestId))
    await settleStaleRequests(10 * 60_000, 500)
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, old.requestId)))[0]).toMatchObject({ status: 'settled', trigger: 'sweeper' })
    expect(await balanceOf(old.u.id)).toBe(100)
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, fresh.requestId)))[0]!.status).toBe('reserved')
    expect(await balanceOf(fresh.u.id)).toBe(98)
  })

  it('a cut-out is only paid for if the STORED file really is see-through: an opaque picture in the deck is refused and refunded', async () => {
    const u = await signUp('cut')
    const { id, doc } = await makeDeck(u.id, 3)
    await db.insert(creditBalance).values({ userId: u.id, balance: 100, periodKey: 'test' }).onConflictDoUpdate({ target: creditBalance.userId, set: { balance: 100, periodKey: 'test' } })
    const opaque = await storeAsset(u.id, 'brand', await sharp({ create: { width: 40, height: 30, channels: 3, background: '#cc2222' } }).png().toBuffer(), 'image/png', 'opaque')
    const clear = await storeAsset(u.id, 'brand', await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0 } } }).composite([{ input: { create: { width: 20, height: 20, channels: 4, background: '#cc2222' } }, left: 10, top: 5 }]).png().toBuffer(), 'image/png', 'clear')
    const pic = { id: 'pic', type: 'image', src: 'https://x.test/old.png', alt: '', x: 0, y: 0, width: 100, height: 80, rotation: 0, locked: false, zIndex: 5, opacity: 1, fit: 'contain', clip: 'none' }
    doc.slides[0]!.elements.push(pic as never)
    await db.update(presentationVersion).set({ document: doc }).where(eq(presentationVersion.presentationId, id))
    for (const [name, asset, expected] of [['opaque', opaque, 0], ['clear', clear, 1]] as const) {
      const requestId = `cut-${name}-${Math.random().toString(36).slice(2, 8)}`
      await reserveCredits(u.id, 1, 'ai_assist', requestId)
      const exp = expectationsFromChanges(doc, { theme: null, edits: [], pictureSwaps: [{ slideId: doc.slides[0]!.id, elementId: 'pic', url: assetUrl(asset), alt: 'x' }] })
      await db.insert(aiAssistRequest).values({ id: requestId, userId: u.id, presentationId: id, expectations: exp, reservations: [{ ref: requestId, units: 1, kind: 'base' }], baseVersion: 1 })
      // the saved deck holds the new picture in both cases: the stored file decides
      const saved = structuredClone(doc); (saved.slides[0]!.elements.find((e) => e.id === 'pic') as { src: string }).src = assetUrl(asset)
      await db.update(presentationVersion).set({ document: saved }).where(eq(presentationVersion.presentationId, id))
      const before = await balanceOf(u.id)
      const r = await settleAssistRequest(requestId, { trigger: 'client' })
      expect(r!.plan.verified, name).toBe(expected)
      expect(await balanceOf(u.id) - before, name).toBe(expected ? 0 : 1)
      if (!expected) expect(r!.checks[0]).toMatchObject({ status: 'failed', reason: 'no_transparency' })
    }
  })

  it('an external cost reservation is refunded when its own operation did not verify', async () => {
    const s = await setup()
    await reserveCredits(s.u.id, 3, 'ai_assist', `${s.requestId}:ext`)
    await db.update(aiAssistRequest).set({ reservations: [{ ref: s.requestId, units: 2, kind: 'base' }, { ref: `${s.requestId}:ext`, units: 3, kind: 'external', forKey: 'edit:0' }] }).where(eq(aiAssistRequest.id, s.requestId))
    await saveEdits(s.id, s.doc, [])
    expect(await balanceOf(s.u.id)).toBe(95)
    await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(await balanceOf(s.u.id)).toBe(100) // nothing verified: base and the external cost both refunded
  })
})

describe('POST /presentations/:id/ai-assist/:requestId/outcome', () => {
  it('settles for the owner (ignoring what the browser claims), and answers the same way when repeated', async () => {
    const s = await setup()
    const url = `/presentations/${s.id}/ai-assist/${s.requestId}/outcome`
    const res = await api(s.u.cookie, 'POST', url, { results: s.expect.map((e) => ({ key: e.key, status: 'done' })) })
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ settled: true, verified: 0, judged: 1, refunded: true, already: false })
    expect(await balanceOf(s.u.id)).toBe(100)
    expect((await json(await api(s.u.cookie, 'POST', url, {}))).data).toMatchObject({ already: true })
  })
  it("someone else's request, another deck, or an unknown request id is not found", async () => {
    const s = await setup(); const other = await signUp('other')
    expect((await api(other.cookie, 'POST', `/presentations/${s.id}/ai-assist/${s.requestId}/outcome`, {})).status).toBe(404)
    expect((await api(s.u.cookie, 'POST', `/presentations/${s.id}/ai-assist/nope/outcome`, {})).status).toBe(404)
    const second = await makeDeck(s.u.id, 2)
    expect((await api(s.u.cookie, 'POST', `/presentations/${second.id}/ai-assist/${s.requestId}/outcome`, {})).status).toBe(404)
    expect(await balanceOf(s.u.id)).toBe(98) // nothing was settled
  })
})

describe('reclaimRefunded: a refund is not a free copy of the work', () => {
  it('saved without the change → refunded → the same change saved a little later: charged again, once', async () => {
    const s = await setup()
    await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(await balanceOf(s.u.id)).toBe(100) // refunded: nothing was in the deck
    await saveEdits(s.id, s.doc, s.changes.edits) // the work arrives afterwards
    expect(await reclaimRefunded()).toBeGreaterThanOrEqual(1)
    expect(await balanceOf(s.u.id)).toBe(98)
    expect((await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.id, s.requestId)))[0]!.status).toBe('reclaimed')
    await reclaimRefunded()
    expect(await balanceOf(s.u.id)).toBe(98) // never twice
  })
  it('the change never arrives: nothing is charged', async () => {
    const s = await setup()
    await settleAssistRequest(s.requestId, { trigger: 'client' })
    await reclaimRefunded()
    expect(await balanceOf(s.u.id)).toBe(100)
  })
  it('only part of the work arrives: not charged late (a partial result is never charged after a refund)', async () => {
    const s = await setup({ reservations: ['base', 'more'], edits: 2 })
    await settleAssistRequest(s.requestId, { trigger: 'client' })
    expect(await balanceOf(s.u.id)).toBe(100)
    await saveEdits(s.id, s.doc, [s.changes.edits[0]!])
    await reclaimRefunded()
    expect(await balanceOf(s.u.id)).toBe(100)
  })
  it('after the window the refund stands', async () => {
    const s = await setup()
    await settleAssistRequest(s.requestId, { trigger: 'client' })
    await saveEdits(s.id, s.doc, s.changes.edits)
    await db.update(aiAssistRequest).set({ settledAt: new Date(Date.now() - 31 * 60_000) }).where(eq(aiAssistRequest.id, s.requestId))
    await reclaimRefunded()
    expect(await balanceOf(s.u.id)).toBe(100)
  })
})
