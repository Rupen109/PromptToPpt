import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { sectionSlides, sectionsOf, type Presentation, type SlideContent } from '@prompttoppt/validation'
import * as C from './commands'

let n = 0
const gen = () => `e${++n}`
const S = (layout: 'title' | 'section-divider' | 'title-body', title: string): SlideContent =>
  layout === 'title-body' ? { layout, title, bullets: ['a', 'b'], speakerNotes: '', sources: [] } : layout === 'section-divider' ? { layout, title, speakerNotes: '', sources: [] } as SlideContent : { layout, title, subtitle: 'x', speakerNotes: '', sources: [] }
/** cover, body | divider, body, body | divider, body */
const mkDoc = (): Presentation => {
  const theme = getTheme('cobalt')
  const list = [S('title', 'Cover'), S('title-body', 'Intro'), S('section-divider', 'Market'), S('title-body', 'Size'), S('title-body', 'Trend'), S('section-divider', 'Plan'), S('title-body', 'Roadmap')]
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: list.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) }
}

describe('sections (packages/validation sections.ts)', () => {
  it('a section runs from a section divider to the next; the slides before the first divider are the opening one', () => {
    const d = mkDoc()
    expect(sectionsOf(d.slides)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 4 }, { start: 5, end: 6 }])
    expect(sectionSlides(d.slides, 3)).toEqual([2, 3, 4])
    expect(sectionSlides(d.slides, 6)).toEqual([5, 6])
    expect(sectionSlides(d.slides, 0)).toEqual([0, 1])
  })
  it('a deck without dividers is one section', () => {
    const d = mkDoc(); const plain = d.slides.filter((s) => s.layoutId !== 'section-divider')
    expect(sectionsOf(plain)).toEqual([{ start: 0, end: plain.length - 1 }])
  })
})

describe('copyBackground: one slide\'s background, exactly as it is, on other slides', () => {
  it('a colour with its pattern', () => {
    const d = produce(mkDoc(), (x) => { C.setSlideBackground(x, 's2', '#123456'); C.setBackgroundPattern(x, 's2', 'dots') })
    let changed = 0
    const a = produce(d, (x) => { changed = C.copyBackground(x, 's2', ['s3', 's4']) })
    expect(changed).toBe(2)
    for (const id of ['s3', 's4']) expect(a.slides.find((s) => s.id === id)!.background).toEqual(a.slides[2]!.background)
    expect(a.slides[6]!.background).toEqual(d.slides[6]!.background) // another section is left alone
  })
  it('a gradient keeps its angle and kind; a picture keeps its blur', () => {
    const g = produce(mkDoc(), (x) => { C.setBackgroundGradient(x, 's2', '#111111', '#EEEEEE', 60, 'radial') })
    const a = produce(g, (x) => { C.copyBackground(x, 's2', ['s3']) })
    expect(a.slides[3]!.background).toMatchObject({ type: 'gradient', gradient: { from: '#111111', to: '#EEEEEE', angle: 60, kind: 'radial' } })
    const p = produce(mkDoc(), (x) => { C.setBackgroundPicture(x, 's2', 'https://x.test/bg.jpg'); C.setBackgroundBlur(x, 's2', 4) })
    const b = produce(p, (x) => { C.copyBackground(x, 's2', ['s4']) })
    expect(b.slides[4]!.background).toMatchObject({ type: 'image', value: 'https://x.test/bg.jpg', blur: 4 })
  })
  it('a slide in the deck\'s own background takes slides with their own back to the deck\'s; a locked slide and the slide itself are skipped', () => {
    const d = produce(mkDoc(), (x) => { C.setSlideBackground(x, 's3', '#AA0000'); C.setSlideBackground(x, 's4', '#00AA00'); x.slides[4]!.locked = true })
    let changed = 0
    const a = produce(d, (x) => { changed = C.copyBackground(x, 's1', ['s1', 's3', 's4']) })
    expect(changed).toBe(1)
    expect(a.slides[3]!.ownLook).toBeFalsy()
    expect(a.slides[3]!.background).toEqual(mkDoc().slides[3]!.background)
    expect(a.slides[4]!.background).toMatchObject({ value: '#00AA00' }) // locked
  })
})

describe('an assistant answer that copies a background (backgroundCopies)', () => {
  it('is applied with copyBackground, and its undo record puts the copied slides back ("undo that")', () => {
    const before = produce(mkDoc(), (x) => { C.setBackgroundGradient(x, 's2', '#111111', '#EEEEEE', 60) })
    const res: C.AssistChanges = { theme: null, edits: [], backgroundCopies: [{ fromSlideId: 's2', slideIds: ['s3', 's4'] }] }
    const after = produce(before, (x) => { for (const st of C.assistSteps(res)) st.apply(x) })
    expect(after.slides[3]!.background).toEqual(after.slides[2]!.background)
    expect(C.lookSlideIds(res)).toEqual(['s3', 's4'])
    const undo = C.snapshotAssist(before, after, false, ['Copied a background'], 'u1', C.lookSlideIds(res))
    const back = produce(after, (x) => { C.revertAssist(x, undo, 'all') })
    for (const i of [3, 4]) expect(back.slides[i]!.background).toEqual(before.slides[i]!.background)
    expect(back.slides[2]!.background).toEqual(before.slides[2]!.background)
  })
})
