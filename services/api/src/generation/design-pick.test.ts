import { describe, expect, it, vi } from 'vitest'
import { DESIGNS, pickDesign } from '@prompttoppt/theme'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { candidateDesigns, chooseDesign } from './design-pick.ts'

const analysis = (category: PromptAnalysis['category']): PromptAnalysis => ({ topic: 'Spring flower festival', language: 'en', requiredSections: [], facts: [], specificity: 'detailed', missing: [], ...(category ? { category } : {}) })
const ctx = { userId: 'u', jobId: 'j' }

describe('the template is chosen for the topic', () => {
  it('offers the topic\'s category; the Starter plan only its free designs', () => {
    const free = candidateDesigns('education', false), all = candidateDesigns('education', true)
    expect(free.length).toBeGreaterThan(0)
    expect(free.every((d) => d.category === 'education' && !d.premium)).toBe(true)
    expect(all.length).toBeGreaterThan(free.length)
    expect(candidateDesigns(undefined, true).every((d) => d.category === 'strategy')).toBe(true)
  })
  it('uses the template the model names', async () => {
    const pool = candidateDesigns('marketing', true)
    const want = pool[pool.length - 1]!
    const ask = vi.fn(async () => want.id)
    const d = await chooseDesign({ analysis: analysis('marketing'), prompt: 'x', premiumAllowed: true, ctx, ask })
    expect(d.id).toBe(want.id)
    expect(ask).toHaveBeenCalledOnce()
  })
  it('a Starter plan can never get a premium template, whatever the model says', async () => {
    const premium = candidateDesigns('marketing', true).find((d) => d.premium)!
    const d = await chooseDesign({ analysis: analysis('marketing'), prompt: 'launch plan', premiumAllowed: false, ctx, ask: async () => premium.id })
    expect(d.premium).toBe(false)
    expect(d).toEqual(pickDesign('marketing', false, 'launch plan'))
  })
  it('an id that is not on the list, or a failing call, falls back to the stable choice (the deck is never held up)', async () => {
    const fallback = pickDesign('tech', true, 'p')
    expect((await chooseDesign({ analysis: analysis('tech'), prompt: 'p', premiumAllowed: true, ctx, ask: async () => 'made-up-design' })).id).toBe(fallback.id)
    expect((await chooseDesign({ analysis: analysis('tech'), prompt: 'p', premiumAllowed: true, ctx, ask: async () => { throw new Error('model down') } })).id).toBe(fallback.id)
  })
  it('every design carries the look it was made with', () => {
    expect(DESIGNS.every((d) => d.look.mode === 'light' || d.look.mode === 'dark')).toBe(true)
    expect(new Set(DESIGNS.map((d) => d.look.mode)).size).toBe(2)
  })
})
