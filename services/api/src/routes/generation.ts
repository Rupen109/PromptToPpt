import { getKit, MAX_KITS } from '../brand/kits.ts'
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
