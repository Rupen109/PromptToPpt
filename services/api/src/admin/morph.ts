import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { num, rangeOf, rangeSchema, type RangeQuery } from './range.ts'

/**
 * Owner analytics over morph_match_log: how Morph decks are matched to topics. PRIVACY: only a 140-character excerpt of the analysed topic leaves this module, with its category and
 * language; never an email, name or user id.
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`
const EXCERPT = 140
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[]

export const unmatchedQuery = rangeSchema.extend({ limit: z.coerce.number().int().min(1).max(100).default(40) })

export async function summary(q: RangeQuery) {
  const { from, to } = rangeOf(q)
  const r = await rows(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE mode = 'template')::int AS template,
           count(*) FILTER (WHERE mode = 'custom')::int AS custom,
           count(*) FILTER (WHERE used_at IS NOT NULL)::int AS started,
           count(*) FILTER (WHERE used_at IS NOT NULL AND mode = 'template' AND used_template = template_id)::int AS followed,
           count(*) FILTER (WHERE used_at IS NOT NULL AND mode = 'template' AND used_template IS NOT NULL AND used_template <> template_id)::int AS switched,
           count(*) FILTER (WHERE used_at IS NOT NULL AND mode = 'template' AND used_template IS NULL)::int AS chose_ai,
           count(*) FILTER (WHERE used_at IS NOT NULL AND mode = 'custom' AND used_template IS NOT NULL)::int AS chose_template_anyway,
           coalesce(avg(confidence) FILTER (WHERE mode = 'template'), 0)::float8 AS avg_confidence
      FROM morph_match_log WHERE created_at >= ${ts(from)} AND created_at < ${ts(to)}`)
  const x = r[0] ?? {}
  const n = (k: string) => num(x[k])
  return { total: n('total'), template: n('template'), custom: n('custom'), started: n('started'), followed: n('followed'), switched: n('switched'), choseAi: n('chose_ai'), choseTemplateAnyway: n('chose_template_anyway'), avgConfidence: n('avg_confidence') }
}

/** For every template: how often it was recommended, and how often a deck was started from it. */
export async function templates(q: RangeQuery) {
  const { from, to } = rangeOf(q)
  const r = (await rows(sql`
    WITH rec AS (SELECT template_id AS id, count(*)::int AS recommended FROM morph_match_log WHERE mode = 'template' AND created_at >= ${ts(from)} AND created_at < ${ts(to)} GROUP BY 1),
         used AS (SELECT used_template AS id, count(*)::int AS used FROM morph_match_log WHERE used_template IS NOT NULL AND created_at >= ${ts(from)} AND created_at < ${ts(to)} GROUP BY 1)
    SELECT coalesce(rec.id, used.id) AS id, coalesce(recommended, 0) AS recommended, coalesce(used, 0) AS used FROM rec FULL JOIN used ON rec.id = used.id ORDER BY 2 DESC, 3 DESC`))
  return r.map((x) => ({ id: String(x['id']), recommended: num(x['recommended']), used: num(x['used']) }))
}

/** Topics that got a custom deck (no designed template fit): the list of what to build next. */
export async function unmatched(q: z.infer<typeof unmatchedQuery>) {
  const { from, to } = rangeOf(q)
  const byCategory = (await rows(sql`SELECT coalesce(category, 'unknown') AS category, count(*)::int AS n FROM morph_match_log WHERE mode = 'custom' AND created_at >= ${ts(from)} AND created_at < ${ts(to)} GROUP BY 1 ORDER BY 2 DESC`))
  const recent = (await rows(sql`SELECT left(topic, ${EXCERPT}) AS topic, category, language, left(reason, 200) AS reason, created_at FROM morph_match_log WHERE mode = 'custom' AND created_at >= ${ts(from)} AND created_at < ${ts(to)} ORDER BY created_at DESC LIMIT ${q.limit}`))
  return {
    byCategory: byCategory.map((x) => ({ category: String(x['category']), n: num(x['n']) })),
    recent: recent.map((x) => ({ topic: String(x['topic']), category: x['category'] ? String(x['category']) : null, language: String(x['language']), reason: String(x['reason']), createdAt: new Date(String(x['created_at']).replace(' ', 'T') + (String(x['created_at']).endsWith('Z') ? '' : 'Z')).toISOString() })),
  }
}
