import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { presentationSchema, type Presentation } from '@prompttoppt/validation'
import { GateError } from '../billing/errors.ts'
import { getEntitlements, livePlanFor } from '../billing/entitlements.ts'
import { COLLABORATOR_LIMITS } from '../collab/access.ts'
import { kickUser } from '../live/bus.ts'
import { db } from '../db/index.ts'
import { presentation, presentationMember, presentationVersion, shareLink, shareView, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { audit, ipOf } from '../lib/audit.ts'
import { sendMail } from '../lib/mailer.ts'
import { byUser, clientIp, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { canonicalEmail } from '../security/email.ts'
import { record, recent } from '../security/auth-guard.ts'
import { checkShareAccess, hashSharePassword, issueShareAccess, verifySharePassword } from '../security/passwords.ts'

const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
const INVITE_TTL_MS = 14 * 24 * 3600_000
const shareUrl = (token: string) => `${env.EDITOR_URL.replace(/\/+$/, '')}/s/${token}`
const inviteUrl = (token: string) => `${env.EDITOR_URL.replace(/\/+$/, '')}/invite/${token}`

/** Owner-only: the deck must be this user's own (collaborators cannot share or invite). */
const ownDeck = async (id: string, userId: string) => (await db.select({ id: presentation.id, title: presentation.title }).from(presentation).where(and(eq(presentation.id, id), eq(presentation.userId, userId), isNull(presentation.deletedAt))))[0]

// ─── owner: view-only share link ───────────────────────────────────────────────────────────────────────────────────────
export const sharing = new Hono<AppEnv>()
sharing.use('*', requireAuth)

const EXPIRY_DAYS = z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).nullable()
const linkView = (l: typeof shareLink.$inferSelect | undefined) => ({ url: l ? shareUrl(l.token) : null, hasPassword: !!l?.passwordHash, expiresAt: l?.expiresAt ? l.expiresAt.toISOString() : null })
const liveLink = async (id: string) => (await db.select().from(shareLink).where(and(eq(shareLink.presentationId, id), isNull(shareLink.revokedAt))))[0]

/** Password and expiry are Pro / Gold features (`advancedSharing`); a plain view-only link is on every plan. */
async function assertAdvancedSharing(userId: string) {
  const ent = await getEntitlements(userId)
  if (!ent.features.advancedSharing) throw new GateError('UPGRADE_REQUIRED', 'Password-protected and expiring links are available on Pro and Gold.', 403, { feature: 'advancedSharing' })
}

sharing.get('/:id/share', async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  if (!(await ownDeck(id, userId))) return notFound(c)
  const [views] = await db.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${shareView.lastSeenAt})` }).from(shareView).where(eq(shareView.presentationId, id))
  return c.json({ success: true, data: { ...linkView(await liveLink(id)), views: views?.n ?? 0, lastViewedAt: views?.last ? new Date(views.last).toISOString() : null } })
})

const createBody = z.object({ password: z.string().min(6).max(72).optional(), expiresInDays: EXPIRY_DAYS.optional() }).optional()
sharing.post('/:id/share', rateLimit({ windowMs: 60_000, max: 20, key: byUser('share') }), async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  if (!(await ownDeck(id, userId))) return notFound(c)
  const parsed = createBody.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Password must be 6–72 characters; expiry 1, 7, 30 or 90 days.' } }, 400)
  const live = await liveLink(id)
  if (live) return c.json({ success: true, data: linkView(live) })
  const opts = parsed.data ?? {}
  if (opts.password || opts.expiresInDays) await assertAdvancedSharing(userId)
  const [made] = await db.insert(shareLink).values({
    id: nanoid(), presentationId: id, createdBy: userId, token: nanoid(32),
    ...(opts.password ? { passwordHash: hashSharePassword(opts.password) } : {}),
    ...(opts.expiresInDays ? { expiresAt: new Date(Date.now() + opts.expiresInDays * 86_400_000) } : {}),
  }).onConflictDoNothing().returning()
  void audit(userId, 'share.created', { presentationId: id, protected: !!opts.password, expires: !!opts.expiresInDays }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: linkView(made ?? (await liveLink(id))) }, 201)
})

/** Change the live link's protection: set / remove the password, set / clear the expiry. (The address stays the same.) */
sharing.patch('/:id/share', rateLimit({ windowMs: 60_000, max: 30, key: byUser('share') }), zValidator('json', z.object({ password: z.string().min(6).max(72).nullable().optional(), expiresInDays: EXPIRY_DAYS.optional() })), async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  if (!(await ownDeck(id, userId))) return notFound(c)
  const live = await liveLink(id)
  if (!live) return notFound(c)
  const b = c.req.valid('json')
  // turning protection ON needs the plan; turning it OFF never does (a downgraded owner must be able to open their own link up)
  if (typeof b.password === 'string' || typeof b.expiresInDays === 'number') await assertAdvancedSharing(userId)
  const set: Partial<typeof shareLink.$inferInsert> = {}
  if (b.password !== undefined) set.passwordHash = b.password === null ? null : hashSharePassword(b.password)
  if (b.expiresInDays !== undefined) set.expiresAt = b.expiresInDays === null ? null : new Date(Date.now() + b.expiresInDays * 86_400_000)
  if (Object.keys(set).length === 0) return c.json({ success: true, data: linkView(live) })
  const [row] = await db.update(shareLink).set(set).where(eq(shareLink.id, live.id)).returning()
  void audit(userId, 'share.updated', { presentationId: id, password: b.password === undefined ? 'unchanged' : b.password === null ? 'removed' : 'set', expiry: b.expiresInDays === undefined ? 'unchanged' : b.expiresInDays }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: linkView(row) })
})

sharing.delete('/:id/share', async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  if (!(await ownDeck(id, userId))) return notFound(c)
  await db.update(shareLink).set({ revokedAt: new Date() }).where(and(eq(shareLink.presentationId, id), isNull(shareLink.revokedAt)))
  void audit(userId, 'share.revoked', { presentationId: id }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: linkView(undefined) })
})

// ─── owner: collaborators ──────────────────────────────────────────────────────────────────────────────────────────────
const memberView = (m: typeof presentationMember.$inferSelect) => ({ id: m.id, email: m.email, status: m.status, role: m.role, createdAt: m.createdAt.toISOString(), expiresAt: m.status === 'pending' ? m.expiresAt.toISOString() : null })

sharing.get('/:id/members', async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  if (!(await ownDeck(id, userId))) return notFound(c)
  const rows = await db.select().from(presentationMember).where(eq(presentationMember.presentationId, id)).orderBy(asc(presentationMember.createdAt))
  const { plan } = await livePlanFor(userId)
  return c.json({ success: true, data: { members: rows.map(memberView), limit: plan.features.advancedSharing ? (COLLABORATOR_LIMITS[plan.id] ?? 0) : 0 } })
})

sharing.post('/:id/members', rateLimit({ windowMs: 3600_000, max: 20, key: byUser('invite') }), zValidator('json', z.object({ email: z.email().max(254) })), async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  const deck = await ownDeck(id, userId)
  if (!deck) return notFound(c)
  const ent = await getEntitlements(userId)
  if (!ent.features.advancedSharing) throw new GateError('UPGRADE_REQUIRED', 'Inviting people to edit together is available on Pro and Gold.', 403, { feature: 'collaboration' })
  const limit = COLLABORATOR_LIMITS[ent.plan.id] ?? 0
  const email = c.req.valid('json').email.trim()
  const canon = canonicalEmail(email)
  const me = c.get('session')!.user
  if (canon === canonicalEmail(me.email)) return c.json({ success: false, error: { code: 'INVALID_INVITE', message: "That's your own email — you already own this presentation." } }, 400)

  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`members:${id}`}))`) // serialise invites per deck so the limit cannot be overshot
    const rows = await tx.select().from(presentationMember).where(eq(presentationMember.presentationId, id))
    const existing = rows.find((r) => r.emailCanonical === canon)
    if (existing?.status === 'active') return { error: 'ALREADY_MEMBER' as const }
    if (!existing && rows.length >= limit) return { error: 'LIMIT' as const }
    const token = nanoid(32)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    if (existing) { // re-inviting a pending address refreshes the link (the old one stops working)
      const [m] = await tx.update(presentationMember).set({ token, expiresAt, email }).where(eq(presentationMember.id, existing.id)).returning()
      return { member: m! }
    }
    const [m] = await tx.insert(presentationMember).values({ id: nanoid(), presentationId: id, email, emailCanonical: canon, token, invitedBy: userId, expiresAt }).returning()
    return { member: m! }
  })
  if ('error' in out) {
    return out.error === 'ALREADY_MEMBER'
      ? c.json({ success: false, error: { code: 'ALREADY_MEMBER', message: 'That person can already edit this presentation.' } }, 409)
      : c.json({ success: false, error: { code: 'LIMIT_REACHED', message: `Your ${ent.plan.name} plan allows up to ${limit} collaborators per presentation.` } }, 429)
  }
  const m = out.member
  await sendMail({
    to: m.email,
    subject: `${me.name} invited you to edit "${deck.title}"`,
    text: `${me.name} invited you to edit the presentation "${deck.title}" on SlidesDone.\n\nOpen this link and sign in with ${m.email}:\n${inviteUrl(m.token)}\n\nThe link works for 14 days. Anything the AI does while you edit uses ${me.name}'s credits, not yours.\nIf you were not expecting this, ignore this email.`,
  }).catch((e) => console.error('[invite mail]', e))
  void audit(userId, 'collab.invited', { presentationId: id }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: memberView(m) }, 201)
})

sharing.delete('/:id/members/:memberId', async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  const isLeave = c.req.param('memberId') === 'me'
  if (isLeave) {
    const res = await db.delete(presentationMember).where(and(eq(presentationMember.presentationId, id), eq(presentationMember.userId, userId))).returning({ id: presentationMember.id })
    if (res.length) kickUser(id, userId)
    return res.length ? c.json({ success: true, data: { left: true } }) : notFound(c)
  }
  if (!(await ownDeck(id, userId))) return notFound(c)
  const res = await db.delete(presentationMember).where(and(eq(presentationMember.presentationId, id), eq(presentationMember.id, c.req.param('memberId')))).returning({ id: presentationMember.id, userId: presentationMember.userId })
  if (!res.length) return notFound(c)
  if (res[0]!.userId) kickUser(id, res[0]!.userId) // their live stream closes at once
  void audit(userId, 'collab.removed', { presentationId: id }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: { removed: true } })
})

// ─── invitee: preview + accept ─────────────────────────────────────────────────────────────────────────────────────────
export const invites = new Hono<AppEnv>()
invites.use('*', requireAuth)

const loadInvite = async (token: string) => {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null
  const [row] = await db
    .select({ m: presentationMember, title: presentation.title, ownerName: user.name, deleted: presentation.deletedAt })
    .from(presentationMember)
    .innerJoin(presentation, eq(presentation.id, presentationMember.presentationId))
    .innerJoin(user, eq(user.id, presentation.userId))
    .where(eq(presentationMember.token, token))
  return row && !row.deleted ? row : null
}
const mailboxMatches = (m: { emailCanonical: string }, u: { email: string; emailVerified?: boolean }) =>
  canonicalEmail(u.email) === m.emailCanonical && (u.emailVerified === true || !env.REQUIRE_EMAIL_VERIFICATION)

invites.get('/:token', rateLimit({ windowMs: 60_000, max: 30, key: byUser('invite-peek') }), async (c) => {
  const inv = await loadInvite(c.req.param('token'))
  if (!inv || inv.m.expiresAt < new Date() && inv.m.status === 'pending') return notFound(c)
  const u = c.get('session')!.user as { email: string; emailVerified?: boolean }
  return c.json({ success: true, data: { title: inv.title, from: inv.ownerName, status: inv.m.status, forThisAccount: mailboxMatches(inv.m, u), presentationId: inv.m.status === 'active' && inv.m.userId === c.get('session')!.user.id ? inv.m.presentationId : null } })
})

invites.post('/:token/accept', rateLimit({ windowMs: 60_000, max: 10, key: byUser('invite-accept') }), async (c) => {
  const session = c.get('session')!
  const inv = await loadInvite(c.req.param('token'))
  if (!inv) return notFound(c)
  if (inv.m.status === 'active') return inv.m.userId === session.user.id ? c.json({ success: true, data: { presentationId: inv.m.presentationId } }) : notFound(c)
  if (inv.m.expiresAt < new Date()) return c.json({ success: false, error: { code: 'INVITE_EXPIRED', message: 'This invitation has expired. Ask the owner to send a new one.' } }, 410)
  if (!mailboxMatches(inv.m, session.user as { email: string; emailVerified?: boolean })) {
    return c.json({ success: false, error: { code: 'WRONG_ACCOUNT', message: `This invitation was sent to ${inv.m.email}. Sign in with that email address to accept it.` } }, 403)
  }
  const [done] = await db
    .update(presentationMember)
    .set({ status: 'active', userId: session.user.id, acceptedAt: new Date() })
    .where(and(eq(presentationMember.id, inv.m.id), eq(presentationMember.status, 'pending'), gt(presentationMember.expiresAt, new Date())))
    .returning({ id: presentationMember.id })
  if (!done) return notFound(c)
  void audit(session.user.id, 'collab.accepted', { presentationId: inv.m.presentationId }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: { presentationId: inv.m.presentationId } })
})

// ─── collaborator: decks shared with me ────────────────────────────────────────────────────────────────────────────────
export const shared = new Hono<AppEnv>()
shared.use('*', requireAuth)
shared.get('/', async (c) => {
  const userId = c.get('session')!.user.id
  const rows = await db
    .select({ id: presentation.id, title: presentation.title, updatedAt: presentation.updatedAt, aspectRatio: presentation.aspectRatio, owner: user.name })
    .from(presentationMember)
    .innerJoin(presentation, eq(presentation.id, presentationMember.presentationId))
    .innerJoin(user, eq(user.id, presentation.userId))
    .where(and(eq(presentationMember.userId, userId), eq(presentationMember.status, 'active'), isNull(presentation.deletedAt), ne(presentation.userId, userId)))
    .orderBy(desc(presentation.updatedAt))
    .limit(100)
  return c.json({ success: true, data: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) })
})

// ─── public: view a shared deck (no login) ─────────────────────────────────────────────────────────────────────────────
export const publicShare = new Hono<AppEnv>()
/** A link row that is currently usable (not revoked, deck not deleted), or null. Expiry is reported separately so the viewer can say so. */
export async function findLink(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null
  const [row] = await db
    .select({ link: shareLink, p: presentation })
    .from(shareLink)
    .innerJoin(presentation, eq(presentation.id, shareLink.presentationId))
    .where(and(eq(shareLink.token, token), isNull(shareLink.revokedAt), isNull(presentation.deletedAt)))
  return row ?? null
}
export const expired = (l: { expiresAt: Date | null }) => !!l.expiresAt && l.expiresAt.getTime() <= Date.now()
const PW_FAILS_PER_LINK = 10, PW_FAILS_PER_IP = 30, PW_WINDOW = 15 * 60_000

publicShare.post('/share/:token/unlock', rateLimit({ windowMs: 60_000, max: 20 }), zValidator('json', z.object({ password: z.string().max(200) })), async (c) => {
  c.header('Cache-Control', 'no-store')
  const token = c.req.param('token')
  const row = await findLink(token)
  if (!row) return notFound(c)
  if (expired(row.link)) return c.json({ success: false, error: { code: 'LINK_EXPIRED', message: 'This link has expired.' } }, 410)
  if (!row.link.passwordHash) return c.json({ success: true, data: { access: null } })
  const ip = clientIp(c)
  const [perLink, perIp] = await Promise.all([recent('share_pw', 'subject', token, PW_WINDOW), recent('share_pw', 'ip', ip, PW_WINDOW)])
  if (perLink >= PW_FAILS_PER_LINK || perIp >= PW_FAILS_PER_IP) { c.header('Retry-After', String(PW_WINDOW / 1000)); return c.json({ success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong passwords. Try again in 15 minutes.' } }, 429) }
  if (!verifySharePassword(c.req.valid('json').password, row.link.passwordHash)) {
    await record('share_pw', ip, token)
    return c.json({ success: false, error: { code: 'WRONG_PASSWORD', message: 'That password is not right.' } }, 401)
  }
  return c.json({ success: true, data: { access: issueShareAccess(token, row.link.passwordHash) } })
})

publicShare.get('/share/:token', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
  const token = c.req.param('token')
  c.header('Cache-Control', 'no-store') // a revoked link must stop working at once, not when a cache expires
  c.header('X-Robots-Tag', 'noindex, nofollow')
  const found = await findLink(token)
  if (!found) return notFound(c)
  if (expired(found.link)) return c.json({ success: false, error: { code: 'LINK_EXPIRED', message: 'This link has expired.' } }, 410)
  if (found.link.passwordHash && !checkShareAccess(c.req.header('x-share-access'), token, found.link.passwordHash)) {
    return c.json({ success: false, error: { code: 'PASSWORD_REQUIRED', message: 'This presentation is password-protected.' } }, 401)
  }
  const row = { p: found.p, ownerId: found.p.userId }
  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, row.p.id), eq(presentationVersion.version, row.p.latestVersion)))
  const parsed = presentationSchema.safeParse(v?.document)
  if (!parsed.success) return notFound(c)
  const doc = parsed.data
  // Viewers get what is on screen, nothing else: no speaker notes, no source list, no semantic content (image prompts, citations).
  const safe: Presentation = {
    ...doc, sources: [],
    slides: doc.slides.map((s) => ({ ...s, speakerNotes: '', sources: [], content: undefined, validation: { status: 'pending' as const, issues: [] } })) as Presentation['slides'],
  }
  const { plan } = await livePlanFor(row.ownerId)
  return c.json({ success: true, data: { title: row.p.title, document: safe, watermark: plan.features.watermark } })
})
