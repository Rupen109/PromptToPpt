import type { PlanView } from '@prompttoppt/validation'

/** "$20", "₹1,499" — Intl handles grouping/symbols; amounts are stored in minor units. */
export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: major % 1 === 0 ? 0 : 2 }).format(major)
}

export type BillingInterval = 'month' | 'year'

/**
 * Price to display for an interval. Yearly plans show the per-month equivalent plus the yearly total and the saving vs
 * paying monthly (computed from the two prices, never typed).
 */
export function priceFor(plan: PlanView, interval: BillingInterval): { text: string; billed: string; saving: string | null } | null {
  const monthly = plan.prices.find((p) => p.interval === 'month')
  const yearly = plan.prices.find((p) => p.interval === 'year')
  const chosen = interval === 'year' ? (yearly ?? monthly) : (monthly ?? yearly)
  if (!chosen) return null
  if (chosen.amountMinor === 0) return { text: formatMoney(0, chosen.currency), billed: 'Free forever', saving: null }
  if (chosen.interval === 'month') return { text: formatMoney(chosen.amountMinor, chosen.currency), billed: 'Billed monthly', saving: null }
  const saving = monthly ? Math.round((1 - chosen.amountMinor / (monthly.amountMinor * 12)) * 100) : 0
  return { text: formatMoney(Math.round(chosen.amountMinor / 12), chosen.currency), billed: `Billed annually (${formatMoney(chosen.amountMinor, chosen.currency)}/yr)`, saving: saving > 0 ? `Save ${saving}%` : null }
}

/** @deprecated kept for older callers: yearly view. */
export const monthlyDisplay = (plan: PlanView) => priceFor(plan, 'year')

const FORMATS: Record<string, string> = { pptx: 'PPTX', pdf: 'PDF', png: 'PNG', jpg: 'JPG', html: 'HTML' }

/**
 * Feature bullets generated FROM the plan data, so the marketing copy and the pricing in the DB cannot disagree.
 * (If a plan flag changes, the page changes; nothing is typed twice.)
 */
export function planHighlights(plan: PlanView, previous?: PlanView): { lead: string | null; items: string[] } {
  const f = plan.features
  const items: string[] = [`${plan.monthlyCredits.toLocaleString('en-US')} credits / month`]
  items.push(f.modelTiers.includes('frontier') ? 'Frontier AI models and agents' : f.modelTiers.includes('premium') ? 'Premium AI models' : 'Starter AI model and agent')
  items.push(plan.maxPresentationsPerMonth ? `${plan.maxPresentationsPerMonth} presentations / month` : `Up to ${plan.maxSlides} slides per presentation`)
  if (plan.maxPresentationsPerMonth) items.push(`Up to ${plan.maxSlides} slides per presentation`)
  if (f.premiumTemplates) items.push('Premium templates')
  items.push(`Up to ${plan.maxImagesPerPresentation} AI images per presentation`)
  items.push(f.watermark ? 'Watermark on presentations' : 'No watermark')
  items.push(f.exportFormats.length ? `Export in ${f.exportFormats.map((x) => FORMATS[x] ?? x).join(', ')}` : 'No export — upgrade to export')
  items.push(f.advancedSharing ? `Edit together: invite up to ${plan.id === 'gold' ? 10 : 3} people per presentation` : 'Share view-only links')
  if (f.advancedSharing) items.push('Password-protected & expiring share links')
  if (f.advancedEditor) items.push('Advanced editor')
  if (f.aiEdits) items.push('AI edits')
  items.push('Write decks in 100+ languages')
  if (f.askDeck) items.push('Chat with your presentation (AskPPT)')
  if (f.webData === 'web') items.push('Wikipedia & live web search data')
  else if (f.webData === 'wikipedia') items.push('Wikipedia data with citations')
  // brand kits: Pro 1, Gold 5 (the server's limit is MAX_KITS in services/api/src/brand/kits.ts). The shared knowledge base is not built yet, so it is not advertised.
  const kits = plan.id === 'gold' ? 5 : plan.id === 'pro' ? 1 : 0
  if (kits) items.push(kits === 1 ? 'Brand kit: your logo, colours and fonts' : `Up to ${kits} brand kits (logo, colours, fonts)`)
  if (f.speed !== 'standard') items.push(`Generation speed: ${f.speed}`)
  if (f.support === 'whatsapp') items.push('24/7 support · WhatsApp')

  if (!previous) return { lead: null, items }
  // For higher tiers show only what's new (the page says "All <previous> features, plus:")
  const prev = new Set(planHighlights(previous).items)
  return { lead: `All ${previous.name} features, plus:`, items: items.filter((i) => !prev.has(i)) }
}
