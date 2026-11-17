import { DESIGNS, SAMPLES, composeDeck } from '@prompttoppt/theme'
import { EFFECTS, effectSchema, elementSchema, type Effect, type Presentation, type Slide, type SlideElement, type Transition } from '@prompttoppt/validation'
import { gradientPng } from './png.ts'
import type { ImageLoader } from './pptx.ts'

/** Decks with every kind of effect, transition and Morph, made through the real schema. Used by the export tests and by the real-PowerPoint check. */
let n = 0
const gen = () => `fx${++n}`

export const base = (): { doc: Presentation; slide: Slide } => {
  const d = DESIGNS.find((x) => x.id === 'pitch-launchpad') ?? DESIGNS[0]!
  const slides = composeDeck(SAMPLES.slice(0, 2), d, '16:9', gen).map((s) => ({ id: gen(), locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }))
  const doc = { schemaVersion: 1, id: gen(), title: 'Animations', aspectRatio: '16:9', language: 'en', theme: { ...d.theme, motion: { transition: 'none', entrance: 'none', stagger: 0, duration: 500 } }, sources: [], slides } as unknown as Presentation
  return { doc, slide: slides[0] as unknown as Slide }
}

export const text = (id: string, words: string | string[], x: number, y: number, extra: Record<string, unknown> = {}): SlideElement =>
  elementSchema.parse({ type: 'text', id, role: 'body', x, y, width: 520, height: 110, fontSize: 40, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: (Array.isArray(words) ? words : [words]).map((w) => ({ runs: [{ text: w }] })), ...extra })
export const shape = (id: string, x: number, y: number, extra: Record<string, unknown> = {}): SlideElement => elementSchema.parse({ type: 'shape', id, shape: 'rect', x, y, width: 200, height: 120, fill: 'accent', ...extra })
export const image = (id: string, x: number, y: number): SlideElement => elementSchema.parse({ type: 'image', id, src: 'https://example.test/p.png', alt: 'pic', x, y, width: 240, height: 160 })
export const chart = (id: string, x: number, y: number): SlideElement => elementSchema.parse({ type: 'chart', id, chartType: 'bar', labels: ['a', 'b', 'c'], series: [{ name: 's', values: [1, 2, 3] }], x, y, width: 520, height: 300 })
export const table = (id: string, x: number, y: number): SlideElement => elementSchema.parse({ type: 'table', id, header: ['A', 'B'], rows: [['1', '2'], ['3', '4']], x, y, width: 520, height: 200 })
export const icon = (id: string, x: number, y: number): SlideElement => elementSchema.parse({ type: 'icon', id, name: 'star', x, y, width: 90, height: 90 })

let fxN = 0
export const fx = (elementId: string, type: Effect['type'], extra: Partial<Effect> = {}): Effect => {
  const category = (Object.keys(EFFECTS) as (keyof typeof EFFECTS)[]).find((k) => (EFFECTS[k] as readonly string[]).includes(type))!
  return effectSchema.parse({ id: `ef${++fxN}`, elementId, category, type, ...extra })
}

export const slideOf = (elements: SlideElement[], effects: Effect[] = [], transition?: Transition): Slide => {
  const { slide } = base()
  return { ...slide, id: gen(), elements, effects, ...(transition ? { transition } : { transition: undefined }), speakerNotes: '' } as Slide
}
export const deckOf = (slides: Slide[]): Presentation => ({ ...base().doc, slides })

/** a tiny picture for every URL */
export const pngLoader: ImageLoader = async () => ({ data: gradientPng('#336699', '#99ccff', 135), w: 96, h: 96 })

export const ENTRANCES = EFFECTS.entrance, EMPHASES = EFFECTS.emphasis, EXITS = EFFECTS.exit, PATHS = EFFECTS.path

/** the deck the real-PowerPoint check opens: every effect kind, three click steps with chains, text parts, paths, triggers, every transition, two Morph pairs */
export function everythingDeck(): Presentation {
  const slides: Slide[] = []
  // 1: three click steps with With / After Previous chains
  slides.push(slideOf(
    [text('a', 'Alpha', 100, 100), text('b', 'Bravo', 100, 260), shape('c', 100, 420), text('d', 'Delta', 800, 100), text('e', 'Echo', 800, 260), text('f', 'Foxtrot', 800, 420)],
    [fx('a', 'fade-in', { start: 'click' }), fx('b', 'fly-in', { start: 'with', delay: 200, direction: 'left' }), fx('c', 'zoom-in', { start: 'after', duration: 400 }),
      fx('d', 'wipe-in', { start: 'click', direction: 'up' }), fx('e', 'rise-up', { start: 'after', delay: 300 }), fx('f', 'pop-in', { start: 'with' }),
      fx('a', 'pulse', { start: 'click', category: 'emphasis' }), fx('c', 'fade-out', { start: 'after' })],
  ))
  // 2: every entrance (first on click, then one after the other)
  const entr = ENTRANCES.map((type, i) => ({ type, id: `en${i}` }))
  slides.push(slideOf(entr.map((x, i) => (i % 2 ? shape(x.id, 100 + (i % 6) * 280, 100 + Math.floor(i / 6) * 300) : text(x.id, x.type, 100 + (i % 6) * 280, 100 + Math.floor(i / 6) * 300, { width: 260, fontSize: 28 }))), entr.map((x, i) => fx(x.id, x.type, { start: i === 0 ? 'click' : 'after', duration: 300, direction: i % 3 === 0 ? 'right' : 'left' }))))
  // 3: every emphasis, then every exit
  const emph = EMPHASES.map((type, i) => ({ type, id: `em${i}` })), exits = EXITS.map((type, i) => ({ type, id: `ex${i}` }))
  const all3 = [...emph, ...exits]
  slides.push(slideOf(all3.map((x, i) => (i % 2 ? shape(x.id, 60 + (i % 7) * 260, 100 + Math.floor(i / 7) * 300, { width: 200, height: 100 }) : text(x.id, x.type, 60 + (i % 7) * 260, 100 + Math.floor(i / 7) * 300, { width: 240, fontSize: 28 }))), all3.map((x, i) => fx(x.id, x.type as Effect['type'], { start: i === 0 || i === emph.length ? 'click' : 'after', duration: 300 }))))
  // 4: paths and triggers
  slides.push(slideOf(
    [shape('p1', 100, 100), shape('p2', 100, 300), shape('p3', 100, 500), shape('p4', 600, 100), shape('p5', 600, 300), text('tg', 'Click me', 1100, 100), text('t1', 'Appears on click', 1100, 300), shape('t2', 1100, 500)],
    [fx('p1', 'path-line', { start: 'click', direction: 'right', distance: 400 }), fx('p2', 'path-arc', { start: 'with', distance: 300, direction: 'right' }), fx('p3', 'path-turn', { start: 'with', direction: 'right' }),
      fx('p4', 'path-circle', { start: 'with', distance: 240 }), fx('p5', 'path-custom', { start: 'after', path: [[0, 0], [120, 80], [200, -40], [320, 60]], reverse: true, repeat: 2 }),
      fx('t1', 'fade-in', { trigger: 'tg' }), fx('t2', 'zoom-in', { trigger: 'tg', start: 'with' })],
  ))
  // 5: text by paragraph, word and letter
  slides.push(slideOf(
    [text('tp', ['First paragraph', 'Second paragraph', 'Third paragraph'], 100, 100), text('tw', 'Words come one by one here', 100, 400), text('tl', 'Letters appear', 100, 600)],
    [fx('tp', 'fade-in', { textBy: 'paragraph', stagger: 300, start: 'click' }), fx('tw', 'fly-in', { textBy: 'word', stagger: 120, start: 'click' }), fx('tl', 'fade-in', { textBy: 'letter', stagger: 40, start: 'click' })],
  ))
  // 6: pictures, charts, tables, icons, shapes
  slides.push(slideOf(
    [image('im', 100, 100), chart('ch', 500, 100), table('tb', 1100, 100), icon('ic', 100, 500), shape('sh', 300, 500)],
    [fx('im', 'fade-in', { start: 'click' }), fx('ch', 'wipe-in', { start: 'after' }), fx('tb', 'zoom-in', { start: 'after' }), fx('ic', 'spin', { start: 'click' }), fx('sh', 'color-change', { start: 'after', color: '#16a34a' })],
  ))
  // 7-14: transitions
  const T: Transition[] = [
    { type: 'fade', duration: 600 }, { type: 'slide', duration: 800, direction: 'left' }, { type: 'push', duration: 1000, direction: 'up' }, { type: 'wipe', duration: 1500, direction: 'down' },
    { type: 'zoom', duration: 500 }, { type: 'fade', duration: 400, advanceAfter: 3000, advanceOnClick: false }, { type: 'none', duration: 500, advanceAfter: 2000 }, { type: 'push', duration: 700 },
  ]
  T.forEach((t, i) => slides.push(slideOf([text(`tr${i}`, `Transition ${t.type} ${t.direction ?? ''}`, 100, 200, { fontSize: 60, width: 1200 })], [], t)))
  // 15-16 Morph by object; 17-18 Morph by word
  slides.push(slideOf([text('m1', 'Morph me', 100, 100, { fontSize: 60 }), shape('m2', 100, 500)]))
  slides.push(slideOf([text('m1', 'Morph me', 900, 500, { fontSize: 90 }), shape('m2', 1400, 100, { width: 300 }), text('m3', 'only here', 100, 100)], [], { type: 'morph', duration: 1200, by: 'object' }))
  slides.push(slideOf([text('w1', 'Alpha beta gamma delta', 100, 100, { fontSize: 50, width: 900 })]))
  slides.push(slideOf([text('w1', 'Delta gamma beta alpha', 100, 600, { fontSize: 50, width: 900 })], [], { type: 'morph', duration: 1500, by: 'word' }))
  return deckOf(slides)
}
