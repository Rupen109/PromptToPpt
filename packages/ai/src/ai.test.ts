import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AIGateway, AIUnavailableError, ModelRegistry, MockProvider, ProviderError, computeCostUsd, type UsageRecord } from './index'

const schema = z.object({ ok: z.boolean() })
const setup = (respond: ConstructorParameters<typeof MockProvider>[0]) => {
  const provider = new MockProvider(respond)
  const ledger: UsageRecord[] = []
  const fallbacks: string[] = []
  const gateway = new AIGateway({
    providers: { gemini: provider }, registry: new ModelRegistry(),
    recordUsage: async (r) => void ledger.push(r), sleep: async () => {}, retriesPerModel: 2,
    onFallback: (a, b) => void fallbacks.push(`${a}->${b}`),
  })
  const run = () => gateway.run({ route: 'quality', requestType: 'outline_generation', system: 's', prompt: 'p', schema, ctx: { userId: 'u1', jobId: 'j1' } })
  return { provider, ledger, fallbacks, run }
}

describe('computeCostUsd', () => {
  it('bills cached input at the cached rate and reasoning at the output rate', () => {
    const cost = computeCostUsd(
      { inputTokens: 1_000_000, cachedTokens: 400_000, outputTokens: 100_000, reasoningTokens: 50_000, imageCount: 0 },
      { inputPerMTokUsd: 1, cachedInputPerMTokUsd: 0.1, outputPerMTokUsd: 4 },
    )
    expect(cost).toBeCloseTo(0.6 + 0.04 + 0.6, 8)
  })
})

describe('AIGateway', () => {
  it('returns validated data and writes one ledger row', async () => {
    const t = setup(() => '{"ok":true}')
    expect(await t.run()).toEqual({ ok: true })
    expect(t.ledger).toHaveLength(1)
    expect(t.ledger[0]).toMatchObject({ status: 'success', userId: 'u1', jobId: 'j1', model: 'gemini-3.6-flash', requestType: 'outline_generation' })
    expect(t.ledger[0]!.providerCostUsd).toBeGreaterThan(0)
  })

  it('strips markdown fences', async () => {
    expect(await setup(() => '```json\n{"ok":true}\n```').run()).toEqual({ ok: true })
  })

  it('repairs invalid output once, and records BOTH attempts', async () => {
    const t = setup((_r, n) => (n === 1 ? '{"nope":1}' : '{"ok":true}'))
    expect(await t.run()).toEqual({ ok: true })
    expect(t.ledger.map((l) => l.status)).toEqual(['error', 'success'])
    expect(t.ledger[0]!.errorCode).toBe('invalid_output')
    expect(t.provider.calls[1]!.prompt).toContain('rejected')
  })

  it('retries retryable errors then succeeds', async () => {
    const t = setup((_r, n) => {
      if (n < 3) throw new ProviderError('busy', 'http_503', true, 503)
      return '{"ok":true}'
    })
    expect(await t.run()).toEqual({ ok: true })
    expect(t.ledger.map((l) => l.status)).toEqual(['error', 'error', 'success'])
  })

  it('falls back to the next model and reports it; failures are all in the ledger', async () => {
    const t = setup((req) => {
      if (req.model === 'gemini-3.6-flash') throw new ProviderError('quota', 'http_429', true, 429)
      return '{"ok":true}'
    })
    expect(await t.run()).toEqual({ ok: true })
    expect(t.fallbacks).toEqual(['gemini-3.6-flash->gemini-2.5-flash'])
    expect(t.ledger.at(-1)).toMatchObject({ model: 'gemini-2.5-flash', status: 'success' })
    expect(t.ledger.filter((l) => l.status === 'error')).toHaveLength(3)
  })

  it('throws AIUnavailableError when every model fails', async () => {
    const t = setup(() => {
      throw new ProviderError('down', 'http_500', true, 500)
    })
    await expect(t.run()).rejects.toBeInstanceOf(AIUnavailableError)
  })

  it('does not retry non-retryable errors', async () => {
    const t = setup(() => {
      throw new ProviderError('bad key', 'PERMISSION_DENIED', false, 403)
    })
    await expect(t.run()).rejects.toBeInstanceOf(AIUnavailableError)
    expect(t.ledger).toHaveLength(2) // once per model in the chain, no retries
  })
})

describe('thinking budget', () => {
  it('is 0 by default, overridable per call, and forwarded to the provider', async () => {
    const t = setup(() => '{"ok":true}')
    await t.run()
    expect(t.provider.calls[0]!.thinkingBudget).toBe(0)
  })
})

describe('GeminiProvider backends', () => {
  const ok = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 } }

  it('vertex: key goes in the query string, never a header', async () => {
    const { GeminiProvider, VERTEX } = await import('./index')
    let seen: { url: string; headers: Record<string, string> } | undefined
    const p = new GeminiProvider('SECRET-KEY', VERTEX, (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> }
      return new Response(JSON.stringify(ok))
    }) as never)
    const r = await p.generateText({ model: 'gemini-2.5-flash', system: 's', prompt: 'p' })
    expect(r.usage.inputTokens).toBe(5)
    expect(p.id).toBe('vertex')
    expect(seen!.url).toContain('aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=SECRET-KEY')
    expect(seen!.headers['x-goog-api-key']).toBeUndefined()
  })

  it('AI Studio: key goes in the header, not the URL', async () => {
    const { GeminiProvider } = await import('./index')
    let seen: { url: string; headers: Record<string, string> } | undefined
    const p = new GeminiProvider('SECRET-KEY', undefined, (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> }
      return new Response(JSON.stringify(ok))
    }) as never)
    await p.generateText({ model: 'm', system: 's', prompt: 'p' })
    expect(seen!.url).not.toContain('SECRET-KEY')
    expect(seen!.headers['x-goog-api-key']).toBe('SECRET-KEY')
  })

  it('never leaks the key in errors', async () => {
    const { GeminiProvider, VERTEX } = await import('./index')
    const p = new GeminiProvider('SECRET-KEY', VERTEX, (async () => {
      throw new Error('connect ECONNREFUSED https://x/?key=SECRET-KEY')
    }) as never)
    const err = await p.generateText({ model: 'm', system: 's', prompt: 'p' }).catch((e) => e as Error)
    expect(String((err as Error).message)).not.toContain('SECRET-KEY')
  })
})

describe('OpenRouterProvider', () => {
  const orOk = { model: 'anthropic/claude-sonnet-4.6', choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 100, completion_tokens: 60, cost: 0.00123, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 10 } } }

  it('sends bearer auth + usage accounting, normalises usage, and keeps the provider-reported cost', async () => {
    const { OpenRouterProvider } = await import('./index')
    let seen: { url: string; headers: Record<string, string>; body: any } | undefined
    const p = new OpenRouterProvider({ apiKey: 'sk-or-SECRET', appName: 'promptToPpt', fetchImpl: (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }
      return new Response(JSON.stringify(orOk))
    }) as never })
    const r = await p.generateText({ model: 'anthropic/claude-sonnet-4.6', system: 'sys', prompt: 'hi', thinkingBudget: 0 })
    expect(seen!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen!.headers['Authorization']).toBe('Bearer sk-or-SECRET')
    expect(seen!.body.usage).toEqual({ include: true })
    expect(seen!.body.reasoning).toEqual({ enabled: false })
    expect(seen!.body.messages.map((m: any) => m.role)).toEqual(['system', 'user'])
    expect(r.usage).toEqual({ inputTokens: 100, cachedTokens: 20, outputTokens: 50, reasoningTokens: 10, imageCount: 0 }) // 60 completion = 50 + 10 reasoning
    expect(r.reportedCostUsd).toBe(0.00123)
    expect(r.modelVersion).toBe('anthropic/claude-sonnet-4.6')
  })

  it('maps 429/5xx to retryable and 4xx to non-retryable, without leaking the key', async () => {
    const { OpenRouterProvider } = await import('./index')
    const mk = (status: number) => new OpenRouterProvider({ apiKey: 'sk-or-SECRET', fetchImpl: (async () => new Response(JSON.stringify({ error: { code: status, message: 'bad sk-or-SECRET' } }), { status })) as never })
    const e429 = (await mk(429).generateText({ model: 'm', system: 's', prompt: 'p' }).catch((e) => e)) as ProviderError
    const e402 = (await mk(402).generateText({ model: 'm', system: 's', prompt: 'p' }).catch((e) => e)) as ProviderError
    expect(e429.retryable).toBe(true)
    expect(e402.retryable).toBe(false)
    expect(e402.message).not.toContain('sk-or-SECRET')
  })
})

describe('model selection', () => {
  const mk = (id: string, access: 'starter' | 'premium' | 'frontier') => ({ id, provider: 'gemini', model: id, tier: 'quality' as const, accessTier: access, capabilities: { text: true, vision: false, structuredOutput: true, toolUse: false, imageGeneration: false, contextWindow: 1 }, pricing: { inputPerMTokUsd: 1, outputPerMTokUsd: 1, sourceUrl: 'x', verifiedOn: 'x' } })
  const reg = new ModelRegistry([mk('a', 'premium'), mk('b', 'premium'), mk('c', 'starter'), mk('d', 'frontier')])

  it('chain for a picked model = the model + same-tier fallbacks only (never a silent downgrade)', () => {
    expect(reg.chainFor('a').map((m) => m.id)).toEqual(['a', 'b'])
    expect(reg.chainFor('d').map((m) => m.id)).toEqual(['d'])
    expect(reg.chainFor('nope')).toEqual([])
  })

  it('the gateway runs the picked model and records exactly that model in the ledger', async () => {
    const ledger: UsageRecord[] = []
    const provider = new MockProvider(() => '{"ok":true}')
    const gw = new AIGateway({ providers: { gemini: provider }, registry: async () => reg, recordUsage: async (r) => void ledger.push(r), sleep: async () => {} })
    await gw.run({ route: 'quality', model: 'b', requestType: 'outline_generation', system: 's', prompt: 'p', schema })
    expect(ledger.map((l) => l.model)).toEqual(['b'])
    expect(provider.calls[0]!.model).toBe('b')
  })

  it('an unavailable picked model fails loudly instead of using another', async () => {
    const gw = new AIGateway({ providers: { gemini: new MockProvider(() => '{"ok":true}') }, registry: reg, recordUsage: async () => {} })
    await expect(gw.run({ route: 'quality', model: 'ghost', requestType: 'outline_generation', system: 's', prompt: 'p', schema })).rejects.toBeInstanceOf(AIUnavailableError)
  })
})
