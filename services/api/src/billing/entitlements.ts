import { and, eq, gte, isNull, notInArray, sql } from 'drizzle-orm'
import type { AccessTier, Entitlements, ExportFormat, PlanId } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { generatedAsset, generationJob, plan, presentation, subscription } from '../db/schema.ts'
import { GateError } from './errors.ts'

/** A picture counts once it exists — or while its model call is still running (a reserved slot), but not forever if the server died mid-call. */
export const PENDING_SLOT_MS = 5 * 60_000
/** Stock photos chosen for generated decks are free pictures, not AI-image spend — only AI-generated pictures count toward the plan's image limits. */
export const countsTowardQuota = () => sql`(${generatedAsset.kind} not in ('stock', 'logo', 'brand') and (${generatedAsset.status} = 'ready' or ${generatedAsset.createdAt} > now() - interval '5 minutes'))`

const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
const startOfNextMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))

export interface Period {
  key: string
  start: Date
  end: Date
}

/** The allowance period: subscription period for paid users, calendar month (UTC) for Starter. */
export function periodFor(sub: { currentPeriodStart: Date; currentPeriodEnd: Date } | null, now = new Date()): Period {
  if (sub) return { key: sub.currentPeriodStart.toISOString(), start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
  const start = startOfMonthUtc(now)
  return { key: start.toISOString().slice(0, 7), start, end: startOfNextMonthUtc(now) }
}

/** A subscription counts while its period is running (past_due keeps access until the period ends). */
const LIVE = ['active', 'trialing', 'past_due']
export async function livePlanFor(userId: string, now = new Date()) {
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId))
  const live = sub && LIVE.includes(sub.status) && sub.currentPeriodEnd > now ? sub : null
  const [p] = await db.select().from(plan).where(eq(plan.id, live?.planId ?? 'starter'))
  if (!p) throw new Error('plan catalogue is not seeded')
  return { plan: p, sub: live, period: periodFor(live, now) }
}

/** Everything the server needs to authorise an action for this user. Never derived from client input. */
export async function getEntitlements(userId: string, now = new Date()): Promise<Entitlements & { period: Period }> {
  const { ensureAllowance } = await import('./credits.ts')
  const { plan: p, period } = await livePlanFor(userId, now)
  const balance = await ensureAllowance(userId, p, period)

  const [{ n: created } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(presentation)
    .where(and(eq(presentation.userId, userId), gte(presentation.createdAt, period.start)))
  const [{ n: inflight } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generationJob)
    .where(and(eq(generationJob.userId, userId), notInArray(generationJob.status, ['completed', 'failed', 'cancelled']), isNull(generationJob.presentationId), sql`${generationJob.options}->>'targetPresentationId' is null`, gte(generationJob.createdAt, period.start)))

  const morphDecks = await morphDecksUsed(userId, period.start)
  const [{ n: images } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generatedAsset)
    .where(and(eq(generatedAsset.userId, userId), gte(generatedAsset.createdAt, period.start), countsTowardQuota()))

  return {
    plan: { id: p.id as PlanId, name: p.name },
    features: p.features,
    limits: { maxSlides: p.maxSlides, maxPresentationsPerMonth: p.maxPresentationsPerMonth, maxImagesPerPresentation: p.maxImagesPerPresentation, maxImagesPerMonth: p.maxImagesPerMonth },
    credits: { balance, monthlyAllowance: p.monthlyCredits, resetsAt: period.end.toISOString() },
    usage: { presentationsThisPeriod: created + inflight, imagesThisPeriod: images, morphDecksThisPeriod: morphDecks },
    period,
  }
}

/** Until the model picker (B3) the tier follows the plan: best allowed non-frontier tier. */
export const defaultTier = (ent: Pick<Entitlements, 'features'>): AccessTier => (ent.features.modelTiers.includes('premium') ? 'premium' : 'starter')

// ─── gates (each throws GateError → stable JSON code for the UI) ──────────────────────────

export function assertModelTier(ent: Pick<Entitlements, 'features' | 'plan'>, tier: AccessTier) {
  if (!ent.features.modelTiers.includes(tier)) {
    throw new GateError('UPGRADE_REQUIRED', `${tier === 'frontier' ? 'Frontier' : 'Premium'} models are not included in the ${ent.plan.name} plan.`, 403, { feature: 'model', tier })
  }
}

export function assertSlideLimit(ent: Pick<Entitlements, 'limits' | 'plan'>, slides: number) {
  if (slides > ent.limits.maxSlides) {
    throw new GateError('UPGRADE_REQUIRED', `The ${ent.plan.name} plan allows up to ${ent.limits.maxSlides} slides per presentation.`, 403, { feature: 'slides', limit: ent.limits.maxSlides })
  }
}

export function assertPresentationQuota(ent: Pick<Entitlements, 'limits' | 'usage' | 'plan'>) {
  const cap = ent.limits.maxPresentationsPerMonth
  if (cap !== null && ent.usage.presentationsThisPeriod >= cap) {
    throw new GateError('LIMIT_REACHED', `You've reached ${cap} presentations this month on the ${ent.plan.name} plan.`, 429, { feature: 'presentations', limit: cap })
  }
}

export function assertAiEdits(ent: Pick<Entitlements, 'features' | 'plan'>) {
  if (!ent.features.aiEdits) throw new GateError('UPGRADE_REQUIRED', `AI edits are not included in the ${ent.plan.name} plan.`, 403, { feature: 'aiEdits' })
}

/** "Live preview": presenting full screen and share links. Starter can build and edit but not show or share a deck. */
export function assertLivePreview(ent: Pick<Entitlements, 'features' | 'plan'>) {
  if (!ent.features.livePreview) throw new GateError('UPGRADE_REQUIRED', `Presenting and sharing are not included in the ${ent.plan.name} plan.`, 403, { feature: 'livePreview' })
}

export function assertAskDeck(ent: Pick<Entitlements, 'features' | 'plan'>) {
  if (!ent.features.askDeck) throw new GateError('UPGRADE_REQUIRED', `Chat with your presentation is not included in the ${ent.plan.name} plan.`, 403, { feature: 'askDeck' })
}

/** Morph animation (Gold and Premium): Morph transitions, Morph templates, AI-built Morph decks. Checked when a deck's Morph content is ADDED or CHANGED, so a later downgrade keeps old decks playing but locks editing them. */
export function assertMorph(ent: Pick<Entitlements, 'features' | 'plan'>) {
  if (!ent.features.morph) throw new GateError('UPGRADE_REQUIRED', 'Morph animation is available on the Gold plan.', 403, { feature: 'morph' })
}

/** The month's allowance of AI-built Morph decks (counted from the jobs; a failed or cancelled one does not count). */
export function assertMorphQuota(ent: Pick<Entitlements, 'features' | 'usage' | 'plan'>) {
  const cap = ent.features.morphDecksPerMonth
  if (ent.usage.morphDecksThisPeriod >= cap) throw new GateError('LIMIT_REACHED', `You've used your ${cap} Morph decks for this month on the ${ent.plan.name} plan.`, 429, { feature: 'morph', limit: cap })
}

/** Morph decks the AI has built (or is building) for a person since `since`: the jobs that were not refused, failed or cancelled. */
export async function morphDecksUsed(userId: string, since: Date, atOrBefore?: { createdAt: Date; id: string }): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(generationJob).where(and(
    eq(generationJob.userId, userId), gte(generationJob.createdAt, since), sql`${generationJob.options}->>'morph' = 'true'`, notInArray(generationJob.status, ['failed', 'cancelled']),
    ...(atOrBefore ? [sql`(${generationJob.createdAt}, ${generationJob.id}) <= (${atOrBefore.createdAt}, ${atOrBefore.id})`] : []),
  ))
  return row?.n ?? 0
}

/** 'wikipedia' needs Pro or Gold; 'web' (live web search, costs credits) needs Gold. */
export function assertWebData(ent: Pick<Entitlements, 'features' | 'plan'>, mode: 'wikipedia' | 'web') {
  const have = ent.features.webData ?? 'none'
  if (have === 'web' || (have === 'wikipedia' && mode === 'wikipedia')) return
  throw new GateError('UPGRADE_REQUIRED', mode === 'web' ? `Web search is not included in the ${ent.plan.name} plan.` : `Wikipedia data is not included in the ${ent.plan.name} plan.`, 403, { feature: 'webData', mode })
}

export function assertExport(ent: Pick<Entitlements, 'features' | 'plan'>, format: ExportFormat) {
  if (!ent.features.exportFormats.includes(format)) {
    throw new GateError('UPGRADE_REQUIRED', ent.features.exportFormats.length === 0 ? `Export is not available on the ${ent.plan.name} plan. Upgrade to export.` : `${format.toUpperCase()} export is not included in the ${ent.plan.name} plan.`, 403, { feature: 'export', format })
  }
}


export function assertImagesEnabled(ent: Pick<Entitlements, 'plan' | 'limits'>) {
  if (ent.limits.maxImagesPerPresentation <= 0 || ent.limits.maxImagesPerMonth <= 0) {
    throw new GateError('UPGRADE_REQUIRED', `AI images are not included in the ${ent.plan.name} plan.`, 403, { feature: 'images' })
  }
}
