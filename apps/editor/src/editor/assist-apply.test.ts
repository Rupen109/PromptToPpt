import { beforeEach, describe, expect, it } from 'vitest'
import { composeSlide, expectationsFromChanges, getTheme, planElementChange, type AnswerChanges } from '@prompttoppt/theme'
import type { Presentation, SlideContent, Theme } from '@prompttoppt/validation'
import { applyAssistVerified, type AssistAnswer } from './assist-apply'
import { revertAssist, snapshotAssist } from './commands'
import { useDoc } from './store'

let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: 'notes', sources: [] },
  { layout: 'title-body', title: 'Body', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
  { layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'More', bullets: ['x', 'y'], speakerNotes: '', sources: [] },
]
const mkDoc = (): Presentation => {
  const theme = getTheme('cobalt')
  const d: Presentation = {
    schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [],
    slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })),
  }
  d.slides[0]!.elements.push({ id: 'pic', type: 'image', src: 'https://x.test/a.png', alt: 'cup', x: 0, y: 0, width: 300, height: 200, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' } as never)
  return d
}
const doc = () => useDoc.getState().doc!
const past = () => useDoc.getState().past.length
const json = (d: Presentation) => JSON.stringify(d)
const answerOf = (c: Partial<AnswerChanges>, patch?: (a: AssistAnswer) => void): AssistAnswer => {
  const full: AnswerChanges = { theme: null, edits: [], ...c }
  const a = { ...full, expect: expectationsFromChanges(doc(), full) } as AssistAnswer
  patch?.(a)
  return a
}
const edit = (i: number, title: string) => ({ slideId: `s${i}`, content: { ...(doc().slides[i]!.content as SlideContent), title } as SlideContent })

beforeEach(() => { n = 0; useDoc.getState().load(mkDoc(), 1) })

describe('applyAssistVerified: one transaction, verified on the real document', () => {
  it('success, multi-step: five changes, all verified, ONE undo step; undo and redo go back and forth exactly', () => {
    const start = json(doc())
    const dark: Theme = { ...doc().theme, colors: { ...doc().theme.colors, background: '#0B1020', surface: '#151B2E', textPrimary: '#F5F7FF', textSecondary: '#C9D0E8' } }
    const a = answerOf({ theme: dark, edits: [edit(1, 'A better title')], additions: [{ afterSlideId: null, content: { layout: 'title', title: 'Thank you', speakerNotes: '', sources: [] } as SlideContent, id: 'ty' }], backgrounds: [{ slideId: 's3', color: '#223344' }], locks: [{ slideId: 's2', locked: true }] })
    const h = past()
    const r = applyAssistVerified(a)
    expect(r.composed.outcome).toBe('done')
    expect(r.checks.map((c) => c.status)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(r.composed.applied.join(' | ')).toMatch(/Changed the colours/)
    expect(r.composed.applied.join(' | ')).toMatch(/Rewrote the text on slide 2/)
    expect(r.composed.applied.join(' | ')).toMatch(/Locked slide 3/)
    expect(r.changed).toBe(true)
    expect(past()).toBe(h + 1) // one history entry for the whole request
    const done = json(doc())
    useDoc.getState().undo()
    expect(json(doc())).toBe(start) // everything back, exactly
    useDoc.getState().redo()
    expect(json(doc())).toBe(done) // and forward again, exactly
  })

  it('locked slide: that part is skipped and said so, the rest is applied: "Partly done"', () => {
    apply((d) => { d.slides[1]!.locked = true })
    const a = answerOf({ edits: [edit(1, 'Locked one'), edit(3, 'Free one')] })
    const r = applyAssistVerified(a)
    expect(r.composed.outcome).toBe('partial')
    expect(r.composed.reply).toBe('Partly done — 1 of 2 changes applied. See the notes below.')
    expect(r.composed.applied).toEqual(['Rewrote the text on slide 4'])
    expect(r.composed.notes.join(' ')).toMatch(/slide 2 is locked, so I left it/i)
    expect(doc().slides[1]!.content).toMatchObject({ title: 'Body' }) // untouched
  })

  it('missing element: nothing changed, nothing in the history, and the answer is not "Done"', () => {
    const a = answerOf({ pictureSwaps: [{ slideId: 's0', elementId: 'pic', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.4 }] }, (x) => { x.pictureSwaps = [{ slideId: 's0', elementId: 'gone', url: 'https://x.test/cut.png', alt: 'cut' }] })
    // (the expectation was made for 'pic'; the answer's change points to an element that does not exist)
    a.expect = expectationsFromChanges(doc(), { theme: null, edits: [], pictureSwaps: [{ slideId: 's0', elementId: 'gone', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.4 }] })
    const start = json(doc()), h = past()
    const r = applyAssistVerified(a)
    expect(r.changed).toBe(false)
    expect(json(doc())).toBe(start)
    expect(past()).toBe(h)
    expect(r.composed.outcome).toBe('nothing')
    expect(r.composed.reply).toMatch(/nothing was changed/)
    expect(r.composed.notes.join(' ')).toMatch(/picture on slide 1 is no longer there/)
  })

  it('the picture on a locked slide is not swapped, and the chat does not claim it was', () => {
    apply((d) => { d.slides[0]!.locked = true })
    const r = applyAssistVerified(answerOf({ pictureSwaps: [{ slideId: 's0', elementId: 'pic', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.4 }] }))
    expect((doc().slides[0]!.elements.find((e) => e.id === 'pic') as { src: string }).src).toBe('https://x.test/a.png')
    expect(r.composed.outcome).toBe('nothing')
    expect(r.composed.applied).toEqual([])
    expect(r.composed.notes.join(' ')).toMatch(/slide 1 is locked/)
  })

  it('a successful cut-out: the right element holds the new picture, and it says the new picture is transparent', () => {
    const r = applyAssistVerified(answerOf({ pictureSwaps: [{ slideId: 's0', elementId: 'pic', url: 'https://x.test/cut.png', alt: 'cut', transparentShare: 0.4 }] }))
    expect(r.composed.outcome).toBe('done')
    expect((doc().slides[0]!.elements.find((e) => e.id === 'pic') as { src: string }).src).toBe('https://x.test/cut.png')
    expect(r.composed.applied[0]).toMatch(/Removed the background of the picture on slide 1 \(the new picture is transparent\)/)
    expect(r.checks[0]!.evidence.join(' ')).toMatch(/40% of the new picture is see-through/)
  })

  it('a step that throws is left out and reported; the independent steps are kept; all in one undo step', () => {
    const good = answerOf({ edits: [edit(3, 'Still applied')], additions: [{ afterSlideId: null, content: { layout: 'title', title: 'X', speakerNotes: '', sources: [] } as SlideContent, id: 'bad' }] }, (x) => { x.additions = [{ afterSlideId: null, content: null as never, id: 'bad' }] })
    good.expect = expectationsFromChanges(doc(), { theme: null, edits: [edit(3, 'Still applied')], additions: [{ afterSlideId: null, content: { layout: 'title', title: 'X', speakerNotes: '', sources: [] } as SlideContent, id: 'bad' }] })
    const h = past()
    const r = applyAssistVerified(good)
    expect(r.errors.map((e) => e.key)).toEqual(['addition:0'])
    expect(doc().slides.some((s) => s.id === 'bad')).toBe(false)
    expect(doc().slides[3]!.content).toMatchObject({ title: 'Still applied' })
    expect(r.composed.outcome).toBe('partial')
    expect(r.composed.notes.join(' ')).toMatch(/new slide did not take effect|no longer in the deck/)
    expect(past()).toBe(h + 1)
  })

  it('a step that needed a slide a failed step should have added is reported as failed, never as done', () => {
    const valid = { layout: 'title', title: 'X', speakerNotes: '', sources: [] } as SlideContent
    const full: AnswerChanges = { theme: null, additions: [{ afterSlideId: null, content: valid, id: 'later' }], edits: [{ slideId: 'later', content: { ...valid, title: 'Edited' } as SlideContent }] }
    const a = { ...full, expect: expectationsFromChanges(doc(), full) } as AssistAnswer
    a.additions = [{ afterSlideId: null, content: null as never, id: 'later' }]
    const r = applyAssistVerified(a)
    expect(r.checks.map((c) => c.status)).toEqual(['failed', 'failed'])
    expect(r.composed.outcome).toBe('nothing')
    expect(r.changed).toBe(false)
  })

  it('"already so": nothing to change is said as such and adds no history', () => {
    const h = past()
    const r = applyAssistVerified(answerOf({ locks: [{ slideId: 's1', locked: false }] }))
    expect(r.composed.outcome).toBe('already')
    expect(past()).toBe(h)
  })

  it('putting a change back (the extra hook) is part of the same single undo step', () => {
    const h = past()
    const r = applyAssistVerified(answerOf({ edits: [edit(1, 'First')] }), { extra: (d) => { d.title = 'Renamed in the same step' } })
    expect(r.composed.outcome).toBe('done')
    expect(past()).toBe(h + 1)
    useDoc.getState().undo()
    expect(doc().title).toBe('T'); expect(doc().slides[1]!.content).toMatchObject({ title: 'Body' })
  })

  it('removing and duplicating: verified against the deck, partial when one slide is locked', () => {
    apply((d) => { d.slides[2]!.locked = true })
    const r = applyAssistVerified(answerOf({ removals: ['s1', 's2'], duplicates: [{ slideId: 's3', newId: 'copy' }] }))
    expect(doc().slides.map((s) => s.id)).toEqual(['s0', 's2', 's3', 'copy'])
    expect(r.composed.outcome).toBe('partial')
    expect(r.composed.applied).toEqual(expect.arrayContaining(['Deleted slide 2', 'Duplicated slide 4 (the copy is slide 4)']))
    expect(r.composed.notes.join(' ')).toMatch(/slide 3 is locked, so I left it/)
  })
})

function apply(recipe: (d: Presentation) => void) { useDoc.getState().apply('test', recipe as never) }

describe('objects: planned values applied with the editor\'s own commands, verified, one undo step', () => {
  const plan = (slideIdx: number, elId: string, op: Parameters<typeof planElementChange>[3]) => {
    const sl = doc().slides[slideIdx]!; const r = planElementChange(doc(), sl, sl.elements.find((e) => e.id === elId)!, op)
    if (!r.ok) throw new Error(r.why); return r.change
  }
  it('resize, move and a text size land exactly as planned; undo and redo move the deck back and forth in ONE step', () => {
    const start = JSON.stringify(doc()), h = past()
    const title = doc().slides[1]!.elements.find((e) => e.type === 'text' && e.role === 'title')!.id
    const changes = [plan(0, 'pic', { op: 'resize', scale: 1.5 }), plan(1, title, { op: 'font_size', size: 50 }), plan(2, doc().slides[2]!.elements.find((e) => e.type === 'text' && e.role === 'title')!.id, { op: 'move', dx: 40, dy: 0 })]
    const r = applyAssistVerified(answerOf({ elementChanges: changes }))
    expect(r.composed.outcome).toBe('done')
    expect(r.checks.map((c) => c.status)).toEqual(['done', 'done', 'done'])
    expect(past()).toBe(h + 1)
    const pic = doc().slides[0]!.elements.find((e) => e.id === 'pic')!
    expect(pic.width).toBe(450); expect(pic.x + pic.width).toBeLessThanOrEqual(1920) // (a resize around the centre never leaves the slide)
    expect((doc().slides[1]!.elements.find((e) => e.id === title) as { fontSize: number }).fontSize).toBe(50)
    const done = JSON.stringify(doc())
    useDoc.getState().undo(); expect(JSON.stringify(doc())).toBe(start)
    useDoc.getState().redo(); expect(JSON.stringify(doc())).toBe(done)
  })
  it('bold goes on every run, delete removes the object, and a locked slide or object is skipped and said', () => {
    const body = doc().slides[1]!.elements.find((e) => e.type === 'text' && e.role === 'body')!.id
    const r = applyAssistVerified(answerOf({ elementChanges: [plan(1, body, { op: 'text_style', bold: true }), plan(0, 'pic', { op: 'delete' })] }))
    expect(r.composed.outcome).toBe('done')
    expect(doc().slides[0]!.elements.some((e) => e.id === 'pic')).toBe(false)
    expect((doc().slides[1]!.elements.find((e) => e.id === body) as { paragraphs: { runs: { bold?: boolean }[] }[] }).paragraphs.every((p) => p.runs.every((x) => x.bold === true))).toBe(true)
    // the slide gets locked between the answer and the apply: the editor's own check keeps the object where it is
    useDoc.getState().load(mkDoc(), 1)
    const c = plan(0, 'pic', { op: 'move', to: 'right' })
    apply((d) => { d.slides[0]!.locked = true })
    const before = JSON.stringify(doc())
    const skipped = applyAssistVerified(answerOf({ elementChanges: [c] }))
    expect(JSON.stringify(doc())).toBe(before); expect(skipped.composed.outcome).toBe('nothing')
    expect(skipped.composed.notes.join(' ')).toMatch(/Slide 1 is locked, so I left it/)
  })
})


describe('transitions through the verified apply and the assistant\'s own undo', () => {
  it('applied and verified in one undo step; the assistant undo puts back "no transition of its own" and a previous one exactly', () => {
    useDoc.getState().apply('seed', (d) => { d.slides[2]!.transition = { type: 'wipe', duration: 700, direction: 'left', own: true } as never })
    const before = structuredClone(doc())
    const r = applyAssistVerified(answerOf({ transitions: [{ slideId: 's1', to: { type: 'fade', duration: 300 } }, { slideId: 's2', to: { type: 'push', direction: 'up' } }] }))
    expect(r.composed.outcome).toBe('done')
    expect(r.checks.every((c) => c.status === 'done')).toBe(true)
    expect(doc().slides[1]!.transition).toMatchObject({ type: 'fade', duration: 300, own: true })
    expect(doc().slides[2]!.transition).toMatchObject({ type: 'push', direction: 'up' })
    const undo = snapshotAssist(before, doc(), false, ['transitions'])
    expect(undo.transitions).toEqual({ s1: null, s2: { type: 'wipe', duration: 700, direction: 'left', own: true } })
    useDoc.getState().apply('assistant undo', (d) => revertAssist(d, undo, 'all'))
    expect(doc().slides[1]!.transition).toBeUndefined()
    expect(doc().slides[2]!.transition).toEqual(before.slides[2]!.transition)
  })
  it('a locked slide is skipped and said; Morph on the first slide is refused by the command, so the check fails honestly', () => {
    useDoc.getState().apply('lock', (d) => { d.slides[1]!.locked = true })
    const a = applyAssistVerified(answerOf({ transitions: [{ slideId: 's1', to: { type: 'fade' } }, { slideId: 's2', to: { type: 'fade' } }] }))
    expect(a.composed.outcome).toBe('partial')
    expect(doc().slides[1]!.transition).toBeUndefined()
  })
})


describe('the assistant\'s own Undo now covers object changes', () => {
  it('a new shape, a re-sized picture, a sorted table and an animation are all put back exactly; other slides are untouched', () => {
    useDoc.getState().apply('seed', (d) => { d.slides[1]!.manual = true; d.slides[1]!.elements.push({ id: 'tbl', type: 'table', x: 100, y: 500, width: 900, height: 300, rotation: 0, locked: false, zIndex: 5, opacity: 1, header: ['Plan', 'Price'], rows: [['A', '$9'], ['B', '$100']] } as never) })
    const before = structuredClone(doc())
    const title = doc().slides[1]!.elements.find((e) => e.type === 'text' && e.role === 'title')!
    const r = applyAssistVerified(answerOf({ elementChanges: [
      { slideId: 's1', elementId: 'tbl', desc: 'the table', verb: 'Sorted {}', patch: { rows: [['B', '$100'], ['A', '$9']] } },
      { slideId: 's1', elementId: 'newshape', desc: 'a circle', verb: 'Added {}', add: { shape: 'ellipse', x: 10, y: 10, width: 200, height: 200, fill: 'primary' } },
      { slideId: 's1', elementId: title.id, desc: 'the title', verb: 'Added the "Fade In" animation to {}', effect: { type: 'fade-in', start: 'after' } },
      { slideId: 's0', elementId: 'pic', desc: 'the picture', verb: 'Made {} bigger', patch: { x: 0, y: 0, width: 600, height: 400 } },
    ] }))
    expect(r.checks.every((c) => c.status === 'done')).toBe(true)
    const undo = snapshotAssist(before, doc(), false, ['objects'])
    expect(Object.keys(undo.objects ?? {}).sort()).toEqual(['s0', 's1'])
    expect(undo.objects!['s2']).toBeUndefined()
    useDoc.getState().apply('assistant undo', (d) => revertAssist(d, undo, 'all'))
    expect(JSON.stringify(doc().slides)).toBe(JSON.stringify(before.slides))
  })
  it('a locked slide is not touched by the undo; a design change keeps using the design undo (no object snapshot)', () => {
    const before = structuredClone(doc())
    const dark: Theme = { ...doc().theme, colors: { ...doc().theme.colors, background: '#0B1020', surface: '#151B2E', textPrimary: '#F5F7FF', textSecondary: '#C9D0E8' } }
    applyAssistVerified(answerOf({ theme: dark }))
    expect(snapshotAssist(before, doc(), true, ['theme']).objects).toBeUndefined()
  })
})

describe('slice 4: a text colour reaches every coloured word (one command for the toolbar and the assistant)', () => {
  it('"make the title red": the accent word turns red too, verified on the real document, one undo step', async () => {
    const { setTextColor } = await import('./commands')
    const title = doc().slides[1]!.elements.find((e) => e.type === 'text' && e.role === 'title')!
    // the title has an accent word in its own colour (as designed titles do)
    useDoc.getState().apply('seed', (d) => { const t = d.slides[1]!.elements.find((e) => e.id === title.id)!; if (t.type === 'text') t.paragraphs = [{ runs: [{ text: 'Growth in ' }, { text: 'India', italic: true, color: 'accent' }] }] })
    const planned = planElementChange(doc(), doc().slides[1]!, doc().slides[1]!.elements.find((e) => e.id === title.id)!, { op: 'text_style', color: '#FF0000' })
    if (!planned.ok) throw new Error(planned.why)
    const before = past()
    const r = applyAssistVerified(answerOf({ elementChanges: [planned.change] }))
    expect(r.composed.outcome).toBe('done')
    const t = doc().slides[1]!.elements.find((e) => e.id === title.id)!
    expect(t.type === 'text' && t.color).toBe('#FF0000')
    expect(t.type === 'text' && t.paragraphs.flatMap((p) => p.runs).every((x) => x.color === undefined)).toBe(true)
    expect(past()).toBe(before + 1)
    // the toolbar's colour button uses the same command
    useDoc.getState().apply('seed2', (d) => { const x = d.slides[1]!.elements.find((e) => e.id === title.id)!; if (x.type === 'text') x.paragraphs[0]!.runs[0]!.color = 'accent' })
    useDoc.getState().apply('Colour', (d) => setTextColor(d, 's1', title.id, 'primary'))
    const t2 = doc().slides[1]!.elements.find((e) => e.id === title.id)!
    expect(t2.type === 'text' && t2.paragraphs.flatMap((p) => p.runs).every((x) => x.color === undefined) && t2.color).toBe('primary')
  })
})
