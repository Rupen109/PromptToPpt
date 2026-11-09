import { describe, expect, it } from 'vitest'
import { DEMOS, demoSlides, getMorphTemplate, textSlots } from './index'

describe('Morph template demos', () => {
  for (const [id, scenes] of Object.entries(DEMOS)) {
    it(`${id}: every scene's sample words fit the template's text slots, and none is longer than its slot allows`, () => {
      const tpl = getMorphTemplate(id)!
      for (const { scene, copy } of scenes) {
        const slots = textSlots(tpl, scene)
        expect(copy.length === 0 || copy.length === slots.length, `${id} ${scene}: ${copy.length} words for ${slots.length} slots`).toBe(true)
        copy.forEach((c, i) => expect(c.length, `${id} ${scene} slot ${i}`).toBeLessThanOrEqual(Math.max(slots[i]!.maxChars, slots[i]!.text.length)))
      }
    })
    it(`${id}: the demo slides carry the template's Morph, in the order given`, () => {
      const { slides, titles } = demoSlides(id, 'https://example.com')
      expect(slides.length).toBe(scenes.length)
      expect(titles.length).toBe(scenes.length)
      for (const s of slides) expect(s.transition).toMatchObject({ type: 'morph', blend: 'cross', duration: 1500 })
      expect(slides.map((s) => (s.content as { scene?: string }).scene)).toEqual(scenes.map((s) => s.scene))
    })
  }
})
