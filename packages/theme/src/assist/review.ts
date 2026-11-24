import type { Presentation, Slide, SlideElement, TextElement } from '@prompttoppt/validation'
import { validateDeck } from '../validate'

/**
 * The deck review: a REPORT, not an edit. Every line is a fact computed from the document by code (the same validators the editor uses, plus word counts, repeated layouts and titles),
 * with slide numbers; nothing is judged by a model, so nothing is made up. What it does not look at (whether the facts are right, how the story flows, tone) is said, not skipped over.
 */
export type ReviewFocus = 'all' | 'text' | 'design'
export const MANY_WORDS = 80

export interface ReviewCheck { id: string; focus: 'text' | 'design'; label: string; /** what to say to fix it */ fix: (n: number) => string }
/** The single list of what is checked: the report and the "what can you do?" answer both read it. */
export const REVIEW_CHECKS: ReviewCheck[] = [
  { id: 'many_words', focus: 'text', label: `too much text (over ${MANY_WORDS} words)`, fix: (n) => `shorten slide ${n}` },
  { id: 'overflow', focus: 'text', label: 'text that does not fit its box', fix: (n) => `shorten slide ${n}` },
  { id: 'small_text', focus: 'text', label: 'very small text', fix: (n) => `shorten slide ${n}` },
  { id: 'no_title', focus: 'text', label: 'no title', fix: (n) => `rewrite slide ${n} with a title` },
  { id: 'duplicate_title', focus: 'text', label: 'the same title as another slide', fix: (n) => `rewrite the title of slide ${n}` },
  { id: 'empty', focus: 'design', label: 'nothing on the slide', fix: (n) => `delete slide ${n}` },
  { id: 'contrast', focus: 'design', label: 'text that is hard to read on its background', fix: (n) => `fix the text on slide ${n} that is hard to read` },
  { id: 'same_layout', focus: 'design', label: 'the same layout three times in a row', fix: (n) => `make slide ${n} a different layout` },
  { id: 'picture', focus: 'design', label: 'a picture that is missing or stretched', fix: (n) => `change the picture on slide ${n}` },
]
/** what the review does not look at (said in every report) */
export const NOT_REVIEWED = 'whether the facts are right, how the story flows, and the wording or tone'

export interface Finding { id: string; label: string; slides: { n: number; detail?: string }[] }

const textsOf = (s: Slide): TextElement[] => s.elements.filter((e): e is TextElement => e.type === 'text' && !e.hidden && !e.decorative)
const wordsOf = (t: TextElement) => t.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').split(/\s+/).filter(Boolean).length
const titleOf = (s: Slide) => { const t = textsOf(s).find((e) => e.role === 'title'); return t ? t.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim() : '' }
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const isSkipped = (s: Slide) => s.layoutId === 'morph-template' || !!s.writing

/** Every finding of the deck, in the order of REVIEW_CHECKS. Only slides that have the problem are listed. */
export function reviewFindings(doc: Presentation): Finding[] {
  const report = validateDeck(doc)
  const issuesOf = new Map(report.slides.map((r) => [r.slideId, r.issues]))
  const by: Record<string, Finding['slides']> = {}
  const add = (id: string, n: number, detail?: string) => { (by[id] ??= []).push(detail ? { n, detail } : { n }) }
  const titles = new Map<string, number[]>()
  doc.slides.forEach((s, i) => {
    const n = i + 1
    if (isSkipped(s)) return
    const words = textsOf(s).filter((t) => t.role !== 'metric').reduce((a, t) => a + wordsOf(t), 0)
    if (words > MANY_WORDS) add('many_words', n, `${words} words`)
    const codes = new Set((issuesOf.get(s.id) ?? []).map((x) => x.code))
    if (codes.has('overflow')) add('overflow', n)
    if (codes.has('small_text')) add('small_text', n)
    if (codes.has('missing_content')) add('empty', n)
    if (codes.has('contrast')) add('contrast', n)
    if (codes.has('duplicate_layout')) add('same_layout', n)
    if (codes.has('unresolved_asset') || codes.has('image_ratio')) add('picture', n)
    // a slide whose OWN content has a title field that is empty (a layout with no title by design, like a big number or a quote, is never flagged)
    const c = s.content as { title?: unknown } | undefined
    const t = titleOf(s)
    if (c && typeof c === 'object' && 'title' in c && !String(c.title ?? '').trim() && !t) add('no_title', n)
    if (t) titles.set(norm(t), [...(titles.get(norm(t)) ?? []), n])
  })
  for (const ns of titles.values()) if (ns.length > 1) for (const n of ns.slice(1)) add('duplicate_title', n, `same as slide ${ns[0]}`)
  return REVIEW_CHECKS.filter((c) => by[c.id]?.length).map((c) => ({ id: c.id, label: c.label, slides: by[c.id]!.sort((a, b) => a.n - b.n) }))
}

const list = (f: Finding) => f.slides.slice(0, 12).map((s) => `${s.n}${s.detail ? ` (${s.detail})` : ''}`).join(', ') + (f.slides.length > 12 ? ` and ${f.slides.length - 12} more` : '')

/** The report as the assistant says it. Advice only: nothing in the deck is touched, and that is stated. */
export function reviewDeck(doc: Presentation, focus: ReviewFocus = 'all'): string {
  const checks = REVIEW_CHECKS.filter((c) => focus === 'all' || c.focus === focus)
  const found = reviewFindings(doc).filter((f) => checks.some((c) => c.id === f.id))
  const n = doc.slides.length
  const looked = `I checked all ${n} slide${n === 1 ? '' : 's'} for: ${checks.map((c) => c.label).join('; ')}.`
  const clean = checks.filter((c) => !found.some((f) => f.id === c.id)).map((c) => c.label)
  const out: string[] = [looked, '']
  if (!found.length) out.push('I found nothing wrong in those. This is a check of the slides themselves, so nothing was changed.')
  else {
    out.push('What I found (nothing was changed; this is advice):', ...found.map((f) => `• ${f.label}: slide${f.slides.length === 1 ? '' : 's'} ${list(f)}`))
    const first = found.map((f) => ({ f, c: checks.find((c) => c.id === f.id)! })).slice(0, 3).map(({ f, c }) => `"${c.fix(f.slides[0]!.n)}"`)
    out.push('', `To fix one, tell me what to do, for example ${first.join(', ')}.`)
  }
  if (found.length && clean.length) out.push('', `Nothing found for: ${clean.join('; ')}.`)
  out.push('', `I did not look at ${NOT_REVIEWED}: I cannot judge those yet.`)
  return out.join('\n')
}

