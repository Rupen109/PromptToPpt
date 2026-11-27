import { describe, expect, it } from 'vitest'
import { KeyRingProvider, ProviderError, restFor, type AIProvider, type TextRequest } from './index'

const req = (model = 'gemini-3.6-flash'): TextRequest => ({ model, system: 's', prompt: 'p' })
const daily = () => new ProviderError('Quota exceeded for metric: requests per day', 'RESOURCE_EXHAUSTED', true, 429, undefined, 6 * 60 * 60_000)
const perMinute = () => new ProviderError('Resource exhausted', 'RESOURCE_EXHAUSTED', true, 429, 20_000)
/** a key that answers, or refuses with the error the test gives (per model), and counts its calls */
function key(name: string, refuse: (model: string) => ProviderError | null = () => null) {
  const calls: string[] = []
  const provider: AIProvider = { id: 'gemini', generateText: async (r) => { calls.push(r.model); const e = refuse(r.model); if (e) throw e; return { text: name, model: r.model, usage: { inputTokens: 1, outputTokens: 1 } } as never } }
  return { name, provider, calls }
}
const ring = (keys: ReturnType<typeof key>[], clock = { t: 0 }) => {
  const rests: string[] = []
  return { p: new KeyRingProvider(keys, { now: () => clock.t, onRest: (k, m, ms, why, next) => rests.push(`${k} ${m} ${why} -> ${next ?? 'none'}`) }), rests, clock }
}

describe('KeyRingProvider: the free keys in order, the next one when a quota is used up', () => {
  it('uses the FIRST key while it has quota', async () => {
    const [a, b] = [key('LOCAL'), key('QA')]
    const { p } = ring([a, b])
    expect((await p.generateText(req())).text).toBe('LOCAL')
    expect((await p.generateText(req())).text).toBe('LOCAL')
    expect(b.calls).toHaveLength(0)
  })
  it('a daily cap moves the SAME call to the next key, and the used-up key is not tried again until it resets', async () => {
    const [a, b, c] = [key('LOCAL', () => daily()), key('QA', () => daily()), key('QA2')]
    const { p, rests, clock } = ring([a, b, c])
    expect((await p.generateText(req())).text).toBe('QA2')
    expect(rests).toEqual(['LOCAL gemini-3.6-flash daily quota used up -> QA', 'QA gemini-3.6-flash daily quota used up -> QA2'])
    expect((await p.generateText(req())).text).toBe('QA2')
    expect([a.calls.length, b.calls.length]).toEqual([1, 1]) // not asked again while resting
    clock.t += 6 * 60 * 60_000 + 1 // Google's reset: back to the first key
    a.calls.length = 0
    const back = key('LOCAL'); const r2 = ring([back, c], clock)
    expect((await r2.p.generateText(req())).text).toBe('LOCAL')
  })
  it('a quota is per MODEL: Flash used up on a key does not stop Flash-Lite on it', async () => {
    const a = key('LOCAL', (m) => (m === 'gemini-3.6-flash' ? daily() : null)), b = key('QA')
    const { p } = ring([a, b])
    expect((await p.generateText(req('gemini-3.6-flash'))).text).toBe('QA')
    expect((await p.generateText(req('gemini-3.1-flash-lite'))).text).toBe('LOCAL')
  })
  it('a per-minute limit rests the key only for the wait Google asks for', async () => {
    const a = key('LOCAL', () => perMinute()), b = key('QA')
    const { p, clock } = ring([a, b])
    expect((await p.generateText(req())).text).toBe('QA')
    expect(p.status('gemini-3.6-flash')[0]).toEqual({ name: 'LOCAL', restingMs: 20_000 })
    clock.t += 20_001
    expect(p.status('gemini-3.6-flash')[0]!.restingMs).toBe(0)
  })
  it('a key Google does not accept is skipped (one bad line in .env does not stop the rest)', async () => {
    const a = key('LOCAL', () => new ProviderError('API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', false, 400)), b = key('QA')
    const { p, rests } = ring([a, b])
    expect((await p.generateText(req())).text).toBe('QA')
    expect(rests[0]).toMatch(/LOCAL .* key not accepted -> QA/)
  })
  it('an error that is not about the key (a timeout, an outage) goes back to the gateway unchanged and rests nothing', async () => {
    const outage = new ProviderError('The service is currently unavailable.', 'UNAVAILABLE', true, 503)
    const a = key('LOCAL', () => outage), b = key('QA')
    const { p } = ring([a, b])
    await expect(p.generateText(req())).rejects.toBe(outage)
    expect(b.calls).toHaveLength(0)
    expect(p.status('gemini-3.6-flash')[0]!.restingMs).toBe(0)
  })
  it('every key used up: ONE 429 that says when the first key is back, marked used-up when that is long (the gateway moves to its next model)', async () => {
    const { p } = ring([key('LOCAL', () => daily()), key('QA', () => daily())])
    const e = await p.generateText(req()).then(() => { throw new Error("expected a refusal") }, (x: unknown) => x as ProviderError)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e).toMatchObject({ status: 429, retryable: true })
    expect(e.exhaustedForMs).toBe(6 * 60 * 60_000)
    expect(e.message).toMatch(/every key is resting for gemini-3.6-flash \(2 keys\)/)
    const short = await ring([key('LOCAL', () => perMinute())]).p.generateText(req()).then(() => { throw new Error("expected a refusal") }, (x: unknown) => x as ProviderError)
    expect(short.exhaustedForMs).toBeUndefined() // a short wait: the gateway may simply wait for it
  })
  it('restFor reads only key problems', () => {
    expect(restFor(daily())).toMatchObject({ why: 'daily quota used up' })
    expect(restFor(new ProviderError('x', 'PERMISSION_DENIED', false, 403))).toMatchObject({ why: 'key not accepted' })
    expect(restFor(new ProviderError('bad json', 'invalid_output', false, 200))).toBeNull()
    expect(restFor(new Error('plain'))).toBeNull()
  })
})
