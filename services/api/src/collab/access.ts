import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { presentation, presentationMember } from '../db/schema.ts'
import { livePlanFor } from '../billing/entitlements.ts'
import { GateError } from '../billing/errors.ts'

/** Collaborators allowed per deck, by the OWNER's plan (the plan flag `advancedSharing` switches collaboration on at all). */
export const COLLABORATOR_LIMITS: Record<string, number> = { pro: 3, gold: 10 }

export type Role = 'owner' | 'editor'

/**
 * Who may open this presentation, and whose deck it really is. The owner always may. A collaborator may while their membership is ACTIVE and the owner's
 * plan still includes collaboration. Everything a collaborator does is paid for by `ownerId`: credits, model tiers, picture quota and the AI usage ledger
 * all use the owner's identity, never the collaborator's.
 */
export async function resolveAccess(presentationId: string, actorId: string): Promise<{ ownerId: string; role: Role } | null> {
  const [p] = await db.select({ ownerId: presentation.userId }).from(presentation).where(and(eq(presentation.id, presentationId), isNull(presentation.deletedAt)))
  if (!p) return null
  if (p.ownerId === actorId) return { ownerId: p.ownerId, role: 'owner' }
  const [m] = await db
    .select({ id: presentationMember.id })
    .from(presentationMember)
    .where(and(eq(presentationMember.presentationId, presentationId), eq(presentationMember.userId, actorId), eq(presentationMember.status, 'active')))
  if (!m) return null // a stranger learns nothing: same answer as "no such deck"
  const { plan } = await livePlanFor(p.ownerId)
  if (!plan.features.advancedSharing) throw new GateError('UPGRADE_REQUIRED', "Editing together is paused: the owner's plan no longer includes collaboration.", 403, { feature: 'collaboration' })
  return { ownerId: p.ownerId, role: 'editor' }
}
