import { describe, expect, it } from 'vitest'
import { presentationSchema, slideContentSchema, type Presentation, type SlideContent } from '@prompttoppt/validation'
import { MORPH_TEMPLATES, composeTemplateScene, getMorphTemplate, objectText, templateTheme, textSlots, type MorphTemplate } from './index'
import { composeSlide, validateSlide } from '../index'

type Content = Extract<SlideContent, { layout: 'morph-template' }>
const content = (tpl: MorphTemplate, scene: string, extra: Partial<Content> = {}): Content => ({ layout: 'morph-template', template: tpl.id, scene, fields: {}, images: {}, speakerNotes: '', sources: [], ...extra })
const deck = (tpl: MorphTemplate): Presentation => ({
  schemaVersion: 1, id: 'p', title: tpl.name, aspectRatio: '16:9', language: 'en', theme: templateTheme(tpl), sources: [],
  slides: tpl.scenes.map((s, i) => ({ id: `s${i}`, locked: false, manual: true, validation: { status: 'passed' as const, issues: [] }, ...composeTemplateScene(tpl, content(tpl, s.id), { assetBase: 'https://example.com' }) })),
})

describe.each(MORPH_TEMPLATES.map((t) => [t.id, t] as const))('Morph template "%s"', (_id, tpl) => {
  it('is listed, named, and has a scene for every slide of its data', () => {
    expect(getMorphTemplate(tpl.id)).toBe(tpl)
    expect(tpl.scenes.length).toBe(tpl.data.slides.length)
    for (const s of tpl.scenes) expect(tpl.data.slides.some((d) => `s${d.n}` === s.id), s.id).toBe(true)
    expect(tpl.durationMs).toBe(1500)
  })

  it('every scene composes into a deck the save schema accepts, with a Morph in the template\'s own style', () => {
    const d = deck(tpl)
    const parsed = presentationSchema.safeParse(d)
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true)
    for (const s of d.slides) expect(s.transition).toMatchObject({ type: 'morph', duration: 1500, blend: 'cross', own: true })
    for (const s of tpl.scenes) expect(slideContentSchema.safeParse(content(tpl, s.id)).success).toBe(true)
  })

  it('ids are unique within a scene and keep their kind from scene to scene (so a Morph can match them)', () => {
    const d = deck(tpl)
    const kind = new Map<string, string>()
    for (const s of d.slides) {
      expect(new Set(s.elements.map((e) => e.id)).size).toBe(s.elements.length)
      for (const e of s.elements) { expect(kind.get(e.id) ?? e.type, e.id).toBe(e.type); kind.set(e.id, e.type) }
    }
  })

  it('consecutive scenes share objects, so the deck moves as one piece (the background and the hero object at least)', () => {
    const d = deck(tpl)
    for (let i = 1; i < d.slides.length; i++) {
      const a = new Set(d.slides[i - 1]!.elements.map((e) => e.id))
      const shared = d.slides[i]!.elements.filter((e) => a.has(e.id)).length
      expect(shared, `${tpl.scenes[i - 1]!.id} -> ${tpl.scenes[i]!.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('every visible picture has artwork (the files themselves are checked by the API package, which can read the disk)', () => {
    for (const sl of tpl.data.slides) for (const o of sl.objects) {
      if (o.kind !== 'image' || (o.alpha ?? 1) < 0.05) continue
      expect(o.hash ? tpl.pictures[o.hash] : undefined, `${sl.n} ${o.id} (${o.file})`).toBeDefined()
    }
  })

  it('the template\'s words are replaced where asked, and any scene\'s text can be given its own words and its own picture', () => {
    const sc = tpl.scenes[1]!.id
    const slots = textSlots(tpl, sc)
    expect(slots.length).toBeGreaterThan(0)
    const out = composeTemplateScene(tpl, content(tpl, sc, { fields: { [slots[0]!.id]: 'Our own words' } }))
    const el = out.elements.find((e) => e.id === slots[0]!.id)
    expect(el?.type === 'text' && el.paragraphs[0]!.runs[0]!.text).toBe('Our own words')
    // a picture override
    const img = tpl.data.slides.find((s) => `s${s.n}` === sc)!.objects.find((o) => o.kind === 'image' && (o.alpha ?? 1) > 0.5)
    if (img) {
      const o2 = composeTemplateScene(tpl, content(tpl, sc, { images: { [img.id]: { url: 'https://images.example.com/x.jpg', alt: 'x' } } }))
      expect(o2.elements.find((e) => e.id === img.id)).toMatchObject({ type: 'image', src: 'https://images.example.com/x.jpg' })
    }
  })

  it('the branding of the source deck is not in any scene', () => {
    const all = deck(tpl).slides.flatMap((s) => s.elements).filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : '')).join(' | ').toLowerCase()
    expect(all).not.toContain('slidescarnival')
    expect(all).not.toContain('delete this page')
  })

  it('goes through the layout engine like any other layout, and is not second-guessed by the validators', () => {
    const c = content(tpl, tpl.scenes[2]!.id)
    const viaEngine = composeSlide(c as SlideContent, templateTheme(tpl), '16:9', undefined, { assetBase: 'https://example.com' })
    expect(viaEngine.elements).toEqual(composeTemplateScene(tpl, c, { assetBase: 'https://example.com' }).elements)
    const slide = { id: 's', locked: false, validation: { status: 'pending' as const, issues: [] }, ...viaEngine }
    expect(validateSlide(slide, templateTheme(tpl))).toEqual([])
  })

  it('text keeps its source size (points -> pixels) and its colour', () => {
    const first = tpl.data.slides[0]!.objects.filter((o) => o.kind === 'text').sort((a, b) => ((b.paras?.find(Boolean)?.runs[0]?.sz ?? 0) - (a.paras?.find(Boolean)?.runs[0]?.sz ?? 0)))[0]!
    const pt = first.paras!.find(Boolean)!.runs[0]!.sz!
    const el = composeTemplateScene(tpl, content(tpl, tpl.scenes[0]!.id)).elements.find((e) => e.id === first.id)!
    expect(el.type === 'text' && Math.abs(el.fontSize - pt * (96 / 72))).toBeLessThan(0.2)
    expect(objectText(first).length).toBeGreaterThan(0)
  })
})

describe('Product Launch: a tilted picture becomes the upright artwork, turned', () => {
  const tpl = getMorphTemplate('launch')!
  it('the can on the cover is turned about the same centre as the tilted picture it stands for', () => {
    const o = tpl.data.slides[0]!.objects.find((x) => x.kind === 'image' && tpl.pictures[x.hash!]?.tilt)!
    const el = composeTemplateScene(tpl, content(tpl, 's1')).elements.find((e) => e.id === o.id)!
    expect(Math.abs(el.rotation)).toBeGreaterThan(8)
    expect(Math.abs(el.rotation)).toBeLessThan(50)
    expect(Math.abs(el.x + el.width / 2 - (o.x + o.w / 2))).toBeLessThan(1)
    expect(Math.abs(el.y + el.height / 2 - (o.y + o.h / 2))).toBeLessThan(1)
    expect(el.width / el.height).toBeCloseTo(369 / 670, 2)
  })
  it('the starburst is made of real shapes: rays turned at different angles', () => {
    const rays = composeTemplateScene(tpl, content(tpl, 's6')).elements.filter((e) => e.type === 'shape' && e.shape === 'polygon')
    expect(rays.length).toBe(12)
    expect(new Set(rays.map((r) => Math.round(r.rotation))).size).toBeGreaterThan(8)
  })
})
