import { resolveColor } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'

type Kit = { name: string | null; primary: string | null; accent: string | null; headingFont: string | null; bodyFont: string | null }
const rgb = (hex: string) => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const }
const near = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 48 }
/** black, white and greys go with every brand */
const neutral = (hex: string) => { const [r, g, b] = rgb(hex); return Math.max(r, g, b) - Math.min(r, g, b) < 24 }

/**
 * "Which slides break my brand?": a report computed by CODE from the deck and the person's saved brand kit (never the model's words, nothing changed). The deck's fonts against the kit's, and
 * every colour set ON a slide (a text colour, a shape fill, a slide background) that is not one of the kit's colours, the deck's own colours or a neutral grey.
 */
export function brandReview(doc: Presentation, kit: Kit | null, allowed: boolean): string {
  if (!allowed) return 'Checking a deck against your brand uses a saved brand kit, which is on the Gold and Premium plans.'
  if (!kit || (!kit.primary && !kit.accent && !kit.headingFont && !kit.bodyFont)) return 'You have no saved brand kit with colours or fonts yet. Create one in the Brand tab (Style), then ask again.'
  const theme = doc.theme
  const ok = [kit.primary, kit.accent, theme.colors.background, theme.colors.surface, theme.colors.textPrimary, theme.colors.textSecondary, theme.colors.onPrimary].filter((c): c is string => !!c && /^#[0-9a-f]{6}/i.test(c))
  const onBrand = (c: string) => neutral(c) || ok.some((k) => near(k, c))
  const off: { n: number; count: number }[] = []
  doc.slides.forEach((s, i) => {
    const colours: string[] = []
    if (s.background?.type === 'color') colours.push(s.background.value)
    for (const e of s.elements) {
      if (e.decorative || e.hidden) continue
      if (e.type === 'text') { colours.push(resolveColor(e.color, theme, s)); for (const p of e.paragraphs) for (const r of p.runs) if (r.color) colours.push(resolveColor(r.color, theme, s)) }
      if (e.type === 'shape' && typeof e.fill === 'string' && e.fill !== 'none') colours.push(resolveColor(e.fill, theme, s))
    }
    const bad = colours.filter((c) => /^#[0-9a-f]{6}/i.test(c) && !onBrand(c)).length
    if (bad) off.push({ n: i + 1, count: bad })
  })
  const fonts: string[] = []
  if (kit.headingFont && kit.headingFont !== theme.fonts.heading) fonts.push(`headings use ${theme.fonts.heading} (your kit: ${kit.headingFont})`)
  if (kit.bodyFont && kit.bodyFont !== theme.fonts.body) fonts.push(`body text uses ${theme.fonts.body} (your kit: ${kit.bodyFont})`)
  const name = kit.name ? `"${kit.name}"` : 'your brand kit'
  const head = `I checked all ${doc.slides.length} slides against ${name}${kit.primary || kit.accent ? ` (${[kit.primary, kit.accent].filter(Boolean).join(' and ')})` : ''}.`
  if (!fonts.length && !off.length) return `${head} Everything follows your brand: its fonts, and no colour outside its colours.`
  return [head, fonts.length ? `Fonts: ${fonts.join('; ')}.` : 'Fonts: they follow your brand.', off.length ? `Colours outside your brand: ${off.slice(0, 12).map((o) => `slide ${o.n} (${o.count})`).join(', ')}${off.length > 12 ? ', and more' : ''}.` : 'Colours: all follow your brand.', 'Nothing was changed. Say "use my brand" to put the kit\'s colours and fonts on the whole deck.'].join('\n')
}
