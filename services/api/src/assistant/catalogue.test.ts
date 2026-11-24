import { describe, expect, it } from 'vitest'
import { CATALOGUE, closest, examplesFor, matches } from './catalogue.ts'
import { intentSchema } from './understand.ts'

describe('the catalogue of how people ask', () => {
  it('every reading is VALID for the understanding schema (an example can never teach a shape the model would be refused for)', () => {
    for (const e of CATALOGUE) {
      const r = intentSchema.safeParse({ kind: 'edit', clarity: 'act', ...e.read })
      expect(r.success, `${e.say}: ${r.success ? '' : JSON.stringify(r.error.issues.slice(0, 2))}`).toBe(true)
    }
  })
  it('every phrasing is unique', () => {
    expect(new Set(CATALOGUE.map((e) => e.say)).size).toBe(CATALOGUE.length)
  })
  it('the closest entries are the relevant ones (real chats): "add 3 slides after slide 2" finds the "after slide 6" example; "update text colour to green" finds the text-colour one', () => {
    expect(closest('add 3 slides after slide 2', 3).map((e) => e.say)).toContain('add 4 more slides after slide 6')
    expect(closest('update the text colour to green', 3).map((e) => e.say)).toContain('update the text color to red')
    expect(closest('please add more content on this slide', 3).map((e) => e.read.tasks?.[0]?.family)).toContain('text')
  })
  it('`except` leaves an entry out (the evaluation never shows a phrasing its own reading); a message with no shared words gets no examples', () => {
    expect(closest('add 4 more slides after slide 6', 5, 'add 4 more slides after slide 6').map((e) => e.say)).not.toContain('add 4 more slides after slide 6')
    expect(examplesFor('x')).toBe('')
  })
  it('the examples block stays small for any message (at most 5 lines, under 450 tokens)', () => {
    const longest = examplesFor(CATALOGUE.map((e) => e.say).join(' '))
    expect(longest.split('\n').filter((l) => l.startsWith('"'))).toHaveLength(5)
    expect(longest.length / 4).toBeLessThan(450)
  })
  it('matching: exact where it matters, loose values only need to be present', () => {
    const e = CATALOGUE.find((x) => x.say === 'color should be brown')!
    expect(matches(e, { kind: 'edit', tasks: [{ family: 'palette', targets: [], values: { primary: '#7A4A1E' } }] }).ok).toBe(true)
    expect(matches(e, { kind: 'edit', tasks: [{ family: 'palette', targets: [], values: {} }] }).ok).toBe(false)
    const after = CATALOGUE.find((x) => x.say === 'add 4 more slides after slide 6')!
    expect(matches(after, { kind: 'edit', tasks: [{ family: 'add_slide', targets: [], values: { count: 4, where: 'end' } }] }).why).toMatch(/where "end", wanted "after"/)
  })
})
