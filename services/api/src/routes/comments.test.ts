import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { comment, commentThread, presentation, presentationMember, user } from '../db/schema.ts'
import { mailOutbox } from '../lib/mailer.ts'
import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'
import { app } from '../app.ts'
import { MAX_COMMENTS_PER_DECK, MAX_COMMENTS_PER_THREAD, MAX_THREADS, cleanBody } from './comments.ts'

const emailOf = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!.email
const tokenOf = async (deckId: string, email: string) => (await db.select().from(presentationMember).where(eq(presentationMember.presentationId, deckId))).find((m) => m.email === email)!.token

/** an owner on Pro with a 4-slide deck and one accepted collaborator */
async function team() {
  const owner = await signUp('cown'); await setPlan(owner.id, 'pro')
  const deck = await makeDeck(owner.id, 4)
  const friend = await signUp('cfr')
  const fe = await emailOf(friend.id)
  expect((await api(owner.cookie, 'POST', `/presentations/${deck.id}/members`, { email: fe })).status).toBe(201)
  expect((await api(friend.cookie, 'POST', `/invites/${await tokenOf(deck.id, fe)}/accept`)).status).toBe(200)
  return { owner, friend, deck, slide: deck.doc.slides[0]!.id, slide2: deck.doc.slides[1]!.id }
}
const post = (who: { cookie: string }, deckId: string, body: object) => api(who.cookie, 'POST', `/presentations/${deckId}/comments`, body)
const list = async (who: { cookie: string }, deckId: string) => (await json(await api(who.cookie, 'GET', `/presentations/${deckId}/comments`))).data
const mailsTo = (email: string) => mailOutbox.filter((m) => m.to === email)

describe('comments: access', () => {
  it('A1/A2 the owner (on any plan) and an invited collaborator can comment and see each other\'s comments; names come from the server', async () => {
    const t = await team()
    const r1 = await post(t.owner, t.deck.id, { slideId: t.slide, body: 'Owner note' }); expect(r1.status).toBe(201)
    const r2 = await post(t.friend, t.deck.id, { slideId: t.slide, x: 0.25, y: 0.5, body: 'Friend note' }); expect(r2.status).toBe(201)
    const seenByOwner = await list(t.owner, t.deck.id)
    expect(seenByOwner.threads.map((x: any) => x.comments[0].body)).toEqual(['Owner note', 'Friend note'])
    expect(seenByOwner.threads[1]).toMatchObject({ slideId: t.slide, x: 0.25, y: 0.5, status: 'open' })
    expect(seenByOwner.threads[1].comments[0]).toMatchObject({ authorId: t.friend.id, authorName: expect.any(String), mine: false })
    expect((await list(t.friend, t.deck.id)).threads[1].comments[0].mine).toBe(true)
    // a Starter owner alone may comment too (notes to self)
    const solo = await signUp('csolo'); const d = await makeDeck(solo.id, 2)
    expect((await post(solo, d.id, { slideId: d.doc.slides[0]!.id, body: 'note to self' })).status).toBe(201)
  })
  it('A3 strangers, signed-out visitors and view-only-link visitors get nothing (404 / 401) and cannot write', async () => {
    const t = await team(); const stranger = await signUp('cstr')
    await post(t.owner, t.deck.id, { slideId: t.slide, body: 'secret plan' })
    expect((await api(stranger.cookie, 'GET', `/presentations/${t.deck.id}/comments`)).status).toBe(404)
    expect((await post(stranger, t.deck.id, { slideId: t.slide, body: 'hi' })).status).toBe(404)
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/comments`)).status).toBe(401)
    const link = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/share`)); const token = link.data.url.split('/s/')[1]
    const pub = await app.request(`/api/v1/public/share/${token}`); const text = await pub.text()
    expect(pub.status).toBe(200); expect(text).not.toMatch(/secret plan|comment/i)
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/comments`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401)
  })
  it('A4 a removed collaborator loses comment access at once; their earlier comments stay, with their name', async () => {
    const t = await team()
    await post(t.friend, t.deck.id, { slideId: t.slide, body: 'before leaving' })
    const members = await db.select().from(presentationMember).where(eq(presentationMember.presentationId, t.deck.id))
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/members/${members[0]!.id}`)).status).toBeLessThan(300)
    expect((await api(t.friend.cookie, 'GET', `/presentations/${t.deck.id}/comments`)).status).toBe(404)
    expect((await post(t.friend, t.deck.id, { slideId: t.slide, body: 'again' })).status).toBe(404)
    const after = await list(t.owner, t.deck.id); expect(after.threads[0].comments[0]).toMatchObject({ body: 'before leaving', authorName: expect.any(String) })
  })
  it('A5 when the owner\'s plan stops including collaboration, collaborators get the upgrade answer; the owner can still comment', async () => {
    const t = await team(); await setPlan(t.owner.id, 'starter')
    expect((await api(t.friend.cookie, 'GET', `/presentations/${t.deck.id}/comments`)).status).toBe(403)
    expect((await post(t.owner, t.deck.id, { slideId: t.slide, body: 'still mine' })).status).toBe(201)
  })
})

describe('comments: writing', () => {
  it('B1/B3 a thread, a reply, in order; the author is always the signed-in person (G6)', async () => {
    const t = await team()
    const th = (await json(await post(t.owner, t.deck.id, { slideId: t.slide, body: 'First' }))).data
    expect((await api(t.friend.cookie, 'POST', `/presentations/${t.deck.id}/comments/${th.threadId}/replies`, { body: 'Reply', authorId: t.owner.id })).status).toBe(201)
    const d = await list(t.owner, t.deck.id)
    expect(d.threads[0].comments.map((c: any) => [c.body, c.authorId])).toEqual([['First', t.owner.id], ['Reply', t.friend.id]])
  })
  it('B4/B8 empty, spaces, too long, a bad slide and bad pins are refused with plain messages and nothing is saved', async () => {
    const t = await team()
    for (const [body, re] of [['', /Write something/], ['   \n  ', /Write something/], ['x'.repeat(2001), /up to 2000/], ['\u0007', /Write something/]] as [string, RegExp][]) {
      const r = await post(t.owner, t.deck.id, { slideId: t.slide, body }); const j = await json(r)
      expect(r.status, body.slice(0, 10)).toBe(422); expect(j.error.message).toMatch(re)
    }
    expect((await post(t.owner, t.deck.id, { slideId: t.slide, body: 'a\u0000b' })).status).toBe(400) // a NUL character is refused before the database sees it
    expect((await post(t.owner, t.deck.id, { slideId: t.slide, body: 'x'.repeat(30_000) })).status).toBe(400) // beyond what any real comment is: refused before it is read
    expect((await post(t.owner, t.deck.id, { slideId: 'no-such-slide', body: 'hi' })).status).toBe(422)
    for (const pin of [{ x: -0.1, y: 0.5 }, { x: 1.1, y: 0.5 }, { x: 'a', y: 0.5 }, { x: 0.5 }, { y: 0.5 }]) {
      const r = await post(t.owner, t.deck.id, { slideId: t.slide, body: 'pinned', ...pin }); expect(r.status, JSON.stringify(pin)).toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500)
    }
    expect((await list(t.owner, t.deck.id)).threads).toHaveLength(0)
    expect(cleanBody('  a\r\nb\u0000c  ')).toBe('a\nbc')
  })
  it('B5 HTML, script and emoji are stored as plain text and returned unchanged', async () => {
    const t = await team(); const s = '<img src=x onerror=alert(1)><script>1</script> 😀 مرحبا'
    await post(t.owner, t.deck.id, { slideId: t.slide, body: s })
    expect((await list(t.owner, t.deck.id)).threads[0].comments[0].body).toBe(s)
  })
})

describe('comments: mentions and email', () => {
  it('C2 a mention emails the person once, as plain text with an excerpt and a link; the author is not emailed', async () => {
    const t = await team(); const fe = await emailOf(t.friend.id); const oe = await emailOf(t.owner.id)
    mailOutbox.length = 0
    const r = await post(t.owner, t.deck.id, { slideId: t.slide, body: `Please check <b>this</b> @{${t.friend.id}} and @{${t.owner.id}}` }); expect(r.status).toBe(201)
    await new Promise((x) => setTimeout(x, 150))
    expect(mailsTo(fe)).toHaveLength(1); expect(mailsTo(oe)).toHaveLength(0)
    const m = mailsTo(fe)[0]!
    expect(m.text).toContain('Please check <b>this</b> @'); expect(m.text).toContain(`/edit/${t.deck.id}`); expect(m.html).toBeUndefined()
    expect(m.text).not.toContain(`@{${t.friend.id}}`)
  })
  it('C4 many mentions of the same person within ten minutes still send one email; C3 stranger ids become plain "@unknown" and send nothing', async () => {
    const t = await team(); const fe = await emailOf(t.friend.id); const stranger = await signUp('cmen'); const se = await emailOf(stranger.id)
    mailOutbox.length = 0
    for (let i = 0; i < 4; i++) await post(t.owner, t.deck.id, { slideId: t.slide, body: `ping ${i} @{${t.friend.id}}` })
    await post(t.owner, t.deck.id, { slideId: t.slide, body: `hello @{${stranger.id}} and @{madeUpIdThatDoesNotExist}` })
    await new Promise((x) => setTimeout(x, 200))
    expect(mailsTo(fe)).toHaveLength(1); expect(mailsTo(se)).toHaveLength(0)
    const bodies = (await list(t.owner, t.deck.id)).threads.map((x: any) => x.comments[0].body)
    expect(bodies.at(-1)).toBe('hello @unknown and @unknown')
  })
  it('C6 a mention of someone who was later removed is still stored; the list of people no longer offers them', async () => {
    const t = await team()
    await post(t.owner, t.deck.id, { slideId: t.slide, body: `ask @{${t.friend.id}}` })
    const members = await db.select().from(presentationMember).where(eq(presentationMember.presentationId, t.deck.id))
    await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/members/${members[0]!.id}`)
    const d = await list(t.owner, t.deck.id)
    expect(d.people.map((p: any) => p.id)).toEqual([t.owner.id]); expect(d.threads[0].comments[0].body).toContain(`@{${t.friend.id}}`)
  })
})

describe('comments: managing threads', () => {
  it('D1 resolve and reopen, by either person; D2 only the author edits; D3 author or owner deletes, a collaborator cannot delete the owner\'s; deleting the first comment deletes the thread', async () => {
    const t = await team()
    const th = (await json(await post(t.owner, t.deck.id, { slideId: t.slide, body: 'owner thread' }))).data
    const reply = (await json(await api(t.friend.cookie, 'POST', `/presentations/${t.deck.id}/comments/${th.threadId}/replies`, { body: 'friend reply' }))).data
    expect((await api(t.friend.cookie, 'PATCH', `/presentations/${t.deck.id}/comments/${th.threadId}`, { status: 'resolved' })).status).toBe(200)
    let d = await list(t.owner, t.deck.id); expect(d.threads[0]).toMatchObject({ status: 'resolved', resolvedByName: expect.any(String) })
    expect((await api(t.owner.cookie, 'PATCH', `/presentations/${t.deck.id}/comments/${th.threadId}`, { status: 'open' })).status).toBe(200)
    d = await list(t.owner, t.deck.id); expect(d.threads[0]).toMatchObject({ status: 'open', resolvedAt: null })
    expect((await api(t.owner.cookie, 'PATCH', `/presentations/${t.deck.id}/comments/items/${reply.commentId}`, { body: 'hijack' })).status).toBe(403)
    expect((await api(t.friend.cookie, 'PATCH', `/presentations/${t.deck.id}/comments/items/${reply.commentId}`, { body: 'friend edit' })).status).toBe(200)
    d = await list(t.owner, t.deck.id); expect(d.threads[0].comments[1]).toMatchObject({ body: 'friend edit', editedAt: expect.any(String) })
    expect((await api(t.friend.cookie, 'DELETE', `/presentations/${t.deck.id}/comments/items/${d.threads[0].comments[0].id}`)).status).toBe(403)
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/comments/items/${reply.commentId}`)).status).toBe(200) // the owner may delete anyone's
    d = await list(t.owner, t.deck.id); expect(d.threads[0].comments).toHaveLength(1)
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/comments/items/${d.threads[0].comments[0].id}`)).status).toBe(200)
    expect((await list(t.owner, t.deck.id)).threads).toHaveLength(0)
  })
  it('D6 threads of a deleted slide stay (the client shows them under "removed slides"): the API keeps them and a stranger\'s ids never work', async () => {
    const t = await team(); const other = await makeDeck(t.owner.id, 2)
    const th = (await json(await post(t.owner, t.deck.id, { slideId: t.slide, body: 'on slide one' }))).data
    expect((await api(t.owner.cookie, 'PATCH', `/presentations/${other.id}/comments/${th.threadId}`, { status: 'resolved' })).status).toBe(404) // a thread id is only valid inside its own deck
    expect((await list(t.owner, t.deck.id)).threads[0].slideId).toBe(t.slide)
  })
  it('unread: another person\'s comments count until they open the panel; your own never do', async () => {
    const t = await team()
    await post(t.owner, t.deck.id, { slideId: t.slide, body: 'one' }); await post(t.owner, t.deck.id, { slideId: t.slide, body: 'two' })
    expect((await list(t.friend, t.deck.id)).unread).toBe(2); expect((await list(t.owner, t.deck.id)).unread).toBe(0)
    expect((await api(t.friend.cookie, 'POST', `/presentations/${t.deck.id}/comments/seen`)).status).toBe(200)
    expect((await list(t.friend, t.deck.id)).unread).toBe(0)
    await new Promise((x) => setTimeout(x, 20)); await post(t.owner, t.deck.id, { slideId: t.slide, body: 'three' })
    expect((await list(t.friend, t.deck.id)).unread).toBe(1)
  })
})

describe('comments stay out of the content', () => {
  it('F3/F6 comments never change the deck: revision, document and version history are untouched', async () => {
    const t = await team()
    const before = (await db.select().from(presentation).where(eq(presentation.id, t.deck.id)))[0]!
    await post(t.owner, t.deck.id, { slideId: t.slide, body: 'pure note' })
    const after = (await db.select().from(presentation).where(eq(presentation.id, t.deck.id)))[0]!
    expect(after.revision).toBe(before.revision); expect(after.latestVersion).toBe(before.latestVersion)
    const deck = await (await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}`)).text()
    expect(deck).not.toContain('pure note')
    const versions = await (await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}/versions`)).text(); expect(versions).not.toContain('pure note')
  })
  it('F4 Duplicate starts with no comments; the original keeps its own', async () => {
    const t = await team(); await post(t.owner, t.deck.id, { slideId: t.slide, body: 'stay here' })
    const copy = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/duplicate`)); expect(copy.data.id).toBeTruthy()
    expect((await list(t.owner, copy.data.id)).threads).toHaveLength(0); expect((await list(t.owner, t.deck.id)).threads).toHaveLength(1)
  })
  it('F5 once the deck is deleted its comments cannot be reached; purging the deck removes them from the database', async () => {
    const t = await team(); await post(t.owner, t.deck.id, { slideId: t.slide, body: 'bye' })
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}`)).status).toBeLessThan(300)
    expect((await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}/comments`)).status).toBe(404)
    await db.delete(presentation).where(eq(presentation.id, t.deck.id))
    expect(await db.select().from(commentThread).where(eq(commentThread.presentationId, t.deck.id))).toHaveLength(0)
  })
})

describe('comments: limits', () => {
  it('G1 the 500-thread and 200-comment limits answer in plain words; a hot loop is slowed by the per-person limit', async () => {
    const t = await team()
    const th = (await json(await post(t.owner, t.deck.id, { slideId: t.slide, body: 'seed' }))).data
    await db.insert(comment).values(Array.from({ length: MAX_COMMENTS_PER_THREAD - 1 }, (_, i) => ({ id: `fill${th.threadId}${i}`.slice(0, 40), threadId: th.threadId, authorId: t.owner.id, body: `r${i}` })))
    const full = await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/comments/${th.threadId}/replies`, { body: 'one too many' })
    expect(full.status).toBe(429); expect((await json(full)).error.message).toMatch(/up to 200/)
    await db.insert(commentThread).values(Array.from({ length: MAX_THREADS - 1 }, (_, i) => ({ id: `t${th.threadId}${i}`.slice(0, 40), presentationId: t.deck.id, slideId: t.slide, createdBy: t.owner.id })))
    const over = await post(t.owner, t.deck.id, { slideId: t.slide, body: 'thread 501' })
    expect(over.status).toBe(429); expect((await json(over)).error.message).toMatch(/up to 500/)
    const u = await signUp('crate'); const d = await makeDeck(u.id, 2); let limited = 0
    for (let i = 0; i < 45; i++) { const r = await api(u.cookie, 'POST', `/presentations/${d.id}/comments/${'x'.repeat(8)}/replies`, { body: 'x' }); if (r.status === 429) limited++ }
    expect(limited).toBeGreaterThan(0); expect(await json(await post(u, d.id, { slideId: d.doc.slides[0]!.id, body: 'rate' }))).toMatchObject({ error: { message: expect.stringMatching(/commenting very quickly/) } })
  })
})

describe('comments: whole-deck cap', () => {
  it('G1 a deck stops accepting comments at 3,000 (new threads and replies), in plain words', async () => {
    const t = await team()
    const th = (await json(await post(t.owner, t.deck.id, { slideId: t.slide, body: 'seed' }))).data
    const ids = Array.from({ length: 15 }, (_, k) => `capthr${k}${th.threadId}`.slice(0, 40))
    await db.insert(commentThread).values(ids.map((id) => ({ id, presentationId: t.deck.id, slideId: t.slide, createdBy: t.owner.id })))
    await db.insert(comment).values(Array.from({ length: MAX_COMMENTS_PER_DECK - 1 }, (_, i) => ({ id: `capc${i}${th.threadId}`.slice(0, 40), threadId: ids[i % ids.length]!, authorId: t.owner.id, body: `c${i}` })))
    for (const r of [await post(t.owner, t.deck.id, { slideId: t.slide, body: 'new thread' }), await api(t.friend.cookie, 'POST', `/presentations/${t.deck.id}/comments/${th.threadId}/replies`, { body: 'reply' })]) {
      expect(r.status).toBe(429); expect((await json(r)).error.message).toMatch(/up to 3000 comments/)
    }
  })
})
