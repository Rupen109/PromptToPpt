import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AIGateway, MockProvider, ModelRegistry, ProviderError, ProviderLimiter, type ModelDefinition, type UsageRecord } from './index'

/**
 * The backup behind the main provider (Gemini direct → the same Gemini models through OpenRouter): ModelRegistry backups + the gateway's circuit breaker and overflow.
 * The person must always get the SAME model; the backup is tried only after every main model; the owner is told each time it answers.
 */
const schema = z.object({ ok: z.boolean() })
const def = (id: string, provider: string, o: Partial<ModelDefinition> = {}): ModelDefinition => ({
  id, provider, model: id.split(':')[1]!, tier: 'quality', accessTier: 'starter',
  capabilities: { text: true, vision: false, structuredOutput: true, toolUse: false, imageGeneration: false, contextWindow: 1 },
  pricing: { inputPerMTokUsd: 1, outputPerMTokUsd: 1, sourceUrl: 'x', verifiedOn: 'x' }, ...o,
})
const main36 = def('vertex:gemini-3.6-flash', 'vertex')
const main38 = def('vertex:gemini-3.8-flash', 'vertex')
const pro = def('vertex:gemini-3.1-pro-preview', 'vertex', { accessTier: 'premium', minThinkingBudget: 128 })
const back36 = def('openrouter:google/gemini-3.6-flash', 'openrouter')
const back38 = def('openrouter:google/gemini-3.8-flash', 'openrouter')
const backPro = def('openrouter:google/gemini-3.1-pro-preview', 'openrouter', { accessTier: 'premium', minThinkingBudget: 128 })
const registry = () => new ModelRegistry([main36, main38, pro], { chains: { fast: [main36.id!], quality: [main36.id!, main38.id!] } }, new Map([[main36.id!, back36], [main38.id!, back38], [pro.id!, backPro]]))

const refuse = (status: number) => () => { throw new ProviderError(status === 402 ? 'Your prepay credit balance is depleted.' : 'busy', status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED', status !== 402, status) }
const ok = () => '{"ok":true}'

function setup(mainRespond: (r: { model: string }, n: number) => string, o: { limiter?: ProviderLimiter; now?: () => number } = {}) {
  const gemini = new MockProvider(mainRespond)
  const openrouter = new MockProvider(ok)
  const ledger: UsageRecord[] = []
  const alerts: string[] = []
  const gateway = new AIGateway({
    providers: { vertex: gemini, openrouter }, registry: registry(), recordUsage: async (r) => void ledger.push(r), sleep: async () => {}, retriesPerModel: 2,
    backupProvider: 'openrouter', onBackup: (d, why) => void alerts.push(`${d.id} | ${why}`), ...(o.limiter ? { limiter: o.limiter } : {}), ...(o.now ? { now: o.now } : {}),
  })
  const run = (model?: string) => gateway.run({ route: 'quality', ...(model ? { model } : {}), requestType: 'slide_content', system: 's', prompt: 'p', schema })
  return { gemini, openrouter, ledger, alerts, gateway, run }
}

describe('registry backups', () => {
  it('every chain is the main models, then the backup of each in the same order; a picked model keeps its own backup', () => {
    const r = registry()
    expect(r.chain('quality').map((m) => m.id)).toEqual([main36.id, main38.id, back36.id, back38.id])
    expect(r.chainFor(pro.id!).map((m) => m.id)).toEqual([pro.id, backPro.id])
    expect(r.backupOf(main36.id!)?.id).toBe(back36.id)
    expect(new ModelRegistry([main36], { chains: { fast: [], quality: [main36.id!] } }).chain('quality').map((m) => m.id)).toEqual([main36.id]) // no backup configured: nothing added
  })
})

describe('the backup takes over when the main provider refuses', () => {
  it('credit used up (402): no waiting, the same model answers through the backup, the owner is told why, and the ledger shows both', async () => {
    const t = setup(refuse(402))
    await expect(t.run()).resolves.toEqual({ ok: true })
    expect(t.openrouter.calls[0]!.model).toBe('google/gemini-3.6-flash')
    expect(t.gemini.calls.length).toBe(1) // one refusal passes Gemini over: 3.8 Flash is not asked, nothing is retried
    expect(t.alerts[0]).toMatch(/openrouter:google\/gemini-3\.6-flash \| .*prepay credit balance is depleted/)
    expect(t.ledger.map((l) => `${l.provider}:${l.status}`)).toEqual(['vertex:error', 'openrouter:success'])
  })

  it('while the provider is passed over, new calls go to the backup first; after the pause Gemini is tried again and a good answer closes the breaker', async () => {
    let now = 1_000_000
    let broke = true
    const t = setup((_r, n) => (broke ? refuse(402)() : ok()), { now: () => now })
    await t.run()
    expect(t.gateway.providerDownFor('vertex')).toBeGreaterThan(0)
    await t.run()
    expect(t.gemini.calls.length).toBe(1) // the second call did not knock on Gemini at all
    now += 121_000; broke = false
    await t.run()
    expect(t.gemini.calls.length).toBe(2); expect(t.gateway.providerDownFor('vertex')).toBe(0)
    expect(t.ledger.at(-1)!.provider).toBe('vertex')
  })

  it('three outages in a row (503) pass the provider over; a single one does not', async () => {
    const t = setup(refuse(503))
    await t.run()
    expect(t.openrouter.calls.length).toBe(1)
    expect(t.gateway.providerDownFor('vertex')).toBeGreaterThan(0)
  })

  it('a Premium pick of Gemini 3.1 Pro falls back to the SAME Pro model through the backup, never to a cheaper one, with its thinking minimum', async () => {
    const t = setup(refuse(402))
    await t.run(pro.id)
    expect(t.openrouter.calls.map((c) => c.model)).toEqual(['google/gemini-3.1-pro-preview'])
    expect(t.openrouter.calls[0]!.thinkingBudget).toBe(128)
    expect(t.gemini.calls[0]!.thinkingBudget).toBe(128)
  })

  it('a refused PROMPT (blocked) or a bad answer is not a provider failure: the breaker stays closed', async () => {
    const t = setup(() => { throw new ProviderError('blocked: SAFETY', 'blocked', false) })
    await t.run().catch(() => {})
    expect(t.gateway.providerDownFor('vertex')).toBe(0)
  })

  it('without a backup the main provider is still used (the only option), and no alert is raised', async () => {
    const gemini = new MockProvider(ok)
    const alerts: string[] = []
    const gw = new AIGateway({ providers: { vertex: gemini }, registry: new ModelRegistry([main36], { chains: { fast: [], quality: [main36.id!] } }), recordUsage: async () => {}, onBackup: () => void alerts.push('x') })
    await gw.run({ route: 'quality', requestType: 'slide_content', system: 's', prompt: 'p', schema })
    expect(gemini.calls.length).toBe(1); expect(alerts).toEqual([])
  })
})

describe('overflow: the backup answers BEFORE Gemini refuses', () => {
  it('when both main models have a long queue at their per-minute limit, a new call goes to the backup instead of waiting', async () => {
    const limiter = new ProviderLimiter({ limits: (k) => (k.startsWith('vertex:') ? { rpm: 6 } : {}) })
    const t = setup(ok, { limiter })
    // use up Gemini's minute (a bucket holds 10 s of the limit = 1 call) and queue more behind it
    await t.run()
    const waiting = [1, 2, 3, 4].map(() => limiter.acquire('vertex:gemini-3.6-flash').then((p) => p.release({ ok: true })))
    const waiting38 = [1, 2, 3, 4].map(() => limiter.acquire('vertex:gemini-3.8-flash').then((p) => p.release({ ok: true })))
    expect(limiter.waitFor('vertex:gemini-3.6-flash')).toBeGreaterThan(5000)
    await t.run()
    expect(t.openrouter.calls.length).toBe(1)
    expect(t.alerts[0]).toMatch(/overflow/)
    void waiting; void waiting38
  })

  it('a short wait stays on Gemini (no fee for a busy second)', async () => {
    const limiter = new ProviderLimiter({ limits: () => ({ rpm: 600 }) })
    const t = setup(ok, { limiter })
    await t.run(); await t.run()
    expect(t.openrouter.calls.length).toBe(0)
  })
})

describe('402 is billing, not a busy moment', () => {
  it('a 402 marked RESOURCE_EXHAUSTED is not waited out as a rate limit when no backup exists: it fails at once with the reason', async () => {
    let calls = 0
    const gemini = new MockProvider(() => { calls++; return refuse(402)() })
    const gw = new AIGateway({ providers: { vertex: gemini }, registry: new ModelRegistry([main36], { chains: { fast: [], quality: [main36.id!] } }), recordUsage: async () => {}, sleep: async () => { throw new Error('should not wait') }, limiter: new ProviderLimiter() })
    await expect(gw.run({ route: 'quality', requestType: 'slide_content', system: 's', prompt: 'p', schema })).rejects.toThrow(/all models failed/)
    expect(calls).toBe(1)
  })
})
