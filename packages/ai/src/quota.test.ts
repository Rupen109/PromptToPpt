import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AIGateway, exhaustedFor, GeminiProvider, MockProvider, ModelRegistry, ProviderError, ProviderLimiter, type ModelDefinition } from './index'

/**
 * A used-up DAILY quota (the Gemini free tier used by local dev and QA: about 20 calls a day on 3.6 Flash, 500 on 3.1 Flash-Lite; a model the key's tier may not use at all
 * answers the same way with limit 0). Asking again in seconds cannot help, so the model is passed over until Google's reset time and the next model answers.
 */
const dailyBody = (retryDelay?: string) => ({
  error: {
    code: 429, status: 'RESOURCE_EXHAUSTED',
    message: 'You exceeded your current quota ... Generate content requests per day limit exceeded on Free Tier.',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }, { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
      ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
    ],
  },
})
const minuteBody = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'per minute', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } }

describe('reading a used-up daily quota from Google', () => {
  it('a per-day quota: passed over for the time Google gives (capped at 6 hours), else an hour', () => {
    expect(exhaustedFor(dailyBody('1800s').error)).toBe(1_800_000)
    expect(exhaustedFor(dailyBody('75110.5s').error)).toBe(6 * 3_600_000)
    expect(exhaustedFor(dailyBody().error)).toBe(3_600_000)
  })
  it('a per-minute 429 is a busy moment, not a used-up day', () => {
    expect(exhaustedFor(minuteBody.error)).toBeUndefined()
    expect(exhaustedFor(undefined)).toBeUndefined()
  })
  it('the Gemini provider puts it on the error (text and pictures)', async () => {
    const p = new GeminiProvider('KEY', undefined, (async () => new Response(JSON.stringify(dailyBody('600s')), { status: 429 })) as never)
    const e = await p.generateText({ model: 'gemini-3.6-flash', system: 's', prompt: 'p' }).catch((x) => x)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e.exhaustedForMs).toBe(600_000)
    const img = await p.generateImage!({ model: 'gemini-3.1-flash-lite-image', prompt: 'p', aspectRatio: '16:9' }).catch((x) => x)
    expect(img.exhaustedForMs).toBe(600_000)
    const busy = new GeminiProvider('KEY', undefined, (async () => new Response(JSON.stringify(minuteBody), { status: 429 })) as never)
    expect((await busy.generateText({ model: 'm', system: 's', prompt: 'p' }).catch((x) => x)).exhaustedForMs).toBeUndefined()
  })
})

describe('the gateway passes a used-up model over', () => {
  const def = (model: string): ModelDefinition => ({
    id: `vertex:${model}`, provider: 'vertex', model, tier: 'quality', accessTier: 'starter',
    capabilities: { text: true, vision: false, structuredOutput: true, toolUse: false, imageGeneration: false, contextWindow: 1 },
    pricing: { inputPerMTokUsd: 0, outputPerMTokUsd: 0, sourceUrl: 'x', verifiedOn: 'x' },
  })
  const schema = z.object({ ok: z.boolean() })

  it('no retry on the used-up model, the next one answers, and later calls go to the next one first (no knocking every time)', async () => {
    const asked: string[] = []
    const gemini = new MockProvider((r) => {
      asked.push(r.model)
      if (r.model === 'gemini-3.6-flash') throw new ProviderError('per day limit exceeded', 'RESOURCE_EXHAUSTED', true, 429, undefined, 3_600_000)
      return '{"ok":true}'
    })
    const gw = new AIGateway({
      providers: { vertex: gemini }, limiter: new ProviderLimiter(), sleep: async () => { throw new Error('must not wait') }, recordUsage: async () => {},
      registry: new ModelRegistry([def('gemini-3.6-flash'), def('gemini-3.1-flash-lite')], { chains: { fast: [], quality: ['vertex:gemini-3.6-flash', 'vertex:gemini-3.1-flash-lite'] } }),
    })
    const run = () => gw.run({ route: 'quality', requestType: 'slide_content', system: 's', prompt: 'p', schema })
    await expect(run()).resolves.toEqual({ ok: true })
    expect(asked).toEqual(['gemini-3.6-flash', 'gemini-3.1-flash-lite'])
    await run(); await run()
    expect(asked.filter((m) => m === 'gemini-3.6-flash')).toHaveLength(1)
  })

  it('when the only model is used up, the call fails at once with the reason instead of waiting for hours', async () => {
    const gemini = new MockProvider(() => { throw new ProviderError('per day limit exceeded', 'RESOURCE_EXHAUSTED', true, 429, undefined, 3_600_000) })
    const gw = new AIGateway({
      providers: { vertex: gemini }, limiter: new ProviderLimiter(), sleep: async () => { throw new Error('must not wait') }, recordUsage: async () => {},
      registry: new ModelRegistry([def('gemini-3.6-flash')], { chains: { fast: [], quality: ['vertex:gemini-3.6-flash'] } }),
    })
    const e = await gw.run({ route: 'quality', requestType: 'slide_content', system: 's', prompt: 'p', schema }).catch((x) => x)
    expect(e.message).toMatch(/all models failed/)
    expect(String(e.causes)).toMatch(/per day limit/)
    expect(gemini.calls).toHaveLength(1)
  })
})
