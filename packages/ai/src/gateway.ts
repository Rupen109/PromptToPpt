import type { ZodType } from 'zod'
import { computeCostUsd } from './cost'
import type { ProviderLimiter } from './limiter'
import type { ModelRegistry } from './registry'
import { IMAGE_MIMES, ProviderError, ZERO_USAGE, type AIProvider, type AIRequestType, type ImageAspect, type ImageInput, type MediaInput, type ModelDefinition, type RouteClass, type Usage } from './types'

export interface UsageRecord {
  userId?: string | undefined
  presentationId?: string | undefined
  jobId?: string | undefined
  provider: string
  model: string
  modelVersion?: string | undefined
  requestType: AIRequestType
  usage: Usage
  latencyMs: number
  status: 'success' | 'error'
  errorCode?: string | undefined
  /** why the attempt failed, in words (first 300 characters: validation paths and messages, provider error text; never the prompt or the answer). Lets any rejected answer be explained afterwards. */
  errorDetail?: string | undefined
  providerCostUsd: number
  /** the provider's own number, when it gives one */
  reportedCostUsd?: number | undefined
  pricing: ModelDefinition['pricing']
}

export interface GatewayOptions {
  providers: Record<string, AIProvider>
  /** a registry, or a (cached) loader — lets the model catalogue live in the database and change without a deploy */
  registry: ModelRegistry | (() => Promise<ModelRegistry>)
  /** MUST persist (spec §14: no model call is "complete" without a usage event). Awaited for every attempt. */
  recordUsage: (r: UsageRecord) => Promise<void>
  /** per-attempt timeout */
  timeoutMs?: number
  /** per-attempt timeout for picture generation (slower than text) */
  imageTimeoutMs?: number
  /**
   * Default hidden-thinking cap for every call. Our tasks are structured JSON generation where thinking added ~2x
   * latency and ~1.2k billed tokens per call for no visible quality gain (measured 2026-10-02), so default 0.
   */
  defaultThinkingBudget?: number
  /** retries per model on retryable errors before falling to the next model in the chain */
  retriesPerModel?: number
  sleep?: (ms: number) => Promise<void>
  /** waits each call's turn per provider and model, backs off on a 429 and caps retries; without one calls go straight out */
  limiter?: ProviderLimiter
  /** a model paused longer than this (after a 429) is tried after the ready ones instead of making the call wait (default 2 s) */
  skipPausedOverMs?: number
  /** how long one call keeps waiting its turn after rate-limit refusals before it gives up on this model (default 90 s) */
  rateLimitPatienceMs?: number
  /** called when a fallback model is used (feeds the "fallback rate" metric) */
  onFallback?: (from: string, to: string, reason: string) => void
}

export interface RunInput<T> {
  route: RouteClass
  /** a user-selected catalog model: overrides the route's chain (same-tier fallbacks only) */
  model?: string | undefined
  requestType: AIRequestType
  system: string
  prompt: string
  /** pictures for vision-capable models; passed through untouched */
  images?: ImageInput[]
  /** audio / video for models that can listen or watch (sent inline) */
  media?: MediaInput[]
  schema: ZodType<T>
  ctx?: { userId?: string | undefined; presentationId?: string | undefined; jobId?: string | undefined }
  temperature?: number
  maxOutputTokens?: number
  thinkingBudget?: number
  /** lower is served first when calls wait for a busy provider (0 = most urgent); the deck lines use their lane */
  priority?: number
  /** per-attempt time limit in ms (default: the gateway's own, 60 s); long recordings need more */
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SearchRunInput {
  route: RouteClass
  model?: string | undefined
  requestType: AIRequestType
  system: string
  prompt: string
  ctx?: { userId?: string | undefined; presentationId?: string | undefined; jobId?: string | undefined }
  maxOutputTokens?: number
  signal?: AbortSignal
}
export interface SearchResult {
  text: string
  citations: { url: string; title: string }[]
  /** the model that answered */
  model: ModelDefinition
}

export interface ImageRunInput {
  /** a catalog image model (user-picked); fallbacks stay within its access tier */
  model: string
  prompt: string
  aspectRatio: ImageAspect
  ctx?: { userId?: string | undefined; presentationId?: string | undefined; jobId?: string | undefined }
  signal?: AbortSignal
}
export interface ImageResult {
  bytes: Uint8Array
  mime: string
  /** the model that actually produced it (may be a same-tier fallback) */
  model: ModelDefinition
  providerCostUsd: number
}
/** a generated picture larger than this is refused (bandwidth + storage guard) */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Hard ceiling for any text generation that does not set its own. */
export const MAX_OUTPUT_TOKENS_DEFAULT = 16_000

export class AIUnavailableError extends Error {
  constructor(message: string, public readonly causes: string[]) {
    super(message)
  }

  /**
   * True when every model ANSWERED but none gave an answer that fits our rules (broken JSON, a field out of range). The provider was reachable:
   * telling the person "the AI is busy" would be false, so callers say what really happened.
   */
  get answersRejected(): boolean {
    return this.causes.length > 0 && this.causes.every((c) => /model output failed validation|model returned invalid JSON/.test(c))
  }
}

const stripFences = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

/**
 * The ONLY way application code talks to a model.
 *   route → model chain → (retry w/ backoff) → fallback → JSON parse + Zod validate (+1 repair attempt)
 * and a ledger row is written for every attempt, success or failure.
 */
/** The reason of a failed attempt for the usage log: short, and made only of validation paths / provider messages (never the prompt or the model's answer). */
const whyFailed = (e: { message?: string }): string => String(e.message ?? '').replace(/\s+/g, ' ').slice(0, 300)

const isRateLimit = (e: unknown) => e instanceof ProviderError && (e.status === 429 || e.code === 'rate_limited' || e.code === 'RESOURCE_EXHAUSTED')
const limitKey = (def: ModelDefinition) => `${def.provider}:${def.model}`
/** rough size of a call for the tokens-per-minute bucket: characters / 3.5 for the input plus the output we expect */
const estimateTokens = (chars: number, maxOut?: number) => Math.ceil(chars / 3.5) + Math.min(maxOut ?? 2000, 4000)

export class AIGateway {
  constructor(private readonly o: GatewayOptions) {}

  /** one provider call, taking its turn at the limiter; the outcome teaches the limiter (a 429 pauses the model and shrinks its share) */
  private async limited<R>(def: ModelDefinition, tokens: number, signal: AbortSignal | undefined, call: () => Promise<R>, priority = 0): Promise<R> {
    const lim = this.o.limiter
    if (!lim) return call()
    const permit = await lim.acquire(limitKey(def), tokens, signal, priority)
    try {
      const r = await call()
      permit.release({ ok: true })
      return r
    } catch (e) {
      // the provider says this model does not exist (closed to new accounts, retired): stop asking it for ten minutes, the other models answer meanwhile
      if (e instanceof ProviderError && (e.status === 404 || e.code === 'NOT_FOUND' || e.code === 'model_not_found')) lim.pause(limitKey(def), 10 * 60_000)
      permit.release({ ok: false, rateLimited: isRateLimit(e), ...(e instanceof ProviderError && e.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {}) })
      throw e
    }
  }

  /** ready models first, in their own order; a model paused for long (rate-limited) goes last, so the call is answered by another instead of waiting */
  private readyFirst(chain: ModelDefinition[]): ModelDefinition[] {
    const lim = this.o.limiter
    if (!lim) return chain
    const limit = this.o.skipPausedOverMs ?? 2000
    const paused = chain.filter((m) => lim.pausedFor(limitKey(m)) > limit)
    return paused.length === 0 || paused.length === chain.length ? chain : [...chain.filter((m) => !paused.includes(m)), ...paused]
  }

  /** a retry is allowed only while retries stay a small share of the calls; the pause after a 429 is the limiter's job, so no extra sleeping then */
  private canRetry(def: ModelDefinition, err: unknown, isLast = true): boolean {
    const lim = this.o.limiter
    if (!lim) return true
    // A refusal for rate limit cost nothing (the provider did no work) and the limiter is what slows the system down, so these calls are not counted against
    // the retry budget: they wait their turn again, up to `rateLimitPatienceMs` in all, instead of failing the whole deck for a busy moment.
    if (isRateLimit(err) && !(!isLast && lim.pausedFor(limitKey(def)) > (this.o.skipPausedOverMs ?? 2000))) return true
    // rate-limited for long and another model could answer: move on to it now instead of waiting here (the last model has nobody to hand over to, so it waits its turn)
    if (!isLast && isRateLimit(err) && lim.pausedFor(limitKey(def)) > (this.o.skipPausedOverMs ?? 2000)) return false
    return lim.retryAllowed(limitKey(def))
  }

  async run<T>(input: RunInput<T>): Promise<T> {
    const registry = typeof this.o.registry === 'function' ? await this.o.registry() : this.o.registry
    const chain = this.readyFirst(input.model ? registry.chainFor(input.model) : registry.chain(input.route))
    if (chain.length === 0) throw new AIUnavailableError(input.model ? `model "${input.model}" is not available` : `no models configured for route "${input.route}"`, [])
    const causes: string[] = []

    for (const [i, def] of chain.entries()) {
      const provider = this.o.providers[def.provider]
      if (!provider) {
        causes.push(`${def.model}: provider "${def.provider}" not configured`)
        continue
      }
      try {
        return await this.runOnModel(def, provider, input, i === chain.length - 1)
      } catch (e) {
        if (input.signal?.aborted) throw e
        const reason = e instanceof Error ? e.message : String(e)
        causes.push(`${def.model}: ${reason}`)
        const next = chain[i + 1]
        if (next) this.o.onFallback?.(def.model, next.model, reason)
      }
    }
    throw new AIUnavailableError('all models failed', causes)
  }

  /**
   * Picture generation: same discipline as text — model chain (same tier), retry on transient errors, a ledger row for
   * EVERY attempt (cost = per-image price, recorded even if the caller later discards the picture), output validated
   * (mime allow-list, size cap) before it is trusted.
   */
  async image(input: ImageRunInput): Promise<ImageResult> {
    const registry = typeof this.o.registry === 'function' ? await this.o.registry() : this.o.registry
    const chain = registry.imageChainFor(input.model)
    if (chain.length === 0) throw new AIUnavailableError(`image model "${input.model}" is not available`, [])
    const causes: string[] = []
    const retries = this.o.retriesPerModel ?? 1
    const sleep = this.o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    for (const [i, def] of chain.entries()) {
      const provider = this.o.providers[def.provider]
      if (!provider?.generateImage) {
        causes.push(`${def.model}: provider "${def.provider}" cannot generate images`)
        continue
      }
      for (let attempt = 0; ; attempt++) {
        const started = Date.now()
        const signal = AbortSignal.any([AbortSignal.timeout(this.o.imageTimeoutMs ?? 90_000), ...(input.signal ? [input.signal] : [])])
        let usage = ZERO_USAGE
        let modelVersion: string | undefined
        let reported: number | undefined
        const rec = (status: 'success' | 'error', code?: string, detail?: string) => this.record(def, { ...input, requestType: 'image_generation', system: '', prompt: input.prompt, route: 'quality', schema: undefined as never }, usage, modelVersion, started, status, code, reported, detail)
        try {
          const res = await this.limited(def, 0, signal, () => provider.generateImage!({ model: def.model, prompt: input.prompt, aspectRatio: input.aspectRatio, signal }))
          usage = res.usage
          modelVersion = res.modelVersion
          reported = res.reportedCostUsd
          if (!(IMAGE_MIMES as readonly string[]).includes(res.mime)) throw new ProviderError(`unsupported image type ${res.mime}`, 'bad_image', false)
          if (res.bytes.length === 0 || res.bytes.length > MAX_IMAGE_BYTES) throw new ProviderError(`image size out of range (${res.bytes.length} bytes)`, 'bad_image', false)
          await rec('success')
          return { bytes: res.bytes, mime: res.mime, model: def, providerCostUsd: computeCostUsd({ ...usage, inputTokens: 0, outputTokens: 0 }, def.pricing) }
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, 'unknown', false)
          await rec('error', err.code, whyFailed(err))
          if (input.signal?.aborted) throw e
          if (err.code === 'blocked') throw err // the prompt itself is refused: another model / retry won't help and we must tell the user
          if (err.retryable && attempt < retries && this.canRetry(def, err)) {
            await sleep(isRateLimit(err) ? (err.retryAfterMs ?? 1000 * 2 ** attempt) : 1000 * 2 ** attempt)
            continue
          }
          causes.push(`${def.model}: ${err.message}`)
          const next = chain[i + 1]
          if (next) this.o.onFallback?.(def.model, next.model, err.message)
          break
        }
      }
    }
    throw new AIUnavailableError('all image models failed', causes)
  }

  /**
   * A model answer grounded on live web search: free text plus the pages it used. Same discipline as `run` (model chain, ledger row for every
   * attempt including the search fee) but the reply is text, not JSON, because search tools cannot be combined with a JSON-only mode.
   * The text is UNTRUSTED web content: callers store it as a source and never act on instructions in it.
   */
  async search(input: SearchRunInput): Promise<SearchResult> {
    const registry = typeof this.o.registry === 'function' ? await this.o.registry() : this.o.registry
    const chain = input.model ? registry.chainFor(input.model) : registry.chain(input.route)
    if (chain.length === 0) throw new AIUnavailableError('no models configured for search', [])
    const causes: string[] = []
    for (const def of chain) {
      const provider = this.o.providers[def.provider]
      if (!provider) { causes.push(`${def.model}: provider "${def.provider}" not configured`); continue }
      const started = Date.now()
      const signal = AbortSignal.any([AbortSignal.timeout(this.o.timeoutMs ?? 60_000), ...(input.signal ? [input.signal] : [])])
      let usage = ZERO_USAGE
      let reported: number | undefined
      let extra = 0
      try {
        const res = await this.limited(def, estimateTokens(input.system.length + input.prompt.length, input.maxOutputTokens), signal, () => provider.generateText({ model: def.model, system: input.system, prompt: input.prompt, webSearch: true, signal, maxOutputTokens: input.maxOutputTokens ?? 4000, thinkingBudget: 0 }))
        usage = res.usage; reported = res.reportedCostUsd; extra = res.extraCostUsd ?? 0
        if (!res.text.trim()) throw new ProviderError('model returned no text', 'empty', false)
        await this.record(def, { ...input, schema: undefined as never }, usage, res.modelVersion, started, 'success', undefined, reported, undefined, extra)
        return { text: res.text, citations: res.citations ?? [], model: def }
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, 'unknown', false)
        await this.record(def, { ...input, schema: undefined as never }, usage, undefined, started, 'error', err.code, reported, whyFailed(err), extra)
        causes.push(`${def.model}: ${err.message}`)
        if (input.signal?.aborted) throw err
      }
    }
    throw new AIUnavailableError('all models failed', causes)
  }

  private async runOnModel<T>(def: ModelDefinition, provider: AIProvider, input: RunInput<T>, isLast = true): Promise<T> {
    const retries = this.o.retriesPerModel ?? 2
    const sleep = this.o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    let prompt = input.prompt
    let repaired = false
    let firstRateLimitAt: number | undefined

    for (let attempt = 0; ; attempt++) {
      const started = Date.now()
      const signal = AbortSignal.any([AbortSignal.timeout(input.timeoutMs ?? this.o.timeoutMs ?? 60_000), ...(input.signal ? [input.signal] : [])])
      let usage = ZERO_USAGE
      let modelVersion: string | undefined
      let reported: number | undefined
      try {
        const res = await this.limited(def, estimateTokens(input.system.length + prompt.length, input.maxOutputTokens), signal, () => provider.generateText({
          model: def.model, system: input.system, prompt, json: true, signal,
          ...(input.images?.length ? { images: input.images } : {}),
          ...(input.media?.length ? { media: input.media } : {}),
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          // never leave the output unbounded: a runaway or prompt-injected generation must have a ceiling (generous: these are JSON documents, not chat)
          maxOutputTokens: input.maxOutputTokens ?? MAX_OUTPUT_TOKENS_DEFAULT,
          thinkingBudget: input.thinkingBudget ?? this.o.defaultThinkingBudget ?? 0,
        }), input.priority ?? 0)
        usage = res.usage
        modelVersion = res.modelVersion
        reported = res.reportedCostUsd

        let parsed: unknown
        try {
          parsed = JSON.parse(stripFences(res.text))
        } catch {
          throw new ProviderError('model returned invalid JSON', 'invalid_json', false)
        }
        const checked = input.schema.safeParse(parsed)
        if (!checked.success) throw new ProviderError(`model output failed validation: ${checked.error.issues.slice(0, 4).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`, 'invalid_output', false)

        await this.record(def, input, usage, modelVersion, started, 'success', undefined, reported)
        return checked.data
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, 'unknown', false)
        await this.record(def, input, usage, modelVersion, started, 'error', err.code, reported, whyFailed(err))

        // One repair pass: tell the model exactly what was wrong (output is still untrusted, still re-validated).
        if ((err.code === 'invalid_json' || err.code === 'invalid_output') && !repaired) {
          repaired = true
          prompt = `${input.prompt}\n\nYour previous reply was rejected: ${err.message}\nReply again with ONLY a valid JSON document that satisfies the requested shape.`
          continue
        }
        if (input.signal?.aborted) throw err // the caller gave up (a hedged duplicate that lost, a cancelled job): retrying an aborted call only logs more failures
        if (this.o.limiter && isRateLimit(err)) firstRateLimitAt ??= Date.now()
        const patient = firstRateLimitAt !== undefined && Date.now() - firstRateLimitAt < (this.o.rateLimitPatienceMs ?? 90_000) && this.canRetry(def, err, isLast)
        if (err.retryable && (patient || (attempt < retries && this.canRetry(def, err, isLast)))) {
          // a refused call waits the time the provider asked (else the usual back-off, with jitter) before it takes its turn again; a model that is refusing most calls is paused by the limiter itself
          await sleep(Math.max(isRateLimit(err) ? (err.retryAfterMs ?? 0) : 0, Math.min(8000, 500 * 2 ** attempt)) + Math.floor(Math.random() * 250))
          continue
        }
        throw err
      }
    }
  }

  private record(def: ModelDefinition, input: RunInput<unknown>, usage: Usage, modelVersion: string | undefined, started: number, status: 'success' | 'error', errorCode?: string, reportedCostUsd?: number, errorDetail?: string, extraCostUsd = 0) {
    return this.o.recordUsage({
      ...input.ctx,
      provider: def.provider,
      model: def.model,
      modelVersion,
      requestType: input.requestType,
      usage,
      latencyMs: Date.now() - started,
      status,
      errorCode,
      ...(errorDetail ? { errorDetail } : {}),
      // pictures are billed per image (token counts are kept for analytics but not priced, or they'd be counted twice)
      providerCostUsd: computeCostUsd(input.requestType === 'image_generation' ? { ...usage, inputTokens: 0, outputTokens: 0 } : usage, def.pricing) + extraCostUsd,
      reportedCostUsd,
      pricing: def.pricing,
    })
  }
}
