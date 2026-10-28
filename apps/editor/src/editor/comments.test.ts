import { describe, expect, it } from 'vitest'
import { encodeMentions, isUnread, prunePicks, showMentions, unreadCount } from './comments'

const people = [
  { id: 'owner12345', name: 'Maya Rao', role: 'owner' as const },
  { id: 'friend12345', name: 'Maya', role: 'editor' as const },
  { id: 'twin1234567', name: 'Sam Lee', role: 'editor' as const },
  { id: 'twin7654321', name: 'Sam Lee', role: 'editor' as const },
]

describe('mentions', () => {
  it('a unique name typed by hand becomes a mention; the longer name wins over its prefix', () => {
    expect(encodeMentions('hi @Maya Rao and @Maya!', people)).toBe('hi @{owner12345} and @{friend12345}!')
  })
  it('a name shared by two people is never guessed, but an exact pick from the list is honoured in order', () => {
    expect(encodeMentions('ask @Sam Lee', people)).toBe('ask @Sam Lee')
    expect(encodeMentions('ask @Sam Lee then @Sam Lee', people, [{ id: 'twin7654321', name: 'Sam Lee' }, { id: 'twin1234567', name: 'Sam Lee' }])).toBe('ask @{twin7654321} then @{twin1234567}')
  })
  it('a person picked and then deleted from the text is forgotten; the latest pick of a name is the one kept', () => {
    const a = { id: 'twin1234567', name: 'Sam Lee' }, b = { id: 'twin7654321', name: 'Sam Lee' }, o = { id: 'owner12345', name: 'Maya Rao' }
    expect(prunePicks('no mentions left', [a, o])).toEqual([])
    expect(prunePicks('hello @Sam Lee', [a, b])).toEqual([b])
    expect(prunePicks('@Sam Lee and @Sam Lee and @Maya Rao', [a, b, o])).toEqual([a, b, o])
    expect(encodeMentions('hello @Sam Lee', people, prunePicks('hello @Sam Lee', [a, b]))).toBe('hello @{twin7654321}')
  })
  it('text that only looks like a mention is left alone (e-mail addresses, longer words)', () => {
    expect(encodeMentions('mail me@Mayas.example or @Mayaville', people)).toBe('mail me@Mayas.example or @Mayaville')
  })
  it('stored tokens are shown with the person\'s current name, or "former member"', () => {
    expect(showMentions('see @{owner12345} and @{gone1234567}', people)).toBe('see @Maya Rao and @former member')
  })
})

describe('unread', () => {
  const t = (mine: boolean, at: string) => ({ id: 't', slideId: 's', x: null, y: null, status: 'open' as const, createdAt: at, resolvedAt: null, resolvedByName: null, comments: [{ id: 'c', authorId: 'a', authorName: 'A', body: 'x', createdAt: at, editedAt: null, mine }] })
  it('only other people\'s comments newer than the last visit count', () => {
    const seen = '2026-10-16T10:00:00.000Z'
    expect(isUnread(t(false, '2026-10-16T10:00:01.000Z'), seen)).toBe(true)
    expect(isUnread(t(true, '2026-10-16T10:00:01.000Z'), seen)).toBe(false)
    expect(isUnread(t(false, '2026-10-16T09:59:00.000Z'), seen)).toBe(false)
    expect(unreadCount([t(false, '2026-10-16T10:05:00.000Z'), t(true, '2026-10-16T10:06:00.000Z')], seen)).toBe(1)
  })
})
