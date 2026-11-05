import { describe, expect, it } from 'vitest'
import type { PlanView } from '@prompttoppt/validation'
import { formatMoney, planHighlights, priceFor } from './plans'

// the v5 plans (docs/PLANS_AND_FEATURES_V5.md), as the server sends them
const base = { watermark: false, exportFormats: ['pdf', 'pptx', 'jpg'], aiEdits: true, advancedEditor: false, premiumTemplates: true, advancedSharing: true, modelTiers: ['starter'], brandKit: false, knowledgeBase: false, support: 'whatsapp', speed: 'fast', projects: true, askDeck: true, webData: 'wikipedia', livePreview: true, modelChoice: false, fixedModels: ['a'] } as unknown as PlanView['features']
const starter: PlanView = { id: 'starter', name: 'Starter', monthlyCredits: 100, maxSlides: 10, maxPresentationsPerMonth: 5, maxImagesPerPresentation: 0, maxImagesPerMonth: 0, features: { ...base, watermark: true, exportFormats: [], aiEdits: false, premiumTemplates: false, advancedSharing: false, support: 'community', speed: 'standard', projects: false, askDeck: false, webData: 'none', livePreview: false }, prices: [{ interval: 'month', amountMinor: 0, currency: 'USD' }, { interval: 'year', amountMinor: 0, currency: 'USD' }] }
const pro: PlanView = { id: 'pro', name: 'Pro', monthlyCredits: 900, maxSlides: 15, maxPresentationsPerMonth: 15, maxImagesPerPresentation: 10, maxImagesPerMonth: 60, features: base, prices: [{ interval: 'month', amountMinor: 1500, currency: 'USD' }, { interval: 'year', amountMinor: 14400, currency: 'USD' }] }
const gold: PlanView = { ...pro, id: 'gold', name: 'Gold', monthlyCredits: 2000, maxSlides: 25, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 20, maxImagesPerMonth: 100, features: { ...base, exportFormats: ['pdf', 'pptx', 'png', 'jpg', 'html'], brandKit: true, speed: 'ultra', webData: 'web' }, prices: [{ interval: 'month', amountMinor: 3000, currency: 'USD' }, { interval: 'year', amountMinor: 28800, currency: 'USD' }] }
const premium: PlanView = { ...gold, id: 'premium', name: 'Premium', monthlyCredits: 3700, maxSlides: 60, features: { ...gold.features, modelTiers: ['starter', 'premium', 'frontier'], modelChoice: true } }

describe('pricing copy is derived from plan data', () => {
  it('Starter says exactly what Starter is: no export, no preview or share links, watermark, no AI edits or pictures', () => {
    const items = planHighlights(starter).items
    expect(items).toEqual(expect.arrayContaining(['100 credits / month', '5 presentations / month', 'Up to 10 slides per presentation', 'Watermark on presentations', 'No export — upgrade to export', 'Build and edit in the editor (no preview)', 'No share links']))
    expect(items.some((i) => /AI images/.test(i))).toBe(false) // 0 pictures: not advertised
    expect(items).not.toContain('AI edits')
  })
  it('Pro lists the agreed features, with the model picked for the person', () => {
    const items = planHighlights(pro).items
    expect(items).toEqual(expect.arrayContaining(['900 credits / month', '15 presentations / month', 'Up to 15 slides per presentation', 'Premium templates', 'No watermark', 'Export in PDF, PPTX, JPG', 'AI edits', 'Live preview, present mode and share links', 'Fast, high-quality AI models picked for you', 'Up to 10 AI images per presentation']))
    expect(items).not.toContain('Wikipedia & live web search data')
    expect(items.join(' ')).not.toMatch(/Google Slides|Clone/) // deferred features are never advertised
  })
  it('Gold shows only what is new over Pro', () => {
    const h = planHighlights(gold, pro)
    expect(h.lead).toBe('All Pro features, plus:')
    expect(h.items).not.toContain('Shared knowledge base') // not built: not advertised
    expect(h.items).toEqual(expect.arrayContaining(['Up to 5 brand kits (logo, colours, fonts)', 'Generation speed: ultra', 'Wikipedia & live web search data', '50 presentations / month']))
    expect(h.items).not.toContain('AI edits')
  })
  it('Premium is the plan where the person chooses the model', () => {
    const h = planHighlights(premium, gold)
    expect(h.lead).toBe('All Gold features, plus:')
    expect(h.items).toEqual(expect.arrayContaining(['3,700 credits / month', 'Up to 60 slides per presentation', 'Choose your AI model: Claude Sonnet and Opus, GLM, Haiku and more']))
  })
  it('formats money per locale', () => {
    expect(formatMoney(14400, 'USD')).toBe('$144')
    expect(formatMoney(30000, 'INR')).toBe('₹300')
    expect(formatMoney(624000, 'INR')).toBe('₹6,240')
  })
  it('monthly vs annual: annual shows the per-month equivalent and the saving computed from the two prices', () => {
    expect(priceFor(pro, 'month')).toEqual({ text: '$15', billed: 'Billed monthly', saving: null })
    expect(priceFor(pro, 'year')).toEqual({ text: '$12', billed: 'Billed annually ($144/yr)', saving: 'Save 20%' })
    expect(priceFor(gold, 'year')).toEqual({ text: '$24', billed: 'Billed annually ($288/yr)', saving: 'Save 20%' })
    expect(priceFor(starter, 'year')?.billed).toBe('Free forever')
  })
  it('falls back to whichever interval exists', () => {
    const onlyYear = { ...pro, prices: [{ interval: 'year' as const, amountMinor: 14400, currency: 'USD' as const }] }
    expect(priceFor(onlyYear, 'month')?.text).toBe('$12')
  })
})
