import { and, count, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { designById, getTheme } from '@prompttoppt/theme'
import { SCHEMA_VERSION, deckLanguage, directionSchema, promptAnalysisSchema } from '@prompttoppt/validation'
import { catalog } from '../ai/gateway.ts'
import { chooseModel } from '../routes/models.ts'
import { getKit, MAX_KITS } from '../brand/kits.ts'
import { GateError } from '../billing/errors.ts'
import { estimateGeneration, refundCredits, reserveCredits } from '../billing/credits.ts'
import { assertModelTier, morphDecksUsed, assertMorph, assertMorphQuota, assertPresentationQuota, assertSlideLimit, getEntitlements } from '../billing/entitlements.ts'
import { insertDeck } from '../decks/create.ts'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion, sourceDocument } from '../db/schema.ts'
import { env } from '../env.ts'
import { MAX_SLIDES, resolveSlideCount } from './policy.ts'
import { placeholderSlide } from './progress.ts'
import { laneOfSpeed, PARALLEL_BY_LANE } from './queue.ts'
import { notifyJob } from './wake.ts'
import { jobView as view } from './view.ts'

/**
 * Starting a deck: every gate, the credit reservation, the deck itself (created now, written into as it is generated) and the job.
 * One function for everything that starts a generation (the route, tools and scripts), so there is a single place where the rules live.
 */
export const err = (code: string, message: string) => ({ success: false as const, error: { code, message } })
export const MAX_ACTIVE_JOBS_PER_USER = 2
export const promptField = z.string().trim().min(3).max(4000)
export const sourceIds = z.array(z.string().max(64)).max(10).default([])
/** a language from the deck language list (100+); anything else is a 400, so the model is never told an invented language */
export const languageField = z.string().max(12).refine((c) => deckLanguage(c) !== undefined, 'Unknown language').optional()

export const createJob = z.object({
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
  /** build a Morph deck: slides made from the same elements, which move and regroup from slide to slide (Gold/Premium; a new presentation only) */
  morph: z.boolean().optional(),
  /** the language the person chose for the deck (any of the 100+ in the picker); omitted → detected from the request */
  language: languageField,
  /** generated once per user action in the client; retries of the same action reuse it */
  idempotencyKey: z.string().min(8).max(64),
})

export type CreateJobInput = z.infer<typeof createJob>

/** The result is what the route sends: a status and a JSON body (gate errors are thrown, as before, and rendered by the app's error handler). */
export async function startDeckJob(userId: string, body: CreateJobInput): Promise<{ status: number; body: unknown }> {
  const reply = (b: unknown, status: number) => ({ status, body: b })
  // Idempotent: same (user, key) returns the existing job — no second deck, no second charge.
  const [existing] = await db.select().from(generationJob).where(and(eq(generationJob.userId, userId), eq(generationJob.idempotencyKey, body.idempotencyKey)))
  if (existing) return reply({ success: true, data: view(existing) }, 200)

  // Server-side limits (spec: never trust the client; plan-based limits replace this in Phase 5).
  const since = new Date(Date.now() - 24 * 3600_000)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(generationJob).where(and(eq(generationJob.userId, userId), gte(generationJob.createdAt, since)))
  if (n >= env.GENERATION_DAILY_LIMIT) return reply(err('LIMIT_REACHED', `Daily generation limit (${env.GENERATION_DAILY_LIMIT}) reached`), 429)
  // one account must not fill the shared queue: a few at a time, the rest wait for these to finish
  const [{ active } = { active: 0 }] = await db.select({ active: count() }).from(generationJob).where(and(eq(generationJob.userId, userId), notInArray(generationJob.status, ['completed', 'failed', 'cancelled'])))
  if (active >= MAX_ACTIVE_JOBS_PER_USER) return reply(err('LIMIT_REACHED', `You already have ${active} presentations being created. Wait for one to finish before starting another.`), 429)

  if (body.sourceIds.length) {
    const owned = await db.select({ id: sourceDocument.id }).from(sourceDocument).where(and(eq(sourceDocument.userId, userId), inArray(sourceDocument.id, body.sourceIds)))
    if (owned.length !== new Set(body.sourceIds).size) return reply(err('INVALID_SOURCE', 'Unknown source'), 400)
  }

  // Plan gates — all decided from server-side entitlements, never from anything the client sent about its plan.
  const ent = await getEntitlements(userId)
  if (body.slideCount !== undefined) assertSlideLimit(ent, body.slideCount)
  const design = body.designId ? designById(body.designId) : undefined
  if (body.designId && !design) return reply(err('INVALID_TEMPLATE', 'Unknown template'), 400)
  if (design?.premium && !ent.features.premiumTemplates) throw new GateError('UPGRADE_REQUIRED', `"${design.name}" is a Pro template.`, 403, { feature: 'premiumTemplates' })
  let remixAspect: string | undefined
  if (body.remixOf) {
    if (body.targetPresentationId) return reply(err('INVALID_REQUEST', 'Choose either remix or rewrite'), 400)
    if (!body.sourceIds || body.sourceIds.length === 0) return reply(err('REMIX_NEEDS_SOURCE', 'A remix needs the presentation text it is built from. Start the remix again.'), 400) // without it the model would invent content
    if (ent.plan.id === 'starter') throw new GateError('UPGRADE_REQUIRED', 'Remixing a presentation is available on Pro, Gold and Premium.', 403, { feature: 'remix' })
    const [orig] = await db.select({ aspectRatio: presentation.aspectRatio }).from(presentation).where(and(eq(presentation.id, body.remixOf), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (!orig) return reply(err('NOT_FOUND', 'Presentation not found'), 404)
    remixAspect = orig.aspectRatio
  }
  if (body.morph) {
    if (body.targetPresentationId || body.remixOf || body.picturesOnly) return reply(err('INVALID_REQUEST', 'A Morph presentation is made as a new presentation.'), 400)
    assertMorph(ent) // Gold and Premium: checked here from the plan, never from what the browser says
    assertMorphQuota(ent) // this month's allowance (re-checked under a lock below, so parallel starts cannot pass together)
  }
  if (body.brandKitId) {
    if ((MAX_KITS[ent.plan.id] ?? 0) === 0) throw new GateError('UPGRADE_REQUIRED', 'Brand kits are available on Pro, Gold and Premium.', 403, { feature: 'brand' })
    if (!(await getKit(userId, body.brandKitId))) return reply(err('INVALID_BRAND_KIT', 'Unknown brand kit'), 400)
  }
  let target: { aspectRatio: string; slideCount: number } | undefined
  if (body.targetPresentationId) {
    const [t] = await db.select({ aspectRatio: presentation.aspectRatio, v: presentation.latestVersion }).from(presentation).where(and(eq(presentation.id, body.targetPresentationId), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
    if (!t) return reply(err('NOT_FOUND', 'Presentation not found'), 404)
    const [ver] = await db.select({ n: sql<number>`jsonb_array_length(${presentationVersion.document}->'slides')` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, body.targetPresentationId), eq(presentationVersion.version, t.v)))
    target = { aspectRatio: t.aspectRatio, slideCount: Number(ver?.n ?? 8) }
    // the deck's own sources (PDF / site / notes attached when it was created) stay the factual basis of every rewrite
    const [docRow] = await db.select({ ids: sql<string[]>`coalesce((select jsonb_agg(s->>'id') from jsonb_array_elements(${presentationVersion.document}->'sources') s), '[]'::jsonb)` }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, body.targetPresentationId), eq(presentationVersion.version, t.v)))
    for (const sid of docRow?.ids ?? []) if (!body.sourceIds.includes(sid)) body.sourceIds.push(sid)
  } else assertPresentationQuota(ent) // a rewrite replaces an existing deck: it does not use up a new-deck allowance
  const slideCount = resolveSlideCount(body.analysis ?? ({ slideCount: undefined } as never), body.direction, body.slideCount ?? (target ? Math.min(Math.max(target.slideCount, 4), ent.limits.maxSlides) : undefined), ent.limits.maxSlides)
  // Model: the user's pick (or the plan default), validated against the live catalogue and THEIR plan's tiers.
  const { rows } = await catalog()
  const picked = chooseModel(ent, rows, body.model)
  if (!picked) return reply(err('INVALID_MODEL', body.model ? 'That model is not available.' : 'No models are available right now.'), 400)
  const tier = picked.accessTier as 'starter' | 'premium' | 'frontier'
  assertModelTier(ent, tier)
  if (body.picturesOnly && !body.targetPresentationId) return reply(err('INVALID_REQUEST', 'picturesOnly needs a presentation'), 400)
  const estimate = await estimateGeneration(tier, body.picturesOnly ? Math.max(1, Math.ceil(slideCount / 4)) : slideCount)

  const id = nanoid()
  await reserveCredits(userId, estimate, 'job', id) // throws INSUFFICIENT_CREDITS (402) before any job exists
  const { prompt, idempotencyKey, ...rest } = body
  const lane = laneOfSpeed(ent.features.speed)
  const options: Record<string, unknown> & { slideIds?: string[] } = { ...rest, parallel: PARALLEL_BY_LANE[lane], slideCount, tier, model: picked.id, creditsReserved: estimate, premiumTemplates: ent.features.premiumTemplates, ...(target ? { aspectRatio: target.aspectRatio } : remixAspect ? { aspectRatio: remixAspect } : {}) }
  // A NEW deck (or remix) exists from this moment: the browser opens it at once and watches it being written. A rewrite changes an existing deck at the end.
  let deckId: string | null = null
  if (!target) {
    const aspect = ((options as { aspectRatio?: string }).aspectRatio ?? '16:9') as '16:9' | '4:3' | '1:1'
    const theme = getTheme('cobalt')
    deckId = nanoid()
    const slides = Array.from({ length: slideCount }, () => placeholderSlide(nanoid(12), '', theme))
    const title = prompt.replace(/\s+/g, ' ').slice(0, 60)
    try {
      await insertDeck(userId, ent, { id: deckId, title, aspectRatio: aspect, doc: { schemaVersion: SCHEMA_VERSION, id: deckId, title, aspectRatio: aspect, language: 'en', theme, sources: [], slides } })
    } catch (e) {
      await refundCredits(userId, 'job', id) // the deck limit said no: nothing was started, nothing is charged
      throw e
    }
    options.slideIds = slides.map((sl) => sl.id)
  }
  const [created] = await db.insert(generationJob).values({ id, userId, prompt, options, idempotencyKey, lane, ...(deckId ? { presentationId: deckId, checkpoint: { slideIds: options.slideIds } } : {}) }).onConflictDoNothing().returning()
  if (!created) {
    // lost a race with a concurrent identical request: give the credits back (and the empty deck), return the winner
    await refundCredits(userId, 'job', id)
    if (deckId) await db.delete(presentation).where(eq(presentation.id, deckId))
    const [again] = await db.select().from(generationJob).where(and(eq(generationJob.userId, userId), eq(generationJob.idempotencyKey, idempotencyKey)))
    return reply({ success: true, data: view(again!) }, 200)
  }
  if (body.morph) {
    // Parallel starts can all read "9 of 10 used" and all pass the check above. Counting AFTER the insert, in a fixed order (time, then id), lets exactly the first ones in stay.
    const rank = await morphDecksUsed(userId, ent.period.start, { createdAt: created.createdAt, id: created.id })
    if (rank > ent.features.morphDecksPerMonth) {
      await refundCredits(userId, 'job', id)
      await db.delete(generationJob).where(eq(generationJob.id, id))
      if (deckId) await db.delete(presentation).where(eq(presentation.id, deckId))
      assertMorphQuota({ ...ent, usage: { ...ent.usage, morphDecksThisPeriod: rank } })
    }
  }
  await notifyJob() // an idle worker starts it now
  return reply({ success: true, data: view(created) }, 201)
}
