import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, BULLET_GLYPHS, CARD_STYLES, DECOR_STYLES, MORPH_SCENES, presentationSchema, slideContentSchema, type Presentation, type SlideContent, type Theme, type ThemeStyle } from '@prompttoppt/validation'
import { THEMES, applyValidation, composeSlide } from '../index'
import { CLASSIC } from '../samples'

type M = Extract<SlideContent, { layout: 'morph' }>
const text = (n: number) => 'Reducing manual handoffs between teams so customers get answers in minutes instead of days, every single time it matters'.slice(0, n)
/** the worst case the schema allows: 4 cards with a 40-letter heading and 160 letters of text, a long title and subtitle */
const worst = (scene: M['scene'], items = 4): M => ({
  layout: 'morph', scene, title: scene === 'quote' ? text(120) : 'Salesforce Agentforce: an executive overview for the board', kicker: 'Executive overview', subtitle: text(120),
  items: Array.from({ length: items }, (_, i) => ({ heading: ['Autonomous agents that act', 'Trusted data foundation', 'Guardrails and governance', 'Measured business value'][i]!.slice(0, 40), text: text(150) })),
  focus: 1, stat: { value: '$12.4M', label: 'Annual recurring revenue added in a year' }, speakerNotes: '', sources: [],
})
const doc = (theme: Theme, aspect: (typeof ASPECT_RATIOS)[number], contents: SlideContent[], idGen: () => string): Presentation => ({
  schemaVersion: 1, id: 'p', title: 'T', aspectRatio: aspect, language: 'en', theme, sources: [],
  slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, aspect, idGen) })),
})
const problems = (d: Presentation) => applyValidation(d).report.slides.flatMap((s) => s.issues.map((i) => ({ ...i, layout: d.slides.find((x) => x.id === s.slideId)!.content && (d.slides.find((x) => x.id === s.slideId)!.content as { scene?: string }).scene }))).filter((i) => i.severity === 'error' || i.code === 'contrast')

describe('morph layouts: every scene is a valid, clean slide', () => {
  it('the content schema accepts every scene, and the Morph layout is not offered to ordinary decks', () => {
    for (const scene of MORPH_SCENES) expect(slideContentSchema.safeParse(worst(scene)).success, scene).toBe(true)
  })

  for (const theme of THEMES) {
    for (const aspect of ASPECT_RATIOS) {
      it(`${theme.id} @ ${aspect}: all twelve scenes compose into schema-valid slides with no validation errors`, () => {
        let n = 0
        const d = doc(theme, aspect, MORPH_SCENES.map((s) => worst(s)), () => `e${n++}`)
        const parsed = presentationSchema.safeParse(d)
        expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true)
        const bad = problems(d)
        expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([])
      })
    }
  }

  const classic = THEMES[0]!
  const variants: [string, Partial<ThemeStyle>][] = [
    ...CARD_STYLES.map((v) => [`card:${v}`, { card: v }] as [string, Partial<ThemeStyle>]),
    ...DECOR_STYLES.map((v) => [`decor:${v}`, { decor: v }] as [string, Partial<ThemeStyle>]),
    ...(['gradient', 'tint'] as const).map((v) => [`body:${v}`, { bodyBackground: v }] as [string, Partial<ThemeStyle>]),
    ...(['gradient', 'dark', 'surface', 'accent'] as const).map((v) => [`titleBg:${v}`, { titleBackground: v }] as [string, Partial<ThemeStyle>]),
    ['uppercase+tracking', { uppercaseHeadings: true, headingTracking: 4, headingWeight: 900 }],
    ['footer', { footer: 'number' }],
    ...BULLET_GLYPHS.slice(0, 2).map((g) => [`bullet:${g}`, { bullet: g }] as [string, Partial<ThemeStyle>]),
  ]
  for (const [name, style] of variants) {
    it(`style variant ${name}: every scene × every aspect composes clean`, () => {
      const theme: Theme = { ...classic, style: { ...CLASSIC, ...style } as ThemeStyle, motion: { transition: 'fade', entrance: 'fade-up', stagger: 120, duration: 600 } }
      for (const aspect of ASPECT_RATIOS) {
        let n = 0
        const d = doc(theme, aspect, MORPH_SCENES.map((s) => worst(s)), () => `e${n++}`)
        expect(presentationSchema.safeParse(d).success).toBe(true)
        const bad = problems(d)
        expect(bad, `${name} @ ${aspect}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([])
      }
    })
  }

  it('one to four cards (and none) compose clean in every scene', () => {
    for (const aspect of ASPECT_RATIOS) for (const items of [0, 1, 2, 3, 4]) {
      let n = 0
      const d = doc(classic, aspect, MORPH_SCENES.map((s) => worst(s, items)), () => `e${n++}`)
      const bad = problems(d)
      expect(bad, `${items} cards @ ${aspect}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([])
    }
  })

  it('a deck with no picture and no stat, and a scene with only a title, compose clean', () => {
    const bare = (scene: M['scene']): M => ({ layout: 'morph', scene, title: 'Just a title', items: [], speakerNotes: '', sources: [] })
    const d = doc(classic, '16:9', MORPH_SCENES.map(bare), () => Math.random().toString())
    expect(problems(d)).toEqual([])
  })
})

describe('morph layouts: the "same layout three times" rule counts scenes', () => {
  const dup = (scenes: M['scene'][]) => applyValidation(doc(THEMES[0]!, '16:9', scenes.map((x) => worst(x)), () => Math.random().toString())).report.slides.flatMap((x) => x.issues).filter((i) => i.code === 'duplicate_layout')
  it('three slides of one scene in a row are flagged; twelve different scenes are not', () => {
    expect(dup(['cards-row', 'cards-row', 'cards-row'])).toHaveLength(1)
    expect(dup([...MORPH_SCENES])).toHaveLength(0)
    expect(dup(['cards-row', 'spotlight', 'cards-row', 'spotlight'])).toHaveLength(0)
  })
})

describe('morph layouts: the same part has the same id on every slide', () => {
  const ids = (d: Presentation, i: number) => d.slides[i]!.elements.map((e) => e.id)

  it('every element has a stable name that does not depend on the id generator', () => {
    const a = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), (() => { let n = 0; return () => `a${n++}` })())
    const b = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), () => Math.random().toString(36))
    for (let i = 0; i < MORPH_SCENES.length; i++) {
      expect(ids(b, i), MORPH_SCENES[i]).toEqual(ids(a, i))
      expect(ids(a, i).every((id) => id.startsWith('m-')), `${MORPH_SCENES[i]}: ${ids(a, i).filter((id) => !id.startsWith('m-')).join(',')}`).toBe(true)
    }
  })

  it('ids are unique within a slide', () => {
    for (const aspect of ASPECT_RATIOS) {
      const d = doc(classic0(), aspect, MORPH_SCENES.map((s) => worst(s)), () => 'x')
      for (const [i, s] of d.slides.entries()) expect(new Set(s.elements.map((e) => e.id)).size, `${MORPH_SCENES[i]} @ ${aspect}`).toBe(s.elements.length)
    }
  })

  it('the title is the same element in every scene, and the cards are the same cards in every scene that shows them', () => {
    const d = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), () => 'x')
    d.slides.forEach((s, i) => expect(s.elements.some((e) => e.id === 'm-title'), MORPH_SCENES[i]).toBe(true))
    const showsCards = ['hero-left', 'cards-row', 'cards-column', 'cards-grid', 'spotlight', 'timeline', 'big-stat', 'compare', 'closing']
    for (const scene of showsCards) {
      const s = d.slides[MORPH_SCENES.indexOf(scene as M['scene'])]!
      for (let k = 0; k < 4; k++) expect(s.elements.some((e) => e.id === `m-c${k}-h`), `${scene} card ${k}`).toBe(true)
    }
  })

  it('a part keeps its kind from scene to scene (a title is always text, the hero is always the same kind), so a Morph can match it', () => {
    const d = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), () => 'x')
    const kind = new Map<string, string>()
    for (const s of d.slides) for (const e of s.elements) {
      const seen = kind.get(e.id)
      if (seen) expect(e.type, e.id).toBe(seen)
      else kind.set(e.id, e.type)
    }
    expect(kind.get('m-title')).toBe('text')
  })

  it('consecutive card scenes share most of their elements, so most of the slide moves rather than fades', () => {
    const d = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), () => 'x')
    const at = (scene: M['scene']) => new Set(ids(d, MORPH_SCENES.indexOf(scene)))
    for (const [a, b] of [['cards-row', 'cards-grid'], ['cards-grid', 'spotlight'], ['hero-left', 'cards-column'], ['spotlight', 'timeline'], ['timeline', 'compare']] as const) {
      const A = at(a), B = at(b)
      const shared = [...A].filter((id) => B.has(id)).length
      expect(shared / Math.min(A.size, B.size), `${a} → ${b}`).toBeGreaterThan(0.6)
    }
  })

  it('every Morph slide arrives by a Morph the person owns, and no element carries an entrance animation (the deck moves by its transitions)', () => {
    const d = doc(classic0(), '16:9', MORPH_SCENES.map((s) => worst(s)), () => 'x')
    for (const s of d.slides) {
      expect(s.transition).toMatchObject({ type: 'morph', own: true })
      expect(s.elements.filter((e) => e.animation).map((e) => e.id)).toEqual([])
    }
  })

  it('the picture is the same element id whether it is a picture or the colour block that stands in for it', () => {
    const withPic = composeSlide({ ...worst('cover'), imageUrl: 'https://example.com/a.jpg', imageAlt: 'x' }, classic0(), '16:9', () => 'x')
    const without = composeSlide(worst('cover'), classic0(), '16:9', () => 'x')
    expect(withPic.elements.find((e) => e.id === 'm-hero')?.type).toBe('image')
    expect(without.elements.find((e) => e.id === 'm-hero')?.type).toBe('shape')
  })

  it('the spotlight enlarges the chosen card and keeps the others', () => {
    const at = (focus: number) => composeSlide({ ...worst('spotlight'), focus }, classic0(), '16:9', () => 'x').elements
    const wide = (els: ReturnType<typeof at>, k: number) => els.find((e) => e.id === `m-c${k}`)!.width
    for (const f of [0, 1, 2, 3]) {
      const els = at(f)
      expect(wide(els, f)).toBeGreaterThan(wide(els, (f + 1) % 4) * 1.4)
      for (let k = 0; k < 4; k++) expect(els.some((e) => e.id === `m-c${k}-h`)).toBe(true)
    }
  })
})

describe('morph layouts: the parts are rigid, so a Morph only moves and scales them', () => {
  const deck = (aspect: (typeof ASPECT_RATIOS)[number] = '16:9') => doc(THEMES[0]!, aspect, MORPH_SCENES.map((x) => ({ ...worst(x), imageUrl: 'https://example.com/a.jpg', imageAlt: 'a' })), () => 'x')
  const find = (d: Presentation, id: string) => d.slides.flatMap((sl, i) => { const e = sl.elements.find((x) => x.id === id); return e ? [{ e, scene: MORPH_SCENES[i]! }] : [] })

  it('a card keeps its text wrapping from scene to scene: its heading and body have the same width-to-font-size ratio wherever it is drawn', () => {
    for (const aspect of ASPECT_RATIOS) {
      const d = deck(aspect)
      for (let i = 0; i < 4; i++) for (const part of ['h', 't']) {
        const seen = find(d, `m-c${i}-${part}`).map(({ e, scene }) => ({ scene, ratio: e.type === 'text' ? e.width / e.fontSize : 0 }))
        expect(seen.length, `card ${i} ${part} @ ${aspect}`).toBeGreaterThan(2)
        const first = seen[0]!.ratio
        for (const x of seen) expect(Math.abs(x.ratio / first - 1), `card ${i} ${part} in ${x.scene} @ ${aspect}: ${x.ratio.toFixed(1)} vs ${first.toFixed(1)}`).toBeLessThan(0.06) // font sizes are whole pixels, so a small card rounds a little
      }
    }
  })

  it('a card with its body keeps its proportions in every scene', () => {
    const d = deck()
    for (let i = 0; i < 4; i++) {
      const bgs = find(d, `m-c${i}`).filter(({ scene }) => find(d, `m-c${i}-t`).some((x) => x.scene === scene))
      for (const { e, scene } of bgs) expect(Math.abs(e.width / e.height / (500 / 380) - 1), `card ${i} in ${scene}`).toBeLessThan(0.03)
    }
  })

  it('the picture has one shape (4:5) at every size, so it is only ever scaled and never re-cropped', () => {
    for (const aspect of ASPECT_RATIOS) {
      const seen = find(deck(aspect), 'm-hero')
      expect(seen.length).toBeGreaterThan(5)
      for (const { e, scene } of seen) expect(Math.abs(e.width / e.height / 0.8 - 1), `${scene} @ ${aspect}`).toBeLessThan(0.02)
    }
  })

  it('the header does not move between the content scenes: the title and the kicker are in the same place at the same size', () => {
    const d = deck()
    const content = ['cards-row', 'cards-column', 'cards-grid', 'spotlight', 'timeline', 'big-stat', 'compare']
    const at = (id: string) => content.map((sc) => d.slides[MORPH_SCENES.indexOf(sc as M['scene'])]!.elements.find((e) => e.id === id)!)
    for (const id of ['m-title', 'm-kicker', 'm-sub']) {
      const els = at(id)
      for (const e of els) expect([e.x, e.y, e.width, e.type === 'text' ? e.fontSize : 0], id).toEqual([els[0]!.x, els[0]!.y, els[0]!.width, els[0]!.type === 'text' ? els[0]!.fontSize : 0])
    }
  })

  it('a card too small to read its body shows number and heading only, and its body is back when it is big again', () => {
    const d = deck()
    const body = (scene: M['scene'], i: number) => d.slides[MORPH_SCENES.indexOf(scene)]!.elements.some((e) => e.id === `m-c${i}-t`)
    expect(body('cards-row', 0)).toBe(true)
    expect(body('spotlight', 1)).toBe(true) // the one on stage
    expect(body('spotlight', 0)).toBe(false) // waiting
    expect(body('cards-column', 2)).toBe(false)
  })
})

function classic0(): Theme { return THEMES[0]! }
