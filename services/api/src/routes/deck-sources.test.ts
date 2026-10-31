import { describe, expect, it } from 'vitest'
import { SOURCE_TYPES, sourceSchema } from '@prompttoppt/validation'
import { SOURCE_KINDS } from '../sources/store.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'

describe('a deck can cite every kind of source and still be saved', () => {
  it('every kind the API stores is a kind a deck may cite (this once made decks built from Word, Excel, CSV, e-mail, picture and transcript sources fail to save)', () => {
    for (const kind of SOURCE_KINDS) expect((SOURCE_TYPES as readonly string[]).includes(kind), `deck sources cannot be of kind "${kind}"`).toBe(true)
  })

  it('saving a deck whose sources are of each kind works', async () => {
    const u = await signUp('dsrc')
    const { id, doc } = await makeDeck(u.id)
    const sources = SOURCE_KINDS.map((type, i) => ({ id: `src-${i}-${type}`.padEnd(12, 'x'), type, title: `A ${type} source`, ...(type === 'url' || type === 'transcript' ? { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } : {}) }))
    for (const s of sources) expect(sourceSchema.safeParse(s).success, s.type).toBe(true)
    const r = await api(u.cookie, 'PUT', `/presentations/${id}`, { baseRevision: 1, document: { ...doc, sources } })
    expect(r.status, JSON.stringify((await json(r)).error)).toBe(200)
  })
})
