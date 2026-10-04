import { and, count, desc, eq, gte, ilike, lt, notLike, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { auditLog, user } from '../db/schema.ts'
import { rangeOf, rangeSchema } from './range.ts'

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

export const auditFilters = rangeSchema.extend({
  actor: z.string().trim().max(200).optional(),
  action: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  ip: z.string().trim().max(64).optional(),
  /** the admin middleware audits every admin GET, including these views; hidden unless asked for */
  includeSelf: bool.default(false),
})
export const auditListQuery = auditFilters.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
})
export type AuditFilters = z.infer<typeof auditFilters>

const SELF_PREFIX = 'admin.audit'
export const MAX_CSV_ROWS = 10_000
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

function where(f: AuditFilters, opts: { skipAction?: boolean } = {}): SQL | undefined {
  const { from, to } = rangeOf(f)
  const w: (SQL | undefined)[] = [gte(auditLog.createdAt, from), lt(auditLog.createdAt, to)]
  if (f.actor) w.push(or(eq(auditLog.actorUserId, f.actor), ilike(user.email, `%${likeEscape(f.actor)}%`)))
  if (f.action && !opts.skipAction) w.push(or(eq(auditLog.action, f.action), sql`${auditLog.action} like ${`${likeEscape(f.action)}%`}`))
  if (f.q) w.push(sql`${auditLog.meta}::text ilike ${`%${likeEscape(f.q)}%`}`)
  if (f.ip) w.push(eq(auditLog.ip, f.ip))
  if (!f.includeSelf) w.push(notLike(auditLog.action, `${SELF_PREFIX}%`))
  return and(...w)
}

const base = () => db.select({ id: auditLog.id, createdAt: auditLog.createdAt, actorUserId: auditLog.actorUserId, actorEmail: user.email, action: auditLog.action, meta: auditLog.meta, ip: auditLog.ip }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId))

export async function listAudit(f: AuditFilters & { limit: number; offset: number }) {
  const w = where(f)
  const [rows, [t], actions] = await Promise.all([
    base().where(w).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(f.limit).offset(f.offset),
    db.select({ n: count() }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId)).where(w),
    // facet ignores the action filter itself so the dropdown keeps showing every choice
    db.select({ action: auditLog.action, n: count() }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId)).where(where(f, { skipAction: true })).groupBy(auditLog.action).orderBy(desc(count()), auditLog.action).limit(200),
  ])
  return { rows: rows.map((r) => ({ ...r, actorEmail: r.actorEmail ?? null })), total: t?.n ?? 0, limit: f.limit, offset: f.offset, actions }
}

/** CSV-injection guard: a cell that a spreadsheet would read as a formula gets a leading apostrophe. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function auditCsv(f: AuditFilters): Promise<string> {
  const rows = await base().where(where(f)).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(MAX_CSV_ROWS)
  const lines = [['time', 'actor_id', 'actor_email', 'action', 'details', 'ip'].join(',')]
  for (const r of rows) lines.push([r.createdAt, r.actorUserId, r.actorEmail, r.action, r.meta, r.ip].map(csvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}
