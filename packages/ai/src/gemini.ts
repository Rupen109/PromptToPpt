import { base64ToBytes, imageToBase64, ProviderError, type AIProvider, type ImageRequest, type ImageResponse, type TextRequest, type TextResponse } from './types'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[]
  usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  modelVersion?: string
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

export interface GeminiBackend {
  /** ledger/provider id: 'gemini' (AI Studio) or 'vertex' (Vertex AI / Agent Platform) */
  id: string
  baseUrl: string
  /** AI Studio takes the key in a header; Vertex "express" keys only work as a query parameter */
  auth: 'header' | 'query'
}

export const AI_STUDIO: GeminiBackend = { id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', auth: 'header' }
/** Google Search grounding is billed per grounded prompt (about $35 per 1,000). Re-check on the Google pricing page before relying on margins. */
export const GEMINI_SEARCH_USD = 0.035

export const VERTEX: GeminiBackend = { id: 'vertex', baseUrl: 'https://aiplatform.googleapis.com/v1/publishers/google', auth: 'query' }

/** Google Gemini (AI Studio or Vertex). Direct REST — no SDK, so the response shape stays behind this file. Both backends speak the same request/response format. */
export class GeminiProvider implements AIProvider {
  readonly id: string
  private readonly backend: GeminiBackend
  constructor(
    private readonly apiKey: string,
    backend: GeminiBackend = AI_STUDIO,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.backend = backend
    this.id = backend.id
  }

  /** Keys can end up in URLs (Vertex): never let one reach logs, ledger rows or user-visible errors. */
  private scrub(s: string): string {
    return s.split(this.apiKey).join('***')
  }

  async generateText(req: TextRequest): Promise<TextResponse> {
    let res: Response
    try {
      const url = `${this.backend.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent${this.backend.auth === 'query' ? `?key=${encodeURIComponent(this.apiKey)}` : ''}`
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.backend.auth === 'header' ? { 'x-goog-api-key': this.apiKey } : {}) },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [...(req.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: imageToBase64(i) } })), { text: req.prompt }] }],
          ...(req.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
          generationConfig: {
            temperature: req.temperature ?? 0.7,
            ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
            ...(req.json && !req.webSearch ? { responseMimeType: 'application/json' } : {}),
            ...(req.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } } : {}),
          },
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      })
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
      throw new ProviderError(aborted ? 'request timed out' : this.scrub(`network error: ${(e as Error).message}`), aborted ? 'timeout' : 'network', true)
    }

    const body = (await res.json().catch(() => ({}))) as GeminiResponse
    if (!res.ok) {
      // Vertex answers a wrong path/model with an HTML 404 → body is {} → fall through to statusText
      const retryable = res.status === 429 || res.status >= 500
      // Never echo the key; Google's messages don't include it, but cap length defensively.
      throw new ProviderError(this.scrub(body.error?.message ?? res.statusText).slice(0, 300), body.error?.status ?? `http_${res.status}`, retryable, res.status)
    }
    if (body.promptFeedback?.blockReason) throw new ProviderError(`blocked: ${body.promptFeedback.blockReason}`, 'blocked', false)

    const parts = body.candidates?.[0]?.content?.parts ?? []
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
    const u = body.usageMetadata ?? {}
    const citations = req.webSearch
      ? [...new Map((body.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [[g.web.uri, { url: g.web.uri, title: (g.web.title ?? '').slice(0, 200) }] as const] : [])))].map(([, v]) => v)
      : undefined
    return {
      text,
      modelVersion: body.modelVersion,
      ...(req.webSearch ? { citations, extraCostUsd: GEMINI_SEARCH_USD } : {}),
      usage: {
        inputTokens: u.promptTokenCount ?? 0,
        cachedTokens: u.cachedContentTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        reasoningTokens: u.thoughtsTokenCount ?? 0,
        imageCount: 0,
      },
    }
  }

  /** Image models answer generateContent with an `inlineData` part (base64). Aspect ratio goes in generationConfig.imageConfig. */
  async generateImage(req: ImageRequest): Promise<ImageResponse> {
    let res: Response
    try {
      const url = `${this.backend.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent${this.backend.auth === 'query' ? `?key=${encodeURIComponent(this.apiKey)}` : ''}`
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.backend.auth === 'header' ? { 'x-goog-api-key': this.apiKey } : {}) },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: req.aspectRatio } },
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      })
    } catch (e) {
      const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
      throw new ProviderError(aborted ? 'request timed out' : this.scrub(`network error: ${(e as Error).message}`), aborted ? 'timeout' : 'network', true)
    }
    const body = (await res.json().catch(() => ({}))) as GeminiResponse
    if (!res.ok) throw new ProviderError(this.scrub(body.error?.message ?? res.statusText).slice(0, 300), body.error?.status ?? `http_${res.status}`, res.status === 429 || res.status >= 500, res.status)
    if (body.promptFeedback?.blockReason) throw new ProviderError(`blocked: ${body.promptFeedback.blockReason}`, 'blocked', false)
    const cand = body.candidates?.[0]
    const part = cand?.content?.parts?.find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) {
      // finishReason IMAGE_SAFETY / PROHIBITED_CONTENT / no image → not retryable (same prompt would fail again)
      throw new ProviderError(cand?.finishReason && cand.finishReason !== 'STOP' ? `blocked: ${cand.finishReason}` : 'model returned no image', cand?.finishReason && cand.finishReason !== 'STOP' ? 'blocked' : 'no_image', false)
    }
    const u = body.usageMetadata ?? {}
    return {
      bytes: base64ToBytes(part.inlineData.data),
      mime: part.inlineData.mimeType ?? 'image/png',
      modelVersion: body.modelVersion,
      usage: { inputTokens: u.promptTokenCount ?? 0, cachedTokens: 0, outputTokens: u.candidatesTokenCount ?? 0, reasoningTokens: 0, imageCount: 1 },
    }
  }
}
