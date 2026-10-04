import { createHmac } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { num, rangeOf, rangeSchema } from './range.ts'

/** Columns are `timestamp` (no tz) written as UTC by drizzle; bind range ends as UTC literals so the server's/driver's local zone never shifts the window. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`

/**
 * Owner analytics over generation_job (what people ask for). PRIVACY: prompts are personal data, so the only
 * prompt text that leaves this module is a 140-char excerpt in `recent`, tagged with the user's country and a salted
 * hash — never an email, name or raw user id. Aggregates (use case, keywords) are computed over a capped recent sample.
 */

export const SAMPLE_CAP = 5000
export const EXCERPT = 140

export const promptsQuery = rangeSchema
export const recentQuery = rangeSchema.extend({ page: z.coerce.number().int().min(1).max(1000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) })
export type PromptsQuery = z.infer<typeof rangeSchema>

// ─── use-case classifier (transparent: keyword lists, highest distinct-keyword hit count wins, no hit ⇒ "other") ─────

export const USE_CASES = ['pitch', 'sales', 'marketing', 'strategy', 'product', 'tech', 'reports', 'education', 'case-studies', 'team'] as const
export type UseCase = (typeof USE_CASES)[number] | 'other'

export const USE_CASE_KEYWORDS: Record<(typeof USE_CASES)[number], string[]> = {
  pitch: ['pitch', 'investor', 'investors', 'startup', 'fundraising', 'fundraise', 'seed', 'series a', 'venture', 'vc', 'traction', 'demo day'],
  sales: ['sales', 'sell', 'proposal', 'client', 'customer pitch', 'prospect', 'pricing', 'quote', 'deal', 'negotiation', 'closing', 'lead'],
  marketing: ['marketing', 'campaign', 'brand', 'branding', 'social media', 'seo', 'advertising', 'ads', 'audience', 'content calendar', 'launch campaign', 'engagement'],
  strategy: ['strategy', 'strategic', 'vision', 'roadmap planning', 'board', 'okr', 'okrs', 'swot', 'business plan', 'competitive', 'market entry', 'operating plan'],
  product: ['product', 'roadmap', 'feature', 'features', 'release', 'launch', 'user research', 'ux', 'prd', 'mvp', 'backlog'],
  tech: ['architecture', 'api', 'software', 'engineering', 'security', 'cloud', 'kubernetes', 'database', 'devops', 'ai', 'machine learning', 'infrastructure', 'microservices', 'cybersecurity'],
  reports: ['report', 'quarterly', 'q1', 'q2', 'q3', 'q4', 'annual', 'results', 'metrics', 'kpi', 'kpis', 'analytics', 'performance review', 'financial', 'revenue', 'forecast'],
  education: ['lesson', 'teach', 'teaching', 'course', 'class', 'students', 'student', 'training', 'workshop', 'lecture', 'learn', 'tutorial', 'curriculum', 'school', 'university', 'education'],
  'case-studies': ['case study', 'case studies', 'consulting', 'consultant', 'client story', 'success story', 'engagement results', 'lessons learned'],
  team: ['team', 'onboarding', 'hr', 'culture', 'employee', 'employees', 'company update', 'all hands', 'all-hands', 'welcome', 'values', 'hiring', 'benefits'],
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MATCHERS = (Object.entries(USE_CASE_KEYWORDS) as [(typeof USE_CASES)[number], string[]][]).map(([id, words]) => ({
  id, res: words.map((w) => new RegExp(`(?:^|[^a-z0-9])${escapeRe(w)}(?![a-z0-9])`)),
}))

export function classifyPrompt(prompt: string): UseCase {
  const text = prompt.toLowerCase()
  let best: UseCase = 'other', bestScore = 0
  for (const m of MATCHERS) {
    const score = m.res.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
    if (score > bestScore) { best = m.id; bestScore = score } // ties: earlier (more specific to the brief) category wins
  }
  return best
}

// ─── keywords ───────────────────────────────────────────────────────────────

const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let like make me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us use using very want was we were what when where which while who whom why will with would you your yours yourself please create presentation presentations slide slides deck ppt powerpoint need needs give build generate write prepare about make made help').split(' '))

export function tokenize(prompt: string): string[] {
  return prompt.toLowerCase().replace(/https?:\/\/\S+/g, ' ').split(/[^a-z0-9'+#-]+/).map((t) => t.replace(/^['-]+|['-]+$/g, '')).filter(Boolean)
}
const keep = (t: string) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)

/** Each term counts once per prompt (so one spammy prompt cannot dominate). Bigrams = adjacent kept tokens. */
export function topPhrases(prompts: string[], limit = 25) {
  const uni = new Map<string, number>(), bi = new Map<string, number>()
  for (const p of prompts) {
    const toks = tokenize(p)
    const u = new Set<string>(), b = new Set<string>()
    toks.forEach((t, i) => {
      if (!keep(t)) return
      u.add(t)
      const nx = toks[i + 1]
      if (nx !== undefined && keep(nx)) b.add(`${t} ${nx}`)
    })
    u.forEach((t) => uni.set(t, (uni.get(t) ?? 0) + 1))
    b.forEach((t) => bi.set(t, (bi.get(t) ?? 0) + 1))
  }
  const top = (m: Map<string, number>, min: number) => [...m].filter(([, n]) => n >= min).sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0])).slice(0, limit).map(([term, count]) => ({ term, count }))
  return { keywords: top(uni, 1), phrases: top(bi, 2) }
}

// ─── queries ────────────────────────────────────────────────────────────────

const whereRange = (q: PromptsQuery): SQL => {
  const { from, to } = rangeOf(q)
  return sql`j.created_at >= ${ts(from)} AND j.created_at < ${ts(to)}`
}

/** Whitelisted grouping expressions over `generation_job j` (never user input). */
const A = (k: string) => sql.raw(`coalesce(nullif(lower(trim(left(j.options->'analysis'->>'${k}', 80))), ''), '(not set)')`)
const DIST = {
  status: sql`j.status`,
  language: sql`coalesce(nullif(j.options->'analysis'->>'language', ''), 'unknown')`,
  tone: A('tone'), audience: A('audience'), topic: A('topic'), objective: A('objective'),
  mode: sql`CASE WHEN jsonb_typeof(j.options->'direction') = 'object' THEN 'broad' ELSE 'specific' END`,
  sources: sql`CASE WHEN jsonb_typeof(j.options->'sourceIds') = 'array' AND jsonb_array_length(j.options->'sourceIds') > 0 THEN 'with sources' ELSE 'no sources' END`,
  model: sql`coalesce(j.options->>'model', '(default)')`,
  theme: sql`coalesce(j.options->>'themeId', 'cobalt')`,
  slideCount: sql`CASE WHEN j.options->>'slideCount' !~ '^[0-9]+$' OR j.options->>'slideCount' IS NULL THEN 'auto'
      WHEN (j.options->>'slideCount')::int <= 5 THEN '3-5' WHEN (j.options->>'slideCount')::int <= 8 THEN '6-8'
      WHEN (j.options->>'slideCount')::int <= 12 THEN '9-12' WHEN (j.options->>'slideCount')::int <= 20 THEN '13-20' ELSE '21+' END`,
} as const
const SLIDE_ORDER = ['3-5', '6-8', '9-12', '13-20', '21+', 'auto']

async function dist(q: PromptsQuery, key: keyof typeof DIST, limit = 10) {
  const r = await db.execute(sql`SELECT ${DIST[key]} AS key, count(*)::int AS n FROM generation_job j WHERE ${whereRange(q)} GROUP BY 1 ORDER BY n DESC, 1 LIMIT ${limit}`)
  return r.rows.map((x) => ({ key: String(x['key']), count: num(x['n']) }))
}

export async function overview(q: PromptsQuery) {
  const { from, to } = rangeOf(q)
  const [tot, status, language, tone, audience, topic, objective, mode, sources, model, theme, slides, funnel] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS jobs, count(DISTINCT j.user_id)::int AS users, count(*) FILTER (WHERE j.status = 'completed')::int AS completed,
        count(*) FILTER (WHERE j.status = 'failed')::int AS failed, count(*) FILTER (WHERE j.status = 'cancelled')::int AS cancelled FROM generation_job j WHERE ${whereRange(q)}`),
    dist(q, 'status'), dist(q, 'language'), dist(q, 'tone'), dist(q, 'audience'), dist(q, 'topic'), dist(q, 'objective'), dist(q, 'mode'), dist(q, 'sources'), dist(q, 'model'), dist(q, 'theme'), dist(q, 'slideCount', 10),
    db.execute(sql`SELECT count(*) FILTER (WHERE request_type = 'prompt_analysis')::int AS analyzed, count(*) FILTER (WHERE request_type = 'prompt_analysis' AND status = 'success')::int AS analyzed_ok
        FROM ai_usage_event WHERE created_at >= ${ts(from)} AND created_at < ${ts(to)}`),
  ])
  const t = tot.rows[0] as Record<string, unknown>, f = funnel.rows[0] as Record<string, unknown>
  const jobs = num(t['jobs']), completed = num(t['completed'])
  const analyzed = num(f['analyzed'])
  const rate = (a: number, b: number) => (b > 0 ? a / b : 0)
  return {
    jobs, users: num(t['users']), completed, failed: num(t['failed']), cancelled: num(t['cancelled']),
    completionRate: rate(completed, jobs),
    funnel: [
      { key: 'analysed', label: 'Prompts analysed', count: analyzed, rateFromPrevious: null as number | null },
      { key: 'created', label: 'Jobs created', count: jobs, rateFromPrevious: analyzed ? rate(jobs, analyzed) : null },
      { key: 'completed', label: 'Jobs completed', count: completed, rateFromPrevious: jobs ? rate(completed, jobs) : null },
    ],
    status, language, tone, audience, topic, objective, mode, sources, model, theme,
    slideCount: [...slides].sort((a, b) => SLIDE_ORDER.indexOf(a.key) - SLIDE_ORDER.indexOf(b.key)),
  }
}

async function sample(q: PromptsQuery) {
  const r = await db.execute(sql`SELECT j.prompt, j.created_at FROM generation_job j WHERE ${whereRange(q)} ORDER BY j.created_at DESC LIMIT ${SAMPLE_CAP}`)
  const total = await db.execute(sql`SELECT count(*)::int AS n FROM generation_job j WHERE ${whereRange(q)}`)
  return { rows: r.rows.map((x) => ({ prompt: String(x['prompt']), at: new Date(x['created_at'] as string) })), total: num((total.rows[0] as Record<string, unknown>)['n']) }
}

export async function useCases(q: PromptsQuery) {
  const s = await sample(q)
  const counts: Record<string, number> = Object.fromEntries([...USE_CASES, 'other'].map((k) => [k, 0]))
  const days = new Map<string, Record<string, number>>()
  for (const r of s.rows) {
    const uc = classifyPrompt(r.prompt)
    counts[uc] = (counts[uc] ?? 0) + 1
    const d = r.at.toISOString().slice(0, 10)
    const row = days.get(d) ?? Object.fromEntries([...USE_CASES, 'other'].map((k) => [k, 0]))
    row[uc] = (row[uc] ?? 0) + 1
    days.set(d, row)
  }
  return {
    sampled: s.rows.length, total: s.total, capped: s.total > s.rows.length,
    useCases: Object.entries(counts).map(([key, count]) => ({ key, count, share: s.rows.length ? count / s.rows.length : 0 })).sort((a, b) => b.count - a.count),
    perDay: [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([t, byUseCase]) => ({ t: `${t}T00:00:00.000Z`, total: Object.values(byUseCase).reduce((a, b) => a + b, 0), byUseCase })),
  }
}

export async function keywords(q: PromptsQuery) {
  const s = await sample(q)
  return { sampled: s.rows.length, total: s.total, capped: s.total > s.rows.length, ...topPhrases(s.rows.map((r) => r.prompt)) }
}

/** Stable pseudonym for correlating a user's prompts without revealing who they are. */
export const userHash = (userId: string) => createHmac('sha256', env.AUTH_SECRET).update(`prompts:${userId}`).digest('hex').slice(0, 10)

export async function recent(q: z.infer<typeof recentQuery>) {
  const { page, pageSize } = q
  const [rows, total] = await Promise.all([
    db.execute(sql`SELECT j.id, j.user_id, j.prompt, j.status, j.created_at, u.country FROM generation_job j LEFT JOIN "user" u ON u.id = j.user_id
        WHERE ${whereRange(q)} ORDER BY j.created_at DESC, j.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db.execute(sql`SELECT count(*)::int AS n FROM generation_job j WHERE ${whereRange(q)}`),
  ])
  return {
    page, pageSize, total: num((total.rows[0] as Record<string, unknown>)['n']),
    rows: rows.rows.map((x) => {
      const p = String(x['prompt']).replace(/\s+/g, ' ').trim()
      return {
        id: String(x['id']), createdAt: new Date(x['created_at'] as string).toISOString(), status: String(x['status']),
        prompt: p.length > EXCERPT ? `${p.slice(0, EXCERPT - 1)}…` : p, truncated: p.length > EXCERPT,
        country: (x['country'] as string | null) ?? null, user: userHash(String(x['user_id'])), useCase: classifyPrompt(p),
      }
    }),
  }
}
