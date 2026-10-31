import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { supportTicket, user } from '../db/schema.ts'
import { api, json, origin, rid, signUp } from '../test-utils.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
const send = (fields: Record<string, string>, files: { name: string; bytes: Uint8Array }[] = [], cookie?: string) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  for (const x of files) f.append('files', new File([x.bytes], x.name, { type: 'image/png' }))
  return app.request('/api/v1/support', { method: 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: f })
}
const tag = rid()

// (the test limit is 8 messages an hour per visitor and lives in memory: the sends below are counted in the order they are written, 7 of them before the last test)
describe('POST /support (visitors)', () => {
  it('a message with a screenshot is stored for the owner (1)', async () => {
    const r = await send({ email: `Ann.${tag}@Example.com`, message: `The export button does nothing on my Mac. ${tag}` }, [{ name: 'shot.png', bytes: PNG }])
    expect(r.status).toBe(201)
    const id = (await json(r)).data.id
    const [row] = await db.select().from(supportTicket).where(eq(supportTicket.id, id))
    expect(row).toMatchObject({ email: `ann.${tag}@example.com`, status: 'new', userId: null })
    expect(row!.files).toHaveLength(1); expect(row!.files[0]).toMatchObject({ name: 'shot.png', mime: 'image/png' })
  })

  it('plain refusals: bad email, too-short message (2)', async () => {
    const a = await send({ email: 'not-an-email', message: 'This is long enough to be a message.' })
    expect(a.status).toBe(400); expect((await json(a)).error.message).toMatch(/valid email/)
    const b = await send({ email: 'a@b.co', message: 'hi' })
    expect(b.status).toBe(400); expect((await json(b)).error.message).toMatch(/at least 10/)
  })

  it('a bot that fills the hidden field is told "sent" and nothing is stored (3)', async () => {
    const r = await send({ email: `bot.${tag}@example.com`, message: 'Buy cheap watches now, click here please.', website: 'http://spam.example' })
    expect(r.status).toBe(201)
    expect(await db.select().from(supportTicket).where(eq(supportTicket.email, `bot.${tag}@example.com`))).toHaveLength(0)
  })

  it('only real pictures are accepted, judged by content; at most 3 (4)', async () => {
    const fake = await send({ email: 'a@b.co', message: 'Here is my file, please look at it.' }, [{ name: 'run.png', bytes: Uint8Array.from([0x4d, 0x5a, 0x90, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) }])
    expect(fake.status).toBe(422); expect((await json(fake)).error.message).toMatch(/not a PNG, JPG or WebP/)
    const many = await send({ email: 'a@b.co', message: 'Four pictures is one too many.' }, Array.from({ length: 4 }, (_, i) => ({ name: `${i}.png`, bytes: PNG })))
    expect(many.status).toBe(400); expect((await json(many)).error.message).toMatch(/up to 3/)
  })

  it('a signed-in sender is linked to their account (5)', async () => {
    const u = await signUp('support')
    const r = await send({ email: `me.${tag}@example.com`, message: 'I am signed in and need a hand with billing.' }, [], u.cookie)
    expect(r.status).toBe(201)
    const [row] = await db.select().from(supportTicket).where(eq(supportTicket.id, (await json(r)).data.id))
    expect(row!.userId).toBe(u.id)
  })

  it('too many messages from one visitor are refused politely (6)', async () => {
    expect((await send({ email: 'a@b.co', message: 'The last message the limit allows.' })).status).toBe(201)
    const r = await send({ email: 'a@b.co', message: 'One more message than the hourly limit.' })
    expect(r.status).toBe(429)
  })
})

describe('the owner reads the messages', () => {
  it('owner only; list, open the screenshot, mark resolved, delete', async () => {
    const u = await signUp('support'); const o = await signUp('support')
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, o.id))
    const [row] = await db.select().from(supportTicket).where(eq(supportTicket.email, `ann.${tag}@example.com`))
    expect((await api('', 'GET', '/admin/support')).status).toBe(401)
    expect((await api(u.cookie, 'GET', '/admin/support')).status).toBe(403)
    expect((await api(u.cookie, 'GET', `/admin/support/${row!.id}/files/0`)).status).toBe(403) // a customer cannot open another person's screenshot
    const list = (await json(await api(o.cookie, 'GET', '/admin/support?status=new'))).data
    const mine = list.items.find((i: { id: string }) => i.id === row!.id)
    expect(mine).toMatchObject({ email: `ann.${tag}@example.com`, signedIn: false }); expect(mine.files).toEqual([{ index: 0, name: 'shot.png', mime: 'image/png', bytes: PNG.length }])
    expect(list.counts.new).toBeGreaterThanOrEqual(1)
    const img = await api(o.cookie, 'GET', `/admin/support/${row!.id}/files/0`)
    expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/png'); expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG)
    expect((await api(o.cookie, 'GET', `/admin/support/${row!.id}/files/5`)).status).toBe(404)
    expect((await api(o.cookie, 'PATCH', `/admin/support/${row!.id}`, { status: 'resolved' })).status).toBe(200)
    expect((await json(await api(o.cookie, 'GET', '/admin/support?status=new'))).data.items.some((i: { id: string }) => i.id === row!.id)).toBe(false)
    expect((await json(await api(o.cookie, 'GET', '/admin/support?status=resolved'))).data.items.some((i: { id: string }) => i.id === row!.id)).toBe(true)
    expect((await api(o.cookie, 'PATCH', `/admin/support/${row!.id}`, { status: 'nope' })).status).toBe(400)
    expect((await api(o.cookie, 'DELETE', `/admin/support/${row!.id}`)).status).toBe(200)
    expect((await api(o.cookie, 'DELETE', `/admin/support/${row!.id}`)).status).toBe(404)
  })
})
