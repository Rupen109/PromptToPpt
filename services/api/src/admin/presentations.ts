import { sql } from 'drizzle-orm'
import { CATEGORIES, DESIGNS } from '@prompttoppt/theme'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { bucketOf, num, rangeOf, rangeSchema } from './range.ts'
import { limitSchema, pageSchema } from './images.ts'

/**
 * Owner "Presentations" section. Deck content (slide count, theme, template) comes from the LATEST presentation_version of each
 * deck only (one indexed join on presentation_id + latest_version). Content stats cover LIVE (not deleted) decks created in range.
 * Creation source is derived, there is no stored column: a generation_job for the deck => "ai", else a theme.templateId => "template", else "blank".
 */

export const seriesSchema = rangeSchema.extend({ bucket: bucketOf })
export { limitSchema, pageSchema }

const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[]
const BUCKETS = { hour: sql`'hour'`, day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
/** p = presentation, v = its latest version. */
const LATEST = sql`presentation p JOIN presentation_version v ON v.presentation_id = p.id AND v.version = p.latest_version`
const inRange = (r: { from: Date; to: Date }) => sql`p.created_at >= ${r.from} AND p.created_at < ${r.to}`
const SLIDES = sql`(CASE WHEN jsonb_typeof(v.document->'slides') = 'array' THEN jsonb_array_length(v.document->'slides') ELSE 0 END)`
const SOURCE = sql`(CASE WHEN EXISTS (SELECT 1 FROM generation_job j WHERE j.presentation_id = p.id) THEN 'ai' WHEN coalesce(v.document->'theme'->>'templateId', '') <> '' THEN 'template' ELSE 'blank' END)`
const div = (a: number, b: number) => (b > 0 ? a / b : 0)

const designById = new Map(DESIGNS.map((d) => [d.id, d]))
const categoryName = new Map(CATEGORIES.map((c) => [c.id, c.name]))

export async function summary(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const [t] = await rows(sql`
    SELECT count(*) FILTER (WHERE p.deleted_at IS NULL)::int AS live, count(*) FILTER (WHERE p.deleted_at IS NOT NULL)::int AS deleted,
           count(DISTINCT p.user_id)::int AS creators
    FROM presentation p WHERE ${inRange(r)}`)
  const [all] = await rows(sql`SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS live, count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted FROM presentation`)
  const [c] = await rows(sql`
    SELECT coalesce(avg(${SLIDES}),0)::float8 AS avg_slides, coalesce(avg(p.revision),0)::float8 AS avg_revision,
           count(*) FILTER (WHERE p.revision > 1)::int AS edited, count(*)::int AS n
    FROM ${LATEST} WHERE p.deleted_at IS NULL AND ${inRange(r)}`)
  const [vs] = await rows(sql`SELECT count(*)::int AS n FROM presentation_version WHERE created_at >= ${r.from} AND created_at < ${r.to}`)
  const n = num(c?.['n'])
  return {
    created: num(t?.['live']) + num(t?.['deleted']), live: num(t?.['live']), deleted: num(t?.['deleted']), creators: num(t?.['creators']),
    allTimeLive: num(all?.['live']), allTimeDeleted: num(all?.['deleted']),
    avgSlides: num(c?.['avg_slides']), avgRevision: num(c?.['avg_revision']), editedDecks: num(c?.['edited']), editedShare: div(num(c?.['edited']), n), versionsSaved: num(vs?.['n']),
  }
}

export async function timeseries(q: z.infer<typeof seriesSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`SELECT date_trunc(${BUCKETS[q.bucket]}, p.created_at) AS t, count(*)::int AS n FROM presentation p WHERE ${inRange(r)} GROUP BY 1 ORDER BY 1`)
  return out.map((x) => ({ t: new Date(x['t'] as string).toISOString(), decks: num(x['n']) }))
}

const bucketed = (out: Record<string, unknown>[]) => out.map((x) => ({ key: String(x['key']), decks: num(x['n']) }))

/** One call for all the small breakdowns of live decks created in range. */
export async function composition(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const base = sql`FROM ${LATEST} WHERE p.deleted_at IS NULL AND ${inRange(r)}`
  const [aspect, source, fonts, revisions, versionsBy, perUser] = await Promise.all([
    rows(sql`SELECT p.aspect_ratio AS key, count(*)::int AS n ${base} GROUP BY 1 ORDER BY n DESC, key`),
    rows(sql`SELECT ${SOURCE} AS key, count(*)::int AS n ${base} GROUP BY 1 ORDER BY n DESC, key`),
    rows(sql`SELECT coalesce(nullif(v.document->'theme'->'fonts'->>'heading', ''), 'unknown') AS key, count(*)::int AS n ${base} GROUP BY 1 ORDER BY n DESC, key LIMIT 10`),
    rows(sql`SELECT CASE WHEN p.revision <= 1 THEN '1 (never edited)' WHEN p.revision <= 5 THEN '2-5' WHEN p.revision <= 20 THEN '6-20' ELSE '21+' END AS key, min(p.revision) AS lo, count(*)::int AS n ${base} GROUP BY 1 ORDER BY lo`),
    rows(sql`SELECT v.created_by AS key, count(*)::int AS n FROM presentation_version v WHERE v.created_at >= ${r.from} AND v.created_at < ${r.to} GROUP BY 1 ORDER BY n DESC, key`),
    rows(sql`
      SELECT CASE WHEN n = 0 THEN '0' WHEN n = 1 THEN '1' WHEN n <= 5 THEN '2-5' WHEN n <= 20 THEN '6-20' ELSE '21+' END AS key, min(n) AS lo, count(*)::int AS n
      FROM (SELECT u.id, count(p.id) AS n FROM "user" u LEFT JOIN presentation p ON p.user_id = u.id AND p.deleted_at IS NULL AND ${inRange(r)} GROUP BY u.id) d
      GROUP BY 1 ORDER BY lo`),
  ])
  return { aspectRatio: bucketed(aspect), source: bucketed(source), headingFonts: bucketed(fonts), revisions: bucketed(revisions), versionsBySource: bucketed(versionsBy), decksPerUser: bucketed(perUser) }
}

export async function templates(q: z.infer<typeof rangeSchema>, limit: number) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT v.document->'theme'->>'templateId' AS id, count(*)::int AS n
    FROM ${LATEST} WHERE p.deleted_at IS NULL AND ${inRange(r)} AND coalesce(v.document->'theme'->>'templateId', '') <> ''
    GROUP BY 1 ORDER BY n DESC, id`)
  const all = out.map((x) => {
    const id = String(x['id']), d = designById.get(id)
    return { id, name: d?.name ?? id, category: d?.category ?? 'unknown', categoryName: d ? (categoryName.get(d.category) ?? d.category) : 'Unknown / retired', decks: num(x['n']) }
  })
  const cats = new Map<string, { category: string; name: string; decks: number }>()
  for (const t of all) {
    const e = cats.get(t.category) ?? { category: t.category, name: t.categoryName, decks: 0 }
    e.decks += t.decks
    cats.set(t.category, e)
  }
  return { total: all.reduce((a, t) => a + t.decks, 0), top: all.slice(0, limit), categories: [...cats.values()].sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name)) }
}

export async function topUsers(q: z.infer<typeof rangeSchema>, limit: number) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT p.user_id AS id, max(u.email) AS email, count(*)::int AS decks, coalesce(sum(p.revision),0)::int AS revisions, max(p.updated_at) AS last_at
    FROM presentation p LEFT JOIN "user" u ON u.id = p.user_id
    WHERE p.deleted_at IS NULL AND ${inRange(r)} GROUP BY p.user_id ORDER BY decks DESC, revisions DESC, p.user_id LIMIT ${limit}`)
  return out.map((x) => ({ userId: String(x['id']), email: (x['email'] as string | null) ?? null, decks: num(x['decks']), revisions: num(x['revisions']), lastActiveAt: new Date(x['last_at'] as string).toISOString() }))
}

export async function recent(q: z.infer<typeof rangeSchema> & z.infer<typeof pageSchema>) {
  const r = rangeOf(q)
  const [c] = await rows(sql`SELECT count(*)::int AS n FROM presentation p WHERE p.deleted_at IS NULL AND ${inRange(r)}`)
  const out = await rows(sql`
    SELECT p.id, p.title, u.email, ${SLIDES} AS slides, ${SOURCE} AS source, p.created_at, p.updated_at
    FROM ${LATEST} LEFT JOIN "user" u ON u.id = p.user_id
    WHERE p.deleted_at IS NULL AND ${inRange(r)} ORDER BY p.created_at DESC, p.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`)
  return {
    total: num(c?.['n']), page: q.page, pageSize: q.pageSize,
    rows: out.map((x) => ({ id: String(x['id']), title: String(x['title']), email: (x['email'] as string | null) ?? null, slides: num(x['slides']), source: String(x['source']), createdAt: new Date(x['created_at'] as string).toISOString(), updatedAt: new Date(x['updated_at'] as string).toISOString() })),
  }
}
