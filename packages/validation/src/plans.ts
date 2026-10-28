import { z } from 'zod'

/**
 * Plans & entitlements — shared by the API (enforcement), the pricing page and the editor (display only).
 * The client never decides anything from these: every gated action is re-checked on the server.
 */

export const ACCESS_TIERS = ['starter', 'premium', 'frontier'] as const
export const accessTierSchema = z.enum(ACCESS_TIERS)
export type AccessTier = z.infer<typeof accessTierSchema>

export const EXPORT_FORMATS = ['pptx', 'pdf', 'png', 'jpg', 'html'] as const
export const exportFormatSchema = z.enum(EXPORT_FORMATS)
export type ExportFormat = z.infer<typeof exportFormatSchema>

export const planFeaturesSchema = z.object({
  watermark: z.boolean(),
  exportFormats: z.array(exportFormatSchema),
  aiEdits: z.boolean(),
  advancedEditor: z.boolean(),
  premiumTemplates: z.boolean(),
  /** password-protected / expiring / editable share links */
  advancedSharing: z.boolean(),
  modelTiers: z.array(accessTierSchema).min(1),
  brandKit: z.boolean(),
  knowledgeBase: z.boolean(),
  support: z.enum(['community', 'email', 'whatsapp']),
  /** queue priority + slide-batch parallelism */
  speed: z.enum(['standard', 'fast', 'ultra']),
  /** organise presentations into projects (folders) */
  projects: z.boolean(),
  /** "Chat with your presentation": ask questions about a deck and get answers that point to slides */
  askDeck: z.boolean().default(false),
  /** facts to build decks from: none, Wikipedia (free), or Wikipedia + live web search (costs credits) */
  webData: z.enum(['none', 'wikipedia', 'web']).default('none'),
})
export type PlanFeatures = z.infer<typeof planFeaturesSchema>

export const PLAN_IDS = ['starter', 'pro', 'gold'] as const
export const planIdSchema = z.enum(PLAN_IDS)
export type PlanId = z.infer<typeof planIdSchema>

export const CURRENCIES = ['INR', 'USD'] as const
export const currencySchema = z.enum(CURRENCIES)
export type Currency = z.infer<typeof currencySchema>

export const planViewSchema = z.object({
  id: planIdSchema,
  name: z.string(),
  monthlyCredits: z.number().int(),
  maxSlides: z.number().int(),
  maxPresentationsPerMonth: z.number().int().nullable(),
  /** AI image limits (cost control): per deck and per billing period */
  maxImagesPerPresentation: z.number().int(),
  maxImagesPerMonth: z.number().int(),
  features: planFeaturesSchema,
  /** amounts in minor units (cents / paise) for the requested currency */
  prices: z.array(z.object({ interval: z.enum(['month', 'year']), amountMinor: z.number().int(), currency: currencySchema })),
})
export type PlanView = z.infer<typeof planViewSchema>

export interface Entitlements {
  plan: { id: PlanId; name: string }
  features: PlanFeatures
  limits: { maxSlides: number; maxPresentationsPerMonth: number | null; maxImagesPerPresentation: number; maxImagesPerMonth: number }
  credits: { balance: number; monthlyAllowance: number; resetsAt: string }
  usage: { presentationsThisPeriod: number; imagesThisPeriod: number }
}

/** Stable machine-readable reasons for 402/403 so the UI can show the right upgrade prompt. */
export const GATE_CODES = ['UPGRADE_REQUIRED', 'INSUFFICIENT_CREDITS', 'LIMIT_REACHED'] as const
export type GateCode = (typeof GATE_CODES)[number]

/** What the Billing page shows about the user's paid subscription (null = Starter). */
export interface SubscriptionSummary {
  planId: 'pro' | 'gold'
  status: string
  interval: 'month' | 'year'
  currency: Currency
  currentPeriodEnd: string
  /** renewals are off; access continues until currentPeriodEnd */
  cancelAtPeriodEnd: boolean
  provider: string
}

/** Web links in a chat message (max `limit`), de-duplicated, trailing punctuation trimmed. Shared so the UI can show the extra cost the server will charge. */
export function findUrls(text: string, limit = 2): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, '')))].slice(0, limit)
}
