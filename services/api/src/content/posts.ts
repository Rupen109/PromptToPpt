import { z } from 'zod'

/** Blog articles, short tech news and "how to use" guides: one content model, three kinds with different fields. */
export const KINDS = ['blog', 'news', 'guide'] as const
export type Kind = (typeof KINDS)[number]

export const SUMMARY_MAX: Record<Kind, number> = { blog: 320, news: 500, guide: 240 }
export const BODY_MAX: Record<Kind, number> = { blog: 120_000, news: 20_000, guide: 120_000 }
export const IMAGE_PATH = /^\/api\/v1\/content\/images\/post-[A-Za-z0-9_-]{16,40}\.(?:png|jpg|webp)$/

export function slugify(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
}
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** addresses that would clash with fixed pages under /blog, /news and /guides */
export const RESERVED_SLUGS = new Set(['rss', 'rss-xml', 'tag', 'page', 'new', 'feed', 'trending'])

export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200))

export function cleanTags(tags: string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const s = t.trim().toLowerCase().replace(/\s+/g, ' ')
    if (s.length >= 2 && !out.includes(s)) out.push(s)
  }
  return out.slice(0, 8)
}

/** the headings of a Markdown body (## and ###), for a guide's "On this page" list; code fences are skipped */
export function headings(body: string): { level: 2 | 3; text: string; id: string }[] {
  const out: { level: 2 | 3; text: string; id: string }[] = []
  let fence = false
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) { const text = m[2]!.replace(/[*_`[\]]/g, '').replace(/\(([^)]*)\)/g, ''); out.push({ level: m[1]!.length as 2 | 3, text, id: slugify(text) }) }
  }
  return out
}

const httpUrl = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Use a link that starts with http:// or https://')
const imagePath = z.string().trim().max(200).refine((u) => IMAGE_PATH.test(u), 'Upload the picture with the Upload button')

export const postFields = z.object({
  title: z.string().trim().min(3, 'Give it a title (at least 3 characters)').max(160),
  slug: z.string().trim().toLowerCase().max(80).refine((s) => SLUG.test(s), 'The address can only have lowercase letters, numbers and dashes').refine((s) => !RESERVED_SLUGS.has(s), 'That address is reserved. Choose another').optional(),
  summary: z.string().trim().max(500).default(''),
  body: z.string().max(120_000).default(''),
  coverUrl: imagePath.nullish(),
  coverAlt: z.string().trim().max(160).nullish(),
  tags: z.array(z.string().trim().max(30)).max(12).default([]),
  section: z.string().trim().max(60).nullish(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  sourceName: z.string().trim().max(80).nullish(),
  sourceUrl: httpUrl.nullish().or(z.literal('').transform(() => null)),
  trending: z.boolean().default(false),
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(70).nullish(),
  seoDescription: z.string().trim().max(170).nullish(),
  authorName: z.string().trim().min(1).max(60).default('SlidesDone team'),
})
export const createPost = postFields.extend({ kind: z.enum(KINDS) })
export const updatePost = postFields.partial()

export type PostRow = {
  id: string; kind: string; slug: string; title: string; summary: string; body: string; coverUrl: string | null; coverAlt: string | null; tags: string[]
  section: string | null; sortOrder: number; sourceName: string | null; sourceUrl: string | null; trending: boolean; featured: boolean
  seoTitle: string | null; seoDescription: string | null; authorName: string; status: string; publishedAt: Date | null; readingMinutes: number; createdAt: Date; updatedAt: Date
}

/** a problem that stops a post from going live, in words for the author; null = ready */
export function publishProblem(p: Pick<PostRow, 'kind' | 'title' | 'summary' | 'body' | 'sourceUrl' | 'section'>): string | null {
  const kind = p.kind as Kind
  if (!p.title.trim()) return 'Add a title before publishing.'
  if (!p.summary.trim()) return kind === 'news' ? 'Write the short news text (the summary) before publishing.' : 'Write a short summary before publishing. It is shown in lists and on Google.'
  if (p.summary.length > SUMMARY_MAX[kind]) return `The summary is too long for ${kind === 'news' ? 'a news item' : kind === 'guide' ? 'a guide' : 'a blog post'}: at most ${SUMMARY_MAX[kind]} characters.`
  if (kind !== 'news' && p.body.trim().length < 20) return 'Write the article before publishing.'
  if (kind === 'guide' && !p.section?.trim()) return 'Choose the section this guide belongs to, for example "Getting started".'
  return null
}

export type PostState = 'draft' | 'scheduled' | 'published'
export const stateOf = (p: Pick<PostRow, 'status' | 'publishedAt'>, now = new Date()): PostState => (p.status !== 'published' ? 'draft' : p.publishedAt && p.publishedAt > now ? 'scheduled' : 'published')

const card = (p: PostRow) => ({
  id: p.id, kind: p.kind, slug: p.slug, title: p.title, summary: p.summary, coverUrl: p.coverUrl, coverAlt: p.coverAlt, tags: p.tags, section: p.section, sortOrder: p.sortOrder,
  sourceName: p.sourceName, sourceUrl: p.sourceUrl, trending: p.trending, featured: p.featured, authorName: p.authorName, publishedAt: p.publishedAt?.toISOString() ?? null, updatedAt: p.updatedAt.toISOString(), readingMinutes: p.readingMinutes,
  hasBody: p.body.trim().length > 0,
})
export const publicCard = card
export const publicFull = (p: PostRow) => ({ ...card(p), body: p.body, seoTitle: p.seoTitle, seoDescription: p.seoDescription, headings: p.kind === 'guide' || p.kind === 'blog' ? headings(p.body) : [] })
export const adminRow = (p: PostRow) => ({ ...publicFull(p), status: p.status, state: stateOf(p), createdAt: p.createdAt.toISOString() })
