import { describe, expect, it } from 'vitest'
import type { Presentation, Slide, SlideContent, Theme } from '@prompttoppt/validation'
import { composeSlide } from '../layout/index'
import { contrastRatio } from '../color'
import { effectiveBackground } from '../validate'
import { DESIGNS, SAMPLES, composeDeck } from '../index'
import { compose, contains, evaluate, evaluateAll, expectationsFromChanges, themeParts, type Expectation } from './index'

let n = 0
const id = () => `i${++n}`
const design = DESIGNS[0]!
const mk = (count = 5): Presentation => {
  const slides = composeDeck(SAMPLES.slice(0, count), design, '16:9', id).map((s) => ({ locked: false, validation: { status: 'passed' as const, issues: [] }, ...s, id: `s${++n}` }))
  return { schemaVersion: 1, id: 'x', title: 'Deck', aspectRatio: '16:9', language: 'en', theme: design.theme, sources: [], slides } as unknown as Presentation
}
const clone = (d: Presentation) => structuredClone(d)
const withImage = (d: Presentation, src = 'https://x.test/a.png') => { d.slides[0]!.elements.push({ id: 'pic', type: 'image', src, alt: 'cup', x: 0, y: 0, width: 300, height: 200, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' } as never); return d }
const only = (e: Expectation[]) => e[0]!

describe('contains: the content comparison holds for what the layout engine really makes', () => {
  it('every sample layout composed by the engine still contains the content it was given (no false "did not apply")', () => {
    for (const content of SAMPLES) {
      const s = composeSlide(content as SlideContent, design.theme, '16:9')
      expect(contains(content, s.content), `layout ${content.layout}`).toBe(true)
    }
  })
  it('detects a difference in text, in list length, and ignores keys that are only in the result', () => {
    expect(contains({ a: 'x', b: ['1', '2'] }, { a: 'x', b: ['1', '2'], c: 1 })).toBe(true)
    expect(contains({ a: 'x' }, { a: 'y' })).toBe(false)
    expect(contains({ b: ['1', '2'] }, { b: ['1'] })).toBe(false)
    expect(contains({ b: ['1'] }, { b: ['1', '2'] })).toBe(false)
    expect(contains({ a: { b: 1 } }, { a: null })).toBe(false)
  })
})

describe('evaluate: it looks at the DOCUMENT', () => {
  it('theme: done when the parts are in the deck, failed when not, "unchanged" when nothing differed', () => {
    const before = mk()
    const to: Theme = { ...before.theme, colors: { ...before.theme.colors, primary: '#123456' } }
    const e = expectationsFromChanges(before, { theme: to, edits: [] })
    expect(only(e)).toMatchObject({ kind: 'theme', parts: ['colours'] })
    expect(evaluate(only(e), { ...before, theme: to }).status).toBe('done')
    expect(evaluate(only(e), before)).toMatchObject({ status: 'failed', reason: 'not_applied' })
    const none = expectationsFromChanges(before, { theme: before.theme, edits: [] })
    expect(evaluate(only(none), before).status).toBe('unchanged')
    expect(themeParts(before.theme, { ...to, fonts: { heading: 'A', body: 'B' } })).toEqual(['colours', 'fonts'])
  })

  it('edit: done, locked, missing and "did not apply"', () => {
    const before = mk()
    const target = before.slides[1]!
    const content = { ...(target.content as SlideContent), title: 'A brand new title' } as SlideContent
    const e = only(expectationsFromChanges(before, { theme: null, edits: [{ slideId: target.id, content }] }))
    const after = clone(before); const s = after.slides[1]!; const fresh = composeSlide(content, after.theme, '16:9'); s.content = fresh.content; s.layoutId = fresh.layoutId
    expect(evaluate(e, after).status).toBe('done')
    expect(evaluate(e, before)).toMatchObject({ status: 'failed', reason: 'not_applied' })
    const locked = clone(after); locked.slides[1]!.locked = true
    expect(evaluate(e, locked)).toMatchObject({ status: 'skipped', reason: 'locked' })
    const gone = clone(after); gone.slides.splice(1, 1)
    expect(evaluate(e, gone)).toMatchObject({ status: 'failed', reason: 'missing_slide' })
  })

  it('picture swap: the right element of the right slide, still an image, really the new picture, and the output has transparency', () => {
    const before = withImage(mk())
    const slideId = before.slides[0]!.id
    const e = only(expectationsFromChanges(before, { theme: null, edits: [], pictureSwaps: [{ slideId, elementId: 'pic', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.4 }] }))
    expect(e).toMatchObject({ kind: 'picture_swap', from: 'https://x.test/a.png', to: 'https://x.test/cut.png' })
    const ok = clone(before); (ok.slides[0]!.elements.find((x) => x.id === 'pic') as { src: string }).src = 'https://x.test/cut.png'
    expect(evaluate(e, ok)).toMatchObject({ status: 'done' })
    expect(evaluate(e, ok).evidence.join(' ')).toMatch(/40% of the new picture is see-through/)
    expect(evaluate(e, before)).toMatchObject({ status: 'failed', reason: 'not_applied' }) // nothing changed
    const lockedSlide = clone(before); lockedSlide.slides[0]!.locked = true
    expect(evaluate(e, lockedSlide)).toMatchObject({ status: 'skipped', reason: 'locked' })
    const deleted = clone(ok); deleted.slides[0]!.elements = deleted.slides[0]!.elements.filter((x) => x.id !== 'pic')
    expect(evaluate(e, deleted)).toMatchObject({ status: 'failed', reason: 'missing_element' })
    const text = clone(ok); (text.slides[0]!.elements.find((x) => x.id === 'pic') as { type: string }).type = 'text'
    expect(evaluate(e, text)).toMatchObject({ status: 'failed', reason: 'not_image' })
    const opaque = only(expectationsFromChanges(before, { theme: null, edits: [], pictureSwaps: [{ slideId, elementId: 'pic', url: 'https://x.test/cut.png', alt: 'x', transparentShare: 0 }] }))
    expect(evaluate(opaque, ok)).toMatchObject({ status: 'failed', reason: 'no_transparency' }) // a "cut-out" with no transparency is never reported as done
  })

  it('slide management: add, duplicate, move, lock, remove', () => {
    const before = mk(5)
    const [a, b, , d] = before.slides
    const after = clone(before)
    after.slides.push({ ...clone(before).slides[0]!, id: 'new1' })
    const copy = { ...clone(before).slides[1]!, id: 'copy1' }; after.slides.splice(2, 0, copy)
    const moved = after.slides.splice(after.slides.findIndex((s) => s.id === d!.id), 1)[0]!; after.slides.splice(0, 0, moved)
    after.slides.find((s) => s.id === a!.id)!.locked = true
    const gone = after.slides.findIndex((s) => s.id === b!.id); after.slides.splice(gone, 1)
    const ex = expectationsFromChanges(before, {
      theme: null, edits: [], additions: [{ afterSlideId: null, content: before.slides[0]!.content as SlideContent, id: 'new1' }], duplicates: [{ slideId: b!.id, newId: 'copy1' }],
      moves: [{ slideId: d!.id, afterSlideId: null }], locks: [{ slideId: a!.id, locked: true }], removals: [b!.id],
    })
    expect(ex.map((x) => x.kind)).toEqual(['addition', 'duplicate', 'move', 'lock', 'removal'])
    expect(evaluateAll(ex, after).map((c) => c.status)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(evaluateAll(ex, before).map((c) => c.status)).toEqual(['failed', 'failed', 'failed', 'failed', 'failed'])
    const lockedRemoval = clone(before); lockedRemoval.slides[1]!.locked = true
    expect(evaluate(ex[4]!, lockedRemoval)).toMatchObject({ status: 'skipped', reason: 'locked' })
    const one = clone(before); one.slides = [one.slides[1]!]
    expect(evaluate(ex[4]!, one)).toMatchObject({ status: 'failed', reason: 'last_slide' })
  })

  it('readability: done only when every text reads; "unchanged" when it already did', () => {
    const before = mk(2)
    const s = before.slides[0]!
    // every text box gets exactly the colour of what is behind it: nothing can be read
    for (const el of s.elements) if (el.type === 'text' && !el.decorative) (el as { color: string }).color = effectiveBackground(s, before.theme, el)
    const e = only(expectationsFromChanges(before, { theme: null, edits: [], readability: [s.id] }))
    expect(e).toMatchObject({ kind: 'readability', hadIssues: true })
    expect(evaluate(e, before)).toMatchObject({ status: 'failed', reason: 'not_applied' })
    // the fix: every text box takes a colour that reads on its background
    const fixed = clone(before)
    for (const el of fixed.slides[0]!.elements) if (el.type === 'text' && !el.decorative) (el as { color: string }).color = contrastRatio('#000000', effectiveBackground(fixed.slides[0]!, fixed.theme, el)) >= 7 ? '#000000' : '#FFFFFF'
    expect(evaluate(e, fixed).status).toBe('done')
    const clean = mk(2)
    const none = only(expectationsFromChanges(clean, { theme: null, edits: [], readability: [clean.slides[1]!.id] }))
    expect(none).toMatchObject({ hadIssues: false })
    expect(evaluate(none, clean).status).toBe('unchanged')
  })

  it('revert needs the deck as it was; proposals and rebuilds are information, not changes', () => {
    const d = mk(3)
    const e = expectationsFromChanges(d, { theme: null, edits: [], reverts: [{ part: 'all' }], images: [{}, {}], rewrite: { picturesOnly: true } })
    expect(e.map((x) => x.kind)).toEqual(['revert', 'proposal', 'rewrite'])
    const changed = clone(d); changed.title = 'Other'
    expect(evaluate(e[0]!, changed, d).status).toBe('done')
    expect(evaluate(e[0]!, d, d)).toMatchObject({ status: 'failed' })
    expect(evaluate(e[1]!, d).status).toBe('info'); expect(evaluate(e[2]!, d).status).toBe('info')
  })
})

describe('compose: the words come from the verified checks', () => {
  const setup = () => {
    const before = withImage(mk(5))
    const [a, b, c] = before.slides
    const content = { ...(b!.content as SlideContent), title: 'New title' } as SlideContent
    const exps = expectationsFromChanges(before, { theme: null, edits: [{ slideId: b!.id, content }, { slideId: c!.id, content: { ...(c!.content as SlideContent), title: 'Another' } as SlideContent }], pictureSwaps: [{ slideId: a!.id, elementId: 'pic', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.5 }] })
    return { before, exps, ids: [a!.id, b!.id, c!.id] }
  }
  const apply = (d: Presentation, exps: Expectation[], only: string[]) => {
    const out = clone(d)
    for (const e of exps) {
      if (!only.includes(e.key)) continue
      if (e.kind === 'edit') { const s = out.slides.find((x) => x.id === e.slideId)!; const f = composeSlide(e.content, out.theme, '16:9'); s.content = f.content; s.layoutId = f.layoutId }
      if (e.kind === 'picture_swap') (out.slides.find((x) => x.id === e.slideId)!.elements.find((x) => x.id === e.elementId) as { src: string }).src = e.to
    }
    return out
  }

  it('everything verified: "Done", each line says what really is in the deck', () => {
    const { before, exps } = setup()
    const after = apply(before, exps, exps.map((e) => e.key))
    const r = compose(exps, evaluateAll(exps, after), after)
    expect(r.outcome).toBe('done')
    expect(r.applied).toContain('Rewrote the text on slides 2 and 3')
    expect(r.applied.join(' ')).toMatch(/Removed the background of the picture on slide 1 \(the new picture is transparent\)/)
    expect(r.reply).toBe('Done — 3 changes applied.')
    expect(r.notes).toEqual([])
  })

  it('a locked slide and a deleted picture: "Partly done", the ticks list only what happened, the notes say why', () => {
    const { before, exps, ids } = setup()
    const after = apply(before, exps, ['edit:0', 'picture_swap:0'])
    after.slides.find((s) => s.id === ids[2])!.locked = true // slide 3's edit was not applied and the slide is locked
    after.slides[0]!.elements = after.slides[0]!.elements.filter((x) => x.id !== 'pic') // and the picture is gone
    const r = compose(exps, evaluateAll(exps, after), after)
    expect(r.outcome).toBe('partial')
    expect(r.reply).toBe('Partly done — 1 of 3 changes applied. See the notes below.')
    expect(r.applied).toEqual(['Rewrote the text on slide 2'])
    expect(r.notes.join(' ')).toMatch(/slide 3 is locked, so I left it/i)
    expect(r.notes.join(' ')).toMatch(/picture on slide 1 is no longer there/)
  })

  it('nothing applied: never "Done"; nothing to change is said as such', () => {
    const { before, exps } = setup()
    const r = compose(exps, evaluateAll(exps, before), before)
    expect(r.outcome).toBe('nothing'); expect(r.applied).toEqual([])
    expect(r.reply).toMatch(/nothing was changed/)
    const already = expectationsFromChanges(before, { theme: before.theme, edits: [] })
    const same = compose(already, evaluateAll(already, before), before)
    expect(same.outcome).toBe('already'); expect(same.reply).toMatch(/already like that/)
  })

  it('server notes (refusals) are kept after the verified lines', () => {
    const { before, exps } = setup()
    const after = apply(before, exps, exps.map((e) => e.key))
    const r = compose(exps, evaluateAll(exps, after), after, ["I can't align shapes yet."])
    expect(r.notes.at(-1)).toBe("I can't align shapes yet.")
  })
})
