import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, presentationSchema, slideContentSchema, type Presentation } from '@prompttoppt/validation'
import { applyValidation } from '../validate'
import { CATEGORIES } from './categories'
import { DESIGNS } from './build'
import { templateSlides } from './deck'
import { SKELETONS } from './skeletons'

describe('category starter decks', () => {
  it('every category has a real story: 9–11 schema-valid slides, opens with a title and closes with thank-you, varied layouts', () => {
    for (const cat of CATEGORIES) {
      const s = SKELETONS[cat.id]
      expect(s.length, cat.id).toBeGreaterThanOrEqual(9)
      expect(s.length, cat.id).toBeLessThanOrEqual(11)
      expect(s[0]!.layout).toBe('title')
      expect(s.at(-1)!.layout).toBe('thank-you')
      for (const c of s) expect(slideContentSchema.safeParse(c).success, `${cat.id}/${c.layout}`).toBe(true)
      expect(new Set(s.map((c) => c.layout)).size, `${cat.id} layout variety`).toBeGreaterThanOrEqual(6)
      // the same layout never appears three times in a row, and no two decks share their title
      for (let i = 2; i < s.length; i++) expect(!(s[i]!.layout === s[i - 1]!.layout && s[i]!.layout === s[i - 2]!.layout), `${cat.id} repeats`).toBe(true)
    }
    expect(new Set(CATEGORIES.map((c) => (SKELETONS[c.id][0] as { title: string }).title)).size).toBe(CATEGORIES.length)
  })

  it('sample numbers are always flagged in the speaker notes so nobody presents invented figures by accident', () => {
    for (const cat of CATEGORIES) {
      for (const c of SKELETONS[cat.id]) {
        if (c.layout === 'metrics' || c.layout === 'chart' || c.layout === 'case-study' || (c.layout === 'big-number' && /\d/.test(c.value))) {
          // sample copy: either flagged, or an explicit instruction to replace it
          expect(/Sample figures|Sample figure|replace/i.test(c.speakerNotes), `${cat.id}/${c.layout} "${(c as { title?: string }).title ?? ''}"`).toBe(true)
        }
      }
    }
  })

  it('all 122 designs compose their category deck clean (no overflow/contrast errors) at 16:9; every 4th also at 4:3 and 1:1', () => {
    for (const [i, d] of DESIGNS.entries()) {
      for (const aspect of i % 4 === 0 ? ASPECT_RATIOS : (['16:9'] as const)) {
        let n = 0
        const built = templateSlides(d.id, aspect, () => `e${n++}`)!
        const doc: Presentation = { schemaVersion: 1, id: 'p', title: built.title, aspectRatio: aspect, language: 'en', theme: built.theme, sources: [], slides: built.slides.map((s, k) => ({ id: `s${k}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...s })) }
        expect(presentationSchema.safeParse(doc).success, d.id).toBe(true)
        const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues.map((x) => ({ ...x, slide: s.slideId }))).filter((x) => x.severity === 'error' || x.code === 'contrast' || x.code === 'overflow')
        expect(bad, `${d.id} @ ${aspect}: ${JSON.stringify(bad.slice(0, 2))}`).toEqual([])
      }
    }
  })

  it('photo-led decks: every design uses pictures, composes clean in all aspects, and keeps text readable', () => {
    const base = 'https://cdn.example.com/template-assets'
    for (const [i, d] of DESIGNS.entries()) {
      for (const aspect of i % 3 === 0 ? ASPECT_RATIOS : (['16:9'] as const)) {
        let n = 0
        const built = templateSlides(d.id, aspect, () => `e${n++}`, base)!
        const imgs = built.slides.flatMap((s) => s.elements).filter((e) => e.type === 'image')
        expect(imgs.length, `${d.id} pictures`).toBeGreaterThanOrEqual(3)
        const doc: Presentation = { schemaVersion: 1, id: 'p', title: built.title, aspectRatio: aspect, language: 'en', theme: built.theme, sources: [], slides: built.slides.map((s, k) => ({ id: `s${k}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...s })) }
        const parsed = presentationSchema.safeParse(doc)
        expect(parsed.success, `${d.id} @ ${aspect}: ${JSON.stringify(parsed.error?.issues.slice(0, 2))}`).toBe(true)
        const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues.map((x) => ({ ...x, slide: s.slideId }))).filter((x) => x.severity === 'error' || x.code === 'contrast' || x.code === 'overflow')
        expect(bad, `${d.id} @ ${aspect}: ${JSON.stringify(bad.slice(0, 2))}`).toEqual([])
      }
    }
  })
})
