import { describe, expect, it } from 'vitest'
import type { SlideContent } from '@prompttoppt/validation'
import { lockPictures, sanitizeContent } from './policy.ts'

const slide = (extra: Record<string, unknown> = {}) => ({ layout: 'split-image-text', title: 'T', bullets: ['a'], imagePrompt: 'p', imageAlt: 'alt', speakerNotes: '', sources: [], ...extra }) as unknown as SlideContent

describe('a model can never choose a picture URL (security S8)', () => {
  it('strips imageUrl and attribution from model output when there was no previous picture', () => {
    const out = sanitizeContent(slide({ imageUrl: 'https://attacker.example/?d=SECRET', imageAttribution: { source: 's', license: 'l', url: 'https://attacker.example/x' } }), new Set(), true) as any
    expect(out.imageUrl).toBeUndefined()
    expect(out.imageAttribution).toBeUndefined()
  })
  it('carries over the slide\'s EXISTING picture instead of the model\'s answer', () => {
    const prev = slide({ imageUrl: 'https://images.unsplash.com/photo-1?ixid=x', imageAttribution: { source: 'Photo by A on Unsplash', license: 'Unsplash License' } })
    const out = sanitizeContent(slide({ imageUrl: 'https://attacker.example/pixel.png' }), new Set(), true, prev) as any
    expect(out.imageUrl).toBe('https://images.unsplash.com/photo-1?ixid=x')
    expect(out.imageAttribution.source).toContain('Unsplash')
  })
  it('leaves other layouts untouched', () => {
    const t = { layout: 'title-body', title: 'T', bullets: ['a'], speakerNotes: '', sources: [] } as unknown as SlideContent
    expect(lockPictures(t)).toEqual(t)
  })
})
