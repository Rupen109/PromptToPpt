import { SKELETONS } from '@prompttoppt/theme'
import type { PromptAnalysis, SlideContent } from '@prompttoppt/validation'

/**
 * Stage 6 of docs/AI_GENERATION_PLAN.md — the deterministic quality gate. Everything that must NEVER ship is checked here in code
 * (not trusted to a prompt): invented numbers, template sample text, empty/duplicate slides, uncovered topics.
 * Pure: same input → same issues.
 */
export type IssueKind = 'invented_number' | 'sample_leak' | 'empty' | 'duplicate_title' | 'missing_topic'
export interface QualityIssue { slide: number; kind: IssueKind; problem: string }

/** Every string a viewer could read on a slide (speaker notes included — a made-up figure in the notes is still made up). */
export function textOf(c: SlideContent): string[] {
  const out: string[] = []
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') { if (!['layout', 'chartType', 'imageUrl', 'sourceId', 'locator'].includes(key) && key !== 'imagePrompt') out.push(v) }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(c)
  return out
}

const NUM = /\d[\d,.]*\s?(?:%|[kKmMbB]\b|x\b)?/g
const norm = (t: string) => t.replace(/[,\s]/g, '').toLowerCase()
export const numberTokens = (t: string) => (t.match(NUM) ?? []).map(norm).filter((x) => /\d/.test(x))

/** Numbers the user actually supplied (request, facts, sources). */
export function allowedNumbers(userTexts: string[]): Set<string> {
  return new Set(userTexts.flatMap(numberTokens))
}

/** A bare small integer (1–12, e.g. "3 steps", "Phase 2") is structure, not a claim. Anything else must come from the user. */
const isStructural = (tok: string) => /^\d{1,2}$/.test(tok) && Number(tok) <= 12

/** Fictional names/places used by our own sample decks. Seeing one in a user's deck means sample copy leaked. */
const SAMPLE_NAMES = ['northwind', 'contoso', 'fabrikam', 'acme corporation', 'priya nair', 'daniel okafor', 'mei tanaka', 'sam reyes', 'orbit 2.0', 'springfield']
const gram = (t: string, n: number) => { const w = t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean); return new Set(Array.from({ length: Math.max(0, w.length - n + 1) }, (_, i) => w.slice(i, i + n).join(' '))) }
let sampleGrams: Set<string> | null = null
const samples = () => (sampleGrams ??= new Set(Object.values(SKELETONS).flat().flatMap((s) => textOf(s as SlideContent)).flatMap((t) => [...gram(t, 6)])))

const words = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3)
const STOP = new Set(['with', 'that', 'this', 'from', 'about', 'what', 'have', 'your', 'their', 'will', 'into', 'over', 'make', 'cover', 'everything'])

export interface GateInput { userTexts: string[]; analysis: Pick<PromptAnalysis, 'requiredSections' | 'facts'>; }

export function checkContents(contents: SlideContent[], input: GateInput): QualityIssue[] {
  const issues: QualityIssue[] = []
  const allowed = allowedNumbers([...input.userTexts, ...(input.analysis.facts ?? [])])
  const userBlob = [...input.userTexts, ...(input.analysis.facts ?? [])].join(' ').toLowerCase()
  const seenTitles = new Map<string, number>()

  contents.forEach((c, idx) => {
    const slide = idx + 1
    const texts = textOf(c)
    const blob = texts.join(' \n ')
    const visible = texts.join(' ').trim()
    if (visible.length < 8) issues.push({ slide, kind: 'empty', problem: 'the slide has no readable content' })

    const bad = [...new Set(numberTokens(blob))].filter((t) => !allowed.has(t) && !isStructural(t))
    if (bad.length) issues.push({ slide, kind: 'invented_number', problem: `contains figures the user never gave (${bad.slice(0, 4).join(', ')}); remove them or say it without numbers` })

    const low = blob.toLowerCase()
    const name = SAMPLE_NAMES.find((n) => low.includes(n) && !userBlob.includes(n))
    const sampleGram = !name && [...gram(blob, 6)].some((g) => samples().has(g))
    if (name || sampleGram) issues.push({ slide, kind: 'sample_leak', problem: `uses sample/template wording${name ? ` ("${name}")` : ''}; write it from the user's own details` })

    const title = ('title' in c && typeof c.title === 'string' ? c.title : '').trim().toLowerCase()
    if (title) { if (seenTitles.has(title)) issues.push({ slide, kind: 'duplicate_title', problem: `same title as slide ${seenTitles.get(title)}` }); else seenTitles.set(title, slide) }
  })

  // coverage: every required section / fact should show up somewhere (≥ half of its meaningful words)
  const deckWords = new Set(contents.flatMap((c) => textOf(c).flatMap(words)))
  for (const need of [...input.analysis.requiredSections, ...(input.analysis.facts ?? [])]) {
    const w = words(need).filter((x) => !STOP.has(x))
    if (w.length === 0) continue
    const hit = w.filter((x) => deckWords.has(x) || [...deckWords].some((d) => d.length > 4 && x.length > 4 && (d.startsWith(x.slice(0, 5)) || x.startsWith(d.slice(0, 5))))).length
    if (hit / w.length < 0.5) issues.push({ slide: 0, kind: 'missing_topic', problem: `"${need.slice(0, 80)}" is not covered anywhere in the deck` })
  }
  return issues
}

/** Last-resort deterministic fix for invented numbers the model would not remove: drop the offending bullets (keeps ≥ 1). */
export function stripInventedNumbers(c: SlideContent, allowed: Set<string>): SlideContent {
  const bad = (t: string) => numberTokens(t).some((x) => !allowed.has(x) && !isStructural(x))
  if (c.layout === 'title-body' || c.layout === 'split-image-text') {
    const keep = c.bullets.filter((b) => !bad(b))
    return { ...c, bullets: keep.length ? keep : c.bullets.map((b) => b.replace(NUM, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean).slice(0, 1) }
  }
  return c
}

/** Slides (1-based) the repair pass should rewrite, with the problems to tell the model. */
export const repairRequests = (issues: QualityIssue[]) =>
  issues.filter((i) => i.slide > 0 && i.kind !== 'duplicate_title').map((i) => ({ slide: i.slide, problem: i.problem }))
