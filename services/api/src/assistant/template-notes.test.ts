import { describe, expect, it } from 'vitest'
import { composeSlide } from '@prompttoppt/theme'
import { getMorphTemplate, pictureSlots, templateTheme } from '@prompttoppt/theme/morph-templates'
import type { Presentation } from '@prompttoppt/validation'
import { runAssistant } from './pipeline.ts'
import { intentSchema } from './understand.ts'
import { addSlideNote, sceneMoveNote, templatePictureScenes } from './capabilities/template-notes.ts'

/** a deck of the Social Feed template, every scene, composed the way generation composes it */
function feedDeck(): Presentation {
  const tpl = getMorphTemplate('mkt-feed')!
  const theme = templateTheme(tpl)
  let k = 0
  const slides = tpl.scenes.map((sc, i) => {
    const content = { layout: 'morph-template', template: tpl.id, scene: sc.id, fields: {}, images: {}, speakerNotes: '', sources: [] } as never
    return { id: `s${i}`, locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(content, theme, '16:9', () => `m${k++}`) }
  })
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides } as unknown as Presentation
}
const ent = { features: { advancedEditor: true, morph: true, premiumTemplates: true } } as never
const go = (doc: Presentation, intent: object, o: object = {}) => runAssistant({ doc, ent, instruction: 'x', activeSlideId: 's0', ...o } as never, {
  understand: async () => intentSchema.parse({ kind: 'edit', clarity: 'act', ...intent }),
  write: async () => { throw new Error('no writing expected') },
  newId: (() => { let i = 0; return () => `new${++i}` })(),
} as never) as Promise<{ kind: string; notes: string[]; applied: string[] }>
const T = (family: string, targets: unknown[], values: object = {}) => ({ family, targets, values })

describe('what is said about animated template slides (section 5 of the honesty document)', () => {
  it('deleting a scene warns that the Morph between its neighbours changes, and still deletes it', async () => {
    const r = await go(feedDeck(), { tasks: [T('remove_slide', [{ by: 'number', n: 2 }])] })
    expect(r.notes.join(' ')).toMatch(/Slide 2 is a scene of an animated template, so the Morph between the slides next to it may look different now\. Ctrl\+Z puts it back\./)
    expect(r.applied.join(' ')).toMatch(/Deleted slide 2/)
  })
  it('moving a scene says the same for its old and new neighbours', async () => {
    const r = await go(feedDeck(), { tasks: [T('move_slide', [{ by: 'number', n: 2 }], { where: 'end' })] })
    expect(r.notes.join(' ')).toMatch(/Morph between its old and new neighbours may look different/)
  })
  it('an ordinary deck gets no such note', async () => {
    const d = feedDeck(); d.slides.forEach((s) => { delete (s as { content?: unknown }).content; s.layoutId = 'blank' as never })
    const r = await go(d, { tasks: [T('remove_slide', [{ by: 'number', n: 2 }])] })
    expect(r.notes.join(' ')).not.toMatch(/Morph/)
  })
  it('a new slide in a template deck is said to be an ordinary slide; in an ordinary deck nothing is said', () => {
    expect(addSlideNote(feedDeck())).toMatch(/ordinary slide in the deck's colours and fonts: it has no Morph scene/)
    const plain = feedDeck(); plain.slides.forEach((s) => { delete (s as { content?: unknown }).content; s.layoutId = 'blank' as never })
    expect(addSlideNote(plain)).toBeNull()
    expect(sceneMoveNote(plain, ['s1'], 'delete')).toBeNull()
  })
  it('a template picture is one picture on every slide that shows it: the count is computed from the deck, locked slides are named', () => {
    const d = feedDeck()
    const tpl = getMorphTemplate('mkt-feed')!
    const slot = pictureSlots(tpl).find((sl) => new Set(sl.uses.map((u) => u.scene)).size > 1)!
    const use = slot.uses[0]!
    const slide = d.slides.find((s) => s.content?.layout === 'morph-template' && (s.content as { scene: string }).scene === use.scene)!
    const scenes = templatePictureScenes(d, slide.id, use.id)!
    expect(scenes.total).toBe(new Set(slot.uses.map((u) => u.scene)).size); expect(scenes.locked).toBe(0)
    const other = d.slides.find((s) => s.id !== slide.id && s.content?.layout === 'morph-template' && slot.uses.some((u) => u.scene === (s.content as { scene: string }).scene))!
    other.locked = true
    expect(templatePictureScenes(d, slide.id, use.id)).toEqual({ total: scenes.total, locked: 1 })
    expect(templatePictureScenes(d, slide.id, 'no-such-object')).toBeNull()
  })
  it('replacing a template picture from the chat says it was replaced on all the slides that show it', async () => {
    const d = feedDeck()
    const tpl = getMorphTemplate('mkt-feed')!
    const slot = pictureSlots(tpl).find((sl) => new Set(sl.uses.map((u) => u.scene)).size > 1)!
    const use = slot.uses[0]!
    const idx = d.slides.findIndex((s) => s.content?.layout === 'morph-template' && (s.content as { scene: string }).scene === use.scene)
    const r = await go(d, { tasks: [T('picture', [{ by: 'number', n: idx + 1 }], { replace: 'coffee' })] }, { instruction: 'use my coffee beans photo here', uploads: [{ id: 'u1', url: 'https://x.test/mine.png', name: 'coffee beans' }], selection: { slideIds: [], elementIds: [use.id] } })
    expect(r.notes.join(' ')).toMatch(/part of the template's animation, so it was replaced on all \d+ slides that show it/)
  })
  it('a palette change on a template deck says the template slides keep their colours (measured: they do not change); an ordinary deck gets no note', async () => {
    // every slide is a scene: nothing the person sees would change, so it is ASKED first (never a "Done" with no visible change)
    const asked = await go(feedDeck(), { tasks: [T('palette', [], { primary: '#d4145a', accent: '#0a7d5a' })] }) as unknown as { kind: string; question: { text: string; options: { confirm?: unknown }[] } }
    expect(asked.kind).toBe('ask')
    expect(asked.question.text).toMatch(/would not change any slide you have now: only slides you add later\. Change the deck colours anyway\?/)
    const r = await go(feedDeck(), { tasks: [] }, { confirm: asked.question.options[0]!.confirm })
    expect(r.kind).toBe('done')
    expect(r.notes.join(' ')).toMatch(/use an animated template, whose artwork keeps the template's own colours, so they look the same as before\. The new colours show on slides you add later\./)
    const plain = feedDeck(); plain.slides.forEach((s) => { delete (s as { content?: unknown }).content; s.layoutId = 'blank' as never })
    const r2 = await go(plain, { tasks: [T('palette', [], { primary: '#d4145a', accent: '#0a7d5a' })] })
    expect(r2.notes.join(' ')).not.toMatch(/animated template/)
  })
})
