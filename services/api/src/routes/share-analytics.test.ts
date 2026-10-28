import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { presentationMember, shareLink, shareView, user } from '../db/schema.ts'
import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'
import { MAX_VIEWS_PER_DECK, RETENTION_DAYS, deviceOf, isBot, countryOf, purgeOldShareViews, referrerHost, visitorHash } from './share-analytics.ts'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const vid = (n = 'a') => `${n}`.padEnd(20, 'x')
const call = (path: string, body: unknown, o: { ua?: string; cookie?: string; headers?: Record<string, string> } = {}) =>
  app.request(`/api/v1/public${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': o.ua ?? UA, ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers ?? {}) }, body: JSON.stringify(body) })

/** an owner (Pro) with a 4-slide deck and a live link */
async function shared(plan: 'starter' | 'pro' = 'pro') {
  const owner = await signUp('san'); if (plan !== 'starter') await setPlan(owner.id, plan)
  const deck = await makeDeck(owner.id, 4)
  const made = await json(await api(owner.cookie, 'POST', `/presentations/${deck.id}/share`))
  const token = made.data.url.split('/s/')[1] as string
  const slides = deck.doc.slides.map((s) => s.id)
  const start = async (v = vid(), o: Parameters<typeof call>[2] & { referrer?: string; vw?: number } = {}) => json(await call(`/share/${token}/analytics/start`, { vid: v, ...(o.referrer ? { referrer: o.referrer } : {}), ...(o.vw ? { vw: o.vw } : {}) }, o))
  const ping = (viewId: string, v: string, list: { id: string; ms: number }[], o: Parameters<typeof call>[2] = {}) => call(`/share/${token}/analytics/ping`, { viewId, vid: v, slides: list }, o)
  const rows = () => db.select().from(shareView).where(eq(shareView.presentationId, deck.id))
  const dash = async (days = 30) => (await json(await api(owner.cookie, 'GET', `/presentations/${deck.id}/analytics?days=${days}`))).data
  return { owner, deck, token, slides, start, ping, rows, dash }
}
/** make a visit look as if it began `ms` ago (so a report can claim that much time) */
const backdate = (id: string, ms: number) => db.update(shareView).set({ startedAt: new Date(Date.now() - ms), lastSeenAt: new Date(Date.now() - ms) }).where(eq(shareView.id, id))

describe('share analytics: what counts as a view', () => {
  it('B1/B4 a visitor opening the link is one view; two browsers are two visitors; the owner\'s dashboard shows both', async () => {
    const t = await shared()
    const a = await t.start(vid('a')), b = await t.start(vid('b'))
    expect(a.data.viewId).toBeTruthy(); expect(b.data.viewId).toBeTruthy(); expect(a.data.viewId).not.toBe(b.data.viewId)
    const d = await t.dash(); expect(d.totals).toMatchObject({ views: 2, visitors: 2 })
  })
  it('B2/B3 the same visitor within 30 minutes is the same visit; after 30 minutes it is a new view but still one visitor', async () => {
    const t = await shared()
    const a1 = (await t.start(vid('a'))).data.viewId, a2 = (await t.start(vid('a'))).data.viewId
    expect(a2).toBe(a1); expect(await t.rows()).toHaveLength(1)
    await db.update(shareView).set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) }).where(eq(shareView.id, a1))
    const a3 = (await t.start(vid('a'))).data.viewId; expect(a3).not.toBe(a1)
    expect((await t.dash()).totals).toMatchObject({ views: 2, visitors: 1 })
  })
  it('B5 the owner and a collaborator opening their own link are not counted', async () => {
    const t = await shared(); const friend = await signUp('sanf'); const fe = (await db.select().from(user).where(eq(user.id, friend.id)))[0]!.email
    await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/members`, { email: fe })
    const tok = (await db.select().from(presentationMember).where(eq(presentationMember.presentationId, t.deck.id)))[0]!.token
    expect((await api(friend.cookie, 'POST', `/invites/${tok}/accept`)).status).toBe(200)
    expect((await t.start(vid('o'), { cookie: t.owner.cookie })).data).toMatchObject({ viewId: null, ignored: 'own' })
    expect((await t.start(vid('f'), { cookie: friend.cookie })).data).toMatchObject({ viewId: null, ignored: 'own' })
    const stranger = await signUp('sans'); expect((await t.start(vid('s'), { cookie: stranger.cookie })).data.viewId).toBeTruthy() // a signed-in stranger is a real viewer
    expect(await t.rows()).toHaveLength(1)
  })
  it('B6 robots and link previews are not counted', async () => {
    const t = await shared()
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Slackbot-LinkExpanding 1.0', 'WhatsApp/2.23', 'curl/8.4.0', 'facebookexternalhit/1.1', 'python-requests/2.31', '']) {
      const r = await t.start(vid('r'), { ua }); expect(r.data.viewId, ua).toBeNull()
    }
    expect(await t.rows()).toHaveLength(0)
    expect(isBot(UA)).toBe(false); expect(isBot(undefined)).toBe(true)
  })
  it('B7 a password-protected link is only counted with the proof of the password', async () => {
    const t = await shared()
    await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/share`) // already live; set the password by recreating
    await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/share`)
    const made = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/share`, { password: 'secret-pass' })); const token = made.data.url.split('/s/')[1]
    expect((await call(`/share/${token}/analytics/start`, { vid: vid() })).status).toBe(404) // no proof → nothing recorded
    const unlock = await json(await call(`/share/${token}/unlock`, { password: 'secret-pass' })); const access = unlock.data.access
    const ok = await call(`/share/${token}/analytics/start`, { vid: vid() }, { headers: { 'x-share-access': access } })
    expect(ok.status).toBe(200); expect(await t.rows()).toHaveLength(1)
  })
  it('B8 expired, turned-off links, made-up tokens and deleted decks create nothing', async () => {
    const t = await shared()
    expect((await call('/share/notATokenAtAll/analytics/start', { vid: vid() })).status).toBe(404)
    expect((await call(`/share/${'A'.repeat(32)}/analytics/start`, { vid: vid() })).status).toBe(404)
    await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLink.token, t.token))
    expect((await call(`/share/${t.token}/analytics/start`, { vid: vid() })).status).toBe(404)
    await db.update(shareLink).set({ expiresAt: null, revokedAt: new Date() }).where(eq(shareLink.token, t.token))
    expect((await call(`/share/${t.token}/analytics/start`, { vid: vid() })).status).toBe(404)
    expect(await t.rows()).toHaveLength(0)
  })
  it('helpers: device class, country header, referrer host, visitor hash differs per presentation', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17)', 1200)).toBe('phone'); expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17)', 1200)).toBe('tablet')
    expect(deviceOf(UA, 390)).toBe('phone'); expect(deviceOf(UA, 800)).toBe('tablet'); expect(deviceOf(UA, 1440)).toBe('computer'); expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile', undefined)).toBe('phone')
    const h = (v: string) => (n: string) => (n === 'cf-ipcountry' ? v : undefined)
    expect(countryOf(h('in'))).toBe('IN'); expect(countryOf(h('XX'))).toBeNull(); expect(countryOf(h('India'))).toBeNull(); expect(countryOf(() => undefined)).toBeNull()
    expect(referrerHost('https://www.LinkedIn.com/feed/x?y=1')).toBe('linkedin.com'); expect(referrerHost('not a url')).toBeNull(); expect(referrerHost('javascript:alert(1)')).toBeNull(); expect(referrerHost('http://localhost:3001/edit/x')).toBeNull()
    expect(visitorHash('deckA', vid())).not.toBe(visitorHash('deckB', vid())); expect(visitorHash('deckA', vid())).toBe(visitorHash('deckA', vid())); expect(visitorHash('deckA', vid())).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('share analytics: slide-level measures', () => {
  it('C1/C2/C3/C7 time per slide, reach, drop-off, completion and "furthest slide" from real-looking visits', async () => {
    const t = await shared(); const [s1, s2, s3, s4] = t.slides as [string, string, string, string]
    // visitor A: stops at slide 1 (4 s). B: slide 1 → 2, back to 1 (3 s, 2 s, 1 s). C: reads all four.
    const a = (await t.start(vid('a'))).data.viewId; await backdate(a, 20_000)
    await t.ping(a, vid('a'), [{ id: s1, ms: 4000 }])
    const b = (await t.start(vid('b'))).data.viewId; await backdate(b, 20_000)
    await t.ping(b, vid('b'), [{ id: s1, ms: 3000 }, { id: s2, ms: 2000 }]); await t.ping(b, vid('b'), [{ id: s1, ms: 1000 }])
    const c = (await t.start(vid('c'))).data.viewId; await backdate(c, 60_000)
    await t.ping(c, vid('c'), [{ id: s1, ms: 5000 }, { id: s2, ms: 5000 }, { id: s3, ms: 5000 }, { id: s4, ms: 5000 }])
    const d = await t.dash()
    expect(d.totals).toMatchObject({ views: 3, visitors: 3, completionPct: 33.3, avgSlidesSeen: 2.3 })
    expect(d.slides.map((x: any) => x.reachPct)).toEqual([100, 66.7, 33.3, 33.3])
    expect(d.slides[0]).toMatchObject({ avgSeconds: 4.3, leftHerePct: 33.3 }) // (4 + 4 + 5) / 3
    expect(d.slides[1]).toMatchObject({ leftHerePct: 33.3 }); expect(d.slides[3].leftHerePct).toBe(0) // the last slide is "completed", not "left here"
    expect(d.totals.avgSeconds).toBe(Math.round((4 + 6 + 20) / 3 * 10) / 10)
  })
  it('C9 forged reports: negative / huge / NaN times, made-up slide ids, a wrong visitor id, another link\'s view id — clipped or refused, totals cannot be inflated', async () => {
    const t = await shared(); const o = await shared()
    const a = (await t.start(vid('a'))).data.viewId; await backdate(a, 10_000)
    const bad = (body: any) => call(`/share/${t.token}/analytics/ping`, body)
    expect((await bad({ viewId: a, vid: vid('zzz'), slides: [{ id: t.slides[0], ms: 1000 }] })).status).toBe(404) // not this visitor
    const other = (await o.start(vid('a'))).data.viewId
    expect((await bad({ viewId: other, vid: vid('a'), slides: [{ id: t.slides[0], ms: 1000 }] })).status).toBe(404) // a view of another presentation
    expect((await bad({ viewId: a, vid: vid('a'), slides: [{ id: t.slides[0], ms: Number.NaN }] })).status).toBe(400)
    expect((await bad({ viewId: a, vid: vid('a'), slides: Array.from({ length: 41 }, () => ({ id: t.slides[0], ms: 1 })) })).status).toBe(400)
    await t.ping(a, vid('a'), [{ id: 'made-up-slide', ms: 5000 }, { id: t.slides[0]!, ms: -5000 }, { id: t.slides[1]!, ms: 999_999_999 }])
    const row = (await t.rows())[0]!
    expect(row.slideMs['made-up-slide']).toBeUndefined(); expect(row.slideMs[t.slides[0]!]).toBe(0)
    expect(row.durationMs).toBeLessThanOrEqual(10_000 + 12_000 + 500) // no more than the time that has really passed (+ slack), even though 60 s was claimed
    expect(row.slideMs[t.slides[1]!]).toBeLessThanOrEqual(60_000)
    // flooding with claims cannot push the total past the real elapsed time
    for (let i = 0; i < 5; i++) await t.ping(a, vid('a'), [{ id: t.slides[2]!, ms: 60_000 }])
    expect((await t.rows())[0]!.durationMs).toBeLessThanOrEqual(10_000 + 12_000 + 500)
  })
  it('C6 the last report of a visit arrives as a plain-text body (what sendBeacon sends while a tab closes), also with the password proof inside the body', async () => {
    const t = await shared(); const a = (await t.start(vid('a'))).data.viewId; await backdate(a, 30_000)
    const beacon = (token: string, body: unknown, ct = 'text/plain;charset=UTF-8') => app.request(`/api/v1/public/share/${token}/analytics/ping`, { method: 'POST', headers: { 'Content-Type': ct, 'user-agent': UA }, body: typeof body === 'string' ? body : JSON.stringify(body) })
    expect((await beacon(t.token, { viewId: a, vid: vid('a'), slides: [{ id: t.slides[0]!, ms: 4000 }] })).status).toBe(200)
    expect((await t.rows())[0]!.slideMs[t.slides[0]!]).toBe(4000)
    expect((await beacon(t.token, 'not json at all')).status).toBe(400); expect((await beacon(t.token, { viewId: a })).status).toBe(400)
    // a password link: no header is possible, so the proof rides in the body
    await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/share`)
    const made = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/share`, { password: 'secret-pass' })); const token = made.data.url.split('/s/')[1]
    const access = (await json(await call(`/share/${token}/unlock`, { password: 'secret-pass' }))).data.access
    const pv = (await json(await call(`/share/${token}/analytics/start`, { vid: vid('p') }, { headers: { 'x-share-access': access } }))).data.viewId; await backdate(pv, 20_000)
    expect((await beacon(token, { viewId: pv, vid: vid('p'), slides: [{ id: t.slides[0]!, ms: 3000 }] })).status).toBe(404) // no proof
    expect((await beacon(token, { viewId: pv, vid: vid('p'), slides: [{ id: t.slides[0]!, ms: 3000 }], access })).status).toBe(200)
    expect((await beacon(token, { viewId: pv, vid: vid('p'), slides: [{ id: t.slides[0]!, ms: 1000 }], access: 'forged-proof' })).status).toBe(404)
  })
  it('F4 several reports at the same moment add up (no lost updates)', async () => {
    const t = await shared(); const a = (await t.start(vid('a'))).data.viewId; await backdate(a, 120_000)
    await Promise.all(Array.from({ length: 8 }, () => t.ping(a, vid('a'), [{ id: t.slides[0]!, ms: 2000 }])))
    expect((await t.rows())[0]!.slideMs[t.slides[0]!]).toBe(16_000)
  })
  it('C8 slides removed after a visit keep their time under "removed slides"; the table follows the deck as it is now', async () => {
    const t = await shared(); const a = (await t.start(vid('a'))).data.viewId; await backdate(a, 60_000)
    await t.ping(a, vid('a'), [{ id: t.slides[0]!, ms: 3000 }, { id: t.slides[3]!, ms: 7000 }])
    const row = (await t.rows())[0]!
    await db.update(shareView).set({ slideMs: { ...row.slideMs, 'deleted-slide-id': 5000 } }).where(eq(shareView.id, row.id))
    const d = await t.dash(); expect(d.slides).toHaveLength(4); expect(d.removedSlidesSeconds).toBe(5)
  })
})

describe('share analytics: privacy, access and housekeeping', () => {
  it('A3/A4 Starter sees only the total; collaborators, strangers and signed-out visitors cannot read analytics', async () => {
    const t = await shared('starter'); const a = (await t.start(vid('a'))).data.viewId; expect(a).toBeTruthy()
    const d = await t.dash(); expect(d).toEqual({ detail: false, totalViews: 1, lastViewedAt: expect.any(String) })
    const pro = await shared(); const stranger = await signUp('sana')
    expect((await api(stranger.cookie, 'GET', `/presentations/${pro.deck.id}/analytics`)).status).toBe(404)
    expect((await app.request(`/api/v1/presentations/${pro.deck.id}/analytics`)).status).toBe(401)
    expect((await api(stranger.cookie, 'DELETE', `/presentations/${pro.deck.id}/analytics`)).status).toBe(404)
  })
  it('A5 a deck nobody opened gives zeros and no error; the share summary has views and last view', async () => {
    const t = await shared(); const d = await t.dash()
    expect(d.totals).toMatchObject({ views: 0, visitors: 0, avgSeconds: 0, completionPct: 0 }); expect(d.recent).toEqual([]); expect(d.daily).toHaveLength(30)
    expect((await json(await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}/share`))).data).toMatchObject({ views: 0, lastViewedAt: null })
    await t.start(vid('a')); expect((await json(await api(t.owner.cookie, 'GET', `/presentations/${t.deck.id}/share`))).data).toMatchObject({ views: 1, lastViewedAt: expect.any(String) })
  })
  it('D1 nothing personal is stored: the row has no IP, user-agent or raw visitor id, and the hash is the same on re-visits but not across decks', async () => {
    const t = await shared(); const o = await shared()
    await t.start(vid('a'), { referrer: 'https://news.example.org/post/1?utm=x', vw: 1440, headers: { 'cf-ipcountry': 'IN', 'x-forwarded-for': '203.0.113.9' } })
    const row = (await t.rows())[0]!
    expect(Object.keys(row).sort()).toEqual(['completed', 'country', 'device', 'durationMs', 'id', 'lastSeenAt', 'linkId', 'maxSlide', 'presentationId', 'referrerHost', 'slideCount', 'slideMs', 'startedAt', 'visitorHash'])
    expect(JSON.stringify(row)).not.toMatch(/203\.0\.113|Mozilla|Macintosh|AppleWebKit|aaaaaaaa/)
    expect(row).toMatchObject({ country: 'IN', referrerHost: 'news.example.org', device: 'computer', slideCount: 4 })
    await o.start(vid('a')); expect((await o.rows())[0]!.visitorHash).not.toBe(row.visitorHash)
  })
  it('D3/D4/D6/D7 clearing deletes every visit; a new link keeps counting for the deck; duplicate starts empty; deleting the deck deletes the visits', async () => {
    const t = await shared(); await t.start(vid('a')); await t.start(vid('b'))
    await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/share`)
    const again = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/share`)); const token2 = again.data.url.split('/s/')[1]
    expect(token2).not.toBe(t.token)
    expect((await call(`/share/${t.token}/analytics/start`, { vid: vid('c') })).status).toBe(404) // the old link is dead
    expect((await call(`/share/${token2}/analytics/start`, { vid: vid('c') })).status).toBe(200)
    expect((await t.dash()).totals.views).toBe(3) // old visits stay on the deck
    const copy = await json(await api(t.owner.cookie, 'POST', `/presentations/${t.deck.id}/duplicate`))
    expect((await json(await api(t.owner.cookie, 'GET', `/presentations/${copy.data.id}/analytics`))).data.totalViews).toBe(0)
    expect((await json(await api(t.owner.cookie, 'DELETE', `/presentations/${t.deck.id}/analytics`))).data.cleared).toBe(3)
    expect(await t.rows()).toHaveLength(0)
    await t.start(vid('z')).catch(() => {})
  })
  it('D5 visits older than the retention period are deleted by the clean-up, newer ones stay', async () => {
    const t = await shared(); const old = (await t.start(vid('old'))).data.viewId; await t.start(vid('new'))
    await db.update(shareView).set({ lastSeenAt: new Date(Date.now() - (RETENTION_DAYS + 1) * 86_400_000) }).where(eq(shareView.id, old))
    await purgeOldShareViews(); expect(await t.rows()).toHaveLength(1)
  })
})

describe('share analytics: dashboard numbers and limits', () => {
  it('E1/E2/E4/E5 daily chart, range filter, sources, countries, devices and recent visits are computed from the visits', async () => {
    const t = await shared()
    await t.start(vid('a'), { referrer: 'https://www.linkedin.com/feed', vw: 1440, headers: { 'cf-ipcountry': 'IN' } })
    await t.start(vid('b'), { referrer: 'https://mail.example.com/x', vw: 390, headers: { 'cf-ipcountry': 'US' } })
    await t.start(vid('c'), { vw: 1440 })
    const old = (await t.start(vid('d'), { vw: 800 })).data.viewId; await db.update(shareView).set({ startedAt: new Date(Date.now() - 20 * 86_400_000), lastSeenAt: new Date(Date.now() - 20 * 86_400_000) }).where(eq(shareView.id, old))
    const d30 = await t.dash(30), d7 = await t.dash(7)
    expect(d30.totals.views).toBe(4); expect(d7.totals.views).toBe(3)
    expect(d30.daily).toHaveLength(30); expect(d7.daily).toHaveLength(7); expect(d30.daily.reduce((n: number, x: any) => n + x.views, 0)).toBe(4)
    expect(d7.sources.map((x: any) => x.name).sort()).toEqual(['Direct', 'linkedin.com', 'mail.example.com']); expect(d7.countries.map((x: any) => x.name).sort()).toEqual(['IN', 'US'])
    expect(Object.fromEntries(d7.devices.map((x: any) => [x.name, x.views]))).toEqual({ computer: 2, phone: 1 })
    expect(d7.recent).toHaveLength(3); expect(d7.recent[0].at >= d7.recent[2].at).toBe(true)
    expect(JSON.stringify(d7.recent)).not.toMatch(/visitor|hash|203\.|Mozilla/)
    expect((await t.dash(999)).days).toBe(30) // an unknown range falls back
  })
  it('F2 at 20,000 recorded visits a deck stops recording new ones (the viewer is unaffected) and the owner is told', async () => {
    const t = await shared()
    const link = (await db.select().from(shareLink).where(eq(shareLink.token, t.token)))[0]!
    const chunk = Array.from({ length: 5000 }, (_, i) => ({ id: `cap${i}`, presentationId: t.deck.id, linkId: link.id, visitorHash: `h${i}`.padEnd(32, '0') }))
    for (let k = 0; k < MAX_VIEWS_PER_DECK / 5000; k++) await db.insert(shareView).values(chunk.map((r, i) => ({ ...r, id: `c${k}_${i}` })))
    const r = await t.start(vid('late')); expect(r.data).toMatchObject({ viewId: null, ignored: 'limit' })
    expect((await app.request(`/api/v1/public/share/${t.token}`)).status).toBe(200) // the deck still opens
    const t0 = Date.now(); const d = await t.dash(90); expect(Date.now() - t0).toBeLessThan(8000); expect(d.capped).toBe(true)
  }, 60_000)
  it('F1 a flood of start calls from one address is slowed with a plain answer', async () => {
    const t = await shared(); let limited = 0
    for (let i = 0; i < 70; i++) { const r = await call(`/share/${t.token}/analytics/start`, { vid: vid(`f${i}`) }, { headers: { 'x-forwarded-for': '198.51.100.7' } }); if (r.status === 429) limited++ }
    expect(limited).toBeGreaterThan(0)
  })
})


