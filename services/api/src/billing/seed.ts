import { db } from '../db/index.ts'
import { creditCost, plan, planPrice } from '../db/schema.ts'
import type { PlanFeatures } from '@prompttoppt/validation'
import { seedCatalog } from '../ai/catalog-seed.ts'

const base: PlanFeatures = {
  watermark: true, exportFormats: [], aiEdits: true, advancedEditor: false, premiumTemplates: false, advancedSharing: false,
  modelTiers: ['starter'], brandKit: false, knowledgeBase: false, support: 'community', speed: 'standard', projects: false, askDeck: false, webData: 'none',
}
const ALL_EXPORTS = ['pptx', 'pdf', 'png', 'jpg', 'html'] as const

/**
 * Plan catalogue v2 (2026-10-02). Inserted only if missing — owner edits survive restarts; existing databases get these
 * values from migration 0011. Credit amounts and image caps come from docs/PRICING_MODEL.md (margin analysis), not guesswork.
 * Starter can generate AND use AI edits on its credits, but cannot export and keeps the watermark.
 */
export const PLAN_SEED = [
  { id: 'starter', name: 'Starter', sortOrder: 0, monthlyCredits: 100, maxSlides: 20, maxPresentationsPerMonth: null, maxImagesPerPresentation: 3, maxImagesPerMonth: 6, features: base },
  {
    id: 'pro', name: 'Pro', sortOrder: 1, monthlyCredits: 3000, maxSlides: 40, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 10, maxImagesPerMonth: 60,
    features: { ...base, watermark: false, exportFormats: [...ALL_EXPORTS], advancedEditor: true, premiumTemplates: true, advancedSharing: true, modelTiers: ['starter', 'premium'], support: 'whatsapp', speed: 'fast', projects: true, askDeck: true, webData: 'wikipedia' },
  },
  {
    id: 'gold', name: 'Gold', sortOrder: 2, monthlyCredits: 10000, maxSlides: 60, maxPresentationsPerMonth: null, maxImagesPerPresentation: 20, maxImagesPerMonth: 100,
    features: { ...base, watermark: false, exportFormats: [...ALL_EXPORTS], advancedEditor: true, premiumTemplates: true, advancedSharing: true, modelTiers: ['starter', 'premium', 'frontier'], brandKit: true, knowledgeBase: true, support: 'whatsapp', speed: 'ultra', projects: true, askDeck: true, webData: 'web' },
  },
] as const

/** Minor units. Monthly as stated by the owner (India ₹499/₹1,200 · elsewhere $15/$30); annual = monthly × 12 × 0.80. */
export const PRICE_SEED = [
  { planId: 'starter', currency: 'USD', interval: 'month', amountMinor: 0 },
  { planId: 'starter', currency: 'USD', interval: 'year', amountMinor: 0 },
  { planId: 'starter', currency: 'INR', interval: 'month', amountMinor: 0 },
  { planId: 'starter', currency: 'INR', interval: 'year', amountMinor: 0 },
  { planId: 'pro', currency: 'USD', interval: 'month', amountMinor: 1500 },
  { planId: 'pro', currency: 'USD', interval: 'year', amountMinor: 14400 },
  { planId: 'pro', currency: 'INR', interval: 'month', amountMinor: 49900 },
  { planId: 'pro', currency: 'INR', interval: 'year', amountMinor: 479000 },
  { planId: 'gold', currency: 'USD', interval: 'month', amountMinor: 3000 },
  { planId: 'gold', currency: 'USD', interval: 'year', amountMinor: 28800 },
  { planId: 'gold', currency: 'INR', interval: 'month', amountMinor: 120000 },
  { planId: 'gold', currency: 'INR', interval: 'year', amountMinor: 1152000 },
] as const

/** Credits per action × model tier. Chosen against worst-case India margins — see docs/PRICING_MODEL.md. */
export const CREDIT_COST_SEED = [
  { action: 'generate_slide', tier: 'starter', credits: 2 },
  { action: 'generate_slide', tier: 'premium', credits: 5 },
  { action: 'generate_slide', tier: 'frontier', credits: 12 },
  { action: 'ai_edit', tier: 'starter', credits: 2 },
  { action: 'ai_edit', tier: 'premium', credits: 4 },
  { action: 'ai_edit', tier: 'frontier', credits: 10 },
  { action: 'ask_deck', tier: 'starter', credits: 1 },
  { action: 'ask_deck', tier: 'premium', credits: 2 },
  { action: 'ask_deck', tier: 'frontier', credits: 5 },
  { action: 'read_image', tier: 'starter', credits: 4 },
  { action: 'read_image', tier: 'premium', credits: 4 },
  { action: 'read_image', tier: 'frontier', credits: 4 },
  { action: 'web_research', tier: 'starter', credits: 60 },
  { action: 'web_research', tier: 'premium', credits: 60 },
  { action: 'web_research', tier: 'frontier', credits: 60 },
  { action: 'image', tier: 'starter', credits: 20 },
  { action: 'image', tier: 'premium', credits: 60 },
  { action: 'image', tier: 'frontier', credits: 200 },
] as const

export async function seedBilling(): Promise<void> {
  await db.insert(plan).values(PLAN_SEED.map((p) => ({ ...p, features: p.features as PlanFeatures }))).onConflictDoNothing()
  await db.insert(planPrice).values(PRICE_SEED.map((p) => ({ id: `${p.planId}-${p.currency}-${p.interval}`, ...p }))).onConflictDoNothing()
  await db.insert(creditCost).values(CREDIT_COST_SEED.map((c) => ({ id: `${c.action}-${c.tier}`, ...c }))).onConflictDoNothing()
  await seedCatalog()
}
