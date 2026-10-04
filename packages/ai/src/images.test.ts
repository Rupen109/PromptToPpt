import { describe, expect, it } from 'vitest'
import { AIGateway, AIUnavailableError, GeminiProvider, MockProvider, ModelRegistry, OpenRouterProvider, ProviderError, VERTEX, type ModelDefinition, type UsageRecord } from './index'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const imgModel = (id: string, access: 'starter' | 'premium', perImageUsd = 0.05): ModelDefinition => ({
  id, provider: 'gemini', model: id, tier: 'image', accessTier: access,
  capabilities: { text: false, vision: false, structuredOutput: false, toolUse: false, imageGeneration: true, contextWindow: 1 },
  pricing: { inputPerMTokUsd: 5, outputPerMTokUsd: 30, perImageUsd, sourceUrl: 'x', verifiedOn: 'x' },
})
const gwWith = (respond: ConstructorParameters<typeof MockProvider>[1], models = [imgModel('img-a', 'premium'), imgModel('img-b', 'premium'), imgModel('img-c', 'starter')]) => {
  const provider = new MockProvider(() => '{}', respond)
  const ledger: UsageRecord[] = []
  const gw = new AIGateway({ providers: { gemini: provider }, registry: new ModelRegistry(models), recordUsage: async (r) => void ledger.push(r), sleep: async () => {}, retriesPerModel: 1 })
  return { provider, ledger, gw }
}
const req = { model: 'img-a', prompt: 'a red car', aspectRatio: '16:9' as const, ctx: { userId: 'u1' } }

describe('GeminiProvider.generateImage', () => {
  const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it('asks for IMAGE output with the aspect ratio and decodes inlineData', async () => {
    let sent: any
    const p = new GeminiProvider('SECRET-KEY', VERTEX, (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string), headers: init.headers }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64(PNG) } }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1290 } }))
    }) as unknown as typeof fetch)
    const r = await p.generateImage!({ model: 'gemini-3.1-flash-image', prompt: 'x', aspectRatio: '4:3' })
    expect(sent.body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } })
    expect(sent.url).toContain('?key=SECRET-KEY')
    expect([...r.bytes]).toEqual([...PNG])
    expect(r).toMatchObject({ mime: 'image/png', usage: { imageCount: 1, outputTokens: 1290 } })
  })
  it('safety refusals are NOT retryable and are labelled blocked; empty answers are no_image', async () => {
    const blocked = new GeminiProvider('k', undefined, ok({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }))
    await expect(blocked.generateImage!({ model: 'm', prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'blocked', retryable: false })
    const promptBlocked = new GeminiProvider('k', undefined, ok({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }))
    await expect(promptBlocked.generateImage!({ model: 'm', prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'blocked' })
    const none = new GeminiProvider('k', undefined, ok({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'sorry' }] } }] }))
    await expect(none.generateImage!({ model: 'm', prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'no_image' })
  })
  it('never leaks the key in errors; 429/5xx are retryable', async () => {
    const p = new GeminiProvider('SECRET-KEY', VERTEX, ok({ error: { message: 'bad SECRET-KEY', status: 'RESOURCE_EXHAUSTED' } }, 429))
    const e = (await p.generateImage!({ model: 'm', prompt: 'x', aspectRatio: '1:1' }).catch((x) => x)) as ProviderError
    expect(e.retryable).toBe(true)
    expect(e.message).not.toContain('SECRET-KEY')
  })
})

describe('OpenRouterProvider.generateImage', () => {
  it('requests image modality and decodes the data URL, keeping the provider-reported cost', async () => {
    let sent: any
    const p = new OpenRouterProvider({ apiKey: 'k', fetchImpl: (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string)
      return new Response(JSON.stringify({ model: 'google/x', choices: [{ message: { images: [{ image_url: { url: `data:image/jpeg;base64,${b64(PNG)}` } }] } }], usage: { prompt_tokens: 5, completion_tokens: 1290, cost: 0.039 } }))
    }) as unknown as typeof fetch })
    const r = await p.generateImage!({ model: 'google/x', prompt: 'x', aspectRatio: '16:9' })
    expect(sent).toMatchObject({ modalities: ['image', 'text'], image_config: { aspect_ratio: '16:9' } })
    expect(r).toMatchObject({ mime: 'image/jpeg', reportedCostUsd: 0.039, usage: { imageCount: 1 } })
    expect([...r.bytes]).toEqual([...PNG])
  })
  it('content_filter → blocked', async () => {
    const p = new OpenRouterProvider({ apiKey: 'k', fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: {} }] }))) as unknown as typeof fetch })
    await expect(p.generateImage!({ model: 'm', prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'blocked' })
  })
})

describe('AIGateway.image', () => {
  it('writes one ledger row with the PER-IMAGE cost only (tokens are recorded but not priced twice)', async () => {
    const { gw, ledger } = gwWith(() => ({ bytes: PNG, mime: 'image/png' }))
    const r = await gw.image(req)
    expect(r.providerCostUsd).toBeCloseTo(0.05, 8)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ requestType: 'image_generation', model: 'img-a', status: 'success', userId: 'u1', providerCostUsd: 0.05, usage: { imageCount: 1 } })
    expect(ledger[0]!.usage.outputTokens).toBe(1290)
  })

  it('transient failures retry, then fall back to another model of the SAME tier only; every attempt is in the ledger', async () => {
    const { gw, ledger } = gwWith((r) => {
      if (r.model === 'img-a') throw new ProviderError('overloaded', 'http_503', true, 503)
      return { bytes: PNG, mime: 'image/png' }
    })
    const r = await gw.image(req)
    expect(r.model.id).toBe('img-b') // never the cheaper starter model img-c
    expect(ledger.map((l) => `${l.model}:${l.status}`)).toEqual(['img-a:error', 'img-a:error', 'img-b:success'])
  })

  it('a refused prompt is surfaced immediately (no retry, no fallback)', async () => {
    const { gw, ledger, provider } = gwWith(() => { throw new ProviderError('blocked: IMAGE_SAFETY', 'blocked', false) })
    await expect(gw.image(req)).rejects.toMatchObject({ code: 'blocked' })
    expect(provider.imageCalls).toHaveLength(1)
    expect(ledger).toHaveLength(1)
  })

  it('rejects non-image types and oversize output', async () => {
    await expect(gwWith(() => ({ bytes: PNG, mime: 'image/svg+xml' })).gw.image(req)).rejects.toBeInstanceOf(AIUnavailableError)
    await expect(gwWith(() => ({ bytes: new Uint8Array(9 * 1024 * 1024), mime: 'image/png' })).gw.image(req)).rejects.toBeInstanceOf(AIUnavailableError)
  })

  it('unknown / text models cannot be used for images', async () => {
    await expect(gwWith(() => ({ bytes: PNG, mime: 'image/png' })).gw.image({ ...req, model: 'ghost' })).rejects.toBeInstanceOf(AIUnavailableError)
  })
})
