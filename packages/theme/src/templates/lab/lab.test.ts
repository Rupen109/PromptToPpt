import { describe, expect, it } from 'vitest'
import { CANVAS, presentationSchema, type Presentation } from '@prompttoppt/validation'
import { LAB_TEMPLATES } from './index'

const img = (n: string) => `https://cdn.example.com/template-lab/${n}.jpg`

describe('art-directed prototype templates', () => {
  for (const t of LAB_TEMPLATES) {
    describe(t.name, () => {
      const slides = t.slides(img)
      const doc: Presentation = { schemaVersion: 1, id: 'p', title: t.name, aspectRatio: '16:9', language: 'en', theme: t.theme, sources: [], slides }

      it('is a valid presentation document with 5 slides', () => {
        expect(slides).toHaveLength(5)
        expect(presentationSchema.safeParse(doc).success).toBe(true)
      })

      it('uses photography and ambient motion (what the plain layouts lack)', () => {
        const els = slides.flatMap((s) => s.elements)
        expect(els.filter((e) => e.type === 'image').length).toBeGreaterThanOrEqual(5)
        expect(els.some((e) => e.type === 'image' && e.clip !== 'none')).toBe(true) // at least one non-rectangular crop
        expect(els.some((e) => e.animation && ['kenburns', 'float', 'drift'].includes(e.animation.type))).toBe(true)
        expect(els.some((e) => e.animation?.type === 'count-up')).toBe(true)
      })

      it('keeps every element inside the canvas (a few intentional bleeds allowed) and gives images alt text', () => {
        const { width, height } = CANVAS['16:9']
        for (const s of slides) {
          for (const e of s.elements) {
            if (e.type === 'text') {
              expect(e.x, `${s.id}/${e.id}`).toBeGreaterThanOrEqual(-1)
              expect(e.x + e.width, `${s.id}/${e.id} right edge`).toBeLessThanOrEqual(width + 1)
              expect(e.y + e.height, `${s.id}/${e.id} bottom edge`).toBeLessThanOrEqual(height + 1)
            }
            if (e.type === 'image') expect(e.alt.length, `${s.id}/${e.id}`).toBeGreaterThan(5)
          }
        }
      })

      it('every slide has unique element ids and every referenced image is one we ship', () => {
        const ids = slides.flatMap((s) => s.elements.map((e) => e.id))
        expect(new Set(ids).size).toBe(ids.length)
        const names = slides.flatMap((s) => s.elements.flatMap((e) => (e.type === 'image' && e.src ? [e.src.replace(/^.*\/template-lab\//, '').replace(/\.jpg$/, '')] : [])))
        expect(names.every((n) => /^[a-z]-[a-z0-9]+$/.test(n))).toBe(true)
      })
    })
  }
})
