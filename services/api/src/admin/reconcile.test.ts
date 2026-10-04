import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, cloudBalanceCheckin, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { api, json, signUp } from '../test-utils.ts'
import { parseRows } from './gcp.ts'

/** Private window in the year 2000+ (random per run) — nothing else writes there, so sums are exact on the shared test DB. */
const DAY = 864e5
const base = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 8000) * DAY
const at = (h: number) => new Date(base + h * 3600e3)
let admin: { id: string; cookie: string }, normal: { id: string; cookie: string }
const created: string[] = []
const events: string[] = []

beforeAll(async () => {
  admin = await signUp('rec-admin'); normal = await signUp('rec-user')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
})
afterAll(async () => {
  if (created.length) await db.delete(cloudBalanceCheckin).where(inArray(cloudBalanceCheckin.id, created))
  if (events.length) await db.delete(aiUsageEvent).where(inArray(aiUsageEvent.id, events)).catch(() => {}) // the ledger is immutable by trigger: best effort
  await db.delete(user).where(inArray(user.id, [admin.id, normal.id]))
})

const post = (body: unknown, c = admin.cookie) => api(c, 'POST', '/admin/cloud/checkins', body)

describe('Google Cloud reconciliation', () => {
  it('compares the console burn between two readings with what the ledger recorded (INR)', async () => {
    const ra = await json(await post({ amount: 28663.51, readAt: at(1).toISOString(), note: 'start of day' })), rb = await json(await post({ amount: 28181.8, readAt: at(11).toISOString() }))
    created.push(ra.data.id, rb.data.id)
    const id = nanoid(); events.push(id)
    await db.insert(aiUsageEvent).values({ id, userId: null, provider: 'vertex', model: 'm', requestType: 'slide_content', latencyMs: 1, status: 'success', providerCostUsd: '1.5', environment: 'development', createdAt: at(5) })

    const r = (await json(await api(admin.cookie, 'GET', '/admin/cloud'))).data
    const w = r.windows.find((x: { from: string }) => new Date(x.from).getTime() === at(1).getTime())
    expect(w.providerBurnInr).toBeCloseTo(481.71, 2)
    expect(w.ledgerInr).toBeCloseTo(1.5 * env.INR_PER_USD, 2)
    expect(w.unexplainedInr).toBeCloseTo(481.71 - 1.5 * env.INR_PER_USD, 2)
    expect(w.coverage).toBeCloseTo((1.5 * env.INR_PER_USD) / 481.71, 3)
    expect(w.calls).toBe(1)
    expect(r.connector.configured).toBe(false)
    expect(r.connector.setup.length).toBeGreaterThan(2)
  })

  it('a reading that did not drop gives no coverage figure (no division by zero)', async () => {
    const x = await json(await post({ amount: 100, readAt: at(20).toISOString() })), y = await json(await post({ amount: 100, readAt: at(21).toISOString() }))
    created.push(x.data.id, y.data.id)
    const r = (await json(await api(admin.cookie, 'GET', '/admin/cloud'))).data
    const w = r.windows.find((q: { from: string }) => new Date(q.from).getTime() === at(20).getTime())
    expect(w.coverage).toBeNull()
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/)
  })

  it('validates input, refuses future readings, and deleting a reading works once', async () => {
    expect((await post({ amount: -5 })).status).toBe(400)
    expect((await post({ amount: 10, readAt: new Date(Date.now() + 864e5).toISOString() })).status).toBe(400)
    const c = await json(await post({ amount: 7, readAt: at(30).toISOString() })); created.push(c.data.id)
    expect((await api(admin.cookie, 'DELETE', `/admin/cloud/checkins/${c.data.id}`)).status).toBe(200)
    expect((await api(admin.cookie, 'DELETE', `/admin/cloud/checkins/${c.data.id}`)).status).toBe(404)
  })

  it('only the owner can read or write, and /billed explains setup when the connector is off', async () => {
    expect((await api(normal.cookie, 'GET', '/admin/cloud')).status).toBe(403)
    expect((await post({ amount: 1 }, normal.cookie)).status).toBe(403)
    const b = (await json(await api(admin.cookie, 'GET', '/admin/cloud/billed'))).data
    expect(b).toMatchObject({ configured: false, rows: [] })
    expect(b.setup.join(' ')).toContain('BigQuery')
  })
})

describe('BigQuery billing-export parsing', () => {
  it('maps REST rows to numbers and nets credits (credits are negative)', () => {
    const rows = parseRows([{ name: 'day' }, { name: 'service' }, { name: 'sku' }, { name: 'cost' }, { name: 'credits' }, { name: 'currency' }], [{ f: [{ v: '2026-10-03' }, { v: 'Vertex AI' }, { v: 'Gemini image output' }, { v: '120.5' }, { v: '-120.5' }, { v: 'INR' }] }])
    expect(rows).toEqual([{ day: '2026-10-03', service: 'Vertex AI', sku: 'Gemini image output', cost: 120.5, credits: -120.5, net: 0, currency: 'INR' }])
    expect(parseRows([], undefined)).toEqual([])
  })
})
