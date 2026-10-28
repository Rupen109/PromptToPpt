import type { ZodType } from 'zod'
import { computeCostUsd } from './cost'
import type { ModelRegistry } from './registry'
import { IMAGE_MIMES, ProviderError, ZERO_USAGE, type AIProvider, type AIRequestType, type ImageAspect, type ImageInput, type ModelDefinition, type RouteClass, type Usage } from './types'

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
  schema: ZodType<T>
  ctx?: { userId?: string | undefined; presentationId?: string | undefined; jobId?: string | undefined }
  temperature?: number
  maxOutputTokens?: number
  thinkingBudget?: number
  signal?: AbortSignal
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
}

const stripFences = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

/**
 * The ONLY way application code talks to a model.
 *   route → model chain → (retry w/ backoff) → fallback → JSON parse + Zod validate (+1 repair attempt)
 * and a ledger row is written for every attempt, success or failure.
 */
export class AIGateway {
  constructor(private readonly o: GatewayOptions) {}

  async run<T>(input: RunInput<T>): Promise<T> {
    const registry = typeof this.o.registry === 'function' ? await this.o.registry() : this.o.registry
    const chain = input.model ? registry.chainFor(input.model) : registry.chain(input.route)
    if (chain.length === 0) throw new AIUnavailableError(input.model ? `model "${input.model}" is not available` : `no models configured for route "${input.route}"`, [])
    const causes: string[] = []

    for (const [i, def] of chain.entries()) {
      const provider = this.o.providers[def.provider]
      if (!provider) {
        causes.push(`${def.model}: provider "${def.provider}" not configured`)
        continue
      }
      try {
        return await this.runOnModel(def, provider, input)
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
        const rec = (status: 'success' | 'error', code?: string) => this.record(def, { ...input, requestType: 'image_generation', system: '', prompt: input.prompt, route: 'quality', schema: undefined as never }, usage, modelVersion, started, status, code, reported)
        try {
          const res = await provider.generateImage({ model: def.model, prompt: input.prompt, aspectRatio: input.aspectRatio, signal })
          usage = res.usage
          modelVersion = res.modelVersion
          reported = res.reportedCostUsd
          if (!(IMAGE_MIMES as readonly string[]).includes(res.mime)) throw new ProviderError(`unsupported image type ${res.mime}`, 'bad_image', false)
          if (res.bytes.length === 0 || res.bytes.length > MAX_IMAGE_BYTES) throw new ProviderError(`image size out of range (${res.bytes.length} bytes)`, 'bad_image', false)
          await rec('success')
          return { bytes: res.bytes, mime: res.mime, model: def, providerCostUsd: computeCostUsd({ ...usage, inputTokens: 0, outputTokens: 0 }, def.pricing) }
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, 'unknown', false)
          await rec('error', err.code)
          if (input.signal?.aborted) throw e
          if (err.code === 'blocked') throw err // the prompt itself is refused: another model / retry won't help and we must tell the user
          if (err.retryable && attempt < retries) {
            await sleep(1000 * 2 ** attempt)
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

  private async runOnModel<T>(def: ModelDefinition, provider: AIProvider, input: RunInput<T>): Promise<T> {
    const retries = this.o.retriesPerModel ?? 2
    const sleep = this.o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    let prompt = input.prompt
    let repaired = false

    for (let attempt = 0; ; attempt++) {
      const started = Date.now()
      const signal = AbortSignal.any([AbortSignal.timeout(this.o.timeoutMs ?? 60_000), ...(input.signal ? [input.signal] : [])])
      let usage = ZERO_USAGE
      let modelVersion: string | undefined
      let reported: number | undefined
      try {
        const res = await provider.generateText({
          model: def.model, system: input.system, prompt, json: true, signal,
          ...(input.images?.length ? { images: input.images } : {}),
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          // never leave the output unbounded: a runaway or prompt-injected generation must have a ceiling (generous: these are JSON documents, not chat)
          maxOutputTokens: input.maxOutputTokens ?? MAX_OUTPUT_TOKENS_DEFAULT,
          thinkingBudget: input.thinkingBudget ?? this.o.defaultThinkingBudget ?? 0,
        })
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
        await this.record(def, input, usage, modelVersion, started, 'error', err.code, reported)

        // One repair pass: tell the model exactly what was wrong (output is still untrusted, still re-validated).
        if ((err.code === 'invalid_json' || err.code === 'invalid_output') && !repaired) {
          repaired = true
          prompt = `${input.prompt}\n\nYour previous reply was rejected: ${err.message}\nReply again with ONLY a valid JSON document that satisfies the requested shape.`
          continue
        }
        if (input.signal?.aborted) throw err // the caller gave up (a hedged duplicate that lost, a cancelled job): retrying an aborted call only logs more failures
        if (err.retryable && attempt < retries) {
          await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250))
          continue
        }
        throw err
      }
    }
  }

  private record(def: ModelDefinition, input: RunInput<unknown>, usage: Usage, modelVersion: string | undefined, started: number, status: 'success' | 'error', errorCode?: string, reportedCostUsd?: number) {
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
      // pictures are billed per image (token counts are kept for analytics but not priced, or they'd be counted twice)
      providerCostUsd: computeCostUsd(input.requestType === 'image_generation' ? { ...usage, inputTokens: 0, outputTokens: 0 } : usage, def.pricing),
      reportedCostUsd,
      pricing: def.pricing,
    })
  }
}
