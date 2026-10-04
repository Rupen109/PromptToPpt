import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { afterAll, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { auditLog, creditBalance, featureFlag, user } from '../db/schema.ts'
import { csvCell } from './audit.ts'
import { FLAG_KEYS } from '../flags/registry.ts'
import { bucketOf, invalidateFlags, isFlagOn, resolveFlag, type FlagRow } from '../flags/flags.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

async function adminUser() {
  const u = await signUp('ctl')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id))
  return u
}
const setFlag = (cookie: string, key: string, body: Partial<{ enabled: boolean; rolloutPercent: number; plans: string[]; note: string }> = {}) =>
  api(cookie, 'PUT', `/admin/flags/${key}`, { enabled: true, rolloutPercent: 100, plans: [], ...body })
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance

// the test DB is shared and persists: always leave every flag at its code default
afterAll(async () => {
  await db.delete(featureFlag).where(inArray(featureFlag.key, FLAG_KEYS))
  invalidateFlags()
})

const row = (o: Partial<FlagRow> = {}): FlagRow => ({ key: 'ai_assistant', enabled: true, rolloutPercent: 100, plans: [], note: null, updatedBy: null, updatedAt: new Date(), ...o })

describe('non-admin and anonymous access', () => {
  it('401 anonymous / 403 normal user on every admin audit + flags route', async () => {
    const u = await signUp('ctl')
    const routes: [string, string][] = [['GET', '/admin/audit'], ['GET', '/admin/audit/export.csv'], ['GET', '/admin/flags'], ['PUT', '/admin/flags/exports'], ['DELETE', '/admin/flags/exports']]
    for (const [m, p] of routes) {
      expect((await app.request(`/api/v1${p}`, { method: m })).status).toBe(401)
      expect((await api(u.cookie, m, p, m === 'PUT' ? { enabled: false, rolloutPercent: 100, plans: [] } : undefined)).status).toBe(403)
    }
  })
})

describe('audit log', () => {
  it('filters, paginates, resolves actor emails, hides own reads by default', async () => {
    const admin = await adminUser()
    const actor = await signUp('aud')
    const ghost = `ghost-${rid()}` // deleted/unknown actor → shown by id
    const tag = rid()
    const now = Date.now()
    const mk = (actorUserId: string, action: string, minsAgo: number, meta: Record<string, unknown> = {}, ip: string | null = null) => ({ id: nanoid(), actorUserId, action, meta, ip, createdAt: new Date(now - minsAgo * 60_000) })
    await db.insert(auditLog).values([
      mk(actor.id, `flag.update.${tag}`, 5, { key: 'exports', marker: `needle-${tag}` }, '10.0.0.1'),
      mk(actor.id, `flag.reset.${tag}`, 4, {}, '10.0.0.2'),
      mk(actor.id, `billing.plan_changed.${tag}`, 3),
      mk(actor.id, `presentation.delete.${tag}`, 2),
      mk(ghost, `presentation.delete.${tag}`, 1),
      mk(actor.id, `old.${tag}`, 60 * 24 * 60), // 60 days ago: outside the default 30-day range
    ])
    const list = async (q: string) => (await json(await api(admin.cookie, 'GET', `/admin/audit?${q}`))).data
    const email = (await db.select({ e: user.email }).from(user).where(eq(user.id, actor.id)))[0]!.e

    const all = await list(`actor=${actor.id}`)
    expect(all.total).toBe(4) // the 60-day-old row is out of range
    expect(all.rows[0].action).toBe(`presentation.delete.${tag}`) // newest first
    expect(all.rows[0].actorEmail).toBe(email)
    expect((await list(`actor=${ghost}`)).rows[0]).toMatchObject({ actorUserId: ghost, actorEmail: null })
    expect((await list(`actor=${encodeURIComponent(email)}`)).total).toBe(4) // by email
    expect((await list(`actor=${actor.id}&action=flag.`)).total).toBe(2) // prefix
    expect((await list(`actor=${actor.id}&action=flag.reset.${tag}`)).total).toBe(1) // exact
    expect((await list(`actor=${actor.id}&q=needle-${tag}`)).total).toBe(1) // meta search
    expect((await list(`actor=${actor.id}&ip=10.0.0.2`)).rows.map((r: any) => r.action)).toEqual([`flag.reset.${tag}`])
    expect((await list(`actor=${actor.id}&from=${new Date(now - 90 * 864e5).toISOString()}`)).total).toBe(5)
    expect((await list(`actor=${actor.id}&q=${encodeURIComponent('%')}`)).total).toBe(0) // wildcards are literal

    const p1 = await list(`actor=${actor.id}&limit=3&offset=0`)
    const p2 = await list(`actor=${actor.id}&limit=3&offset=3`)
    expect(p1.rows).toHaveLength(3)
    expect(p2.rows).toHaveLength(1)
    expect(new Set([...p1.rows, ...p2.rows].map((r: any) => r.id)).size).toBe(4)
    expect((await api(admin.cookie, 'GET', '/admin/audit?limit=101')).status).toBe(400) // capped at 100

    expect(all.actions.find((a: any) => a.action === `presentation.delete.${tag}`).n).toBe(1)
    // facet ignores the action filter so the dropdown still lists everything
    expect((await list(`actor=${actor.id}&action=flag.`)).actions.length).toBe(4)
  })

  it('collapses its own audit reads unless asked', async () => {
    const admin = await adminUser()
    await api(admin.cookie, 'GET', '/admin/audit?limit=1')
    await api(admin.cookie, 'GET', '/admin/audit?limit=1')
    // (the admin middleware's rows use the DB clock, which on a non-UTC dev DB reads as the future: widen `to`)
    const later = new Date(Date.now() + 2 * 864e5).toISOString()
    const poll = async (q: string) => {
      for (let i = 0; i < 20; i++) {
        const d = (await json(await api(admin.cookie, 'GET', `/admin/audit?actor=${admin.id}&to=${later}&${q}`))).data
        if (d.rows.some((r: any) => r.action.startsWith('admin.audit')) || i === 19) return d
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    const shown = await poll('includeSelf=true')
    expect(shown.rows.some((r: any) => r.action.startsWith('admin.audit'))).toBe(true)
    const hidden = (await json(await api(admin.cookie, 'GET', `/admin/audit?actor=${admin.id}&to=${later}`))).data
    expect(hidden.rows.some((r: any) => r.action.startsWith('admin.audit'))).toBe(false)
  })

  it('CSV export escapes formula injection and quotes', async () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')

    const admin = await adminUser()
    const actor = `csv-${rid()}`
    await db.insert(auditLog).values({ id: nanoid(), actorUserId: actor, action: '=cmd|calc', meta: { note: 'x,y' }, ip: '@evil', createdAt: new Date() })
    const res = await api(admin.cookie, 'GET', `/admin/audit/export.csv?actor=${actor}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const lines = (await res.text()).trim().split('\r\n')
    expect(lines[0]).toBe('time,actor_id,actor_email,action,details,ip')
    expect(lines).toHaveLength(2)
    expect(lines[1]!).toContain(`,${actor},,'=cmd|calc,`)
    expect(lines[1]!.endsWith(",'@evil")).toBe(true)
    expect(lines[1]!).toContain('"{""note"":""x,y""}"')
  })
})

describe('flag resolution', () => {
  it('DB row beats the code default; unknown flags are 404', async () => {
    const admin = await adminUser()
    expect(resolveFlag('ai_assistant', undefined)).toBe(true) // code default ON
    expect(resolveFlag('maintenance_mode', undefined)).toBe(false) // code default OFF
    expect(resolveFlag('ai_assistant', row({ enabled: false }))).toBe(false)
    expect(resolveFlag('maintenance_mode', row({ key: 'maintenance_mode', enabled: true }))).toBe(true)
    expect((await setFlag(admin.cookie, 'nope')).status).toBe(404)
    expect((await api(admin.cookie, 'DELETE', '/admin/flags/nope')).status).toBe(404)
    expect((await setFlag(admin.cookie, 'exports', { rolloutPercent: 101 })).status).toBe(400)
    expect((await setFlag(admin.cookie, 'exports', { plans: ['platinum'] })).status).toBe(400)
    expect((await setFlag(admin.cookie, 'exports', { note: 'x'.repeat(201) })).status).toBe(400)
  })

  it('rollout buckets are stable and roughly proportional; no user is only in at 100%', () => {
    const ids = Array.from({ length: 3000 }, () => nanoid())
    const r30 = row({ rolloutPercent: 30 })
    const on = ids.filter((id) => resolveFlag('ai_assistant', r30, { userId: id }))
    expect(on.length / ids.length).toBeGreaterThan(0.26)
    expect(on.length / ids.length).toBeLessThan(0.34)
    for (const id of ids.slice(0, 200)) expect(resolveFlag('ai_assistant', r30, { userId: id })).toBe(resolveFlag('ai_assistant', r30, { userId: id })) // stable
    expect(bucketOf('u1', 'exports')).toBe(bucketOf('u1', 'exports'))
    expect(ids.some((id) => bucketOf(id, 'exports') !== bucketOf(id, 'ai_assistant'))).toBe(true) // per-flag buckets
    // monotonic: anyone in at 30% is in at 60%
    const r60 = row({ rolloutPercent: 60 })
    for (const id of on) expect(resolveFlag('ai_assistant', r60, { userId: id })).toBe(true)
    expect(resolveFlag('ai_assistant', row({ rolloutPercent: 0 }), { userId: 'x' })).toBe(false)
    expect(resolveFlag('ai_assistant', r30)).toBe(false)
    expect(resolveFlag('ai_assistant', row({ rolloutPercent: 100 }))).toBe(true)
  })

  it('plan restriction: only listed plans', () => {
    const r = row({ plans: ['pro', 'gold'] })
    expect(resolveFlag('ai_assistant', r, { userId: 'u', planId: 'starter' })).toBe(false)
    expect(resolveFlag('ai_assistant', r, { userId: 'u', planId: 'pro' })).toBe(true)
    expect(resolveFlag('ai_assistant', r, { userId: 'u' })).toBe(false)
  })

  it('a PUT takes effect immediately in this process (cache invalidated), with plan lookup from the DB', async () => {
    const admin = await adminUser()
    const pro = await signUp('ctl')
    await setPlan(pro.id, 'pro')
    const free = await signUp('ctl')
    expect(await isFlagOn('exports', { userId: pro.id })).toBe(true) // warms the cache
    expect((await setFlag(admin.cookie, 'exports', { enabled: false })).status).toBe(200)
    expect(await isFlagOn('exports', { userId: pro.id })).toBe(false)
    expect((await setFlag(admin.cookie, 'exports', { enabled: true, plans: ['pro'] })).status).toBe(200)
    expect(await isFlagOn('exports', { userId: pro.id })).toBe(true)
    expect(await isFlagOn('exports', { userId: free.id })).toBe(false)
    expect((await json(await api(free.cookie, 'GET', '/flags'))).data.exports).toBe(false)
    expect((await json(await api(pro.cookie, 'GET', '/flags'))).data.exports).toBe(true)
    const del = await json(await api(admin.cookie, 'DELETE', '/admin/flags/exports'))
    expect(del.data).toMatchObject({ key: 'exports', enabled: true, custom: false, plans: [] })
    expect(await isFlagOn('exports', { userId: free.id })).toBe(true)
  })
})

describe('admin flags API + public endpoint', () => {
  it('lists the registry merged with DB state, audits before/after, never leaks rules publicly', async () => {
    const admin = await adminUser()
    const u = await signUp('ctl')
    const note = `n-${rid()}`
    const put = await json(await setFlag(admin.cookie, 'ai_assistant', { enabled: true, rolloutPercent: 40, plans: ['gold'], note }))
    expect(put.data).toMatchObject({ key: 'ai_assistant', enabled: true, rolloutPercent: 40, plans: ['gold'], note, custom: true })
    const list = (await json(await api(admin.cookie, 'GET', '/admin/flags'))).data as any[]
    expect(list.map((f) => f.key).sort()).toEqual([...FLAG_KEYS].sort())
    const f = list.find((x) => x.key === 'ai_assistant')
    expect(f).toMatchObject({ default: true, enabled: true, effective: true, rolloutPercent: 40, plans: ['gold'], note })
    expect(f.updatedBy).toBeTruthy()
    expect(f.description).toBeTruthy()

    expect((await app.request('/api/v1/flags')).status).toBe(401)
    const res = await api(u.cookie, 'GET', '/flags')
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain(note)
    expect(text).not.toContain('rollout')
    expect(text).not.toContain('plans')
    const data = JSON.parse(text).data
    expect(Object.keys(data).sort()).toEqual([...FLAG_KEYS].sort())
    for (const v of Object.values(data)) expect(typeof v).toBe('boolean')

    await api(admin.cookie, 'DELETE', '/admin/flags/ai_assistant')
    for (let i = 0; i < 20; i++) {
      const rows = await db.select().from(auditLog).where(eq(auditLog.actorUserId, admin.id))
      if (rows.some((r) => r.action === 'flag.reset')) break
      await new Promise((r) => setTimeout(r, 50))
    }
    const rows = await db.select().from(auditLog).where(eq(auditLog.actorUserId, admin.id))
    const upd = rows.find((r) => r.action === 'flag.update')!
    expect(upd.meta).toMatchObject({ key: 'ai_assistant', before: { enabled: true, rolloutPercent: 100, custom: false }, after: { enabled: true, rolloutPercent: 40, plans: ['gold'], note } })
    expect(rows.find((r) => r.action === 'flag.reset')!.meta).toMatchObject({ key: 'ai_assistant', before: { rolloutPercent: 40 } })
  })
})

describe('enforcement', () => {
  const genBody = () => ({ prompt: 'A deck about the history of tea', idempotencyKey: `idem-${rid()}-${rid()}` })

  it('maintenance_mode: generation, analyze, ai-assist, ai-edit are refused with 503 MAINTENANCE and nothing is charged; the rest keeps working', async () => {
    const admin = await adminUser()
    const u = await signUp('ctl')
    await setPlan(u.id, 'gold')
    const { id: deckId, doc } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements') // grants the allowance
    expect((await setFlag(admin.cookie, 'maintenance_mode', { enabled: true })).status).toBe(200)
    const before = await balance(u.id)
    const refused = async (res: Response) => {
      expect(res.status).toBe(503)
      expect((await json(res)).error).toMatchObject({ code: 'MAINTENANCE' })
    }
    await refused(await api(u.cookie, 'POST', '/generation/jobs', genBody()))
    await refused(await api(u.cookie, 'POST', '/generation/analyze', { prompt: 'A deck about tea' }))
    await refused(await api(u.cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction: 'make it blue', scope: 'deck', requestId: `rq-${rid()}-${rid()}` }))
    await refused(await api(u.cookie, 'POST', `/presentations/${deckId}/ai-edit`, { slideId: doc.slides[1]!.id, command: 'shorten', requestId: `rq-${rid()}-${rid()}` }))
    expect(await balance(u.id)).toBe(before) // no credits charged or reserved
    expect((await json(await api(u.cookie, 'GET', '/flags'))).data.maintenance_mode).toBe(true)
    // everything else still works
    expect((await api(u.cookie, 'GET', `/presentations/${deckId}`)).status).toBe(200)
    expect((await api(u.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pdf' })).status).toBe(200)

    await api(admin.cookie, 'DELETE', '/admin/flags/maintenance_mode')
    const created = await api(u.cookie, 'POST', '/generation/jobs', genBody())
    expect(created.status).toBe(201)
    // the worker test shares this DB and takes the oldest queued job: never leave one behind
    expect((await api(u.cookie, 'POST', `/generation/jobs/${(await json(created)).data.id}/cancel`)).status).toBe(200)
  })

  it('ai_assistant off refuses ai-assist and ai-edit (FEATURE_DISABLED) without charging', async () => {
    const admin = await adminUser()
    const u = await signUp('ctl')
    await setPlan(u.id, 'gold')
    const { id: deckId, doc } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    await setFlag(admin.cookie, 'ai_assistant', { enabled: false })
    const before = await balance(u.id)
    const a = await api(u.cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction: 'make it blue', scope: 'deck', requestId: `rq-${rid()}-${rid()}` })
    expect(a.status).toBe(403)
    expect((await json(a)).error.code).toBe('FEATURE_DISABLED')
    const e = await api(u.cookie, 'POST', `/presentations/${deckId}/ai-edit`, { slideId: doc.slides[1]!.id, command: 'shorten', requestId: `rq-${rid()}-${rid()}` })
    expect(e.status).toBe(403)
    expect(await balance(u.id)).toBe(before)
    await api(admin.cookie, 'DELETE', '/admin/flags/ai_assistant')
  })

  it('image_generation off refuses the images route; exports off refuses exports', async () => {
    const admin = await adminUser()
    const u = await signUp('ctl')
    await setPlan(u.id, 'gold')
    const { id: deckId } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    await setFlag(admin.cookie, 'image_generation', { enabled: false })
    await setFlag(admin.cookie, 'exports', { enabled: false })
    const before = await balance(u.id)
    const img = await api(u.cookie, 'POST', `/presentations/${deckId}/images`, { prompt: 'a red car on a road', requestId: `img-${rid()}-${rid()}` })
    expect(img.status).toBe(403)
    expect((await json(img)).error).toMatchObject({ code: 'FEATURE_DISABLED', message: 'Image generation is switched off right now.' })
    expect((await json(await api(u.cookie, 'GET', `/presentations/${deckId}/images/usage`))).data.enabled).toBe(false)
    const ex = await api(u.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pptx' })
    expect(ex.status).toBe(403)
    expect((await json(ex)).error.code).toBe('FEATURE_DISABLED')
    expect(await balance(u.id)).toBe(before)
    await api(admin.cookie, 'DELETE', '/admin/flags/image_generation')
    await api(admin.cookie, 'DELETE', '/admin/flags/exports')
    expect((await api(u.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pdf' })).status).toBe(200)
  })

  it('presentation deletion is audited (ids only)', async () => {
    const u = await signUp('ctl')
    const { id } = await makeDeck(u.id)
    expect((await api(u.cookie, 'DELETE', `/presentations/${id}`)).status).toBe(200)
    for (let i = 0; i < 20; i++) {
      const rows = await db.select().from(auditLog).where(eq(auditLog.actorUserId, u.id))
      if (rows.length) return expect(rows[0]).toMatchObject({ action: 'presentation.delete', meta: { presentationId: id } })
      await new Promise((r) => setTimeout(r, 50))
    }
    expect.fail('no audit row written')
  })
})
