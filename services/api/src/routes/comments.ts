import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { resolveAccess } from '../collab/access.ts'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { comment, commentSeen, commentThread, presentation, presentationMember, presentationVersion, user } from '../db/schema.ts'
import { env } from '../env.ts'
import * as mail from '../lib/email-templates.ts'
import { sendMail } from '../lib/mailer.ts'
import { publishComments } from '../live/bus.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

/**
 * Comments on slides (C6). Working notes for the people who edit a deck together (the owner and invited collaborators): they live in their own
 * tables, never in the deck document, so they cannot reach exports, Present mode, share links, version history or the revision counter.
 */
export const comments = new Hono<AppEnv>()
comments.use('*', requireAuth)

export const MAX_BODY = 2000
export const MAX_THREADS = 500
export const MAX_COMMENTS_PER_THREAD = 200
/** the panel loads a deck's comments in one read, so the whole deck is capped too (500 × 200 would be 100,000 rows) */
export const MAX_COMMENTS_PER_DECK = 3000
const MENTION_MAIL_GAP_MS = 10 * 60_000

const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
const bad = (c: any, status: 400 | 403 | 422 | 429, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const writes = rateLimit({ windowMs: 60_000, max: 40, key: byUser('comments'), message: 'You are commenting very quickly. Wait a moment and try again.' })

/** plain text only: no control characters, trimmed; line breaks kept */
export const cleanBody = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim()
const MENTION = /@\{([A-Za-z0-9_-]{6,64})\}/g

interface Person { id: string; name: string; role: 'owner' | 'editor' }
/** The people a comment may mention: the owner and everyone with an active invitation. Names only. */
async function peopleOf(presentationId: string, ownerId: string): Promise<Person[]> {
  const members = await db.select({ id: user.id, name: user.name }).from(presentationMember).innerJoin(user, eq(user.id, presentationMember.userId)).where(and(eq(presentationMember.presentationId, presentationId), eq(presentationMember.status, 'active')))
  const [owner] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, ownerId))
  const out: Person[] = owner ? [{ ...owner, role: 'owner' }] : []
  for (const m of members) if (m.id !== ownerId) out.push({ ...m, role: 'editor' })
  return out
}

const commentsInDeck = async (presentationId: string) => (await db.select({ n: count() }).from(comment).innerJoin(commentThread, eq(commentThread.id, comment.threadId)).where(eq(commentThread.presentationId, presentationId)))[0]?.n ?? 0
const DECK_FULL = `A presentation can hold up to ${MAX_COMMENTS_PER_DECK} comments. Delete resolved threads to add more.`

async function slideIdsOf(presentationId: string): Promise<Set<string> | null> {
  const [p] = await db.select({ v: presentation.latestVersion }).from(presentation).where(eq(presentation.id, presentationId))
  if (!p) return null
  const [row] = await db.select({ slides: sql<{ id?: string }[]>`${presentationVersion.document}->'slides'` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, presentationId), eq(presentationVersion.version, p.v)))
  return new Set((row?.slides ?? []).map((s) => s.id).filter((x): x is string => !!x))
}

const access = async (c: any) => {
  const actor = c.get('session')!.user as { id: string; name: string }
  const id = c.req.param('id') as string
  try { const a = await resolveAccess(id, actor.id); return a ? { id, actor, ...a } : null } catch (e) { if (e instanceof GateError) throw e; return null }
}

/** Mentions inside a body: keep the ones that name a real person on this deck; anything else becomes plain "@unknown". */
function checkMentions(body: string, people: Person[]): { body: string; mentioned: string[] } {
  const known = new Set(people.map((p) => p.id)); const mentioned = new Set<string>()
  const out = body.replace(MENTION, (m, id: string) => { if (known.has(id)) { mentioned.add(id); return m } return '@unknown' })
  return { body: out, mentioned: [...mentioned] }
}
const showBody = (body: string, people: Person[]) => body.replace(MENTION, (_m, id: string) => `@${people.find((p) => p.id === id)?.name ?? 'former member'}`)

async function mailMentions(deckId: string, deckTitle: string, author: { id: string; name: string }, mentioned: string[], body: string, people: Person[]) {
  for (const uid of mentioned) {
    if (uid === author.id) continue
    try {
      const [seen] = await db.select().from(commentSeen).where(and(eq(commentSeen.userId, uid), eq(commentSeen.presentationId, deckId)))
      if (seen?.lastMentionMailAt && Date.now() - seen.lastMentionMailAt.getTime() < MENTION_MAIL_GAP_MS) continue
      const [to] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, uid))
      if (!to) continue
      await db.insert(commentSeen).values({ userId: uid, presentationId: deckId, seenAt: new Date(0), lastMentionMailAt: new Date() }).onConflictDoUpdate({ target: [commentSeen.userId, commentSeen.presentationId], set: { lastMentionMailAt: new Date() } })
      const excerpt = showBody(body, people).slice(0, 280)
      await sendMail({ to: to.email, ...mail.mention({ authorName: author.name, deckTitle, excerpt, truncated: body.length > 280, url: `${env.EDITOR_URL}/edit/${deckId}` }) })
    } catch (e) { console.warn('[comments] mention mail failed:', (e as Error).message) }
  }
}

const threadsOf = async (deckId: string, me: string, people: Person[]) => {
  const threads = await db.select().from(commentThread).where(eq(commentThread.presentationId, deckId)).orderBy(asc(commentThread.createdAt))
  if (threads.length === 0) return []
  const rows = await db.select({ c: comment, name: user.name }).from(comment).innerJoin(user, eq(user.id, comment.authorId)).where(inArray(comment.threadId, threads.map((t) => t.id))).orderBy(asc(comment.createdAt))
  const names = new Map<string, string>()
  const resolvers = threads.map((t) => t.resolvedBy).filter((x): x is string => !!x)
  if (resolvers.length) for (const u of await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, resolvers))) names.set(u.id, u.name)
  const by = new Map<string, typeof rows>()
  for (const r of rows) by.set(r.c.threadId, [...(by.get(r.c.threadId) ?? []), r])
  void people
  return threads.map((t) => ({
    id: t.id, slideId: t.slideId, x: t.x === null ? null : Number(t.x), y: t.y === null ? null : Number(t.y), status: t.status, createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null, resolvedByName: t.resolvedBy ? (names.get(t.resolvedBy) ?? null) : null,
    comments: (by.get(t.id) ?? []).map((r) => ({ id: r.c.id, authorId: r.c.authorId, authorName: r.name, body: r.c.body, createdAt: r.c.createdAt.toISOString(), editedAt: r.c.editedAt?.toISOString() ?? null, mine: r.c.authorId === me })),
  }))
}

// ─── read ────────────────────────────────────────────────────────────────────
comments.get('/:id/comments', rateLimit({ windowMs: 60_000, max: 120, key: byUser('comments-read') }), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const people = await peopleOf(a.id, a.ownerId)
  const [seen] = await db.select().from(commentSeen).where(and(eq(commentSeen.userId, a.actor.id), eq(commentSeen.presentationId, a.id)))
  const seenAt = seen?.seenAt ?? new Date(0)
  const threads = await threadsOf(a.id, a.actor.id, people)
  const unread = threads.reduce((n, t) => n + t.comments.filter((m) => !m.mine && new Date(m.createdAt) > seenAt).length, 0)
  return c.json({ success: true, data: { threads, people, unread, seenAt: seenAt.toISOString() } })
})

/** "I have read them": clears the unread dot. */
comments.post('/:id/comments/seen', rateLimit({ windowMs: 60_000, max: 60, key: byUser('comments-seen') }), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const now = new Date()
  await db.insert(commentSeen).values({ userId: a.actor.id, presentationId: a.id, seenAt: now }).onConflictDoUpdate({ target: [commentSeen.userId, commentSeen.presentationId], set: { seenAt: now } })
  return c.json({ success: true, data: { seenAt: now.toISOString() } })
})

// ─── write ───────────────────────────────────────────────────────────────────
const bodyField = z.string().max(20_000)
const pin = z.number().min(0).max(1)

comments.post('/:id/comments', writes, zValidator('json', z.object({ slideId: z.string().min(1).max(64), x: pin.optional(), y: pin.optional(), body: bodyField })), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const { slideId, x, y, body: raw } = c.req.valid('json')
  if ((x === undefined) !== (y === undefined)) return bad(c, 422, 'INVALID_INPUT', 'A pin needs both a horizontal and a vertical position.')
  const people = await peopleOf(a.id, a.ownerId)
  const slides = await slideIdsOf(a.id)
  if (!slides?.has(slideId)) return bad(c, 422, 'INVALID_INPUT', 'That slide is not in this presentation.')
  const text = cleanBody(raw)
  if (!text) return bad(c, 422, 'INVALID_INPUT', 'Write something first.')
  if (text.length > MAX_BODY) return bad(c, 422, 'TOO_LONG', `Comments can be up to ${MAX_BODY} characters (this one is ${text.length}).`)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(commentThread).where(eq(commentThread.presentationId, a.id))
  if (n >= MAX_THREADS) return bad(c, 429, 'LIMIT_REACHED', `A presentation can hold up to ${MAX_THREADS} comment threads. Resolve and delete some to add more.`)
  if (await commentsInDeck(a.id) >= MAX_COMMENTS_PER_DECK) return bad(c, 429, 'LIMIT_REACHED', DECK_FULL)
  const { body, mentioned } = checkMentions(text, people)
  const threadId = nanoid(), commentId = nanoid()
  await db.transaction(async (tx) => {
    await tx.insert(commentThread).values({ id: threadId, presentationId: a.id, slideId, x: x === undefined ? null : String(x), y: y === undefined ? null : String(y), createdBy: a.actor.id })
    await tx.insert(comment).values({ id: commentId, threadId, authorId: a.actor.id, body })
  })
  const [deck] = await db.select({ title: presentation.title }).from(presentation).where(eq(presentation.id, a.id))
  void mailMentions(a.id, deck?.title ?? 'a presentation', a.actor, mentioned, body, people)
  publishComments(a.id, a.actor.id)
  return c.json({ success: true, data: { threadId, commentId } }, 201)
})

comments.post('/:id/comments/:threadId/replies', writes, zValidator('json', z.object({ body: bodyField })), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const threadId = c.req.param('threadId')
  const [t] = await db.select().from(commentThread).where(and(eq(commentThread.id, threadId), eq(commentThread.presentationId, a.id)))
  if (!t) return notFound(c)
  const text = cleanBody(c.req.valid('json').body)
  if (!text) return bad(c, 422, 'INVALID_INPUT', 'Write something first.')
  if (text.length > MAX_BODY) return bad(c, 422, 'TOO_LONG', `Comments can be up to ${MAX_BODY} characters (this one is ${text.length}).`)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(comment).where(eq(comment.threadId, threadId))
  if (n >= MAX_COMMENTS_PER_THREAD) return bad(c, 429, 'LIMIT_REACHED', `A thread can hold up to ${MAX_COMMENTS_PER_THREAD} comments. Start a new thread instead.`)
  if (await commentsInDeck(a.id) >= MAX_COMMENTS_PER_DECK) return bad(c, 429, 'LIMIT_REACHED', DECK_FULL)
  const people = await peopleOf(a.id, a.ownerId)
  const { body, mentioned } = checkMentions(text, people)
  const commentId = nanoid()
  await db.insert(comment).values({ id: commentId, threadId, authorId: a.actor.id, body })
  const [deck] = await db.select({ title: presentation.title }).from(presentation).where(eq(presentation.id, a.id))
  void mailMentions(a.id, deck?.title ?? 'a presentation', a.actor, mentioned, body, people)
  publishComments(a.id, a.actor.id)
  return c.json({ success: true, data: { commentId } }, 201)
})

comments.patch('/:id/comments/:threadId', writes, zValidator('json', z.object({ status: z.enum(['open', 'resolved']) })), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const status = c.req.valid('json').status
  const res = await db.update(commentThread).set(status === 'resolved' ? { status, resolvedBy: a.actor.id, resolvedAt: new Date() } : { status, resolvedBy: null, resolvedAt: null }).where(and(eq(commentThread.id, c.req.param('threadId')), eq(commentThread.presentationId, a.id))).returning({ id: commentThread.id })
  if (!res.length) return notFound(c)
  publishComments(a.id, a.actor.id)
  return c.json({ success: true, data: { status } })
})

/** Only the author can edit their own comment. */
comments.patch('/:id/comments/items/:commentId', writes, zValidator('json', z.object({ body: bodyField })), async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const [row] = await db.select({ c: comment }).from(comment).innerJoin(commentThread, eq(commentThread.id, comment.threadId)).where(and(eq(comment.id, c.req.param('commentId')), eq(commentThread.presentationId, a.id)))
  if (!row) return notFound(c)
  if (row.c.authorId !== a.actor.id) return bad(c, 403, 'FORBIDDEN', 'You can only edit your own comments.')
  const text = cleanBody(c.req.valid('json').body)
  if (!text) return bad(c, 422, 'INVALID_INPUT', 'Write something first.')
  if (text.length > MAX_BODY) return bad(c, 422, 'TOO_LONG', `Comments can be up to ${MAX_BODY} characters (this one is ${text.length}).`)
  const people = await peopleOf(a.id, a.ownerId)
  const { body } = checkMentions(text, people)
  await db.update(comment).set({ body, editedAt: new Date() }).where(eq(comment.id, row.c.id))
  publishComments(a.id, a.actor.id)
  return c.json({ success: true, data: { ok: true } })
})

/** The author, or the deck's owner, can delete a comment; deleting the first comment of a thread deletes the whole thread. */
comments.delete('/:id/comments/items/:commentId', writes, async (c) => {
  const a = await access(c); if (!a) return notFound(c)
  const [row] = await db.select({ c: comment, threadId: commentThread.id }).from(comment).innerJoin(commentThread, eq(commentThread.id, comment.threadId)).where(and(eq(comment.id, c.req.param('commentId')), eq(commentThread.presentationId, a.id)))
  if (!row) return notFound(c)
  if (row.c.authorId !== a.actor.id && a.role !== 'owner') return bad(c, 403, 'FORBIDDEN', 'You can only delete your own comments.')
  const [first] = await db.select({ id: comment.id }).from(comment).where(eq(comment.threadId, row.threadId)).orderBy(asc(comment.createdAt)).limit(1)
  if (first?.id === row.c.id) await db.delete(commentThread).where(eq(commentThread.id, row.threadId))
  else await db.delete(comment).where(eq(comment.id, row.c.id))
  publishComments(a.id, a.actor.id)
  return c.json({ success: true, data: { deleted: true } })
})

