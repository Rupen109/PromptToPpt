import type { AIRequestType } from '@prompttoppt/types'

// ─────────────────────────────────────────────
// AI Provider Abstraction Layer
// ─────────────────────────────────────────────

export type ModelTier = 'fast' | 'balanced' | 'quality' | 'vision' | 'image' | 'embedding'

export interface ModelCapabilities {
  text: boolean
  vision: boolean
  structuredOutput: boolean
  toolUse: boolean
  imageGeneration: boolean
  contextWindowTokens: number
  maxOutputTokens: number
  tier: ModelTier
}

export interface ModelPricing {
  inputPricePerMToken: number   // USD per million input tokens
  outputPricePerMToken: number  // USD per million output tokens
  cacheReadPricePerMToken?: number
  imageGenerationPricePerImage?: number
  lastUpdated: string           // ISO date — pricing changes frequently
  source: string                // URL to official pricing page
}

export interface ModelDefinition {
  id: string
  provider: 'gemini' | 'openrouter' | 'openai' | 'anthropic'
  modelId: string               // Provider-specific model ID
  displayName: string
  capabilities: ModelCapabilities
  pricing: ModelPricing
  isAvailableInDev: boolean
  isAvailableInProd: boolean
  preferredForTypes: AIRequestType[]
}

// ─── Provider Interface ───────────────────────────────────────────────────

export interface AICompletionOptions {
  model: string
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
  imageUrls?: string[]
}

export interface AICompletionResult {
  content: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  latencyMs: number
  model: string
  provider: string
  providerCostUsd: number
}

export interface AIImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  model?: string
}

export interface AIImageGenerationResult {
  url: string
  model: string
  provider: string
  providerCostUsd: number
  latencyMs: number
}

export interface AIProvider {
  name: string
  complete(options: AICompletionOptions): Promise<AICompletionResult>
  generateImage(options: AIImageGenerationOptions): Promise<AIImageGenerationResult>
  isAvailable(): boolean
}

// ─── Model Registry ───────────────────────────────────────────────────────

export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  // Gemini models (dev + prod)
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    modelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    capabilities: {
      text: true,
      vision: true,
      structuredOutput: true,
      toolUse: true,
      imageGeneration: false,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 8192,
      tier: 'fast',
    },
    pricing: {
      inputPricePerMToken: 0.1,
      outputPricePerMToken: 0.4,
      lastUpdated: '2025-01-01',
      source: 'https://ai.google.dev/pricing',
    },
    isAvailableInDev: true,
    isAvailableInProd: true,
    preferredForTypes: ['prompt_analysis', 'direction_suggestion', 'validation'],
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    capabilities: {
      text: true,
      vision: true,
      structuredOutput: true,
      toolUse: true,
      imageGeneration: false,
      contextWindowTokens: 2_000_000,
      maxOutputTokens: 65536,
      tier: 'quality',
    },
    pricing: {
      inputPricePerMToken: 1.25,
      outputPricePerMToken: 10.0,
      lastUpdated: '2025-01-01',
      source: 'https://ai.google.dev/pricing',
    },
    isAvailableInDev: true,
    isAvailableInProd: true,
    preferredForTypes: ['outline_generation', 'slide_content', 'source_analysis'],
  },
}

// ─── Routing Policy ───────────────────────────────────────────────────────

export function selectModelForRequestType(
  requestType: AIRequestType,
  environment: 'development' | 'staging' | 'production'
): ModelDefinition {
  const routingMap: Record<AIRequestType, string> = {
    prompt_analysis:     'gemini-2.0-flash',
    direction_suggestion: 'gemini-2.0-flash',
    outline_generation:  'gemini-2.5-pro',
    slide_content:       'gemini-2.5-pro',
    image_generation:    'gemini-2.0-flash',  // placeholder
    ai_edit:             'gemini-2.5-pro',
    source_analysis:     'gemini-2.5-pro',
    validation:          'gemini-2.0-flash',
  }

  const modelId = routingMap[requestType]
  const model = MODEL_REGISTRY[modelId]
  if (!model) throw new Error(`No model registered for request type: ${requestType}`)
  return model
}
