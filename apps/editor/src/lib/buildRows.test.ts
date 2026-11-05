import { describe, expect, it } from 'vitest'
import type { Slide } from '@prompttoppt/validation'
import { buildRows, currentRow } from './buildRows'

const base = { layoutId: 'blank', locked: false, manual: false, background: { type: 'color', value: '#fff' }, speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] } }
const waiting = (id: string, title: string) => ({ ...base, id, elements: [], writing: { title } }) as unknown as Slide
const text = (role: string, t: string) => ({ type: 'text', id: 'e', role, paragraphs: [{ runs: [{ text: t }] }] })
const written = (id: string, ...elements: unknown[]) => ({ ...base, id, elements }) as unknown as Slide

describe('progress screen rows', () => {
  it('a slide still to be written shows its outline title; a written one is done', () => {
    const rows = buildRows([waiting('a', 'Why now'), waiting('b', 'The market')], new Map())
    expect(rows).toEqual([{ id: 'a', title: 'Why now', done: false }, { id: 'b', title: 'The market', done: false }])
    expect(currentRow(rows)).toBe(0)
  })

  it('a title is remembered when the slide is written, so the row does not change its words', () => {
    const known = new Map<string, string>()
    buildRows([waiting('a', 'Why now'), waiting('b', 'The market')], known)
    const later = buildRows([written('a', text('title', 'Why we are building this now')), waiting('b', 'The market')], known)
    expect(later[0]).toEqual({ id: 'a', title: 'Why now', done: true })
    expect(later[1]).toEqual({ id: 'b', title: 'The market', done: false })
    expect(currentRow(later)).toBe(1)
  })

  it('a deck seen before its outline is ready shows "Slide N", then the real titles as soon as they arrive (the stand-in is never remembered)', () => {
    const known = new Map<string, string>()
    const first = buildRows([waiting('a', ''), waiting('b', '')], known)
    expect(first.map((r) => r.title)).toEqual(['Slide 1', 'Slide 2'])
    const second = buildRows([waiting('a', 'Why now'), waiting('b', 'The market')], known)
    expect(second.map((r) => r.title)).toEqual(['Why now', 'The market'])
    const third = buildRows([written('a', text('title', 'Different words')), waiting('b', 'The market')], known)
    expect(third.map((r) => `${r.done ? '✓' : '·'} ${r.title}`)).toEqual(['✓ Why now', '· The market'])
  })

  it('a slide first seen already written takes its heading, tidied and shortened; with no heading it is "Slide N"', () => {
    const long = 'A  very\n long heading '.repeat(12)
    const rows = buildRows([written('a', text('heading', long)), written('b', text('body', 'only body text')), written('c')], new Map())
    expect(rows[0]!.title.length).toBeLessThanOrEqual(90)
    expect(rows[0]!.title).not.toMatch(/\s{2,}|\n/)
    expect(rows[1]!.title).toBe('Slide 2')
    expect(rows[2]!.title).toBe('Slide 3')
    expect(rows.every((r) => r.done)).toBe(true)
    expect(currentRow(rows)).toBe(-1)
  })
})
