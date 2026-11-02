import { describe, expect, it } from 'vitest'
import { aimsAtOneSlide, needsSlideChoice } from './ai-assist.ts'

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

  it('a picture or background request uses the slide the person is on (no question), but still asks when no slide is open', () => {
    for (const t of ['update the bg image', 'change the background image', 'new background photo', 'replace the picture with a city', 'put a photo of a lake behind it', 'use a different image', 'set the background to a forest photo']) {
      expect(needsSlideChoice(t, 'deck', true), t).toBe(false)
    }
    expect(needsSlideChoice('update the bg image', 'deck', false)).toBe(true)
    // text edits still ask, even with a slide open (an edit to the wrong slide is worse than one extra click)
    expect(needsSlideChoice('make the title shorter', 'deck', true)).toBe(true)
    expect(needsSlideChoice('make the picture bigger', 'deck', true)).toBe(true)
  })

  it('a picture or background request on the slide you are on is priced as ONE slide; "every slide" is not', () => {
    expect(aimsAtOneSlide('update the bg image', true)).toBe(true)
    expect(aimsAtOneSlide('update the bg image', false)).toBe(false)
    expect(aimsAtOneSlide('change the background of every slide', true)).toBe(false)
    expect(aimsAtOneSlide('make the whole deck warmer', true)).toBe(false)
  })
})
