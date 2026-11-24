import { MORPH_PROFILES, MORPH_TEMPLATES, type MorphTemplate } from '@prompttoppt/theme/morph-templates'
import { isDark } from '@prompttoppt/theme'
import type { MorphDecision, PromptAnalysis } from '@prompttoppt/validation'
import { z } from 'zod'
import { gateway } from '../ai/gateway.ts'
import { morphMatchPrompt } from '../ai/prompts.ts'
import { planScenes, requestFacts } from './morph-scenes.ts'

/**
 * Which Morph deck a request becomes. THE ONE PLACE this is decided: the create page asks for it before anything is built (the slide count, the credits and the deck's first
 * frame all depend on the template, so it is settled before the job exists), and the job only ever receives the result.
 *
 *  1. Hard filters (code): what the person's plan allows (slides per deck, credits), whether the language can be set in the template's fonts, an explicit light or dark ask,
 *     and the template's pictures (a deck about taxes never gets a soda can).
 *  2. A deterministic score with readable reasons: topic words, deck family, picture world, length, figures. Pure, so it is unit-tested against a golden set.
 *  3. One small model call chooses between the closest few (or says that none fits). If it fails, a strong score is enough; otherwise the deck is custom.
 *
 * Anything that does not fit well becomes a custom deck planned from the topic: a poor template is never forced.
 */

export interface MatchLimits {
  /** slides one deck may have on this plan */
  maxSlides: number
  /** credits the person has now */
  balance: number
  /** the least one slide costs (the cheapest model tier): a template that costs more than the balance even then is set aside */
  slideCreditsFloor: number
}
export interface MatchInput { analysis: PromptAnalysis; prompt: string; limits: MatchLimits }

export interface Ranked { id: string; name: string; /** the length the deck would have */ slides: number; /** every length the plan and balance allow, longest first */ lengths: number[]; score: number; reasons: string[] }
export interface Shortlist { ranked: Ranked[]; excluded: MorphDecision['excluded'] }

/** Latin-script languages whose letters every template font covers. Everything else (Arabic, Hindi, Chinese, Vietnamese…) gets a custom deck, whose fonts are chosen per language. */
const LATIN = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'id', 'ms', 'tl', 'pl', 'cs', 'sk', 'ro', 'hu', 'ca', 'tr', 'sw', 'af'])
export const languageFitsTemplates = (code: string | undefined): boolean => LATIN.has((code ?? 'en').toLowerCase().split('-')[0]!)

/** Deck families a request's category is served by, best first. */
const FAMILIES: Record<NonNullable<PromptAnalysis['category']>, string[]> = {
  pitch: ['pitch', 'business'], sales: ['marketing', 'launch', 'business'], marketing: ['marketing', 'launch'], strategy: ['business'], product: ['launch', 'technology'],
  tech: ['technology'], reports: ['business', 'technology'], education: ['education'], 'case-studies': ['pitch', 'business'], team: ['business'],
}
/** Words that name a whole industry or activity rather than a subject: a hit on one of these alone says little. */
const BROAD = new Set(['business', 'product', 'technology', 'marketing', 'startup', 'brand', 'planning', 'plan', 'research', 'data', 'report', 'future', 'company', 'proposal', 'sales', 'event', 'learning', 'design', 'creative', 'modern', 'minimal', 'retail', 'campaign', 'strategy', 'launch', 'analytics', 'training', 'workshop', 'education', 'science', 'nature', 'team', 'teams', 'culture', 'values', 'welcome', 'office', 'people', 'staff', 'health', 'money', 'results', 'overview'])

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `
/** Whole-word / whole-phrase hit (a plural of the last word counts). */
const has = (text: string, phrase: string) => { const p = norm(phrase).trim(); return !!p && (text.includes(` ${p} `) || text.includes(` ${p}s `)) }
const requestText = (a: PromptAnalysis, prompt: string) => norm([a.topic, a.objective, a.audience, a.visualStyle, ...(a.requiredSections ?? []), ...(a.facts ?? []).slice(0, 8), prompt.slice(0, 1500)].filter(Boolean).join(' . '))

/** Steps 1 and 2: who is eligible, and how well each fits. Pure. */
export function shortlist(i: MatchInput): Shortlist {
  const { analysis: a, limits } = i
  const text = requestText(a, i.prompt)
  const facts = requestFacts(a, i.prompt)
  const excluded: MorphDecision['excluded'] = { plan: 0, language: 0, mood: 0, pictures: 0, credits: 0, topic: 0 }
  const ranked: Ranked[] = []
  const families = a.category ? FAMILIES[a.category] : []
  for (const t of MORPH_TEMPLATES) {
    const prof = MORPH_PROFILES[t.id]
    if (!prof) continue
    // the scenes this request gets, and the lengths it can have: a template longer than the plan allows can still be offered, shortened
    const plan = planScenes(t, facts)
    const withinPlan = plan.lengths.filter((n) => n <= limits.maxSlides)
    if (withinPlan.length === 0) { excluded.plan++; continue }
    const lengths = withinPlan.filter((n) => n * limits.slideCreditsFloor <= limits.balance)
    if (lengths.length === 0) { excluded.credits++; continue }
    const fit = lengths[0]!
    if (!languageFitsTemplates(a.language)) { excluded.language++; continue }
    const dark = isDark(t.colors.background)
    if ((a.lightMode && dark) || (a.darkMode && !dark)) { excluded.mood++; continue }

    const reasons: string[] = []
    // the template's own subject words
    let topic = 0
    const hits: string[] = []
    for (const phrase of t.topics) {
      if (!has(text, phrase)) continue
      const words = phrase.trim().split(/\s+/)
      topic += words.length > 1 ? 6 : BROAD.has(phrase.toLowerCase()) ? 1.5 : 4
      hits.push(phrase)
    }
    const topicScore = Math.min(45, topic * 3.5)
    if (hits.length) reasons.push(`topic: ${hits.slice(0, 3).join(', ')}`)
    // the deck family the request's category belongs to
    const fam = t.category ? families.indexOf(t.category) : -1
    const familyScore = fam === 0 ? 22 : fam > 0 ? 12 : a.category ? 0 : 6
    if (fam >= 0) reasons.push(`a ${t.category} deck`)
    // what the pictures show
    const subjectHits = prof.subjects.filter((s) => has(text, s))
    let picture = 0
    if (prof.art === 'subject') {
      if (!subjectHits.length) { excluded.pictures++; continue } // its pictures are about one subject, and this request is about another
      picture = 16 + Math.min(10, 5 * (subjectHits.length - 1)) // a request that is plainly about the template's subject (several of its words) is the best match there is
    } else if (prof.art === 'themed') picture = subjectHits.length ? 8 : -10
    else picture = 4
    if (subjectHits.length) reasons.push(`pictures suit ${subjectHits.slice(0, 2).join(', ')}`)
    // length: the template has a fixed number of slides; closer to what was asked is better
    const asked = a.slideCount
    const lengthScore = asked ? Math.max(-8, 8 - Math.min(...lengths.map((n) => Math.abs(n - asked)))) : 0
    // scenes the request cannot fill (a figure it never gave, a team it never named) and could not be left out stay empty: that counts against the template
    const figureScore = -plan.unfilled.length * 6
    if (plan.unfilled.length) reasons.push(`${plan.unfilled.length} scene${plan.unfilled.length > 1 ? 's' : ''} would stay empty`)
    else if (plan.dropped.length) reasons.push(`${plan.dropped.length} scene${plan.dropped.length > 1 ? 's' : ''} left out (no figures or people given)`)
    // a topic link is required: a family alone does not make a template right
    if (!hits.length && !subjectHits.length) { excluded.topic++; continue }
    const score = Math.round(topicScore + familyScore + picture + lengthScore + figureScore)
    ranked.push({ id: t.id, name: t.name, slides: fit, lengths, score, reasons })
  }
  ranked.sort((x, y) => y.score - x.score)
  return { ranked, excluded }
}

/** A template this good needs no second opinion when the model is unavailable. */
export const STRONG = 55
/** Below this a template is not offered at all. */
export const MINIMUM = 32

const answerSchema = z.object({ choice: z.string().max(40), confidence: z.number().min(0).max(1).optional(), reason: z.string().max(300).optional() })
type Ask = (i: MatchInput, top: Ranked[], ctx: { userId: string }) => Promise<z.infer<typeof answerSchema>>

async function ask(i: MatchInput, top: Ranked[], ctx: { userId: string }) {
  return gateway.run({
    route: 'fast', requestType: 'morph_match',
    ...morphMatchPrompt({
      analysis: i.analysis, userPrompt: i.prompt,
      templates: top.map((r) => { const t = MORPH_TEMPLATES.find((x) => x.id === r.id)!; const p = MORPH_PROFILES[t.id]!; return { id: t.id, name: t.name, tagline: t.tagline, mode: isDark(t.colors.background) ? 'dark' : 'light', slides: r.slides, pictures: p.art === 'abstract' ? 'abstract shapes and light (any subject)' : `pictures about: ${p.subjects.slice(0, 8).join(', ')}`, scenes: t.scenes.map((s) => s.title).join(' / ').slice(0, 260), audience: t.audience ?? t.description } }),
    }),
    schema: answerSchema, ctx, temperature: 0.2, maxOutputTokens: 300, thinkingBudget: 0,
  })
}

const custom = (reason: string, sl: Shortlist): MorphDecision => ({ mode: 'custom', confidence: 0.9, reason, candidates: sl.ranked.slice(0, 3).map(({ id, name, slides, lengths, score, reasons }) => ({ id, name, slides, lengths, score, reasons })), excluded: sl.excluded })

/** The decision for a request. Never throws: whatever goes wrong, the answer is a custom deck. */
export async function matchMorph(i: MatchInput, ctx: { userId: string }, askModel: Ask = ask): Promise<MorphDecision> {
  const sl = shortlist(i)
  const top = sl.ranked.filter((r) => r.score >= MINIMUM).slice(0, 3)
  if (!languageFitsTemplates(i.analysis.language)) return custom('The designed templates are set in Latin-script fonts. A custom deck uses fonts made for this language.', sl)
  if (top.length === 0) return custom(sl.excluded.plan > 0 && sl.ranked.length === 0 ? 'The templates that suit this topic are longer than your plan allows in one deck, so this deck is designed for your topic.' : 'None of the designed templates fits this topic well, so this deck is designed for it.', sl)
  const decide = (r: Ranked, confidence: number, reason: string): MorphDecision => ({
    mode: 'template', templateId: r.id, confidence: Math.round(confidence * 100) / 100, reason,
    candidates: [r, ...top.filter((x) => x.id !== r.id)].map(({ id, name, slides, lengths, score, reasons }) => ({ id, name, slides, lengths, score, reasons })), excluded: sl.excluded,
  })
  try {
    const a = await askModel(i, top, ctx)
    const pick = top.find((r) => r.id === a.choice)
    if (!pick) return custom(a.reason?.trim() || 'None of the designed templates fits this topic well, so this deck is designed for it.', sl)
    const confidence = Math.min(a.confidence ?? 0.7, 0.55 + pick.score / 200)
    if (confidence < 0.5) return custom('The closest template is not a strong enough fit, so this deck is designed for your topic.', sl)
    return decide(pick, confidence, a.reason?.trim() || `A good fit: ${pick.reasons.join('; ')}`)
  } catch {
    const best = top[0]!
    return best.score >= STRONG ? decide(best, Math.min(0.85, best.score / 100), `A good fit: ${best.reasons.join('; ')}`) : custom('No designed template is a clear fit for this topic, so this deck is designed for it.', sl)
  }
}
