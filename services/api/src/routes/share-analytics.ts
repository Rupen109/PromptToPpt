import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, gte, lt, max, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { getEntitlements } from '../billing/entitlements.ts'
import { db } from '../db/index.ts'
import { presentation, presentationMember, presentationVersion, shareView } from '../db/schema.ts'
import { env } from '../env.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { checkShareAccess } from '../security/passwords.ts'
import { expired, findLink } from './sharing.ts'

/**
 * Share-link analytics (C7). Two halves:
 *  · public: the viewer page reports that it was opened (`start`) and how long each slide was on screen (`ping`);
 *  · owner: the dashboard numbers (`GET /presentations/:id/analytics`) and "clear" (`DELETE`).
 * Nothing personal is stored (see the `share_view` table): no IP, no user-agent text, no cookie.
 */
export const SAME_VISIT_MS = 30 * 60_000
export const MAX_VIEWS_PER_DECK = 20_000
export const MAX_VISIT_MS = 4 * 3600_000
export const RETENTION_DAYS = 400
const MAX_ENTRY_MS = 60_000
const MAX_PING_ENTRIES = 40
/** a report may not claim more time than has really passed since the last one (plus this much slack for clocks and batching) */
const SLACK_MS = 12_000

const BOT = /bot\b|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|pinterest|skype|embedly|quora|vkshare|lighthouse|pingdom|uptime|curl\/|wget|python-requests|httpclient|postman|java\/|go-http|node-fetch|axios|okhttp|libwww|scrapy/i
export const isBot = (ua: string | undefined) => !ua || BOT.test(ua)

export type Device = 'phone' | 'tablet' | 'computer'
/** coarse class only; the user-agent text itself is never stored */
export function deviceOf(ua: string, viewportWidth: number | undefined): Device {
  if (/iPad|Tablet|Kindle|Silk|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet'
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'phone'
  const w = viewportWidth ?? 1280
  return w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'computer'
}

export const countryOf = (h: (n: string) => string | undefined): string | null => {
  const v = (h('cf-ipcountry') ?? h('cloudfront-viewer-country') ?? h('x-vercel-ip-country') ?? h('x-country-code') ?? '').toUpperCase()
  return /^[A-Z]{2}$/.test(v) && !['XX', 'T1', 'ZZ'].includes(v) ? v : null
}

/** the website the visitor came from, host only (`www.` dropped); our own pages and unusable values count as "direct" */
export function referrerHost(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const h = new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
    if (!h || h.length > 100 || !/^[a-z0-9.-]+$/.test(h)) return null
    const own = (() => { try { return new URL(env.EDITOR_URL).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } })()
    return h === own ? null : h
  } catch { return null }
}

/** One-way, per presentation: the same browser has a different hash on every deck, and the hash cannot be turned back into the id. */
export const visitorHash = (presentationId: string, vid: string) => createHmac('sha256', env.AUTH_SECRET).update(`share-visitor:${presentationId}:${vid}`).digest('hex').slice(0, 32)

const VID = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)

export const publicAnalytics = new Hono<AppEnv>()
const fine = (c: any, data: unknown) => { c.header('Cache-Control', 'no-store'); return c.json({ success: true, data }) }
const gone = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)

/** The owner and the people who edit the deck are looking at their own work: those visits are not counted. */
async function isInsider(userId: string | undefined, presentationId: string, ownerId: string): Promise<boolean> {
  if (!userId) return false
  if (userId === ownerId) return true
  const [m] = await db.select({ id: presentationMember.id }).from(presentationMember).where(and(eq(presentationMember.presentationId, presentationId), eq(presentationMember.userId, userId), eq(presentationMember.status, 'active')))
  return !!m
}

async function deckSlideIds(presentationId: string, version: number): Promise<string[]> {
  const [row] = await db.select({ slides: sql<{ id?: string }[]>`${presentationVersion.document}->'slides'` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, presentationId), eq(presentationVersion.version, version)))
  return (row?.slides ?? []).map((s) => s.id).filter((x): x is string => !!x)
}

/** a visit that may be recorded: the link works (not off, not expired, password proven) */
async function usableLink(c: any, token: string, accessFromBody?: string) {
  const found = await findLink(token)
  if (!found || expired(found.link)) return null
  if (found.link.passwordHash && !checkShareAccess(c.req.header('x-share-access') ?? accessFromBody, token, found.link.passwordHash)) return null
  return found
}

publicAnalytics.post('/share/:token/analytics/start', rateLimit({ windowMs: 60_000, max: 60 }), zValidator('json', z.object({ vid: VID, referrer: z.string().max(500).optional(), vw: z.number().int().min(0).max(20_000).optional() })), async (c) => {
  const token = c.req.param('token')
  const found = await usableLink(c, token)
  if (!found) return gone(c)
  if (isBot(c.req.header('user-agent'))) return fine(c, { viewId: null, ignored: 'robot' })
  const session = c.get('session')
  if (await isInsider(session?.user.id, found.p.id, found.p.userId)) return fine(c, { viewId: null, ignored: 'own' })
  const { vid, referrer, vw } = c.req.valid('json')
  const vh = visitorHash(found.p.id, vid)
  const now = new Date()
  const [again] = await db.select().from(shareView).where(and(eq(shareView.linkId, found.link.id), eq(shareView.visitorHash, vh), gte(shareView.lastSeenAt, new Date(now.getTime() - SAME_VISIT_MS)))).orderBy(desc(shareView.lastSeenAt)).limit(1)
  if (again) { await db.update(shareView).set({ lastSeenAt: now }).where(eq(shareView.id, again.id)); return fine(c, { viewId: again.id }) }
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(shareView).where(eq(shareView.presentationId, found.p.id))
  if (n >= MAX_VIEWS_PER_DECK) return fine(c, { viewId: null, ignored: 'limit' })
  const slideIds = await deckSlideIds(found.p.id, found.p.latestVersion)
  const id = nanoid(24)
  await db.insert(shareView).values({ id, presentationId: found.p.id, linkId: found.link.id, visitorHash: vh, startedAt: now, lastSeenAt: now, slideCount: slideIds.length, device: deviceOf(c.req.header('user-agent') ?? '', vw), country: countryOf((n2) => c.req.header(n2)), referrerHost: referrerHost(referrer) })
  if (Math.random() < 0.02) void db.delete(shareView).where(lt(shareView.lastSeenAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000))).catch(() => {})
  return fine(c, { viewId: id })
})

/** `access` = the password proof when it cannot travel as a header (a report sent while the tab closes cannot carry custom headers) */
const pingBody = z.object({ access: z.string().max(400).optional(), viewId: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/), vid: VID, slides: z.array(z.object({ id: z.string().min(1).max(64), ms: z.number().finite() })).max(MAX_PING_ENTRIES) })
// The body may be JSON or plain text holding JSON: `navigator.sendBeacon` with a plain-text body is the one way a browser reliably delivers a report while
// the tab is closing (a JSON request with custom headers needs a preflight, which a closing tab cannot finish).
publicAnalytics.post('/share/:token/analytics/ping', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
  const token = c.req.param('token')
  let raw: unknown
  try { raw = JSON.parse(await c.req.text()) } catch { return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid request' } }, 400) }
  const parsed = pingBody.safeParse(raw)
  if (!parsed.success) return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid request' } }, 400)
  const { viewId, vid, slides, access } = parsed.data
  const found = await usableLink(c, token, access)
  if (!found) return gone(c)
  const vh = visitorHash(found.p.id, vid)
  const order = await deckSlideIds(found.p.id, found.p.latestVersion)
  const ok = await db.transaction(async (tx) => {
    // the row is locked while it is updated, so two reports at the same moment add up instead of overwriting each other
    const [v] = await tx.select().from(shareView).where(and(eq(shareView.id, viewId), eq(shareView.presentationId, found.p.id), eq(shareView.linkId, found.link.id))).for('update')
    if (!v || v.visitorHash !== vh) return false
    const now = Date.now()
    const ms = { ...v.slideMs }
    let reached = v.maxSlide
    // time cannot be claimed faster than it passes: the visit's total may not exceed the time since it began (+ slack), nor 4 hours
    let room = Math.max(0, Math.min(now - v.startedAt.getTime() + SLACK_MS - v.durationMs, MAX_VISIT_MS - v.durationMs))
    let add = 0
    for (const s of slides) {
      const index = order.indexOf(s.id)
      if (index < 0 && !(s.id in ms)) continue // not a slide of this deck
      if (index >= 0) reached = Math.max(reached, index)
      const want = Math.max(0, Math.min(MAX_ENTRY_MS, Math.round(s.ms)))
      const take = Math.min(want, room)
      room -= take; add += take
      if (take > 0 || !(s.id in ms)) ms[s.id] = (ms[s.id] ?? 0) + take
    }
    const total = order.length
    await tx.update(shareView).set({ slideMs: ms, durationMs: v.durationMs + add, maxSlide: reached, slideCount: total || v.slideCount, completed: v.completed || (total > 0 && reached >= total - 1), lastSeenAt: new Date(now) }).where(eq(shareView.id, v.id))
    return true
  })
  return ok ? fine(c, { ok: true }) : gone(c)
})

// ─── owner ───────────────────────────────────────────────────────────────────
export const shareAnalytics = new Hono<AppEnv>()
shareAnalytics.use('*', requireAuth)
const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
const ownDeck = async (id: string, userId: string) => (await db.select({ id: presentation.id, v: presentation.latestVersion }).from(presentation).where(and(eq(presentation.id, id), eq(presentation.userId, userId), sql`${presentation.deletedAt} is null`)))[0]

const DAY = 86_400_000
const share = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0)

shareAnalytics.get('/:id/analytics', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
  const userId = c.get('session')!.user.id
  const deck = await ownDeck(c.req.param('id'), userId)
  if (!deck) return notFound(c)
  const days = [7, 30, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30
  const ent = await getEntitlements(userId)
  const [all] = await db.select({ n: count(), last: max(shareView.lastSeenAt) }).from(shareView).where(eq(shareView.presentationId, deck.id))
  const base = { totalViews: all?.n ?? 0, lastViewedAt: all?.last ? all.last.toISOString() : null }
  if (!ent.features.advancedSharing) return c.json({ success: true, data: { detail: false, ...base } })

  const since = new Date(Date.now() - days * DAY)
  const rows = await db.select().from(shareView).where(and(eq(shareView.presentationId, deck.id), gte(shareView.startedAt, since))).orderBy(desc(shareView.startedAt)).limit(MAX_VIEWS_PER_DECK)
  const order = await deckSlideIds(deck.id, deck.v)
  const views = rows.length
  const visitors = new Set(rows.map((r) => r.visitorHash)).size
  const timed = rows.filter((r) => r.durationMs > 0)
  const completed = rows.filter((r) => r.completed).length

  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const daily = new Map<string, { views: number; v: Set<string> }>()
  for (let i = days - 1; i >= 0; i--) daily.set(dayKey(new Date(Date.now() - i * DAY)), { views: 0, v: new Set() })
  for (const r of rows) { const e = daily.get(dayKey(r.startedAt)); if (e) { e.views++; e.v.add(r.visitorHash) } }

  const perSlide = order.map((id, i) => {
    const seen = rows.filter((r) => id in r.slideMs || r.maxSlide >= i)
    const ms = rows.reduce((n, r) => n + (r.slideMs[id] ?? 0), 0)
    const timedHere = rows.filter((r) => (r.slideMs[id] ?? 0) > 0).length
    return { slideId: id, index: i, reachPct: share(rows.filter((r) => r.maxSlide >= i).length, views), avgSeconds: timedHere ? Math.round(ms / timedHere / 100) / 10 : 0, leftHerePct: share(rows.filter((r) => r.maxSlide === i && !r.completed).length, views), views: seen.length }
  })
  const known = new Set(order)
  let removedMs = 0
  for (const r of rows) for (const [k, v] of Object.entries(r.slideMs)) if (!known.has(k)) removedMs += v

  const tally = <T,>(pick: (r: (typeof rows)[number]) => T | null, limit = 10) => { const m = new Map<T, number>(); for (const r of rows) { const k = pick(r); if (k !== null) m.set(k, (m.get(k) ?? 0) + 1) } return [...m].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, n]) => ({ name, views: n, pct: share(n, views) })) }
  return c.json({ success: true, data: {
    detail: true, days, ...base,
    totals: { views, visitors, avgSeconds: timed.length ? Math.round(timed.reduce((n, r) => n + r.durationMs, 0) / timed.length / 100) / 10 : 0, completionPct: share(completed, views), avgSlidesSeen: views ? Math.round((rows.reduce((n, r) => n + r.maxSlide + 1, 0) / views) * 10) / 10 : 0 },
    daily: [...daily].map(([date, e]) => ({ date, views: e.views, visitors: e.v.size })),
    slides: perSlide, removedSlidesSeconds: Math.round(removedMs / 100) / 10,
    devices: tally((r) => r.device), sources: tally((r) => r.referrerHost ?? 'Direct'), countries: tally((r) => r.country),
    recent: rows.slice(0, 50).map((r) => ({ at: r.startedAt.toISOString(), device: r.device, country: r.country, source: r.referrerHost ?? 'Direct', seconds: Math.round(r.durationMs / 100) / 10, slidesReached: r.maxSlide + 1, slideCount: r.slideCount, completed: r.completed })),
    capped: (all?.n ?? 0) >= MAX_VIEWS_PER_DECK,
  } })
})

/** "Clear analytics": every recorded visit of this deck, gone at once. */
shareAnalytics.delete('/:id/analytics', rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
  const deck = await ownDeck(c.req.param('id'), c.get('session')!.user.id)
  if (!deck) return notFound(c)
  const gone2 = await db.delete(shareView).where(eq(shareView.presentationId, deck.id)).returning({ id: shareView.id })
  return c.json({ success: true, data: { cleared: gone2.length } })
})

export const purgeOldShareViews = () => db.delete(shareView).where(lt(shareView.lastSeenAt, new Date(Date.now() - RETENTION_DAYS * DAY)))
