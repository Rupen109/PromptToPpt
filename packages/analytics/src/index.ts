import type { ProductEventName } from '@prompttoppt/types'

// ─────────────────────────────────────────────
// Analytics Event Definitions
// ─────────────────────────────────────────────

export interface BaseEventProperties {
  userId?: string
  sessionId?: string
  timestamp: string
  environment: 'development' | 'staging' | 'production'
}

export type ProductEvent = {
  name: ProductEventName
  properties: BaseEventProperties & Record<string, unknown>
}

// ─── Client-safe tracker (no private data sent to GA) ────────────────────

export interface AnalyticsClient {
  track(event: ProductEvent): void
  identify(userId: string, traits?: Record<string, unknown>): void
  page(pageName: string, properties?: Record<string, unknown>): void
}

// ─── Event Builder Helpers ────────────────────────────────────────────────

export function buildEvent(
  name: ProductEventName,
  properties: Record<string, unknown> = {}
): ProductEvent {
  return {
    name,
    properties: {
      ...properties,
      timestamp: new Date().toISOString(),
      environment: (process.env['NODE_ENV'] ?? 'development') as
        | 'development'
        | 'staging'
        | 'production',
    },
  }
}

// ─── IMPORTANT: Never include in event properties ─────────────────────────
// - prompt content
// - uploaded document content
// - slide content
// - user PII beyond userId
// These must never be sent to GA4 or other third-party analytics vendors.

export const ANALYTICS_SAFE_PROPERTIES = [
  'planSlug',
  'slideCount',
  'exportFormat',
  'themeId',
  'layoutId',
  'generationDurationMs',
  'slidePosition',
  'aiCommand',
  'provider',
  'model',
] as const
