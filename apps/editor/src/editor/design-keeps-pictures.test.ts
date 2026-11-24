import { beforeEach, describe, expect, it } from 'vitest'
import { DESIGNS, composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import * as C from './commands'
import { useDoc } from './store'

/**
 * A design change never takes a person's picture away (real QA case C20: "make the theme minimalist" chose a theme with no photo style and the title and thank-you photos vanished).
 * Template decks still choose their own looks: a catalogue photo offered to a design without a photo style is ignored (keepPhoto is only for a picture the slide already shows).
 */
const photoDesign = DESIGNS.find((d) => d.theme.style?.photo && d.theme.style.photo !== 'none')!.theme
const photo = { src: 'https://x.test/telescope.jpg', alt: 'A telescope' }
const titleC = { layout: 'title', title: 'The Newtonian Revolution', subtitle: 'Three laws', speakerNotes: '', sources: [] } as unknown as SlideContent
const thanksC = { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?', speakerNotes: '', sources: [] } as unknown as SlideContent
const bodyC = { layout: 'title-body', title: 'Body', bullets: ['a point', 'b point', 'c point'], speakerNotes: '', sources: [] } as unknown as SlideContent
const pics = (els: { type: string; src?: string; decorative?: boolean }[]) => els.filter((e) => e.type === 'image' && !e.decorative && e.src)

describe('compose: an existing picture survives a design without a photo style', () => {
  it('keepPhoto: the slide still shows its picture (neutral split); a catalogue offer without keepPhoto is ignored as before', () => {
    const slate = getTheme('slate')
    let n = 0
    const kept = composeSlide(titleC, slate, '16:9', () => `k${n++}`, { photo, keepPhoto: true })
    expect(pics(kept.elements as never).map((e) => e.src)).toEqual([photo.src])
    const offered = composeSlide(titleC, slate, '16:9', () => `o${n++}`, { photo })
    expect(pics(offered.elements as never)).toEqual([])
  })
})

describe('editor: switching the deck to a design with no photo style keeps the title and thank-you pictures', () => {
  beforeEach(() => {
    let n = 0
    const mk = (id: string, c: SlideContent, withPhoto: boolean) => ({ id, locked: false, validation: { status: 'passed' as const, issues: [] }, ...composeSlide(c, photoDesign, '16:9', () => `${id}e${n++}`, withPhoto ? { photo } : {}) })
    const d: Presentation = { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: photoDesign, sources: [], slides: [mk('s1', titleC, true), mk('s2', bodyC, false), mk('s3', thanksC, true)] as never }
    useDoc.getState().load(d, 1)
  })
  it('applyTheme("slate"): both pictures are still there with the same source; the words are untouched; one undo brings the old design back exactly', () => {
    const before = structuredClone(useDoc.getState().doc!)
    expect(pics(before.slides[0]!.elements as never)).toHaveLength(1)
    useDoc.getState().apply('Design', (d) => C.applyTheme(d, 'slate'))
    const after = useDoc.getState().doc!
    for (const i of [0, 2]) expect(pics(after.slides[i]!.elements as never).map((e) => e.src), `slide ${i + 1}`).toEqual([photo.src])
    expect(after.slides.map((s) => s.content)).toEqual(before.slides.map((s) => s.content))
    useDoc.getState().undo()
    expect(JSON.stringify(useDoc.getState().doc)).toBe(JSON.stringify(before))
  })
})
