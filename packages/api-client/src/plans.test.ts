import { describe, expect, it } from 'vitest'
import type { PlanView } from '@prompttoppt/validation'
import { formatMoney, planHighlights, priceFor } from './plans'

const f = { watermark: true, exportFormats: [], aiEdits: true, advancedEditor: false, premiumTemplates: false, advancedSharing: false, modelTiers: ['starter'], brandKit: false, knowledgeBase: false, support: 'community', speed: 'standard', projects: false, askDeck: false, webData: 'none' } as PlanView['features']
const starter: PlanView = { id: 'starter', name: 'Starter', monthlyCredits: 100, maxSlides: 20, maxPresentationsPerMonth: null, maxImagesPerPresentation: 3, maxImagesPerMonth: 6, features: f, prices: [{ interval: 'month', amountMinor: 0, currency: 'USD' }, { interval: 'year', amountMinor: 0, currency: 'USD' }] }
const pro: PlanView = { id: 'pro', name: 'Pro', monthlyCredits: 3000, maxSlides: 40, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 10, maxImagesPerMonth: 60, features: { ...f, watermark: false, exportFormats: ['pptx', 'pdf', 'png', 'jpg', 'html'], advancedEditor: true, premiumTemplates: true, advancedSharing: true, modelTiers: ['starter', 'premium'], support: 'whatsapp', speed: 'fast', projects: true, askDeck: true, webData: 'wikipedia' }, prices: [{ interval: 'month', amountMinor: 1500, currency: 'USD' }, { interval: 'year', amountMinor: 14400, currency: 'USD' }] }
const gold: PlanView = { ...pro, id: 'gold', name: 'Gold', monthlyCredits: 10000, maxPresentationsPerMonth: null, maxImagesPerPresentation: 20, maxImagesPerMonth: 100, features: { ...pro.features, modelTiers: ['starter', 'premium', 'frontier'], brandKit: true, knowledgeBase: true, speed: 'ultra', webData: 'web' }, prices: [{ interval: 'month', amountMinor: 3000, currency: 'USD' }, { interval: 'year', amountMinor: 28800, currency: 'USD' }] }

describe('pricing copy is derived from plan data', () => {
  it('Starter says exactly what Starter is (AI edits are included in credits; no export; watermark)', () => {
    expect(planHighlights(starter).items).toEqual(['100 credits / month', 'Starter AI model and agent', 'Up to 20 slides per presentation', 'Up to 3 AI images per presentation', 'Watermark on presentations', 'No export — upgrade to export', 'Share view-only links', 'AI edits', 'Write decks in 100+ languages'])
  })
  it('Pro lists the agreed features', () => {
    expect(planHighlights(pro).items).toEqual(expect.arrayContaining(['3,000 credits / month', '50 presentations / month', 'Premium templates', 'No watermark', 'Export in PPTX, PDF, PNG, JPG, HTML', 'Advanced editor', 'AI edits', 'Premium AI models', 'Up to 10 AI images per presentation', 'Edit together: invite up to 3 people per presentation', 'Password-protected & expiring share links', '24/7 support · WhatsApp', 'Write decks in 100+ languages', 'Chat with your presentation (AskPPT)', 'Wikipedia data with citations']))
    expect(planHighlights(pro).items).not.toContain('Wikipedia & live web search data')
  })
  it('Gold shows only what is new over Pro', () => {
    const h = planHighlights(gold, pro)
    expect(h.lead).toBe('All Pro features, plus:')
    expect(h.items).not.toContain('Shared knowledge base') // not built: not advertised
    expect(h.items).toEqual(expect.arrayContaining(['Frontier AI models and agents', 'Up to 5 brand kits (logo, colours, fonts)', 'Generation speed: ultra', 'Wikipedia & live web search data']))
    expect(h.items).not.toContain('AI edits')
    expect(h.items).not.toContain('Chat with your presentation (AskPPT)') // already in Pro
  })
  it('formats money per locale', () => {
    expect(formatMoney(14400, 'USD')).toBe('$144')
    expect(formatMoney(49900, 'INR')).toBe('₹499')
    expect(formatMoney(479000, 'INR')).toBe('₹4,790')
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
