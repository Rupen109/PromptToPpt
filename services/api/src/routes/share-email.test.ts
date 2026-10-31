import { describe, expect, it } from 'vitest'
import { mailOutbox } from '../lib/mailer.ts'
import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'

const mail = (cookie: string, id: string, body: object) => api(cookie, 'POST', `/presentations/${id}/share/email`, body)
const setup = async (plan: 'starter' | 'pro' = 'starter') => {
  const u = await signUp('sm')
  if (plan !== 'starter') await setPlan(u.id, plan)
  const { id } = await makeDeck(u.id)
  return { u, id }
}

describe('POST /presentations/:id/share/email ("Email this link")', () => {
  it('sends the live link to each address once, with the sender\'s message, and tells the owner how many went out', async () => {
    const { u, id } = await setup()
    const link = (await json(await api(u.cookie, 'POST', `/presentations/${id}/share`, {}))).data.url as string
    mailOutbox.length = 0
    const res = await mail(u.cookie, id, { emails: ['ann@example.com', 'ANN@example.com', 'bob@example.org'], message: 'Have a look\nat this' })
    expect(res.status).toBe(200)
    expect((await json(res)).data).toEqual({ sent: 2, failed: 0 })
    const sent = mailOutbox.filter((m) => m.text.includes(link))
    expect(sent.map((m) => m.to.toLowerCase()).sort()).toEqual(['ann@example.com', 'bob@example.org'])
    expect(sent[0]!.text).toContain('"Have a look at this"')
    expect(sent[0]!.text).toContain('You can only view it')
    expect(sent[0]!.text).not.toMatch(/password-protected/)
  })

  it('a password-protected link says to ask for the password, and the password itself never goes in the mail', async () => {
    const { u, id } = await setup('pro')
    await api(u.cookie, 'POST', `/presentations/${id}/share`, { password: 'opensesame1' })
    mailOutbox.length = 0
    expect((await mail(u.cookie, id, { emails: ['ann@example.com'] })).status).toBe(200)
    const m = mailOutbox.find((x) => x.to === 'ann@example.com')!
    expect(m.text).toMatch(/password-protected/)
    expect(m.text).not.toContain('opensesame1')
  })

  it('needs a live link, only works for the owner, and refuses bad input (none, six, not an address)', async () => {
    const { u, id } = await setup()
    const other = await signUp('sm')
    expect((await mail(u.cookie, id, { emails: ['a@example.com'] })).status).toBe(409) // no link yet
    await api(u.cookie, 'POST', `/presentations/${id}/share`, {})
    expect((await mail(other.cookie, id, { emails: ['a@example.com'] })).status).toBe(404)
    expect((await mail(u.cookie, id, { emails: [] })).status).toBe(400)
    expect((await mail(u.cookie, id, { emails: ['a@e.com', 'b@e.com', 'c@e.com', 'd@e.com', 'e@e.com', 'f@e.com'] })).status).toBe(400)
    expect((await mail(u.cookie, id, { emails: ['not-an-address'] })).status).toBe(400)
    await api(u.cookie, 'DELETE', `/presentations/${id}/share`)
    expect((await mail(u.cookie, id, { emails: ['a@example.com'] })).status).toBe(409) // turned off
  })
})
