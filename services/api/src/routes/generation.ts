import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, count, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { AIUnavailableError } from '@prompttoppt/ai'
import { designById, getTheme } from '@prompttoppt/theme'
import { SCHEMA_VERSION, deckLanguage, directionSchema, directionsSchema, promptAnalysisSchema } from '@prompttoppt/validation'
import { aiConfigured, catalog, gateway } from '../ai/gateway.ts'
import { insertDeck } from '../decks/create.ts'
import { closeDeck, placeholderSlide } from '../generation/progress.ts'
import { laneOfSpeed, PARALLEL_BY_LANE } from '../generation/queue.ts'
import { notifyJob } from '../generation/wake.ts'
import { createJob, err, languageField, promptField, sourceIds, startDeckJob } from '../generation/start.ts'
import { jobView as view } from '../generation/view.ts'
import { chooseModel } from './models.ts'
import { analyzePrompt, directionsPrompt } from '../ai/prompts.ts'
import { db } from '../db/index.ts'
import { GateError } from '../billing/errors.ts'
import { creditPrice, estimateGeneration, refundCredits, reserveCredits } from '../billing/credits.ts'
import { matchMorph } from '../generation/morph-match.ts'
import { logDecision } from '../generation/morph-log.ts'
import { planScenes, requestFacts } from '../generation/morph-scenes.ts'
import { getMorphTemplate } from '@prompttoppt/theme/morph-templates'
import { assertModelTier, assertMorph, assertPresentationQuota, assertSlideLimit, getEntitlements } from '../billing/entitlements.ts'
import { aiUsageEvent, generationJob, presentation, presentationVersion, sourceDocument } from '../db/schema.ts'
import { env } from '../env.ts'
import { refuseIfOn } from '../flags/flags.ts'
import { decideMode, MAX_SLIDES, resolveSlideCount } from '../generation/policy.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const generation = new Hono<AppEnv>()
generation.use('*', requireAuth)


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


/**
 * The lengths a deck from this template can have for this request (the template is drawn with 11 to 20 scenes; scenes the request cannot fill are left out, and a person may want it
 * shorter), within the plan's slides per deck. No model: the same plan the job will use. The create page shows these as the length buttons.
 */
generation.post('/morph-lengths', rateLimit({ windowMs: 60_000, max: 60, key: byUser('morph-lengths') }), zValidator('json', z.object({ templateId: z.string().max(40), prompt: promptField, analysis: promptAnalysisSchema })), async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await getEntitlements(userId)
  assertMorph(ent)
  const { templateId, prompt, analysis } = c.req.valid('json')
  const tpl = getMorphTemplate(templateId)
  if (!tpl) return c.json(err('INVALID_MORPH_TEMPLATE', 'That Morph template does not exist.'), 400)
  const plan = planScenes(tpl, requestFacts(analysis, prompt))
  const titles = new Map(tpl.scenes.map((s) => [s.id, s.title]))
  const lengths = plan.lengths.filter((n) => n <= ent.limits.maxSlides)
  return c.json({ success: true, data: { template: tpl.id, lengths, fullLength: tpl.scenes.length, leftOut: plan.dropped.filter((d) => d.why === 'cannot-fill').map((d) => ({ scene: d.scene, title: titles.get(d.scene) ?? d.scene })), tooLong: lengths.length === 0 } })
})

const MORPH_MATCH_DAILY_LIMIT = 200
/** The last answers, so choosing "best match", switching away and back, or a page reload does not ask the model again. Per person and request; ten minutes. */
const matchCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof matchMorph>> }>()
const MATCH_TTL_MS = 10 * 60_000

/**
 * Step 2 of the new-presentation flow, for a Morph deck: which designed template fits this request, or none (then the deck is designed from the topic). Answered BEFORE the deck
 * is started because the template decides the slide count, the credits and the first frame. Gold and Premium only (the same gate as Morph itself).
 */
generation.post('/morph-match', rateLimit({ windowMs: 60_000, max: 12, key: byUser('morph-match') }), zValidator('json', z.object({ prompt: promptField, analysis: promptAnalysisSchema })), async (c) => {
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId)
  if (maint) return maint
  const ent = await getEntitlements(userId)
  assertMorph(ent)
  const { prompt, analysis } = c.req.valid('json')
  const limits = { maxSlides: ent.limits.maxSlides, balance: ent.credits.balance, slideCreditsFloor: await creditPrice('generate_slide', 'starter') }
  const key = `${userId}|${JSON.stringify([prompt, analysis, limits.maxSlides, Math.floor(limits.balance / 50)])}`
  const hit = matchCache.get(key)
  if (hit && Date.now() - hit.at < MATCH_TTL_MS) return c.json({ success: true, data: hit.data })
  // costs a little real money but no credits: cap it per account per day
  const [{ n: used } = { n: 0 }] = await db.select({ n: count() }).from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, userId), eq(aiUsageEvent.requestType, 'morph_match'), gte(aiUsageEvent.createdAt, new Date(Date.now() - 24 * 3600_000))))
  const data = used >= MORPH_MATCH_DAILY_LIMIT
    ? await matchMorph({ analysis, prompt, limits }, { userId }, async () => { throw new Error('daily limit') }) // no more model calls today: the shortlist alone decides
    : await matchMorph({ analysis, prompt, limits }, { userId })
  await logDecision(userId, prompt, analysis, data)
  if (matchCache.size > 500) matchCache.delete(matchCache.keys().next().value!)
  matchCache.set(key, { at: Date.now(), data })
  return c.json({ success: true, data })
})



generation.post('/jobs', rateLimit({ windowMs: 60_000, max: 10, key: byUser('jobs') }), zValidator('json', createJob), async (c) => {
  if (!aiConfigured) return c.json(err('AI_NOT_CONFIGURED', 'AI is not configured on this server'), 503)
  const body = c.req.valid('json')
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId) // before any job exists or credits are reserved
  if (maint) return maint

  const r = await startDeckJob(userId, body)
  return c.json(r.body as never, r.status as 200)
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
  // the open deck keeps what was written; a deck with nothing written yet goes away with the job
  if (job.presentationId && !(job.options as { targetPresentationId?: string }).targetPresentationId) await closeDeck(job.id, job.presentationId, job.userId)
  const refundable = !before || ['queued', 'analyzing', 'outlining'].includes(before.status)
  if (refundable) await refundCredits(job.userId, 'job', job.id)
  return c.json({ success: true, data: { ...view(job), creditsRefunded: refundable } })
})
