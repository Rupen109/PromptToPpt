import { describe, expect, it } from 'vitest'
import type { SlideContent } from '@prompttoppt/validation'
import { allowedNumbers, checkContents, numberTokens, stripInventedNumbers } from './quality.ts'

const tb = (title: string, bullets: string[], extra: Partial<SlideContent> = {}): SlideContent => ({ layout: 'title-body', title, bullets, speakerNotes: '', sources: [], ...extra }) as SlideContent
const input = (userTexts: string[], requiredSections: string[] = [], facts: string[] = []) => ({ userTexts, analysis: { requiredSections, facts } })

describe('quality gate', () => {
  it('flags figures the user never gave, but allows ones they did and small structural integers', () => {
    const issues = checkContents([tb('Results', ['We cut bugs by 40%', 'Step 3 of the process']), tb('Scale', ['Tested 12 modules'])], input(['I tested 12 modules during my internship']))
    expect(issues.filter((i) => i.kind === 'invented_number').map((i) => i.slide)).toEqual([1])
    expect(issues[0]!.problem).toContain('40%')
  })
  it('does not treat the deck-size instruction as data when it is not in the allowed text', () => {
    expect(numberTokens('Q3 grew 1,200 units')).toEqual(['3', '1200'])
    expect([...allowedNumbers(['revenue 1,200 units'])]).toEqual(['1200'])
  })
  it('detects sample/template leakage (names and copied sentences) unless the user wrote it', () => {
    const leak = checkContents([tb('Intro', ['Northwind builds logistics software'])], input(['my internship']))
    expect(leak.some((i) => i.kind === 'sample_leak')).toBe(true)
    expect(checkContents([tb('Intro', ['Northwind is my employer'])], input(['I work at Northwind'])).some((i) => i.kind === 'sample_leak')).toBe(false)
    const copied = checkContents([tb('Problem', ['Small carriers plan routes by hand and customers get vague delivery windows'])], input(['x']))
    expect(copied.some((i) => i.kind === 'sample_leak')).toBe(true)
  })
  it('flags empty slides and duplicate titles, and uncovered required topics', () => {
    const issues = checkContents([tb('Same', ['one point here']), tb('Same', ['another point here']), tb('', [''])], input(['x'], ['bug reporting lifecycle']))
    expect(issues.map((i) => i.kind).sort()).toEqual(['duplicate_title', 'empty', 'missing_topic'])
    const ok = checkContents([tb('Bug reporting', ['Writing clear bug reports across the lifecycle'])], input(['x'], ['bug reporting lifecycle']))
    expect(ok.some((i) => i.kind === 'missing_topic')).toBe(false)
  })
  it('a clean, grounded deck passes', () => {
    expect(checkContents([tb('Test cases', ['Writing test cases from requirements', 'Covering normal and edge inputs'])], input(['I learned to write test cases'], ['test cases']))).toEqual([])
  })
  it('stripInventedNumbers drops offending bullets but never empties the slide', () => {
    const a = stripInventedNumbers(tb('t', ['Found 87 bugs', 'Wrote clear reports']), new Set())
    expect(a).toMatchObject({ bullets: ['Wrote clear reports'] })
    const b = stripInventedNumbers(tb('t', ['Found 87 bugs']), new Set())
    expect((b as { bullets: string[] }).bullets[0]).toBe('Found bugs')
  })
})
