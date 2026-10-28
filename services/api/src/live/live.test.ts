import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db, pool } from '../db/index.ts'
import { presentationMember, user } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'
import { PgBus, type LiveEvent } from './bus.ts'

/** Reads a Server-Sent-Events response into a queue of { event, data }. */
function sse(res: Response) {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  const queue: { event: string; data: any }[] = []
  const waiters: (() => void)[] = []
  let buf = '', done = false
  void (async () => {
    for (;;) {
      const r = await reader.read().catch(() => ({ done: true, value: undefined }))
      if (r.done) { done = true; waiters.splice(0).forEach((w) => w()); return }
      buf += dec.decode(r.value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2)
        const ev = /event: (.*)/.exec(block)?.[1] ?? 'message'
        const data = /data: (.*)/.exec(block)?.[1]
        if (data !== undefined) queue.push({ event: ev, data: data ? JSON.parse(data) : null })
        waiters.splice(0).forEach((w) => w())
      }
    }
  })()
  const wait = (ms: number) => new Promise<void>((r) => { const t = setTimeout(r, ms); waiters.push(() => { clearTimeout(t); r() }) })
  return {
    queue,
    get closed() { return done },
    async next(event: string, ms = 3000) {
      const end = Date.now() + ms
      for (;;) {
        const i = queue.findIndex((q) => q.event === event)
        if (i >= 0) return queue.splice(i, 1)[0]!.data
        if (done || Date.now() > end) return null
        await wait(end - Date.now())
      }
    },
    async until(ms = 3000) { const end = Date.now() + ms; while (!done && Date.now() < end) await wait(end - Date.now()) ; return done },
    cancel: () => reader.cancel().catch(() => {}),
  }
}
const open = async (cookie: string, deck: string, client = `c-${rid()}-${rid()}`) => {
  const res = await app.request(`/api/v1/presentations/${deck}/live?client=${client}`, { headers: { Cookie: cookie } })
  return { res, client, ...(res.status === 200 ? sse(res) : { queue: [], closed: true, next: async () => null, until: async () => true, cancel: async () => {} }) }
}
const emailOf = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!.email
const presence = (cookie: string, deck: string, body: object) => api(cookie, 'POST', `/presentations/${deck}/live/presence`, body)

async function team() {
  const owner = await signUp('lo'); await setPlan(owner.id, 'pro')
  const deck = await makeDeck(owner.id, 4)
  const friend = await signUp('lf')
  const email = await emailOf(friend.id)
  await api(owner.cookie, 'POST', `/presentations/${deck.id}/members`, { email })
  const token = (await db.select().from(presentationMember).where(eq(presentationMember.presentationId, deck.id)))[0]!.token
  await api(friend.cookie, 'POST', `/invites/${token}/accept`)
  return { owner, friend, deck, members: () => db.select().from(presentationMember).where(eq(presentationMember.presentationId, deck.id)) }
}

describe('live editing stream', () => {
  const streams: { cancel: () => Promise<void> }[] = []
  afterAll(async () => { await Promise.all(streams.map((s) => s.cancel())) })
  const track = <T extends { cancel: () => Promise<void> }>(s: T) => (streams.push(s), s)

  it('hello carries the current revision and role; presence from one person reaches the other with a server-stamped identity', async () => {
    const t = await team()
    const o = track(await open(t.owner.cookie, t.deck.id))
    const h = await o.next('hello')
    expect(h).toMatchObject({ role: 'owner', peers: [] })
    expect(typeof h.revision).toBe('number')
    const f = track(await open(t.friend.cookie, t.deck.id))
    expect((await f.next('hello')).role).toBe('editor')
    const slideId = (await json(await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}`))).data.document.slides[1].id
    expect((await presence(t.friend.cookie, t.deck.id, { clientId: f.client, slideId, selection: ['e1'], editing: 'e1', cursor: { x: 10, y: 20 } })).status).toBe(200)
    const ev = await o.next('presence')
    expect(ev.peer).toMatchObject({ slideId, selection: ['e1'], editing: 'e1', cursor: { x: 10, y: 20 }, userId: t.friend.id })
    expect(ev.peer.name).toBeTruthy(); expect(ev.peer.color).toMatch(/^#/)
    // a client cannot choose its identity: sending someone else's user id/name is ignored by the schema, the server stamps its own
    await presence(t.friend.cookie, t.deck.id, { clientId: f.client, slideId, selection: [], editing: null, cursor: null, userId: t.owner.id, name: 'Impostor' })
    const ev2 = await o.next('presence')
    expect(ev2.peer.userId).toBe(t.friend.id)
    expect(ev2.peer.name).not.toBe('Impostor')
    // a late joiner is told who is already here
    const late = track(await open(t.owner.cookie, t.deck.id))
    expect((await late.next('hello')).peers.map((p: { userId: string }) => p.userId)).toContain(t.friend.id)
  })

  it('a save by one person is announced to the others (revision events), not to nobody', async () => {
    const t = await team()
    const o = track(await open(t.owner.cookie, t.deck.id))
    await o.next('hello')
    const got = await json(await api(t.friend.cookie, 'GET', `/presentations/${t.deck.id}`))
    const saved = await json(await api(t.friend.cookie, 'PUT', `/presentations/${t.deck.id}`, { baseRevision: got.data.revision, document: { ...got.data.document, title: 'Live edit' } }))
    const ev = await o.next('rev')
    expect(ev).toMatchObject({ t: 'rev', deck: t.deck.id, rev: saved.data.revision, by: t.friend.id })
  })

  it('strangers, anonymous visitors and bad client ids are refused', async () => {
    const t = await team()
    const stranger = await signUp('ls')
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/live?client=abcdefgh12`, { headers: { Cookie: stranger.cookie } })).status).toBe(404)
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/live?client=abcdefgh12`)).status).toBe(401)
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/live?client=x`, { headers: { Cookie: t.owner.cookie } })).status).toBe(400)
    expect((await presence(stranger.cookie, t.deck.id, { clientId: 'abcdefgh12', slideId: null, selection: [], editing: null, cursor: null })).status).toBe(404)
    expect((await presence(t.owner.cookie, t.deck.id, { clientId: 'abcdefgh12', slideId: null, selection: new Array(60).fill('x'), editing: null, cursor: null })).status).toBe(400)
  })

  it('removing a collaborator closes their stream at once and stops events reaching them', async () => {
    const t = await team()
    const f = track(await open(t.friend.cookie, t.deck.id))
    await f.next('hello')
    const [m] = await t.members()
    expect((await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/members/${m!.id}`)).status).toBe(200)
    expect(await f.next('kick')).toMatchObject({ userId: t.friend.id }) // the browser is told why, so it does not just reconnect
    expect(await f.until(3000)).toBe(true)
    expect((await app.request(`/api/v1/presentations/${t.deck.id}/live?client=abcdefgh12`, { headers: { Cookie: t.friend.cookie } })).status).toBe(404)
  })

  it('at most 3 live tabs per person per deck', async () => {
    const t = await team()
    const opened = []
    for (let i = 0; i < 3; i++) { const s = track(await open(t.owner.cookie, t.deck.id)); expect(s.res.status).toBe(200); opened.push(s) }
    const fourth = await open(t.owner.cookie, t.deck.id)
    expect(fourth.res.status).toBe(429)
    await opened[0]!.cancel() // closing one frees a slot
    await new Promise((r) => setTimeout(r, 50))
    const again = track(await open(t.owner.cookie, t.deck.id))
    expect(again.res.status).toBe(200)
  })
})

describe('Postgres bus (multi-instance)', () => {
  it('an event published through one instance reaches subscribers on another', async () => {
    const a = new PgBus(pool), b = new PgBus(pool)
    await new Promise((r) => setTimeout(r, 300)) // both are LISTENing
    const seen: LiveEvent[] = []
    b.subscribe((e) => seen.push(e))
    await a.publish({ t: 'rev', deck: 'deck-x', rev: 7, by: 'u1' })
    await a.publish({ t: 'presence', deck: 'deck-x', peer: { clientId: 'c1', userId: 'u1', name: 'A', color: '#000', slideId: 's', selection: ['e'], editing: null, cursor: null, at: 1 } })
    for (let i = 0; i < 30 && seen.length < 2; i++) await new Promise((r) => setTimeout(r, 100))
    expect(seen.map((e) => e.t)).toEqual(['rev', 'presence'])
    await a.close(); await b.close()
  })
})
