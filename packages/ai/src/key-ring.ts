import { ProviderError, type AIProvider, type ImageRequest, type ImageResponse, type TextRequest, type TextResponse } from './types'

/**
 * SEVERAL KEYS of one provider, in a fixed order (local and QA testing: the owner's free Gemini keys LOCAL → QA → QA2 → QA3 → QA4).
 * Every call starts at the first key that is not resting for that model. When Google refuses a key's quota (429), that key rests for that model
 * and the SAME call goes straight on to the next key:
 *  - a daily cap rests the key until Google says it resets (`exhaustedForMs`, read from the error by gemini.ts);
 *  - a per-minute cap rests it for the wait Google asks for (Retry-After), else one minute;
 *  - a key Google does not accept (401/403, "API key not valid") rests for an hour, so one bad line in .env does not stop the others.
 * Any other error (a timeout, a bad answer, a blocked prompt) is the model's, not the key's: it goes back to the gateway unchanged.
 * When every key is resting for that model, the gateway gets one 429 that says how long until the first key is back, so it moves to its next model
 * (or waits) exactly as it does with a single key. Key VALUES never appear in a message or a log: only their names.
 */
export interface RingKey { name: string; provider: AIProvider }
export interface KeyRingOptions {
  now?: () => number
  /** a key started resting for a model (for the server log: names only) */
  onRest?: (key: string, model: string, forMs: number, why: string, next: string | null) => void
}

const MINUTE = 60_000
const BAD_KEY_MS = 60 * MINUTE

/** how long a key must rest after this error, or null when the error is not about the key */
export function restFor(e: unknown): { ms: number; why: string } | null {
  if (!(e instanceof ProviderError)) return null
  if (e.status === 429) return e.exhaustedForMs ? { ms: e.exhaustedForMs, why: 'daily quota used up' } : { ms: Math.max(e.retryAfterMs ?? MINUTE, 5_000), why: 'per-minute limit' }
  if (e.status === 401 || e.status === 403 || (e.status === 400 && /api key not valid|API_KEY_INVALID/i.test(`${e.message} ${e.code}`))) return { ms: BAD_KEY_MS, why: 'key not accepted' }
  return null
}

export class KeyRingProvider implements AIProvider {
  readonly id: string
  private readonly resting = new Map<string, number>()
  private readonly now: () => number

  constructor(private readonly keys: RingKey[], private readonly o: KeyRingOptions = {}) {
    if (!keys.length) throw new Error('KeyRingProvider needs at least one key')
    this.id = keys[0]!.provider.id
    this.now = o.now ?? Date.now
  }

  /** the key names in order, and which are resting for a model now (for checks and tests) */
  status(model: string): { name: string; restingMs: number }[] {
    return this.keys.map((k) => ({ name: k.name, restingMs: Math.max(0, (this.resting.get(`${k.name}|${model}`) ?? 0) - this.now()) }))
  }

  generateText(req: TextRequest): Promise<TextResponse> {
    return this.each(req.model, (p) => p.generateText(req))
  }

  generateImage(req: ImageRequest): Promise<ImageResponse> {
    return this.each(req.model, (p) => {
      if (!p.generateImage) throw new ProviderError('this provider does not make pictures', 'unsupported', false)
      return p.generateImage(req)
    })
  }

  private async each<T>(model: string, call: (p: AIProvider) => Promise<T>): Promise<T> {
    let last: ProviderError | undefined
    for (const [i, k] of this.keys.entries()) {
      const slot = `${k.name}|${model}`
      if ((this.resting.get(slot) ?? 0) > this.now()) continue
      try {
        return await call(k.provider)
      } catch (e) {
        const rest = restFor(e)
        if (!rest) throw e
        this.resting.set(slot, this.now() + rest.ms)
        const next = this.keys.slice(i + 1).find((x) => (this.resting.get(`${x.name}|${model}`) ?? 0) <= this.now())
        this.o.onRest?.(k.name, model, rest.ms, rest.why, next?.name ?? null)
        last = e as ProviderError
      }
    }
    // every key is resting for this model: the gateway hears how long until the first one is back (a long wait = this model is used up for now)
    const soonest = Math.max(1_000, Math.min(...this.keys.map((k) => (this.resting.get(`${k.name}|${model}`) ?? 0) - this.now())))
    throw new ProviderError(
      `every key is resting for ${model} (${this.keys.length} keys)${last ? `: ${last.message}` : ''}`.slice(0, 300),
      last?.code ?? 'RESOURCE_EXHAUSTED', true, 429, soonest, soonest > 5 * MINUTE ? soonest : undefined,
    )
  }
}
