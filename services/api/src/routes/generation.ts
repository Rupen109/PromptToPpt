import { getKit, MAX_KITS } from '../brand/kits.ts'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, count, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { AIUnavailableError } from '@prompttoppt/ai'
import { designById } from '@prompttoppt/theme'
import { deckLanguage, directionSchema, directionsSchema, promptAnalysisSchema } from '@prompttoppt/validation'
import { aiConfigured, catalog, gateway } from '../ai/gateway.ts'
import { defaultModel } from './models.ts'
import { analyzePrompt, directionsPrompt } from '../ai/prompts.ts'
import { db } from '../db/index.ts'
import { GateError } from '../billing/errors.ts'
import { estimateGeneration, refundCredits, reserveCredits } from '../billing/credits.ts'
import { assertModelTier, assertPresentationQuota, assertSlideLimit, getEntitlements } from '../billing/entitlements.ts'
import { aiUsageEvent, generationJob, presentation, presentationVersion, sourceDocument } from '../db/schema.ts'
import { env } from '../env.ts'
import { refuseIfOn } from '../flags/flags.ts'
import { decideMode, MAX_SLIDES, resolveSlideCount } from '../generation/policy.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const generation = new Hono<AppEnv>()
generation.use('*', requireAuth)

const err = (code: string, message: string) => ({ success: false as const, error: { code, message } })
const promptField = z.string().trim().min(3).max(4000)
const sourceIds = z.array(z.string().max(64)).max(10).default([])
/** a language from the deck language list (100+); anything else is a 400, so the model is never told an invented language */
const languageField = z.string().max(12).refine((c) => deckLanguage(c) !== undefined, 'Unknown language').optional()

/** Internal error text (stack fragments, provider messages, paths) never reaches the browser: only a short, plain-language reason does. */
const safeJobError = (e: string | null): string | null => (e ? (/^[A-Z][^\n]{0,140}$/.test(e) && !/(\bat\b .*\(|\/|\\|https?:|key|token|secret|SELECT|INSERT|ECONN|ENOTFOUND|undefined|\[object)/i.test(e) ? e : 'Generation failed. You were not charged — please try again.') : null)

const unavailable = (c: any, e: unknown) => {
  if (e instanceof AIUnavailableError) {
    console.error('[ai] unavailable:', e.causes)
    return c.json(err('AI_UNAVAILABLE', 'The AI service is busy or unavailable. Please try again in a moment.'), 503)
  }
  throw e
}

/**
 * Step 1 of the new-presentation flow: understand the request. Broad topic → 3–4 directions to pick from;
 * detailed → go straight to generation. The model analyses; `decideMode` (deterministic) decides.
 */
generation.post('/analyze', rateLimit({ windowMs: 60_000, max: 6, key: byUser('analyze') }), zValidator('json', z.object({ prompt: promptField, sourceIds, language: languageField })), async (c) => {
  if (!aiConfigured) return c.json(err('AI_NOT_CONFIGURED', 'AI is not configured on this server'), 503)
  const { prompt, sourceIds: srcIds, language } = c.req.valid('json')
  const chosen = deckLanguage(language)
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId)
  if (maint) return maint
  // /analyze costs real money but no credits: cap it per account per day
  const [{ n: analyses } = { n: 0 }] = await db.select({ n: count() }).from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, userId), eq(aiUsageEvent.requestType, 'prompt_analysis'), gte(aiUsageEvent.createdAt, new Date(Date.now() - 24 * 3600_000))))
  if (analyses >= ANALYZE_DAILY_LIMIT) return c.json(err('LIMIT_REACHED', 'You have reached today\'s limit for starting new presentations. Please try again tomorrow.'), 429)
  try {
    const found = await gateway.run({ route: 'fast', requestType: 'prompt_analysis', ...analyzePrompt(prompt, chosen), schema: promptAnalysisSchema, ctx: { userId } })
    const analysis = chosen ? { ...found, language: chosen.code } : found
    const mode = decideMode(prompt, analysis, srcIds.length > 0)
    const directions = mode === 'broad' ? (await gateway.run({ route: 'fast', requestType: 'direction_suggestion', ...directionsPrompt(analysis), schema: directionsSchema, ctx: { userId } })).directions : undefined
    const ent = await getEntitlements(userId)
    return c.json({ success: true, data: { mode, analysis, directions, suggestedSlideCount: resolveSlideCount(analysis, undefined, undefined, ent.limits.maxSlides), maxSlides: ent.limits.maxSlides, creditBalance: ent.credits.balance } })
  } catch (e) {
    return unavailable(c, e)
  }
})

const ANALYZE_DAILY_LIMIT = 80
const MAX_ACTIVE_JOBS_PER_USER = 2

const createJob = z.object({
  prompt: promptField,
  analysis: promptAnalysisSchema.optional(),
  direction: directionSchema.optional(),
  slideCount: z.number().int().min(3).max(MAX_SLIDES).optional(), // plan cap enforced below
  /** template design to build with; omitted → chosen from the deck's category and the plan */
  designId: z.string().max(80).optional(),
  /** rewrite this existing deck of yours instead of creating a new one */
  targetPresentationId: z.string().max(64).optional(),
  /** with targetPresentationId: keep all words, only replace the pictures */
  picturesOnly: z.boolean().default(false),
  /** catalog id the user picked (GET /models); omitted → the plan's default model */
  model: z.string().max(120).optional(),
  /** remix this deck of yours into a NEW deck (Pro/Gold): same look and format, content taken from the deck's text source (see POST /presentations/:id/remix-source) */
  remixOf: z.string().max(64).optional(),
  /** build a new deck in this brand kit (Pro/Gold); ignored when rewriting an existing deck */
  brandKitId: z.string().max(32).optional(),
  sourceIds,
  /** the language the person chose for the deck (any of the 100+ in the picker); omitted → detected from the request */
  language: languageField,
  /** generated once per user action in the client; retries of the same action reuse it */
  idempotencyKey: z.string().min(8).max(64),
})

const view = (j: typeof generationJob.$inferSelect) => {
  const r = (j.checkpoint as { report?: { pictures?: { slots: number; placed: number }; remaining?: unknown[] } }).report
  return { id: j.id, status: j.status, progress: j.progress, presentationId: j.presentationId, error: safeJobError(j.error), quality: r ? { pictureSlots: r.pictures?.slots ?? 0, picturesPlaced: r.pictures?.placed ?? 0, openIssues: r.remaining?.length ?? 0 } : null }
}

generation.post('/jobs', rateLimit({ windowMs: 60_000, max: 10, key: byUser('jobs') }), zValidator('json', createJob), async (c) => {
  if (!aiConfigured) return c.json(err('AI_NOT_CONFIGURED', 'AI is not configured on this server'), 503)
  const body = c.req.valid('json')
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId) // before any job exists or credits are reserved
  if (maint) return maint

  // Idempotent: same (user, key) returns the existing job — no second deck, no second charge.
  const [existing] = await db.select().from(generationJob).where(and(eq(generationJob.userId, userId), eq(generationJob.idempotencyKey, body.idempotencyKey)))
  if (existing) return c.json({ success: true, data: view(existing) }, 200)

  // Server-side limits (spec: never trust the client; plan-based limits replace this in Phase 5).
  const since = new Date(Date.now() - 24 * 3600_000)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(generationJob).where(and(eq(generationJob.userId, userId), gte(generationJob.createdAt, since)))
  if (n >= env.GENERATION_DAILY_LIMIT) return c.json(err('LIMIT_REACHED', `Daily generation limit (${env.GENERATION_DAILY_LIMIT}) reached`), 429)
  // one account must not fill the shared queue: a few at a time, the rest wait for these to finish
  const [{ active } = { active: 0 }] = await db.select({ active: count() }).from(generationJob).where(and(eq(generationJob.userId, userId), notInArray(generationJob.status, ['completed', 'failed', 'cancelled'])))
  if (active >= MAX_ACTIVE_JOBS_PER_USER) return c.json(err('LIMIT_REACHED', `You already have ${active} presentations being created. Wait for one to finish before starting another.`), 429)

  if (body.sourceIds.length) {
    const owned = await db.select({ id: sourceDocument.id }).from(sourceDocument).where(and(eq(sourceDocument.userId, userId), inArray(sourceDocument.id, body.sourceIds)))
    if (owned.length !== new Set(body.sourceIds).size) return c.json(err('INVALID_SOURCE', 'Unknown source'), 400)
  }

  // Plan gates — all decided from server-side entitlements, never from anything the client sent about its plan.
  const ent = await getEntitlements(userId)
  if (body.slideCount !== undefined) assertSlideLimit(ent, body.slideCount)
  const design = body.designId ? designById(body.designId) : undefined
  if (body.designId && !design) return c.json(err('INVALID_TEMPLATE', 'Unknown template'), 400)
  if (design?.premium && !ent.features.premiumTemplates) throw new GateError('UPGRADE_REQUIRED', `"${design.name}" is a Pro template.`, 403, { feature: 'premiumTemplates' })
  let remixAspect: string | undefined
  if (body.remixOf) {
    if (body.targetPresentationId) return c.json(err('INVALID_REQUEST', 'Choose either remix or rewrite'), 400)
    if (!body.sourceIds || body.sourceIds.length === 0) return c.json(err('REMIX_NEEDS_SOURCE', 'A remix needs the presentation text it is built from. Start the remix again.'), 400) // without it the model would invent content
    if (ent.plan.id === 'starter') throw new GateError('UPGRADE_REQUIRED', 'Remixing a presentation is available on Pro and Gold.', 403, { feature: 'remix' })
    const [orig] = await db.select({ aspectRatio: presentation.aspectRatio }).from(presentation).where(and(eq(presentation.id, body.remixOf), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (!orig) return c.json(err('NOT_FOUND', 'Presentation not found'), 404)
    remixAspect = orig.aspectRatio
  }
  if (body.brandKitId) {
    if ((MAX_KITS[ent.plan.id] ?? 0) === 0) throw new GateError('UPGRADE_REQUIRED', 'Brand kits are available on Pro and Gold.', 403, { feature: 'brand' })
    if (!(await getKit(userId, body.brandKitId))) return c.json(err('INVALID_BRAND_KIT', 'Unknown brand kit'), 400)
  }
  let target: { aspectRatio: string; slideCount: number } | undefined
  if (body.targetPresentationId) {
    const [t] = await db.select({ aspectRatio: presentation.aspectRatio, v: presentation.latestVersion }).from(presentation).where(and(eq(presentation.id, body.targetPresentationId), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (!t) return c.json(err('NOT_FOUND', 'Presentation not found'), 404)
    const [ver] = await db.select({ n: sql<number>`jsonb_array_length(${presentationVersion.document}->'slides')` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, body.targetPresentationId), eq(presentationVersion.version, t.v)))
    target = { aspectRatio: t.aspectRatio, slideCount: Number(ver?.n ?? 8) }
    // the deck's own sources (PDF / site / notes attached when it was created) stay the factual basis of every rewrite
    const [docRow] = await db.select({ ids: sql<string[]>`coalesce((select jsonb_agg(s->>'id') from jsonb_array_elements(${presentationVersion.document}->'sources') s), '[]'::jsonb)` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, body.targetPresentationId), eq(presentationVersion.version, t.v)))
    for (const sid of docRow?.ids ?? []) if (!body.sourceIds.includes(sid)) body.sourceIds.push(sid)
  } else assertPresentationQuota(ent) // a rewrite replaces an existing deck: it does not use up a new-deck allowance
  const slideCount = resolveSlideCount(body.analysis ?? ({ slideCount: undefined } as never), body.direction, body.slideCount ?? (target ? Math.min(Math.max(target.slideCount, 4), ent.limits.maxSlides) : undefined), ent.limits.maxSlides)
  // Model: the user's pick (or the plan default), validated against the live catalogue and THEIR plan's tiers.
  const { rows } = await catalog()
  const picked = body.model ? rows.find((r) => r.id === body.model && r.kind === 'text') : defaultModel(ent, rows)
  if (!picked) return c.json(err('INVALID_MODEL', body.model ? 'That model is not available.' : 'No models are available right now.'), 400)
  const tier = picked.accessTier as 'starter' | 'premium' | 'frontier'
  assertModelTier(ent, tier)
  if (body.picturesOnly && !body.targetPresentationId) return c.json(err('INVALID_REQUEST', 'picturesOnly needs a presentation'), 400)
  const estimate = await estimateGeneration(tier, body.picturesOnly ? Math.max(1, Math.ceil(slideCount / 4)) : slideCount)

  const id = nanoid()
  await reserveCredits(userId, estimate, 'job', id) // throws INSUFFICIENT_CREDITS (402) before any job exists
  const { prompt, idempotencyKey, ...rest } = body
  const options = { ...rest, slideCount, tier, model: picked.id, creditsReserved: estimate, premiumTemplates: ent.features.premiumTemplates, ...(target ? { aspectRatio: target.aspectRatio } : remixAspect ? { aspectRatio: remixAspect } : {}) }
  const [created] = await db.insert(generationJob).values({ id, userId, prompt, options, idempotencyKey }).onConflictDoNothing().returning()
  if (!created) {
    // lost a race with a concurrent identical request: give the credits back, return the winner
    await refundCredits(userId, 'job', id)
    const [again] = await db.select().from(generationJob).where(and(eq(generationJob.userId, userId), eq(generationJob.idempotencyKey, idempotencyKey)))
    return c.json({ success: true, data: view(again!) }, 200)
  }
  return c.json({ success: true, data: view(created) }, 201)
})

generation.get('/jobs/:id', async (c) => {
  const [job] = await db.select().from(generationJob).where(and(eq(generationJob.id, c.req.param('id')), eq(generationJob.userId, c.get('session')!.user.id)))
  if (!job) return c.json(err('NOT_FOUND', 'Job not found'), 404)
  return c.json({ success: true, data: view(job) })
})

generation.post('/jobs/:id/cancel', rateLimit({ windowMs: 60_000, max: 10, key: byUser('cancel') }), async (c) => {
  // Cancelling is free only while little work has been done. Once the model has been writing slides the provider has already been paid:
  // refunding then would let someone start-and-cancel jobs forever for free.
  const [before] = await db.select({ status: generationJob.status }).from(generationJob).where(and(eq(generationJob.id, c.req.param('id')), eq(generationJob.userId, c.get('session')!.user.id)))
  const [job] = await db
    .update(generationJob)
    .set({ status: 'cancelled', lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(generationJob.id, c.req.param('id')), eq(generationJob.userId, c.get('session')!.user.id), notInArray(generationJob.status, ['completed', 'failed', 'cancelled'])))
    .returning()
  if (!job) return c.json(err('NOT_FOUND', 'Job not found or already finished'), 404)
  const refundable = !before || ['queued', 'analyzing', 'outlining'].includes(before.status)
  if (refundable) await refundCredits(job.userId, 'job', job.id)
  return c.json({ success: true, data: { ...view(job), creditsRefunded: refundable } })
})
