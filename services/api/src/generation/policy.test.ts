import { describe, expect, it } from 'vitest'
import type { Outline, PromptAnalysis } from '@prompttoppt/validation'
import { condense, decideMode, hasNumbers, resolveSlideCount, sanitizeContent, sanitizeOutline } from './policy.ts'

const analysis = (o: Partial<PromptAnalysis> = {}): PromptAnalysis => ({ topic: 't', language: 'en', requiredSections: [], facts: [], specificity: 'broad_topic', missing: [], ...o })

describe('decideMode', () => {
  it('short topic is broad even if the model claims detailed', () => expect(decideMode('Salesforce Agentforce', analysis({ specificity: 'detailed' }), false)).toBe('broad'))
  it('long brief is detailed even if the model claims broad', () => expect(decideMode('word '.repeat(45), analysis(), false)).toBe('detailed'))
  it('stated constraints make a mid-length prompt detailed', () => expect(decideMode('Quarterly review for the sales team with revenue', analysis({ audience: 'sales team' }), false)).toBe('detailed'))
  it('supplied sources always go straight through', () => expect(decideMode('Q3', analysis(), true)).toBe('detailed'))
})

describe('slide count', () => {
  it('user number beats direction beats default, and is clamped', () => {
    expect(resolveSlideCount(analysis({ slideCount: 12 }))).toBe(12)
    expect(resolveSlideCount(analysis(), { id: 'x', title: 'x', description: 'x', suggestedSlideCount: 7 })).toBe(7)
    expect(resolveSlideCount(analysis())).toBe(10)
    expect(resolveSlideCount(analysis({ slideCount: 500 }))).toBe(60)
    expect(resolveSlideCount(analysis({ slideCount: 500 }), undefined, undefined, 20)).toBe(20)
    expect(resolveSlideCount(analysis({ slideCount: 1 }))).toBe(3)
  })
})

describe('anti-fabrication guards', () => {
  it('numbers allowed only when present in prompt or sources', () => {
    expect(hasNumbers('market overview', [])).toBe(false)
    expect(hasNumbers('market overview 2025', [])).toBe(true)
    expect(hasNumbers('overview', ['revenue grew 12%'])).toBe(true)
  })
  const outline = (layouts: string[]): Outline => ({ title: 'T', slides: layouts.map((layout, i) => ({ title: `s${i}`, purpose: 'p', layout, keyPoints: [], needsVisual: false })) })
  it('replaces chart/metrics when no numbers exist, forces title first and a proper close', () => {
    const o = sanitizeOutline(outline(['title-body', 'chart', 'metrics', 'process', 'quote']), 5, false)
    // 5 slides: one content slide becomes picture + text (decks are photo-led)
    expect(o.slides.map((s) => s.layout)).toEqual(['title', 'title-body', 'split-image-text', 'process', 'thank-you'])
  })
  it('photo-led: a long deck gets two picture slides, a tiny one none, and existing picture slides are kept', () => {
    const long = sanitizeOutline(outline(['title', 'title-body', 'title-body', 'title-body', 'title-body', 'title-body', 'process', 'thank-you']), 8, true)
    expect(long.slides.filter((s) => s.layout === 'split-image-text').length).toBeGreaterThanOrEqual(2)
    expect(sanitizeOutline(outline(['title', 'title-body', 'thank-you']), 3, true).slides.some((s) => s.layout === 'split-image-text')).toBe(false)
    expect(sanitizeOutline(outline(['title', 'split-image-text', 'split-image-text', 'title-body', 'title-body', 'thank-you']), 6, true).slides.filter((s) => s.layout === 'split-image-text')).toHaveLength(2)
  })
  it('pads short outlines and trims long ones to the requested count', () => {
    expect(sanitizeOutline(outline(['title', 'process', 'thank-you']), 6, true).slides).toHaveLength(6)
    expect(sanitizeOutline(outline(Array(9).fill('title-body')), 5, true).slides).toHaveLength(5)
  })
  it('drops citations to unknown sources and rewrites numeric slides', () => {
    const c = sanitizeContent({ layout: 'title-body', title: 't', bullets: ['a'], speakerNotes: '', sources: [{ sourceId: 'real' }, { sourceId: 'invented' }] }, new Set(['real']), true)
    expect(c.sources).toEqual([{ sourceId: 'real' }])
    const m = sanitizeContent({ layout: 'metrics', title: 't', metrics: [{ value: '9', label: 'x' }, { value: '8', label: 'y' }], speakerNotes: '', sources: [] }, new Set(), false)
    expect(m.layout).toBe('title-body')
  })
  it('condense shortens without changing layout', () => {
    const c = condense({ layout: 'title-body', title: 't', bullets: Array(6).fill('x'.repeat(200)), speakerNotes: '', sources: [] })
    expect(c.layout === 'title-body' && c.bullets.length).toBe(4)
  })
})

describe('hasNumbers', () => {
  it('ignores deck-size instructions but keeps real figures', async () => {
    const { hasNumbers } = await import('./policy.ts')
    expect(hasNumbers('Make an 8 slide deck about my QA internship, 10 minutes', [])).toBe(false)
    expect(hasNumbers('Revenue grew 40% last year', [])).toBe(true)
    expect(hasNumbers('about my internship', ['we shipped 12 releases'])).toBe(true)
  })
})
