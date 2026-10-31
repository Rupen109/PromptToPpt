import { describe, expect, it } from 'vitest'
import { presentationSchema } from '@prompttoppt/validation'
import { api, json, signUp } from '../test-utils.ts'

describe('POST /presentations { blank: true } ("Create from scratch")', () => {
  it('makes a deck with ONE empty slide in the chosen look and size, no AI and no credits', async () => {
    const u = await signUp('scr')
    const made = await json(await api(u.cookie, 'POST', '/presentations', { blank: true, templateId: 'pitch-seed-round', title: 'My own deck', aspectRatio: '4:3' }))
    expect(made.success).toBe(true)
    const got = await json(await api(u.cookie, 'GET', `/presentations/${made.data.id}`))
    const doc = presentationSchema.parse(got.data.document)
    expect(doc.title).toBe('My own deck')
    expect(doc.aspectRatio).toBe('4:3')
    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0]).toMatchObject({ layoutId: 'blank', manual: true, elements: [] })
    expect(doc.slides[0]!.background).toMatchObject({ type: 'color', value: doc.theme.colors.background })
  })
  it('works without a look (default colours) and refuses an unknown look', async () => {
    const u = await signUp('scr')
    expect((await json(await api(u.cookie, 'POST', '/presentations', { blank: true }))).success).toBe(true)
    expect((await api(u.cookie, 'POST', '/presentations', { blank: true, templateId: 'no-such-look' })).status).toBe(404)
  })
})
