import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { AIUnavailableError } from '@prompttoppt/ai'
import { PREMIUM_THEME_IDS, composeSlide, designById, getTheme, templateSlides } from '@prompttoppt/theme'
import { findUrls, presentationSchema, type AccessTier, type Presentation, type SlideContent } from '@prompttoppt/validation'
import { aiAssistInput, aiAssistOutput, aiAssistPrompt, compileAssist, isSmallTalk, LIST_SHORTFALL, morePointsAsked, namesOneSlide, needsSlideChoice } from '../ai/ai-assist.ts'
import { readLinkedPages } from '../ai/linked-pages.ts'
import { aiEditInput, aiEditOutput, aiEditPrompt } from '../ai/ai-edit.ts'
import { askDeckInput, askDeckOutput, askDeckPrompt, deckDigest } from '../ai/ask-deck.ts'
import { aiConfigured, catalog, gateway } from '../ai/gateway.ts'
import { resolveAccess } from '../collab/access.ts'
import { publishRevision } from '../live/bus.ts'
import { isPremiumTheme, lookOf } from '../billing/premium-look.ts'
import { creditPrice, refundCredits, reserveCredits } from '../billing/credits.ts'
import { assertAiEdits, assertAskDeck, assertModelTier, assertPresentationQuota, getEntitlements } from '../billing/entitlements.ts'
import { BillingError, ConflictError, GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { refuseIfOff, refuseIfOn } from '../flags/flags.ts'
import { audit, ipOf } from '../lib/audit.ts'
import { aiChatMessage, creditLedger, generationJob, presentation, presentationVersion, project } from '../db/schema.ts'
import { hasNumbers, sanitizeContent } from '../generation/policy.ts'
import { loadSources } from '../generation/sources.ts'
import { describeDeck } from '../remix/describe.ts'
import { saveSource } from '../sources/store.ts'
import { enrichSlides, loadChunks } from '../ai/enrich.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { defaultModel } from './models.ts'

export const presentations = new Hono<AppEnv>()
presentations.use('*', requireAuth)

/** A new history snapshot is cut at most this often; saves in between update the latest snapshot in place. */
const SNAPSHOT_EVERY_MS = 5 * 60_000
const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Presentation not found' } }, 404)
const mine = (id: string, userId: string) => and(eq(presentation.id, id), eq(presentation.userId, userId), isNull(presentation.deletedAt))


/**
 * Saves a new deck for a user with every create-time limit applied: serialised per user (parallel requests cannot overshoot the monthly
 * allowance), monthly presentations, and the cap on how many decks one account keeps. Used by "new from template" and "duplicate".
 */
async function insertDeck(userId: string, ent: Awaited<ReturnType<typeof getEntitlements>>, d: { id: string; title: string; aspectRatio: string; doc: Presentation; projectId?: string | null | undefined }) {
  const { id, title, aspectRatio, doc, projectId } = d
  const input = { aspectRatio, projectId }
  await db.transaction(async (tx) => {
    // Serialise a user's creates: without the lock, ten parallel requests all pass the monthly-deck check and overshoot the plan limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pres:${userId}`}))`)
    // recount INSIDE the lock using this transaction's connection (a nested pool checkout while holding the lock would deadlock under load)
    const [{ n: made } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(presentation).where(and(eq(presentation.userId, userId), gte(presentation.createdAt, ent.period.start)))
    const [{ n: running } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(generationJob).where(and(eq(generationJob.userId, userId), notInArray(generationJob.status, ['completed', 'failed', 'cancelled']), gte(generationJob.createdAt, ent.period.start)))
    assertPresentationQuota({ limits: ent.limits, plan: ent.plan, usage: { presentationsThisPeriod: made + running, imagesThisPeriod: 0 } })
    const [{ n: live } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(presentation).where(and(eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (live >= MAX_LIVE_PRESENTATIONS) throw new GateError('LIMIT_REACHED', `You can keep up to ${MAX_LIVE_PRESENTATIONS} presentations. Delete some to create more.`, 429, { feature: 'presentations', limit: MAX_LIVE_PRESENTATIONS })
    await tx.insert(presentation).values({ id, userId, title, aspectRatio: input.aspectRatio, latestVersion: 1, revision: 1, ...(projectId ? { projectId } : {}) })
    await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  })
}

presentations.get('/', async (c) => {
  const projectId = c.req.query('projectId')
  // the first slide + theme ride along so library cards can show a real thumbnail
  const rows = await db
    .select({ id: presentation.id, title: presentation.title, aspectRatio: presentation.aspectRatio, updatedAt: presentation.updatedAt, projectId: presentation.projectId, cover: sql<unknown>`${presentationVersion.document}->'slides'->0`, theme: sql<unknown>`${presentationVersion.document}->'theme'` })
    .from(presentation)
    .leftJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion)))
    .where(and(eq(presentation.userId, c.get('session')!.user.id), isNull(presentation.deletedAt), ...(projectId ? [eq(presentation.projectId, projectId)] : [])))
    .orderBy(desc(presentation.updatedAt))
    .limit(60)
  return c.json({ success: true, data: rows })
})

/**
 * New deck from a template design (or a blank deck): the design's theme + its category's starter story, composed server-side.
 * Counts toward the monthly presentation allowance; premium designs need the plan feature. No AI, so no credits.
 */
presentations.post('/', rateLimit({ windowMs: 60_000, max: 20, key: (c) => `create:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', z.object({
  templateId: z.string().max(80).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1']).default('16:9'),
  projectId: z.string().max(40).optional(),
  /** "Create from scratch": one empty slide in the chosen look (templateId then only supplies the colours and fonts) */
  blank: z.boolean().default(false),
})), async (c) => {
  const userId = c.get('session')!.user.id
  const input = c.req.valid('json')
  const ent = await getEntitlements(userId)

  const design = input.templateId ? designById(input.templateId) : undefined
  if (input.templateId && !design) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'That template does not exist.' } }, 404)
  if (design?.premium && !ent.features.premiumTemplates) throw new GateError('UPGRADE_REQUIRED', `"${design.name}" is a Pro template.`, 403, { feature: 'premiumTemplates' })
  if (input.projectId) {
    const [proj] = await db.select({ id: project.id }).from(project).where(and(eq(project.id, input.projectId), eq(project.userId, userId), isNull(project.deletedAt)))
    if (!proj) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }

  const id = nanoid()
  const idGen = () => nanoid(12)
  const built = design ? templateSlides(design.id, input.aspectRatio, idGen, `${env.WEB_URL}/template-assets`)! : null
  const theme = built?.theme ?? getTheme('cobalt')
  const blankSlide = () => ({ layoutId: 'blank' as const, manual: true, background: { type: 'color' as const, value: theme.colors.background }, elements: [], speakerNotes: '', sources: [] })
  const slides = input.blank ? [blankSlide()] : (built?.slides ?? [composeSlide({ layout: 'title', title: 'Untitled presentation', subtitle: 'Click to edit', speakerNotes: '', sources: [] }, theme, input.aspectRatio, idGen)])
  if (slides.length > ent.limits.maxSlides) throw new GateError('UPGRADE_REQUIRED', `The ${ent.plan.name} plan allows up to ${ent.limits.maxSlides} slides per presentation.`, 403, { feature: 'slides', limit: ent.limits.maxSlides })
  const title = input.title ?? design?.name ?? 'Untitled presentation'
  const doc: Presentation = {
    schemaVersion: 1, id, title, aspectRatio: input.aspectRatio, language: 'en', theme, sources: [],
    slides: slides.map((s) => ({ id: nanoid(12), locked: false, validation: { status: 'pending' as const, issues: [] }, ...s })),
  }
  await insertDeck(userId, ent, { id, title, aspectRatio: input.aspectRatio, doc, projectId: input.projectId })
  return c.json({ success: true, data: { id } }, 201)
})

/** The saved (latest) document of one of YOUR decks, or why it cannot be used. */
async function ownLatest(id: string, userId: string): Promise<{ doc: Presentation; projectId: string | null } | 'missing' | 'unreadable'> {
  const [row] = await db.select({ v: presentationVersion.document, projectId: presentation.projectId }).from(presentation)
    .innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion))).where(mine(id, userId))
  if (!row) return 'missing'
  const parsed = presentationSchema.safeParse(row.v)
  return parsed.success ? { doc: parsed.data, projectId: row.projectId } : 'unreadable'
}

/** Exact copy of one of your decks as a NEW deck (its own history). Counts toward the monthly allowance like any new deck; no AI, no credits. */
presentations.post('/:id/duplicate', rateLimit({ windowMs: 60_000, max: 10, key: byUser('dup') }), async (c) => {
  const userId = c.get('session')!.user.id
  const own = await ownLatest(c.req.param('id'), userId)
  if (own === 'missing') return notFound(c)
  if (own === 'unreadable') return c.json({ success: false, error: { code: 'UNREADABLE', message: 'This presentation could not be copied. Open it and try again.' } }, 422)
  const ent = await getEntitlements(userId)
  const id = nanoid()
  const title = `Copy of ${own.doc.title}`.slice(0, 200)
  if (own.doc.slides.length > ent.limits.maxSlides) throw new GateError('UPGRADE_REQUIRED', `The ${ent.plan.name} plan allows up to ${ent.limits.maxSlides} slides per presentation.`, 403, { feature: 'slides', limit: ent.limits.maxSlides })
  await insertDeck(userId, ent, { id, title, aspectRatio: own.doc.aspectRatio, doc: { ...own.doc, id, title }, projectId: own.projectId })
  return c.json({ success: true, data: { id, title } }, 201)
})

/**
 * Step 1 of "Remix": turns one of your decks into a private text source the generator can read (every slide, with its figures),
 * so a remix starts from your real content instead of a blank page. Step 2 is an ordinary generation job (with `remixOf`), which
 * charges credits per slide like any new deck. Pro and Gold.
 */
const REMIX_SOURCES_KEPT = 20
presentations.post('/:id/remix-source', rateLimit({ windowMs: 60_000, max: 10, key: byUser('remix') }), async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await getEntitlements(userId)
  if (ent.plan.id === 'starter') throw new GateError('UPGRADE_REQUIRED', 'Remixing a presentation is available on Pro and Gold.', 403, { feature: 'remix' })
  const own = await ownLatest(c.req.param('id'), userId)
  if (own === 'missing') return notFound(c)
  if (own === 'unreadable') return c.json({ success: false, error: { code: 'UNREADABLE', message: 'This presentation could not be read. Open it and try again.' } }, 422)
  const text = describeDeck(own.doc)
  if (text.parts.length === 0) return c.json({ success: false, error: { code: 'NOTHING_TO_REMIX', message: 'This presentation has no slide text to remix.' } }, 422)
  const src = await saveSource(userId, 'text', { title: `Remix source: ${own.doc.title}`.slice(0, 200), parts: text.parts })
  // these are working copies: keep only the newest few so remixing never fills the user's source allowance (never one younger than an hour: a queued remix job may still need it)
  await db.execute(sql`delete from source_document where user_id = ${userId} and title like 'Remix source: %' and created_at < now() - interval '1 hour' and id not in (select id from source_document where user_id = ${userId} and title like 'Remix source: %' order by created_at desc limit ${REMIX_SOURCES_KEPT})`)
  return c.json({ success: true, data: { sourceId: src.id, title: own.doc.title, slideCount: own.doc.slides.length, aspectRatio: own.doc.aspectRatio, skipped: text.skipped } }, 201)
})

/** Move a deck into a project (or out: projectId null). Moving is never plan-gated. */
presentations.put('/:id/project', zValidator('json', z.object({ projectId: z.string().max(40).nullable() })), async (c) => {
  const userId = c.get('session')!.user.id
  const { projectId } = c.req.valid('json')
  if (projectId) {
    const [proj] = await db.select({ id: project.id }).from(project).where(and(eq(project.id, projectId), eq(project.userId, userId), isNull(project.deletedAt)))
    if (!proj) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }
  const [row] = await db.update(presentation).set({ projectId }).where(mine(c.req.param('id'), userId)).returning({ id: presentation.id })
  return row ? c.json({ success: true, data: { id: row.id, projectId } }) : notFound(c)
})

presentations.get('/:id', async (c) => {
  const access = await resolveAccess(c.req.param('id'), c.get('session')!.user.id)
  if (!access) return notFound(c)
  const [p] = await db.select().from(presentation).where(mine(c.req.param('id'), access.ownerId))
  if (!p) return notFound(c)
  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, p.id), eq(presentationVersion.version, p.latestVersion)))
  return c.json({ success: true, data: { id: p.id, title: p.title, revision: p.revision, version: p.latestVersion, document: v!.document, role: access.role } })
})

/**
 * Conflict-safe save. The client states the revision its copy is based on; if anyone else saved since (another tab,
 * another device) we answer 409 instead of silently overwriting. Autosave calls this constantly, so history snapshots are
 * cut at most every 5 minutes (or when asked) and in-between saves update the newest snapshot in place.
 */
presentations.put(
  '/:id',
  bodyLimit({ maxSize: 3 * 1024 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'Presentation is too large' } }, 413) }),
  rateLimit({ windowMs: 60_000, max: 120, key: byUser('save') }),
  zValidator('json', z.object({ baseRevision: z.number().int().min(1), document: z.unknown(), snapshot: z.boolean().default(false) })),
  async (c) => {
    const id = c.req.param('id')
    // collaborators save into the owner's deck under the owner's plan limits
    const access = await resolveAccess(id, c.get('session')!.user.id)
    if (!access) return notFound(c)
    const userId = access.ownerId
    const body = c.req.valid('json')
    const parsed = presentationSchema.safeParse(body.document)
    if (!parsed.success) return c.json({ success: false, error: { code: 'INVALID_DOCUMENT', message: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } }, 400)
    const doc = parsed.data
    if (doc.id !== id) return c.json({ success: false, error: { code: 'INVALID_DOCUMENT', message: 'Document id does not match' } }, 400)

    const ent = await getEntitlements(userId)
    if (doc.slides.length > ent.limits.maxSlides) throw new GateError('UPGRADE_REQUIRED', `The ${ent.plan.name} plan allows up to ${ent.limits.maxSlides} slides per presentation.`, 403, { feature: 'slides', limit: ent.limits.maxSlides })

    const result = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(presentation).where(mine(id, userId)).for('update')
      if (!p) return null
      if (p.revision !== body.baseRevision) throw new ConflictError('This presentation was changed elsewhere.', { currentRevision: p.revision })
      const [latest] = await tx.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p.latestVersion)))

      // Premium themes need the plan feature — checked when the LOOK changes (so a later downgrade doesn't lock old decks). The look is judged by its
      // colours/fonts/style, not by the id the client sent: pasting a premium theme under another id must not get around the gate.
      if (latest && lookOf(latest.document.theme) !== lookOf(doc.theme) && isPremiumTheme(doc.theme) && !ent.features.premiumTemplates) {
        throw new GateError('UPGRADE_REQUIRED', `The "${doc.theme.name}" theme is available on the Pro plan.`, 403, { feature: 'premiumTemplates' })
      }

      // Only the user's own recent autosave snapshot is mutable. Generation / restore / AI-edit snapshots are history and
      // are never overwritten — otherwise the first autosave would destroy "the deck as generated".
      const mutable = !!latest && latest.createdBy === 'user' && Date.now() - latest.createdAt.getTime() <= SNAPSHOT_EVERY_MS
      // explicit "save a version" is honoured up to 12 times a minute per account (otherwise 120 saves/min × 3 MB would flood the database with history)
      const cut = (body.snapshot && allowSnapshot(userId)) || !mutable
      let version = p.latestVersion
      if (cut) {
        version = p.latestVersion + 1
        await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version, document: doc, createdBy: 'user' })
        // keep history bounded: autosave snapshots beyond the newest MAX_VERSIONS are dropped (generation / restore / AI snapshots are never pruned)
        await tx.execute(sql`DELETE FROM presentation_version WHERE presentation_id = ${id} AND created_by = 'user' AND id NOT IN (SELECT id FROM presentation_version WHERE presentation_id = ${id} ORDER BY version DESC LIMIT ${MAX_VERSIONS})`)
      } else {
        await tx.update(presentationVersion).set({ document: doc }).where(eq(presentationVersion.id, latest!.id))
      }
      const revision = p.revision + 1
      await tx.update(presentation).set({ title: doc.title, aspectRatio: doc.aspectRatio, latestVersion: version, revision, updatedAt: new Date() }).where(eq(presentation.id, id))
      return { revision, version }
    })
    if (result) publishRevision(id, result.revision, c.get('session')!.user.id) // everyone else in the deck merges this revision live
    return result ? c.json({ success: true, data: result }) : notFound(c)
  },
)

presentations.get('/:id/versions', async (c) => {
  const access = await resolveAccess(c.req.param('id'), c.get('session')!.user.id)
  if (!access) return notFound(c)
  const userId = access.ownerId
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(mine(c.req.param('id'), userId))
  if (!p) return notFound(c)
  const rows = await db
    .select({ version: presentationVersion.version, createdAt: presentationVersion.createdAt, createdBy: presentationVersion.createdBy, slides: sql<number>`jsonb_array_length(${presentationVersion.document}->'slides')` })
    .from(presentationVersion)
    .where(eq(presentationVersion.presentationId, p.id))
    .orderBy(desc(presentationVersion.version))
    .limit(50)
  return c.json({ success: true, data: rows })
})

/** Restoring never rewrites history: the old snapshot becomes a NEW latest version. */
presentations.post('/:id/versions/:version/restore', rateLimit({ windowMs: 60_000, max: 20, key: byUser('restore') }), zValidator('json', z.object({ baseRevision: z.number().int().min(1) })), async (c) => {
  const id = c.req.param('id')
  const access = await resolveAccess(id, c.get('session')!.user.id)
  if (!access) return notFound(c)
  const userId = access.ownerId
  const target = Number(c.req.param('version'))
  if (!Number.isInteger(target) || target < 1 || target > 1_000_000) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404)
  const ent = await getEntitlements(userId)
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(presentation).where(mine(id, userId)).for('update')
    if (!p) return null
    if (p.revision !== c.req.valid('json').baseRevision) throw new ConflictError('This presentation was changed elsewhere.', { currentRevision: p.revision })
    const [old] = await tx.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, target)))
    if (!old) return undefined
    // restoring must not smuggle in what the current plan does not allow (a deck from before a downgrade, or a premium look)
    if (old.document.slides.length > ent.limits.maxSlides) throw new GateError('UPGRADE_REQUIRED', `That version has more slides than the ${ent.plan.name} plan allows (${ent.limits.maxSlides}).`, 403, { feature: 'slides', limit: ent.limits.maxSlides })
    const current = await tx.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p.latestVersion)))
    if (current[0] && lookOf(current[0].document.theme) !== lookOf(old.document.theme) && isPremiumTheme(old.document.theme) && !ent.features.premiumTemplates) {
      throw new GateError('UPGRADE_REQUIRED', `That version uses the "${old.document.theme.name}" theme, which is on the Pro plan.`, 403, { feature: 'premiumTemplates' })
    }
    const version = p.latestVersion + 1
    const revision = p.revision + 1
    await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version, document: old.document, createdBy: 'restore' })
    await tx.update(presentation).set({ title: old.document.title, latestVersion: version, revision, updatedAt: new Date() }).where(eq(presentation.id, id))
    return { revision, version, document: old.document }
  })
  if (out === null) return notFound(c)
  if (out === undefined) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404)
  publishRevision(id, out.revision, c.get('session')!.user.id)
  return c.json({ success: true, data: out })
})

presentations.delete('/:id', async (c) => {
  const userId = c.get('session')!.user.id
  const res = await db.update(presentation).set({ deletedAt: new Date() }).where(mine(c.req.param('id'), userId)).returning({ id: presentation.id })
  if (!res.length) return notFound(c)
  void audit(userId, 'presentation.delete', { presentationId: res[0]!.id }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: null })
})

/**
 * Chat with the presentation: a question about the deck's own words (and its attached sources) → a short answer that points to slides.
 * Read-only: it never changes the deck. Pro/Gold; charged per question (idempotent by requestId) and refunded if the model fails.
 */
presentations.post('/:id/ask', rateLimit({ windowMs: 60_000, max: 20, key: byUser('askdeck') }), zValidator('json', askDeckInput), async (c) => {
  if (!aiConfigured) return c.json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI is not configured on this server' } }, 503)
  const id = c.req.param('id')
  const access = await resolveAccess(id, c.get('session')!.user.id)
  if (!access) return notFound(c)
  const userId = access.ownerId // a collaborator's question is charged to the OWNER, like AI edits
  const input = c.req.valid('json')
  const off = (await refuseIfOn('maintenance_mode', c, userId)) ?? (await refuseIfOff('ai_assistant', c, userId))
  if (off) return off

  const ent = await getEntitlements(userId)
  assertAskDeck(ent)
  const [p] = await db.select().from(presentation).where(mine(id, userId))
  if (!p) return notFound(c)
  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p.latestVersion)))
  const doc = v!.document as Presentation

  const { rows } = await catalog()
  const picked = input.model ? rows.find((r) => r.id === input.model && r.kind === 'text') : defaultModel(ent, rows)
  if (!picked) return c.json({ success: false, error: { code: 'INVALID_MODEL', message: 'That model is not available.' } }, 400)
  const tier = picked.accessTier as AccessTier
  assertModelTier(ent, tier)
  const price = await creditPrice('ask_deck', tier)
  await reserveCredits(userId, price, 'ask_deck', input.requestId, { strict: true })
  try {
    const sources = trimSources(await loadSources(userId, (doc.sources ?? []).map((x) => x.id)), 24_000)
    const digest = deckDigest(doc)
    const out = await gateway.run({
      route: 'fast', model: picked.id, requestType: 'ask_deck',
      ...askDeckPrompt({ question: input.question, history: input.history, title: doc.title, digest: digest.text, slideCount: digest.slideCount, language: doc.language, sources }),
      schema: askDeckOutput, ctx: { userId, presentationId: id },
    })
    const slides = [...new Set(out.slides)].filter((n) => n >= 1 && n <= doc.slides.length).map((n) => ({ n, id: doc.slides[n - 1]!.id }))
    return c.json({ success: true, data: { answer: out.answer, slides, creditsCharged: price, model: picked.id } })
  } catch (e) {
    await refundCredits(userId, 'ask_deck', input.requestId)
    if (e instanceof AIUnavailableError) return c.json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'The AI service is busy or unavailable. You were not charged — please try again.' } }, 503)
    console.error('[ask-deck]', e)
    return c.json({ success: false, error: { code: 'ASK_FAILED', message: 'The AI could not answer that. You were not charged.' } }, 502)
  }
})

/**
 * AI edit of ONE slide → a validated replacement SlideContent (same layout) that the client applies as an undoable command.
 * Pro+ only; honours slide locks; charged per action (idempotent by requestId) and refunded if the model fails.
 */
presentations.post('/:id/ai-edit', rateLimit({ windowMs: 60_000, max: 20, key: byUser('aiedit') }), zValidator('json', aiEditInput), async (c) => {
  if (!aiConfigured) return c.json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI is not configured on this server' } }, 503)
  const id = c.req.param('id')
  const access = await resolveAccess(id, c.get('session')!.user.id)
  if (!access) return notFound(c)
  const userId = access.ownerId // a collaborator's AI edit is charged to the OWNER: credits, model tiers and the usage ledger all use the owner
  const input = c.req.valid('json')
  const off = (await refuseIfOn('maintenance_mode', c, userId)) ?? (await refuseIfOff('ai_assistant', c, userId)) // before credits are reserved
  if (off) return off

  const ent = await getEntitlements(userId)
  assertAiEdits(ent)

  const [p] = await db.select().from(presentation).where(mine(id, userId))
  if (!p) return notFound(c)
  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p.latestVersion)))
  const doc = v!.document as Presentation
  const slide = doc.slides.find((s) => s.id === input.slideId)
  if (!slide) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Slide not found' } }, 404)
  if (slide.locked) return c.json({ success: false, error: { code: 'SLIDE_LOCKED', message: 'This slide is locked. Unlock it to use AI edits.' } }, 409)

  const { rows } = await catalog()
  const picked = input.model ? rows.find((r) => r.id === input.model && r.kind === 'text') : defaultModel(ent, rows)
  if (!picked) return c.json({ success: false, error: { code: 'INVALID_MODEL', message: 'That model is not available.' } }, 400)
  const tier = picked.accessTier as AccessTier
  assertModelTier(ent, tier)
  const price = await creditPrice('ai_edit', tier)
  await reserveCredits(userId, price, 'ai_edit', input.requestId, { strict: true })

  const texts = slide.elements.flatMap((e) => (e.type === 'text' ? [e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')] : []))
  try {
    const deckSources = trimSources(await loadSources(userId, (doc.sources ?? []).map((x) => x.id)), 24_000)
    const out = await gateway.run({
      route: 'quality', model: picked.id, requestType: 'ai_edit',
      ...aiEditPrompt({ command: input.command, argument: input.argument, layout: slide.layoutId, content: slide.manual ? null : (slide.content ?? null), texts, language: doc.language, sources: deckSources }),
      schema: aiEditOutput, ctx: { userId, presentationId: id },
    })
    if (out.slide.layout !== slide.layoutId) throw new Error('model changed the layout')
    const known = new Set(doc.sources.map((s) => s.id))
    const content = sanitizeContent(out.slide, known, hasNumbers('', [JSON.stringify(slide.content ?? texts), ...deckSources.map((x) => x.text)]), slide.content as SlideContent | null | undefined)
    return c.json({ success: true, data: { content, creditsCharged: price, model: picked.id } })
  } catch (e) {
    await refundCredits(userId, 'ai_edit', input.requestId)
    if (e instanceof AIUnavailableError) return c.json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'The AI service is busy or unavailable. You were not charged — please try again.' } }, 503)
    console.error('[ai-edit]', e)
    return c.json({ success: false, error: { code: 'AI_EDIT_FAILED', message: 'The AI could not edit this slide. You were not charged.' } }, 502)
  }
})

/**
 * Chat-style assistant: a free-form instruction ("change the colours, animate every slide, shorten slide 3") becomes a closed
 * list of validated operations (see ai/ai-assist.ts). The server resolves them into a concrete theme + slide edits; the
 * editor applies the result as ONE undoable step. Charged per message (deck scope costs 2× an AI edit — bigger prompt, more
 * output), idempotent by requestId, refunded when it fails or when nothing could be applied.
 */
/** Built from what really happened, never from model prose (which can describe things it didn't do). */
const replyFor = (changes: number, pictures: number) =>
  [changes > 0 ? `Done — ${changes === 1 ? 'one change' : `${changes} changes`} applied to your deck.` : '', pictures > 0 ? (changes > 0 ? 'I also prepared' : 'I prepared') + ` ${pictures === 1 ? 'a picture' : `${pictures} pictures`} for you to confirm below.` : ''].filter(Boolean).join(' ')

/** Shown when no operation applied: lists what the assistant CAN do, so a greeting, a question or an unsupported ask is never met with a bare refusal. */
export const CAPABILITIES_REPLY = 'Hey! Tell me what to update — slide text, add a slide, pictures, theme, colours, fonts or animation.\nFor example: "make slide 3 shorter".'
const nothingAppliedReply = (notes: string[]) => (notes.length ? "I couldn't do that — see the note below." : CAPABILITIES_REPLY)

presentations.post('/:id/ai-assist', rateLimit({ windowMs: 60_000, max: 15, key: (c) => `assist:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', aiAssistInput), async (c) => {
  if (!aiConfigured) return c.json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI is not configured on this server' } }, 503)
  const id = c.req.param('id')
  const access = await resolveAccess(id, c.get('session')!.user.id)
  if (!access) return notFound(c)
  const userId = access.ownerId // charged to the OWNER (see ai-edit)
  const isOwner = access.role === 'owner'
  const input = c.req.valid('json')
  const off = (await refuseIfOn('maintenance_mode', c, userId)) ?? (await refuseIfOff('ai_assistant', c, userId)) // before credits are reserved
  if (off) return off

  const ent = await getEntitlements(userId)
  assertAiEdits(ent)
  const [p] = await db.select().from(presentation).where(mine(id, userId))
  if (!p) return notFound(c)
  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p.latestVersion)))
  const doc = v!.document as Presentation
  if (input.scope === 'slide') {
    const s = doc.slides.find((x) => x.id === input.slideId)
    if (!s) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Slide not found' } }, 404)
    if (s.locked) return c.json({ success: false, error: { code: 'SLIDE_LOCKED', message: 'This slide is locked. Unlock it to use AI.' } }, 409)
  }

  // A request about ONE slide that does not say which: ask before anything is read, charged or guessed (see needsSlideChoice)
  if (needsSlideChoice(input.instruction, input.scope)) {
    const at = input.activeSlideId ? doc.slides.findIndex((x) => x.id === input.activeSlideId) : -1
    return c.json({ success: true, data: { reply: at >= 0 ? `Which slide should I change — slide ${at + 1} (the one you're on), every slide, or another one?` : 'Which slide should I change — one slide, or every slide?', ask: true, theme: null, edits: [], additions: [], reverts: [], images: [], applied: [], notes: [], rewrite: null, creditsCharged: 0, model: input.model ?? '', sources: [] } })
  }

  // a greeting or a thank-you is not a request: answer it for free (the model once read "hey" as "add that slide again")
  if (isSmallTalk(input.instruction)) return c.json({ success: true, data: { reply: CAPABILITIES_REPLY, theme: null, edits: [], additions: [], reverts: [], images: [], applied: [], notes: [], rewrite: null, creditsCharged: 0, model: input.model ?? '', sources: [] } })

  const { rows } = await catalog()
  const picked = input.model ? rows.find((r) => r.id === input.model && r.kind === 'text') : defaultModel(ent, rows)
  if (!picked) return c.json({ success: false, error: { code: 'INVALID_MODEL', message: 'That model is not available.' } }, 400)
  const tier = picked.accessTier as AccessTier
  assertModelTier(ent, tier)
  // Links in the message are read server-side (SSRF-safe) BEFORE charging; each page that is actually read adds one edit-price unit
  // (the prompt carries up to ~12k characters of page text per link).
  const pages = await readLinkedPages(findUrls(input.instruction))
  const readCount = pages.filter((p) => p.status === 'read').length
  const price = (await creditPrice('ai_edit', tier)) * ((input.scope === 'deck' && !namesOneSlide(input.instruction) ? 2 : 1) + readCount) // a message that names one slide costs one edit, a deck-wide one two
  await reserveCredits(userId, price, 'ai_assist', input.requestId, { strict: true })

  try {
    // The deck's own sources (attached when it was created, plus any attached to this message) stay in context for the whole journey
    const deckIds = (doc.sources ?? []).map((x) => x.id)
    const sources = await loadSources(userId, [...new Set([...deckIds, ...input.sourceIds])])
    const added = sources.filter((x) => !deckIds.includes(x.id)).map((x) => ({ id: x.id, type: (['pdf', 'url', 'text'].includes(x.type) ? x.type : 'text') as 'pdf' | 'url' | 'text', title: x.title.slice(0, 300), ...(x.url ? { url: x.url } : {}) }))
    const promptSources = trimSources(sources, 30_000)
    const runModel = (instruction: string) => gateway.run({
      route: 'quality', model: picked.id, requestType: 'ai_assist',
      ...aiAssistPrompt({ conversation: input.conversation, activeSlideId: input.activeSlideId, recent: input.recent, instruction, scope: input.scope, focusSlideId: input.slideId, doc, pages, sources: promptSources }),
      schema: aiAssistOutput, ctx: { userId, presentationId: id },
    })
    const compileFor = (o: Awaited<ReturnType<typeof runModel>>) => compileAssist({ ...doc, sources: [...(doc.sources ?? []), ...added] }, o, ent, input.scope, input.slideId, [...pages.filter((p) => p.status === 'read').map((p) => p.text), ...sources.map((x) => x.text)], input.recent, input.instruction)
    let enrichCharged = 0
    let out = await runModel(input.instruction)
    let result = compileFor(out)
    // "add 2 more points" answered by only rewording the points: ask the model once more, precisely, before telling the person it did not work
    const more = morePointsAsked(input.instruction)
    if (more && result.notes.some((n) => LIST_SHORTFALL.test(n))) {
      const again = await runModel(`${input.instruction}\n(Your previous answer did not add the points. Count the points the slide has now: each list you change must end with exactly ${more} more point${more > 1 ? 's' : ''} than it has now. Return the slide with the new points added.)`).catch(() => null)
      const retried = again ? compileFor(again) : null
      if (again && retried && !retried.notes.some((n) => LIST_SHORTFALL.test(n))) { result = retried; out = again }
    }
    if (!isOwner && result.rewrite) {
      // rebuilding every slide runs as a separate generation job under the OWNER's account: collaborators edit slides, the owner rebuilds decks
      await refundPlanning(userId, input.requestId)
      return c.json({ success: true, data: { reply: 'Only the owner can rebuild the whole presentation. I can still change individual slides, colours and fonts for you.', theme: null, edits: [], additions: [], reverts: [], images: [], applied: [], notes: [], rewrite: null, creditsCharged: 0, model: picked.id, sources: [] } })
    }
    // "add more content from my document": expanded per slide from its own excerpts (retrieval), verified to really differ from the old text
    if (result.enrich) {
      result.applied = result.applied.filter((a) => a !== 'Adding detail from your attached sources')
      const chunks = await loadChunks([...new Set([...deckIds, ...input.sourceIds])], userId)
      if (chunks.length === 0) result.notes.push('There is no attached document to take content from — attach a PDF or link with the 📎 button, then ask again.')
      else {
        const slidesN = input.scope === 'slide' ? 1 : doc.slides.length
        const extra = (await creditPrice('ai_edit', tier)) * Math.max(1, Math.ceil(slidesN / 3))
        await reserveCredits(userId, extra, 'ai_assist', `${input.requestId}:enrich`, { strict: true }) // throws INSUFFICIENT_CREDITS (402) → the outer catch refunds the planning charge and passes it on
        const charged = true
        const r = await enrichSlides({ doc, chunks, instruction: input.instruction, onlySlideId: input.scope === 'slide' ? input.slideId : undefined, userId, model: picked.id, known: new Set([...(doc.sources ?? []).map((x) => x.id), ...added.map((x) => x.id)]), allTexts: sources.map((x) => x.text) })
        if (r.edits.length === 0 && charged) await refundCredits(userId, 'ai_assist', `${input.requestId}:enrich`)
        for (const e of r.edits) { const i = result.edits.findIndex((x) => x.slideId === e.slideId); if (i >= 0) result.edits[i] = e; else result.edits.push(e) }
        if (r.edits.length) result.applied.push(`Added detail from your document to ${r.edits.length === 1 ? 'slide ' + (doc.slides.findIndex((x) => x.id === r.edits[0]!.slideId) + 1) : `${r.edits.length} slides`}`)
        if (r.unchanged.length) result.notes.push(`${r.unchanged.length === 1 ? 'Slide' : 'Slides'} ${r.unchanged.join(', ')}: I couldn't find more relevant detail in the document, so ${r.unchanged.length === 1 ? 'it was' : 'they were'} left as is.`)
        enrichCharged = r.edits.length ? extra : 0
      }
    }
    for (const p of pages) if (p.status === 'failed') result.notes.push(`Couldn't read ${p.url} — ${p.reason ?? 'unknown problem'}`)
    if (result.applied.length === 0 && out.ask) {
      // the request needs a slide (or a choice) the user didn't give: ask instead of guessing; nothing changed, nothing charged
      await refundPlanning(userId, input.requestId)
      return c.json({ success: true, data: { reply: out.ask, ask: true, theme: null, edits: [], additions: [], reverts: [], images: [], applied: [], notes: [], rewrite: null, creditsCharged: 0, model: picked.id, sources: added } })
    }
    if (result.applied.length === 0) {
      if (!out.onTopic) result.notes.length = 0 // not about the deck at all: the help list is the whole answer, never a made-up note
      await refundPlanning(userId, input.requestId) // nothing changed → nothing charged (within a daily allowance)
      return c.json({ success: true, data: { reply: nothingAppliedReply(result.notes), theme: null, edits: [], additions: [], reverts: [], images: [], applied: [], notes: result.notes, rewrite: null, creditsCharged: 0, model: picked.id, sources: added } })
    }
    if (result.reverts.length > 0 && result.applied.length === result.reverts.length) {
      // putting back a change the assistant made is free: the user is correcting us, not asking for new work
      await refundPlanning(userId, input.requestId)
      return c.json({ success: true, data: { reply: "Sorry about that — I've put it back the way it was.", theme: null, edits: [], additions: [], reverts: result.reverts, images: [], rewrite: null, applied: result.applied, notes: result.notes, creditsCharged: 0, model: picked.id, sources: added } })
    }
    if (result.rewrite && result.applied.length === 1) {
      // the full rewrite is charged by its own generation job (per slide), so the planning call costs the user nothing (within a daily allowance)
      await refundPlanning(userId, input.requestId)
      return c.json({ success: true, data: { reply: result.rewrite.picturesOnly ? "On it — I'll pick new pictures that match each slide and keep your text." : "Got it — I'll rebuild every slide from your details, keeping this design.", theme: null, edits: [], additions: [], reverts: [], images: [], rewrite: result.rewrite, applied: result.applied, notes: result.notes, creditsCharged: 0, model: picked.id, sources: added } })
    }
    return c.json({ success: true, data: { reply: replyFor(result.applied.length - result.images.length, result.images.length), theme: result.theme, edits: result.edits, additions: result.additions, reverts: result.reverts, backgrounds: result.backgrounds, readability: result.readability, images: result.images, rewrite: result.rewrite, applied: result.applied, notes: result.notes, creditsCharged: price + enrichCharged, model: picked.id, sources: added } })
  } catch (e) {
    await refundCredits(userId, 'ai_assist', input.requestId)
    if (e instanceof BillingError || e instanceof GateError) throw e
    if (e instanceof AIUnavailableError) return c.json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'The AI service is busy or unavailable. You were not charged — please try again.' } }, 503)
    console.error('[ai-assist]', e)
    return c.json({ success: false, error: { code: 'AI_EDIT_FAILED', message: 'The AI could not complete that. You were not charged.' } }, 502)
  }
})


/** Trim source text for a prompt: each source keeps its start (locator-tagged), the total stays under `budget` characters. */
function trimSources(list: { id: string; title: string; text: string }[], budget: number) {
  const each = Math.max(2000, Math.floor(budget / Math.max(1, list.length)))
  return list.map((x) => ({ id: x.id, title: x.title, text: x.text.slice(0, each) }))
}

// ─── AI assistant conversation (persisted per presentation) ──────────────────────────────────────────────
const chatBody = z.object({ role: z.enum(['user', 'ai', 'error']), text: z.string().max(4000).optional(), reply: z.string().max(4000).optional(), applied: z.array(z.string().max(300)).max(30).optional(), notes: z.array(z.string().max(400)).max(20).optional(), credits: z.number().optional(), undo: z.string().max(100_000).optional(), revertedUndo: z.array(z.string().max(64)).max(10).optional(), images: z.array(z.record(z.string().max(40), z.union([z.string().max(600), z.number(), z.boolean(), z.null()])).refine((o) => Object.keys(o).length <= 12, 'too many fields')).max(6).optional() })
const MAX_CHAT = 200
const MAX_VERSIONS = 100
const MAX_FREE_PLANNING_PER_DAY = 25
/**
 * The planning call of an assist request is refunded when it changed nothing or only proposed a rewrite (the rewrite job is charged separately).
 * That is fair for honest use, but unlimited it is a free model call per request: past a daily allowance the planning call is simply charged.
 */
async function refundPlanning(userId: string, requestId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600_000)
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, 'refund'), eq(creditLedger.refType, 'ai_assist'), gte(creditLedger.createdAt, since)))
  if (n < MAX_FREE_PLANNING_PER_DAY) await refundCredits(userId, 'ai_assist', requestId)
}
const snapshotHits = new Map<string, number[]>()
function allowSnapshot(userId: string): boolean {
  const now = Date.now()
  const hits = (snapshotHits.get(userId) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= 12) { snapshotHits.set(userId, hits); return false }
  hits.push(now)
  snapshotHits.set(userId, hits)
  if (snapshotHits.size > 5000) snapshotHits.clear()
  return true
}
const MAX_LIVE_PRESENTATIONS = 500

presentations.get('/:id/chat', async (c) => {
  const userId = c.get('session')!.user.id // each person keeps their OWN assistant conversation, even on a shared deck
  const access = await resolveAccess(c.req.param('id'), userId)
  if (!access) return notFound(c)
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(mine(c.req.param('id'), access.ownerId))
  if (!p) return notFound(c)
  const rows = await db.select({ body: aiChatMessage.body }).from(aiChatMessage).where(and(eq(aiChatMessage.presentationId, p.id), eq(aiChatMessage.userId, userId))).orderBy(desc(aiChatMessage.createdAt)).limit(MAX_CHAT)
  return c.json({ success: true, data: rows.reverse().map((r) => r.body) })
})

presentations.post('/:id/chat', rateLimit({ windowMs: 60_000, max: 60, key: byUser('chat') }), zValidator('json', z.object({ messages: z.array(chatBody).min(1).max(4) })), async (c) => {
  const userId = c.get('session')!.user.id
  const access = await resolveAccess(c.req.param('id'), userId)
  if (!access) return notFound(c)
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(mine(c.req.param('id'), access.ownerId))
  if (!p) return notFound(c)
  const base = Date.now()
  await db.insert(aiChatMessage).values(c.req.valid('json').messages.map((m, i) => ({ id: nanoid(), presentationId: p.id, userId, role: m.role, body: m, createdAt: new Date(base + i) })))
  // keep the newest MAX_CHAT messages
  await db.execute(sql`DELETE FROM ai_chat_message WHERE presentation_id = ${p.id} AND user_id = ${userId} AND id NOT IN (SELECT id FROM ai_chat_message WHERE presentation_id = ${p.id} AND user_id = ${userId} ORDER BY created_at DESC LIMIT ${MAX_CHAT})`)
  return c.json({ success: true, data: { saved: true } })
})

presentations.delete('/:id/chat', async (c) => {
  const userId = c.get('session')!.user.id
  const access = await resolveAccess(c.req.param('id'), userId)
  if (!access) return notFound(c)
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(mine(c.req.param('id'), access.ownerId))
  if (!p) return notFound(c)
  await db.delete(aiChatMessage).where(and(eq(aiChatMessage.presentationId, p.id), eq(aiChatMessage.userId, userId)))
  return c.json({ success: true, data: { cleared: true } })
})
