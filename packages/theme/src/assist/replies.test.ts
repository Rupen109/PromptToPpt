import { describe, expect, it } from 'vitest'
import type { Expectation, Presentation, SlideContent } from '@prompttoppt/validation'
import { getTheme } from '../themes'
import { MORPH_TEMPLATES, pictureSlots } from '../morph-templates'
import { compose } from './claims'
import { collateralChanges } from './collateral'
import { expectationsFromChanges } from './expectations'

/** W0 slice 5: the reply says what really happened, worded from the KIND of each note (decided where it was written), never from its words */
const slide = (id: string, content?: object) => ({ id, layoutId: (content as { layout?: string })?.layout ?? 'blank', locked: false, validation: { status: 'passed', issues: [] }, elements: [], ...(content ? { content } : {}) })
const deck = (...s: ReturnType<typeof slide>[]): Presentation => ({ schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: getTheme('cobalt'), sources: [], slides: s } as unknown as Presentation)
const lock = (slideId: string, key = 'k'): Expectation => ({ key, kind: 'lock', slideId, locked: true, wasLocked: false })
const done = (key = 'k') => ({ key, kind: 'lock' as const, status: 'done' as const, evidence: [] })

describe('the headline follows the kinds of the notes', () => {
  const d = deck(slide('a'), slide('b'))
  it('done + a part refused before anything ran = "Partly done", never "Done"', () => {
    const r = compose([lock('a')], [done()], d, ['Slide 2: moving the title there would cover the body text, so I left it.'], { refused: ['Slide 2: moving the title there would cover the body text, so I left it.'], already: [] })
    expect(r.outcome).toBe('partial')
    expect(r.reply).toMatch(/^Partly done — locked slide 1.*, but I couldn't do one part of it\. See the notes below\.$/)
  })
  it('done + only information = "Done" with the pointer', () => {
    const r = compose([lock('a')], [done()], d, ['It is not shown on the first slide.'])
    expect(r.outcome).toBe('done'); expect(r.reply).toMatch(/^Done — locked slide 1.*\. See the notes below\.$/)
  })
  it('nothing done, everything already so = "Nothing needed changing", never "I couldn\'t"', () => {
    const r = compose([], [], d, ['The deck already shows slide numbers.'], { refused: [], already: ['The deck already shows slide numbers.'] })
    expect(r.outcome).toBe('already'); expect(r.reply).toMatch(/^Nothing needed changing/)
  })
  it('nothing done, a part refused = "I couldn\'t do that"', () => {
    const r = compose([], [], d, ['Slide 3 is locked, so I left it.'], { refused: ['Slide 3 is locked, so I left it.'], already: [] })
    expect(r.outcome).toBe('nothing'); expect(r.reply).toBe("I couldn't do that — nothing was changed. See the note below.")
  })
})

describe('slide numbers: the slide the person named, then where the result is', () => {
  it('"duplicate slide 2" reads "Duplicated slide 2 (the copy is slide 3)"; "move slide 3 to the end" reads "Moved slide 3 (now slide 4)"', () => {
    const before = deck(slide('a'), slide('b'), slide('c'), slide('d'))
    const [dup] = expectationsFromChanges(before, { theme: null, edits: [], duplicates: [{ slideId: 'b', newId: 'b2' }] })
    const afterDup = deck(slide('a'), slide('b'), slide('b2'), slide('c'), slide('d'))
    expect(compose([dup!], [{ key: dup!.key, kind: 'duplicate', status: 'done', evidence: [] }], afterDup).applied).toEqual(['Duplicated slide 2 (the copy is slide 3)'])
    const [mv] = expectationsFromChanges(before, { theme: null, edits: [], moves: [{ slideId: 'c', afterSlideId: 'd' }] })
    const afterMove = deck(slide('a'), slide('b'), slide('d'), slide('c'))
    expect(compose([mv!], [{ key: mv!.key, kind: 'move', status: 'done', evidence: [] }], afterMove).applied).toEqual(['Moved slide 3 (now slide 4)'])
  })
})

describe('edits are named by what they did', () => {
  const words = { layout: 'split-image-text', title: 'T', bullets: ['a', 'b'], imageUrl: 'https://x.test/p.jpg', imageAlt: 'p', speakerNotes: 'old', sources: [] }
  it('only the speaker notes changed (keys written in another order) = "Wrote the speaker notes"', () => {
    const before = deck(slide('a', words))
    const reordered = { sources: [], speakerNotes: 'new notes', imageAlt: 'p', imageUrl: 'https://x.test/p.jpg', bullets: ['a', 'b'], title: 'T', layout: 'split-image-text' } as unknown as SlideContent
    const [e] = expectationsFromChanges(before, { theme: null, edits: [{ slideId: 'a', content: reordered }] })
    expect(e).toMatchObject({ kind: 'edit', change: 'notes' })
  })
  it('a picture layout switched to text ("remove the image") = "Removed the picture", never "had no picture to remove"', () => {
    const before = deck(slide('a', words))
    const [e] = expectationsFromChanges(before, { theme: null, edits: [{ slideId: 'a', content: { layout: 'title-body', title: 'T', bullets: ['a', 'b'], speakerNotes: 'old', sources: [] } as SlideContent }] })
    expect(e).toMatchObject({ kind: 'edit', change: 'picture_off' })
    const after = deck(slide('a', { layout: 'title-body', title: 'T', bullets: ['a', 'b'], speakerNotes: 'old', sources: [] }))
    expect(compose([e!], [{ key: e!.key, kind: 'edit', status: 'done', evidence: [] }], after).applied).toEqual(['Removed the picture from slide 1 (the words stay, in a text layout)'])
  })
})

describe('a template picture changes on every scene that shows it: that is the asked change, not "something else"', () => {
  it('the other scenes of the same picture are not reported as collateral; an unrelated slide still is', () => {
    const tpl = MORPH_TEMPLATES.find((t) => pictureSlots(t).some((s) => s.uses.length > 1))!
    const slot = pictureSlots(tpl).find((s) => s.uses.length > 1)!
    const scenes = slot.uses.map((u, i) => slide(`s${i}`, { layout: 'morph-template', template: tpl.id, scene: u.scene, fields: {}, images: {}, speakerNotes: '', sources: [] }))
    const before = deck(...scenes, slide('x'))
    const after = structuredClone(before)
    for (const s of after.slides.slice(0, scenes.length)) (s as { touched?: boolean }).touched = true // (each scene's picture changed)
    const swap: Expectation = { key: 'p', kind: 'picture_swap', slideId: 's0', elementId: slot.uses[0]!.id, from: 'a', to: 'b' } as Expectation
    expect(collateralChanges(before, after, [swap])).toEqual([])
    ;(after.slides.at(-1) as { touched?: boolean }).touched = true
    expect(collateralChanges(before, after, [swap])).toEqual([scenes.length + 1])
  })
})

describe('a colour change on a template deck is said as a colour change', () => {
  it('dropping the template link is not "applied a design": dark mode reads "Switched to dark mode"', () => {
    const before = deck(slide('a'))
    ;(before.theme as { templateId?: string }).templateId = 'editorial'
    const to = { ...structuredClone(before.theme), id: 'custom', name: 'Custom colours', colors: { ...before.theme.colors, background: '#0A131C', surface: '#13202C', textPrimary: '#F5F7FF', textSecondary: '#C9D0E8' } }
    delete (to as { templateId?: string }).templateId
    const [e] = expectationsFromChanges(before, { theme: to as never, edits: [] })
    expect((e as { parts: string[] }).parts).not.toContain('design')
    const after = { ...before, theme: to } as Presentation
    expect(compose([e!], [{ key: e!.key, kind: 'theme', status: 'done', evidence: [] }], after).applied[0]).not.toMatch(/design/)
  })
})
