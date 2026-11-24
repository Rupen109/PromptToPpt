import { describe, expect, it } from 'vitest'
import { getMorphTemplate } from '@prompttoppt/theme/morph-templates'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { hasFigures, planScenes, requestFacts, unfillableScenes } from './morph-scenes.ts'

const an = (topic: string, extra: Partial<PromptAnalysis> = {}) => ({ topic, language: 'en', requiredSections: [], facts: [], ...extra }) as PromptAnalysis

describe('what a request can fill', () => {
  it('a figure is a figure; a year or a bare index is not', () => {
    expect(hasFigures(['Revenue grew 40% last year'])).toBe(true)
    expect(hasFigures(['Our plan for 2026'])).toBe(false)
    expect(hasFigures(['A pitch for a startup'])).toBe(false)
    expect(hasFigures([undefined, 'We have 3 offices'])).toBe(true)
  })
  it('people are signalled by words about a team; names are never invented', () => {
    expect(requestFacts(an('Pitch for our startup'), 'Pitch with our founders and team').people).toBe(true)
    expect(requestFacts(an('Pitch for a startup'), 'Pitch deck about the product').people).toBe(false)
  })
  it('a team scene and a figure scene are not fillable without people / figures; everything else is', () => {
    const orbit = getMorphTemplate('pitch-orbit')!
    expect(unfillableScenes(orbit, { figures: false, people: false })).toEqual(['s8']) // Team
    expect(unfillableScenes(orbit, { figures: false, people: true })).toEqual([])
    const market = getMorphTemplate('pitch-market')!
    expect(unfillableScenes(market, { figures: false, people: true })).toEqual(['s9']) // Traction line
    expect(unfillableScenes(market, { figures: true, people: true })).toEqual([])
  })
  it('the first and the last scene are never listed (they cannot be left out)', () => {
    for (const id of ['tech-dashboard', 'edu-atlas', 'space']) {
      const t = getMorphTemplate(id)!
      const bad = unfillableScenes(t, { figures: false, people: false })
      expect(bad).not.toContain(t.scenes[0]!.id); expect(bad).not.toContain(t.scenes.at(-1)!.id)
    }
  })
})

describe('the scenes a deck gets', () => {
  it('leaves out the team scene when nobody is named, and says what could not be left out', () => {
    const orbit = getMorphTemplate('pitch-orbit')!
    const p = planScenes(orbit, { figures: true, people: false })
    expect(p.scenes).not.toContain('s8'); expect(p.scenes).toHaveLength(orbit.scenes.length - 1)
    expect(p.dropped).toEqual([{ scene: 's8', why: 'cannot-fill' }]); expect(p.unfilled).toEqual([])
    // a figure scene (pitch-market's traction line) goes too when its neighbours can still morph into each other
    const market = getMorphTemplate('pitch-market')!
    const m = planScenes(market, { figures: false, people: true })
    expect(m.scenes).not.toContain('s9'); expect(m.unfilled).toEqual([])
  })
  it('a shorter length leaves out the least important scenes after the ones that cannot be filled', () => {
    const t = getMorphTemplate('space')!
    const p = planScenes(t, { figures: true, people: false }, 12)
    expect(p.scenes).toHaveLength(12)
    expect(p.dropped[0]).toEqual({ scene: 's9', why: 'cannot-fill' }) // Team first: nobody is named
    expect(p.dropped.slice(1).every((d) => d.why === 'shorter')).toBe(true)
    expect(p.scenes[0]).toBe('s1'); expect(p.scenes.at(-1)).toBe('s20')
  })
  it('lengths run from the longest the request allows down to the shortest', () => {
    const t = getMorphTemplate('pitch-orbit')!
    const { lengths } = planScenes(t, { figures: true, people: true })
    expect(lengths[0]).toBe(11); expect(lengths.at(-1)).toBe(7)
  })
})
