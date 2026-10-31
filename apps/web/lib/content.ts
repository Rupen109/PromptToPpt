import { API_URL, SITE_URL } from './env'

/** Blog, news and guides are written in the owner dashboard and read here from the API (cached for a minute so the site stays fast). */
export type Kind = 'blog' | 'news' | 'guide'
export interface Card {
  id: string; kind: Kind; slug: string; title: string; summary: string; coverUrl: string | null; coverAlt: string | null; tags: string[]; section: string | null; sortOrder: number
  sourceName: string | null; sourceUrl: string | null; trending: boolean; featured: boolean; authorName: string; publishedAt: string | null; updatedAt: string; readingMinutes: number; hasBody: boolean
}
export interface Full extends Card { body: string; seoTitle: string | null; seoDescription: string | null; headings: { level: 2 | 3; text: string; id: string }[]; related: Card[]; prev: Card | null; next: Card | null }
export interface Listing { items: Card[]; total: number; page: number; pages: number }
export interface GuideGroup { name: string; items: Card[] }

export const BASE_PATH: Record<Kind, string> = { blog: '/blog', news: '/news', guide: '/guides' }
export const hrefOf = (c: Pick<Card, 'kind' | 'slug'>) => `${BASE_PATH[c.kind]}/${c.slug}`
/** pictures uploaded in the dashboard live on the API */
export const imageSrc = (path: string | null) => (path ? (path.startsWith('/') ? `${API_URL}${path}` : path) : null)
export const absImage = (path: string | null) => imageSrc(path) ?? undefined
export const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')

export async function fetchContent<T>(path: string, revalidate = 60): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const r = await fetch(`${API_URL}/api/v1/content${path}`, { next: { revalidate, tags: ['content'] } })
    if (!r.ok) return { ok: false, status: r.status }
    return { ok: true, data: (await r.json()).data as T }
  } catch {
    return { ok: false, status: 0 } // the API is unreachable: pages show "back soon" instead of crashing the build
  }
}

export const listPosts = (kind: Kind, { tag, page = 1, pageSize = 12 }: { tag?: string; page?: number; pageSize?: number } = {}) =>
  fetchContent<Listing>(`/posts?kind=${kind}&page=${page}&pageSize=${pageSize}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`)
export const getPost = (kind: Kind, slug: string) => fetchContent<Full>(`/posts/${kind}/${encodeURIComponent(slug)}`)
export const getTags = (kind: Kind) => fetchContent<{ tag: string; count: number }[]>(`/tags?kind=${kind}`)
export const getTrending = () => fetchContent<Card[]>('/news/trending')
export const getGuides = () => fetchContent<GuideGroup[]>('/guides')
export const siteUrl = (path: string) => `${SITE_URL.replace(/\/$/, '')}${path}`
