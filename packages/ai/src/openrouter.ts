import { base64ToBytes, imageToBase64, ProviderError, type AIProvider, type ImageRequest, type ImageResponse, type TextRequest, type TextResponse } from './types'

interface ORResponse {
  choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] }; finish_reason?: string }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  }
  model?: string
  error?: { code?: number | string; message?: string }
}

export interface OpenRouterOptions {
  apiKey: string
  baseUrl?: string
  /** shown on openrouter.ai rankings/usage pages; optional */
  appUrl?: string
  appName?: string
  fetchImpl?: typeof fetch
}

/**
 * OpenRouter (OpenAI-compatible chat completions). One key → hundreds of models; the model id is whatever the
 * catalog row says ("anthropic/claude-sonnet-4.6"). Asks OpenRouter to include usage accounting, so every call
 * carries real token counts AND the cost OpenRouter charged — recorded next to our own computed cost.
 */
export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter'
  private readonly o: Required<Pick<OpenRouterOptions, 'baseUrl'>> & OpenRouterOptions
  constructor(options: OpenRouterOptions) {
    this.o = { baseUrl: 'https://openrouter.ai/api/v1', ...options }
  }

  private scrub(s: string) {
    return s.split(this.o.apiKey).join('***')
  }

  async generateText(req: TextRequest): Promise<TextResponse> {
    const f = this.o.fetchImpl ?? fetch
    let res: Response
    try {
      res = await f(`${this.o.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.o.apiKey}`,
          ...(this.o.appUrl ? { 'HTTP-Referer': this.o.appUrl } : {}),
          ...(this.o.appName ? { 'X-Title': this.o.appName } : {}),
        },
        body: JSON.stringify({
          model: req.model,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.images?.length ? [...req.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${imageToBase64(i)}` } })), { type: 'text', text: req.prompt }] : req.prompt }],
          temperature: req.temperature ?? 0.7,
          ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
          usage: { include: true },
          // 0 = no hidden reasoning (billed as output). Models that always reason simply ignore it.
          ...(req.thinkingBudget === 0 ? { reasoning: { enabled: false } } : {}),
          // JSON is requested in the prompt and validated by the gateway; `response_format` isn't honoured by every model.
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      })
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
      throw new ProviderError(aborted ? 'request timed out' : this.scrub(`network error: ${(e as Error).message}`), aborted ? 'timeout' : 'network', true)
    }

    const body = (await res.json().catch(() => ({}))) as ORResponse
    if (!res.ok || body.error) {
      const status = res.status
      const retryable = status === 408 || status === 429 || status >= 500
      throw new ProviderError(this.scrub(body.error?.message ?? res.statusText).slice(0, 300), String(body.error?.code ?? `http_${status}`), retryable, status)
    }
    const text = body.choices?.[0]?.message?.content ?? ''
    const u = body.usage ?? {}
    return {
      text,
      modelVersion: body.model,
      reportedCostUsd: typeof u.cost === 'number' ? u.cost : undefined,
      usage: {
        inputTokens: u.prompt_tokens ?? 0,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        // OpenRouter's completion_tokens already includes reasoning tokens → split them out so we don't double count
        outputTokens: Math.max(0, (u.completion_tokens ?? 0) - (u.completion_tokens_details?.reasoning_tokens ?? 0)),
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
        imageCount: 0,
      },
    }
  }

  /**
   * Image generation through chat completions: `modalities: ['image','text']`; the picture comes back as a data URL in
   * `message.images[0].image_url.url`. (Unit-tested with fixtures; verify against a live key before relying on it.)
   */
  async generateImage(req: ImageRequest): Promise<ImageResponse> {
    const f = this.o.fetchImpl ?? fetch
    let res: Response
    try {
      res = await f(`${this.o.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.o.apiKey}`,
          ...(this.o.appUrl ? { 'HTTP-Referer': this.o.appUrl } : {}),
          ...(this.o.appName ? { 'X-Title': this.o.appName } : {}),
        },
        body: JSON.stringify({ model: req.model, messages: [{ role: 'user', content: req.prompt }], modalities: ['image', 'text'], image_config: { aspect_ratio: req.aspectRatio }, usage: { include: true } }),
        ...(req.signal ? { signal: req.signal } : {}),
      })
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
      throw new ProviderError(aborted ? 'request timed out' : this.scrub(`network error: ${(e as Error).message}`), aborted ? 'timeout' : 'network', true)
    }
    const body = (await res.json().catch(() => ({}))) as ORResponse
    if (!res.ok || body.error) {
      const status = res.status
      throw new ProviderError(this.scrub(body.error?.message ?? res.statusText).slice(0, 300), String(body.error?.code ?? `http_${status}`), status === 408 || status === 429 || status >= 500, status)
    }
    const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url
    const m = url?.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s)
    if (!m) throw new ProviderError(body.choices?.[0]?.finish_reason === 'content_filter' ? 'blocked: content_filter' : 'model returned no image', body.choices?.[0]?.finish_reason === 'content_filter' ? 'blocked' : 'no_image', false)
    const u = body.usage ?? {}
    return {
      bytes: base64ToBytes(m[2]!),
      mime: m[1]!,
      modelVersion: body.model,
      reportedCostUsd: typeof u.cost === 'number' ? u.cost : undefined,
      usage: { inputTokens: u.prompt_tokens ?? 0, cachedTokens: 0, outputTokens: u.completion_tokens ?? 0, reasoningTokens: 0, imageCount: 1 },
    }
  }
}
