import { describe, expect, it } from 'vitest'
import { MORPH_SCENES, morphPlanSchema, slideContentSchema, type MorphPlan } from '@prompttoppt/validation'
import { fallbackScenes, morphContents, sanitizeMorphPlan, scrubNumbers, type MorphRules } from './morph-plan.ts'

const concepts = [{ heading: 'Agents', text: 'Do the routine work.' }, { heading: 'Data', text: 'Grounded in yours.' }, { heading: 'Guardrails', text: 'Clear limits.' }, { heading: 'Value', text: 'Measured early.' }]
const scene = (s: MorphPlan['scenes'][number]['scene'], extra: object = {}) => ({ scene: s, title: `About ${s}`, notes: 'say it', ...extra }) as MorphPlan['scenes'][number]
const plan = (scenes: MorphPlan['scenes'], n = concepts.length): MorphPlan => ({ title: 'Deck', concepts: concepts.slice(0, n), scenes })
const rules = (o: Partial<MorphRules> = {}): MorphRules => ({ allowNumeric: false, allowQuote: false, allowedNumbers: new Set(), ...o })
const names = (p: MorphPlan) => p.scenes.map((s) => s.scene)

describe('the built-in story', () => {
  it('always starts with a cover and ends with a closing, for any length', () => {
    for (let n = 2; n <= 60; n++) { const f = fallbackScenes(n); expect(f).toHaveLength(n); expect(f[0]).toBe('cover'); expect(f[n - 1]).toBe('closing') }
    expect(fallbackScenes(1)).toEqual(['cover'])
  })
  it('never repeats a scene three times in a row and never spotlights before the concepts have been shown', () => {
    for (let n = 3; n <= 60; n++) {
      const f = fallbackScenes(n)
      for (let i = 2; i < n; i++) expect(f[i] === f[i - 1] && f[i] === f[i - 2], `n=${n} at ${i}`).toBe(false)
      const firstSpot = f.indexOf('spotlight'), firstOverview = f.findIndex((s) => ['hero-left', 'cards-row', 'cards-column', 'cards-grid'].includes(s))
      if (firstSpot >= 0) expect(firstOverview).toBeGreaterThanOrEqual(0), expect(firstOverview).toBeLessThan(firstSpot)
    }
  })
})

describe('sanitizeMorphPlan: whatever the model returns, the plan follows the rules', () => {
  it('forces a cover first and a closing last, and exactly n scenes', () => {
    const p = sanitizeMorphPlan(plan([scene('cards-row'), scene('spotlight'), scene('timeline')]), 5, rules())
    expect(p.scenes).toHaveLength(5)
    expect(names(p)[0]).toBe('cover'); expect(names(p)[4]).toBe('closing')
    const long = sanitizeMorphPlan(plan(Array.from({ length: 12 }, () => scene('cards-row'))), 6, rules())
    expect(long.scenes).toHaveLength(6); expect(names(long)[5]).toBe('closing')
  })
  it('a spotlight before the concepts are shown becomes an overview', () => {
    const p = sanitizeMorphPlan(plan([scene('cover'), scene('spotlight', { focus: 2 }), scene('cards-row'), scene('closing')]), 4, rules())
    expect(names(p)).toEqual(['cover', 'cards-row', 'cards-row', 'closing'])
  })
  it('each spotlight takes a different concept than the last, using the model\'s choice when it is a real concept', () => {
    const p = sanitizeMorphPlan(plan([scene('cover'), scene('cards-row'), scene('spotlight', { focus: 3 }), scene('spotlight', { focus: 3 }), scene('spotlight'), scene('closing')]), 6, rules())
    const f = p.scenes.filter((s) => s.scene === 'spotlight').map((s) => s.focus)
    expect(f[0]).toBe(3)
    expect(f[1]).not.toBe(f[0]); expect(f[2]).not.toBe(f[1])
    expect(f.every((x) => x !== undefined && x < 4)).toBe(true)
    // with only two concepts the focus is still a valid index
    const two = sanitizeMorphPlan(plan([scene('cover'), scene('cards-row'), scene('spotlight', { focus: 3 }), scene('closing')], 2), 4, rules())
    expect(two.scenes[2]!.focus).toBeLessThan(2)
  })
  it('never the same scene three times in a row', () => {
    const p = sanitizeMorphPlan(plan([scene('cover'), ...Array.from({ length: 6 }, () => scene('cards-grid')), scene('closing')]), 8, rules())
    for (let i = 2; i < 8; i++) expect(p.scenes[i]!.scene === p.scenes[i - 1]!.scene && p.scenes[i]!.scene === p.scenes[i - 2]!.scene, `at ${i}`).toBe(false)
  })
  it('a quote only when the user gave a real quote; a big stat only when the user gave a figure', () => {
    const raw = plan([scene('cover'), scene('cards-row'), scene('quote'), scene('big-stat', { stat: { value: '42%', label: 'faster' } }), scene('closing')])
    const no = sanitizeMorphPlan(raw, 5, rules())
    expect(names(no)).toEqual(['cover', 'cards-row', 'focus-hero', 'cards-grid', 'closing'])
    expect(no.scenes.every((s) => !s.stat)).toBe(true)
    const yes = sanitizeMorphPlan(raw, 5, rules({ allowNumeric: true, allowQuote: true, allowedNumbers: new Set(['42%']) }))
    expect(names(yes)).toEqual(['cover', 'cards-row', 'quote', 'big-stat', 'closing'])
    expect(yes.scenes[3]!.stat).toEqual({ value: '42%', label: 'faster' })
    // a big stat the model forgot to give a figure for cannot stay a big stat
    expect(names(sanitizeMorphPlan(plan([scene('cover'), scene('cards-row'), scene('big-stat'), scene('closing')]), 4, rules({ allowNumeric: true })))[2]).toBe('cards-grid')
  })
  it('figures the user never gave are taken out of the words; figures the user gave, and small structural numbers, stay', () => {
    const p = sanitizeMorphPlan(plan([scene('cover', { title: 'Grow 300% in 2027 with 3 ideas', subtitle: 'Saves $4.2M a year' }), scene('closing')]), 2, rules({ allowedNumbers: new Set(['2027']) }))
    expect(p.scenes[0]!.title).toBe('Grow in 2027 with 3 ideas')
    expect(p.scenes[0]!.subtitle).not.toMatch(/4\.2/)
  })
  it('every plan it returns produces valid slides', () => {
    const p = sanitizeMorphPlan(plan(MORPH_SCENES.map((s) => scene(s))), 12, rules({ allowNumeric: true, allowQuote: true }))
    for (const c of morphContents(p, { url: 'https://example.com/a.jpg', alt: 'a picture' })) expect(slideContentSchema.safeParse(c).success, JSON.stringify(c).slice(0, 200)).toBe(true)
  })
  it('a plan of one slide is just a cover', () => {
    expect(names(sanitizeMorphPlan(plan([scene('closing')]), 1, rules()))).toEqual(['cover'])
  })
})

describe('morphContents: the same cards on every slide', () => {
  it('every slide carries the same concepts in the same order, the picture, and its own words', () => {
    const p = sanitizeMorphPlan(plan([scene('cover'), scene('cards-row'), scene('spotlight'), scene('closing')]), 4, rules())
    const cs = morphContents({ ...p, imageIntent: 'a team' }, { url: 'https://example.com/a.jpg', alt: 'a team', attribution: { source: 'Unsplash', license: 'Unsplash License' } })
    expect(cs).toHaveLength(4)
    for (const c of cs) {
      if (c.layout !== 'morph') throw new Error('not a morph slide')
      expect(c.items.map((i) => i.heading)).toEqual(concepts.map((x) => x.heading))
      expect(c.imageUrl).toBe('https://example.com/a.jpg'); expect(c.imageAttribution?.source).toBe('Unsplash')
    }
    expect(cs.map((c) => (c.layout === 'morph' ? c.title : ''))).toEqual(p.scenes.map((s) => s.title))
  })
  it('without a picture there is no image field at all', () => {
    const c = morphContents(plan([scene('cover')]), null)[0]!
    expect(c.layout === 'morph' && c.imageUrl).toBeUndefined()
  })
})

describe('the plan the model writes', () => {
  it('has to name 2 to 4 concepts and valid scenes', () => {
    expect(morphPlanSchema.safeParse(plan([scene('cover')])).success).toBe(true)
    expect(morphPlanSchema.safeParse({ ...plan([scene('cover')]), concepts: [concepts[0]] }).success).toBe(false)
    expect(morphPlanSchema.safeParse({ ...plan([scene('cover')]), scenes: [{ scene: 'nope', title: 'x' }] }).success).toBe(false)
  })
  it('scrubNumbers leaves a text without figures alone', () => { expect(scrubNumbers('Plain words', new Set())).toBe('Plain words') })
})
