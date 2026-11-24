import { describe, expect, it } from 'vitest'
import { nothingChangedReply } from './replies.ts'

describe('when nothing changed, the headline follows the kinds of the notes (C13, C16, C26)', () => {
  it('everything already so: "Nothing needed changing", never "I couldn\'t"', () => {
    expect(nothingChangedReply(['All the titles are already bold.'], ['All the titles are already bold.'], 'HELP')).toBe('Nothing needed changing — it was already like that.')
  })
  it('a part refused (alone or next to an already-so part): "I couldn\'t do that"', () => {
    expect(nothingChangedReply(['Slide 3 is locked, so I left it.'], [], 'HELP')).toBe("I couldn't do that — see the note below.")
    expect(nothingChangedReply(['Slide 3 is locked, so I left it.', 'Slide 2 already arrives with a fade.'], ['Slide 2 already arrives with a fade.'], 'HELP')).toBe("I couldn't do that — see the notes below.")
  })
  it('no note at all: what I can do', () => expect(nothingChangedReply([], [], 'HELP')).toBe('HELP'))
})
