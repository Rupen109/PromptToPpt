import { describe, expect, it } from 'vitest'
import { MORPH_PROFILES, MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { MINIMUM, languageFitsTemplates, matchMorph, shortlist, type MatchInput } from './morph-match.ts'

type Cat = NonNullable<PromptAnalysis['category']>
const A = (prompt: string, category: Cat | undefined, extra: Partial<PromptAnalysis> = {}): MatchInput => ({
  prompt, analysis: { topic: prompt, language: 'en', requiredSections: [], facts: [], ...(category ? { category } : {}), ...extra } as PromptAnalysis,
  limits: { maxSlides: 25, balance: 5000, slideCreditsFloor: 1 },
})
const best = (i: MatchInput) => shortlist(i).ranked.filter((r) => r.score >= MINIMUM)[0]?.id ?? 'custom'

/** Requests a person really types, and the templates a careful human would accept for each. 'custom' means: no designed template fits, build the deck from the topic. */
const GOLDEN: [string, Cat | undefined, string[]][] = [
  // pitch
  ['Investor pitch deck for our AI scheduling startup, seed round', 'pitch', ['pitch-orbit', 'pitch-market', 'pitch-cards']],
  ['Series A pitch with market size, competition and go-to-market for a B2B SaaS', 'pitch', ['pitch-market']],
  ['Founder story for our handmade ceramics marketplace, pre-seed pitch', 'pitch', ['pitch-cards']],
  ['Demo day pitch for a fintech platform', 'pitch', ['pitch-orbit', 'pitch-market', 'pitch-cards']],
  // business
  ['Annual report 2025: financial results and sustainability for shareholders', 'reports', ['biz-annual']],
  ['Quarterly business review with KPI dashboard and SaaS metrics', 'reports', ['tech-dashboard']],
  ['Product roadmap for next year with milestones and phases', 'product', ['biz-roadmap']],
  ['Business strategy review with OKRs and SWOT for the board', 'strategy', ['biz-matrix']],
  ['Company business plan with our products and market numbers', 'strategy', ['biz', 'biz-matrix', 'pitch-market', 'biz-roadmap']],
  // marketing
  ['Social media strategy and content calendar for our Instagram brand', 'marketing', ['mkt-feed']],
  ['Brand guidelines and moodboard for a candle company rebrand', 'marketing', ['mkt-moodboard']],
  ['Summer advertising campaign for a new soda: billboard and promotion plan', 'marketing', ['mkt-billboard', 'launch']],
  ['Creative studio portfolio for an architecture and design agency', 'marketing', ['cool']],
  // launch
  ['Unboxing keynote for our new wireless headphones launch', 'product', ['launch-unbox']],
  ['App launch: what is new in version 3, feature release notes', 'product', ['launch-spotlight']],
  ['Launch event countdown for our new sneaker drop', 'product', ['launch-countdown']],
  ['Launch of our new sparkling fruit drink for retail stores', 'product', ['launch', 'mkt-billboard']],
  // sales, case studies and teams
  ['Sales proposal for a new client: their needs, our solution, pricing and next steps', 'sales', ['biz-sales']],
  ['Quote and statement of work for a customer, with three pricing options', 'sales', ['biz-sales']],
  ['Customer success story: how Acme cut onboarding time, with the results', 'case-studies', ['biz-casestudy']],
  ['Project retrospective with lessons learned and before and after results', 'case-studies', ['biz-casestudy']],
  ['Onboarding welcome for new hires: our culture, values and first weeks', 'team', ['biz-team']],
  // health
  ['Mental health and mindfulness workshop for staff', 'education', ['edu-health']],
  ['Hand hygiene and infection prevention training for hospital nurses', 'education', ['edu-health']],
  // money
  ['Personal finance workshop: budgeting, savings goals and investing basics', 'education', ['biz-finance']],
  ['Household budget plan: income, spending and a savings goal', 'strategy', ['biz-finance']],
  // technology
  ['Machine learning project briefing: data, model training and evaluation', 'tech', ['tech-neural']],
  ['Embedded systems hardware design review for a new microcontroller board', 'tech', ['tech-circuit']],
  ['Analytics report with KPI metrics for the product team', 'tech', ['tech-dashboard']],
  // education
  ['Lesson on the solar system for grade 5', 'education', ['space', 'edu-chalk', 'edu']],
  ['Chemistry lesson on atoms and molecules for secondary school', 'education', ['edu-lab']],
  ['Geography lesson: the journey of a river from mountain to sea', 'education', ['edu-atlas']],
  ['School lesson plan on fractions with a quiz and homework', 'education', ['edu-chalk']],
  ['Kids dinosaur lesson for an elementary class', 'education', ['edu']],
  ['Chandrayaan-3: how India landed on the Moon', 'education', ['space']],
  // topics with no designed template: a custom deck, never a template with wrong pictures
  ['Tax planning guide for freelancers', 'strategy', ['custom', 'biz-finance']],
  ['Employee onboarding welcome for new hires', 'team', ['custom', 'biz-team']],
  ['Hospital patient safety training for nurses', 'education', ['custom', 'edu-chalk', 'edu-health']],
  ['GDPR compliance overview for the legal team', 'reports', ['custom']],
  ['Cooking class: how to make fresh pasta', 'education', ['custom', 'edu-chalk']],
  ['Non-profit fundraising gala sponsorship proposal', 'sales', ['custom']],
  ['Cybersecurity awareness training for all staff', 'tech', ['custom', 'edu-chalk']],
  ['Case study: how we cut shipping costs for a retail client', 'case-studies', ['custom', 'biz-casestudy']],
  ['Real estate listing presentation for a family home', 'sales', ['custom']],
  ['Yoga studio wellness retreat overview', 'marketing', ['custom', 'cool', 'mkt-moodboard', 'mkt-feed', 'edu-health']],
  ['Wedding planning timeline and checklist', undefined, ['custom', 'biz-roadmap']],
]

describe('Morph match: the deterministic shortlist against a golden set', () => {
  for (const [prompt, cat, ok] of GOLDEN) {
    it(`${ok[0] === 'custom' && ok.length === 1 ? 'custom' : ok.join(' | ')} ← ${prompt}`, () => {
      const got = best(A(prompt, cat))
      expect(ok, `chose ${got}; shortlist ${JSON.stringify(shortlist(A(prompt, cat)).ranked.slice(0, 3).map((r) => [r.id, r.score]))}`).toContain(got)
    })
  }

  it('never offers a template whose pictures are about another subject (every subject template, every golden request)', () => {
    const subjectTemplates = MORPH_TEMPLATES.filter((t) => MORPH_PROFILES[t.id]?.art === 'subject').map((t) => t.id)
    for (const [prompt, cat, ok] of GOLDEN) {
      if (ok.length !== 1 || ok[0] !== 'custom') continue // the requests with NO fitting template at all
      const offered = shortlist(A(prompt, cat)).ranked.filter((r) => r.score >= MINIMUM).map((r) => r.id)
      expect(offered.filter((id) => subjectTemplates.includes(id)), prompt).toEqual([])
    }
  })
})

describe('Morph match: hard filters', () => {
  const pitch = A('Series A pitch with market size, competition and go-to-market for a B2B SaaS', 'pitch')
  it('a template longer than the plan allows is offered SHORTENED; one that cannot be shortened enough is set aside (and counted)', () => {
    const small = shortlist({ ...pitch, limits: { ...pitch.limits, maxSlides: 12 } })
    const market = small.ranked.find((r) => r.id === 'pitch-market')! // 13 scenes in full
    expect(market.slides).toBeLessThanOrEqual(12)
    expect(market.lengths.every((n) => n <= 12)).toBe(true)
    const tiny = shortlist({ ...pitch, limits: { ...pitch.limits, maxSlides: 8 } })
    expect(tiny.ranked.every((r) => r.lengths.every((n) => n <= 8))).toBe(true)
    expect(tiny.excluded.plan).toBeGreaterThan(0)
    expect(tiny.ranked.find((r) => r.id === 'pitch-orbit')!.slides).toBeLessThanOrEqual(8) // 11 in full, 7 at its shortest
  })
  it('sets aside templates the credits cannot pay for, even at their shortest', () => {
    const poor = shortlist({ ...pitch, limits: { maxSlides: 25, balance: 6, slideCreditsFloor: 1 } })
    expect(poor.ranked.every((r) => r.lengths.every((n) => n <= 6))).toBe(true)
    expect(poor.excluded.credits).toBeGreaterThan(0)
  })
  it('a template whose team scene cannot be filled loses points, and one with every scene fillable wins a tie', () => {
    const noPeople = shortlist(A('Investor pitch deck for our AI scheduling startup, seed round', 'pitch')).ranked
    const withPeople = shortlist(A('Investor pitch deck for our AI scheduling startup with our founding team, seed round', 'pitch')).ranked
    const orbit = (r: typeof noPeople) => r.find((x) => x.id === 'pitch-orbit')!
    expect(orbit(noPeople).slides).toBe(10) // the team scene is left out
    expect(orbit(withPeople).slides).toBe(11)
  })
  it('an explicit light or dark request keeps only that mood', () => {
    const light = shortlist(A('Investor pitch deck for a startup, fundraising seed', 'pitch', { lightMode: true })).ranked
    expect(light.length).toBeGreaterThan(0)
    for (const r of light) expect(MORPH_TEMPLATES.find((t) => t.id === r.id)!.colors.background.toLowerCase()).not.toMatch(/^#0|^#1[0-3]/)
    const dark = shortlist(A('Investor pitch deck for a startup, fundraising seed', 'pitch', { darkMode: true })).ranked
    expect(dark.map((r) => r.id)).not.toContain('pitch-market')
  })
  it('only Latin-script languages are matched to the designed templates', () => {
    for (const code of ['en', 'es', 'de', 'fr', 'pt', 'pl', 'hu', 'sv', 'it', 'id']) expect(languageFitsTemplates(code), code).toBe(true)
    for (const code of ['ar', 'hi', 'zh', 'vi', 'ja', 'ru', 'he']) expect(languageFitsTemplates(code), code).toBe(false)
    expect(shortlist(A('Investor pitch deck for a startup', 'pitch', { language: 'ar' })).ranked).toHaveLength(0)
  })
  it('a deck that asks for a length prefers the template closest to it', () => {
    const near = shortlist(A('Investor pitch deck for a SaaS startup, seed fundraising', 'pitch', { slideCount: 11 })).ranked
    const far = shortlist(A('Investor pitch deck for a SaaS startup, seed fundraising', 'pitch', { slideCount: 25 })).ranked
    expect(near.find((r) => r.id === 'pitch-orbit')!.score).toBeGreaterThan(far.find((r) => r.id === 'pitch-orbit')!.score)
  })
})

describe('Morph match: the decision', () => {
  const ctx = { userId: 'u' }
  const pitch = A('Series A pitch with market size, competition and go-to-market for a B2B SaaS', 'pitch')
  it('uses the model\'s choice among the closest, with its reason', async () => {
    const d = await matchMorph(pitch, ctx, async (_i, top) => ({ choice: top[0]!.id, confidence: 0.9, reason: 'The market scenes suit your pitch.' }))
    expect(d.mode).toBe('template'); expect(d.templateId).toBe('pitch-market'); expect(d.reason).toBe('The market scenes suit your pitch.')
    expect(d.candidates[0]!.id).toBe('pitch-market')
  })
  it('builds a custom deck when the model says none fits', async () => {
    const d = await matchMorph(pitch, ctx, async () => ({ choice: 'none', reason: 'The pictures do not belong to this topic.' }))
    expect(d.mode).toBe('custom'); expect(d.templateId).toBeUndefined(); expect(d.reason).toMatch(/pictures/)
  })
  it('ignores an id the model made up', async () => {
    const d = await matchMorph(pitch, ctx, async () => ({ choice: 'not-a-template', confidence: 1 }))
    expect(d.mode).toBe('custom')
  })
  it('a strong score is enough when the model call fails; a weak one is not', async () => {
    const boom = async () => { throw new Error('down') }
    const strong = await matchMorph(pitch, ctx, boom)
    expect(strong.mode).toBe('template'); expect(strong.templateId).toBe('pitch-market')
    const weak = await matchMorph(A('Wedding planning timeline and checklist', undefined), ctx, boom)
    expect(weak.mode).toBe('custom')
  })
  it('does not call the model when nothing is eligible (a custom deck, at no cost)', async () => {
    let calls = 0
    const d = await matchMorph(A('Real estate listing presentation for a family home', 'sales'), ctx, async () => { calls++; return { choice: 'none' } })
    expect(d.mode).toBe('custom'); expect(calls).toBe(0)
  })
  it('a language the template fonts cannot set is a custom deck, with the reason', async () => {
    const d = await matchMorph(A('Investor pitch deck for a startup', 'pitch', { language: 'ar' }), ctx, async () => ({ choice: 'pitch-orbit' }))
    expect(d.mode).toBe('custom'); expect(d.reason).toMatch(/language/i)
  })
  it('a low model confidence becomes a custom deck', async () => {
    const d = await matchMorph(pitch, ctx, async (_i, top) => ({ choice: top[0]!.id, confidence: 0.2 }))
    expect(d.mode).toBe('custom')
  })
})
