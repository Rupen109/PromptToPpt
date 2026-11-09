import { db } from '../db/index.ts'
import { creditCost, plan, planPrice } from '../db/schema.ts'
import type { PlanFeatures } from '@prompttoppt/validation'
import { seedCatalog } from '../ai/catalog-seed.ts'

const base: PlanFeatures = {
  watermark: true, exportFormats: [], aiEdits: false, advancedEditor: true, premiumTemplates: false, advancedSharing: false,
  modelTiers: ['starter'], brandKit: false, knowledgeBase: false, support: 'community', speed: 'standard', projects: false, askDeck: false, webData: 'none',
  livePreview: false, modelChoice: false, fixedModels: [], morph: false, morphDecksPerMonth: 0,
}
/**
 * AI-built Morph decks a month. Measured on 11 real Morph jobs: one planning call (about 1,000 tokens in, 1,300 out) plus a tiny design pick = $0.0058 a deck on the default Gemini model
 * ($0.0077 at worst), less than half of a normal deck; $0.037 on Opus 4.8 (Premium's dearest model); both double from 2027-01-01. The limit is a product limit, not a cost limit: at 10
 * (Gold) and 30 (Premium) the worst case is under 4 % and about 10 % of net revenue. Details and the table: docs/PLANS_AND_FEATURES_V5.md section 11.
 */
const MORPH_DECKS = { gold: 10, premium: 30 } as const
const ALL_EXPORTS = ['pptx', 'pdf', 'png', 'jpg', 'html'] as const
/** the Gemini models the plans write decks with, as names without the provider (the first one the deployment serves is used) */
const STARTER_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'] // 2.5 Flash is closed to new Google accounts
const PAID_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash']

/**
 * Plan catalogue v5 (2026-11-03): the owner's spec, docs/PLANS_AND_FEATURES_V5.md. Inserted only if missing: owner edits survive restarts, and an existing database gets
 * these values from migration 0037 (seeds never overwrite).
 *  · Starter is free and not shown on the pricing page: it can build a deck and watch it being written, and build or edit one in the editor, but cannot present or share it
 *    ("live preview"), has no AI edits, and cannot export (asking shows the upgrade prompt); the watermark stays.
 *  · Pro, Gold and Premium are paid. Pro and Gold write with fixed Gemini models and are never asked which model; Premium chooses from the OpenRouter models.
 *  · Google Slides export and Clone Slide (image → editable slide, counted per month) are decided but deferred: not in the data until they exist.
 *  · `maxSlides` for Premium is the system's per-deck ceiling (60): credits are what really limit it.
 */
export const PLAN_SEED = [
  { id: 'starter', name: 'Starter', sortOrder: 0, monthlyCredits: 100, maxSlides: 10, maxPresentationsPerMonth: 5, maxImagesPerPresentation: 0, maxImagesPerMonth: 0, features: { ...base, fixedModels: STARTER_MODELS } },
  {
    id: 'pro', name: 'Pro', sortOrder: 1, monthlyCredits: 900, maxSlides: 15, maxPresentationsPerMonth: 15, maxImagesPerPresentation: 10, maxImagesPerMonth: 60,
    features: { ...base, watermark: false, exportFormats: ['pdf', 'pptx', 'jpg'], aiEdits: true, premiumTemplates: true, advancedSharing: true, support: 'whatsapp', speed: 'fast', projects: true, askDeck: true, webData: 'wikipedia', livePreview: true, fixedModels: PAID_MODELS },
  },
  {
    id: 'gold', name: 'Gold', sortOrder: 2, monthlyCredits: 2000, maxSlides: 25, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 20, maxImagesPerMonth: 100,
    features: { ...base, watermark: false, exportFormats: [...ALL_EXPORTS], aiEdits: true, premiumTemplates: true, advancedSharing: true, brandKit: true, knowledgeBase: true, support: 'whatsapp', speed: 'ultra', projects: true, askDeck: true, webData: 'web', livePreview: true, fixedModels: PAID_MODELS, morph: true, morphDecksPerMonth: MORPH_DECKS.gold },
  },
  {
    id: 'premium', name: 'Premium', sortOrder: 3, monthlyCredits: 3700, maxSlides: 60, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 20, maxImagesPerMonth: 100,
    features: { ...base, watermark: false, exportFormats: [...ALL_EXPORTS], aiEdits: true, premiumTemplates: true, advancedSharing: true, modelTiers: ['starter', 'premium', 'frontier'], brandKit: true, knowledgeBase: true, support: 'whatsapp', speed: 'ultra', projects: true, askDeck: true, webData: 'web', livePreview: true, modelChoice: true, morph: true, morphDecksPerMonth: MORPH_DECKS.premium },
  },
] as const

/**
 * Minor units. Monthly India as stated by the owner (₹300 / ₹650 / ₹1,200); annual = monthly × 12 × 0.80 (two months free).
 * The US-dollar prices ($10 / $19 / $35) and all annual prices are PROVISIONAL (not yet decided by the owner). Create the matching Razorpay plans before going live.
 */
export const PRICE_SEED = [
  { planId: 'starter', currency: 'USD', interval: 'month', amountMinor: 0 },
  { planId: 'starter', currency: 'USD', interval: 'year', amountMinor: 0 },
  { planId: 'starter', currency: 'INR', interval: 'month', amountMinor: 0 },
  { planId: 'starter', currency: 'INR', interval: 'year', amountMinor: 0 },
  { planId: 'pro', currency: 'USD', interval: 'month', amountMinor: 1000 },
  { planId: 'pro', currency: 'USD', interval: 'year', amountMinor: 9600 },
  { planId: 'pro', currency: 'INR', interval: 'month', amountMinor: 30000 },
  { planId: 'pro', currency: 'INR', interval: 'year', amountMinor: 288000 },
  { planId: 'gold', currency: 'USD', interval: 'month', amountMinor: 1900 },
  { planId: 'gold', currency: 'USD', interval: 'year', amountMinor: 18240 },
  { planId: 'gold', currency: 'INR', interval: 'month', amountMinor: 65000 },
  { planId: 'gold', currency: 'INR', interval: 'year', amountMinor: 624000 },
  { planId: 'premium', currency: 'USD', interval: 'month', amountMinor: 3500 },
  { planId: 'premium', currency: 'USD', interval: 'year', amountMinor: 33600 },
  { planId: 'premium', currency: 'INR', interval: 'month', amountMinor: 120000 },
  { planId: 'premium', currency: 'INR', interval: 'year', amountMinor: 1152000 },
] as const

/**
 * Credits per action × model tier. The tier is the model's CREDIT CLASS (docs/PLANS_AND_FEATURES_V5.md, section 5): starter = the Gemini Flash models (2 a slide), premium = Haiku 4.5 and
 * GLM-5.2 (3 a slide), frontier = Sonnet 4.6 and Opus (12 a slide: Sonnet is slightly over its cost, Opus slightly under; both inside the margin).
 */
export const CREDIT_COST_SEED = [
  { action: 'generate_slide', tier: 'starter', credits: 2 },
  { action: 'generate_slide', tier: 'premium', credits: 3 },
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
  { action: 'read_media', tier: 'starter', credits: 6 },
  { action: 'read_media', tier: 'premium', credits: 6 },
  { action: 'read_media', tier: 'frontier', credits: 6 },
  { action: 'read_video', tier: 'starter', credits: 3 },
  { action: 'read_video', tier: 'premium', credits: 3 },
  { action: 'read_video', tier: 'frontier', credits: 3 },
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
