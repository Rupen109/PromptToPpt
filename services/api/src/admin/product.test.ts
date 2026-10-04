import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { DESIGNS } from '@prompttoppt/theme'
import { db } from '../db/index.ts'
import { aiUsageEvent, exportEvent, generatedAsset, generationJob, presentation, presentationVersion, user } from '../db/schema.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'

/**
 * The test DB persists between runs and other suites write to it, so every seeded row sits inside a private one-day window far in the
 * past (unique per run) and every query is bounded to that window.
 */
function windowOf() {
  const from = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3650) * 864e5)
  // mid-day offsets: raw Date params are bound in the server's local zone, so stay clear of the window edges
  const at = (h: number) => new Date(from.getTime() + (10 + h) * 36e5)
  return { from, at, q: `from=${from.toISOString()}&to=${new Date(from.getTime() + 864e5).toISOString()}` }
}
async function adminUser() {
  const u = await signUp('prod')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id))
  return u
}
const emailOf = async (id: string) => (await db.select({ e: user.email }).from(user).where(eq(user.id, id)))[0]!.e
const get = async (cookie: string, path: string) => {
  const res = await api(cookie, 'GET', `/admin${path}`)
  expect(res.status).toBe(200)
  return (await json(res)).data
}

describe('product sections are admin-only', () => {
  it('normal user gets 403, anonymous 401, on every endpoint; bad input gets 400', async () => {
    const u = await signUp('prod')
    const admin = await adminUser()
    const paths = ['images/summary', 'images/timeseries', 'images/breakdown?by=model', 'images/per-deck', 'images/top-users', 'images/quota', 'images/recent',
      'exports/summary', 'exports/timeseries', 'exports/breakdown?by=format', 'exports/errors', 'exports/slides', 'exports/top-users', 'exports/recent',
      'presentations/summary', 'presentations/timeseries', 'presentations/composition', 'presentations/templates', 'presentations/top-users', 'presentations/recent']
    for (const p of paths) {
      expect((await api(u.cookie, 'GET', `/admin/${p}`)).status, p).toBe(403)
      expect((await api('', 'GET', `/admin/${p}`)).status, p).toBe(401)
      expect((await api(admin.cookie, 'GET', `/admin/${p}`)).status, p).toBe(200)
    }
    expect((await api(admin.cookie, 'GET', '/admin/images/breakdown?by=email')).status).toBe(400)
    expect((await api(admin.cookie, 'GET', '/admin/images/recent?pageSize=5000')).status).toBe(400)
    expect((await api(admin.cookie, 'GET', '/admin/exports/recent?status=nope')).status).toBe(400)
    expect((await api(admin.cookie, 'GET', '/admin/presentations/summary?from=garbage')).status).toBe(400)
  })

  it('an empty range returns zeros, never NaN', async () => {
    const admin = await adminUser()
    const w = windowOf()
    const i = await get(admin.cookie, `/images/summary?${w.q}`)
    expect(i).toMatchObject({ ready: 0, avgCostUsd: 0, failureRate: 0, imagesPerDeck: 0, avgBytes: 0 })
    expect(await get(admin.cookie, `/exports/summary?${w.q}`)).toMatchObject({ total: 0, successRate: 0, failureRate: 0, avgDurationMs: 0, p95DurationMs: 0 })
    expect(await get(admin.cookie, `/presentations/summary?${w.q}`)).toMatchObject({ created: 0, avgSlides: 0, editedShare: 0 })
  })
})

describe('images', () => {
  it('summary, series, breakdowns, distribution, top users and recent match the seeded rows', async () => {
    const admin = await adminUser()
    const w = windowOf()
    const u1 = await signUp('img'), u2 = await signUp('img')
    await setPlan(u1.id, 'pro')
    const [d1, d2, d3] = [nanoid(), nanoid(), nanoid()]
    const asset = (o: Partial<typeof generatedAsset.$inferInsert>): typeof generatedAsset.$inferInsert => ({ id: nanoid(), userId: u1.id, presentationId: d1, provider: 'vertex', model: 'img-a', prompt: 'a cat', mime: 'image/png', bytes: 1000, storageKey: 'k', providerCostUsd: '0.04', status: 'ready', createdAt: w.at(1), ...o })
    await db.insert(generatedAsset).values([
      asset({ prompt: 'x'.repeat(200), createdAt: w.at(3) }), asset({ createdAt: w.at(2) }), asset({ presentationId: d2, deletedAt: new Date() }),
      asset({ userId: u2.id, presentationId: d3, model: 'img-b', bytes: 500, providerCostUsd: '0.02' }),
      asset({ userId: u2.id, status: 'pending', bytes: 0, providerCostUsd: '0' }),
    ])
    const ev = (status: 'success' | 'error') => ({ id: nanoid(), userId: u1.id, provider: 'vertex', model: 'img-a', requestType: 'image_generation', imageCount: status === 'success' ? 1 : 0, latencyMs: 10, status, providerCostUsd: '0', environment: 'development', createdAt: w.at(3) })
    await db.insert(aiUsageEvent).values([ev('success'), ev('error'), ev('error')])

    const s = await get(admin.cookie, `/images/summary?${w.q}`)
    expect(s).toMatchObject({ ready: 4, pending: 0, stalePending: 1, deleted: 1, failed: 2, ledgerAttempts: 3, ledgerImages: 1, storageBytes: 3500, liveStorageBytes: 2500, activeUsers: 2, decksWithImages: 3 })
    expect(s.costUsd).toBeCloseTo(0.14, 8)
    expect(s.avgCostUsd).toBeCloseTo(0.035, 8)
    expect(s.failureRate).toBeCloseTo(2 / 3, 8)
    expect(s.imagesPerDeck).toBeCloseTo(4 / 3, 8)

    const t = await get(admin.cookie, `/images/timeseries?${w.q}&bucket=hour`)
    expect(t.map((p: any) => p.images)).toEqual([2, 1, 1])
    const day = await get(admin.cookie, `/images/timeseries?${w.q}`)
    expect(day).toHaveLength(1)
    expect(day[0]).toMatchObject({ images: 4, bytes: 3500 })

    const byModel = await get(admin.cookie, `/images/breakdown?${w.q}&by=model`)
    expect(byModel.map((r: any) => [r.key, r.images])).toEqual([['img-a', 3], ['img-b', 1]])
    expect(byModel[0].avgCostUsd).toBeCloseTo(0.04, 8)
    const byPlan = await get(admin.cookie, `/images/breakdown?${w.q}&by=plan`)
    expect(byPlan.map((r: any) => [r.key, r.images])).toEqual([['pro', 3], ['starter', 1]])

    expect(await get(admin.cookie, `/images/per-deck?${w.q}`)).toEqual([{ bucket: '1', decks: 2 }, { bucket: '2', decks: 1 }])

    const top = await get(admin.cookie, `/images/top-users?${w.q}&limit=1`)
    expect(top).toHaveLength(1)
    expect(top[0]).toMatchObject({ userId: u1.id, images: 3, plan: 'pro' })

    const r = await get(admin.cookie, `/images/recent?${w.q}&pageSize=3`)
    expect(r).toMatchObject({ total: 4, page: 1, pageSize: 3 })
    expect(r.rows).toHaveLength(3)
    expect(r.rows.some((x: any) => x.prompt === 'x'.repeat(120) + '…')).toBe(true)
    expect((await get(admin.cookie, `/images/recent?${w.q}&pageSize=3&page=2`)).rows).toHaveLength(1)
  })

  it('quota pressure lists users at / near their plan limit for the current period', async () => {
    const admin = await adminUser()
    const full = await signUp('quota'), near = await signUp('quota'), low = await signUp('quota')
    const mk = (userId: string, n: number) => Array.from({ length: n }, (): typeof generatedAsset.$inferInsert => ({ id: nanoid(), userId, provider: 'vertex', model: 'img-a', prompt: 'p', mime: 'image/png', bytes: 1, storageKey: 'k', status: 'ready' }))
    await db.insert(generatedAsset).values([...mk(full.id, 6), ...mk(near.id, 5), ...mk(low.id, 2)]) // Starter limit is 6
    const q = await get(admin.cookie, `/images/quota?threshold=0.8&limit=50&userIds=${[full.id, near.id, low.id].join(',')}`)
    const byId = Object.fromEntries(q.users.map((x: any) => [x.userId, x]))
    expect(byId[full.id]).toMatchObject({ used: 6, limit: 6, ratio: 1, plan: 'starter' })
    expect(byId[near.id]).toMatchObject({ used: 5, limit: 6 })
    expect(byId[low.id]).toBeUndefined()
    expect(q.atLimit).toBeGreaterThanOrEqual(1)
    expect(q.nearLimit).toBeGreaterThanOrEqual(1)
    const email = await emailOf(full.id)
    expect(q.users.find((x: any) => x.userId === full.id).email).toBe(email)
    // the shared test DB persists: remove what this test created so repeated runs don't push each other out of the top-N list
    await db.delete(generatedAsset).where(inArray(generatedAsset.userId, [full.id, near.id, low.id]))
    await db.delete(user).where(inArray(user.id, [full.id, near.id, low.id]))
  })
})

describe('exports', () => {
  it('totals, rates, durations, errors, breakdowns and abandoned detection match the seeded events', async () => {
    const admin = await adminUser()
    const w = windowOf()
    const e1 = await signUp('exp'), e2 = await signUp('exp')
    await setPlan(e1.id, 'pro')
    const deck = nanoid()
    const ev = (o: Partial<typeof exportEvent.$inferInsert>): typeof exportEvent.$inferInsert => ({ id: nanoid(), userId: e1.id, presentationId: deck, format: 'pptx', mode: 'server', status: 'success', createdAt: w.at(1), ...o })
    await db.insert(exportEvent).values([
      ev({ durationMs: 1000, bytes: 5000, slideCount: 10 }),
      ev({ durationMs: 3000, bytes: 7000, slideCount: 20, createdAt: w.at(2) }),
      ev({ format: 'pdf', mode: 'client', durationMs: 2000, bytes: 100, slideCount: 5 }),
      ev({ userId: e2.id, format: 'pdf', mode: 'client', status: 'failed', error: 'render timeout' }),
      ev({ userId: e2.id, format: 'png', mode: 'client', status: 'failed', error: 'render timeout' }),
      ev({ userId: e2.id, format: 'html', mode: 'client', status: 'started' }),
    ])
    const s = await get(admin.cookie, `/exports/summary?${w.q}`)
    expect(s).toMatchObject({ total: 6, success: 3, failed: 2, abandoned: 1, inProgress: 0, avgDurationMs: 2000, p95DurationMs: 2900, avgBytes: 4033, activeUsers: 2, decks: 1 })
    expect(s.successRate).toBeCloseTo(0.5, 8)
    expect(s.failureRate).toBeCloseTo(1 / 3, 8)
    expect(s.abandonedRate).toBeCloseTo(1 / 6, 8)
    expect(s.avgSlides).toBeCloseTo(35 / 3, 8)

    const series = await get(admin.cookie, `/exports/timeseries?${w.q}`)
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({ total: 6, success: 3, failed: 2, abandoned: 1 })

    const fmt = await get(admin.cookie, `/exports/breakdown?${w.q}&by=format`)
    const pptx = fmt.find((r: any) => r.key === 'pptx')
    expect(pptx).toMatchObject({ total: 2, success: 2, successRate: 1, avgDurationMs: 2000, avgBytes: 6000 })
    expect(fmt.find((r: any) => r.key === 'html')).toMatchObject({ abandoned: 1, successRate: 0, avgDurationMs: 0 })
    const mode = await get(admin.cookie, `/exports/breakdown?${w.q}&by=mode`)
    expect(mode.map((r: any) => [r.key, r.total])).toEqual([['client', 4], ['server', 2]])
    const plan = await get(admin.cookie, `/exports/breakdown?${w.q}&by=plan`)
    expect(plan.map((r: any) => [r.key, r.total]).sort()).toEqual([['pro', 3], ['starter', 3]])

    const errs = await get(admin.cookie, `/exports/errors?${w.q}`)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatchObject({ message: 'render timeout', count: 2, formats: ['pdf', 'png'] })

    expect(await get(admin.cookie, `/exports/slides?${w.q}`)).toEqual([{ bucket: '1-5', exports: 1 }, { bucket: '6-10', exports: 1 }, { bucket: '11-20', exports: 1 }])
    const top = await get(admin.cookie, `/exports/top-users?${w.q}`)
    expect(top.find((r: any) => r.userId === e2.id)).toMatchObject({ exports: 3, failed: 2, plan: 'starter' })

    const ab = await get(admin.cookie, `/exports/recent?${w.q}&status=abandoned`)
    expect(ab.total).toBe(1)
    expect(ab.rows[0]).toMatchObject({ format: 'html', status: 'abandoned', email: await emailOf(e2.id), presentationId: deck, bytes: null, durationMs: null })
    const failed = await get(admin.cookie, `/exports/recent?${w.q}&status=failed&format=png`)
    expect(failed.rows).toHaveLength(1)
    expect(failed.rows[0].error).toBe('render timeout')
    expect((await get(admin.cookie, `/exports/recent?${w.q}&pageSize=4&page=2`)).rows).toHaveLength(2)
  })
})

describe('presentations', () => {
  it('counts, sources, templates, distributions and recent match the seeded decks', async () => {
    const admin = await adminUser()
    const w = windowOf()
    const a = await signUp('deck'), b = await signUp('deck')
    const design = DESIGNS[0]!
    const mk = async (userId: string, o: { slides: number; aspect?: string; template?: string; font?: string; revision?: number; deleted?: boolean; ai?: boolean; title: string; at?: number }) => {
      const id = nanoid()
      const created = w.at(o.at ?? 1)
      const revision = o.revision ?? 1
      await db.insert(presentation).values({ id, userId, title: o.title, aspectRatio: o.aspect ?? '16:9', latestVersion: revision, revision, createdAt: created, updatedAt: w.at(5), ...(o.deleted ? { deletedAt: new Date() } : {}) })
      const doc = (slides: number) => ({ schemaVersion: 1, id, title: o.title, aspectRatio: o.aspect ?? '16:9', theme: { id: 't', fonts: { heading: o.font ?? 'Inter', body: 'Inter' }, ...(o.template ? { templateId: o.template } : {}) }, slides: Array.from({ length: slides }, () => ({})) })
      // an older version with a different slide count must be ignored: only the latest version is read
      if (revision > 1) await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc(99) as never, createdBy: 'generation', createdAt: created })
      await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: revision, document: doc(o.slides) as never, createdBy: revision > 1 ? 'user' : 'generation', createdAt: created })
      if (o.ai) await db.insert(generationJob).values({ id: nanoid(), userId, presentationId: id, prompt: 'p', options: {}, idempotencyKey: nanoid() })
    }
    await mk(a.id, { slides: 5, template: design.id, ai: true, title: 'AI deck', font: 'Inter' })
    await mk(a.id, { slides: 3, aspect: '4:3', template: design.id, revision: 4, title: 'Template deck', font: 'Lora', at: 2 })
    await mk(a.id, { slides: 4, deleted: true, title: 'Gone' })
    await mk(b.id, { slides: 2, title: 'Blank deck', at: 3 })

    const s = await get(admin.cookie, `/presentations/summary?${w.q}`)
    expect(s).toMatchObject({ created: 4, live: 3, deleted: 1, creators: 2, editedDecks: 1, versionsSaved: 5 })
    expect(s.avgSlides).toBeCloseTo(10 / 3, 8)
    expect(s.avgRevision).toBeCloseTo(2, 8)
    expect(s.editedShare).toBeCloseTo(1 / 3, 8)
    expect(s.allTimeLive).toBeGreaterThanOrEqual(3)

    const ts = await get(admin.cookie, `/presentations/timeseries?${w.q}&bucket=hour`)
    expect(ts.map((p: any) => p.decks)).toEqual([2, 1, 1])

    const c = await get(admin.cookie, `/presentations/composition?${w.q}`)
    expect(c.aspectRatio).toEqual([{ key: '16:9', decks: 2 }, { key: '4:3', decks: 1 }])
    expect(Object.fromEntries(c.source.map((x: any) => [x.key, x.decks]))).toEqual({ ai: 1, template: 1, blank: 1 })
    expect(Object.fromEntries(c.headingFonts.map((x: any) => [x.key, x.decks]))).toEqual({ Inter: 2, Lora: 1 })
    expect(Object.fromEntries(c.revisions.map((x: any) => [x.key, x.decks]))).toEqual({ '1 (never edited)': 2, '2-5': 1 })
    expect(Object.fromEntries(c.decksPerUser.map((x: any) => [x.key, x.decks]))).toMatchObject({ '1': 1, '2-5': 1 })
    expect(c.versionsBySource.find((x: any) => x.key === 'user').decks).toBe(1)

    const t = await get(admin.cookie, `/presentations/templates?${w.q}`)
    expect(t.total).toBe(2)
    expect(t.top[0]).toMatchObject({ id: design.id, name: design.name, category: design.category, decks: 2 })
    expect(t.categories).toEqual([{ category: design.category, name: expect.any(String), decks: 2 }])

    const u = await get(admin.cookie, `/presentations/top-users?${w.q}&limit=5`)
    expect(u[0]).toMatchObject({ userId: a.id, decks: 2, revisions: 5, email: await emailOf(a.id) })

    const r = await get(admin.cookie, `/presentations/recent?${w.q}&pageSize=2`)
    expect(r).toMatchObject({ total: 3, pageSize: 2 })
    expect(r.rows.map((x: any) => [x.title, x.slides, x.source])).toEqual([['Blank deck', 2, 'blank'], ['Template deck', 3, 'template']])
    expect((await get(admin.cookie, `/presentations/recent?${w.q}&pageSize=2&page=2`)).rows.map((x: any) => x.title)).toEqual(['AI deck'])
  })
})
