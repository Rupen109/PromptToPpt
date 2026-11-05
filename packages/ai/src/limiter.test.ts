import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AIGateway } from './gateway'
import { ProviderLimiter, limitsFromMap } from './limiter'
import { ModelRegistry } from './registry'
import { ProviderError, type AIProvider, type ModelDefinition, type TextRequest } from './types'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

describe('ProviderLimiter', () => {
  it('never runs more calls at once than the cap, and serves callers in order', async () => {
    const l = new ProviderLimiter({ limits: () => ({ concurrency: 2 }) })
    const order: number[] = []
    let live = 0, peak = 0
    const job = async (i: number) => { const p = await l.acquire('k'); order.push(i); live++; peak = Math.max(peak, live); await tick(10); live--; p.release({ ok: true }) }
    await Promise.all(Array.from({ length: 8 }, (_, i) => job(i)))
    expect(peak).toBe(2)
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('a stray 429 cuts the cap a little and pauses nothing; a burst of refusals at the same moment counts once', async () => {
    let t = 0
    const l = new ProviderLimiter({ limits: () => ({ concurrency: 10 }), now: () => t })
    const held = await Promise.all(Array.from({ length: 5 }, () => l.acquire('k')))
    held.forEach((p) => p.release({ ok: false, rateLimited: true, retryAfterMs: 4000 })) // five refused together
    expect(l.stats('k').cap).toBe(7) // 10 x 0.7, once, not five times
    expect(l.pausedFor('k')).toBe(0) // too few calls yet to say the provider is out of capacity
    t = 1500
    ;(await l.acquire('k')).release({ ok: false, rateLimited: true })
    expect(l.stats('k').cap).toBe(4) // a second moment, a second cut
  })

  it('when most recent calls are refused the whole key pauses for the time the provider asked; good answers bring the cap back', async () => {
    let t = 0
    const l = new ProviderLimiter({ limits: () => ({ concurrency: 20 }), now: () => t })
    const held = await Promise.all(Array.from({ length: 8 }, () => l.acquire('k')))
    for (const p of held) { t += 100; p.release({ ok: false, rateLimited: true, retryAfterMs: 4000 }) }
    expect(l.pausedFor('k')).toBeGreaterThanOrEqual(3500)
    const low = l.stats('k').cap
    t += 10_000
    expect(l.pausedFor('k')).toBe(0)
    for (let i = 0; i < 300; i++) (await l.acquire('k')).release({ ok: true })
    expect(l.stats('k').cap).toBeGreaterThan(low)
    expect(l.stats('k').cap).toBeLessThanOrEqual(20)
  })

  it('a paused key makes the next caller wait, not fail', async () => {
    vi.useFakeTimers()
    try {
      const l = new ProviderLimiter({ limits: () => ({ concurrency: 20 }) })
      const held = await Promise.all(Array.from({ length: 8 }, () => l.acquire('k')))
      for (const p of held) p.release({ ok: false, rateLimited: true, retryAfterMs: 1000 })
      let got = false
      void l.acquire('k').then(() => { got = true })
      await vi.advanceTimersByTimeAsync(500)
      expect(got).toBe(false)
      await vi.advanceTimersByTimeAsync(1500)
      expect(got).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('spreads calls evenly when a rate is set: a burst of 100 against 60 a minute is not sent at once', async () => {
    vi.useFakeTimers()
    try {
      const l = new ProviderLimiter({ limits: () => ({ rpm: 60, concurrency: 1000 }) })
      let admitted = 0
      for (let i = 0; i < 100; i++) void l.acquire('k').then((p) => { admitted++; p.release({ ok: true }) })
      await vi.advanceTimersByTimeAsync(0)
      expect(admitted).toBeLessThanOrEqual(10) // ten seconds' worth, never the whole burst
      await vi.advanceTimersByTimeAsync(30_000)
      expect(admitted).toBeGreaterThan(30)
      expect(admitted).toBeLessThan(60)
    } finally { vi.useRealTimers() }
  })

  it('when callers wait, the more urgent go first and equal ones keep their order', async () => {
    const l = new ProviderLimiter({ limits: () => ({ concurrency: 1 }) })
    const first = await l.acquire('k')
    const order: string[] = []
    const go = (name: string, prio: number) => void l.acquire('k', 0, undefined, prio).then((p) => { order.push(name); p.release({ ok: true }) })
    go('starter-1', 2); go('gold', 0); go('starter-2', 2); go('pro', 1)
    first.release({ ok: true })
    await tick(20)
    expect(order).toEqual(['gold', 'pro', 'starter-1', 'starter-2'])
  })

  it('a waiting call that is aborted leaves the line at once', async () => {
    const l = new ProviderLimiter({ limits: () => ({ concurrency: 1 }) })
    const first = await l.acquire('k')
    const ac = new AbortController()
    const waiting = l.acquire('k', 0, ac.signal)
    ac.abort(new Error('gone'))
    await expect(waiting).rejects.toThrow('gone')
    first.release({ ok: true })
    expect(l.stats('k').waiting).toBe(0)
  })

  it('retries are a small share of the calls: a storm is cut off, a blip is not', () => {
    const l = new ProviderLimiter({})
    for (let i = 0; i < 100; i++) void l.acquire('k').then((p) => p.release({ ok: true }))
    return tick().then(() => {
      let allowed = 0
      for (let i = 0; i < 100; i++) if (l.retryAllowed('k')) allowed++
      expect(allowed).toBeGreaterThanOrEqual(20)
      expect(allowed).toBeLessThanOrEqual(30)
    })
  })

  it('a model that does not exist is taken out of use for a while', () => {
    let t = 0
    const l = new ProviderLimiter({ now: () => t })
    l.pause('k', 600_000)
    expect(l.pausedFor('k')).toBe(600_000)
    t = 601_000
    expect(l.pausedFor('k')).toBe(0)
  })

  it('limits are read by "provider:model", then "provider:*", then "*"', () => {
    const f = limitsFromMap({ 'vertex:a': { rpm: 1 }, 'vertex:*': { rpm: 2 }, '*': { rpm: 3 } })
    expect([f('vertex:a'), f('vertex:b'), f('openrouter:x')]).toEqual([{ rpm: 1 }, { rpm: 2 }, { rpm: 3 }])
  })
})

describe('AIGateway with the limiter', () => {
  const def = (provider: string, model: string): ModelDefinition => ({ id: `${provider}:${model}`, provider, model, tier: 'fast', accessTier: 'starter', capabilities: ['text', 'json'], pricing: { inputPerMTokUsd: 0, outputPerMTokUsd: 0 } } as unknown as ModelDefinition)
  const schema = z.object({ ok: z.boolean() })
  const mk = (calls: string[], behaviour: (model: string, n: number) => Promise<string>): AIProvider => {
    const n: Record<string, number> = {}
    return { id: 'p', generateText: async (r: TextRequest) => { calls.push(r.model); n[r.model] = (n[r.model] ?? 0) + 1; return { text: await behaviour(r.model, n[r.model]!), usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 1, reasoningTokens: 0, imageCount: 0 } } } } as unknown as AIProvider
  }
  const registryOf = (a: ModelDefinition, b: ModelDefinition) => ({ chain: () => [a, b], chainFor: () => [a, b], get: () => a, imageChainFor: () => [] }) as unknown as ModelRegistry

  it('a model that keeps answering 429 is paused: later calls go to the other model at once instead of waiting on it or hammering it', async () => {
    const a = def('pa', 'm1'), b = def('pb', 'm2')
    const calls: string[] = []
    const limiter = new ProviderLimiter({ limits: () => ({ concurrency: 4 }) })
    const rate = new ProviderError('slow down', 'rate_limited', true, 429, 60_000)
    const gw = new AIGateway({
      providers: { pa: { ...mk(calls, async () => { throw rate }), id: 'pa' }, pb: { ...mk(calls, async () => '{"ok":true}'), id: 'pb' } } as never,
      registry: registryOf(a, b), recordUsage: async () => {}, limiter, retriesPerModel: 2, sleep: async () => {},
    })
    const run = () => gw.run({ route: 'fast', requestType: 'prompt_analysis', system: 's', prompt: 'p', schema })
    for (let i = 0; i < 4; i++) expect(await run()).toEqual({ ok: true }) // m1 refuses every time, m2 answers
    expect(limiter.pausedFor('pa:m1')).toBeGreaterThan(50_000) // enough refusals in a row: the key is out of capacity
    const asked = calls.filter((c) => c === 'm1').length
    for (let i = 0; i < 5; i++) expect(await run()).toEqual({ ok: true })
    expect(calls.filter((c) => c === 'm1').length).toBe(asked) // not asked again while paused
  })

  it('without a 429 the gateway behaves as before (one call, one model)', async () => {
    const a = def('pa', 'm1'), b = def('pb', 'm2')
    const calls: string[] = []
    const gw = new AIGateway({ providers: { pa: { ...mk(calls, async () => '{"ok":true}'), id: 'pa' } } as never, registry: registryOf(a, b), recordUsage: async () => {}, limiter: new ProviderLimiter({}) })
    expect(await gw.run({ route: 'fast', requestType: 'prompt_analysis', system: 's', prompt: 'p', schema })).toEqual({ ok: true })
    expect(calls).toEqual(['m1'])
  })
})
