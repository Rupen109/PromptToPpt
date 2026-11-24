import { describe, expect, it } from 'vitest'
import { contentWords, pointLists, textGoalFit, textGoalProblem, type SlideContent } from '@prompttoppt/validation'

/** Real slide contents (from real decks) for the "done when" rules of text requests (docs/AI_EDIT_V3_ARCHITECTURE.md §6). */
const timeline = { layout: 'timeline', title: 'Academic Pursuits', sources: [], speakerNotes: 'notes here', steps: [{ label: 'Schooling', detail: 'Schwartz Higher Secondary School: passion for mathematics' }, { label: 'Physics Degree', detail: 'Saint Joseph’s College' }, { label: 'Aeronautical Engineering', detail: 'Madras Institute of Technology' }, { label: 'First Major Project', detail: 'Designed a low-level attack aircraft model' }] } as unknown as SlideContent
const comparison = { layout: 'comparison', title: 'Balancing State Authority', sources: [], speakerNotes: '', left: { heading: 'Strong Central State', bullets: ['a', 'b', 'c'] }, right: { heading: 'Individual Liberty', bullets: ['d', 'e', 'f'] } } as unknown as SlideContent
const matrix = { layout: 'matrix', title: 'People’s President', xLabel: 'x', yLabel: 'y', sources: [], speakerNotes: '', quadrants: [{ heading: 'A', bullets: ['1', '2'] }, { heading: 'B', bullets: ['1'] }, { heading: 'C', bullets: ['1', '2'] }, { heading: 'D', bullets: ['1'] }] } as unknown as SlideContent
const steps = (n: number) => ({ ...timeline, steps: Array.from({ length: n }, (_, i) => ({ label: `S${i}`, detail: `detail ${i}` })) }) as unknown as SlideContent

describe('point lists come from the slide schema', () => {
  it('a timeline has one list of steps (3 to 6), a comparison two lists of bullets (1 to 6), a matrix the bullets inside its four fixed quadrants', () => {
    expect(pointLists(timeline)).toEqual([{ path: 'steps', count: 4, min: 3, max: 6 }])
    expect(pointLists(comparison).map((l) => [l.path, l.count, l.max])).toEqual([['left.bullets', 3, 6], ['right.bullets', 3, 6]])
    expect(pointLists(matrix).map((l) => l.path)).toEqual(['quadrants[0].bullets', 'quadrants[1].bullets', 'quadrants[2].bullets', 'quadrants[3].bullets'])
  })
  it('visible words leave out notes, picture fields and citations', () => {
    expect(contentWords({ layout: 'title', title: 'Two words', subtitle: 'and three more', speakerNotes: 'not these words at all', sources: [] } as unknown as SlideContent)).toBe(5)
  })
})

describe('"done when" for text requests', () => {
  it('"also add 5 points total in timeline": 5 steps is done, 4 is not (the old writer kept 4 and said Done)', () => {
    expect(textGoalFit(timeline, { totalPoints: 5 })).toEqual({ ok: true })
    expect(textGoalProblem(timeline, steps(4), { totalPoints: 5 })).toMatch(/it has 4 points; it needs exactly 5/)
    expect(textGoalProblem(timeline, steps(5), { totalPoints: 5 })).toBeNull()
  })
  it('"add 2 more in both side": each side +2 exactly (6 on a side is too many, as is 4)', () => {
    const sides = (l: number, r: number) => ({ ...comparison, left: { heading: 'L', bullets: Array(l).fill('x') }, right: { heading: 'R', bullets: Array(r).fill('y') } }) as unknown as SlideContent
    expect(textGoalProblem(comparison, sides(5, 5), { addPoints: 2 })).toBeNull()
    expect(textGoalProblem(comparison, sides(6, 6), { addPoints: 2 })).toMatch(/6 points in left.bullets and 6 points in right.bullets; it needs exactly 5/)
    expect(textGoalProblem(comparison, sides(5, 3), { addPoints: 2 })).toMatch(/3 points in right.bullets/)
  })
  it('asked for more than the layout holds: known BEFORE writing, with the limit', () => {
    expect(textGoalFit(timeline, { totalPoints: 8 })).toEqual({ ok: false, why: 'this timeline slide holds at most 6 points', fits: 6 })
    expect(textGoalFit(comparison, { addPoints: 4 })).toMatchObject({ ok: false, fits: 6 })
    expect(textGoalFit(timeline, { totalPoints: 2 })).toMatchObject({ ok: false, why: 'this timeline slide needs at least 3 points' })
  })
  it('"add more content / detail": at least 15% more visible words; the same words reworded is not done', () => {
    const longer = { ...timeline, steps: (timeline as unknown as { steps: { label: string; detail: string }[] }).steps.map((s) => ({ ...s, detail: `${s.detail}, where the work went deeper and wider` })) } as unknown as SlideContent
    expect(textGoalProblem(timeline, longer, { length: 'longer' })).toBeNull()
    expect(textGoalProblem(timeline, timeline, { length: 'longer' })).toMatch(/needs at least/)
    expect(textGoalProblem(timeline, { ...timeline, speakerNotes: 'a very long new speaker note '.repeat(20) } as SlideContent, { length: 'longer' })).toMatch(/needs at least/) // notes do not count
  })
  it('"make it shorter": at least 10% fewer visible words', () => {
    const short = { ...timeline, steps: steps(4) } as unknown as SlideContent
    expect(textGoalProblem(timeline, short, { length: 'shorter' })).toBeNull()
    expect(textGoalProblem(timeline, timeline, { length: 'shorter' })).toMatch(/needs at most/)
  })
  it('a request with no countable goal (rewrite, tone, translate) is never judged by these rules', () => {
    expect(textGoalProblem(timeline, timeline, {})).toBeNull()
    expect(textGoalFit(timeline, {})).toEqual({ ok: true })
  })
})
