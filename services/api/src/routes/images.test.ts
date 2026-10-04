import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, generatedAsset } from '../db/schema.ts'
import { S3Storage, assertSafeKey, extensionFor, LocalDiskStorage } from '../storage/index.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'
import { composeImagePrompt } from './images.ts'

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const gen = (cookie: string, deckId: string, body: object = {}) => api(cookie, 'POST', `/presentations/${deckId}/images`, { prompt: 'a red electric car on a mountain road', requestId: `img-${rid()}-${rid()}`, ...body })
const setup = async (plan: 'starter' | 'pro' | 'gold' = 'starter') => {
  const u = await signUp('im')
  if (plan !== 'starter') await setPlan(u.id, plan)
  const { id } = await makeDeck(u.id)
  await api(u.cookie, 'GET', '/me/entitlements') // grants the period allowance
  return { u, id }
}

describe('POST /presentations/:id/images', () => {
  it('generates a picture: charged once at the tier price, stored, served by capability URL, ledgered per image', async () => {
    const { u, id } = await setup()
    const before = await balance(u.id)
    const res = await gen(u.cookie, id, { style: 'illustration', aspect: '4:3' })
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ mime: 'image/png', creditsCharged: 20, usage: { deck: { used: 1, max: 3 }, month: { used: 1, max: 6 } } })
    expect(await balance(u.id)).toBe(before - 20)

    const img = await app.request(new URL(body.data.url).pathname) // no cookie: capability URL
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(img.headers.get('x-content-type-options')).toBe('nosniff')
    expect(img.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(img.headers.get('content-security-policy')).toContain('sandbox')
    expect([...new Uint8Array(await img.arrayBuffer()).slice(0, 4)]).toEqual([137, 80, 78, 71])

    const [asset] = await db.select().from(generatedAsset).where(eq(generatedAsset.id, body.data.assetId))
    expect(asset).toMatchObject({ userId: u.id, presentationId: id, status: 'ready', mime: 'image/png' })
    expect(Number(asset!.providerCostUsd)).toBeGreaterThan(0)
    const events = await db.select().from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, u.id), eq(aiUsageEvent.requestType, 'image_generation')))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status: 'success', imageCount: 1 })
  })

  it('per-deck limit: Starter gets 3 pictures per presentation; the 4th is refused and costs nothing', async () => {
    const { u, id } = await setup()
    for (let i = 0; i < 3; i++) expect((await gen(u.cookie, id)).status).toBe(200)
    const before = await balance(u.id)
    const res = await gen(u.cookie, id)
    expect(res.status).toBe(429)
    const e = (await json(res)).error
    expect(e.code).toBe('LIMIT_REACHED')
    expect(e.message).toMatch(/3 AI images/)
    expect(await balance(u.id)).toBe(before)
    // a different deck still has its own allowance
    const other = await makeDeck(u.id)
    expect((await gen(u.cookie, other.id)).status).toBe(200)
  })

  it('per-month limit counts pictures across all decks', async () => {
    const { u, id } = await setup()
    for (let i = 0; i < 6; i++) await db.insert(generatedAsset).values({ id: `m${rid()}${rid()}${rid()}`.padEnd(32, 'x'), userId: u.id, presentationId: `other-deck-${i}`, status: 'ready', provider: 'vertex', model: 'm', prompt: 'p', mime: 'image/png', bytes: 1, storageKey: 'k' })
    const res = await gen(u.cookie, id)
    expect(res.status).toBe(429)
    expect((await json(res)).error.message).toMatch(/this month/)
  })

  it('parallel requests cannot exceed the limit (slot reservation is serialised)', async () => {
    const { u, id } = await setup()
    const before = await balance(u.id)
    const results = await Promise.all(Array.from({ length: 6 }, () => gen(u.cookie, id)))
    const ok = results.filter((r) => r.status === 200).length
    expect(ok).toBe(3)
    expect(results.filter((r) => r.status === 429)).toHaveLength(3)
    expect(await balance(u.id)).toBe(before - 3 * 20)
    expect((await db.select().from(generatedAsset).where(eq(generatedAsset.presentationId, id))).filter((a) => a.status === 'ready')).toHaveLength(3)
  })

  it('retrying the same requestId returns the same picture and charges once', async () => {
    const { u, id } = await setup()
    const before = await balance(u.id)
    const requestId = `img-${rid()}-${rid()}`
    const a = await json(await gen(u.cookie, id, { requestId }))
    const b = await json(await gen(u.cookie, id, { requestId }))
    expect(b.data.assetId).toBe(a.data.assetId)
    expect(b.data.creditsCharged).toBe(0)
    expect(await balance(u.id)).toBe(before - 20)
    expect((await db.select().from(generatedAsset).where(eq(generatedAsset.presentationId, id)))).toHaveLength(1)
  })

  it('a refused prompt is explained, refunded, and releases its quota slot', async () => {
    const { u, id } = await setup()
    const before = await balance(u.id)
    const res = await gen(u.cookie, id, { prompt: 'BLOCK_PLEASE something' })
    expect(res.status).toBe(422)
    expect((await json(res)).error.code).toBe('IMAGE_BLOCKED')
    expect(await balance(u.id)).toBe(before)
    for (let i = 0; i < 3; i++) expect((await gen(u.cookie, id)).status).toBe(200) // all 3 slots still available
  })

  it('a provider failure is refunded and frees the slot', async () => {
    const { u, id } = await setup()
    const before = await balance(u.id)
    const res = await gen(u.cookie, id, { prompt: 'FAIL_PLEASE' })
    expect([502, 503]).toContain(res.status)
    expect(await balance(u.id)).toBe(before)
    expect((await db.select().from(generatedAsset).where(eq(generatedAsset.presentationId, id)))).toHaveLength(0)
  })

  it('tier gate: Starter cannot pick a premium image model; Pro can', async () => {
    const { u, id } = await setup()
    const models = (await json(await api(u.cookie, 'GET', '/models?kind=image'))).data.models as { id: string; tier: string; creditsPerImage: number; allowed: boolean }[]
    expect(models.every((m) => ['starter', 'premium', 'frontier'].includes(m.tier))).toBe(true)
    const premium = models.find((m) => m.tier === 'premium')!
    expect(premium.allowed).toBe(false)
    const denied = await gen(u.cookie, id, { model: premium.id })
    expect(denied.status).toBe(403)
    expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')

    const pro = await setup('pro')
    const ok = await json(await gen(pro.u.cookie, pro.id, { model: premium.id }))
    expect(ok.data.creditsCharged).toBe(premium.creditsPerImage)
    expect(ok.data.usage.deck.max).toBe(10)
  })

  it('insufficient credits: 402, nothing stored, slot released', async () => {
    const { u, id } = await setup()
    await db.update(creditBalance).set({ balance: 5 }).where(eq(creditBalance.userId, u.id))
    const res = await gen(u.cookie, id)
    expect(res.status).toBe(402)
    expect((await json(res)).error.code).toBe('INSUFFICIENT_CREDITS')
    expect(await balance(u.id)).toBe(5)
    expect((await db.select().from(generatedAsset).where(eq(generatedAsset.presentationId, id)))).toHaveLength(0)
  })

  it('ownership and auth: only your own deck; anonymous is refused', async () => {
    const { id } = await setup()
    const other = await signUp('im')
    expect((await gen(other.cookie, id)).status).toBe(404)
    expect((await app.request(`/api/v1/presentations/${id}/images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401)
  })

  it('usage endpoint reports remaining allowance before anything is spent', async () => {
    const { u, id } = await setup()
    await gen(u.cookie, id)
    const r = await json(await api(u.cookie, 'GET', `/presentations/${id}/images/usage`))
    expect(r.data).toMatchObject({ enabled: true, deck: { used: 1, max: 3 }, month: { used: 1, max: 6 } })
  })

  it('validates input (too short / too long prompt, bad aspect)', async () => {
    const { u, id } = await setup()
    expect((await gen(u.cookie, id, { prompt: 'hi' })).status).toBe(400)
    expect((await gen(u.cookie, id, { prompt: 'x'.repeat(501) })).status).toBe(400)
    expect((await gen(u.cookie, id, { aspect: '7:5' })).status).toBe(400)
  })
})

describe('GET /assets/:id', () => {
  it('404 for unknown, malformed or pending ids', async () => {
    expect((await app.request('/api/v1/assets/nope')).status).toBe(404)
    expect((await app.request(`/api/v1/assets/${'a'.repeat(32)}`)).status).toBe(404)
    const id = `p${rid()}${rid()}${rid()}`.padEnd(32, 'z')
    await db.insert(generatedAsset).values({ id, userId: 'u', status: 'pending', provider: 'v', model: 'm', prompt: 'p', mime: '', bytes: 0, storageKey: '' })
    expect((await app.request(`/api/v1/assets/${id}`)).status).toBe(404)
  })
})

describe('prompt + storage helpers', () => {
  it('always forbids text in the picture and carries the style', () => {
    const p = composeImagePrompt('a team meeting', 'photo')
    expect(p).toMatch(/Photorealistic/)
    expect(p).toMatch(/Subject: a team meeting/)
    expect(p).toMatch(/no text, letters, numbers, logos/i)
  })
  it('storage keys cannot escape the root', () => {
    expect(() => assertSafeKey('../../etc/passwd')).toThrow()
    expect(() => assertSafeKey('abc.png')).toThrow()
    expect(assertSafeKey(`${'a'.repeat(32)}.png`)).toBeTruthy()
    expect(extensionFor('image/jpeg')).toBe('jpg')
  })
  it('local disk round-trips and S3 storage speaks the SDK shape (fake client)', async () => {
    const dir = `/private/tmp/claude-502/assets-test-${rid()}`
    const local = new LocalDiskStorage(dir)
    const key = `${'b'.repeat(32)}.png`
    await local.put(key, new Uint8Array([1, 2, 3]))
    expect([...(await local.get(key))!]).toEqual([1, 2, 3])
    expect(await local.get(`${'c'.repeat(32)}.png`)).toBeNull()

    const sent: any[] = []
    class Put { constructor(public input: any) {} }
    class Get { constructor(public input: any) {} }
    const store = new Map<string, Uint8Array>()
    const s3 = new S3Storage('bkt', { send: async (cmd: any) => {
      sent.push(cmd)
      if (cmd instanceof Put) { store.set(cmd.input.Key, cmd.input.Body); return {} }
      const body = store.get(cmd.input.Key)
      if (!body) throw Object.assign(new Error('x'), { name: 'NoSuchKey' })
      return { Body: { transformToByteArray: async () => body } }
    } }, { Put, Get })
    await s3.put(key, new Uint8Array([9]), 'image/png')
    expect(sent[0].input).toMatchObject({ Bucket: 'bkt', Key: `generated/${key}`, ContentType: 'image/png' })
    expect([...(await s3.get(key))!]).toEqual([9])
    expect(await s3.get(`${'d'.repeat(32)}.png`)).toBeNull()
  })
})
