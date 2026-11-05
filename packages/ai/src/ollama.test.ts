import { describe, expect, it } from 'vitest'
import { OllamaProvider, ProviderError, type TextRequest } from './index'

const KEY = 'test-key-1234.abcdef'
const req = (o: Partial<TextRequest> = {}): TextRequest => ({ model: 'glm-5.3-flash', system: 'be brief', prompt: 'hello', json: true, ...o })
/** a fake network: records the request and answers with what the test says */
function net(answer: { status?: number; body?: unknown } | Error) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (answer instanceof Error) throw answer
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { calls, provider: new OllamaProvider({ apiKey: KEY, fetchImpl }) }
}
const failure = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ProviderError

describe('OllamaProvider', () => {
  it('sends one non-streaming chat request with the key as a Bearer header and the prompt as messages', async () => {
    const t = net({ body: { model: 'glm-5.3-flash', message: { content: '{"ok":true}' }, prompt_eval_count: 12, eval_count: 5 } })
    const r = await t.provider.generateText(req({ temperature: 0.2, maxOutputTokens: 300, thinkingBudget: 0 }))
    expect(t.calls[0]!.url).toBe('https://ollama.com/api/chat')
    expect((t.calls[0]!.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(t.calls[0]!.init.body as string)).toEqual({
      model: 'glm-5.3-flash', stream: false, format: 'json', think: false, options: { temperature: 0.2, num_predict: 300 },
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hello' }],
    })
    expect(r).toEqual({ text: '{"ok":true}', modelVersion: 'glm-5.3-flash', usage: { inputTokens: 12, cachedTokens: 0, outputTokens: 5, reasoningTokens: 0, imageCount: 0 } })
  })
  it('asks for JSON and for no hidden thinking only when told to, and honours another base address', async () => {
    const t = net({ body: { message: { content: 'hi' } } })
    await t.provider.generateText(req({ json: false }))
    expect(JSON.parse(t.calls[0]!.init.body as string)).not.toHaveProperty('format')
    expect(JSON.parse(t.calls[0]!.init.body as string)).not.toHaveProperty('think')
    const local = new OllamaProvider({ apiKey: KEY, baseUrl: 'http://localhost:11434/', fetchImpl: (async (u: string) => { expect(u).toBe('http://localhost:11434/api/chat'); return new Response('{"message":{"content":"x"}}') }) as unknown as typeof fetch })
    expect((await local.generateText(req())).text).toBe('x')
  })
  it('passes pictures as base64 to a vision model and refuses audio and video', async () => {
    const t = net({ body: { message: { content: 'a cat' } } })
    await t.provider.generateText(req({ images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2, 3]) }] }))
    expect(JSON.parse(t.calls[0]!.init.body as string).messages[1].images).toEqual(['AQID'])
    const e = await failure(t.provider.generateText(req({ media: [{ kind: 'audio', mimeType: 'audio/mpeg', data: 'AAAA' }] })))
    expect(e).toMatchObject({ code: 'unsupported', retryable: false })
  })
  it.each([
    [401, 'auth', false], [403, 'auth', false], [402, 'payment_required', false], [404, 'model_not_found', false],
    [429, 'rate_limited', true], [500, 'http_500', true], [503, 'http_503', true], [400, 'http_400', false],
  ])('HTTP %i becomes code "%s" (retryable: %s)', async (status, code, retryable) => {
    const e = await failure(net({ status, body: { error: 'nope' } }).provider.generateText(req()))
    expect(e).toBeInstanceOf(ProviderError)
    expect(e).toMatchObject({ code, retryable, status, message: 'nope' })
  })
  it('a dropped connection and a timeout are retryable; the key never appears in an error', async () => {
    expect(await failure(net(new Error(`connect failed for Bearer ${KEY}`)).provider.generateText(req()))).toMatchObject({ code: 'network', retryable: true, message: 'network error: connect failed for Bearer ***' })
    const timeout = Object.assign(new Error('x'), { name: 'TimeoutError' })
    expect(await failure(net(timeout).provider.generateText(req()))).toMatchObject({ code: 'timeout', retryable: true })
    const leaked = await failure(net({ status: 401, body: { error: `bad key ${KEY}` } }).provider.generateText(req()))
    expect(leaked.message).toBe('bad key ***')
  })
  it('an empty answer is an empty text (the gateway then rejects it as invalid JSON and repairs it)', async () => {
    expect((await net({ body: {} }).provider.generateText(req())).text).toBe('')
  })
})
