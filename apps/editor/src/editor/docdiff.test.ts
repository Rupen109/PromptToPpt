import { beforeEach, describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { type Presentation, type SlideContent } from '@prompttoppt/validation'
import * as C from './commands'
import { applyDiff, diffDocs, mergeDocs, reorder } from './docdiff'
import { useDoc } from './store'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: 'notes', sources: [] },
  { layout: 'title-body', title: 'Body', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
  { layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'More', bullets: ['x', 'y'], speakerNotes: '', sources: [] },
]
const mk = (): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) }
}
const edit = (d: Presentation, f: (x: C.D) => void) => produce(d, f)
const titleOf = (d: Presentation, si: number) => d.slides[si]!.elements.find((e) => e.type === 'text' && e.role === 'title')!
const setX = (d: Presentation, si: number, id: string, x: number) => edit(d, (z) => { z.slides[si]!.elements.find((e) => e.id === id)!.x = x })

beforeEach(() => { n = 0 })

describe('diffDocs / applyDiff', () => {
  it('forward then backward are exact inverses for every kind of change', () => {
    const a = mk()
    const variants: Presentation[] = [
      edit(a, (d) => { d.title = 'New' }),
      setX(a, 1, titleOf(a, 1).id, 77),
      edit(a, (d) => { d.slides.splice(1, 1) }),
      edit(a, (d) => { d.slides.reverse() }),
      edit(a, (d) => { d.slides[2]!.elements.reverse() }),
      edit(a, (d) => { d.slides[1]!.elements.pop() }),
      edit(a, (d) => { const s = clone(d.slides[1]!); s.id = 'sNew'; s.elements.forEach((e) => { e.id = `n-${e.id}` }); d.slides.splice(2, 0, s) }),
      edit(a, (d) => { d.slides[0]!.locked = true; d.slides[0]!.speakerNotes = 'hello'; d.theme.fonts.heading = 'Inter' }),
    ]
    for (const b of variants) {
      const d = diffDocs(a, b)
      expect(applyDiff(a, d, 'forward', true)).toEqual(b)
      expect(applyDiff(b, d, 'backward', true)).toEqual(a)
    }
  })
  it('an unchanged deck diffs to nothing', () => {
    const a = mk()
    expect(diffDocs(a, a)).toEqual({ fields: {}, slides: [] })
    expect(diffDocs(a, structuredClone(a))).toEqual({ fields: {}, slides: [] })
  })
})

describe('mergeDocs (three-way)', () => {
  it('my edit and a collaborator\'s edit to DIFFERENT elements both survive', () => {
    const base = mk()
    const a = titleOf(base, 1), b = titleOf(base, 2)
    const mine = setX(base, 1, a.id, 11)
    const theirs = setX(base, 2, b.id, 22)
    const m = mergeDocs(base, mine, theirs)
    expect(m.slides[1]!.elements.find((e) => e.id === a.id)!.x).toBe(11)
    expect(m.slides[2]!.elements.find((e) => e.id === b.id)!.x).toBe(22)
  })
  it('edits to different elements on the SAME slide both survive', () => {
    const base = mk()
    const [e1, e2] = base.slides[1]!.elements.filter((e) => !e.decorative)
    const m = mergeDocs(base, setX(base, 1, e1!.id, 5), setX(base, 1, e2!.id, 9))
    expect(m.slides[1]!.elements.find((e) => e.id === e1!.id)!.x).toBe(5)
    expect(m.slides[1]!.elements.find((e) => e.id === e2!.id)!.x).toBe(9)
  })
  it('both changing the SAME element: mine wins; both changing the title: mine wins', () => {
    const base = mk()
    const id = titleOf(base, 1).id
    const m = mergeDocs(base, edit(setX(base, 1, id, 1), (d) => { d.title = 'Mine' }), edit(setX(base, 1, id, 2), (d) => { d.title = 'Theirs' }))
    expect(m.slides[1]!.elements.find((e) => e.id === id)!.x).toBe(1)
    expect(m.title).toBe('Mine')
  })
  it('a slide a collaborator added survives my edits, and a slide I added survives theirs', () => {
    const base = mk()
    const addSlide = (d: Presentation, id: string, at: number) => edit(d, (x) => { const s = clone(x.slides[1]!); s.id = id; s.elements.forEach((e) => { e.id = `${id}-${e.id}` }); x.slides.splice(at, 0, s) })
    const mine = addSlide(edit(base, (d) => { d.title = 'Mine' }), 'mineS', 1)
    const theirs = addSlide(base, 'theirsS', 3)
    const m = mergeDocs(base, mine, theirs)
    expect(m.slides.map((s) => s.id).sort()).toEqual(['mineS', 's0', 's1', 's2', 's3', 'theirsS'].sort())
    expect(m.title).toBe('Mine')
    expect(m.slides.map((s) => s.id).indexOf('mineS')).toBeLessThan(m.slides.map((s) => s.id).indexOf('s1'))
  })
  it('something they deleted stays deleted even if I edited it; something I deleted is deleted', () => {
    const base = mk()
    const id = titleOf(base, 2).id
    const theirs = edit(base, (d) => { d.slides[2]!.elements = d.slides[2]!.elements.filter((e) => e.id !== id) })
    const m = mergeDocs(base, setX(base, 2, id, 40), theirs)
    expect(m.slides[2]!.elements.some((e) => e.id === id)).toBe(false)
    const m2 = mergeDocs(base, edit(base, (d) => { d.slides.splice(3, 1) }), edit(base, (d) => { d.title = 'T2' }))
    expect(m2.slides.some((s) => s.id === 's3')).toBe(false)
    expect(m2.title).toBe('T2')
  })
  it('reorders merge: my move and their unrelated edit', () => {
    const base = mk()
    const mine = edit(base, (d) => { const [s] = d.slides.splice(3, 1); d.slides.splice(0, 0, s!) })
    const m = mergeDocs(base, mine, setX(base, 1, titleOf(base, 1).id, 3))
    expect(m.slides.map((s) => s.id)).toEqual(['s3', 's0', 's1', 's2'])
    expect(m.slides.find((s) => s.id === 's1')!.elements.find((e) => e.id === titleOf(base, 1).id)!.x).toBe(3)
  })
  it('nothing local to merge → exactly their version', () => {
    const base = mk()
    const theirs = edit(base, (d) => { d.title = 'T3' })
    expect(mergeDocs(base, base, theirs)).toBe(theirs)
  })
})

describe('reorder', () => {
  it('keeps ids the target does not know in place and inserts new ids after their predecessor', () => {
    expect(reorder(['a', 'b', 'c', 'x'], ['c', 'b', 'a'], new Set())).toEqual(['c', 'b', 'a', 'x'])
    expect(reorder(['a', 'c'], ['a', 'b', 'c'], new Set())).toEqual(['a', 'b', 'c'])
    expect(reorder(['a', 'b', 'c'], ['a', 'c'], new Set(['b']))).toEqual(['a', 'c'])
  })
})

describe('undo with collaborators', () => {
  beforeEach(() => useDoc.getState().load(mk(), 1))
  const doc = () => useDoc.getState().doc!

  it('undo reverts MY change by id even after a collaborator inserted slides before it', () => {
    const id = titleOf(doc(), 2).id
    useDoc.getState().apply('Move', (d) => { d.slides[2]!.elements.find((e) => e.id === id)!.x = 123 })
    // a collaborator's version arrives: two new slides inserted at the front (everything shifts)
    const remote = produce(doc(), (d) => { for (const sid of ['r1', 'r2']) { const s = clone(d.slides[1]!); s.id = sid; s.elements.forEach((e) => { e.id = `${sid}-${e.id}` }); d.slides.unshift(s) } })
    useDoc.getState().adoptRemote(remote, 2)
    expect(doc().slides).toHaveLength(6)
    useDoc.getState().undo()
    const s2 = doc().slides.find((s) => s.id === 's2')!
    expect(s2.elements.find((e) => e.id === id)!.x).not.toBe(123)
    expect(doc().slides.map((s) => s.id).slice(0, 2)).toEqual(['r2', 'r1']) // their slides are untouched
    useDoc.getState().redo()
    expect(doc().slides.find((s) => s.id === 's2')!.elements.find((e) => e.id === id)!.x).toBe(123)
  })
  it('undo does not clobber something a collaborator changed after my edit (it skips that item)', () => {
    const id = titleOf(doc(), 1).id
    useDoc.getState().apply('Move', (d) => { d.slides[1]!.elements.find((e) => e.id === id)!.x = 50 })
    useDoc.getState().adoptRemote(setX(doc(), 1, id, 999), 2) // they moved the same element further
    useDoc.getState().undo()
    expect(doc().slides[1]!.elements.find((e) => e.id === id)!.x).toBe(999)
  })
  it('adoptRemote is not a local change (no autosave trigger); mergeRemote is', () => {
    const seq = useDoc.getState().seq
    useDoc.getState().adoptRemote(edit(doc(), (d) => { d.title = 'Remote' }), 2)
    expect(useDoc.getState().seq).toBe(seq)
    expect(doc().title).toBe('Remote')
    useDoc.getState().mergeRemote(edit(doc(), (d) => { d.title = 'Merged' }), 3)
    expect(useDoc.getState().seq).toBe(seq + 1)
    expect(useDoc.getState().revision).toBe(3)
  })
})

describe('merge invariants under random concurrent edits', () => {
  // small deterministic PRNG so a failure is reproducible
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  type Op = (d: Presentation, r: () => number, tag: string) => Presentation
  const pickIdx = (r: () => number, n: number) => Math.floor(r() * n)
  const ops: Op[] = [
    (d, r) => edit(d, (z) => { z.title = `t${pickIdx(r, 1e6)}` }),
    (d, r) => edit(d, (z) => { const s = z.slides[pickIdx(r, z.slides.length)]!; s.speakerNotes = `n${pickIdx(r, 1e6)}` }),
    (d, r) => edit(d, (z) => { const s = z.slides[pickIdx(r, z.slides.length)]!; const e = s.elements[pickIdx(r, s.elements.length)]; if (e) e.x = pickIdx(r, 1000) }),
    (d, r) => edit(d, (z) => { if (z.slides.length > 2) z.slides.splice(pickIdx(r, z.slides.length), 1) }),
    (d, r) => edit(d, (z) => { const [s] = z.slides.splice(pickIdx(r, z.slides.length), 1); z.slides.splice(pickIdx(r, z.slides.length + 1), 0, s!) }),
    (d, r, tag) => edit(d, (z) => { const s = clone(z.slides[pickIdx(r, z.slides.length)]!); s.id = `${tag}-s${pickIdx(r, 1e6)}`; s.elements.forEach((e) => { e.id = `${s.id}-${e.id}` }); z.slides.splice(pickIdx(r, z.slides.length + 1), 0, s) }),
    (d, r) => edit(d, (z) => { const s = z.slides[pickIdx(r, z.slides.length)]!; if (s.elements.length > 1) s.elements.splice(pickIdx(r, s.elements.length), 1) }),
    (d, r) => edit(d, (z) => { const s = z.slides[pickIdx(r, z.slides.length)]!; s.elements.reverse() }),
  ]
  const valid = (d: Presentation) => {
    const sids = d.slides.map((s) => s.id)
    expect(new Set(sids).size).toBe(sids.length)
    for (const s of d.slides) { const eids = s.elements.map((e) => e.id); expect(new Set(eids).size).toBe(eids.length) }
  }

  it('300 random pairs of concurrent edit sequences: always a valid deck, never loses what only one side did to untouched slides', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      n = 0
      const base = mk()
      let mine = base, theirs = base
      for (let i = 0; i < 1 + pickIdx(r, 4); i++) mine = ops[pickIdx(r, ops.length)]!(mine, r, 'm')
      for (let i = 0; i < 1 + pickIdx(r, 4); i++) theirs = ops[pickIdx(r, ops.length)]!(theirs, r, 't')
      const merged = mergeDocs(base, mine, theirs)
      valid(merged)
      // slides only I added are present, slides only they added are present
      const bIds = new Set(base.slides.map((s) => s.id))
      for (const s of mine.slides) if (!bIds.has(s.id)) expect(merged.slides.some((x) => x.id === s.id), `seed ${seed}: my new slide vanished`).toBe(true)
      for (const s of theirs.slides) if (!bIds.has(s.id)) expect(merged.slides.some((x) => x.id === s.id), `seed ${seed}: their new slide vanished`).toBe(true)
      // the protocol converges: they saved first, I merged and saved, they adopt mine: identical decks
      const theirView = mergeDocs(theirs, theirs, merged)
      expect(theirView).toBe(merged)
      // undo of my edits via history never throws and leaves a valid deck
      const back = applyDiff(merged, diffDocs(base, mine), 'backward', true)
      valid(back)
    }
  })
})
