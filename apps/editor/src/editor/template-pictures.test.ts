import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { composeSlide } from '@prompttoppt/theme'
import { getMorphTemplate, pictureSlots, templateTheme } from '@prompttoppt/theme/morph-templates'
import { presentationSchema, type Presentation } from '@prompttoppt/validation'
import * as C from './commands'
import { templateOfDeck } from '@/components/editor/TemplatePicturesDialog'

/** A deck of the Social Feed template (every scene, no words: the template's own), composed the way generation composes it. */
function feedDeck(): Presentation {
  const tpl = getMorphTemplate('mkt-feed')!
  const theme = templateTheme(tpl)
  const slides = tpl.scenes.map((sc, i) => {
    const content = { layout: 'morph-template', template: tpl.id, scene: sc.id, fields: {}, images: {}, speakerNotes: '', sources: [] } as never
    return { id: `s${i}`, locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(content, theme, '16:9', () => `e${Math.random().toString(36).slice(2, 9)}`) }
  })
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides } as unknown as Presentation
}
const MINE = { url: 'https://example.com/my-product.jpg', alt: 'My product' }

/** A deck of any template, every scene, no words: the template's own, composed the way generation composes it. */
function deckOf(id: string): Presentation {
  const tpl = getMorphTemplate(id)!
  const theme = templateTheme(tpl)
  const slides = tpl.scenes.map((sc, i) => {
    const content = { layout: 'morph-template', template: tpl.id, scene: sc.id, fields: {}, images: {}, speakerNotes: '', sources: [] } as never
    return { id: `s${i}`, locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(content, theme, '16:9', () => `e${Math.random().toString(36).slice(2, 9)}`) }
  })
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides } as unknown as Presentation
}
const where = (d: Presentation, uses: { scene: string; id: string }[]) => d.slides.flatMap((s) => s.content?.layout === 'morph-template' ? s.elements.filter((e) => e.type === 'image' && uses.some((u) => u.scene === (s.content as { scene: string }).scene && u.id === e.id)).map((e) => (e as { src: string }).src) : [])

describe('replacing a template picture', () => {
  it('the deck is recognised as a template deck, and a deck of anything else is not', () => {
    expect(templateOfDeck(feedDeck())?.id).toBe('mkt-feed')
    const d = feedDeck(); d.slides.forEach((s) => { delete (s as { content?: unknown }).content })
    expect(templateOfDeck(d)).toBeNull()
  })
  it('one picture (the phone\'s smoothie card) changes on EVERY slide it is on, hidden parked copies included, and the scenes remember it', () => {
    const before = feedDeck()
    const slot = pictureSlots(getMorphTemplate('mkt-feed')!).find((s) => s.kind === 'photo' && s.scenes.length >= 3)!
    const had = where(before, slot.uses)
    expect(had.length).toBeGreaterThanOrEqual(3)
    expect(new Set(had).size).toBe(1) // the same artwork wherever it is used: that is what the Morph relies on
    let n = 0
    const after = produce(before, (d) => { n = C.replaceTemplatePicture(d, slot.uses, MINE) })
    expect(n).toBeGreaterThanOrEqual(3)
    expect(where(after, slot.uses).every((u) => u === MINE.url)).toBe(true)
    expect(where(after, slot.uses).length).toBe(had.length)
    expect(after.slides.some((s) => s.content?.layout === 'morph-template' && Object.values(s.content.images).some((i) => i.url === MINE.url))).toBe(true)
    const other = pictureSlots(getMorphTemplate('mkt-feed')!).find((s) => s.key !== slot.key && s.kind === 'photo')!
    expect(where(after, other.uses)).toEqual(where(before, other.uses)) // nothing else changed
    expect(presentationSchema.safeParse(after).success).toBe(true)
  })
  it('an object id that shows different artwork on different scenes (Business Plan) changes only where THIS picture is shown', () => {
    const before = deckOf('biz')
    const slots = pictureSlots(getMorphTemplate('biz')!)
    const earbuds = slots.find((s) => /earbuds/i.test(s.label))!
    const gradient = slots.find((s) => s.kind === 'art' && s.uses.some((u) => earbuds.uses.some((e) => e.id === u.id)))
    expect(gradient, 'the template reuses an id for a gradient and for the earbuds').toBeTruthy()
    const after = produce(before, (d) => { C.replaceTemplatePicture(d, earbuds.uses, MINE) })
    expect(where(after, earbuds.uses).every((u) => u === MINE.url)).toBe(true)
    expect(where(after, gradient!.uses.filter((u) => !earbuds.uses.some((e) => e.id === u.id && e.scene === u.scene))).some((u) => u === MINE.url), 'the gradient on other scenes must stay').toBe(false)
  })
  it('a replaced Roadmap icon is placed the way the template places the person\'s picture (rounded, with a margin), unless the person had already moved it', () => {
    const tpl = getMorphTemplate('biz-roadmap')!
    const slot = pictureSlots(tpl).find((s) => s.uses.some((u) => u.id === 'ic1') && s.kind === 'photo')!
    const before = deckOf('biz-roadmap')
    const one = (d: Presentation) => d.slides.flatMap((s) => s.elements.filter((e) => e.type === 'image' && e.id === 'ic1' && (e.opacity ?? 1) >= 0.5)).find(Boolean) as { x: number; width: number; radius: number; src: string }
    const was = one(before)
    const after = produce(before, (d) => { C.replaceTemplatePicture(d, slot.uses, MINE) })
    const now = one(after)
    expect(now.src).toBe(MINE.url)
    expect(now.radius).toBe(28)
    expect(now.width).toBeLessThan(was.width) // the margin the clay icon had of its own
    // moved by hand first: its place is kept
    const moved = produce(before, (d) => { for (const s of d.slides) for (const e of s.elements) if (e.type === 'image' && e.id === 'ic1') { e.x += 40; e.width += 30 } })
    const kept = produce(moved, (d) => { C.replaceTemplatePicture(d, slot.uses, MINE) })
    expect(one(kept).width).toBe(one(moved).width)
    expect(one(kept).x).toBe(one(moved).x)
    expect(one(kept).src).toBe(MINE.url)
  })
  it('swapPicture (the Remove background button and the assistant): a picture of a template changes on every slide it is on, kept whole; an ordinary picture only on its own slide', () => {
    const before = feedDeck()
    const slot = pictureSlots(getMorphTemplate('mkt-feed')!).find((s) => s.kind === 'photo' && s.scenes.length >= 3)!
    const use = slot.uses.find((u) => before.slides.some((s) => s.content?.layout === 'morph-template' && s.content.scene === u.scene && s.elements.some((e) => e.id === u.id && (e.opacity ?? 1) >= 0.5)))!
    const slideId = before.slides.find((s) => s.content?.layout === 'morph-template' && s.content.scene === use.scene)!.id
    const after = produce(before, (d) => { C.swapPicture(d, slideId, use.id, { url: 'https://example.com/cut.png', alt: 'Cut', fit: 'contain' }) })
    expect(where(after, slot.uses).every((u) => u === 'https://example.com/cut.png')).toBe(true)
    expect(after.slides.flatMap((s) => s.elements.filter((e) => e.type === 'image' && e.src === 'https://example.com/cut.png').map((e) => (e as { fit?: string }).fit)).every((f) => f === 'contain')).toBe(true)
    // an ordinary picture (no template): only that element
    const plain = produce(before, (d) => { for (const s of d.slides) delete (s as { content?: unknown }).content })
    const el = plain.slides[0]!.elements.find((e) => e.type === 'image')!
    const swapped = produce(plain, (d) => { C.swapPicture(d, plain.slides[0]!.id, el.id, { url: 'https://example.com/cut.png', alt: 'Cut', fit: 'contain' }) })
    expect(swapped.slides[0]!.elements.find((e) => e.id === el.id && e.type === 'image')).toMatchObject({ src: 'https://example.com/cut.png', fit: 'contain' })
    expect(where({ ...swapped, slides: swapped.slides.slice(1) } as Presentation, slot.uses).every((u) => u !== 'https://example.com/cut.png')).toBe(true)
  })
  it('a locked slide keeps its picture', () => {
    const before = feedDeck()
    const slot = pictureSlots(getMorphTemplate('mkt-feed')!).find((s) => s.kind === 'photo' && s.scenes.length >= 3)!
    const locked = produce(before, (d) => { d.slides[0]!.locked = true })
    const after = produce(locked, (d) => { C.replaceTemplatePicture(d, slot.uses, MINE) })
    const first = (d: Presentation) => where({ ...d, slides: [d.slides[0]!] } as Presentation, slot.uses)
    expect(first(after)).toEqual(first(before))
    expect(where(after, slot.uses).some((u) => u === MINE.url)).toBe(true)
  })
})
