import { beforeEach, describe, expect, it, vi } from 'vitest'
import { composeSlide, getTheme, validateSlide } from '@prompttoppt/theme'
import { presentationSchema, type Presentation, type SlideContent, type TextElement } from '@prompttoppt/validation'
import * as C from './commands'
import { useDoc } from './store'

let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: 'notes', sources: [] },
  { layout: 'title-body', title: 'Body', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
  { layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] },
]
const mkDoc = (themeId = 'cobalt'): Presentation => {
  const theme = getTheme(themeId)
  return {
    schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [],
    slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })),
  }
}
const doc = () => useDoc.getState().doc!
const apply = (label: string, r: (d: C.D) => void, opts?: { mergeKey?: string }) => useDoc.getState().apply(label, r, opts)
const textEl = (slideIdx: number) => doc().slides[slideIdx]!.elements.find((e) => e.type === 'text' && e.role === 'title') as TextElement

beforeEach(() => {
  n = 0
  useDoc.getState().load(mkDoc(), 1)
})

describe('undo / redo', () => {
  it('undo restores the exact previous document and redo reapplies', () => {
    const before = doc()
    apply('delete slide', (d) => C.deleteSlide(d, 's1'))
    expect(doc().slides).toHaveLength(2)
    useDoc.getState().undo()
    expect(doc()).toEqual(before)
    useDoc.getState().redo()
    expect(doc().slides.map((s) => s.id)).toEqual(['s0', 's2'])
  })

  it('a new edit clears the redo stack', () => {
    apply('a', (d) => C.setTitle(d, 'One'))
    useDoc.getState().undo()
    expect(useDoc.getState().future).toHaveLength(1)
    apply('b', (d) => C.setTitle(d, 'Two'))
    expect(useDoc.getState().future).toHaveLength(0)
  })

  it('no-op commands record nothing', () => {
    apply('noop', (d) => C.deleteSlide(d, 'does-not-exist'))
    expect(useDoc.getState().past).toHaveLength(0)
  })

  it('rapid edits with the same mergeKey are ONE undo step; different keys are separate', () => {
    for (const t of ['H', 'He', 'Hel', 'Hell', 'Hello']) apply('type', (d) => C.setSpeakerNotes(d, 's1', t), { mergeKey: 'notes:s1' })
    expect(useDoc.getState().past).toHaveLength(1)
    useDoc.getState().undo()
    expect(doc().slides[1]!.speakerNotes).toBe('')
    useDoc.getState().redo()
    expect(doc().slides[1]!.speakerNotes).toBe('Hello')

    apply('other', (d) => C.setSpeakerNotes(d, 's2', 'x'), { mergeKey: 'notes:s2' })
    expect(useDoc.getState().past).toHaveLength(2)
  })

  it('the merge window expires', () => {
    vi.useFakeTimers()
    apply('t', (d) => C.setSpeakerNotes(d, 's1', 'a'), { mergeKey: 'k' })
    vi.advanceTimersByTime(2000)
    apply('t', (d) => C.setSpeakerNotes(d, 's1', 'ab'), { mergeKey: 'k' })
    expect(useDoc.getState().past).toHaveLength(2)
    vi.useRealTimers()
  })

  it('history is bounded and a seq counter bumps on undo/redo too (autosave depends on it)', () => {
    const s0 = useDoc.getState().seq
    apply('x', (d) => C.setTitle(d, 'X'))
    useDoc.getState().undo()
    useDoc.getState().redo()
    expect(useDoc.getState().seq).toBe(s0 + 3)
  })
})

describe('slide commands', () => {
  it('duplicate keeps content but creates NEW ids (slide and every element)', () => {
    let newSlide = ''
    apply('dup', (d) => { newSlide = C.duplicateSlide(d, 's1', gen)! })
    expect(doc().slides.map((s) => s.id)).toEqual(['s0', 's1', newSlide, 's2'])
    const a = doc().slides[1]!, b = doc().slides[2]!
    expect(b.elements.map((e) => e.type)).toEqual(a.elements.map((e) => e.type))
    const ids = doc().slides.flatMap((s) => s.elements.map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('add below / add from layout / delete (never the last slide) / move', () => {
    apply('add', (d) => C.addSlideAt(d, 2, C.slideFromLayout('comparison', d.theme as never, d.aspectRatio, gen)))
    expect(doc().slides[2]!.layoutId).toBe('comparison')
    apply('blank', (d) => C.addSlideAt(d, 1, C.blankSlide(d.theme as never, 'blank1')))
    expect(doc().slides[1]!.layoutId).toBe('blank')
    apply('move', (d) => C.moveSlide(d, 0, 3))
    expect(doc().slides[3]!.id).toBe('s0')
    useDoc.getState().load(mkDoc(), 1)
    apply('d1', (d) => C.deleteSlide(d, 's0')); apply('d2', (d) => C.deleteSlide(d, 's1')); apply('d3', (d) => C.deleteSlide(d, 's2'))
    expect(doc().slides).toHaveLength(1) // refused to delete the last one
  })

  it('every inserted layout produces a schema-valid slide with no validation errors', () => {
    for (const layout of C.INSERTABLE_LAYOUTS) {
      apply(layout, (d) => C.addSlideAt(d, d.slides.length, C.slideFromLayout(layout, d.theme as never, d.aspectRatio, gen)))
    }
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    for (const s of doc().slides) expect(validateSlide(s, doc().theme).filter((i) => i.severity === 'error'), s.layoutId).toEqual([])
  })

  it('speaker notes are separate from visible content', () => {
    apply('n', (d) => C.setSpeakerNotes(d, 's1', 'say this'))
    expect(doc().slides[1]!.speakerNotes).toBe('say this')
    expect(JSON.stringify(doc().slides[1]!.elements)).not.toContain('say this')
  })
})

describe('element commands', () => {
  it('move / resize / delete / duplicate / paste, and the slide becomes "manual"', () => {
    const el = textEl(1)
    expect(doc().slides[1]!.manual).toBeUndefined()
    apply('move', (d) => C.moveElements(d, 's1', [el.id], 10, -5))
    expect(textEl(1).x).toBe(el.x + 10)
    expect(doc().slides[1]!.manual).toBe(true)
    apply('resize', (d) => C.setGeometry(d, 's1', el.id, { x: 100, y: 100, width: 5, height: 5 }))
    expect(textEl(1)).toMatchObject({ x: 100, y: 100, width: 8, height: 8 }) // clamped to a minimum
    let dup: string[] = []
    apply('dup', (d) => { dup = C.duplicateElements(d, 's1', [el.id], gen) })
    expect(doc().slides[1]!.elements.find((e) => e.id === dup[0])).toMatchObject({ x: 132, y: 132, locked: false })
    apply('del', (d) => C.deleteElements(d, 's1', [el.id]))
    expect(doc().slides[1]!.elements.some((e) => e.id === el.id)).toBe(false)
    useDoc.getState().undo()
    expect(doc().slides[1]!.elements.some((e) => e.id === el.id)).toBe(true)
  })

  it('locked elements cannot be moved, resized, edited or deleted — until unlocked', () => {
    const el = textEl(1)
    apply('lock', (d) => C.toggleLock(d, 's1', el.id))
    const before = doc()
    apply('move', (d) => C.moveElements(d, 's1', [el.id], 50, 50))
    apply('del', (d) => C.deleteElements(d, 's1', [el.id]))
    apply('text', (d) => C.setText(d, 's1', el.id, [{ runs: [{ text: 'hacked' }] }]))
    expect(doc().slides[1]!.elements).toEqual(before.slides[1]!.elements)
    apply('unlock', (d) => C.toggleLock(d, 's1', el.id))
    apply('move', (d) => C.moveElements(d, 's1', [el.id], 5, 5))
    expect(textEl(1).x).toBe(el.x + 5)
  })

  it('editing text keeps list style and is undoable', () => {
    // plain-bullet slides rotate through looks (some give each bullet its own box), so take the body box that holds the most paragraphs
    const bodies = doc().slides[1]!.elements.filter((e): e is TextElement => e.type === 'text' && e.role === 'body')
    const body = bodies.reduce((a, b) => (b.paragraphs.length > a.paragraphs.length ? b : a))
    const before = body.paragraphs.length
    apply('t', (d) => C.setText(d, 's1', body.id, [{ runs: [{ text: 'x' }], list: 'bullet' }]))
    expect((doc().slides[1]!.elements.find((e) => e.id === body.id) as TextElement).paragraphs).toHaveLength(1)
    useDoc.getState().undo()
    expect((doc().slides[1]!.elements.find((e) => e.id === body.id) as TextElement).paragraphs).toHaveLength(before)
  })
})

describe('design commands', () => {
  it('theme switch recomposes untouched slides and keeps hand-edited ones, remapping their background', () => {
    const el = textEl(1)
    apply('edit', (d) => C.moveElements(d, 's1', [el.id], 40, 0)) // slide 1 is now manual
    const manualX = textEl(1).x
    apply('theme', (d) => C.applyTheme(d, 'midnight'))
    expect(doc().theme.id).toBe('midnight')
    expect(textEl(1).x).toBe(manualX) // preserved
    expect(doc().slides[1]!.background!.value).toBe(getTheme('midnight').colors.background) // bg followed the colour role
    expect(doc().slides[0]!.background!.value).toBe(getTheme('midnight').colors.primary) // title slide recomposed in new theme
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    useDoc.getState().undo()
    expect(doc().theme.id).toBe('cobalt')
  })

  it('theme switch keeps all content (no text lost) for every theme', () => {
    const texts = (p: Presentation) => p.slides.flatMap((s) => s.elements.flatMap((e) => (e.type === 'text' ? e.paragraphs.map((x) => x.runs.map((r) => r.text).join('')) : [])))
    const before = texts(doc())
    for (const t of ['forest', 'midnight', 'slate', 'cobalt']) apply(t, (d) => C.applyTheme(d, t))
    expect(texts(doc())).toEqual(before)
  })

  it('alternative designs: compatible layouts convert without losing content', () => {
    expect(C.compatibleLayouts(doc().slides[1]!.content)).toEqual(['title-body', 'split-image-text'])
    apply('relayout', (d) => C.relayout(d, 's1', 'split-image-text'))
    expect(doc().slides[1]!.layoutId).toBe('split-image-text')
    expect(JSON.stringify(doc().slides[1]!.elements)).toContain('Body')
    apply('back', (d) => C.relayout(d, 's1', 'title-body'))
    expect(doc().slides[1]!.layoutId).toBe('title-body')
    apply('process→timeline', (d) => C.relayout(d, 's2', 'timeline'))
    expect(doc().slides[2]!.layoutId).toBe('timeline')
    apply('invalid', (d) => C.relayout(d, 's0', 'comparison')) // incompatible → ignored
    expect(doc().slides[0]!.layoutId).toBe('title')
  })

  it('AI content replacement recomposes through the layout engine, respects locks and layout', () => {
    const next: SlideContent = { layout: 'title-body', title: 'Shorter', bullets: ['one'], speakerNotes: 'new notes', sources: [] }
    apply('ai', (d) => C.replaceContent(d, 's1', next))
    expect(textEl(1).paragraphs[0]!.runs[0]!.text).toBe('Shorter')
    expect(doc().slides[1]!.speakerNotes).toBe('new notes')
    apply('lock', (d) => C.setSlideLocked(d, 's1', true))
    apply('ai2', (d) => C.replaceContent(d, 's1', { ...next, title: 'Blocked' }))
    expect(textEl(1).paragraphs[0]!.runs[0]!.text).toBe('Shorter')
    apply('wrong layout', (d) => C.replaceContent(d, 's0', next))
    expect(doc().slides[0]!.layoutId).toBe('title')
  })

  it('fonts', () => {
    apply('fonts', (d) => C.setFonts(d, { heading: 'Georgia', body: 'Arial' }))
    expect(doc().theme.fonts).toEqual({ heading: 'Georgia', body: 'Arial' })
  })
})

describe('snapping & resizing (pure)', () => {
  it('snaps to slide centre and to neighbouring edges, with guides', () => {
    const r = C.snap({ x: 955, y: 100, width: 10, height: 50 }, [{ x: 0, y: 500, width: 100, height: 100 }], '16:9')
    expect(r.x).toBe(955 + 0) // centre of box (960) is already within threshold → snapped to 960 - 5
    expect(r.guides.some((g) => g.axis === 'x' && g.at === 960)).toBe(true)
    const none = C.snap({ x: 300, y: 300, width: 50, height: 50 }, [], '16:9')
    expect(none).toMatchObject({ x: 300, y: 300, guides: [] })
  })
  it('resize handles respect the opposite edge and the minimum size', () => {
    const b = { x: 100, y: 100, width: 200, height: 100 }
    expect(C.resizeBox(b, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 250, height: 120 })
    expect(C.resizeBox(b, 'nw', 50, 20)).toEqual({ x: 150, y: 120, width: 150, height: 80 })
    expect(C.resizeBox(b, 'w', 500, 0).width).toBe(24)
  })
})

describe('picture commands', () => {
  const img = { url: 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345', alt: 'A red car', prompt: 'a red car' }

  it('lists only the placements that make sense for the slide', () => {
    const ids = (i: number, sel?: string | null) => C.imagePlacements(doc().slides[i]!, sel).map((p) => p.id)
    expect(ids(0)).toEqual(['background', 'floating']) // title slide: photo background, no picture+text conversion
    expect(ids(1)).toEqual(['beside', 'floating']) // title-body: converts to picture+text
    expect(ids(2)).toEqual(['floating']) // process: cards → no background, no conversion
    apply('add', (d) => { C.insertImageElement(d, 's2', img, gen) })
    const imageId = doc().slides[2]!.elements.find((e) => e.type === 'image')!.id
    expect(ids(2, imageId)[0]).toBe('replace')
  })

  it('full-slide background: picture + theme-coloured scrim + the theme own text colours; one undo step; survives theme and content changes', () => {
    apply('bg', (d) => C.setImageBackground(d, 's0', img.url))
    const s = doc().slides[0]!
    expect(s.background).toEqual({ type: 'image', value: img.url })
    expect(s.elements.some((e) => e.type === 'shape' && e.decorative && e.opacity >= 0.85 && e.width >= 1920 && e.height >= 1080)).toBe(true)
    expect(validateSlide(s, doc().theme).filter((i) => i.severity === 'error' || i.code === 'contrast')).toEqual([])
    apply('theme', (d) => C.applyTheme(d, 'midnight'))
    expect(doc().slides[0]!.background).toEqual({ type: 'image', value: img.url })
    apply('edit', (d) => C.replaceContent(d, 's0', { layout: 'title', title: 'New title', speakerNotes: '', sources: [] }))
    expect(doc().slides[0]!.background).toEqual({ type: 'image', value: img.url })
    apply('clear', (d) => C.clearImageBackground(d, 's0'))
    expect(doc().slides[0]!.background!.type).not.toBe('image')
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })

  it('background is refused on card layouts and hand-edited slides', () => {
    apply('bg', (d) => C.setImageBackground(d, 's2', img.url))
    expect(doc().slides[2]!.background!.type).not.toBe('image')
    apply('move', (d) => C.moveElements(d, 's0', [doc().slides[0]!.elements.find((e) => e.type === 'text')!.id], 10, 0))
    apply('bg', (d) => C.setImageBackground(d, 's0', img.url))
    expect(doc().slides[0]!.background!.type).not.toBe('image')
  })

  it('picture beside text converts title-body → split-image-text and stores the URL in content (kept on theme change)', () => {
    apply('beside', (d) => C.placeImageBeside(d, 's1', img))
    const s = doc().slides[1]!
    expect(s.layoutId).toBe('split-image-text')
    expect(s.content).toMatchObject({ imageUrl: img.url, imageAlt: 'A red car' })
    expect(s.elements.find((e) => e.type === 'image')).toMatchObject({ src: img.url, alt: 'A red car' })
    apply('theme', (d) => C.applyTheme(d, 'forest'))
    expect(doc().slides[1]!.elements.find((e) => e.type === 'image')).toMatchObject({ src: img.url })
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })

  it('replacing the picture of a picture+text slide updates content, and undo restores the previous one', () => {
    apply('beside', (d) => C.placeImageBeside(d, 's1', img))
    const el = doc().slides[1]!.elements.find((e) => e.type === 'image')!
    apply('replace', (d) => C.setImageElementSrc(d, 's1', el.id, { ...img, url: 'https://api.example.com/api/v1/assets/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', alt: 'New' }))
    expect(doc().slides[1]!.elements.find((e) => e.type === 'image')).toMatchObject({ src: expect.stringContaining('ZZZZ') })
    useDoc.getState().undo()
    expect(doc().slides[1]!.elements.find((e) => e.type === 'image')).toMatchObject({ src: img.url })
  })

  it('floating picture: centred, inside the canvas, marks the slide hand-edited, locked slides refuse', () => {
    apply('float', (d) => { C.insertImageElement(d, 's2', img, gen) })
    const e = doc().slides[2]!.elements.find((x) => x.type === 'image')!
    expect(e).toMatchObject({ src: img.url, fit: 'cover' })
    expect(e.x).toBeGreaterThan(0)
    expect(e.x + e.width).toBeLessThanOrEqual(1920)
    expect(doc().slides[2]!.manual).toBe(true)
    apply('lock', (d) => C.setSlideLocked(d, 's1', true))
    apply('float', (d) => { C.insertImageElement(d, 's1', img, gen) })
    expect(doc().slides[1]!.elements.some((x) => x.type === 'image')).toBe(false)
  })
})
