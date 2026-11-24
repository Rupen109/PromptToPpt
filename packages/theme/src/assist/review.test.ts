import { describe, expect, it } from 'vitest'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { composeSlide, getTheme } from '../index'
import { MANY_WORDS, NOT_REVIEWED, REVIEW_CHECKS, reviewDeck, reviewFindings } from './review'

let n = 0
const gen = () => `r${++n}`
const mk = (contents: SlideContent[]): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) } as Presentation
}
const tb = (title: string, bullets: string[]): SlideContent => ({ layout: 'title-body', title, bullets, speakerNotes: '', sources: [] }) as SlideContent
const long = Array.from({ length: 6 }, () => 'word '.repeat(18).trim())

describe('reviewDeck: a report of facts, advice only', () => {
  it('a tidy deck: says what was checked, finds nothing, changes nothing, and says what it did not judge', () => {
    const d = mk([{ layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: '', sources: [] } as SlideContent, tb('One', ['a', 'b']), tb('Two', ['c', 'd'])])
    const text = reviewDeck(d)
    expect(text).toMatch(/I checked all 3 slides for:/)
    expect(text).toMatch(/found nothing wrong/)
    expect(text).toContain(NOT_REVIEWED)
    expect(reviewFindings(d)).toEqual([])
  })
  it('too much text names the slides with their word counts; a heavy slide is found, a light one is not', () => {
    const d = mk([tb('Light', ['a', 'b']), tb('Heavy', long)])
    const f = reviewFindings(d).find((x) => x.id === 'many_words')!
    expect(f.slides.map((s) => s.n)).toEqual([2])
    expect(f.slides[0]!.detail).toMatch(new RegExp(`^\\d+ words$`))
    expect(Number(f.slides[0]!.detail!.split(' ')[0])).toBeGreaterThan(MANY_WORDS)
    expect(reviewDeck(d)).toMatch(/too much text .*: slide 2 \(\d+ words\)/)
  })
  it('a slide with an EMPTY title field is flagged; a layout with no title by design (big number) never is', () => {
    const d = mk([tb('Fine', ['a']), tb('x', ['b'])])
    d.slides[1]!.content = { ...(d.slides[1]!.content as object), title: '' } as never
    d.slides[1]!.elements = d.slides[1]!.elements.filter((e) => !(e.type === 'text' && e.role === 'title'))
    expect(reviewFindings(d).find((f) => f.id === 'no_title')?.slides.map((s) => s.n)).toEqual([2])
    const big = mk([{ layout: 'big-number', value: '42', context: ['customers signed'], speakerNotes: '', sources: [] } as unknown as SlideContent])
    expect(reviewFindings(big).find((f) => f.id === 'no_title')).toBeUndefined()
  })
  it('the same title twice is found on the later slide and points at the first', () => {
    const f = reviewFindings(mk([tb('Plan', ['a']), tb('Other', ['b']), tb('plan!', ['c'])])).find((x) => x.id === 'duplicate_title')!
    expect(f.slides).toEqual([{ n: 3, detail: 'same as slide 1' }])
  })
  it('three of the same layout in a row, and an empty slide, are found', () => {
    const d = mk([tb('A', ['a']), tb('B', ['b']), tb('C', ['c']), tb('D', ['d'])])
    expect(reviewFindings(d).find((x) => x.id === 'same_layout')?.slides.map((s) => s.n)).toEqual([3, 4])
    d.slides[1]!.elements = []; d.slides[1]!.layoutId = 'title-body'
    expect(reviewFindings(d).find((x) => x.id === 'empty')?.slides.map((s) => s.n)).toEqual([2])
  })
  it('hard-to-read text is found with the validator the editor uses', () => {
    const d = mk([tb('A', ['a', 'b'])])
    const t = d.slides[0]!.elements.find((e) => e.type === 'text' && e.role === 'title')!
    ;(t as { color: string }).color = '#FFFFFF'
    d.slides[0]!.background = { type: 'color', value: '#FFFFFF' }
    expect(reviewFindings(d).find((x) => x.id === 'contrast')?.slides[0]?.n).toBe(1)
  })
  it('focus narrows what is checked AND what is said: design only never lists text findings', () => {
    const d = mk([tb('A', long), tb('A', long)])
    const text = reviewDeck(d, 'design')
    expect(text).not.toMatch(/too much text|same title/)
    expect(reviewDeck(d, 'text')).toMatch(/too much text/)
  })
  it('suggested fixes are real commands for the first slide of each finding; a long list is cut with a count', () => {
    const d = mk(Array.from({ length: 16 }, (_, i) => tb(`T${i}`, long)))
    const text = reviewDeck(d)
    expect(text).toMatch(/for example "shorten slide 1"/)
    expect(text).toMatch(/and 4 more/)
    expect(REVIEW_CHECKS.every((c) => /\d/.test(c.fix(7)))).toBe(true)
  })
})

describe('speaker notes are reported as notes, not as "rewrote the text"', () => {
  it('an edit that only changes the speaker notes says so; a text change that also touches notes is still a rewrite', async () => {
    const { expectationsFromChanges, compose, evaluate } = await import('./index')
    const d = mk([tb('One', ['a', 'b']), tb('Two', ['c', 'd'])])
    const c0 = d.slides[0]!.content as SlideContent
    const onlyNotes = expectationsFromChanges(d, { theme: null, edits: [{ slideId: 's0', content: { ...c0, speakerNotes: 'Say hello, then explain.' } as SlideContent }] })
    expect(onlyNotes[0]).toMatchObject({ kind: 'edit', change: 'notes' })
    const rewritten = expectationsFromChanges(d, { theme: null, edits: [{ slideId: 's0', content: { ...c0, title: 'New title', speakerNotes: 'x' } as SlideContent }] })
    expect(rewritten[0]).toMatchObject({ change: 'text' })
    const after = structuredClone(d); after.slides[0]!.content = { ...c0, speakerNotes: 'Say hello, then explain.' } as never
    const checks = onlyNotes.map((e) => evaluate(e, after, d))
    expect(compose(onlyNotes, checks, after).applied.join(' ')).toMatch(/Wrote the speaker notes of slide 1/)
  })
})
