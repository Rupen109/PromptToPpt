import { ProviderError, retryAfterMs, imageToBase64, type AIProvider, type TextRequest, type TextResponse } from './types'

interface OllamaChatResponse {
  model?: string
  message?: { role?: string; content?: string; thinking?: string }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  /** Ollama reports errors as {"error": "message"} */
  error?: string
}

export interface OllamaOptions {
  /** the key goes in an `Authorization: Bearer` header (cloud requests need it; a local Ollama does not) */
  apiKey: string
  /** serve this model whatever the request names (a local Ollama has its own models) */
  modelOverride?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

/**
 * Ollama (https://ollama.com/api/chat, non-streaming). Used for LOAD TESTS and key-less experiments with open models: the usage is covered by the
 * Ollama plan, so the catalogue rows for it are priced at 0 and the cost the ledger shows is not a real bill. Production serves the catalogue from OpenRouter.
 * Text only (an image can be passed to a vision model); audio and video are refused.
 */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama'
  private readonly o: Required<Pick<OllamaOptions, 'baseUrl'>> & OllamaOptions
  constructor(options: OllamaOptions) {
    this.o = { baseUrl: 'https://ollama.com', ...options }
  }

  /** the key must never reach a log or an error message */
  private scrub(s: string) {
    return this.o.apiKey ? s.split(this.o.apiKey).join('***') : s
  }

  async generateText(req: TextRequest): Promise<TextResponse> {
    if (req.media?.length) throw new ProviderError('audio and video are not supported by this provider', 'unsupported', false)
    const f = this.o.fetchImpl ?? fetch
    let res: Response
    try {
      res = await f(`${this.o.baseUrl.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.o.apiKey ? { Authorization: `Bearer ${this.o.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.o.modelOverride ?? req.model,
          stream: false,
          // the gateway validates the JSON itself; this keeps the model from wrapping it in prose
          ...(req.json ? { format: 'json' } : {}),
          // 0 = no hidden reasoning (a reasoning model would otherwise spend most of its time thinking)
          ...(req.thinkingBudget === 0 ? { think: false } : {}),
          options: { temperature: req.temperature ?? 0.7, ...(req.maxOutputTokens ? { num_predict: req.maxOutputTokens } : {}) },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt, ...(req.images?.length ? { images: req.images.map((i) => imageToBase64(i)) } : {}) },
          ],
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      })
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
      throw new ProviderError(aborted ? 'request timed out' : this.scrub(`network error: ${(e as Error).message}`), aborted ? 'timeout' : 'network', true)
    }

    const body = (await res.json().catch(() => ({}))) as OllamaChatResponse
    if (!res.ok || body.error) {
      const status = res.status
      // 401/403 the key is wrong or missing · 402 usage credits are needed · 404 the model name is wrong · 429 the usage limit was reached (retry later)
      const code = status === 401 || status === 403 ? 'auth' : status === 402 ? 'payment_required' : status === 404 ? 'model_not_found' : status === 429 ? 'rate_limited' : `http_${status}`
      throw new ProviderError(this.scrub(body.error ?? res.statusText).slice(0, 300), code, status === 408 || status === 429 || status >= 500, status, retryAfterMs(res))
    }
    return {
      text: body.message?.content ?? '',
      modelVersion: body.model,
      usage: { inputTokens: body.prompt_eval_count ?? 0, cachedTokens: 0, outputTokens: body.eval_count ?? 0, reasoningTokens: 0, imageCount: 0 },
    }
  }
}
