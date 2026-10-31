import { describe, expect, it } from 'vitest'
import { needsSlideChoice } from './ai-assist.ts'

describe('needsSlideChoice: ask which slide instead of guessing', () => {
  it.each([
    'please make the title shorter',
    'make it shorter',
    'rewrite this',
    'add more points',
    'add more content',
    'simplify the bullets',
    'change the heading',
    'improve the wording',
    'make the picture bigger',
  ])('asks for "%s"', (t) => expect(needsSlideChoice(t, 'deck')).toBe(true))

  it.each([
    'make the title on slide 3 shorter',
    'shorten the title of the 2nd slide',
    'rewrite the first slide',
    'make the last slide shorter',
    'make the title shorter (slide 4)',
    'make the title shorter (on every slide)',
    'shorten every title',
    'make this slide shorter',
    'rewrite the current slide',
    'make the whole deck shorter',
    'change the colours to deep purple and gold',
    'use a serif font',
    'make the theme light',
    'animate every slide',
    'undo that',
    'revert it please',
    'why did you change the title?',
    'add a thank you slide at the end',
    'delete the last point',
    'translate it to Hindi',
    'hello',
    'give me some water please',
    'make the title shorter https://example.com/page',
  ])('does not ask for "%s"', (t) => expect(needsSlideChoice(t, 'deck')).toBe(false))

  it('never asks when the user is already working on a single slide, or when the message is long (a topic, not an edit)', () => {
    expect(needsSlideChoice('make the title shorter', 'slide')).toBe(false)
    expect(needsSlideChoice('rewrite the content ' + 'about our coffee roastery and its four stores '.repeat(4), 'deck')).toBe(false)
  })
})
