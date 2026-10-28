import { zValidator } from '@hono/zod-validator'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { AIUnavailableError, ProviderError } from '@prompttoppt/ai'
import type { AccessTier } from '@prompttoppt/validation'
import { aiConfigured, catalog, gateway } from '../ai/gateway.ts'
import { creditPrice, refundCredits, reserveCredits } from '../billing/credits.ts'
import { resolveAccess } from '../collab/access.ts'
import { assertImagesEnabled, assertModelTier, countsTowardQuota, getEntitlements } from '../billing/entitlements.ts'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { generatedAsset, presentation } from '../db/schema.ts'
import { env } from '../env.ts'
import { isFlagOn, refuseIfOff } from '../flags/flags.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { extensionFor, getStorage } from '../storage/index.ts'

export const images = new Hono<AppEnv>()

export const IMAGE_STYLES = {
  photo: 'Photorealistic photograph, natural lighting, shallow depth of field',
  illustration: 'Clean modern flat vector illustration, soft shapes, limited palette',
  '3d': 'Soft 3D render, studio lighting, smooth materials',
  minimal: 'Minimalist composition with generous negative space and a calm palette',
  abstract: 'Abstract gradient shapes and flowing forms, no recognisable objects',
  watercolor: 'Delicate watercolour painting, soft edges, textured paper',
} as const

export const imageInput = z.object({
  prompt: z.string().trim().min(3).max(500),
  style: z.enum(Object.keys(IMAGE_STYLES) as [keyof typeof IMAGE_STYLES, ...(keyof typeof IMAGE_STYLES)[]]).optional(),
  aspect: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']).default('16:9'),
  model: z.string().max(120).optional(),
  /** one id per user action: a retry returns the same picture and is charged once */
  requestId: z.string().min(8).max(64),
})

/** What the image model is told. Pictures with words in them look broken in slides, so text is forbidden outright. */
export function composeImagePrompt(prompt: string, style?: keyof typeof IMAGE_STYLES): string {
  return [style ? `${IMAGE_STYLES[style]}.` : '', `Subject: ${prompt}.`, 'Composition suited to a presentation slide with calm areas for overlaid text. Absolutely no text, letters, numbers, logos, watermarks, captions or UI elements.'].filter(Boolean).join(' ')
}

const err = (c: any, status: 400 | 404 | 409 | 422 | 502 | 503, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const assetUrl = (id: string) => `${env.API_URL}/api/v1/assets/${id}`

async function usageFor(userId: string, presentationId: string, periodStart: Date) {
  const [[deck], [month]] = await Promise.all([
    db.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, userId), eq(generatedAsset.presentationId, presentationId), countsTowardQuota())),
    db.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, userId), sql`${generatedAsset.createdAt} >= ${periodStart}`, countsTowardQuota())),
  ])
  return { deck: deck?.n ?? 0, month: month?.n ?? 0 }
}

/** How many pictures this deck / this month may still get, plus what one costs — so the UI can show it BEFORE the user clicks. */
images.get('/presentations/:id/images/usage', requireAuth, async (c) => {
  const id = c.req.param('id')
  const access = await resolveAccess(id, c.get('session')!.user.id)
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  const userId = access.ownerId // pictures count against, and are paid by, the deck's owner
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(and(eq(presentation.id, id), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
  if (!p) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  const ent = await getEntitlements(userId)
  const u = await usageFor(userId, id, ent.period.start)
  return c.json({ success: true, data: { enabled: env.IMAGES_ENABLED && (await isFlagOn('image_generation', { userId })), deck: { used: u.deck, max: ent.limits.maxImagesPerPresentation }, month: { used: u.month, max: ent.limits.maxImagesPerMonth } } })
})

/**
 * Generate ONE picture for a deck. Order matters for cost safety:
 *   plan gate → tier gate → quota SLOT reserved (advisory-locked, so parallel requests can't exceed limits)
 *   → credits reserved → model runs → bytes stored → slot confirmed.
 * Any failure after a reservation releases both the slot and the credits.
 */
images.post('/presentations/:id/images', requireAuth, rateLimit({ windowMs: 60_000, max: 10, key: (c) => `img:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', imageInput), async (c) => {
  if (!env.IMAGES_ENABLED) return err(c, 503, 'IMAGES_DISABLED', 'Picture generation is temporarily switched off. Please try again later.')
  if (!aiConfigured) return err(c, 503, 'AI_NOT_CONFIGURED', 'AI is not configured on this server')
  const deckId = c.req.param('id')
  const access = await resolveAccess(deckId, c.get('session')!.user.id)
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  const userId = access.ownerId // a collaborator's picture is generated, stored and charged under the OWNER
  const off = await refuseIfOff('image_generation', c, userId) // owner kill-switch: before any slot or credit is reserved
  if (off) return off
  const input = c.req.valid('json')

  const [existing] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.userId, userId), eq(generatedAsset.requestId, input.requestId)))
  if (existing) {
    if (existing.status !== 'ready') return err(c, 409, 'IN_PROGRESS', 'This picture is still being generated.')
    const ent = await getEntitlements(userId)
    const u = await usageFor(userId, deckId, ent.period.start)
    return c.json({ success: true, data: { assetId: existing.id, url: assetUrl(existing.id), mime: existing.mime, creditsCharged: 0, model: existing.model, usage: { deck: { used: u.deck, max: ent.limits.maxImagesPerPresentation }, month: { used: u.month, max: ent.limits.maxImagesPerMonth } } } })
  }

  const ent = await getEntitlements(userId)
  assertImagesEnabled(ent)
  const [deck] = await db.select({ id: presentation.id }).from(presentation).where(and(eq(presentation.id, deckId), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
  if (!deck) return err(c, 404, 'NOT_FOUND', 'Presentation not found')

  const { rows } = await catalog()
  const imageRows = rows.filter((r) => r.kind === 'image')
  const allowedRows = imageRows.filter((r) => ent.features.modelTiers.includes(r.accessTier as AccessTier))
  const picked = input.model ? imageRows.find((r) => r.id === input.model) : allowedRows[0]
  if (!picked) return err(c, 400, 'INVALID_MODEL', 'That image model is not available.')
  const tier = picked.accessTier as AccessTier
  assertModelTier(ent, tier)
  const price = await creditPrice('image', tier)

  // 1) quota slot — serialised per user so two tabs clicking at once cannot both pass the limit check
  const assetId = nanoid(32)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`img:${userId}`}))`)
    const [[d], [m]] = await Promise.all([
      tx.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, userId), eq(generatedAsset.presentationId, deckId), countsTowardQuota())),
      tx.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, userId), sql`${generatedAsset.createdAt} >= ${ent.period.start}`, countsTowardQuota())),
    ])
    if ((d?.n ?? 0) >= ent.limits.maxImagesPerPresentation) {
      throw new GateError('LIMIT_REACHED', `This presentation has used its ${ent.limits.maxImagesPerPresentation} AI images on the ${ent.plan.name} plan.`, 429, { feature: 'images', scope: 'presentation', limit: ent.limits.maxImagesPerPresentation })
    }
    if ((m?.n ?? 0) >= ent.limits.maxImagesPerMonth) {
      throw new GateError('LIMIT_REACHED', `You've used your ${ent.limits.maxImagesPerMonth} AI images this month on the ${ent.plan.name} plan.`, 429, { feature: 'images', scope: 'month', limit: ent.limits.maxImagesPerMonth })
    }
    await tx.insert(generatedAsset).values({ id: assetId, userId, presentationId: deckId, status: 'pending', provider: picked.provider, model: picked.modelId, prompt: input.prompt, requestId: input.requestId, mime: '', bytes: 0, storageKey: '' })
  })
  const release = () => db.delete(generatedAsset).where(and(eq(generatedAsset.id, assetId), eq(generatedAsset.status, 'pending')))

  // 2) credits
  try {
    await reserveCredits(userId, price, 'image', input.requestId, { strict: true })
  } catch (e) {
    await release()
    throw e
  }

  // 3) model → 4) storage → 5) confirm
  try {
    const result = await gateway.image({ model: picked.id, prompt: composeImagePrompt(input.prompt, input.style), aspectRatio: input.aspect, ctx: { userId, presentationId: deckId } })
    const key = `${assetId}.${extensionFor(result.mime)}`
    await (await getStorage()).put(key, result.bytes, result.mime)
    await db.update(generatedAsset).set({ status: 'ready', provider: result.model.provider, model: result.model.model, mime: result.mime, bytes: result.bytes.length, storageKey: key, providerCostUsd: String(result.providerCostUsd) }).where(eq(generatedAsset.id, assetId))
    const u = await usageFor(userId, deckId, ent.period.start)
    return c.json({ success: true, data: { assetId, url: assetUrl(assetId), mime: result.mime, creditsCharged: price, model: picked.id, usage: { deck: { used: u.deck, max: ent.limits.maxImagesPerPresentation }, month: { used: u.month, max: ent.limits.maxImagesPerMonth } } } })
  } catch (e) {
    await Promise.all([refundCredits(userId, 'image', input.requestId), release()])
    if (e instanceof ProviderError && e.code === 'blocked') return err(c, 422, 'IMAGE_BLOCKED', "The image model declined that description (safety filter). Try describing it differently — you weren't charged.")
    if (e instanceof AIUnavailableError) return err(c, 503, 'AI_UNAVAILABLE', "The image service is busy or unavailable. You weren't charged — please try again.")
    console.error('[image]', e)
    return err(c, 502, 'IMAGE_FAILED', "The picture could not be created. You weren't charged.")
  }
})
