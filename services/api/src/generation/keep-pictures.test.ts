import { describe, expect, it } from 'vitest'
import { existingPicture, keepExistingPictures } from './keep-pictures.ts'

describe('"replace all pictures" never loses a picture (real QA case C37)', () => {
  const old = (src: string) => ({ src, alt: src })
  it('a new DIFFERENT picture replaces the old one; nothing found keeps the old one; the SAME picture back counts as not replaced; slides without one are untouched', () => {
    const before = [old('a.jpg'), old('b.jpg'), old('c.jpg'), null]
    const { picks, kept } = keepExistingPictures([old('new-a.jpg'), null, old('c.jpg'), null], before)
    expect(picks.map((p) => p?.src ?? null)).toEqual(['new-a.jpg', 'b.jpg', 'c.jpg', null])
    expect(kept).toEqual([1, 2])
  })
  it('a slide the refresh did not look up (undefined) keeps its picture too', () => {
    expect(keepExistingPictures([undefined], [old('a.jpg')]).picks[0]?.src).toBe('a.jpg')
  })
  it('the picture a slide shows: its own picture field, else its first real picture (never the decorative logo), else its background picture', () => {
    expect(existingPicture({ content: { layout: 'split-image-text', imageUrl: 'u.jpg', imageAlt: 'U' } as never, elements: [], background: undefined })).toEqual({ src: 'u.jpg', alt: 'U' })
    expect(existingPicture({ content: { layout: 'thank-you' } as never, elements: [{ type: 'image', decorative: true, src: 'logo.png' }, { type: 'image', src: 'thanks.jpg', alt: 'T' }] as never, background: undefined })).toEqual({ src: 'thanks.jpg', alt: 'T' })
    expect(existingPicture({ content: { layout: 'title' } as never, elements: [], background: { type: 'image', value: 'bg.jpg' } } as never)).toEqual({ src: 'bg.jpg', alt: '' })
    expect(existingPicture({ content: { layout: 'title-body' } as never, elements: [], background: { type: 'color', value: '#fff' } } as never)).toBeNull()
  })
})
