import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { review, user } from '../db/schema.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'

const GOOD = { rating: 5, body: 'It turned my notes into a clean deck in a couple of minutes.', displayName: 'Asha K', role: 'Teacher' }
const publicList = async () => (await json(await app.request('/api/v1/reviews'))).data
const makeAdmin = async () => { const a = await signUp('revadm'); await db.update(user).set({ role: 'admin' }).where(eq(user.id, a.id)); return a }

describe('reviews: only real customers, only after the owner approves', () => {
  it('the public list starts empty-safe and never shows pending or rejected reviews', async () => {
    const u = await signUp('rev'); await makeDeck(u.id)
    expect((await api(u.cookie, 'PUT', '/reviews/mine', GOOD)).status).toBe(200)
    const list = await publicList()
    expect(list.items.some((x: any) => x.name === 'Asha K')).toBe(false) // still pending
    const r = await app.request('/api/v1/reviews'); expect(r.headers.get('cache-control')).toMatch(/public/)
  })

  it('needs an account and at least one presentation', async () => {
    const none = await app.request('/api/v1/reviews/mine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(GOOD) })
    expect(none.status).toBe(401)
    const fresh = await signUp('rev')
    const r = await api(fresh.cookie, 'PUT', '/reviews/mine', GOOD)
    expect(r.status).toBe(403); expect((await json(r)).error.code).toBe('NEEDS_USAGE')
  })

  it('validates: rating 1-5, a real sentence, no links or e-mail addresses, control characters removed', async () => {
    const bads = [{ ...GOOD, rating: 0 }, { ...GOOD, rating: 6 }, { ...GOOD, rating: 4.5 }, { ...GOOD, body: 'too short' }, { ...GOOD, body: 'x'.repeat(601) }, { ...GOOD, displayName: 'A' }, { ...GOOD, body: 'Great, see https://spam.example now for deals' }, { ...GOOD, body: 'Great tool, mail me at bob@spam.example for more' }, { ...GOOD, role: 'visit www.spam.example' }]
    // the limiter (6 writes an hour per person) counts every attempt, so the cases are spread over a few people
    let u = await signUp('rev'); await makeDeck(u.id)
    for (const [k, bad] of bads.entries()) {
      if (k > 0 && k % 4 === 0) { u = await signUp('rev'); await makeDeck(u.id) }
      expect((await api(u.cookie, 'PUT', '/reviews/mine', bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400)
    }
    expect((await api(u.cookie, 'PUT', '/reviews/mine', { ...GOOD, body: 'A good\u0007 tool,\n\nreally   useful for me.' })).status).toBe(200)
    const mine = (await json(await api(u.cookie, 'GET', '/reviews/mine'))).data
    expect(mine.body).toBe('A good tool, really useful for me.')
  })

  it('owner approval puts it on the public list (name and role only, no e-mail); an edit sends it back to pending; deleting removes it', async () => {
    const u = await signUp('rev'); await makeDeck(u.id)
    const admin = await makeAdmin()
    await api(u.cookie, 'PUT', '/reviews/mine', { ...GOOD, displayName: 'Ravi P' })
    const pending = (await json(await api(admin.cookie, 'GET', '/admin/reviews?status=pending'))).data
    const row = pending.find((x: any) => x.displayName === 'Ravi P'); expect(row).toBeTruthy()
    expect((await api(admin.cookie, 'PATCH', `/admin/reviews/${row.id}`, { status: 'approved' })).status).toBe(200)
    const live = await publicList()
    const item = live.items.find((x: any) => x.name === 'Ravi P')
    expect(item).toMatchObject({ rating: 5, role: 'Teacher' })
    expect(JSON.stringify(live)).not.toMatch(/@example\.com/)
    expect(live.count).toBeGreaterThanOrEqual(1); expect(live.average).toBeGreaterThanOrEqual(1)
    await api(u.cookie, 'PUT', '/reviews/mine', { ...GOOD, displayName: 'Ravi P', body: 'Changed my mind after a week, still quite good for school decks.' })
    expect((await publicList()).items.some((x: any) => x.name === 'Ravi P')).toBe(false) // back to pending
    await api(admin.cookie, 'PATCH', `/admin/reviews/${row.id}`, { status: 'approved' })
    await api(u.cookie, 'DELETE', '/reviews/mine')
    expect((await publicList()).items.some((x: any) => x.name === 'Ravi P')).toBe(false)
  })

  it('moderation is owner-only', async () => {
    const u = await signUp('rev')
    expect((await api(u.cookie, 'GET', '/admin/reviews')).status).toBe(403)
    expect((await api(u.cookie, 'PATCH', '/admin/reviews/x', { status: 'approved' })).status).toBe(403)
  })
})
