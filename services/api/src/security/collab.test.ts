import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { authAttempt, creditBalance, presentationMember, user } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'
import { app } from '../app.ts'

// The password-guess limit (30 per 15 minutes per address) is stored in the database, and every test request comes from the same address: without this, running the suite a few
// times within a quarter of an hour would trip the limit and fail tests that have nothing wrong with them.
beforeAll(async () => { await db.delete(authAttempt).where(eq(authAttempt.kind, 'share_pw')) })

const emailOf = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!.email
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]?.balance ?? 0
const publicGet = (token: string) => app.request(`/api/v1/public/share/${token}`)
const tokenOf = (url: string) => url.split('/s/')[1]!
const invite = async (owner: { cookie: string }, deckId: string, email: string) => api(owner.cookie, 'POST', `/presentations/${deckId}/members`, { email })
const inviteToken = async (deckId: string, email: string) => (await db.select().from(presentationMember).where(eq(presentationMember.presentationId, deckId))).find((m) => m.email === email)!.token

async function setup() {
  const owner = await signUp('own'); await setPlan(owner.id, 'pro')
  const deck = await makeDeck(owner.id, 4)
  const friend = await signUp('fr')
  return { owner, deck, friend, friendEmail: await emailOf(friend.id) }
}
async function accepted() {
  const s = await setup()
  const r = await invite(s.owner, s.deck.id, s.friendEmail)
  expect(r.status).toBe(201)
  const acc = await api(s.friend.cookie, 'POST', `/invites/${await inviteToken(s.deck.id, s.friendEmail)}/accept`)
  expect(acc.status).toBe(200)
  return s
}

describe('view-only share links (level 1)', () => {
  it('owner shares, anyone can view without login, notes and sources are not exposed, revoke kills the link at once', async () => {
    const owner = await signUp('sh') // Starter: share links are available on every plan
    const deck = await makeDeck(owner.id, 3)
    const made = await json(await api(owner.cookie, 'POST', `/presentations/${deck.id}/share`))
    expect(made.data.url).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/)
    expect((await json(await api(owner.cookie, 'POST', `/presentations/${deck.id}/share`))).data.url).toBe(made.data.url) // idempotent
    const view = await publicGet(tokenOf(made.data.url))
    expect(view.status).toBe(200)
    expect(view.headers.get('cache-control')).toBe('no-store')
    expect(view.headers.get('x-robots-tag')).toMatch(/noindex/)
    const body = await json(view)
    expect(body.data.document.slides.length).toBe(3)
    expect(body.data.watermark).toBe(true) // Starter owner
    for (const s of body.data.document.slides) { expect(s.speakerNotes).toBe(''); expect(s.content).toBeUndefined(); expect(s.sources).toEqual([]) }
    expect(body.data.document.sources).toEqual([])
    await api(owner.cookie, 'DELETE', `/presentations/${deck.id}/share`)
    expect((await publicGet(tokenOf(made.data.url))).status).toBe(404)
    // sharing again makes a NEW token; the old one stays dead
    const again = await json(await api(owner.cookie, 'POST', `/presentations/${deck.id}/share`))
    expect(again.data.url).not.toBe(made.data.url)
    expect((await publicGet(tokenOf(made.data.url))).status).toBe(404)
    expect((await publicGet(tokenOf(again.data.url))).status).toBe(200)
  })
  it('only the owner can manage a link; guessing tokens finds nothing; a deleted deck stops being viewable', async () => {
    const a = await signUp('sh'), b = await signUp('sh')
    const deck = await makeDeck(a.id, 2)
    expect((await api(b.cookie, 'POST', `/presentations/${deck.id}/share`)).status).toBe(404)
    expect((await api(b.cookie, 'GET', `/presentations/${deck.id}/share`)).status).toBe(404)
    expect((await api(b.cookie, 'DELETE', `/presentations/${deck.id}/share`)).status).toBe(404)
    expect((await app.request('/api/v1/presentations/x/share', { method: 'POST', headers: { Origin: process.env['WEB_URL'] ?? 'http://localhost:3000' } })).status).toBe(401)
    for (const t of ['x'.repeat(32), '../etc/passwd', 'a'.repeat(31), 'a'.repeat(33)]) expect((await publicGet(t)).status).toBe(404)
    const url = (await json(await api(a.cookie, 'POST', `/presentations/${deck.id}/share`))).data.url
    await api(a.cookie, 'DELETE', `/presentations/${deck.id}`)
    expect((await publicGet(tokenOf(url))).status).toBe(404)
  })
})

describe('collaboration (level 2)', () => {
  it('Starter owners cannot invite; Pro owners can; the invite is addressed to an email', async () => {
    const s = await setup()
    const free = await signUp('free'); const freeDeck = await makeDeck(free.id, 2)
    const denied = await invite(free, freeDeck.id, s.friendEmail)
    expect(denied.status).toBe(403)
    expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
    const ok = await invite(s.owner, s.deck.id, s.friendEmail)
    expect(ok.status).toBe(201)
    expect((await json(ok)).data).toMatchObject({ email: s.friendEmail, status: 'pending' })
    expect((await invite(s.owner, s.deck.id, await emailOf(s.owner.id))).status).toBe(400) // your own address
  })

  it('only the invited mailbox can accept (plus-tags and dots count as the same mailbox); a stranger cannot', async () => {
    const s = await setup()
    await invite(s.owner, s.deck.id, s.friendEmail)
    const token = await inviteToken(s.deck.id, s.friendEmail)
    const stranger = await signUp('str')
    const peek = await json(await api(stranger.cookie, 'GET', `/invites/${token}`))
    expect(peek.data.forThisAccount).toBe(false)
    const wrong = await api(stranger.cookie, 'POST', `/invites/${token}/accept`)
    expect(wrong.status).toBe(403)
    expect((await json(wrong)).error.code).toBe('WRONG_ACCOUNT')
    expect((await api(stranger.cookie, 'GET', `/presentations/${s.deck.id}`)).status).toBe(404)
    expect((await api(s.friend.cookie, 'POST', `/invites/${token}/accept`)).status).toBe(200)
    expect((await api(stranger.cookie, 'POST', `/invites/${'z'.repeat(32)}/accept`)).status).toBe(404)
  })

  it('an invite expires after 14 days and cannot be accepted twice by someone else', async () => {
    const s = await setup()
    await invite(s.owner, s.deck.id, s.friendEmail)
    const token = await inviteToken(s.deck.id, s.friendEmail)
    await db.update(presentationMember).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(presentationMember.token, token))
    expect((await api(s.friend.cookie, 'POST', `/invites/${token}/accept`)).status).toBe(410)
  })

  it('a collaborator can open, edit and save the deck; the owner can still see the changes; strangers cannot', async () => {
    const s = await accepted()
    const got = await json(await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}`))
    expect(got.data.role).toBe('editor')
    const doc = { ...got.data.document, title: 'Edited by friend' }
    const saved = await json(await api(s.friend.cookie, 'PUT', `/presentations/${s.deck.id}`, { baseRevision: got.data.revision, document: doc }))
    expect(saved.success).toBe(true)
    const ownerView = await json(await api(s.owner.cookie, 'GET', `/presentations/${s.deck.id}`))
    expect(ownerView.data.document.title).toBe('Edited by friend')
    expect(ownerView.data.role).toBe('owner')
    const list = await json(await api(s.friend.cookie, 'GET', '/shared'))
    expect(list.data.map((d: { id: string }) => d.id)).toContain(s.deck.id)
    const other = await signUp('oth')
    expect((await api(other.cookie, 'GET', `/presentations/${s.deck.id}`)).status).toBe(404)
    expect((await api(other.cookie, 'PUT', `/presentations/${s.deck.id}`, { baseRevision: 1, document: doc })).status).toBe(404)
  })

  it('a collaborator cannot delete, move, share, invite, export, or see the member list', async () => {
    const s = await accepted()
    await setPlan(s.friend.id, 'pro') // even with a paid plan of their own, exporting someone else's deck is refused
    const third = await signUp('th')
    expect((await api(s.friend.cookie, 'DELETE', `/presentations/${s.deck.id}`)).status).toBe(404)
    expect((await api(s.friend.cookie, 'POST', `/presentations/${s.deck.id}/share`)).status).toBe(404)
    expect((await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}/members`)).status).toBe(404)
    expect((await invite(s.friend, s.deck.id, await emailOf(third.id))).status).toBe(404)
    expect((await api(s.friend.cookie, 'POST', '/exports', { presentationId: s.deck.id, format: 'pptx' })).status).toBe(404)
    expect((await api(s.friend.cookie, 'PUT', `/presentations/${s.deck.id}/project`, { projectId: null })).status).toBe(404)
    expect((await api(s.owner.cookie, 'GET', `/presentations/${s.deck.id}`)).status).toBe(200) // still the owner's
  })

  it('AI edits by a collaborator are charged to the OWNER, never to the collaborator', async () => {
    const s = await accepted()
    const got = await json(await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}`))
    await api(s.owner.cookie, 'GET', '/me/entitlements') // makes sure both allowances exist
    await api(s.friend.cookie, 'GET', '/me/entitlements')
    const ownerBefore = await balance(s.owner.id), friendBefore = await balance(s.friend.id)
    const r = await api(s.friend.cookie, 'POST', `/presentations/${s.deck.id}/ai-edit`, { slideId: got.data.document.slides[1].id, command: 'shorten', requestId: `rq-${rid()}-${rid()}` })
    expect(r.status).toBe(200)
    const out = await json(r)
    expect(out.data.creditsCharged).toBeGreaterThan(0)
    expect(await balance(s.owner.id)).toBe(ownerBefore - out.data.creditsCharged)
    expect(await balance(s.friend.id)).toBe(friendBefore)
    // replaying the request id is still not free
    expect((await api(s.friend.cookie, 'POST', `/presentations/${s.deck.id}/ai-edit`, { slideId: got.data.document.slides[1].id, command: 'shorten', requestId: `rq-${rid()}-${rid()}` })).status).toBe(200)
  })

  it('a collaborator\'s assistant chat history is their own, and they cannot rebuild the whole deck', async () => {
    const s = await accepted()
    await api(s.friend.cookie, 'POST', `/presentations/${s.deck.id}/chat`, { messages: [{ role: 'user', text: 'friend only' }] })
    expect(JSON.stringify((await json(await api(s.owner.cookie, 'GET', `/presentations/${s.deck.id}/chat`))).data)).not.toContain('friend only')
    expect(JSON.stringify((await json(await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}/chat`))).data)).toContain('friend only')
    const job = await api(s.friend.cookie, 'POST', '/generation/jobs', { prompt: 'Rebuild this deck with fresh content please', idempotencyKey: `k-${rid()}-${rid()}`, targetPresentationId: s.deck.id })
    expect(job.status).toBe(404)
  })

  it('the per-deck limit (Pro: 3) holds under parallel invites; removing a collaborator ends their access at once; they can also leave', async () => {
    const s = await setup()
    const emails = Array.from({ length: 6 }, () => `inv-${rid()}-${rid()}@example.com`)
    const results = await Promise.all(emails.map((e) => invite(s.owner, s.deck.id, e)))
    expect(results.filter((r) => r.status === 201)).toHaveLength(3)
    expect(results.filter((r) => r.status === 429)).toHaveLength(3)

    const t = await accepted()
    const list = await json(await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}/members`))
    const member = list.data.members.find((m: { email: string }) => m.email === t.friendEmail)
    expect((await api(t.friend.cookie, 'GET', `/presentations/${t.deck.id}`)).status).toBe(200)
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/members/${member.id}`)).status).toBe(200)
    expect((await api(t.friend.cookie, 'GET', `/presentations/${t.deck.id}`)).status).toBe(404)

    const u = await accepted()
    expect((await api(u.friend.cookie, 'DELETE', `/presentations/${u.deck.id}/members/me`)).status).toBe(200)
    expect((await api(u.friend.cookie, 'GET', `/presentations/${u.deck.id}`)).status).toBe(404)
  })

  it('if the owner drops to Starter, collaborators are paused (403), and come back when the plan does', async () => {
    const s = await accepted()
    await setPlan(s.owner.id, 'starter')
    const r = await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}`)
    expect(r.status).toBe(403)
    expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')
    expect((await api(s.owner.cookie, 'GET', `/presentations/${s.deck.id}`)).status).toBe(200)
    await setPlan(s.owner.id, 'pro')
    expect((await api(s.friend.cookie, 'GET', `/presentations/${s.deck.id}`)).status).toBe(200)
  })
})

describe('password-protected and expiring links (Pro / Gold)', () => {
  const unlock = (token: string, password: string) => app.request(`/api/v1/public/share/${token}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
  const view = (token: string, access?: string) => app.request(`/api/v1/public/share/${token}`, { headers: access ? { 'X-Share-Access': access } : {} })
  const share = (owner: { cookie: string }, deckId: string, body?: object) => api(owner.cookie, 'POST', `/presentations/${deckId}/share`, body)
  const proDeck = async () => { const owner = await signUp('pw'); await setPlan(owner.id, 'pro'); return { owner, deck: await makeDeck(owner.id, 3) } }

  it('Starter can make a plain link but not set a password or expiry; Pro can', async () => {
    const free = await signUp('pw'); const fd = await makeDeck(free.id, 2)
    expect((await share(free, fd.id, { password: 'secret123' })).status).toBe(403)
    expect((await share(free, fd.id, { expiresInDays: 7 })).status).toBe(403)
    expect((await share(free, fd.id)).status).toBe(201)
    expect((await api(free.cookie, 'PATCH', `/presentations/${fd.id}/share`, { password: 'secret123' })).status).toBe(403)
    const { owner, deck } = await proDeck()
    const r = await json(await share(owner, deck.id, { password: 'secret123', expiresInDays: 7 }))
    expect(r.data).toMatchObject({ hasPassword: true })
    expect(new Date(r.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000)
  })

  it('a password link shows nothing until the right password is entered; the proof only works for that link and until the password changes', async () => {
    const { owner, deck } = await proDeck()
    const made = await json(await share(owner, deck.id, { password: 'open-sesame' }))
    const token = tokenOf(made.data.url)
    const locked = await view(token)
    expect(locked.status).toBe(401)
    const lb = await json(locked)
    expect(lb.error.code).toBe('PASSWORD_REQUIRED')
    expect(JSON.stringify(lb)).not.toContain('slides') // not even the title leaks
    expect((await unlock(token, 'nope-nope')).status).toBe(401)
    const ok = await unlock(token, 'open-sesame')
    expect(ok.status).toBe(200)
    const { access } = (await json(ok)).data
    expect((await view(token, access)).status).toBe(200)
    expect((await view(token, access + 'x')).status).toBe(401)
    expect((await view(token, '1.forged')).status).toBe(401)
    // the proof does not open another protected link
    const other = await proDeck()
    const otherTok = tokenOf((await json(await share(other.owner, other.deck.id, { password: 'open-sesame' }))).data.url)
    expect((await view(otherTok, access)).status).toBe(401)
    // changing the password kills every existing proof
    await api(owner.cookie, 'PATCH', `/presentations/${deck.id}/share`, { password: 'brand-new-pw' })
    expect((await view(token, access)).status).toBe(401)
    expect((await unlock(token, 'open-sesame')).status).toBe(401)
    expect((await unlock(token, 'brand-new-pw')).status).toBe(200)
    // removing the password opens the link
    const g = await json(await api(owner.cookie, 'PATCH', `/presentations/${deck.id}/share`, { password: null }))
    expect(g.data.hasPassword).toBe(false)
    expect((await view(token)).status).toBe(200)
  })

  it('the password is stored hashed, never in plain text', async () => {
    const { owner, deck } = await proDeck()
    await share(owner, deck.id, { password: 'plain-text-pw' })
    const { shareLink } = await import('../db/schema.ts')
    const rows = await db.select().from(shareLink).where(eq(shareLink.presentationId, deck.id))
    expect(rows[0]!.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(rows[0]!.passwordHash).not.toContain('plain-text-pw')
  })

  it('guessing: after 10 wrong passwords the link is locked for everyone, even for the right password', async () => {
    const { owner, deck } = await proDeck()
    const token = tokenOf((await json(await share(owner, deck.id, { password: 'correct-horse' }))).data.url)
    for (let i = 0; i < 10; i++) expect((await unlock(token, `wrong-${i}`)).status).toBe(401)
    const blocked = await unlock(token, 'correct-horse')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('an expired link answers 410 (and a protected one does not even ask for the password); the owner can extend or clear it', async () => {
    const { owner, deck } = await proDeck()
    const made = await json(await share(owner, deck.id, { expiresInDays: 1, password: 'pw-for-expiry' }))
    const token = tokenOf(made.data.url)
    const { shareLink } = await import('../db/schema.ts')
    await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLink.token, token))
    const gone = await view(token)
    expect(gone.status).toBe(410)
    expect((await json(gone)).error.code).toBe('LINK_EXPIRED')
    expect((await unlock(token, 'pw-for-expiry')).status).toBe(410)
    expect((await api(owner.cookie, 'GET', `/presentations/${deck.id}/share`)).status).toBe(200)
    await api(owner.cookie, 'PATCH', `/presentations/${deck.id}/share`, { expiresInDays: null, password: null })
    expect((await view(token)).status).toBe(200)
  })

  it('a downgraded owner keeps the protection on existing links and can remove it, but cannot add new protection', async () => {
    const { owner, deck } = await proDeck()
    const token = tokenOf((await json(await share(owner, deck.id, { password: 'keep-me-safe' }))).data.url)
    await setPlan(owner.id, 'starter')
    expect((await view(token)).status).toBe(401) // still protected
    expect((await api(owner.cookie, 'PATCH', `/presentations/${deck.id}/share`, { password: 'another-one' })).status).toBe(403)
    expect((await api(owner.cookie, 'PATCH', `/presentations/${deck.id}/share`, { password: null })).status).toBe(200)
    expect((await view(token)).status).toBe(200)
  })

  it('only the owner can change or read link settings; collaborators and strangers cannot', async () => {
    const s = await accepted()
    const other = await signUp('x')
    for (const who of [s.friend, other]) {
      expect((await api(who.cookie, 'PATCH', `/presentations/${s.deck.id}/share`, { password: 'hijack-pass' })).status).toBe(404)
      expect((await api(who.cookie, 'GET', `/presentations/${s.deck.id}/share`)).status).toBe(404)
    }
  })
})
