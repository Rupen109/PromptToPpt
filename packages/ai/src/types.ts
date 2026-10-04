import type { AIRequestType } from '@prompttoppt/types'

export type { AIRequestType }

/** Normalised usage — identical shape regardless of provider (spec §14). */
export interface Usage {
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  imageCount: number
}
export const ZERO_USAGE: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, imageCount: 0 }

/** An input picture for vision-capable models. `data` is raw bytes or a base64 string. */
export interface ImageInput {
  mimeType: string
  data: Uint8Array | string
}

export interface TextRequest {
  model: string
  system: string
  prompt: string
  /** pictures the model should look at (providers without vision ignore them) */
  images?: ImageInput[]
  /** ask the model for a JSON document (we validate it ourselves; providers differ in schema support) */
  json?: boolean
  temperature?: number
  maxOutputTokens?: number
  /** cap on hidden "thinking" tokens (billed as output). 0 disables thinking. Omit to let the model decide. */
  thinkingBudget?: number
  signal?: AbortSignal
}

export interface TextResponse {
  text: string
  usage: Usage
  /** cost the provider itself reported (OpenRouter returns it). Stored beside OUR computed cost for reconciliation. */
  reportedCostUsd?: number | undefined
  /** provider-reported concrete version, when different from the requested alias */
  modelVersion?: string | undefined
}

export type ImageAspect = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

export interface ImageRequest {
  model: string
  prompt: string
  aspectRatio: ImageAspect
  signal?: AbortSignal
}

export interface ImageResponse {
  bytes: Uint8Array
  /** image/png | image/jpeg | image/webp — anything else is rejected by the gateway */
  mime: string
  usage: Usage
  reportedCostUsd?: number | undefined
  modelVersion?: string | undefined
}

export interface AIProvider {
  readonly id: string
  generateText(req: TextRequest): Promise<TextResponse>
  /** optional: only providers that serve image models implement it */
  generateImage?(req: ImageRequest): Promise<ImageResponse>
}

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Thrown by providers. `retryable` drives retry/fallback policy. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message)
  }
}

// ─── Registry types ──────────────────────────────────────────────────────────

export type ModelTier = 'fast' | 'quality' | 'vision' | 'image' | 'embedding'

export interface ModelPricing {
  inputPerMTokUsd: number
  outputPerMTokUsd: number
  cachedInputPerMTokUsd?: number
  perImageUsd?: number
  sourceUrl: string
  /** when a human last verified this against the official page */
  verifiedOn: string
  note?: string
}

export type AccessTier = 'starter' | 'premium' | 'frontier'
export const ACCESS_ORDER: AccessTier[] = ['starter', 'premium', 'frontier']

export interface ModelDefinition {
  /** stable catalog id shown to users and stored in jobs, e.g. "vertex:gemini-3.6-flash" */
  id?: string | undefined
  displayName?: string | undefined
  vendor?: string | undefined
  description?: string | undefined
  /** which plans may use it (enforced by the API, not here) */
  accessTier?: AccessTier | undefined
  provider: string
  model: string
  tier: ModelTier
  capabilities: { text: boolean; vision: boolean; structuredOutput: boolean; toolUse: boolean; imageGeneration: boolean; contextWindow: number }
  pricing: ModelPricing
}

/** What a task needs; the router maps it to an ordered chain of models (primary → fallbacks). */
export type RouteClass = 'fast' | 'quality'

/** base64 → bytes without Buffer (this package also runs where Buffer doesn't exist). */
export const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** bytes → base64 without Buffer. */
export const bytesToBase64 = (b: Uint8Array): string => {
  let bin = ''
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(bin)
}
export const imageToBase64 = (i: ImageInput): string => (typeof i.data === 'string' ? i.data : bytesToBase64(i.data))
