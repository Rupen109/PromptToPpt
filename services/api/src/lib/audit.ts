import { nanoid } from 'nanoid'
import { env } from '../env.ts'
import { db } from '../db/index.ts'
import { auditLog } from '../db/schema.ts'

/**
 * Records an important business/security event in the audit log. Fire-and-forget and never throws: failing to audit must
 * not break the action itself. `meta` must be small and safe — ids, plan names, before/after values; NEVER secrets, tokens,
 * card data, prompts or personal content.
 */
export function audit(actorUserId: string, action: string, meta: Record<string, unknown> = {}, ip?: string | null): Promise<void> {
  try {
    return db.insert(auditLog).values({ id: nanoid(), actorUserId, action, meta, ip: ip ?? null, createdAt: new Date() }).then(
      () => undefined,
      (e) => void console.error('[audit]', e),
    )
  } catch (e) {
    console.error('[audit]', e)
    return Promise.resolve()
  }
}

/**
 * Client IP for audit rows: the entry our OWN proxies appended (TRUSTED_PROXY_HOPS from the right), never the client-supplied left-most value —
 * otherwise anyone can write any address into the audit trail.
 */
export const ipOf = (headers: Headers): string | null => {
  if (env.TRUSTED_PROXY_HOPS <= 0) return null
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  return parts[parts.length - env.TRUSTED_PROXY_HOPS] ?? null
}
