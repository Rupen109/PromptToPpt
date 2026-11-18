import { describe, expect, it } from 'vitest'
import { DESIGNS, PLACEHOLDER_KINDS, getTheme, validateSlide } from '@prompttoppt/theme'
import { presentationSchema, slideSchema, type Presentation, type TextElement } from '@prompttoppt/validation'
import { produce } from 'immer'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlideCanvas } from '@prompttoppt/ui'
import * as C from './commands'

let n = 0
const gen = () => `id${++n}`
const theme = getTheme('midnight')!
const words = (e: TextElement) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
const texts = (s: { elements: { type: string }[] }) => s.elements.filter((e): e is TextElement => e.type === 'text')
const deck = (): Presentation => ({ schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [C.newSlide('content', theme, '16:9', gen)] }) as Presentation

describe('new slides come with empty, prompted boxes (PowerPoint layouts)', () => {
  it('every layout × every aspect ratio is a valid slide whose text boxes are empty and say what goes in them', () => {
    for (const kind of PLACEHOLDER_KINDS) {
      for (const aspect of ['16:9', '4:3', '1:1'] as const) {
        const s = C.newSlide(kind, theme, aspect, gen)
        expect(slideSchema.safeParse(s).success, `${kind} ${aspect}`).toBe(true)
        const boxes = texts(s).filter((t) => t.hint)
        expect(boxes.length, `${kind} has prompted boxes`).toBeGreaterThan(0)
        for (const b of boxes) expect(words(b), `${kind}/${b.role} is empty`).toBe('')
        expect(boxes.some((b) => b.hint === 'Click to add title' || b.role !== 'title'), kind).toBe(true)
        expect(s.content, 'no stored words for a redesign to bring back').toBeUndefined()
        expect(s.manual).toBe(true)
      }
    }
  })

  it('content slides are plain: a flat background and no ornaments, in every catalogue design (the title slide and section header keep their cover look)', () => {
    for (const d of DESIGNS) for (const kind of ['content', 'two-content', 'title-only', 'comparison'] as const) {
      const s = C.newSlide(kind, d.theme, '16:9', gen)
      expect(s.background, `${d.id} ${kind}`).toEqual({ type: 'color', value: d.theme.colors.background })
      expect(s.elements.filter((e) => e.decorative && e.type === 'shape' && e.width !== 22), `${d.id} ${kind}`).toEqual([]) // (a title style's thin side bar is the title's own, not a background ornament)
    }
  })

  it('the default (Title and content) is a title box and a bulleted text box; Title only has no text box', () => {
    const c = texts(C.newSlide('content', theme, '16:9', gen))
    expect(c.map((t) => [t.role, t.hint])).toEqual([['title', 'Click to add title'], ['body', 'Click to add text']])
    expect(c.find((t) => t.role === 'body')!.paragraphs[0]!.list).toBe('bullet')
    expect(texts(C.newSlide('title-only', theme, '16:9', gen)).map((t) => t.role)).toEqual(['title'])
    expect(texts(C.newSlide('two-content', theme, '16:9', gen)).filter((t) => t.role === 'body')).toHaveLength(2)
  })

  it('works in every catalogue design (no overflow or contrast error from an empty slide)', () => {
    for (const d of DESIGNS) for (const kind of PLACEHOLDER_KINDS) {
      const s = C.newSlide(kind, d.theme, '16:9', gen)
      const errors = validateSlide(s, d.theme).filter((i) => i.severity === 'error')
      expect(errors, `${d.id} ${kind}`).toEqual([])
    }
  })

  it('the gallery preview has sample words, the slide you get has none', () => {
    for (const kind of PLACEHOLDER_KINDS) {
      expect(texts(C.previewSlide(kind, theme, '16:9')).some((t) => words(t).trim() !== ''), kind).toBe(true)
      expect(texts(C.newSlide(kind, theme, '16:9', gen)).filter((t) => t.hint).every((t) => words(t) === ''), kind).toBe(true)
    }
  })

  it('a theme change keeps the slide empty (nothing is brought back from a template)', () => {
    const d0 = deck()
    const d1 = produce(d0, (d) => { C.applyTheme(d, 'cobalt') })
    expect(d1.theme.id).not.toBe(d0.theme.id)
    expect(presentationSchema.safeParse(d1).success).toBe(true)
    expect(texts(d1.slides[0]!).every((t) => words(t) === '')).toBe(true)
  })
})

describe('what everyone else sees of an empty new slide', () => {
  it('the shared slide renderer (thumbnails, Present, the share link) draws no prompt and no bullet for empty boxes', () => {
    for (const kind of PLACEHOLDER_KINDS) {
      const html = renderToStaticMarkup(createElement(SlideCanvas, { slide: C.newSlide(kind, theme, '16:9', gen), theme, aspect: '16:9', width: 960 }))
      expect(html, kind).not.toMatch(/Click to add/)
      expect(html, kind).not.toContain('•')
    }
  })
  it('a bullet appears as soon as the line has words', () => {
    const s = produce(C.newSlide('content', theme, '16:9', gen), (x) => { const b = (texts(x) as TextElement[]).find((t) => t.role === 'body')!; b.paragraphs = [{ runs: [{ text: 'Point' }], list: 'bullet' }] })
    expect(renderToStaticMarkup(createElement(SlideCanvas, { slide: s, theme, aspect: '16:9', width: 960 }))).toContain('•')
  })
})

describe('changing the layout of a slide made of prompted boxes', () => {
  const typed = (d: Presentation): Presentation => produce(d, (x) => {
    const [t, b] = texts(x.slides[0]!) as TextElement[]
    t!.paragraphs = [{ runs: [{ text: 'Q3 plan' }] }]
    b!.paragraphs = [{ runs: [{ text: 'Ship the editor' }], list: 'bullet' }, { runs: [{ text: 'Fix billing' }], list: 'bullet' }]
  })

  it('moves the typed words to the boxes of the same kind, leaves the rest prompted', () => {
    const d = produce(typed(deck()), (x) => { C.changeLayout(x, x.slides[0]!.id, 'two-content', gen) })
    const t = texts(d.slides[0]!)
    expect(t.map((e) => [e.role, words(e)])).toEqual([['title', 'Q3 plan'], ['body', 'Ship the editor\nFix billing'], ['body', '']])
    expect(t[2]!.hint).toBe('Click to add text')
    expect(presentationSchema.safeParse(d).success).toBe(true)
  })

  it('words with no box of their kind are dropped (Section header, Title only); undo is what brings them back', () => {
    const sec = produce(typed(deck()), (x) => { C.changeLayout(x, x.slides[0]!.id, 'section', gen) })
    expect(texts(sec.slides[0]!).map((e) => [e.role, words(e)])).toEqual([['title', 'Q3 plan']]) // a section header has only a title: the text boxes' words have nowhere to go (undo brings them back)
    const only = produce(typed(deck()), (x) => { C.changeLayout(x, x.slides[0]!.id, 'title-only', gen) })
    expect(texts(only.slides[0]!).map((e) => words(e))).toEqual(['Q3 plan'])
  })

  it('keeps the id, the speaker notes and the slide order; a slide with a picture is left alone', () => {
    const base = typed(deck())
    const id = base.slides[0]!.id
    const withNotes = produce(base, (x) => { x.slides[0]!.speakerNotes = 'say hi' })
    const d = produce(withNotes, (x) => { C.changeLayout(x, id, 'comparison', gen) })
    expect(d.slides[0]!.id).toBe(id)
    expect(d.slides[0]!.speakerNotes).toBe('say hi')
    const pic = produce(base, (x) => { x.slides[0]!.elements.push(C.makeElement({ type: 'image', id: 'img', x: 0, y: 0, width: 100, height: 100, alt: 'a' })) as never })
    expect(C.canChangeLayout(pic.slides[0]!)).toBe(false)
    const same = produce(pic, (x) => { C.changeLayout(x, id, 'two-content', gen) })
    expect(same.slides[0]!.layoutId).toBe(pic.slides[0]!.layoutId)
    expect(texts(same.slides[0]!).map(words)).toEqual(texts(pic.slides[0]!).map(words))
  })
})
